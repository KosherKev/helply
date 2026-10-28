"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { boot, makeCls, logRow } = require("./_helpers");
const { verify } = require("../src/identity/token");

const fill = (path) => path.replace(/:\w+/g, "x");
const PUBLIC = new Set(["GET /health", "GET /v1/config", "POST /v1/demo/token", "POST /v1/support/message", "POST /v1/support/voice", "GET /v1/support/conversations/:id/messages", "POST /v1/auth/register", "POST /v1/auth/login", "POST /v1/auth/accept-invite"]);

test("every non-public route rejects a request with no credential (401), outside demo mode", async () => {
  const s = await boot();
  try {
    const protectedRoutes = s.app.locals.routes.filter((r) => !PUBLIC.has(`${r.method} ${r.path}`));
    assert.ok(protectedRoutes.length >= 40, "route registry should list the whole API");
    for (const r of protectedRoutes) {
      assert.ok(r.rule, `${r.method} ${r.path} has no guard`);
      const res = await s.call(fill(r.path), { method: r.method, body: ["POST", "PUT", "PATCH"].includes(r.method) ? {} : undefined });
      assert.equal(res.status, 401, `${r.method} ${r.path} -> ${res.status}`);
    }
  } finally { await s.close(); }
});

test("an agent is refused (403) on every admin/owner route; a garbage bearer is 401", async () => {
  const s = await boot();
  try {
    const owner = await s.register();
    const agent = await s.addMember(owner, "agent");
    const elevated = s.app.locals.routes.filter((r) => r.rule && ["admin", "owner"].includes(r.rule.role));
    assert.ok(elevated.length >= 25);
    for (const r of elevated) {
      const res = await s.call(fill(r.path), { method: r.method, token: agent.token, body: ["POST", "PUT", "PATCH"].includes(r.method) ? {} : undefined });
      assert.equal(res.status, 403, `${r.method} ${r.path} -> ${res.status}`);
    }
    assert.equal((await s.call("/v1/tickets", { token: "hs_garbage" })).status, 401);
    assert.equal((await s.call("/v1/tickets", { token: "hk_live_garbage" })).status, 401);
  } finally { await s.close(); }
});

test("an API key can only reach routes whose scope it holds", async () => {
  const s = await boot();
  try {
    const owner = await s.register();
    const key = (await s.call("/v1/api-keys", { method: "POST", token: owner.token, body: { name: "ro", scopes: ["tickets:read"] } })).data;
    assert.ok(key.key.startsWith("hk_live_"));
    assert.equal((await s.call("/v1/tickets", { token: key.key })).status, 200);
    const scoped = s.app.locals.routes.filter((r) => r.rule && r.rule.role !== "relay"); // relay routes take hr_ keys only (see relay.test.js)
    for (const r of scoped) {
      const allowed = r.rule.scope === "tickets:read";
      const res = await s.call(fill(r.path), { method: r.method, token: key.key, body: ["POST", "PUT", "PATCH"].includes(r.method) ? {} : undefined });
      if (!allowed) assert.equal(res.status, 403, `${r.method} ${r.path} -> ${res.status}`);
    }
    // list shows prefix, never the key; revoke works
    const list = (await s.call("/v1/api-keys", { token: owner.token })).data.data;
    assert.equal(list[0].prefix, key.key.slice(0, 12));
    assert.ok(!JSON.stringify(list).includes(key.key));
    assert.equal((await s.call(`/v1/api-keys/${key.id}`, { method: "DELETE", token: owner.token })).status, 204);
    assert.equal((await s.call("/v1/tickets", { token: key.key })).status, 401);
    assert.equal((await s.call("/v1/api-keys", { method: "POST", token: owner.token, body: { name: "x", scopes: ["root"] } })).status, 400);
  } finally { await s.close(); }
});

test("identity tokens: minted with an API key, signed with the workspace's own secret, tenant = workspace", async () => {
  const s = await boot();
  try {
    const a = await s.register("Alpha");
    const b = await s.register("Beta");
    const keyA = (await s.call("/v1/api-keys", { method: "POST", token: a.token, body: { name: "mint", scopes: ["identity:mint"] } })).data.key;
    const r = await s.call("/v1/identity/tokens", { method: "POST", token: keyA, body: { userId: "usr_1", name: "Ama" } });
    assert.equal(r.status, 200);
    const secretA = s.ctx.identitySecret(s.repo.getWorkspace(a.ws));
    const secretB = s.ctx.identitySecret(s.repo.getWorkspace(b.ws));
    assert.notEqual(secretA, secretB);
    const ok = verify(r.data.token, secretA);
    assert.equal(ok.ok, true);
    assert.equal(ok.claims.tenant, a.ws);
    assert.equal(verify(r.data.token, secretB).ok, false, "workspace B's secret must not verify A's token");
    assert.equal((await s.call("/v1/identity/tokens", { method: "POST", token: keyA, body: {} })).status, 400);
    // an agent session cannot mint
    const agent = await s.addMember(a, "agent");
    assert.equal((await s.call("/v1/identity/tokens", { method: "POST", token: agent.token, body: { userId: "u" } })).status, 403);
  } finally { await s.close(); }
});

test("log-source key is encrypted at rest and masked on read; unsafe URLs are refused when private sources are not allowed", async () => {
  const cls = makeCls([logRow("u1")]);
  const s = await boot({ overrides: { fetchImpl: cls.fetchImpl } });
  try {
    const o = await s.register();
    const put = await s.call("/v1/log-source", { method: "PUT", token: o.token, body: { baseUrl: "http://logs.internal:8080", apiKey: "cls_super_secret_key_1234", service: "demo-shop-api" } });
    assert.equal(put.status, 200);
    assert.equal(put.data.apiKeyMasked.endsWith("1234"), true);
    assert.ok(!JSON.stringify(put.data).includes("super_secret"));
    const raw = s.repo.db.prepare("SELECT api_key_enc FROM log_sources").get().api_key_enc;
    assert.ok(!raw.includes("super_secret"));
    assert.ok(raw.startsWith("v1."));
  } finally { await s.close(); }

  const strict = await boot({ env: { ALLOW_PRIVATE_LOG_SOURCES: "false" } });
  try {
    const o = await strict.register();
    for (const baseUrl of ["http://logs.example.com", "https://127.0.0.1", "https://169.254.169.254/latest", "https://localhost:8080", "file:///etc/passwd"]) {
      const r = await strict.call("/v1/log-source", { method: "PUT", token: o.token, body: { baseUrl, apiKey: "k", service: "s" } });
      assert.equal(r.status, 400, baseUrl);
    }
  } finally { await strict.close(); }
});

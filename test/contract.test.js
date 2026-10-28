"use strict";
/** docs/openapi.yaml is the spec of record. These tests fail when code and spec diverge. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { boot, makeLlm, makeLanguage, makeCls, logRow } = require("./_helpers");
const { build } = require("../scripts/build-openapi");

const spec = YAML.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "openapi.yaml"), "utf8"));
const METHODS = ["get", "post", "put", "patch", "delete"];
const specOps = [];
for (const [p, item] of Object.entries(spec.paths)) for (const m of METHODS) if (item[m]) specOps.push({ method: m.toUpperCase(), path: p, op: item[m] });
const toSpecPath = (p) => p.replace(/:(\w+)/g, "{$1}");

test("docs/openapi.yaml is the committed output of scripts/build-openapi.js", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(build())), spec, "run `node scripts/build-openapi.js` and commit the result");
  assert.equal(spec.openapi, "3.1.0");
});

test("every route in code is in the spec, and every non-PLANNED operation in the spec is routed", async () => {
  const s = await boot();
  try {
    const code = new Set(s.app.locals.routes.map((r) => `${r.method} ${toSpecPath(r.path)}`));
    const documented = new Set(specOps.filter((o) => !o.op["x-planned"]).map((o) => `${o.method} ${o.path}`));
    assert.deepEqual([...code].filter((r) => !documented.has(r)).sort(), [], "routes missing from docs/openapi.yaml");
    assert.deepEqual([...documented].filter((r) => !code.has(r)).sort(), [], "documented operations that are not routed (mark them x-planned)");
    const planned = specOps.filter((o) => o.op["x-planned"]);
    assert.ok(planned.length >= 1);
    for (const o of planned) assert.ok(!code.has(`${o.method} ${o.path}`), `${o.method} ${o.path} is built: remove x-planned`);
  } finally { await s.close(); }
});

test("the spec's access rules match the guards in code (role, scope, legacy-open)", async () => {
  const s = await boot();
  try {
    for (const r of s.app.locals.routes) {
      const o = specOps.find((x) => x.method === r.method && x.path === toSpecPath(r.path));
      if (!r.rule) {
        assert.deepEqual(o.op.security, [], `${r.method} ${r.path} is unguarded in code, so the spec must say public`);
        continue;
      }
      assert.equal(o.op["x-min-role"], r.rule.role, `${r.method} ${r.path} role`);
      assert.equal(o.op["x-scope"] || null, r.rule.scope || null, `${r.method} ${r.path} scope`);
      assert.equal(Boolean(o.op["x-legacy-open"]), Boolean(r.rule.legacyOpen), `${r.method} ${r.path} legacy`);
    }
  } finally { await s.close(); }
});

const { createChecker } = require("./_schema");
const { check } = createChecker(spec);
const responseSchema = (method, specPath, status) => spec.paths[specPath][method.toLowerCase()].responses[String(status)]?.content?.["application/json"]?.schema;

test("the checker itself catches missing fields and wrong types", () => {
  assert.ok(check(spec.components.schemas.Ticket, { id: "T-1" }).length > 3);
  assert.ok(check({ $ref: "#/components/schemas/Message" }, { id: 1 }).some((e) => e.includes("expected string")));
  assert.deepEqual(check({ type: ["string", "null"] }, null), []);
});

test("real responses from the running API match the schemas in the spec", async () => {
  const cls = makeCls([logRow("usr_ama", { service: "svc" })]);
  const understand = (t) => (t.includes("momo") ? { language: "tw", english: t, intent: "account_issue", hints: { keywords: ["momo"] } } : { language: "en", english: t, intent: "general_question", hints: {} });
  const explain = () => ({ found: true, customer_reply: "It timed out.", root_cause: "Gateway timeout.", cited_lines: ["L1"], confidence: 0.9, suggested_fix: "Retry.", needs_human: false });
  const s = await boot({ overrides: { fetchImpl: cls.fetchImpl, llm: makeLlm({ understand, explain, kb: "Delivery takes 2 days." }), language: makeLanguage() } });
  const failures = [];
  const expectShape = (method, specPath, res, status = 200) => {
    assert.equal(res.status, status, `${method} ${specPath} -> ${res.status} ${JSON.stringify(res.data)}`);
    const schema = responseSchema(method, specPath, status);
    if (schema && res.data !== null) failures.push(...check(schema, res.data, `${method} ${specPath}`));
  };
  try {
    const cfg = await s.call("/v1/config");
    expectShape("GET", "/v1/config", cfg);
    const o = await s.register("Alpha");
    expectShape("POST", "/v1/auth/login", await s.call("/v1/auth/login", { method: "POST", body: { email: o.email, password: "correct-horse-battery" } }));
    expectShape("GET", "/v1/auth/me", await s.call("/v1/auth/me", { token: o.token }));
    expectShape("GET", "/v1/workspace", await s.call("/v1/workspace", { token: o.token }));
    expectShape("PATCH", "/v1/workspace", await s.call("/v1/workspace", { method: "PATCH", token: o.token, body: { settings: { retentionDays: 14 } } }));
    expectShape("PUT", "/v1/log-source", await s.call("/v1/log-source", { method: "PUT", token: o.token, body: { baseUrl: "http://logs.test", apiKey: "k", service: "svc" } }));
    expectShape("GET", "/v1/log-source", await s.call("/v1/log-source", { token: o.token }));
    expectShape("POST", "/v1/log-source/test", await s.call("/v1/log-source/test", { method: "POST", token: o.token }));
    expectShape("GET", "/v1/identity", await s.call("/v1/identity", { token: o.token }));
    const key = await s.call("/v1/api-keys", { method: "POST", token: o.token, body: { name: "k", scopes: ["identity:mint", "tickets:read"] } });
    expectShape("POST", "/v1/api-keys", key, 201);
    expectShape("GET", "/v1/api-keys", await s.call("/v1/api-keys", { token: o.token }));
    const tok = await s.call("/v1/identity/tokens", { method: "POST", token: key.data.key, body: { userId: "usr_ama", name: "Ama" } });
    expectShape("POST", "/v1/identity/tokens", tok);
    expectShape("POST", "/v1/knowledge", await s.call("/v1/knowledge", { method: "POST", token: o.token, body: { title: "Delivery", text: "Delivery takes two working days in Accra." } }), 201);
    expectShape("GET", "/v1/knowledge", await s.call("/v1/knowledge", { token: o.token }));

    const anon = await s.call("/v1/support/message", { method: "POST", body: { message: "how long is delivery", publicKey: o.workspace.publicKey } });
    expectShape("POST", "/v1/support/message", anon);
    const msg = await s.call("/v1/support/message", { method: "POST", body: { message: "[tw] my momo payment failed", token: tok.data.token } });
    expectShape("POST", "/v1/support/message", msg);
    assert.equal(msg.data.verified, true);
    expectShape("GET", "/v1/support/conversations/{id}/messages", await s.call(`/v1/support/conversations/${msg.data.conversationId}/messages`, { headers: { Authorization: `Bearer ${tok.data.token}` } }));

    expectShape("GET", "/v1/conversations", await s.call("/v1/conversations", { token: o.token }));
    expectShape("GET", "/v1/conversations/{id}", await s.call(`/v1/conversations/${msg.data.conversationId}`, { token: o.token }));
    expectShape("POST", "/v1/conversations/{id}/translate-preview", await s.call(`/v1/conversations/${msg.data.conversationId}/translate-preview`, { method: "POST", token: o.token, body: { text: "Please retry." } }));
    expectShape("POST", "/v1/conversations/{id}/takeover", await s.call(`/v1/conversations/${msg.data.conversationId}/takeover`, { method: "POST", token: o.token }));
    expectShape("POST", "/v1/conversations/{id}/messages", await s.call(`/v1/conversations/${msg.data.conversationId}/messages`, { method: "POST", token: o.token, body: { text: "Please retry." } }), 201);
    expectShape("POST", "/v1/conversations/{id}/resolve", await s.call(`/v1/conversations/${msg.data.conversationId}/resolve`, { method: "POST", token: o.token }));
    expectShape("GET", "/v1/replies/pending", await s.call("/v1/replies/pending", { token: o.token }));

    expectShape("GET", "/v1/tickets", await s.call("/v1/tickets", { token: o.token }));
    expectShape("GET", "/v1/tickets/{id}", await s.call(`/v1/tickets/${msg.data.ticketId}`, { token: o.token }));
    expectShape("PATCH", "/v1/tickets/{id}", await s.call(`/v1/tickets/${msg.data.ticketId}`, { method: "PATCH", token: o.token, body: { priority: "high" } }));
    expectShape("POST", "/v1/tickets/{id}/notes", await s.call(`/v1/tickets/${msg.data.ticketId}/notes`, { method: "POST", token: o.token, body: { text: "looking" } }), 201);
    expectShape("GET", "/v1/tickets/{id}/export", await s.call(`/v1/tickets/${msg.data.ticketId}/export`, { token: o.token }));
    expectShape("GET", "/v1/analytics/summary", await s.call("/v1/analytics/summary", { token: o.token }));
    expectShape("GET", "/v1/analytics/timeseries", await s.call("/v1/analytics/timeseries", { token: o.token }));
    expectShape("GET", "/v1/audit", await s.call("/v1/audit", { token: o.token }));
    expectShape("GET", "/v1/team", await s.call("/v1/team", { token: o.token }));
    expectShape("POST", "/v1/team/invitations", await s.call("/v1/team/invitations", { method: "POST", token: o.token, body: { email: "x@acme.test", role: "agent" } }), 201);
    const hook = await s.call("/v1/webhooks", { method: "POST", token: o.token, body: { url: "https://hooks.example.com/x", events: ["ticket.created"] } });
    expectShape("POST", "/v1/webhooks", hook, 201);
    expectShape("GET", "/v1/webhooks", await s.call("/v1/webhooks", { token: o.token }));
    expectShape("GET", "/v1/webhooks/{id}/deliveries", await s.call(`/v1/webhooks/${hook.data.id}/deliveries`, { token: o.token }));
    assert.deepEqual(failures, []);
  } finally { await s.close(); }
});

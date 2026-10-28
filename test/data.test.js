"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { boot, makeCls, logRow } = require("./_helpers");
const { openDb } = require("../src/db/db");

test("schema: every tenant table carries workspace_id; audit events are immutable", () => {
  const db = openDb(":memory:");
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
  const global = new Set(["schema_migrations", "users", "workspaces"]); // users are people; memberships tie them to workspaces
  for (const t of tables.filter((n) => !global.has(n))) {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    assert.ok(cols.includes("workspace_id"), `${t} must have workspace_id`);
  }
  db.prepare("INSERT INTO workspaces (id, name, slug, public_key, settings_json, created_at) VALUES ('w','W','w','pk','{}','t')").run();
  db.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, action, created_at) VALUES ('e','w','system','x','t')").run();
  assert.throws(() => db.prepare("UPDATE audit_events SET action = 'y'").run(), /immutable/);
  assert.throws(() => db.prepare("DELETE FROM audit_events").run(), /immutable/);
});

test("migrations are idempotent on a file database", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helply-"));
  const file = path.join(dir, "h.db");
  try {
    openDb(file).close();
    const again = openDb(file);
    assert.equal(again.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n, 1);
    again.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("tickets: pagination, filters, assignee, notes, GitHub export, audit trail", async () => {
  const s = await boot();
  try {
    const o = await s.register();
    const agent = await s.addMember(o, "agent");
    for (let i = 1; i <= 7; i += 1) {
      s.repo.createTicket(o.ws, {
        title: `Ticket ${i}`, userId: i % 2 ? "usr_a" : "usr_b", language: i === 7 ? "tw" : "en", customerMessage: `message ${i} email ama@example.com`, status: i === 3 ? "needs_human" : "open",
        rootCause: i === 1 ? { summary: "Webhook failed", suggestedFix: "Fix the handler", citedLines: ["L1"], confidence: 0.8 } : null,
        evidence: i === 1 ? [{ id: "L1", time: "2026-10-28T10:00:00Z", level: "error", method: "POST", path: "/api/pay", status: 500, error: { message: "boom", code: "E1" } }] : [],
      });
    }
    const p1 = (await s.call("/v1/tickets?limit=3", { token: o.token })).data;
    assert.deepEqual(p1.data.map((t) => t.id), ["T-0007", "T-0006", "T-0005"]);
    const p2 = (await s.call(`/v1/tickets?limit=3&cursor=${p1.nextCursor}`, { token: o.token })).data;
    assert.deepEqual(p2.data.map((t) => t.id), ["T-0004", "T-0003", "T-0002"]);
    const p3 = (await s.call(`/v1/tickets?limit=3&cursor=${p2.nextCursor}`, { token: o.token })).data;
    assert.deepEqual(p3.data.map((t) => t.id), ["T-0001"]);
    assert.equal(p3.nextCursor, null);
    assert.equal((await s.call("/v1/tickets?status=needs_human", { token: o.token })).data.tickets.length, 1, "`tickets` alias kept for v1.0 clients");
    assert.equal((await s.call("/v1/tickets?language=tw", { token: o.token })).data.data.length, 1);
    assert.equal((await s.call("/v1/tickets?q=ticket%205", { token: o.token })).data.data.length, 1);
    assert.equal((await s.call("/v1/tickets?status=nope", { token: o.token })).status, 400);

    const upd = await s.call("/v1/tickets/T-0001", { method: "PATCH", token: o.token, body: { status: "resolved", priority: "high", assigneeId: agent.user.id } });
    assert.equal(upd.data.assigneeId, agent.user.id);
    assert.equal((await s.call("/v1/tickets?assigneeId=" + agent.user.id, { token: o.token })).data.data.length, 1);
    assert.equal((await s.call("/v1/tickets/T-0001", { method: "PATCH", token: o.token, body: { status: "bogus" } })).status, 400);
    assert.equal((await s.call("/v1/tickets/T-0001", { method: "PATCH", token: agent.token, body: { priority: "low" } })).status, 200, "agents may update tickets");

    const note = await s.call("/v1/tickets/T-0001/notes", { method: "POST", token: agent.token, body: { text: "Asked the PSP for logs" } });
    assert.equal(note.status, 201);
    assert.equal((await s.call("/v1/tickets/T-0001/notes", { method: "POST", token: agent.token, body: { text: " " } })).status, 400);
    const detail = (await s.call("/v1/tickets/T-0001", { token: o.token })).data;
    assert.equal(detail.notes[0].authorId, agent.user.id);
    assert.ok(!JSON.stringify(s.repo.listTickets(o.ws, {}).data).includes("ama@example.com"), "customer text is scrubbed when stored");

    const ex = (await s.call("/v1/tickets/T-0001/export?format=github-markdown", { token: o.token })).data;
    assert.match(ex.title, /^\[T-0001\] Ticket 1$/);
    assert.match(ex.body, /## Root cause/);
    assert.match(ex.body, /L1 2026-10-28T10:00:00Z error POST \/api\/pay 500 E1 boom/);
    assert.match(ex.body, /Asked the PSP for logs/);
    assert.equal((await s.call("/v1/tickets/T-0001/export?format=pdf", { token: o.token })).status, 400);

    const actions = (await s.call("/v1/audit?action=ticket_updated", { token: o.token })).data.data;
    assert.equal(actions.length, 2);
  } finally { await s.close(); }
});

test("knowledge: upload .txt/.md/.csv, reject other types and oversize, edit, reindex, delete", async () => {
  const s = await boot();
  try {
    const o = await s.register();
    const up = (filename, text) => s.call("/v1/knowledge/upload", { method: "POST", token: o.token, body: { filename, contentBase64: Buffer.from(text).toString("base64") } });
    const md = await up("returns.md", "# Returns\n\nYou can return an item within seven days of delivery if unused.");
    assert.equal(md.status, 201);
    assert.equal(md.data.title, "returns");
    const csv = await up("faq.csv", "question,answer\nWhat are your opening hours,Monday to Saturday 8am to 6pm\nDo you deliver to Kumasi,Yes in three to six days");
    assert.equal(csv.status, 201);
    const doc = (await s.call(`/v1/knowledge/${csv.data.id}`, { token: o.token })).data;
    assert.match(doc.text, /question: What are your opening hours; answer: Monday to Saturday/);
    assert.equal((await up("virus.exe", "MZ binary content that is long enough to pass")).status, 400);
    assert.equal((await up("notes.txt", "short")).status, 400);
    const big = await s.call("/v1/knowledge/upload", { method: "POST", token: o.token, body: { filename: "big.txt", contentBase64: Buffer.alloc(1_100_000, "a").toString("base64") } });
    assert.equal(big.status, 413);
    assert.equal((await s.call("/v1/knowledge/upload", { method: "POST", token: o.token, body: { filename: "bin.txt", contentBase64: Buffer.from("abc\u0000def ghi jkl mno pqr stu vwx").toString("base64") } })).status, 400);

    assert.equal(s.repo.retrieve(o.ws, "return item seven", 1)[0].title, "returns");
    const edited = await s.call(`/v1/knowledge/${md.data.id}`, { method: "PUT", token: o.token, body: { title: "Refund policy", text: "Refunds are issued to the original payment method within five days." } });
    assert.equal(edited.data.title, "Refund policy");
    assert.equal(s.repo.retrieve(o.ws, "return item seven", 1).length, 0, "old text no longer indexed after an edit");
    assert.equal(s.repo.retrieve(o.ws, "refunds original payment", 1)[0].title, "Refund policy");
    assert.equal((await s.call(`/v1/knowledge/${md.data.id}/reindex`, { method: "POST", token: o.token })).status, 200);
    assert.equal((await s.call(`/v1/knowledge/${md.data.id}`, { method: "DELETE", token: o.token })).status, 204);
    assert.equal(s.repo.retrieve(o.ws, "refunds original payment", 1).length, 0);
  } finally { await s.close(); }
});

test("log-source test explains problems in plain words", async () => {
  const run = async (rows, opts, httpStatus) => {
    const cls = makeCls(rows, opts);
    const fetchImpl = httpStatus ? async () => ({ ok: false, status: httpStatus }) : cls.fetchImpl;
    const s = await boot({ overrides: { fetchImpl } });
    const o = await s.register();
    const none = await s.call("/v1/log-source/test", { method: "POST", token: o.token });
    await s.call("/v1/log-source", { method: "PUT", token: o.token, body: { baseUrl: "http://logs.test", apiKey: "k", service: "demo-shop-api" } });
    const r = await s.call("/v1/log-source/test", { method: "POST", token: o.token });
    await s.close();
    return { none: none.data, r: r.data };
  };
  const good = await run([logRow("u1"), logRow("u2")]);
  assert.equal(good.none.issues[0].code, "not_configured");
  assert.equal(good.r.ok, true);
  assert.equal(good.r.sampleCount, 2);

  const noUser = await run([logRow(undefined, { metadata: {} })]);
  assert.equal(noUser.r.ok, false);
  assert.equal(noUser.r.issues[0].code, "no_user_id");
  assert.match(noUser.r.issues[0].message, /no metadata\.userId/);

  const leak = await run([logRow("u1"), logRow("u2")], { leak: true });
  assert.equal(leak.r.issues[0].code, "filter_ignored");
  assert.equal((await run([], {})).r.issues[0].code, "no_logs");
  assert.equal((await run([], {}, 401)).r.issues[0].code, "auth_failed");
  assert.equal((await run([], {}, 500)).r.issues[0].code, "unreachable");
});

test("workspace settings are validated and audited; retention sweep removes old messages only", async () => {
  const s = await boot();
  try {
    const o = await s.register();
    const bad = [{ escalationThreshold: 5 }, { retentionDays: 0 }, { languages: ["xx"] }, { holdFlaggedReplies: "yes" }, { brandColor: "red" }];
    for (const settings of bad) assert.equal((await s.call("/v1/workspace", { method: "PATCH", token: o.token, body: { settings } })).status, 400, JSON.stringify(settings));
    const ok = await s.call("/v1/workspace", { method: "PATCH", token: o.token, body: { name: "Acme Ltd", settings: { escalationThreshold: 0.5, retentionDays: 7, languages: ["en", "tw"], brandColor: "#112233" } } });
    assert.equal(ok.data.settings.retentionDays, 7);
    assert.deepEqual(ok.data.settings.languages, ["en", "tw"]);
    assert.equal((await s.call("/v1/audit?action=settings_changed", { token: o.token })).data.data.length, 1);

    const old = s.repo.createConversation(o.ws, { customerId: "u" });
    s.repo.addMessage(o.ws, old.id, { role: "customer", text: "old" });
    s.repo.db.prepare("UPDATE messages SET created_at = ?").run(new Date(Date.now() - 30 * 86_400_000).toISOString());
    s.repo.db.prepare("UPDATE conversations SET created_at = ?").run(new Date(Date.now() - 30 * 86_400_000).toISOString());
    const fresh = s.repo.createConversation(o.ws, { customerId: "u2" });
    s.repo.addMessage(o.ws, fresh.id, { role: "customer", text: "new" });
    s.app.locals.sweepRetention();
    const left = (await s.call("/v1/conversations", { token: o.token })).data.data;
    assert.deepEqual(left.map((c) => c.id), [fresh.id]);
  } finally { await s.close(); }
});

test("per-workspace rate limit returns 429 with headers; trust proxy is configurable", async () => {
  const s = await boot({ env: { RATE_SUPPORT_WS: "3", RATE_SUPPORT_IP: "1000", TRUST_PROXY: "1" } });
  try {
    assert.equal(s.app.get("trust proxy"), 1);
    const o = await s.register();
    const codes = [];
    for (let i = 0; i < 5; i += 1) codes.push((await s.call("/v1/support/message", { method: "POST", body: { message: "hello", publicKey: o.workspace.publicKey } })).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
    const r = await s.call("/v1/support/message", { method: "POST", body: { message: "hello", publicKey: o.workspace.publicKey } });
    assert.equal(r.data.error.code, "rate_limited");
    assert.ok(r.data.requestId);
    assert.ok(r.headers.get("x-request-id"));
    // another workspace is not throttled by this one
    const p = await s.register("Other");
    assert.equal((await s.call("/v1/support/message", { method: "POST", body: { message: "hello", publicKey: p.workspace.publicKey } })).status, 200);
  } finally { await s.close(); }
});

test("SSE: a dashboard only receives its own workspace's events", async () => {
  const s = await boot();
  try {
    const a = await s.register("Alpha");
    const b = await s.register("Beta");
    const open = async (token) => {
      const res = await fetch(`${s.base}/v1/events`, { headers: { Authorization: `Bearer ${token}` } });
      assert.match(res.headers.get("content-type"), /^text\/event-stream/);
      return res;
    };
    const ra = await open(a.token);
    const rb = await open(b.token);
    await s.call("/v1/support/message", { method: "POST", body: { message: "hi there", publicKey: a.workspace.publicKey } });
    const readSome = async (res) => {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let text = "";
      const deadline = Date.now() + 700;
      while (Date.now() < deadline && !text.includes("message.customer")) {
        const r = await Promise.race([reader.read(), new Promise((r2) => setTimeout(() => r2({ timeout: true }), 200))]);
        if (r.timeout) { if (text) break; continue; }
        if (r.done) break;
        text += dec.decode(r.value);
      }
      reader.cancel().catch(() => {});
      return text;
    };
    assert.match(await readSome(ra), /event: message\.customer/);
    assert.doesNotMatch(await readSome(rb), /message\.customer/);
  } finally { await s.close(); }
});

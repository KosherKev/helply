"use strict";
/** Workspace isolation matrix (invariant 8): two workspaces, every id-addressed endpoint, both directions. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { boot, makeLlm, makeLanguage, makeCls, logRow } = require("./_helpers");
const { sign } = require("../src/identity/token");

const understand = (text) => (text.toLowerCase().includes("momo") ? { language: "en", english: text, intent: "account_issue", hints: { keywords: ["momo"] } } : { language: "en", english: text, intent: "general_question", hints: {} });
const explain = () => ({ found: true, customer_reply: "Your payment timed out.", root_cause: "Gateway timeout.", cited_lines: ["L1"], confidence: 0.9, suggested_fix: "Retry.", needs_human: false });

const twoWorkspaces = async () => {
  const cls = makeCls([logRow("usr_ama", { service: "svc-a" }), logRow("usr_ama", { service: "svc-b", path: "/api/b-only" })]);
  const s = await boot({ overrides: { fetchImpl: cls.fetchImpl, llm: makeLlm({ understand, explain, kb: "Answer from the knowledge base." }), language: makeLanguage() } });
  const mk = async (name, service) => {
    const o = await s.register(name);
    await s.call("/v1/log-source", { method: "PUT", token: o.token, body: { baseUrl: "http://logs.test", apiKey: "k", service } });
    const token = (await s.call("/v1/identity/tokens", { method: "POST", token: o.token, body: { userId: "usr_ama", name: "Ama" } })).data.token;
    const kb = (await s.call("/v1/knowledge", { method: "POST", token: o.token, body: { title: `${name} policy`, text: `${name} refunds are processed within five working days.` } })).data;
    const msg = (await s.call("/v1/support/message", { method: "POST", body: { message: "My MoMo payment failed", token } })).data;
    const hook = (await s.call("/v1/webhooks", { method: "POST", token: o.token, body: { url: "https://hooks.example.com/x", events: ["ticket.created"] } })).data;
    const key = (await s.call("/v1/api-keys", { method: "POST", token: o.token, body: { name: "k", scopes: ["tickets:read", "conversations:read"] } })).data;
    return { ...o, token, session: o.token, customerToken: token, kb, conv: msg.conversationId, ticket: msg.ticketId, hook, key };
  };
  const A = await mk("Alpha", "svc-a");
  const B = await mk("Beta", "svc-b");
  return { s, cls, A, B };
};

test("each workspace's customer lookup uses only its own log source and identity secret", async () => {
  const { s, cls, A, B } = await twoWorkspaces();
  try {
    const svc = (u) => new URL(u).searchParams.get("service");
    assert.ok(cls.calls.some((u) => svc(u) === "svc-a"));
    assert.ok(cls.calls.some((u) => svc(u) === "svc-b"));
    // Both tenants have a ticket T-0001 and a conversation, and they are different objects.
    const ta = (await s.call("/v1/tickets/T-0001", { token: A.session })).data;
    const tb = (await s.call("/v1/tickets/T-0001", { token: B.session })).data;
    assert.equal(ta.conversationId, A.conv);
    assert.equal(tb.conversationId, B.conv);
    assert.notEqual(A.conv, B.conv);
    assert.ok(JSON.stringify(ta.evidence).includes("/api/payments/momo"));
    assert.ok(!JSON.stringify(ta).includes("b-only"));
  } finally { await s.close(); }
});

test("B cannot read, change or delete anything that belongs to A", async () => {
  const { s, A, B } = await twoWorkspaces();
  try {
    const b = B.session;
    // reads by id
    assert.equal((await s.call(`/v1/conversations/${A.conv}`, { token: b })).status, 404);
    assert.equal((await s.call(`/v1/knowledge/${A.kb.id}`, { token: b })).status, 404);
    assert.equal((await s.call(`/v1/webhooks/${A.hook.id}/deliveries`, { token: b })).status, 404);
    // writes by id
    assert.equal((await s.call(`/v1/conversations/${A.conv}/takeover`, { method: "POST", token: b })).status, 404);
    assert.equal((await s.call(`/v1/conversations/${A.conv}/messages`, { method: "POST", token: b, body: { text: "hi", language: "customer" } })).status, 404);
    assert.equal((await s.call(`/v1/conversations/${A.conv}/resolve`, { method: "POST", token: b })).status, 404);
    assert.equal((await s.call(`/v1/knowledge/${A.kb.id}`, { method: "PUT", token: b, body: { title: "pwned", text: "x".repeat(40) } })).status, 404);
    assert.equal((await s.call(`/v1/knowledge/${A.kb.id}/reindex`, { method: "POST", token: b })).status, 404);
    assert.equal((await s.call(`/v1/knowledge/${A.kb.id}`, { method: "DELETE", token: b })).status, 404);
    assert.equal((await s.call(`/v1/webhooks/${A.hook.id}`, { method: "DELETE", token: b })).status, 404);
    assert.equal((await s.call(`/v1/webhooks/${A.hook.id}/test`, { method: "POST", token: b })).status, 404);
    assert.equal((await s.call(`/v1/api-keys/${A.key.id}`, { method: "DELETE", token: b })).status, 404);
    assert.equal((await s.call(`/v1/team/${A.user.id}`, { method: "PATCH", token: b, body: { role: "agent" } })).status, 404);
    assert.equal((await s.call(`/v1/team/${A.user.id}`, { method: "DELETE", token: b })).status, 404);
    // ticket ids collide (T-0001 in both): B's request must only ever touch B's ticket
    const patched = await s.call("/v1/tickets/T-0001", { method: "PATCH", token: b, body: { status: "resolved" } });
    assert.equal(patched.data.conversationId, B.conv);
    assert.equal((await s.call("/v1/tickets/T-0001", { token: A.session })).data.status, "open", "A's ticket is untouched");
    // assignee from the other workspace is refused
    assert.equal((await s.call("/v1/tickets/T-0001", { method: "PATCH", token: b, body: { assigneeId: A.user.id } })).status, 400);
    assert.equal((await s.call("/v1/tickets/T-0001/notes", { method: "POST", token: b, body: { text: "note from B" } })).status, 201);
    assert.equal((await s.call("/v1/tickets/T-0001", { token: A.session })).data.notes.length, 0);
    // A's data is all still there
    assert.equal((await s.call(`/v1/conversations/${A.conv}`, { token: A.session })).status, 200);
    assert.equal((await s.call(`/v1/knowledge/${A.kb.id}`, { token: A.session })).status, 200);
    assert.equal((await s.call("/v1/webhooks", { token: A.session })).data.data.length, 1);
  } finally { await s.close(); }
});

test("list endpoints never include the other workspace's rows", async () => {
  const { s, A, B } = await twoWorkspaces();
  try {
    for (const [who, other] of [[A, B], [B, A]]) {
      const lists = {
        conversations: (await s.call("/v1/conversations", { token: who.session })).data.data,
        tickets: (await s.call("/v1/tickets", { token: who.session })).data.data,
        knowledge: (await s.call("/v1/knowledge", { token: who.session })).data.documents,
        webhooks: (await s.call("/v1/webhooks", { token: who.session })).data.data,
        keys: (await s.call("/v1/api-keys", { token: who.session })).data.data,
        team: (await s.call("/v1/team", { token: who.session })).data.members,
        audit: (await s.call("/v1/audit", { token: who.session })).data.data,
      };
      for (const [name, rows] of Object.entries(lists)) {
        assert.ok(rows.length >= 1, `${name} should have the workspace's own rows`);
        const text = JSON.stringify(rows);
        assert.ok(!text.includes(other.conv) && !text.includes(other.kb.id) && !text.includes(other.hook.id) && !text.includes(other.key.id) && !text.includes(other.user.id), `${name} leaked ${other.workspace.name}'s ids`);
      }
      assert.equal((await s.call("/v1/analytics/summary", { token: who.session })).data.conversations, 1);
    }
  } finally { await s.close(); }
});

test("an API key from A reads only A's data, even with B's ids", async () => {
  const { s, A, B } = await twoWorkspaces();
  try {
    const t = await s.call("/v1/tickets", { token: A.key.key });
    assert.equal(t.data.data.length, 1);
    assert.equal(t.data.data[0].conversationId, A.conv);
    assert.equal((await s.call(`/v1/conversations/${B.conv}`, { token: A.key.key })).status, 404);
  } finally { await s.close(); }
});

test("customers: a token cannot cross tenants, and conversations cannot be continued across tenants", async () => {
  const { s, A, B } = await twoWorkspaces();
  try {
    // A token claiming tenant B but signed with A's secret does not verify: the caller is anonymous.
    const secretA = s.ctx.identitySecret(s.repo.getWorkspace(A.ws));
    const forged = sign({ sub: "usr_ama", name: "Ama", tenant: B.ws }, secretA, { ttlSeconds: 600 });
    const r = await s.call("/v1/support/message", { method: "POST", body: { message: "My MoMo payment failed", token: forged, publicKey: B.workspace.publicKey } });
    assert.equal(r.data.verified, false);
    assert.equal(r.data.requiresAuth, true);
    assert.equal(r.data.ticketId, null);
    // A's real token cannot continue B's conversation
    const cont = await s.call("/v1/support/message", { method: "POST", body: { message: "hello", token: A.customerToken, conversationId: B.conv } });
    assert.equal(cont.status, 404);
    // Knowledge retrieval is per workspace
    const kbA = await s.call("/v1/support/message", { method: "POST", body: { message: "How are refunds processed?", publicKey: A.workspace.publicKey } });
    assert.equal(kbA.data.trace.find((t) => t.step === "knowledge").answered, true);
    const hits = s.repo.retrieve(A.ws, "Beta refunds processed", 5);
    assert.ok(hits.every((h) => h.title === "Alpha policy"), "retrieval must not return Beta's documents");
  } finally { await s.close(); }
});

test("repository methods refuse to run without a workspace id", async () => {
  const s = await boot();
  try {
    for (const fn of ["listTickets", "listConversations", "listKnowledge", "listAudit", "listWebhooks", "listApiKeys", "listMembers", "analyticsSummary", "retrieve", "getTicket", "getConversation"]) {
      assert.throws(() => s.repo[fn](undefined, "x"), /workspace id is required/, fn);
      assert.throws(() => s.repo[fn](null, "x"), /workspace id is required/, fn);
    }
  } finally { await s.close(); }
});

test("customer data erasure removes only that customer's data in that workspace, and is audited", async () => {
  const { s, A, B } = await twoWorkspaces();
  try {
    assert.equal((await s.call("/v1/customers/usr_ama/data", { method: "DELETE", token: A.session })).data.erased.conversations, 1);
    assert.equal((await s.call("/v1/conversations", { token: A.session })).data.data.length, 0);
    assert.equal((await s.call("/v1/tickets", { token: A.session })).data.data.length, 0);
    assert.equal((await s.call("/v1/conversations", { token: B.session })).data.data.length, 1, "other workspace keeps its data");
    assert.equal((await s.call("/v1/tickets", { token: B.session })).data.data.length, 1);
    const events = (await s.call("/v1/audit?action=data_erased", { token: A.session })).data.data;
    assert.equal(events.length, 1);
    assert.equal(events[0].detail.userId, "usr_ama");
  } finally { await s.close(); }
});

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { boot, makeLlm, makeLanguage, makeCls, logRow } = require("./_helpers");

const understand = (text) => {
  const t = text.toLowerCase();
  if (t.includes("momo")) return { language: "en", english: text, intent: "account_issue", hints: { keywords: ["momo"] } };
  if (t.includes("person")) return { language: "en", english: text, intent: "human_request", hints: {} };
  return { language: "en", english: text, intent: "general_question", hints: {} };
};
const setup = async ({ confidence = 0.9, rows } = {}) => {
  const cls = makeCls(rows || [logRow("usr_ama", { service: "svc" }), logRow("usr_kofi", { service: "svc" })]);
  const seen = [];
  const explain = () => ({ found: true, customer_reply: "Model wording about the timeout.", root_cause: "Gateway timeout calling the provider.", cited_lines: ["L1"], confidence, suggested_fix: "Retry.", needs_human: false });
  const base = makeLlm({ understand, explain, kb: undefined });
  const llm = { ...base, generate: (a) => { seen.push(a); return base.generate(a); } };
  const s = await boot({ overrides: { fetchImpl: cls.fetchImpl, llm, language: makeLanguage() } });
  const o = await s.register("Alpha");
  await s.call("/v1/log-source", { method: "PUT", token: o.token, body: { baseUrl: "http://logs.test", apiKey: "k", service: "svc" } });
  const tok = async (u) => (await s.call("/v1/identity/tokens", { method: "POST", token: o.token, body: { userId: u } })).data.token;
  const say = async (message, user) => (await s.call("/v1/support/message", { method: "POST", body: { message, publicKey: o.workspace.publicKey, ...(user ? { token: await tok(user) } : {}) } })).data;
  return { s, o, say, seen, cls };
};

test("inbox counts and assignment", async () => {
  const { s, o, say } = await setup();
  try {
    await say("I want a person");
    await say("hello there", null);
    const agent = await s.addMember(o, "agent");
    let c = (await s.call("/v1/inbox/counts", { token: o.token })).data;
    assert.deepEqual([c.needsHuman, c.unassigned, c.mine], [2, 2, 0], "both messages need a person: no FAQ or document answers the second");
    const conv = (await s.call("/v1/conversations?status=needs_human", { token: o.token })).data.data[0];
    await s.call(`/v1/conversations/${conv.id}/takeover`, { method: "POST", token: agent.token });
    c = (await s.call("/v1/inbox/counts", { token: agent.token })).data;
    assert.equal(c.mine, 1);
    assert.equal((await s.call("/v1/inbox/counts", { token: o.token })).data.mine, 0, "mine is per person");
    const asg = await s.call(`/v1/conversations/${conv.id}`, { method: "PATCH", token: o.token, body: { assigneeId: o.user.id } });
    assert.equal(asg.data.assigneeId, o.user.id);
    assert.equal((await s.call(`/v1/conversations/${conv.id}`, { method: "PATCH", token: o.token, body: { assigneeId: "usr_stranger" } })).status, 400);
    assert.equal((await s.call(`/v1/conversations/${conv.id}`, { method: "PATCH", token: o.token, body: {} })).status, 400);
    const other = await s.register("Beta");
    assert.equal((await s.call(`/v1/conversations/${conv.id}`, { method: "PATCH", token: other.token, body: { assigneeId: null } })).status, 404);
    assert.equal((await s.call("/v1/inbox/counts", { token: other.token })).data.needsHuman, 0);
  } finally { await s.close(); }
});

test("issues group the same root cause across customers; fixing reopens on regression", async () => {
  const { s, o, say } = await setup();
  try {
    await say("My MoMo payment failed", "usr_ama");
    await say("MoMo broke for me too", "usr_kofi");
    const list = (await s.call("/v1/issues", { token: o.token })).data;
    assert.equal(list.data.length, 1);
    const i = list.data[0];
    assert.equal(i.count, 2);
    assert.equal(i.affectedCustomers, 2);
    assert.equal(i.status, "open");
    assert.match(i.id, /^iss_/);
    const d = (await s.call(`/v1/issues/${i.id}`, { token: o.token })).data;
    assert.equal(d.evidence[0].id, "L1");
    await s.call(`/v1/tickets/${i.ticketIds[0]}/notes`, { method: "POST", token: o.token, body: { text: "Raised with MTN" } });
    assert.equal((await s.call(`/v1/issues/${i.id}`, { token: o.token })).data.notes.length, 1);
    const fixed = await s.call(`/v1/issues/${i.id}`, { method: "PATCH", token: o.token, body: { status: "fixed", assigneeId: o.user.id } });
    assert.equal(fixed.data.status, "fixed");
    assert.ok(fixed.data.fixedAt);
    assert.equal((await s.call("/v1/issues?status=fixed", { token: o.token })).data.data.length, 1);
    await new Promise((r) => setTimeout(r, 5));
    await say("MoMo failed again", "usr_ama");
    const again = (await s.call(`/v1/issues/${i.id}`, { token: o.token })).data;
    assert.equal(again.status, "open", "a new report after the fix reopens it");
    assert.equal(again.count, 3);
    const ex = (await s.call(`/v1/issues/${i.id}/export`, { token: o.token })).data;
    assert.match(ex.body, /2 customer\(s\) affected|3 report/);
    assert.match(ex.body, /L1 .* PROVIDER_TIMEOUT/);
    assert.equal((await s.call("/v1/issues?status=bogus", { token: o.token })).status, 400);
    assert.equal((await s.call(`/v1/issues/${i.id}`, { method: "PATCH", token: o.token, body: { status: "nope" } })).status, 400);
    const other = await s.register("Beta");
    assert.equal((await s.call(`/v1/issues/${i.id}`, { token: other.token })).status, 404);
    assert.equal((await s.call("/v1/issues", { token: other.token })).data.data.length, 0);
  } finally { await s.close(); }
});

test("playbooks: validation, roles, suggestions, and approved wording reaches the model only for cited matching lines", async () => {
  const { s, o, say, seen } = await setup();
  try {
    await say("My MoMo payment failed", "usr_ama");
    const sug = (await s.call("/v1/playbooks/suggestions", { token: o.token })).data.data;
    assert.equal(sug[0].errorCode, "PROVIDER_TIMEOUT");
    for (const bad of [{ title: "x", customerWording: "w" }, { errorCode: "bad code!", title: "x", customerWording: "w" }, { errorCode: "A", title: "x", customerWording: "w", severity: "huge" }, { errorCode: "A", title: "x", customerWording: "" }]) {
      assert.equal((await s.call("/v1/playbooks", { method: "POST", token: o.token, body: bad })).status, 400, JSON.stringify(bad));
    }
    const pb = await s.call("/v1/playbooks", { method: "POST", token: o.token, body: { errorCode: "PROVIDER_TIMEOUT", pathPattern: "/api/payments/*", title: "MoMo timeout", customerWording: "Do not pay again; we are checking with MTN.", ownerTeam: "Payments", alwaysHandoff: false } });
    assert.equal(pb.status, 201);
    assert.equal((await s.call("/v1/playbooks/suggestions", { token: o.token })).data.data.length, 0, "covered codes stop being suggested");
    seen.length = 0;
    await say("My MoMo payment failed again", "usr_ama");
    const explain = seen.find((x) => x.system.includes("explain a customer's problem"));
    assert.match(explain.user, /<approved_wording>\nL1: Do not pay again; we are checking with MTN\.\n<\/approved_wording>/);

    await s.call(`/v1/playbooks/${pb.data.id}`, { method: "PUT", token: o.token, body: { pathPattern: "/api/other/*" } });
    seen.length = 0;
    await say("My MoMo payment failed once more", "usr_ama");
    assert.ok(!seen.find((x) => x.system.includes("explain a customer's problem")).user.includes("approved_wording"), "a path pattern that does not match means no wording");

    await s.call(`/v1/playbooks/${pb.data.id}`, { method: "PUT", token: o.token, body: { pathPattern: null, alwaysHandoff: true } });
    const r = await say("My MoMo payment is broken", "usr_ama");
    assert.equal(r.needsHuman, true, "alwaysHandoff hands over even though the model was happy");

    const agent = await s.addMember(o, "agent");
    assert.equal((await s.call("/v1/playbooks", { token: agent.token })).status, 200);
    assert.equal((await s.call("/v1/playbooks", { method: "POST", token: agent.token, body: { errorCode: "A", title: "t", customerWording: "w" } })).status, 403);
    const other = await s.register("Beta");
    assert.equal((await s.call("/v1/playbooks", { token: other.token })).data.data.length, 0);
    assert.equal((await s.call(`/v1/playbooks/${pb.data.id}`, { method: "DELETE", token: other.token })).status, 404);
    assert.equal((await s.call(`/v1/playbooks/${pb.data.id}`, { method: "DELETE", token: o.token })).status, 204);
  } finally { await s.close(); }
});

test("handoff rules: keywords and account-issue handoff happen before any log lookup; low confidence hands over; a person is always honoured", async () => {
  const { s, o, say, cls } = await setup({ confidence: 0.5 });
  try {
    const def = (await s.call("/v1/handoff-rules", { token: o.token })).data;
    assert.deepEqual(def.alwaysHandoffIntents, ["human_request"]);
    for (const bad of [{ minConfidence: 2 }, { keywords: ["x"] }, { outsideHours: "never" }, { alwaysHandoffIntents: ["other"] }, { notifyEmail: "nope" }]) {
      assert.equal((await s.call("/v1/handoff-rules", { method: "PUT", token: o.token, body: { ...def, ...bad } })).status, 400, JSON.stringify(bad));
    }
    const noPerson = await s.call("/v1/handoff-rules", { method: "PUT", token: o.token, body: { ...def, alwaysHandoffIntents: [], minConfidence: 0.6 } });
    assert.deepEqual(noPerson.data.alwaysHandoffIntents, ["human_request"], "human_request cannot be removed");

    let r = await say("My MoMo payment failed", "usr_ama");
    assert.equal(r.needsHuman, true, "confidence 0.5 is below the 0.6 minimum");
    await s.call("/v1/handoff-rules", { method: "PUT", token: o.token, body: { ...def, minConfidence: 0.3, keywords: ["Refund"] } });
    r = await say("My MoMo payment failed", "usr_ama");
    assert.equal(r.needsHuman, false);
    cls.calls.length = 0;
    r = await say("I want a REFUND for my momo payment", "usr_ama");
    assert.equal(r.needsHuman, true);
    assert.match((await s.call(`/v1/tickets/${r.ticketId}`, { token: o.token })).data.title, /Handoff rule: keyword "refund"/);
    assert.equal(cls.calls.filter((u) => u.includes("userId=")).length, 0, "no log lookup for a keyword handoff");
    await s.call("/v1/handoff-rules", { method: "PUT", token: o.token, body: { ...def, minConfidence: 0.3, alwaysHandoffIntents: ["account_issue"] } });
    cls.calls.length = 0;
    assert.equal((await say("My MoMo payment failed", "usr_ama")).needsHuman, true);
    assert.equal(cls.calls.filter((u) => u.includes("userId=")).length, 0);
    const agent = await s.addMember(o, "agent");
    assert.equal((await s.call("/v1/handoff-rules", { method: "PUT", token: agent.token, body: def })).status, 403);
  } finally { await s.close(); }
});

test("knowledge gaps cluster repeated unanswered questions; resolving can create an FAQ that then answers them", async () => {
  const { s, o, say } = await setup();
  try {
    await say("Do you deliver to Tamale on Sundays?");
    await say("do you deliver on sundays to tamale");
    await say("What is your refund policy for opened items?");
    await say("I want a person"); // a handoff request is not a gap
    const gaps = (await s.call("/v1/knowledge-gaps", { token: o.token })).data.data;
    assert.equal(gaps.length, 2);
    assert.equal(gaps[0].count, 2, "same question in different words clusters");
    assert.equal(gaps[0].sampleConversationIds.length, 2);
    const g = gaps[0];
    assert.equal((await s.call(`/v1/knowledge-gaps/${g.id}/resolve`, { method: "POST", token: o.token, body: { faq: { question: "Do you deliver to Tamale on Sundays?", answer: "No, Tamale deliveries run Monday to Saturday." } } })).data.status, "resolved");
    const faqs = (await s.call("/v1/faqs", { token: o.token })).data.data;
    assert.equal(faqs[0].source, "gap");
    assert.equal((await s.call("/v1/knowledge-gaps", { token: o.token })).data.data.length, 1);
    assert.equal((await s.call("/v1/knowledge-gaps?status=resolved", { token: o.token })).data.data.length, 1);
    const g2 = gaps[1];
    assert.equal((await s.call(`/v1/knowledge-gaps/${g2.id}/dismiss`, { method: "POST", token: o.token })).data.status, "dismissed");
    assert.equal((await s.call(`/v1/knowledge-gaps/${g.id}/resolve`, { method: "POST", token: o.token, body: { faqId: "faq_nope" } })).status, 404);
    const other = await s.register("Beta");
    assert.equal((await s.call("/v1/knowledge-gaps", { token: other.token })).data.data.length, 0);
    assert.equal((await s.call(`/v1/knowledge-gaps/${g.id}/dismiss`, { method: "POST", token: other.token })).status, 404);
  } finally { await s.close(); }
});

test("feedback and quality summary", async () => {
  const { s, o, say } = await setup();
  try {
    const r1 = await say("My MoMo payment failed", "usr_ama");
    const r2 = await say("Do you deliver to Tamale?");
    const fb = (id, body, tok = o.token) => s.call(`/v1/messages/${id}/feedback`, { method: "POST", token: tok, body });
    assert.equal((await fb(r1.messageId, { rating: "good" })).status, 200);
    assert.equal((await fb(r2.messageId, { rating: "bad", reason: "unclear", note: "email me at x@y.example" })).status, 200);
    assert.equal((await fb(r2.messageId, { rating: "bad", reason: "wrong" })).status, 200, "last write wins");
    assert.equal((await fb(r1.messageId, { rating: "meh" })).status, 400);
    assert.equal((await fb(r1.messageId, { rating: "bad", reason: "rude" })).status, 400);
    assert.equal((await fb("m_missing", { rating: "good" })).status, 404);
    const other = await s.register("Beta");
    assert.equal((await fb(r1.messageId, { rating: "good" }, other.token)).status, 404);
    const q = (await s.call("/v1/analytics/quality", { token: o.token })).data;
    assert.equal(q.ratedReplies, 2);
    assert.equal(q.goodRate, 0.5);
    assert.equal(q.answeredFromLogs, 0.5);
    assert.deepEqual(q.handoffReasons, [{ reason: "knowledge_miss", count: 1 }]);
    const stored = s.repo.db.prepare("SELECT note FROM message_feedback WHERE note IS NOT NULL").all();
    assert.ok(stored.every((x) => !x.note.includes("x@y.example")));
    assert.equal((await s.call("/v1/analytics/quality", { token: other.token })).data.ratedReplies, 0);
  } finally { await s.close(); }
});

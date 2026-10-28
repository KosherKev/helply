"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { boot, makeLlm, makeLanguage, makeCls, logRow } = require("./_helpers");
const { sign } = require("../src/identity/token");
const { sha256 } = require("../src/security/crypto");

const understand = (text) => (text.toLowerCase().includes("momo") ? { language: "en", english: text, intent: "account_issue", hints: { keywords: ["momo"] } } : { language: "en", english: text, intent: "general_question", hints: {} });
const explain = () => ({ found: true, customer_reply: "Your payment timed out at the provider.", root_cause: "Gateway timeout calling the provider.", cited_lines: ["L1"], confidence: 0.9, suggested_fix: "Retry.", needs_human: false });

/** One workspace with a log source and a connected ChatFlow channel. `llmCalls()` counts model calls. */
const setup = async ({ llmOn = true, env = {} } = {}) => {
  const cls = makeCls([logRow("usr_ama", { service: "svc" }), logRow("usr_kofi", { service: "svc", path: "/api/kofi-only" })]);
  const base = makeLlm({ understand, explain, kb: "Delivery takes 1 to 3 days." });
  let n = 0;
  const llm = { ...base, isConfigured: () => llmOn, generate: (...a) => { n += 1; return base.generate(...a); } };
  const s = await boot({ env, overrides: { fetchImpl: cls.fetchImpl, llm, language: makeLanguage() } });
  const owner = await s.register("Alpha");
  await s.call("/v1/log-source", { method: "PUT", token: owner.token, body: { baseUrl: "http://logs.test", apiKey: "k", service: "svc" } });
  const ch = await s.call("/v1/channels", { method: "POST", token: owner.token, body: { kind: "chatflow", label: "Website", externalId: "wid_A" } });
  assert.equal(ch.status, 201);
  const key = ch.data.relayKey;
  const relay = (path, body, k = key, method = "POST") => s.call(path, { method, token: k, body });
  const idToken = async (userId, visitorId) => (await s.call("/v1/identity/tokens", { method: "POST", token: owner.token, body: { userId, name: userId, ...(visitorId ? { visitorId } : {}) } })).data.token;
  const msg = (extra = {}) => relay("/v1/relay/message", { externalConversationId: "cf_1", externalVisitorId: "vis_1", message: "My MoMo payment failed", ...extra });
  return { s, cls, owner, ch: ch.data, key, relay, idToken, msg, llmCalls: () => n, cls };
};

test("channels: connect, key shown once and stored hashed, duplicates and bad input refused", async () => {
  const { s, owner, ch, key } = await setup();
  try {
    assert.match(key, /^hr_live_/);
    assert.equal(ch.status, "pending");
    assert.equal(ch.keyPrefix, key.slice(0, 12));
    const stored = s.repo.db.prepare("SELECT key_hash FROM channels").get().key_hash;
    assert.equal(stored, sha256(key));
    assert.ok(!JSON.stringify(s.repo.db.prepare("SELECT * FROM channels").all()).includes(key));
    const list = (await s.call("/v1/channels", { token: owner.token })).data.data;
    assert.equal(list.length, 1);
    assert.ok(!JSON.stringify(list).includes(key));
    assert.equal((await s.call("/v1/channels", { method: "POST", token: owner.token, body: { kind: "chatflow", label: "Again", externalId: "wid_A" } })).status, 409);
    for (const body of [{ kind: "slack", label: "x", externalId: "w" }, { kind: "chatflow", label: "", externalId: "w" }, { kind: "chatflow", label: "x", externalId: "" }]) {
      assert.equal((await s.call("/v1/channels", { method: "POST", token: owner.token, body })).status, 400, JSON.stringify(body));
    }
    const agent = await s.addMember(owner, "agent");
    assert.equal((await s.call("/v1/channels", { token: agent.token })).status, 403);
  } finally { await s.close(); }
});

test("rotating a key revokes the old one at once; disconnecting revokes it too", async () => {
  const { s, owner, ch, key, relay } = await setup();
  try {
    assert.equal((await relay("/v1/relay/config", undefined, key, "GET")).status, 200);
    const rot = await s.call(`/v1/channels/${ch.id}/rotate-key`, { method: "POST", token: owner.token });
    assert.notEqual(rot.data.relayKey, key);
    assert.equal((await relay("/v1/relay/config", undefined, key, "GET")).status, 401);
    assert.equal((await relay("/v1/relay/config", undefined, rot.data.relayKey, "GET")).status, 200);
    assert.equal((await s.call(`/v1/channels/${ch.id}`, { method: "DELETE", token: owner.token })).status, 204);
    assert.equal((await relay("/v1/relay/config", undefined, rot.data.relayKey, "GET")).status, 401);
    const actions = (await s.call("/v1/audit", { token: owner.token })).data.data.map((e) => e.action);
    for (const a of ["channel_connected", "channel_key_rotated", "channel_disconnected"]) assert.ok(actions.includes(a), a);
  } finally { await s.close(); }
});

test("relay endpoints accept only a relay key: no key, sessions, API keys and junk are 401", async () => {
  const { s, owner, relay } = await setup();
  try {
    const apiKey = (await s.call("/v1/api-keys", { method: "POST", token: owner.token, body: { name: "k", scopes: ["identity:mint", "tickets:read", "tickets:write", "conversations:read"] } })).data.key;
    const body = { externalConversationId: "c", externalVisitorId: "v", message: "hi" };
    for (const k of [null, owner.token, apiKey, "hr_live_nonsense", "hr_"]) { // null = no credential (undefined would fall back to the real key)
      assert.equal((await relay("/v1/relay/message", body, k)).status, 401, String(k).slice(0, 12));
    }
    // and a relay key opens nothing else
    const key = (await s.call("/v1/channels", { token: owner.token })).data.data[0];
    assert.ok(key);
    const { relayKey } = (await s.call(`/v1/channels/${key.id}/rotate-key`, { method: "POST", token: owner.token })).data;
    for (const p of ["/v1/tickets", "/v1/conversations", "/v1/team", "/v1/channels", "/v1/audit"]) assert.equal((await s.call(p, { token: relayKey })).status, 401, p);
  } finally { await s.close(); }
});

test("a verified visitor gets an evidence-based answer, and the conversation is stored once per ChatFlow conversation", async () => {
  const { s, owner, cls, idToken, msg } = await setup();
  try {
    const token = await idToken("usr_ama", "vis_1");
    const r = await msg({ identityToken: token });
    assert.equal(r.status, 200);
    assert.equal(r.data.verified, true);
    assert.equal(r.data.handledBy, "ai");
    assert.match(r.data.reply.text, /timed out/);
    assert.equal(r.data.ticketId, "T-0001");
    assert.ok(cls.calls.filter((u) => u.includes("userId=")).every((u) => new URL(u).searchParams.get("userId") === "usr_ama"));
    const again = await msg({ identityToken: token, message: "any update?" });
    assert.equal(again.data.conversationId, r.data.conversationId, "same ChatFlow conversation, same Helply conversation");
    const conv = (await s.call(`/v1/conversations/${r.data.conversationId}`, { token: owner.token })).data;
    assert.equal(conv.customerId, "usr_ama");
    assert.ok(conv.messages.length >= 4);
    assert.equal((await s.call("/v1/audit?action=log_lookup", { token: owner.token })).data.data[0].detail.userId, "usr_ama");
    const channel = (await s.call("/v1/channels", { token: owner.token })).data.data[0];
    assert.equal(channel.status, "connected");
    assert.ok(channel.lastSeenAt);
  } finally { await s.close(); }
});

test("anonymous visitors cannot trigger log lookups", async () => {
  const { s, cls, msg } = await setup();
  try {
    const r = await msg();
    assert.equal(r.data.verified, false);
    assert.equal(r.data.requiresAuth, true);
    assert.equal(r.data.ticketId, null);
    assert.equal(cls.calls.filter((u) => u.includes("userId=")).length, 0);
    assert.equal((await s.call("/v1/audit?action=log_lookup", { token: (await s.register("Other")).token })).data.data.length, 0);
  } finally { await s.close(); }
});

test("identity is refused when the token is for another visitor, another workspace, expired, or says it is not for Helply", async () => {
  const { s, cls, owner, idToken, msg } = await setup();
  try {
    const wrongVisitor = await idToken("usr_ama", "someone_else");
    assert.equal((await msg({ identityToken: wrongVisitor })).data.verified, false, "token bound to another visitor");
    const unbound = await idToken("usr_ama");
    assert.equal((await msg({ identityToken: unbound, externalConversationId: "cf_2" })).data.verified, true, "v1-style unbound tokens still work");

    const other = await s.register("Beta");
    const otherToken = (await s.call("/v1/identity/tokens", { method: "POST", token: other.token, body: { userId: "usr_ama" } })).data.token;
    assert.equal((await msg({ identityToken: otherToken, externalConversationId: "cf_3" })).data.verified, false, "token minted by another workspace");

    const secret = s.ctx.identitySecret(s.repo.getWorkspace(owner.ws));
    const old = sign({ sub: "usr_ama", tenant: owner.ws }, secret, { ttlSeconds: 600, now: Date.now() - 3_600_000 });
    assert.equal((await msg({ identityToken: old, externalConversationId: "cf_4" })).data.verified, false, "expired");
    const wrongAud = sign({ sub: "usr_ama", tenant: owner.ws, aud: "someone-else" }, secret, { ttlSeconds: 600 });
    assert.equal((await msg({ identityToken: wrongAud, externalConversationId: "cf_5" })).data.verified, false, "audience");
    const wrongTenant = sign({ sub: "usr_ama", tenant: other.ws }, secret, { ttlSeconds: 600 });
    assert.equal((await msg({ identityToken: wrongTenant, externalConversationId: "cf_6" })).data.verified, false, "tenant claim names another workspace");
    assert.ok(cls.calls.every((u) => !u.includes("userId=") || new URL(u).searchParams.get("userId") === "usr_ama"));
  } finally { await s.close(); }
});

test("a visitor-bound token is useless on the direct support API (no visitor id to match)", async () => {
  const { s, idToken, owner } = await setup();
  try {
    const bound = await idToken("usr_ama", "vis_1");
    const r = await s.call("/v1/support/message", { method: "POST", body: { message: "My MoMo payment failed", token: bound, publicKey: owner.workspace.publicKey } });
    assert.equal(r.data.verified, false);
  } finally { await s.close(); }
});

test("a different verified customer on the same ChatFlow conversation starts a fresh Helply conversation", async () => {
  const { s, idToken, msg } = await setup();
  try {
    const a = await msg({ identityToken: await idToken("usr_ama", "vis_1") });
    const b = await msg({ identityToken: await idToken("usr_kofi", "vis_1"), message: "How long is delivery?" });
    assert.notEqual(a.data.conversationId, b.data.conversationId);
    assert.equal(b.data.verified, true);
  } finally { await s.close(); }
});

test("agentOnline, human takeover and a paused AI all suppress the reply without any model or log work", async () => {
  const { s, owner, relay, msg, idToken, llmCalls, cls } = await setup();
  try {
    const token = await idToken("usr_ama", "vis_1");
    const before = llmCalls();
    const online = await msg({ identityToken: token, agentOnline: true });
    assert.equal(online.data.suppressed, "agent_online");
    assert.equal(online.data.reply, null);
    assert.equal(llmCalls(), before);
    assert.equal(cls.calls.length, 0);
    const convId = online.data.conversationId;
    assert.equal((await s.call(`/v1/conversations/${convId}`, { token: owner.token })).data.messages.length, 1, "the customer's message is still recorded");

    await s.call(`/v1/conversations/${convId}/takeover`, { method: "POST", token: owner.token });
    const taken = await msg({ identityToken: token });
    assert.equal(taken.data.suppressed, "human_taken_over");
    assert.equal(llmCalls(), before);

    await s.call(`/v1/conversations/${convId}/resolve`, { method: "POST", token: owner.token });
    const paused = await s.call("/v1/workspace", { method: "PATCH", token: owner.token, body: { settings: { aiLive: false } } });
    assert.equal(paused.data.settings.aiLive, false);
    const p = await msg({ identityToken: token, externalConversationId: "cf_new" });
    assert.equal(p.data.suppressed, "ai_paused");
    assert.equal(p.data.needsHuman, true);
    assert.equal(llmCalls(), before);
    assert.equal((await s.call(`/v1/conversations/${p.data.conversationId}`, { token: owner.token })).data.status, "needs_human");
    assert.equal((await relay("/v1/relay/config", undefined, undefined, "GET")).data.aiEnabled, false);
    assert.ok((await s.call("/v1/audit?action=ai_live_changed", { token: owner.token })).data.data.length === 1);

    // direct support API honours the pause too
    const d = await s.call("/v1/support/message", { method: "POST", body: { message: "My MoMo payment failed", token: await idToken("usr_ama"), publicKey: owner.workspace.publicKey } });
    assert.equal(d.data.needsHuman, true);
    assert.equal(d.data.handledBy, "human");
    assert.equal(llmCalls(), before);

    s.repo.updateWorkspace(owner.ws, { settings: { aiLive: true } }); // resuming through the API is gated by onboarding (see onboarding.test.js)
    assert.equal((await msg({ identityToken: token, externalConversationId: "cf_back" })).data.handledBy, "ai");
  } finally { await s.close(); }
});

test("events keep the transcript in step with ChatFlow's inbox", async () => {
  const { s, owner, relay, msg } = await setup();
  try {
    const first = await msg({ message: "How long is delivery?" });
    const convId = first.data.conversationId;
    const ev = (type, extra = {}) => relay("/v1/relay/events", { externalConversationId: "cf_1", type, ...extra });
    assert.equal((await ev("agent_joined")).status, 200);
    assert.equal((await s.call(`/v1/conversations/${convId}`, { token: owner.token })).data.status, "human");
    assert.equal((await msg({ message: "hello?" })).data.suppressed, "human_taken_over");
    assert.equal((await ev("agent_message", { text: "Hi, I can help. Reach me at kofi@example.com" })).status, 200);
    const detail = (await s.call(`/v1/conversations/${convId}`, { token: owner.token })).data;
    const agentMsg = detail.messages.find((m) => m.role === "agent");
    assert.ok(agentMsg);
    assert.ok(!agentMsg.text.includes("kofi@example.com"), "personal data is scrubbed before it is stored");
    assert.equal((await ev("agent_message", {})).status, 400);
    await ev("conversation_closed");
    assert.equal((await s.call(`/v1/conversations/${convId}`, { token: owner.token })).data.status, "resolved");
    await ev("conversation_reopened");
    assert.equal((await s.call(`/v1/conversations/${convId}`, { token: owner.token })).data.status, "ai");
    assert.equal((await ev("agent_left")).status, 200);
    assert.equal((await ev("explode")).status, 400);
    assert.equal((await relay("/v1/relay/events", { externalConversationId: "nope", type: "agent_joined" })).status, 404);
  } finally { await s.close(); }
});

test("channels are isolated: another workspace's key cannot see or drive this conversation, and ids are per channel", async () => {
  const { s, owner, msg } = await setup();
  try {
    const first = await msg({ message: "How long is delivery?" });
    const other = await s.register("Beta");
    const chB = await s.call("/v1/channels", { method: "POST", token: other.token, body: { kind: "chatflow", label: "B", externalId: "wid_B" } });
    const keyB = chB.data.relayKey;
    assert.equal((await s.call("/v1/relay/events", { method: "POST", token: keyB, body: { externalConversationId: "cf_1", type: "conversation_closed" } })).status, 404);
    // the same ChatFlow conversation id on another channel is a different conversation in a different workspace
    const b = await s.call("/v1/relay/message", { method: "POST", token: keyB, body: { externalConversationId: "cf_1", externalVisitorId: "vis_1", message: "How long is delivery?" } });
    assert.notEqual(b.data.conversationId, first.data.conversationId);
    assert.equal((await s.call(`/v1/conversations/${first.data.conversationId}`, { token: other.token })).status, 404);
    assert.equal((await s.call(`/v1/channels/${(await s.call("/v1/channels", { token: owner.token })).data.data[0].id}`, { method: "DELETE", token: other.token })).status, 404);
    assert.equal((await s.call("/v1/channels", { method: "POST", token: other.token, body: { kind: "chatflow", label: "dup", externalId: "wid_A" } })).status, 409, "one workspace per ChatFlow property");
  } finally { await s.close(); }
});

test("identify, config, channel test, validation and limits", async () => {
  const { s, owner, ch, relay, idToken, msg } = await setup();
  try {
    const t = await s.call(`/v1/channels/${ch.id}/test`, { method: "POST", token: owner.token });
    assert.equal(t.data.ok, false);
    assert.equal(t.data.issues[0].code, "never_called");
    const good = await relay("/v1/relay/identify", { externalVisitorId: "vis_1", identityToken: await idToken("usr_ama", "vis_1") });
    assert.equal(good.data.verified, true);
    assert.ok(Date.parse(good.data.expiresAt) > Date.now());
    assert.equal((await relay("/v1/relay/identify", { externalVisitorId: "vis_2", identityToken: await idToken("usr_ama", "vis_1") })).data.verified, false);
    assert.equal((await relay("/v1/relay/identify", { externalVisitorId: "vis_1" })).data.verified, false);
    const cfg = (await relay("/v1/relay/config", undefined, undefined, "GET")).data;
    assert.equal(cfg.aiEnabled, true);
    assert.ok(cfg.fallbackMessage.length > 10);
    assert.equal((await s.call(`/v1/channels/${ch.id}/test`, { method: "POST", token: owner.token })).data.ok, true);

    assert.equal((await msg({ message: "" })).status, 400);
    assert.equal((await msg({ message: "x".repeat(1001) })).status, 400);
    assert.equal((await msg({ externalConversationId: "" })).status, 400);
    assert.equal((await msg({ externalVisitorId: undefined })).status, 400);
  } finally { await s.close(); }
});

test("each channel has its own rate limit", async () => {
  const { s, owner, msg } = await setup({ env: { RATE_RELAY_CHANNEL: "3" } });
  try {
    const statuses = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await msg({ message: "How long is delivery?", agentOnline: true })).status);
    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
    const other = await s.register("Beta");
    const chB = await s.call("/v1/channels", { method: "POST", token: other.token, body: { kind: "chatflow", label: "B", externalId: "wid_B" } });
    const r = await s.call("/v1/relay/message", { method: "POST", token: chB.data.relayKey, body: { externalConversationId: "c", externalVisitorId: "v", message: "hi", agentOnline: true } });
    assert.equal(r.status, 200, "another channel is not throttled by this one");
    void owner;
  } finally { await s.close(); }
});

test("without a configured model the relay still suppresses cleanly, and says so when an answer is needed", async () => {
  const { s, msg } = await setup({ llmOn: false });
  try {
    assert.equal((await msg({ agentOnline: true })).data.suppressed, "agent_online");
    const r = await msg({ externalConversationId: "cf_x" });
    assert.equal(r.status, 503);
    assert.equal(r.data.error.code, "llm_not_configured");
  } finally { await s.close(); }
});

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { boot, makeLlm, makeLanguage, makeCls, logRow } = require("./_helpers");
const { parseCsv } = require("../src/util-csv");

const understand = (text) => (text.toLowerCase().includes("momo") ? { language: "en", english: text, intent: "account_issue", hints: { keywords: ["momo"] } } : { language: "en", english: text, intent: "general_question", hints: {} });
const explain = () => ({ found: true, customer_reply: "Your payment timed out.", root_cause: "Gateway timeout.", cited_lines: ["L1"], confidence: 0.9, suggested_fix: "Retry.", needs_human: false });

const setup = async ({ rows } = {}) => {
  const cls = makeCls(rows || [logRow("usr_ama", { service: "svc" })]);
  const seen = [];
  const base = makeLlm({ understand, explain, kb: "Answer from company details." });
  const llm = { ...base, generate: (a) => { seen.push(a); return base.generate(a); } };
  const s = await boot({ overrides: { fetchImpl: cls.fetchImpl, llm, language: makeLanguage() } });
  return { s, cls, seen };
};
const step = (ob, id) => ob.steps.find((x) => x.id === id);
const goodProfile = { name: "Acme Shop", about: "We sell phones and accessories in Accra with nationwide delivery.", website: "https://acme.example", hours: "Mon to Sat 8am to 6pm", timezone: "Africa/Accra", contactEmail: "help@acme.example", contactPhone: null, languages: ["en", "tw"], tone: "formal", escalation: { email: "support@acme.example", phone: null, whatsapp: null } };

test("CSV parser handles quotes, commas, escaped quotes, newlines in fields and CRLF", () => {
  assert.deepEqual(parseCsv('q,a\r\n"Hi, there","He said ""yes"""\n"multi\nline",x\n\n'), [["q", "a"], ["Hi, there", 'He said "yes"'], ["multi\nline", "x"]]);
  assert.deepEqual(parseCsv("﻿a,b\n1,2"), [["a", "b"], ["1", "2"]]);
});

test("a new workspace starts paused and the checklist is computed from real state", async () => {
  const { s } = await setup();
  try {
    const o = await s.register("Acme", undefined, { live: false });
    assert.equal(s.repo.getWorkspace(o.ws).settings.aiLive, false);
    let ob = (await s.call("/v1/onboarding", { token: o.token })).data;
    assert.equal(ob.total, 9);
    assert.equal(ob.live, false);
    assert.equal(ob.readyForLive, false);
    assert.deepEqual(ob.steps.map((x) => x.id), ["workspace", "logs_shipped", "log_source", "identity", "business_profile", "knowledge", "channel", "test", "live"]);
    assert.equal(step(ob, "workspace").status, "done");
    assert.equal(step(ob, "log_source").status, "todo");
    assert.equal(step(ob, "logs_shipped").status, "their_side");
    assert.equal(step(ob, "channel").optional, true);
    assert.equal(step(ob, "live").status, "blocked");

    await s.call("/v1/log-source", { method: "PUT", token: o.token, body: { baseUrl: "http://logs.test", apiKey: "k", service: "svc" } });
    ob = (await s.call("/v1/onboarding", { token: o.token })).data;
    assert.match(step(ob, "log_source").detail, /not tested/);
    assert.equal((await s.call("/v1/log-source/test", { method: "POST", token: o.token })).data.ok, true);
    ob = (await s.call("/v1/onboarding", { token: o.token })).data;
    assert.equal(step(ob, "log_source").status, "done");
    assert.equal(step(ob, "logs_shipped").status, "done");

    assert.equal(step(ob, "business_profile").status, "todo");
    assert.match(step(ob, "business_profile").detail, /description.*hours.*contact/);
    assert.equal((await s.call("/v1/business-profile", { method: "PUT", token: o.token, body: goodProfile })).status, 200);
    assert.equal(step((await s.call("/v1/onboarding", { token: o.token })).data, "business_profile").status, "done");

    for (let i = 0; i < 4; i += 1) await s.call("/v1/faqs", { method: "POST", token: o.token, body: { question: `Question number ${i}?`, answer: "An answer." } });
    assert.equal(step((await s.call("/v1/onboarding", { token: o.token })).data, "knowledge").status, "todo");
    await s.call("/v1/faqs", { method: "POST", token: o.token, body: { question: "Question number 4?", answer: "An answer." } });
    assert.equal(step((await s.call("/v1/onboarding", { token: o.token })).data, "knowledge").status, "done");

    await s.call("/v1/identity/tokens", { method: "POST", token: o.token, body: { userId: "usr_ama" } });
    ob = (await s.call("/v1/onboarding", { token: o.token })).data;
    assert.equal(step(ob, "identity").status, "done");
    assert.equal(ob.readyForLive, false, "the customer test is still missing");
    assert.equal(step(ob, "live").status, "blocked");
  } finally { await s.close(); }
});

test("test-as-a-customer runs the real pipeline but leaves no trace in lists, analytics or notifications", async () => {
  const { s, cls } = await setup();
  try {
    const o = await s.register("Acme", undefined, { live: false });
    await s.call("/v1/log-source", { method: "PUT", token: o.token, body: { baseUrl: "http://logs.test", apiKey: "k", service: "svc" } });
    const hook = await s.call("/v1/webhooks", { method: "POST", token: o.token, body: { url: "https://hooks.example.com/x", events: ["ticket.created", "conversation.handoff"] } });
    assert.equal(hook.status, 201);
    const sent = [];
    s.ctx.webhooks.emit = (...a) => sent.push(a); // would fire if the test run notified
    const r = await s.call("/v1/onboarding/test", { method: "POST", token: o.token, body: { userId: "usr_ama", message: "My MoMo payment failed" } });
    assert.equal(r.status, 200);
    assert.equal(r.data.verified, true);
    assert.equal(r.data.rootCause.citedLines[0], "L1");
    assert.deepEqual(sent, [], "no webhook for a test run");
    assert.ok(cls.calls.some((u) => new URL(u).searchParams.get("userId") === "usr_ama"));
    assert.equal((await s.call("/v1/conversations", { token: o.token })).data.data.length, 0);
    assert.equal((await s.call("/v1/tickets", { token: o.token })).data.data.length, 0);
    const a = (await s.call("/v1/analytics/summary", { token: o.token })).data;
    assert.equal(a.conversations, 0);
    assert.equal(a.topRootCauses.length, 0);
    assert.equal(a.ticketsNeedingHuman, 0);
    const audit = (await s.call("/v1/audit", { token: o.token })).data.data;
    assert.ok(audit.some((e) => e.action === "log_lookup" && e.detail.test === true), "the lookup itself is still audited, marked as a test");
    assert.ok(audit.some((e) => e.action === "onboarding_test"));
    assert.equal(step((await s.call("/v1/onboarding", { token: o.token })).data, "test").status, "done");
    // validation and authorisation
    assert.equal((await s.call("/v1/onboarding/test", { method: "POST", token: o.token, body: { message: "hi" } })).status, 400);
    assert.equal((await s.call("/v1/onboarding/test", { method: "POST", token: o.token, body: { userId: "u" } })).status, 400);
    const agent = await s.addMember(o, "agent");
    assert.equal((await s.call("/v1/onboarding/test", { method: "POST", token: agent.token, body: { userId: "u", message: "hi" } })).status, 403);
    assert.equal((await s.call("/v1/onboarding", { token: agent.token })).status, 200, "agents may read the checklist");
  } finally { await s.close(); }
});

test("go-live is refused until the required steps are done, then switches the AI on; pause always works", async () => {
  const { s } = await setup();
  try {
    const o = await s.register("Acme", undefined, { live: false });
    const early = await s.call("/v1/onboarding/go-live", { method: "POST", token: o.token });
    assert.equal(early.status, 409);
    assert.equal(early.data.error.code, "not_ready");
    assert.match(early.data.error.message, /Connect the log source/);
    const viaPatch = await s.call("/v1/workspace", { method: "PATCH", token: o.token, body: { settings: { aiLive: true } } });
    assert.equal(viaPatch.status, 409, "the settings switch obeys the same gate");
    assert.equal(s.repo.getWorkspace(o.ws).settings.aiLive, false);

    await s.call("/v1/log-source", { method: "PUT", token: o.token, body: { baseUrl: "http://logs.test", apiKey: "k", service: "svc" } });
    await s.call("/v1/log-source/test", { method: "POST", token: o.token });
    await s.call("/v1/business-profile", { method: "PUT", token: o.token, body: goodProfile });
    await s.call("/v1/knowledge", { method: "POST", token: o.token, body: { title: "Delivery", text: "Delivery takes one to three working days within Accra." } });
    await s.call("/v1/identity/tokens", { method: "POST", token: o.token, body: { userId: "usr_ama" } });
    assert.equal((await s.call("/v1/onboarding/test", { method: "POST", token: o.token, body: { userId: "usr_ama", message: "My MoMo payment failed" } })).status, 200);

    const live = await s.call("/v1/onboarding/go-live", { method: "POST", token: o.token });
    assert.equal(live.status, 200);
    assert.equal(live.data.live, true);
    assert.equal(live.data.completed, 9 - 1, "the optional channel step is still open");
    assert.ok((await s.call("/v1/audit?action=ai_live_changed", { token: o.token })).data.data.length >= 1);
    const paused = await s.call("/v1/onboarding/pause", { method: "POST", token: o.token });
    assert.equal(paused.data.live, false);
    assert.equal(step(paused.data, "live").status, "todo", "ready again, so going live is one click");
    assert.equal((await s.call("/v1/workspace", { method: "PATCH", token: o.token, body: { settings: { aiLive: true } } })).status, 200);
    assert.equal((await s.call("/v1/workspace", { method: "PATCH", token: o.token, body: { settings: { aiLive: false } } })).status, 200, "pausing is never gated");
  } finally { await s.close(); }
});

test("a failed log test or a broken customer test keeps the steps open", async () => {
  const { s } = await setup({ rows: [logRow(undefined, { metadata: {} })] });
  try {
    const o = await s.register("Acme", undefined, { live: false });
    await s.call("/v1/log-source", { method: "PUT", token: o.token, body: { baseUrl: "http://logs.test", apiKey: "k", service: "svc" } });
    const t = await s.call("/v1/log-source/test", { method: "POST", token: o.token });
    assert.equal(t.data.issues[0].code, "no_user_id");
    const ob = (await s.call("/v1/onboarding", { token: o.token })).data;
    assert.equal(step(ob, "logs_shipped").status, "their_side");
    assert.match(step(ob, "logs_shipped").detail, /metadata\.userId/);
    assert.equal(step(ob, "log_source").status, "todo");
  } finally { await s.close(); }
});

test("business profile: validation, defaults, roles, audit, isolation", async () => {
  const { s } = await setup();
  try {
    const a = await s.register("Alpha");
    const b = await s.register("Beta");
    const def = (await s.call("/v1/business-profile", { token: a.token })).data;
    assert.equal(def.name, "Alpha");
    assert.equal(def.tone, "friendly");
    assert.equal(def.updatedAt, null);
    for (const patch of [{ name: "" }, { tone: "angry" }, { contactEmail: "nope" }, { website: "ftp://x" }, { languages: ["xx"] }, { timezone: "Mars/Base" }, { escalation: { email: "bad" } }, { about: "x".repeat(1001) }]) {
      assert.equal((await s.call("/v1/business-profile", { method: "PUT", token: a.token, body: { ...goodProfile, ...patch } })).status, 400, JSON.stringify(patch).slice(0, 40));
    }
    const saved = (await s.call("/v1/business-profile", { method: "PUT", token: a.token, body: { ...goodProfile, about: `${goodProfile.about} Write to ama@secret.example for anything.` } })).data;
    assert.ok(!saved.about.includes("ama@secret.example"), "personal data is scrubbed from company text");
    assert.ok(saved.updatedAt);
    assert.equal((await s.call("/v1/business-profile", { token: b.token })).data.name, "Beta", "other workspace unaffected");
    const agent = await s.addMember(a, "agent");
    assert.equal((await s.call("/v1/business-profile", { token: agent.token })).status, 200);
    assert.equal((await s.call("/v1/business-profile", { method: "PUT", token: agent.token, body: goodProfile })).status, 403);
    assert.equal((await s.call("/v1/audit?action=business_profile_changed", { token: a.token })).data.data.length, 1);
  } finally { await s.close(); }
});

test("FAQ: CRUD, validation, duplicates, pagination, CSV import, limits, isolation", async () => {
  const { s } = await setup();
  try {
    const a = await s.register("Alpha");
    const b = await s.register("Beta");
    const create = (body, tok = a.token) => s.call("/v1/faqs", { method: "POST", token: tok, body });
    const f1 = await create({ question: "How long is delivery?", answer: "One to three days.", tags: ["Delivery", "delivery"] });
    assert.equal(f1.status, 201);
    assert.deepEqual(f1.data.tags, ["delivery"]);
    assert.equal((await create({ question: "how long is DELIVERY?", answer: "x" })).status, 409);
    for (const bad of [{ question: "hi", answer: "x" }, { question: "A fine question", answer: "" }, { question: "A fine question", answer: "x".repeat(1001) }, { question: "A fine question", answer: "x", language: "xx" }, { question: "A fine question", answer: "x", tags: "a" }, { question: "A fine question", answer: "x", enabled: "yes" }]) {
      assert.equal((await create(bad)).status, 400, JSON.stringify(bad).slice(0, 50));
    }
    const upd = await s.call(`/v1/faqs/${f1.data.id}`, { method: "PUT", token: a.token, body: { answer: "Two days.", enabled: false } });
    assert.equal(upd.data.answer, "Two days.");
    assert.equal(upd.data.enabled, false);
    assert.equal(upd.data.question, "How long is delivery?", "partial update keeps the rest");
    assert.equal((await s.call("/v1/faqs?enabled=false", { token: a.token })).data.data.length, 1);
    assert.equal((await s.call("/v1/faqs?enabled=true", { token: a.token })).data.data.length, 0);
    for (let i = 0; i < 4; i += 1) await create({ question: `Another question ${i}?`, answer: "ok" });
    const p1 = (await s.call("/v1/faqs?limit=3", { token: a.token })).data;
    assert.equal(p1.data.length, 3);
    const p2 = (await s.call(`/v1/faqs?limit=3&cursor=${p1.nextCursor}`, { token: a.token })).data;
    assert.equal(p2.data.length, 2);
    assert.equal(p2.nextCursor, null);
    assert.equal((await s.call("/v1/faqs?q=Another%20question%202", { token: a.token })).data.data.length, 1);

    const csv = 'question,answer,language,tags\n"Do you ship to Kumasi, Tamale?","Yes, 3 to 6 days.",en,"delivery;regions"\nHow long is delivery?,dup,en,\n,,,\nBad lang,ok,zz,\n';
    const imp = await s.call("/v1/faqs/import", { method: "POST", token: a.token, body: { filename: "faq.csv", contentBase64: Buffer.from(csv).toString("base64") } });
    assert.equal(imp.data.created, 1);
    assert.equal(imp.data.skipped, 1);
    assert.deepEqual(imp.data.errors.map((e) => e.row), [4], "blank rows are ignored; `row` counts non-empty rows with the header as row 1");
    assert.equal((await s.call("/v1/faqs/import", { method: "POST", token: a.token, body: { filename: "faq.txt", contentBase64: "eA==" } })).status, 400);
    assert.equal((await s.call("/v1/faqs/import", { method: "POST", token: a.token, body: { filename: "f.csv", contentBase64: Buffer.from("a,b\n1,2").toString("base64") } })).data.error.code, "invalid_csv");

    // isolation and roles
    assert.equal((await s.call("/v1/faqs", { token: b.token })).data.data.length, 0);
    assert.equal((await s.call(`/v1/faqs/${f1.data.id}`, { method: "PUT", token: b.token, body: { answer: "pwned" } })).status, 404);
    assert.equal((await s.call(`/v1/faqs/${f1.data.id}`, { method: "DELETE", token: b.token })).status, 404);
    const agent = await s.addMember(a, "agent");
    assert.equal((await s.call("/v1/faqs", { token: agent.token })).status, 200);
    assert.equal((await create({ question: "Agent question?", answer: "no" }, agent.token)).status, 403);
    assert.equal((await s.call(`/v1/faqs/${f1.data.id}`, { method: "DELETE", token: a.token })).status, 204);
    assert.equal((await s.call(`/v1/faqs/${f1.data.id}`, { method: "PUT", token: a.token, body: { answer: "x" } })).status, 404);
  } finally { await s.close(); }
});

test("company details and FAQs reach the assistant as retrievable excerpts, with the tone, and only for the right workspace", async () => {
  const { s, seen } = await setup();
  try {
    const a = await s.register("Alpha");
    const b = await s.register("Beta");
    await s.call("/v1/business-profile", { method: "PUT", token: a.token, body: goodProfile });
    await s.call("/v1/faqs", { method: "POST", token: a.token, body: { question: "Can I pay on delivery?", answer: "Yes, cash on delivery in Accra only." } });
    await s.call("/v1/faqs", { method: "POST", token: a.token, body: { question: "Secret disabled question about warranty?", answer: "Hidden.", enabled: false } });
    const ask = (text, key) => s.call("/v1/support/message", { method: "POST", body: { message: text, publicKey: key } });

    seen.length = 0;
    await ask("Can I pay on delivery in Accra?", a.workspace.publicKey);
    const kb = seen.find((x) => x.system.includes("customer-support assistant"));
    assert.ok(kb.user.includes("Q: Can I pay on delivery?"), "FAQ excerpt offered to the model");
    assert.match(kb.user, /<tone>formal<\/tone>/);

    seen.length = 0;
    await ask("What are your opening hours?", a.workspace.publicKey);
    assert.match(seen.find((x) => x.system.includes("customer-support assistant")).user, /Opening hours: Mon to Sat 8am to 6pm/);

    seen.length = 0;
    await ask("Tell me about the warranty", a.workspace.publicKey);
    assert.ok(!seen.some((x) => x.user.includes("Hidden.")), "disabled FAQs are never offered");

    seen.length = 0;
    await ask("Can I pay on delivery in Accra?", b.workspace.publicKey);
    assert.ok(!seen.some((x) => x.user.includes("cash on delivery")), "another workspace's FAQ never leaks");
    assert.ok(!seen.some((x) => x.user.includes("Mon to Sat")), "...nor its business details");
  } finally { await s.close(); }
});

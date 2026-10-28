"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { boot, makeLlm, makeLanguage, makeCls, logRow } = require("./_helpers");
const { crawl, htmlToText, parseRobots } = require("../src/knowledge-crawler");
const { sign, verify } = require("../src/identity/token");

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const signAsym = (alg, privateKey, claims) => {
  const head = b64u({ alg, typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const body = b64u({ iat: now, exp: now + 600, ...claims });
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), alg === "ES256" ? { key: privateKey, dsaEncoding: "ieee-p1363" } : privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
};
const understand = (t) => (t.toLowerCase().includes("momo") ? { language: "en", english: t, intent: "account_issue", hints: { keywords: ["momo"] } } : { language: "en", english: t, intent: "general_question", hints: {} });
const explain = () => ({ found: true, customer_reply: "Timed out.", root_cause: "Gateway timeout.", cited_lines: ["L1"], confidence: 0.9, suggested_fix: "Retry.", needs_human: false });

test("public-key identity: RS256 and ES256 verify; HS256, none and the wrong key do not; minting is refused", async () => {
  const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const ec = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const cls = makeCls([logRow("usr_ama", { service: "svc" })]);
  const s = await boot({ overrides: { fetchImpl: cls.fetchImpl, llm: makeLlm({ understand, explain }), language: makeLanguage() } });
  try {
    const o = await s.register("Alpha");
    await s.call("/v1/log-source", { method: "PUT", token: o.token, body: { baseUrl: "http://logs.test", apiKey: "k", service: "svc" } });
    const say = (token) => s.call("/v1/support/message", { method: "POST", body: { message: "My MoMo payment failed", token, publicKey: o.workspace.publicKey } });
    const secret = s.ctx.identitySecret(s.repo.getWorkspace(o.ws));
    const hs = sign({ sub: "usr_ama", tenant: o.ws }, secret, { ttlSeconds: 600 });
    assert.equal((await say(hs)).data.verified, true, "shared-secret mode accepts HS256");
    assert.equal((await say(signAsym("RS256", rsa.privateKey, { sub: "usr_ama", tenant: o.ws }))).data.verified, false, "...and rejects RS256");

    const pem = rsa.publicKey.export({ type: "spki", format: "pem" });
    for (const bad of [{ alg: "HS256", publicKeyPem: pem }, { alg: "RS256", publicKeyPem: "junk" }, { alg: "ES256", publicKeyPem: pem }, { alg: "RS256", publicKeyPem: ec.publicKey.export({ type: "spki", format: "pem" }) }, { alg: "RS256", jwksUrl: "https://x.test/jwks" }]) {
      assert.equal((await s.call("/v1/identity/key", { method: "PUT", token: o.token, body: bad })).status, 400, JSON.stringify(bad).slice(0, 40));
    }
    const put = await s.call("/v1/identity/key", { method: "PUT", token: o.token, body: { alg: "RS256", publicKeyPem: pem, kid: "k1" } });
    assert.equal(put.data.mode, "public_key");
    assert.equal((await say(signAsym("RS256", rsa.privateKey, { sub: "usr_ama", tenant: o.ws }))).data.verified, true);
    assert.equal((await say(signAsym("RS256", other.privateKey, { sub: "usr_ama", tenant: o.ws }))).data.verified, false, "signed by another key");
    assert.equal((await say(hs)).data.verified, false, "HS256 is refused in public-key mode");
    // algorithm confusion: HS256 token whose "secret" is the public key text
    assert.equal((await say(sign({ sub: "usr_ama", tenant: o.ws }, pem, { ttlSeconds: 600 }))).data.verified, false);
    const none = `${b64u({ alg: "none" })}.${b64u({ sub: "usr_ama", tenant: o.ws, iat: 1, exp: 9999999999 })}.`;
    assert.equal((await say(none)).data.verified, false);
    assert.equal((await s.call("/v1/identity/tokens", { method: "POST", token: o.token, body: { userId: "u" } })).data.error.code, "public_key_mode");
    // the onboarding test still works (it does not need a token)
    assert.equal((await s.call("/v1/onboarding/test", { method: "POST", token: o.token, body: { userId: "usr_ama", message: "My MoMo payment failed" } })).data.verified, true);

    const ecPut = await s.call("/v1/identity/key", { method: "PUT", token: o.token, body: { alg: "ES256", publicKeyPem: ec.publicKey.export({ type: "spki", format: "pem" }) } });
    assert.equal(ecPut.data.alg, "ES256");
    assert.equal((await say(signAsym("ES256", ec.privateKey, { sub: "usr_ama", tenant: o.ws }))).data.verified, true);
    assert.equal((await say(signAsym("RS256", rsa.privateKey, { sub: "usr_ama", tenant: o.ws }))).data.verified, false, "only the configured algorithm");
    // relay path uses the same rule
    const ch = (await s.call("/v1/channels", { method: "POST", token: o.token, body: { kind: "chatflow", label: "c", externalId: "w1" } })).data;
    const rel = await s.call("/v1/relay/message", { method: "POST", token: ch.relayKey, body: { externalConversationId: "c1", externalVisitorId: "v1", message: "My MoMo payment failed", identityToken: signAsym("ES256", ec.privateKey, { sub: "usr_ama", tenant: o.ws, vid: "v1", aud: "helply" }) } });
    assert.equal(rel.data.verified, true);
    const back = await s.call("/v1/identity/key", { method: "DELETE", token: o.token });
    assert.equal(back.data.mode, "shared_secret");
    assert.equal((await say(hs)).data.verified, true);
    const agent = await s.addMember(o, "agent");
    assert.equal((await s.call("/v1/identity/key", { token: agent.token })).status, 403);
    assert.equal(verify(sign({ sub: "u" }, "s".repeat(32)), "", { publicKey: rsa.publicKey, alg: "RS256" }).ok, false);
  } finally { await s.close(); }
});

test("crawler: text extraction, same-host links, robots.txt, limits, and untrusted markup", async () => {
  assert.equal(htmlToText("<title>Shop &amp; Co</title><script>alert(1)</script><style>x{}</style><p>Hello <b>world</b> we deliver</p><!-- hidden -->").text.includes("alert"), false);
  assert.equal(htmlToText("<title>A &amp; B</title><p>Some text here</p>").title, "A & B");
  assert.equal(parseRobots("User-agent: *\nDisallow: /private\n")("/private/x"), false);
  assert.equal(parseRobots("User-agent: googlebot\nDisallow: /\n")("/x"), true, "rules for other bots do not apply");
  const site = {
    "https://shop.test/": '<title>Home</title><p>Welcome to our shop with plenty of text for the indexer to keep.</p><a href="/delivery">d</a><a href="https://evil.test/x">x</a><a href="/private/secret">s</a><a href="/logo.png">i</a><a href="mailto:a@b.c">m</a>',
    "https://shop.test/delivery": "<title>Delivery</title><p>Delivery takes one to three days within Accra and longer elsewhere.</p><a href='/deep'>deep</a>",
    "https://shop.test/deep": "<title>Deep</title><p>Depth two page with enough text to be kept by the crawler yes.</p><a href='/deeper'>x</a>",
    "https://shop.test/deeper": "<title>Too deep</title><p>Depth three is beyond the limit of the crawler so this is skipped.</p>",
    "https://shop.test/private/secret": "<p>Secret page text that robots forbids us from reading at all.</p>",
    "https://shop.test/robots.txt": "User-agent: *\nDisallow: /private\n",
  };
  const fetched = [];
  const fetchPage = async (u) => { fetched.push(u); return site[u] ? { status: 200, headers: { "content-type": "text/html" }, body: site[u] } : { status: 404, headers: {}, body: "" }; };
  const pages = await crawl("https://shop.test/", { fetchPage });
  assert.deepEqual(pages.map((p) => p.title), ["Home", "Delivery", "Deep"]);
  assert.ok(!fetched.some((u) => u.includes("evil.test") || u.includes("private/secret") || u.endsWith(".png") || u.includes("deeper")));
  assert.equal((await crawl("https://shop.test/", { fetchPage, maxPages: 1 })).length, 1);
  await assert.rejects(() => crawl("https://shop.test/", { fetchPage: async () => { throw Object.assign(new Error("x"), { code: "ECONNREFUSED" }); } }), /x/);
});

test("website indexing: blocked URLs refused, pages become searchable knowledge, reindex and delete clean up, isolation", async () => {
  const pages = {
    "https://shop.example/": '<title>Home</title><p>Welcome. Opening hours are Monday to Saturday from eight until six every week.</p><a href="/returns">r</a>',
    "https://shop.example/returns": "<title>Returns</title><p>Returns are accepted within seven days of delivery for unused items only.</p>",
  };
  const requested = [];
  const crawlPage = async (u) => { requested.push(u); return pages[u] ? { status: 200, headers: { "content-type": "text/html" }, body: pages[u] } : { status: 404, headers: {}, body: "" }; };
  const s = await boot({ env: { ALLOW_INSECURE_WEBHOOKS: "false" }, overrides: { crawlPage } });
  try {
    const a = await s.register("Alpha");
    const b = await s.register("Beta");
    for (const url of ["http://shop.example", "https://127.0.0.1/", "https://169.254.169.254/", "https://localhost/", "file:///etc/passwd", "nonsense"]) {
      assert.equal((await s.call("/v1/knowledge/sites", { method: "POST", token: a.token, body: { url } })).status, 400, url);
    }
    const made = await s.call("/v1/knowledge/sites", { method: "POST", token: a.token, body: { url: "https://shop.example/" } });
    assert.equal(made.status, 201);
    await Promise.all([...s.ctx.jobs]);
    const site = (await s.call("/v1/knowledge/sites", { token: a.token })).data.data[0];
    assert.equal(site.status, "ready");
    assert.equal(site.pages, 2);
    assert.ok(site.lastIndexedAt);
    assert.match(s.repo.retrieve(a.ws, "returns accepted within seven days", 1)[0].text, /seven days/);
    assert.equal(s.repo.retrieve(b.ws, "returns accepted within seven days", 1).length, 0, "other workspace cannot retrieve it");
    assert.equal((await s.call("/v1/knowledge/sites", { token: b.token })).data.data.length, 0);
    assert.equal((await s.call(`/v1/knowledge/sites/${site.id}/reindex`, { method: "POST", token: b.token })).status, 404);
    pages["https://shop.example/returns"] = "<title>Returns</title><p>Returns are now accepted within fourteen days of delivery for all items.</p>";
    await s.call(`/v1/knowledge/sites/${site.id}/reindex`, { method: "POST", token: a.token });
    await Promise.all([...s.ctx.jobs]);
    assert.match(s.repo.retrieve(a.ws, "returns accepted fourteen days", 1)[0].text, /fourteen/);
    assert.equal(s.repo.listKnowledge(a.ws).length, 2, "reindex replaces, never duplicates");
    const agent = await s.addMember(a, "agent");
    assert.equal((await s.call("/v1/knowledge/sites", { token: agent.token })).status, 200);
    assert.equal((await s.call("/v1/knowledge/sites", { method: "POST", token: agent.token, body: { url: "https://x.example" } })).status, 403);
    assert.equal((await s.call(`/v1/knowledge/sites/${site.id}`, { method: "DELETE", token: a.token })).status, 204);
    assert.equal(s.repo.listKnowledge(a.ws).length, 0, "its documents go with it");
    const bad = await s.call("/v1/knowledge/sites", { method: "POST", token: a.token, body: { url: "https://down.example/" } });
    await Promise.all([...s.ctx.jobs]);
    assert.equal((await s.call("/v1/knowledge/sites", { token: a.token })).data.data.find((x) => x.id === bad.data.id).status, "ready", "a 404 site is ready with no pages");
    assert.match((await s.call("/v1/knowledge/sites", { token: a.token })).data.data.find((x) => x.id === bad.data.id).error, /No readable pages/);
  } finally { await s.close(); }
});

test("password reset: always 202, single use, one hour, ends every session, rate limited per account", async () => {
  const sent = [];
  const mailer = { configured: true, send: async (m) => { sent.push(m); return { ok: true }; } };
  const s = await boot({ overrides: { mailer }, env: { RATE_LOGIN_IP: "1000" } });
  try {
    const o = await s.register("Alpha", "owner@acme.test");
    const ask = (email) => s.call("/v1/auth/forgot-password", { method: "POST", body: { email } });
    assert.equal((await ask("nobody@acme.test")).status, 202);
    assert.equal(sent.length, 0, "no email for unknown accounts, and the answer is identical");
    assert.equal((await ask("not-an-email")).status, 400);
    const r = await ask("OWNER@acme.test");
    assert.equal(r.status, 202);
    assert.deepEqual(r.data, { ok: true });
    assert.equal(sent.length, 1);
    const token = /token=(hp_[\w-]+)/.exec(sent[0].text)[1];
    assert.ok(!JSON.stringify(s.repo.db.prepare("SELECT * FROM password_resets").all()).includes(token), "stored hashed");
    assert.equal((await s.call("/v1/auth/reset-password", { method: "POST", body: { token, password: "short" } })).status, 400);
    assert.equal((await s.call("/v1/auth/reset-password", { method: "POST", body: { token: "hp_wrong", password: "a-brand-new-password" } })).data.error.code, "invalid_token");
    assert.equal((await s.call("/v1/auth/me", { token: o.token })).status, 200);
    assert.equal((await s.call("/v1/auth/reset-password", { method: "POST", body: { token, password: "a-brand-new-password" } })).status, 200);
    assert.equal((await s.call("/v1/auth/me", { token: o.token })).status, 401, "existing sessions end");
    assert.equal((await s.call("/v1/auth/reset-password", { method: "POST", body: { token, password: "another-new-password" } })).status, 400, "single use");
    assert.equal((await s.call("/v1/auth/login", { method: "POST", body: { email: "owner@acme.test", password: "correct-horse-battery" } })).status, 401);
    assert.equal((await s.call("/v1/auth/login", { method: "POST", body: { email: "owner@acme.test", password: "a-brand-new-password" } })).status, 200);
    s.repo.db.prepare("UPDATE password_resets SET used_at = NULL, expires_at = ?").run(new Date(Date.now() - 1000).toISOString());
    assert.equal((await s.call("/v1/auth/reset-password", { method: "POST", body: { token, password: "yet-another-password" } })).status, 400, "expired");
    await ask("owner@acme.test"); await ask("owner@acme.test");
    const before = sent.length;
    await ask("owner@acme.test");
    assert.equal(sent.length, before, "at most 3 links per hour");
    assert.ok((await s.call("/v1/audit?action=password_reset", { token: (await s.call("/v1/auth/login", { method: "POST", body: { email: "owner@acme.test", password: "a-brand-new-password" } })).data.session })).data.data.length === 1);
  } finally { await s.close(); }
});

test("customers list and detail; notify-fixed hands the list to a webhook and never messages anyone itself", async () => {
  const cls = makeCls([logRow("usr_ama", { service: "svc" }), logRow("usr_kofi", { service: "svc" })]);
  const s = await boot({ overrides: { fetchImpl: cls.fetchImpl, llm: makeLlm({ understand, explain }), language: makeLanguage() } });
  try {
    const o = await s.register("Alpha");
    const other = await s.register("Beta");
    await s.call("/v1/log-source", { method: "PUT", token: o.token, body: { baseUrl: "http://logs.test", apiKey: "k", service: "svc" } });
    const say = async (u) => s.call("/v1/support/message", { method: "POST", body: { message: "My MoMo payment failed", token: (await s.call("/v1/identity/tokens", { method: "POST", token: o.token, body: { userId: u, name: u } })).data.token } });
    await say("usr_ama"); await say("usr_ama"); await say("usr_kofi");
    s.repo.createTicket(o.ws, { title: "anon", rootCause: { summary: "Gateway timeout.", suggestedFix: "x", citedLines: [], confidence: 1 } }); // a ticket with no customer
    const list = (await s.call("/v1/customers", { token: o.token })).data;
    assert.equal(list.data.length, 2);
    const ama = list.data.find((c) => c.id === "usr_ama");
    assert.equal(ama.conversations, 2);
    assert.equal(ama.tickets, 2);
    assert.equal((await s.call("/v1/customers?q=kofi", { token: o.token })).data.data.length, 1);
    const d = (await s.call("/v1/customers/usr_ama", { token: o.token })).data;
    assert.equal(d.conversationIds.length, 2);
    assert.equal(d.ticketIds.length, 2);
    assert.equal((await s.call("/v1/customers/usr_nobody", { token: o.token })).status, 404);
    assert.equal((await s.call("/v1/customers/usr_ama", { token: other.token })).status, 404);
    assert.equal((await s.call("/v1/customers", { token: other.token })).data.data.length, 0);

    const issue = (await s.call("/v1/issues", { token: o.token })).data.data[0];
    const nf = (body) => s.call(`/v1/issues/${issue.id}/notify-fixed`, { method: "POST", token: o.token, body });
    assert.equal((await nf({ dryRun: true })).data.error.code, "not_fixed");
    await s.call(`/v1/issues/${issue.id}`, { method: "PATCH", token: o.token, body: { status: "fixed" } });
    assert.equal((await nf({})).status, 400, "dryRun must be explicit");
    const dry = (await nf({ dryRun: true })).data;
    assert.deepEqual([dry.affectedCustomers, dry.notified, dry.skipped], [2, 0, 1]);
    assert.equal((await nf({ dryRun: false })).status, 400, "a real send needs wording");
    const hook = await s.call("/v1/webhooks", { method: "POST", token: o.token, body: { url: "https://hooks.example.com/x", events: ["issue.fixed"] } });
    assert.equal(hook.status, 201);
    const emitted = [];
    s.ctx.webhooks.emit = (...a) => emitted.push(a);
    const real = (await nf({ dryRun: false, message: "Fixed. Email ama@x.example if still stuck." })).data;
    assert.equal(real.notified, 2);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0][1], "issue.fixed");
    assert.deepEqual(emitted[0][2].customerIds.sort(), ["usr_ama", "usr_kofi"]);
    assert.ok(!emitted[0][2].message.includes("ama@x.example"));
    assert.equal((await s.call(`/v1/issues/${issue.id}/notify-fixed`, { method: "POST", token: other.token, body: { dryRun: true } })).status, 404);
    const agent = await s.addMember(o, "agent");
    assert.equal((await s.call(`/v1/issues/${issue.id}/notify-fixed`, { method: "POST", token: agent.token, body: { dryRun: true } })).status, 403);
  } finally { await s.close(); }
});

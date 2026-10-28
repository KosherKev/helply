"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { boot } = require("./_helpers");
const { isBlockedIp, validateWebhookUrl, safeLookup, postJson } = require("../src/webhooks/ssrf");
const { createWebhookService, sign } = require("../src/webhooks/service");

test("SSRF: private, loopback, link-local, metadata and mapped addresses are blocked; public ones are not", () => {
  for (const ip of ["127.0.0.1", "127.1.2.3", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fd00:ec2::254", "fc00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "64:ff9b::1", "not-an-ip"]) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) assert.equal(isBlockedIp(ip), false, ip);
});

test("SSRF: URL validation rejects http, credentials, local names and numeric tricks", () => {
  for (const u of ["http://hooks.example.com/x", "ftp://hooks.example.com", "https://user:pw@hooks.example.com/x", "https://localhost/x", "https://foo.localhost/x", "https://db.internal/x", "https://127.0.0.1/x", "https://[::1]/x", "https://169.254.169.254/latest/meta-data", "https://2130706433/x", "https://0x7f000001/x", "https://10.1.2.3/x", "not a url", ""]) {
    assert.equal(validateWebhookUrl(u).ok, false, u);
  }
  assert.equal(validateWebhookUrl("https://hooks.example.com/x?y=1").ok, true);
  assert.equal(validateWebhookUrl("http://hooks.example.com/x", { allowHttp: true }).ok, true);
});

test("SSRF: DNS is checked at connect time (rebinding-safe lookup) and redirects are not followed", async () => {
  await assert.rejects(() => new Promise((resolve, reject) => safeLookup("localhost", {}, (e, a) => (e ? reject(e) : resolve(a)))), /not allowed/);
  await assert.rejects(() => postJson("https://localhost/x", "{}"), /not allowed/);
  await assert.rejects(() => postJson("https://169.254.169.254/x", "{}"), /not allowed/);

  // A 302 to an internal address is reported as a plain 302 and never followed.
  const calls = [];
  const requestImpl = (url, opts, cb) => {
    calls.push(String(url));
    const req = new EventEmitter();
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 302;
      res.headers = { location: "http://169.254.169.254/latest" };
      res.destroy = () => {};
      cb(res);
      res.emit("data", Buffer.from("moved"));
      res.emit("end");
    };
    return req;
  };
  const r = await postJson("https://hooks.example.com/x", "{}", {}, { requestImpl, lookup: (h, o, cb) => cb(null, "93.184.216.34", 4) });
  assert.equal(r.status, 302);
  assert.deepEqual(calls, ["https://hooks.example.com/x"]);
});

test("signature is HMAC-SHA256 over timestamp.body and verifiable by the receiver", async () => {
  const sent = [];
  const send = async (url, body, headers) => { sent.push({ url, body, headers }); return { status: 200, body: "ok" }; };
  const s = await boot({ overrides: { webhooks: undefined } });
  try {
    const o = await s.register();
    const svc = createWebhookService({ repo: s.repo, vault: s.ctx.vault, send });
    const created = (await s.call("/v1/webhooks", { method: "POST", token: o.token, body: { url: "https://hooks.example.com/in", events: ["ticket.created"] } })).data;
    assert.ok(created.secret.startsWith("whsec_"));
    const hook = s.repo.getWebhook(o.ws, created.id);
    const out = await svc.deliver(o.ws, hook, "ticket.created", { ticket: { id: "T-1" } });
    assert.equal(out.ok, true);
    const { body, headers } = sent[0];
    const expected = `sha256=${crypto.createHmac("sha256", created.secret).update(`${headers["X-Helply-Timestamp"]}.${body}`).digest("hex")}`;
    assert.equal(headers["X-Helply-Signature"], expected);
    assert.equal(sign(created.secret, headers["X-Helply-Timestamp"], body), expected);
    assert.equal(JSON.parse(body).event, "ticket.created");
  } finally { await s.close(); }
});

test("webhook API: unsafe URLs refused, secret shown once, test delivery logged, retries recorded", async () => {
  const attempts = [];
  let failures = 2;
  const send = async (url, body, headers) => {
    attempts.push(headers["X-Helply-Event"]);
    if (failures > 0) { failures -= 1; return { status: 500, body: "boom" }; }
    return { status: 204, body: "" };
  };
  const timers = [];
  const s = await boot({ env: { ALLOW_INSECURE_WEBHOOKS: "false" } });
  try {
    const o = await s.register();
    for (const url of ["http://hooks.example.com/x", "https://127.0.0.1/x", "https://169.254.169.254/x", "https://localhost/x", "https://10.0.0.5/x", "https://user:pw@hooks.example.com/"]) {
      const r = await s.call("/v1/webhooks", { method: "POST", token: o.token, body: { url, events: ["ticket.created"] } });
      assert.equal(r.status, 400, url);
      assert.equal(r.data.error.code, "unsafe_webhook_url");
    }
    assert.equal((await s.call("/v1/webhooks", { method: "POST", token: o.token, body: { url: "https://hooks.example.com/x", events: ["nope"] } })).status, 400);
    const ok = await s.call("/v1/webhooks", { method: "POST", token: o.token, body: { url: "https://hooks.example.com/x", events: ["ticket.created", "ticket.needs_human"] } });
    assert.equal(ok.status, 201);
    const list = (await s.call("/v1/webhooks", { token: o.token })).data.data;
    assert.ok(!JSON.stringify(list).includes(ok.data.secret), "the secret is not listed again");

    const svc = createWebhookService({ repo: s.repo, vault: s.ctx.vault, send, retryDelaysMs: [1, 1, 1], schedule: (fn) => { timers.push(fn); return { unref() {} }; } });
    const hook = s.repo.getWebhook(o.ws, ok.data.id);
    const first = await svc.deliver(o.ws, hook, "ticket.created", {});
    assert.equal(first.ok, false);
    while (timers.length) await timers.shift()();
    const deliveries = (await s.call(`/v1/webhooks/${ok.data.id}/deliveries`, { token: o.token })).data.data;
    assert.equal(deliveries[0].status, "delivered");
    assert.equal(deliveries[0].attempts, 3);
    assert.equal(attempts.length, 3);

    // the real test endpoint goes through the SSRF-safe sender: example.com is not reachable here, but must fail cleanly
    const t = await s.call(`/v1/webhooks/${ok.data.id}/test`, { method: "POST", token: o.token });
    assert.equal(t.status, 200);
    assert.equal(typeof t.data.ok, "boolean");
  } finally { await s.close(); }
});

test("DNS rebinding: a public-looking host that resolves to a private address is refused at connect time", async () => {
  const dns = require("node:dns");
  const real = dns.lookup;
  try {
    dns.lookup = (host, opts, cb) => cb(null, [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.7", family: 4 }]); // one public, one private answer
    await assert.rejects(() => postJson("https://rebinding.example.test/x", "{}"), /not allowed/);
    dns.lookup = (host, opts, cb) => cb(null, [{ address: "fd00:ec2::254", family: 6 }]);
    await assert.rejects(() => postJson("https://rebinding.example.test/x", "{}"), /not allowed/);
  } finally {
    dns.lookup = real;
  }
});

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { sign, verify } = require("../src/identity/token");

const SECRET = "test-secret-test-secret-test-secret";
const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);

test("a freshly signed token verifies and exposes only the verified user id", () => {
  const t = sign({ sub: "usr_1", name: "Ama" }, SECRET, { now: NOW });
  const r = verify(t, SECRET, { now: NOW + 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.claims.userId, "usr_1");
  assert.equal(r.claims.name, "Ama");
});

test("rejects a wrong secret, tampered payload, expired and over-long tokens", () => {
  const t = sign({ sub: "usr_1" }, SECRET, { now: NOW, ttlSeconds: 900 });
  assert.equal(verify(t, "other-secret", { now: NOW }).reason, "bad_signature");

  const [h, , s] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ sub: "victim", iat: NOW / 1000, exp: NOW / 1000 + 900 })).toString("base64url");
  assert.equal(verify(`${h}.${forged}.${s}`, SECRET, { now: NOW }).reason, "bad_signature");

  assert.equal(verify(t, SECRET, { now: NOW + 901_000 }).reason, "expired");

  const long = sign({ sub: "usr_1" }, SECRET, { now: NOW, ttlSeconds: 86_400 });
  assert.equal(verify(long, SECRET, { now: NOW, maxAgeSeconds: 900 }).reason, "lifetime_too_long");
});

test("rejects alg=none and missing subject", () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "victim", iat: NOW / 1000, exp: NOW / 1000 + 60 })}.`;
  assert.equal(verify(none, SECRET, { now: NOW }).reason, "bad_algorithm");

  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iat: NOW / 1000, exp: NOW / 1000 + 60 });
  const sig = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  assert.equal(verify(`${head}.${body}.${sig}`, SECRET, { now: NOW }).reason, "missing_subject");
});

test("garbage and unconfigured secret fail closed", () => {
  assert.equal(verify("not-a-token", SECRET).ok, false);
  assert.equal(verify(undefined, SECRET).ok, false);
  assert.equal(verify(sign({ sub: "u" }, SECRET), "").reason, "not_configured");
});

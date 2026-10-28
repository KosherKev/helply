"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { redact, scrubString } = require("../src/logs/redact");

test("sensitive keys are redacted at any depth", () => {
  const out = redact({ user: "ama", password: "hunter2", headers: { authorization: "Bearer abcdefghijkl", "x-api-key": "k" }, nested: { momoPin: "1234", businessName: "Kofi Ventures" } });
  assert.equal(out.password, "[REDACTED]");
  assert.equal(out.headers.authorization, "[REDACTED]");
  assert.equal(out.headers["x-api-key"], "[REDACTED]");
  assert.equal(out.nested.momoPin, "[REDACTED]");
  assert.equal(out.nested.businessName, "Kofi Ventures"); // not a false positive
  assert.equal(out.user, "ama");
});

test("secrets and personal data inside strings are scrubbed", () => {
  const s = scrubString("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk mail ama@example.com phone 0241234567 and +233 24 123 4567 key sk_live_abcdef123456");
  assert.ok(!s.includes("eyJhbGci"));
  assert.ok(!s.includes("ama@example.com"));
  assert.ok(!s.includes("0241234567"));
  assert.ok(!s.includes("123 4567"));
  assert.ok(!s.includes("sk_live_abcdef123456"));
});

test("card numbers are redacted only when they pass the Luhn check", () => {
  assert.match(scrubString("card 4111 1111 1111 1111 ok"), /\[card\]/);
  assert.equal(scrubString("epoch 1730123456789"), "epoch 1730123456789");
});

test("output is bounded and does not mutate the input", () => {
  const input = { body: "x".repeat(5000), list: Array.from({ length: 100 }, (_, i) => i) };
  const out = redact(input);
  assert.ok(out.body.length <= 401);
  assert.equal(out.list.length, 20);
  assert.equal(input.list.length, 100);
});

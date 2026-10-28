"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildEvidence, sanitizeHints } = require("../src/logs/evidence");

const cls = { baseUrl: "http://cls.test", apiKey: "read-key", service: "demo-shop-api" };
let n = 0;
const log = (o = {}) => ({
  _id: `id${(n += 1)}`,
  timestamp: new Date(Date.UTC(2026, 9, 28, 11, 0, n)).toISOString(),
  level: "info",
  service: "demo-shop-api",
  traceId: "trace-abc123",
  metadata: { userId: "u1" },
  ...o,
});
const fakeFetch = (rows, calls = []) => async (url) => {
  calls.push(String(url));
  return { ok: true, status: 200, json: async () => ({ data: rows }) };
};
const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);

test("rows for other users or other services are dropped even if the source returns them", async () => {
  const rows = [log({ level: "error", statusCode: 504 }), log({ metadata: { userId: "someone-else" }, level: "error" }), log({ service: "other-api" })];
  const ev = await buildEvidence({ cls, userId: "u1", hints: {}, now: NOW, fetchImpl: fakeFetch(rows) });
  assert.equal(ev.lines.length, 1);
  assert.equal(ev.meta.droppedForScope, 2);
});

test("scope comes from the verified identity and server config, never from model hints", async () => {
  const calls = [];
  await buildEvidence({ cls, userId: "u1", hints: { userId: "victim", service: "payments", traceId: "trace-zzz999" }, now: NOW, fetchImpl: fakeFetch([], calls) });
  assert.ok(calls.length >= 1);
  for (const c of calls) {
    assert.match(c, /userId=u1/);
    assert.match(c, /service=demo-shop-api/);
    assert.doesNotMatch(c, /victim/);
  }
});

test("evidence is redacted before it can reach a model", async () => {
  const rows = [
    log({
      level: "error",
      statusCode: 500,
      path: "/api/users/0241234567/pay",
      error: { message: "failed for ama@example.com", code: "X" },
      response: { body: { error: "BAD", token: "abc.def.ghi", note: "call 0241234567" } },
    }),
  ];
  const ev = await buildEvidence({ cls, userId: "u1", hints: {}, now: NOW, fetchImpl: fakeFetch(rows) });
  const dump = JSON.stringify(ev.lines);
  assert.ok(!dump.includes("ama@example.com"));
  assert.ok(!dump.includes("0241234567"));
  assert.ok(!dump.includes("abc.def.ghi"));
  assert.ok(dump.includes("[REDACTED]"));
});

test("errors rank first, ids are L1..Ln, and the pack is capped", async () => {
  const rows = [...Array.from({ length: 40 }, () => log()), log({ level: "error", statusCode: 504, path: "/api/payments/momo" })];
  const ev = await buildEvidence({ cls, userId: "u1", hints: { keywords: ["momo"] }, now: NOW, maxLines: 10, fetchImpl: fakeFetch(rows) });
  assert.equal(ev.lines.length, 10);
  assert.ok(ev.lines.some((l) => l.status === 504), "the error line must survive the cap");
  assert.deepEqual(ev.lines.map((l) => l.id), Array.from({ length: 10 }, (_, i) => `L${i + 1}`));
});

test("hints are validated and clamped", () => {
  const h = sanitizeHints({ timeWindowMinutes: 99999, keywords: ["momo", "<script>", "a", "x".repeat(60), "ok", "four", "five"], statusCode: 9999, traceId: "bad id!" });
  assert.equal(h.windowMinutes, 1440);
  assert.deepEqual(h.keywords, ["momo", "script", "ok"]);
  assert.equal(h.statusCode, null);
  assert.equal(h.traceId, null);
  assert.equal(sanitizeHints(null).windowMinutes, 180);
});

test("a userId is required", async () => {
  await assert.rejects(() => buildEvidence({ cls, userId: "", hints: {}, now: NOW, fetchImpl: fakeFetch([]) }));
});

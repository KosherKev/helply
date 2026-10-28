"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildApp } = require("../src/server");
const { load } = require("../src/config");
const { verify } = require("../src/identity/token");

const SECRET = "server-test-secret-server-test-secret";
const fakeLlm = (configured = true) => ({
  model: "fake",
  isConfigured: () => configured,
  generate: async ({ system }) => (system.includes("analyse ONE") ? { text: "", json: { language: "en", english: "hi", intent: "general_question", hints: {} } } : { text: "[[NO_ANSWER]]", json: null }),
});

const start = async (env, overrides = {}) => {
  const app = buildApp(load({ HELPLY_JWT_SECRET: SECRET, ...env }), { llm: fakeLlm(), ...overrides });
  const srv = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
};
const json = (base, path, init = {}) =>
  fetch(`${base}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) }, body: init.body ? JSON.stringify(init.body) : undefined });

test("health, config and CORS", async () => {
  const s = await start({ DEMO_MODE: "true", CORS_ORIGIN: "http://localhost:5173" });
  try {
    assert.equal((await json(s.base, "/health")).status, 200);
    const cfg = await (await json(s.base, "/v1/config")).json();
    assert.equal(cfg.demoMode, true);
    assert.ok(cfg.demoUsers.length >= 2);
    assert.ok(cfg.languages.some((l) => l.code === "tw"));
    const pre = await fetch(`${s.base}/v1/support/message`, { method: "OPTIONS" });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), "http://localhost:5173");
  } finally { await s.close(); }
});

test("demo token exists only in demo mode and verifies against the shared secret", async () => {
  const demo = await start({ DEMO_MODE: "true" });
  try {
    const r = await json(demo.base, "/v1/demo/token", { method: "POST", body: { userId: "usr_demo_ama" } });
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.equal(verify(body.token, SECRET).claims.userId, "usr_demo_ama");
    assert.equal((await json(demo.base, "/v1/demo/token", { method: "POST", body: { userId: "nobody" } })).status, 400);
  } finally { await demo.close(); }

  const prod = await start({ DEMO_MODE: "false", CONSOLE_KEY: "ck" });
  try {
    assert.equal((await json(prod.base, "/v1/demo/token", { method: "POST", body: { userId: "usr_demo_ama" } })).status, 404);
  } finally { await prod.close(); }
});

test("support endpoint fails closed when no model is configured, and works when it is", async () => {
  const off = await start({ DEMO_MODE: "true" }, { llm: fakeLlm(false) });
  try {
    const r = await json(off.base, "/v1/support/message", { method: "POST", body: { message: "hello" } });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error.code, "llm_not_configured");
  } finally { await off.close(); }

  const on = await start({ DEMO_MODE: "true" });
  try {
    const r = await json(on.base, "/v1/support/message", { method: "POST", body: { message: "hello there" } });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.verified, false);
    assert.ok(Array.isArray(body.trace));
    assert.equal((await json(on.base, "/v1/support/message", { method: "POST", body: { message: "" } })).status, 400);
  } finally { await on.close(); }
});

test("console endpoints require the console key outside demo mode", async () => {
  const s = await start({ DEMO_MODE: "false", CONSOLE_KEY: "s3cret-console-key" });
  try {
    assert.equal((await json(s.base, "/v1/tickets")).status, 401);
    assert.equal((await json(s.base, "/v1/tickets", { headers: { "X-Console-Key": "wrong" } })).status, 401);
    assert.equal((await json(s.base, "/v1/tickets", { headers: { "X-Console-Key": "s3cret-console-key" } })).status, 200);
  } finally { await s.close(); }

  const closed = await start({ DEMO_MODE: "false" });
  try {
    // v1.1: with no console key and no credential there is simply no access (401), not a 503.
    assert.equal((await json(closed.base, "/v1/tickets")).status, 401);
  } finally { await closed.close(); }
});

test("knowledge base: add, list, delete, and validation", async () => {
  const s = await start({ DEMO_MODE: "true" });
  try {
    const before = (await (await json(s.base, "/v1/knowledge")).json()).documents.length;
    const add = await json(s.base, "/v1/knowledge", { method: "POST", body: { title: "Warranty", text: "All electronics carry a twelve month warranty from the date of purchase." } });
    assert.equal(add.status, 201);
    const doc = await add.json();
    assert.equal((await (await json(s.base, "/v1/knowledge")).json()).documents.length, before + 1);
    assert.equal((await json(s.base, `/v1/knowledge/${doc.id}`, { method: "DELETE" })).status, 204);
    assert.equal((await json(s.base, "/v1/knowledge", { method: "POST", body: { text: "short" } })).status, 400);
    assert.equal((await json(s.base, "/v1/nope")).status, 404);
  } finally { await s.close(); }
});

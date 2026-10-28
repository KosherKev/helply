"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createGemma } = require("../src/llm/gemma");

const ok = (text, extra = {}) => ({ ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text }] }, finishReason: "STOP", ...extra }] }) });
const bad = (status, msg) => ({ ok: false, status, text: async () => JSON.stringify({ error: { message: msg } }) });
const make = (responses, opts = {}) => {
  const bodies = [];
  const fetchImpl = async (url, init) => { bodies.push(JSON.parse(init.body)); return responses.shift(); };
  return { bodies, llm: createGemma({ apiKey: "AIzaFAKEKEYFAKEKEYFAKEKEYFAKEKEY1", model: "gemma-4-31b-it", fetchImpl, ...opts }) };
};

test("requests minimal thinking by default and ignores thought parts in the answer", async () => {
  const { llm, bodies } = make([ok("ready")]);
  const r = await llm.generate({ system: "s", user: "u", maxOutputTokens: 16 });
  assert.equal(r.text, "ready");
  assert.deepEqual(bodies[0].generationConfig.thinkingConfig, { thinkingLevel: "minimal" });
  assert.equal(bodies[0].systemInstruction.parts[0].text, "s");
});

test("thinking can be disabled by config", async () => {
  const { llm, bodies } = make([ok("x")], { thinkingLevel: "" });
  await llm.generate({ user: "u" });
  assert.equal(bodies[0].generationConfig.thinkingConfig, undefined);
});

test("a 400 steps down: first without thinkingConfig, then inline without system or JSON mode", async () => {
  const { llm, bodies } = make([bad(400, "Thinking level is not supported"), bad(400, "no system instruction"), ok('{"a":1}')]);
  const r = await llm.generate({ system: "S", user: "U", json: true });
  assert.deepEqual(r.json, { a: 1 });
  assert.equal(bodies.length, 3);
  assert.equal(bodies[1].generationConfig.thinkingConfig, undefined);
  assert.equal(bodies[1].systemInstruction.parts[0].text, "S");
  assert.equal(bodies[2].systemInstruction, undefined);
  assert.equal(bodies[2].generationConfig.responseMimeType, undefined);
  assert.match(bodies[2].contents[0].parts[0].text, /^S\n\nU$/);
});

test("non-400 errors are not retried; keys never appear in error text", async () => {
  const { llm, bodies } = make([bad(402, "credits depleted for AIzaFAKEKEYFAKEKEYFAKEKEYFAKEKEY1")]);
  await assert.rejects(() => llm.generate({ user: "u" }), (e) => e.status === 402 && !/AIza/.test(e.message));
  assert.equal(bodies.length, 1);
});

test("running out of output budget on reasoning is reported clearly", async () => {
  const empty = { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: "hmm", thought: true }] }, finishReason: "MAX_TOKENS" }] }) };
  const { llm } = make([empty]);
  await assert.rejects(() => llm.generate({ user: "u" }), /whole output budget on reasoning/);
});

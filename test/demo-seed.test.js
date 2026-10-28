"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createStore, DEFAULT_WORKSPACE_ID } = require("../src/store/store");
const { seedDemoData } = require("../src/demo/seedData");
const { buildLogs, seedLogs, logsAreFresh, ensureDemoLogs } = require("../src/demo/seedLogs");
const { boot } = require("./_helpers");

const silent = { log() {}, warn() {} };

test("demo data seeds once into an empty workspace and fills the dashboard", async () => {
  const store = createStore();
  const repo = store.repo;
  assert.equal(seedDemoData({ repo, workspaceId: DEFAULT_WORKSPACE_ID }), true);
  assert.equal(seedDemoData({ repo, workspaceId: DEFAULT_WORKSPACE_ID }), false, "idempotent");
  assert.equal(repo.getBusinessProfile(DEFAULT_WORKSPACE_ID).name, "KwikPay Shop");
  assert.equal(repo.listFaqs(DEFAULT_WORKSPACE_ID).data.length, 5);
  assert.equal(repo.listConversations(DEFAULT_WORKSPACE_ID).data.length, 2);
  assert.equal(repo.listTickets(DEFAULT_WORKSPACE_ID).data.length, 2);
  assert.equal(repo.listIssues(DEFAULT_WORKSPACE_ID).data.length, 1);
  assert.equal(repo.listGaps(DEFAULT_WORKSPACE_ID).data.length, 1);
  assert.equal(repo.inboxCounts(DEFAULT_WORKSPACE_ID).needsHuman, 1);
});

test("the seeded demo data is visible through the real API for the demo owner", async () => {
  const s = await boot({ env: { DEMO_MODE: "true" } });
  try {
    seedDemoData({ repo: s.repo, workspaceId: DEFAULT_WORKSPACE_ID });
    const t = (await s.call("/v1/auth/login", { method: "POST", body: { email: "owner@kwikpay.demo", password: "helply-demo-pass" } })).data.session;
    assert.equal((await s.call("/v1/conversations", { token: t })).data.data.length, 2);
    const ob = (await s.call("/v1/onboarding", { token: t })).data;
    assert.equal(ob.steps.find((x) => x.id === "business_profile").status, "done");
    assert.equal((await s.call("/v1/analytics/summary", { token: t })).data.conversations, 2);
  } finally { await s.close(); }
});

test("log story: Ama has the MoMo failure, Kofi's logs exist, all rows carry metadata.userId and fit the service's schema", () => {
  const logs = buildLogs("svc");
  assert.ok(logs.length >= 30);
  assert.ok(logs.every((l) => l.service === "svc" && l.metadata.userId && !("error" in l && l.error === null)));
  assert.ok(logs.some((l) => l.metadata.userId === "usr_demo_ama" && l.error?.code === "PROVIDER_TIMEOUT"));
  assert.ok(logs.some((l) => l.metadata.userId === "usr_demo_kofi"));
});

test("ensureDemoLogs: skips without keys, leaves fresh logs alone, seeds stale or missing ones, never throws", async () => {
  const posts = [];
  const mk = (newest, { failWrite = false } = {}) => async (url, init = {}) => {
    if (init.method === "POST") { posts.push(JSON.parse(init.body).logs.length); return failWrite ? { ok: false, status: 403, text: async () => "no" } : { ok: true, status: 200 }; }
    return { ok: true, status: 200, json: async () => ({ data: newest ? [{ timestamp: newest }] : [] }) };
  };
  const base = { baseUrl: "http://cls.test", readKey: "r", writeKey: "w", service: "svc", log: silent };
  assert.equal(await ensureDemoLogs({ ...base, writeKey: "" }), "skipped");
  assert.equal(await ensureDemoLogs({ ...base, fetchImpl: mk(new Date().toISOString()) }), "fresh");
  assert.equal(posts.length, 0);
  assert.equal(await ensureDemoLogs({ ...base, fetchImpl: mk(new Date(Date.now() - 5 * 3_600_000).toISOString()) }), "seeded");
  assert.ok(posts.length >= 2 && posts.every((n) => n <= 20), "written in batches of at most 20");
  posts.length = 0;
  assert.equal(await ensureDemoLogs({ ...base, fetchImpl: mk(null) }), "seeded");
  assert.equal(await ensureDemoLogs({ ...base, fetchImpl: mk(null, { failWrite: true }) }), "failed");
  assert.equal(await ensureDemoLogs({ ...base, fetchImpl: async () => { throw new Error("down"); } }), "failed");
  assert.equal(await logsAreFresh({ baseUrl: "http://x", readKey: "r", service: "s", fetchImpl: mk(new Date(Date.now() - 3_600_000).toISOString()), maxAgeMinutes: 90 }), true);
  assert.equal(await seedLogs({ baseUrl: "http://x", writeKey: "w", service: "s", fetchImpl: mk(null) }) >= 30, true);
});

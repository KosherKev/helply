"use strict";
/** Shared test harness: boots the real app on an ephemeral port with an in-memory SQLite database. */
const { buildApp } = require("../src/server");
const { load } = require("../src/config");

const SECRET = "helpers-secret-helpers-secret-helpers";

const makeLlm = ({ understand, explain, kb } = {}) => ({
  model: "fake",
  isConfigured: () => true,
  generate: async ({ system, user }) => {
    if (system.includes("analyse ONE customer-support message")) {
      const text = /<customer_message>([\s\S]*?)<\/customer_message>/.exec(user)?.[1] || "";
      return { text: "", json: understand ? understand(text) : { language: "en", english: text, intent: "general_question", hints: {} } };
    }
    if (system.includes("explain a customer's problem")) return { text: "", json: explain ? explain(user) : null };
    return { text: kb ?? "[[NO_ANSWER]]", json: null };
  },
});

/** Pretends to translate; `bad` makes the back-translation unrelated so the round-trip check flags it. */
const makeLanguage = ({ bad = false } = {}) => ({
  names: { en: "English", tw: "Twi", gaa: "Ga", ee: "Ewe", fat: "Fante", dag: "Dagbani", pcm: "Ghanaian Pidgin" },
  asrCode: (l) => l,
  ttsCode: (l) => l,
  toEnglish: async (t) => ({ text: bad ? "completely unrelated banana words" : String(t).replace(/^\[\w+\] /, ""), provider: "gemma" }),
  fromEnglish: async (t, l) => ({ text: `[${l}] ${t}`, provider: "gemma" }),
});

const logRow = (userId, o = {}) => ({
  _id: Math.random().toString(16).slice(2),
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  level: "error", service: "demo-shop-api", traceId: "trace-abc123", metadata: { userId },
  method: "POST", path: "/api/payments/momo", statusCode: 504, error: { message: "gateway timeout", code: "PROVIDER_TIMEOUT" }, ...o,
});

/** Fake central-logging-service. `leak` ignores the userId filter, like a source that has not shipped it. */
const makeCls = (rows, { leak = false } = {}) => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const uid = new URL(url).searchParams.get("userId");
    const data = leak || !uid ? rows : rows.filter((r) => r.metadata?.userId === uid);
    return { ok: true, status: 200, json: async () => ({ data }) };
  };
  return { fetchImpl, calls };
};

const boot = async ({ env = {}, overrides = {} } = {}) => {
  const config = load({ HELPLY_JWT_SECRET: SECRET, ALLOW_SIGNUP: "true", ALLOW_PRIVATE_LOG_SOURCES: "true", ALLOW_INSECURE_WEBHOOKS: "true", ...env });
  const app = buildApp(config, { llm: makeLlm(), language: makeLanguage(), ...overrides });
  await app.locals.ready;
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = "GET", body, token, headers = {} } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
  const s_repo = () => app.locals.ctx.repo;
  let n = 0;
  /** Registers a new workspace + owner and returns { token, ws, user, workspace }. */
  const register = async (workspaceName = "Acme", email, { live = true } = {}) => {
    n += 1;
    const r = await call("/v1/auth/register", { method: "POST", body: { email: email || `owner${n}-${Math.random().toString(36).slice(2, 6)}@acme.test`, password: "correct-horse-battery", workspaceName } });
    if (r.status !== 201) throw new Error(`register failed ${r.status} ${JSON.stringify(r.data)}`);
    // New workspaces start paused (onboarding gate). Most tests are about the AI itself, so go live directly; pass { live: false } to test onboarding.
    if (live) s_repo().updateWorkspace(r.data.workspace.id, { settings: { aiLive: true } });
    return { token: r.data.session, ws: r.data.workspace.id, workspace: r.data.workspace, user: r.data.user, email: r.data.user.email };
  };
  /** Invites and accepts a member; returns their session token. */
  const addMember = async (owner, role = "agent") => {
    const email = `m${Math.random().toString(36).slice(2, 8)}@acme.test`;
    const inv = await call("/v1/team/invitations", { method: "POST", token: owner.token, body: { email, role } });
    const acc = await call("/v1/auth/accept-invite", { method: "POST", body: { token: inv.data.token, password: "another-long-password", name: role } });
    return { token: acc.data.session, user: acc.data.user, ws: owner.ws };
  };
  return { app, config, base, call, register, addMember, repo: app.locals.ctx.repo, ctx: app.locals.ctx, close: () => new Promise((r) => server.close(r)) };
};

module.exports = { boot, makeLlm, makeLanguage, makeCls, logRow, SECRET };

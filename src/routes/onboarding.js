"use strict";
/** Onboarding checklist, test-as-a-customer, go-live and pause. */
const { HttpError } = require("../errors");
const { sign } = require("../identity/token");

const LANGS = new Set(["en", "tw", "gaa", "ee", "fat", "dag", "pcm"]);

module.exports = (ctx) => {
  const { config, repo, route, ah, auth, llm } = ctx;
  const { guard } = auth;
  const userOnly = (req) => {
    if (req.principal.type === "apikey") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
  };

  route("get", "/v1/onboarding", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    res.json(ctx.onboarding(ctx.wsOf(req)));
  });

  /** A REAL run (real logs, real model) for a chosen customer id, marked as a test so it is invisible to lists, analytics and notifications. */
  route("post", "/v1/onboarding/test", guard({ role: "admin" }), ah(async (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    const { userId, message, language } = req.body || {};
    if (typeof userId !== "string" || !userId.trim() || userId.length > 128) throw new HttpError(400, "invalid_user_id", "userId is required");
    const text = typeof message === "string" ? message.trim() : "";
    if (!text) throw new HttpError(400, "message_required", "A message is required");
    if (text.length > config.limits.maxMessageChars) throw new HttpError(400, "message_too_long", "Message is too long");
    if (!llm.isConfigured()) throw new HttpError(503, "llm_not_configured", "Set GEMMA_API_KEY");
    const w = repo.getWorkspace(ws);
    const secret = ctx.identitySecret(w);
    if (!secret) throw new HttpError(503, "identity_not_configured", "This workspace has no identity secret");
    const visitorId = `onboarding-test-${ws}`;
    const token = sign({ sub: userId.trim(), name: userId.trim(), tenant: w.id, aud: "helply", vid: visitorId }, secret, { ttlSeconds: 120 });
    const { verify } = require("../identity/token");
    const identity = verify(token, secret, { maxAgeSeconds: config.tokenMaxAgeSeconds, visitorId });
    const conv = repo.createConversation(ws, { customerId: userId.trim(), customerName: userId.trim(), language: LANGS.has(language) ? language : "en", isTest: true });
    let result;
    try {
      result = await ctx.core.converse({ workspace: w, identity, token, conv, message: text, languageHint: LANGS.has(language) ? language : undefined, visitorId, test: true });
    } catch (err) {
      repo.recordCustomerTest(ws, { ok: false });
      throw err;
    }
    const ok = result.verified && !result.trace.some((t) => t.error);
    repo.recordCustomerTest(ws, { ok });
    ctx.audit(req, "onboarding_test", { userId: userId.trim(), ok });
    res.json(result);
  }));

  route("post", "/v1/onboarding/go-live", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    const ob = ctx.onboarding(ws);
    if (!ob.live) {
      if (!ob.readyForLive) throw new HttpError(409, "not_ready", `Finish setup first: ${ob.steps.filter((s) => !s.optional && s.id !== "live" && s.status !== "done").map((s) => s.title).join(", ")}`);
      repo.updateWorkspace(ws, { settings: { aiLive: true } });
      ctx.audit(req, "ai_live_changed", { aiLive: true });
    }
    res.json(ctx.onboarding(ws));
  });

  route("post", "/v1/onboarding/pause", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    if (repo.getWorkspace(ws).settings.aiLive) {
      repo.updateWorkspace(ws, { settings: { aiLive: false } });
      ctx.audit(req, "ai_live_changed", { aiLive: false });
    }
    res.json(ctx.onboarding(ws));
  });
};

"use strict";
/** Onboarding checklist, test-as-a-customer, go-live and pause. */
const { HttpError } = require("../errors");

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
    // The test acts as this customer without a token: Helply cannot sign for a company that uses public-key identity, and the point
    // of the test is to exercise logs, knowledge and wording, not the company's signing code (the "identity" step covers that).
    const identity = { ok: true, claims: { userId: userId.trim(), name: userId.trim(), tenant: w.id, exp: Math.floor(Date.now() / 1000) + 120, visitorId: null, jti: null } };
    const visitorId = undefined;
    const token = undefined;
    const conv = repo.createConversation(ws, { customerId: userId.trim(), customerName: userId.trim(), language: LANGS.has(language) ? language : "en", isTest: true });
    let result;
    try {
      result = await ctx.core.converse({ workspace: w, identity, token, conv, message: text, languageHint: LANGS.has(language) ? language : undefined, visitorId, test: true, trustedIdentity: identity });
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

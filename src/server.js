"use strict";
const crypto = require("node:crypto");
const express = require("express");
const { load } = require("./config");
const { createGemma } = require("./llm/gemma");
const { createKhaya } = require("./language/khaya");
const { createLanguageLayer, NAMES } = require("./language");
const { createStore } = require("./store/store");
const { createSupportAgent } = require("./agent/supportAgent");
const { sign } = require("./identity/token");
const { HttpError } = require("./errors");
const { DEMO_USERS, seedDemoKnowledge } = require("./demo/demo");

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

const buildApp = (config = load(), overrides = {}) => {
  const llm = overrides.llm || createGemma({ ...config.gemma });
  const khaya = overrides.khaya || createKhaya({ ...config.khaya });
  const language = overrides.language || createLanguageLayer({ khaya, llm });
  const store = overrides.store || createStore();
  if (config.demoMode && !overrides.store) seedDemoKnowledge(store);
  const agent = overrides.agent || createSupportAgent({ config, llm, language, store });

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "9mb" }));

  app.use((req, res, next) => {
    res.set({
      "Access-Control-Allow-Origin": config.corsOrigin,
      "Access-Control-Allow-Headers": "Content-Type, X-Console-Key",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  });

  // Small in-memory limiter for the public support endpoints.
  const hits = new Map();
  const limiter = (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < 60_000);
    if (recent.length >= 30) return next(new HttpError(429, "rate_limited", "Too many requests, slow down"));
    recent.push(now);
    hits.set(key, recent);
    return next();
  };

  const requireConsole = (req, res, next) => {
    if (config.consoleKey) {
      return safeEqual(req.get("x-console-key") || "", config.consoleKey) ? next() : next(new HttpError(401, "unauthorized", "Console key required"));
    }
    return config.demoMode ? next() : next(new HttpError(503, "console_not_configured", "Set CONSOLE_KEY"));
  };
  const requireLlm = (req, res, next) =>
    llm.isConfigured() ? next() : next(new HttpError(503, "llm_not_configured", "Set GEMMA_API_KEY"));

  app.get("/health", (req, res) => res.json({ ok: true, brand: config.brand }));

  app.get("/v1/config", (req, res) =>
    res.json({
      brand: config.brand,
      demoMode: config.demoMode,
      model: llm.model,
      capabilities: {
        model: llm.isConfigured(),
        languageLayer: khaya.isConfigured() ? "khaya" : "model-fallback",
        voice: khaya.isConfigured(),
        logs: Boolean(config.cls.baseUrl && config.cls.apiKey),
        identity: Boolean(config.jwtSecret),
      },
      languages: Object.entries(NAMES).map(([code, name]) => ({ code, name })),
      demoUsers: config.demoMode ? DEMO_USERS : undefined,
    })
  );

  // Stands in for "the company's backend signs a token for its logged-in user". Demo only.
  app.post("/v1/demo/token", (req, res, next) => {
    if (!config.demoMode) return next(new HttpError(404, "not_found", "Not found"));
    if (!config.jwtSecret) return next(new HttpError(503, "identity_not_configured", "Set HELPLY_JWT_SECRET"));
    const user = DEMO_USERS.find((u) => u.id === req.body?.userId);
    if (!user) return next(new HttpError(400, "unknown_demo_user", "Unknown demo user"));
    const token = sign({ sub: user.id, name: user.name, tenant: "demo-shop" }, config.jwtSecret, { ttlSeconds: config.tokenMaxAgeSeconds });
    return res.json({ token, user, expiresIn: config.tokenMaxAgeSeconds });
  });

  app.post("/v1/support/message", limiter, requireLlm, ah(async (req, res) => {
    const { message, token, language: languageHint } = req.body || {};
    res.json(await agent.handleMessage({ text: message, token, languageHint }));
  }));

  app.post("/v1/support/voice", limiter, requireLlm, ah(async (req, res) => {
    if (!khaya.isConfigured()) throw new HttpError(501, "voice_not_configured", "Set KHAYA_API_KEY");
    const { audioBase64, language: lang = "tw", token } = req.body || {};
    if (typeof audioBase64 !== "string" || !audioBase64) throw new HttpError(400, "audio_required", "audioBase64 is required");
    const audio = Buffer.from(audioBase64, "base64");
    if (!audio.length || audio.length > config.limits.maxAudioBytes) throw new HttpError(400, "audio_size", "Audio must be under 5 MB");
    const transcript = await khaya.transcribe(audio, language.asrCode(lang));
    const result = await agent.handleMessage({ text: transcript, token, languageHint: lang });
    let replyAudio = null;
    try {
      const wav = await khaya.synthesize(result.reply.text, language.ttsCode(result.reply.language));
      replyAudio = { mimeType: "audio/wav", base64: wav.toString("base64") };
    } catch {
      /* text reply is still returned */
    }
    res.json({ transcript, ...result, replyAudio });
  }));

  app.get("/v1/tickets", requireConsole, (req, res) => res.json({ tickets: store.listTickets({ status: req.query.status }) }));
  app.get("/v1/tickets/:id", requireConsole, (req, res, next) => {
    const t = store.getTicket(req.params.id);
    return t ? res.json(t) : next(new HttpError(404, "not_found", "Ticket not found"));
  });
  app.patch("/v1/tickets/:id", requireConsole, (req, res, next) => {
    const t = store.updateTicket(req.params.id, req.body || {});
    return t ? res.json(t) : next(new HttpError(404, "not_found", "Ticket not found"));
  });

  app.get("/v1/knowledge", requireConsole, (req, res) => res.json({ documents: store.listKnowledge() }));
  app.post("/v1/knowledge", requireConsole, (req, res, next) => {
    const { title, text } = req.body || {};
    if (typeof text !== "string" || text.trim().length < 20) return next(new HttpError(400, "text_required", "Provide at least 20 characters of text"));
    return res.status(201).json(store.addKnowledge({ title, text }));
  });
  app.delete("/v1/knowledge/:id", requireConsole, (req, res, next) =>
    store.deleteKnowledge(req.params.id) ? res.sendStatus(204) : next(new HttpError(404, "not_found", "Document not found"))
  );

  app.use((req, res, next) => next(new HttpError(404, "not_found", "Not found")));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err instanceof HttpError ? err.status : err?.type === "entity.too.large" ? 413 : 500;
    if (status === 500) console.error("[helply] unhandled:", err?.name, err?.message);
    res.status(status).json({ error: { code: err.code || (status === 500 ? "internal_error" : "error"), message: status === 500 ? "Something went wrong" : err.message } });
  });

  return app;
};

if (require.main === module) {
  const config = load();
  if (!config.demoMode && !config.consoleKey) console.warn("[helply] CONSOLE_KEY is not set: console endpoints are disabled.");
  buildApp(config).listen(config.port, () => {
    console.log(`[helply] listening on :${config.port}  demo=${config.demoMode}  model=${config.gemma.model}`);
    if (config.demoMode) console.warn("[helply] DEMO_MODE is on. Never run this in production.");
  });
}

module.exports = { buildApp };

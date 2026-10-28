"use strict";

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const trimSlash = (s) => String(s || "").replace(/\/+$/, "");

const load = (env = process.env) => ({
  brand: env.HELPLY_BRAND || "Helply",
  port: num(env.PORT, 8787),
  demoMode: env.DEMO_MODE === "true",
  corsOrigin: env.CORS_ORIGIN || "*",
  consoleKey: env.CONSOLE_KEY || "",
  jwtSecret: env.HELPLY_JWT_SECRET || "",
  tokenMaxAgeSeconds: num(env.TOKEN_MAX_AGE_SECONDS, 900),
  cls: {
    baseUrl: trimSlash(env.CLS_BASE_URL),
    apiKey: env.CLS_API_KEY || "",
    service: env.CLS_SERVICE || "demo-shop-api",
  },
  gemma: {
    apiKey: env.GEMMA_API_KEY || "",
    model: env.GEMMA_MODEL || "gemma-4-31b-it",
    baseUrl: trimSlash(env.GEMMA_BASE_URL) || "https://generativelanguage.googleapis.com",
    timeoutMs: num(env.GEMMA_TIMEOUT_MS, 30000),
  },
  khaya: {
    apiKey: env.KHAYA_API_KEY || "",
    baseUrl: trimSlash(env.KHAYA_BASE_URL) || "https://translation-api.ghananlp.org",
    translatePath: env.KHAYA_TRANSLATE_PATH || "/v1/translate",
  },
  roundTripThreshold: Number(env.ROUND_TRIP_THRESHOLD) > 0 ? Number(env.ROUND_TRIP_THRESHOLD) : 0.4,
  limits: { maxMessageChars: 1000, evidenceLines: 25, logQueryLimit: 50, maxAudioBytes: 5 * 1024 * 1024 },
});

module.exports = { load };

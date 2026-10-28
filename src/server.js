"use strict";
const crypto = require("node:crypto");
const express = require("express");
const { load } = require("./config");
const { createGemma } = require("./llm/gemma");
const { createKhaya } = require("./language/khaya");
const { createLanguageLayer } = require("./language");
const { createStore, DEFAULT_WORKSPACE_ID } = require("./store/store");
const { openDb } = require("./db/db");
const { createSupportAgent } = require("./agent/supportAgent");
const { HttpError } = require("./errors");
const { DEMO_USERS, seedDemoKnowledge } = require("./demo/demo");
const { createVault, hashPassword, randomToken } = require("./security/crypto");
const { createAuth, createLoginGuard, createLimiter } = require("./auth/auth");
const { createBus } = require("./events");
const { createWebhookService } = require("./webhooks/service");
const { createMailer } = require("./mailer");
const { getText } = require("./webhooks/ssrf");
const crypto2 = require("node:crypto");

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const buildApp = (config = load(), overrides = {}) => {
  const llm = overrides.llm || createGemma({ ...config.gemma });
  const khaya = overrides.khaya || createKhaya({ ...config.khaya });
  const language = overrides.language || createLanguageLayer({ khaya, llm });
  const store = overrides.store || createStore({ db: openDb(config.dbPath || ":memory:") });
  const repo = store.repo;
  const fetchImpl = overrides.fetchImpl || fetch;
  // Secrets at rest. Demo mode may fall back to a fixed dev key; anything else must configure one.
  const vault = overrides.vault || createVault(config.encryptionKey || (config.demoMode ? "helply-dev-only-encryption-key" : crypto.randomBytes(32).toString("hex")));
  const bus = createBus();
  const webhooks = overrides.webhooks || createWebhookService({ repo, vault, sendOptions: { allowHttp: config.allowInsecureWebhooks } });
  const auth = createAuth({ repo, config, defaultWorkspaceId: DEFAULT_WORKSPACE_ID });
  const loginGuard = createLoginGuard();
  const agent = overrides.agent || createSupportAgent({ config, llm, language, store, fetchImpl });

  // The default workspace backs single-tenant self-hosting and the demo (env-configured secret and log source).
  const defaultEnabled = config.demoMode || Boolean(config.jwtSecret) || Boolean(config.consoleKey);
  if (config.demoMode && !repo.getWorkspace(DEFAULT_WORKSPACE_ID).name.includes("KwikPay")) {
    repo.db.prepare("UPDATE workspaces SET name = ?, slug = ? WHERE id = ?").run("KwikPay Shop", "demo-shop", DEFAULT_WORKSPACE_ID);
    if (!overrides.store) seedDemoKnowledge(store.forWorkspace(DEFAULT_WORKSPACE_ID));
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(express.json({ limit: "9mb" }));

  app.use((req, res, next) => {
    req.id = crypto.randomUUID();
    res.set({
      "X-Request-Id": req.id,
      "Access-Control-Allow-Origin": config.corsOrigin,
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Console-Key, X-Helply-Public-Key",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Expose-Headers": "X-Request-Id, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  });

  const routes = [];
  const route = (method, path, ...handlers) => {
    routes.push({ method: method.toUpperCase(), path, rule: handlers.map((h) => h.rule).find(Boolean) || null });
    app[method](path, ...handlers);
  };

  const requireLlm = (req, res, next) => (llm.isConfigured() ? next() : next(new HttpError(503, "llm_not_configured", "Set GEMMA_API_KEY")));
  const ipLimiter = (max) => createLimiter({ max, keyFn: (req) => `ip:${req.ip}` });
  const wsLimiter = createLimiter({ max: config.rate.apiPerWorkspacePerMin, keyFn: (req) => (req.principal ? `ws:${req.principal.workspaceId}` : null) });

  const ctx = {
    config, repo, store, vault, llm, khaya, language, agent, bus, webhooks, auth, loginGuard, route, routes, ah, fetchImpl,
    mailer: overrides.mailer || createMailer({ url: config.emailServiceUrl, apiKey: config.emailApiKey }),
    crawlPage: overrides.crawlPage || ((url) => getText(url, { allowHttp: config.allowInsecureWebhooks })),
    jobs: new Set(),
    /** Verification options for a workspace's customer tokens: its public key (public-key mode) or nothing (shared secret). */
    identityVerify: (w) => {
      const k = repo.getIdentityKey(w.id);
      return k.mode === "public_key" && k.publicKeyPem ? { publicKey: crypto2.createPublicKey(k.publicKeyPem), alg: k.alg } : {};
    },
    defaultWorkspaceId: DEFAULT_WORKSPACE_ID, defaultEnabled, requireLlm, ipLimiter, DEMO_USERS, hashPassword, randomToken,
    wsOf: (req) => req.principal.workspaceId,
    audit: (req, action, detail = {}) => {
      const p = req.principal;
      return repo.addAudit(p.workspaceId, { actorType: p.type === "user" ? "user" : p.type, actorId: p.userId || p.keyId || null, action, detail });
    },
    notify: (ws, event, data) => {
      bus.emit(ws, event, data);
      webhooks.emit(ws, event, data);
    },
    /** Workspace identity secret: env-backed for the default workspace, otherwise stored encrypted. */
    identitySecret: (w) => (w.id === DEFAULT_WORKSPACE_ID ? config.jwtSecret : w.identitySecretEnc ? vault.decrypt(w.identitySecretEnc) : ""),
    /** Workspace log source: stored (encrypted key) first, then env for the default workspace, else none (fail closed). */
    logSourceFor: (w) => {
      const src = repo.getLogSource(w.id);
      if (src) return { baseUrl: src.baseUrl, apiKey: vault.decrypt(src.apiKeyEnc), service: src.service };
      return w.id === DEFAULT_WORKSPACE_ID ? config.cls : null;
    },
  };

  app.use(auth.authenticate);

  route("get", "/health", (req, res) => res.json({ ok: true, brand: config.brand }));

  route("get", "/v1/config", (req, res) =>
    res.json({
      brand: config.brand,
      demoMode: config.demoMode,
      signupEnabled: config.allowSignup,
      model: llm.model,
      capabilities: {
        model: llm.isConfigured(),
        languageLayer: khaya.isConfigured() ? "khaya" : "model-fallback",
        voice: khaya.isConfigured(),
        logs: Boolean(config.cls.baseUrl && config.cls.apiKey),
        identity: Boolean(config.jwtSecret),
      },
      languages: Object.entries(language.names).map(([code, name]) => ({ code, name })),
      demoUsers: config.demoMode ? DEMO_USERS : undefined,
      demoLogin: config.demoMode ? { email: "owner@kwikpay.demo", password: config.demoPassword } : undefined,
    })
  );

  ctx.core = require("./routes/converse")(ctx);
  ctx.onboarding = require("./onboarding")(ctx);
  require("./routes/support")(ctx);
  require("./routes/account")(ctx);
  require("./routes/connections")(ctx);
  require("./routes/sites")(ctx); // before console: /v1/knowledge/sites must win over /v1/knowledge/:id
  require("./routes/console")(ctx);
  require("./routes/channels")(ctx);
  require("./routes/business")(ctx);
  require("./routes/quality")(ctx);
  require("./routes/onboarding")(ctx);

  // Optional: serve the built web app from the same origin (one service, no CORS). API paths always win and stay JSON.
  if (config.webDist && require("node:fs").existsSync(require("node:path").join(config.webDist, "index.html"))) {
    const path = require("node:path");
    const dist = path.resolve(config.webDist);
    app.use(express.static(dist, { index: false, setHeaders: (res, file) => res.set("Cache-Control", /[\\/](assets|brand)[\\/]/.test(file) ? "public, max-age=31536000, immutable" : "no-cache") }));
    app.get(/^\/(?!v1\/|health$)/, (req, res, next) => (req.accepts("html") ? (res.set("Cache-Control", "no-cache"), res.sendFile(path.join(dist, "index.html"))) : next()));
  }

  app.use((req, res, next) => next(new HttpError(404, "not_found", "Not found")));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err instanceof HttpError ? err.status : err?.type === "entity.too.large" ? 413 : err?.type === "entity.parse.failed" ? 400 : 500;
    if (status === 500) console.error("[helply] unhandled:", err?.name, err?.message);
    if (err.retryAfter) res.set("Retry-After", String(err.retryAfter));
    res.status(status).json({
      error: { code: err.code || (status === 500 ? "internal_error" : status === 400 ? "bad_request" : "error"), message: status === 500 ? "Something went wrong" : err.message },
      requestId: req.id,
    });
  });

  app.locals.routes = routes;
  app.locals.ctx = ctx;

  /** Retention: drop messages older than each workspace's retentionDays. Called hourly by the entrypoint. */
  app.locals.sweepRetention = () => {
    for (const { id } of repo.db.prepare("SELECT id FROM workspaces").all()) {
      const days = repo.getWorkspace(id).settings.retentionDays;
      repo.purgeOlderThan(id, new Date(Date.now() - days * 86_400_000).toISOString());
    }
  };

  // Demo accounts (fictional shop). Demo mode only.
  app.locals.ready = (async () => {
    if (!config.demoMode || repo.getUserByEmail("owner@kwikpay.demo")) return;
    const hash = await hashPassword(config.demoPassword);
    for (const [email, name, role] of [["owner@kwikpay.demo", "Efua Owusu", "owner"], ["agent@kwikpay.demo", "Yaw Darko", "agent"]]) {
      const u = repo.createUser({ email, passwordHash: hash, name });
      repo.addMembership(DEFAULT_WORKSPACE_ID, u.id, role);
    }
  })();

  return app;
};

if (require.main === module) {
  const env = require("./loadEnv").loadEnv();
  console.log(env.found ? `[helply] loaded ${env.loaded.length} variable(s) from .env` : "[helply] no .env file found; using the process environment");
  const config = load();
  if (!config.dbPath) config.dbPath = ".data/helply.db";
  if (!config.webDist && require("node:fs").existsSync(require("node:path").join(__dirname, "..", "web", "dist", "index.html"))) config.webDist = require("node:path").join(__dirname, "..", "web", "dist");
  if (!config.demoMode && !config.encryptionKey) console.warn("[helply] HELPLY_ENCRYPTION_KEY is not set: stored secrets will not survive a restart.");
  const app = buildApp(config);
  app.locals.ready.then(() => {
    // Demo mode on a host with an ephemeral disk (Render): recreate the demo data on every cold start and keep the demo logs fresh.
    if (config.demoMode && process.env.DEMO_SEED !== "false") {
      const { seedDemoData } = require("./demo/seedData");
      const { ensureDemoLogs } = require("./demo/seedLogs");
      if (seedDemoData({ repo: app.locals.ctx.repo, workspaceId: DEFAULT_WORKSPACE_ID })) console.log("[helply] demo data seeded (business details, FAQ, sample conversations)");
      const keep = (attempt = 1) => ensureDemoLogs({ baseUrl: config.cls.baseUrl, readKey: config.cls.apiKey, writeKey: config.cls.writeKey, service: config.cls.service }).then((r) => { if (r === "failed" && attempt < 4) setTimeout(() => keep(attempt + 1), 60_000 * attempt).unref(); });
      keep();
      setInterval(() => keep(), 30 * 60_000).unref();
    }
    app.locals.sweepRetention();
    setInterval(() => app.locals.sweepRetention(), 3_600_000).unref();
    app.listen(config.port, () => {
      console.log(`[helply] listening on :${config.port}  demo=${config.demoMode}  model=${config.gemma.model}  db=${config.dbPath}`);
      if (config.demoMode) console.warn("[helply] DEMO_MODE is on. Never run this in production.");
    });
  });
}

module.exports = { buildApp };

"use strict";
/** Log source, customer identity (token minting), outbound webhooks. */
const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const { HttpError } = require("../errors");
const { sign } = require("../identity/token");
const { probeLogs, ClsError } = require("../logs/clsClient");
const { validateWebhookUrl, isBlockedIp } = require("../webhooks/ssrf");
const { EVENTS } = require("../webhooks/service");
const { randomToken } = require("../security/crypto");
const { createLimiter } = require("../auth/auth");
const nodeCrypto = require("node:crypto");

module.exports = (ctx) => {
  const { config, repo, vault, route, ah, auth, fetchImpl } = ctx;
  const { guard } = auth;
  const userOnly = (req) => {
    if (req.principal.type === "apikey") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
  };
  const mask = (k) => (k ? `${"•".repeat(8)}${k.slice(-4)}` : null);

  // ── log source ────────────────────────────────────────────────────────
  const currentSource = (w) => {
    const src = repo.getLogSource(w.id);
    if (src) return { source: "workspace", baseUrl: src.baseUrl, service: src.service, userIdField: src.userIdField, apiKeyMasked: mask(vault.decrypt(src.apiKeyEnc)) };
    if (w.id === ctx.defaultWorkspaceId && config.cls.baseUrl && config.cls.apiKey) return { source: "environment", baseUrl: config.cls.baseUrl, service: config.cls.service, userIdField: "metadata.userId", apiKeyMasked: mask(config.cls.apiKey) };
    return { source: null, baseUrl: null, service: null, userIdField: "metadata.userId", apiKeyMasked: null };
  };

  /** The server fetches this URL, so it gets the same address checks as webhooks (private ranges only in demo/dev). */
  const checkSourceUrl = async (raw) => {
    const v = validateWebhookUrl(raw, { allowHttp: config.allowPrivateLogSources });
    if (config.allowPrivateLogSources && v.ok === false && /local hostnames|private or reserved/.test(v.reason)) return new URL(raw);
    if (!v.ok) throw new HttpError(400, "unsafe_url", `Log source URL rejected: ${v.reason}`);
    if (!config.allowPrivateLogSources) {
      try {
        const addrs = await dns.lookup(v.url.hostname, { all: true });
        if (addrs.some((a) => isBlockedIp(a.address))) throw new HttpError(400, "unsafe_url", "Log source URL resolves to a private address");
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(400, "unsafe_url", "Log source host could not be resolved");
      }
    }
    return v.url;
  };

  route("get", "/v1/log-source", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    res.json(currentSource(repo.getWorkspace(ctx.wsOf(req))));
  });

  route("put", "/v1/log-source", guard({ role: "admin" }), ah(async (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    const { baseUrl, apiKey, service, userIdField } = req.body || {};
    if (typeof baseUrl !== "string" || typeof service !== "string" || !service.trim()) throw new HttpError(400, "invalid_request", "baseUrl and service are required");
    const url = await checkSourceUrl(baseUrl);
    const existing = repo.getLogSource(ws);
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      if (!existing) throw new HttpError(400, "api_key_required", "An API key is required the first time");
    }
    repo.putLogSource(ws, {
      baseUrl: url.origin + url.pathname.replace(/\/+$/, ""),
      apiKeyEnc: apiKey && apiKey.trim() ? vault.encrypt(apiKey.trim()) : existing.apiKeyEnc,
      service: service.trim().slice(0, 80),
      userIdField: typeof userIdField === "string" && userIdField.trim() ? userIdField.trim().slice(0, 80) : "metadata.userId",
    });
    ctx.audit(req, "log_source_changed", { baseUrl: url.origin, service: service.trim() });
    res.json(currentSource(repo.getWorkspace(ws)));
  }));

  /** Connectivity + "does filtering by userId actually work?" with plain-language issues. */
  route("post", "/v1/log-source/test", guard({ role: "admin" }), ah(async (req, res) => {
    userOnly(req);
    const w = repo.getWorkspace(ctx.wsOf(req));
    const cls = ctx.logSourceFor(w);
    const issues = [];
    let foundUserId = false;
    const done = (ok, sampleCount) => {
      const passed = ok && issues.length === 0;
      repo.recordLogTest(w.id, { ok: passed, hasUserId: foundUserId });
      res.json({ ok: passed, sampleCount, issues });
    };
    if (!cls?.baseUrl || !cls?.apiKey) {
      issues.push({ code: "not_configured", message: "No log source is set up yet. Add the base URL, a read-only API key and the service name." });
      return done(false, 0);
    }
    let sample;
    try {
      sample = await probeLogs(cls, { limit: 20 }, { fetchImpl });
    } catch (err) {
      const status = err instanceof ClsError ? err.status : null;
      issues.push({
        code: status === 401 || status === 403 ? "auth_failed" : "unreachable",
        message: status === 401 || status === 403 ? "The log service rejected the API key. Create a key with the logs:read scope and paste it again." : "Helply could not reach the log service. Check the base URL and that the server is running.",
      });
      return done(false, 0);
    }
    if (!sample.length) {
      issues.push({ code: "no_logs", message: `The log service answered, but there are no logs for service "${cls.service}". Check the service name, or send some traffic first.` });
      return done(false, 0);
    }
    const withUser = sample.find((r) => typeof r?.metadata?.userId === "string" && r.metadata.userId);
    if (!withUser) {
      issues.push({ code: "no_user_id", message: "Your logs carry no metadata.userId, so Helply cannot find one customer's requests. Add the logged-in user's id to metadata.userId on each request log." });
      return done(false, sample.length);
    }
    foundUserId = true;
    try {
      const scoped = await probeLogs(cls, { userId: withUser.metadata.userId, limit: 20 }, { fetchImpl });
      if (scoped.some((r) => r?.metadata?.userId !== withUser.metadata.userId)) {
        issues.push({ code: "filter_ignored", message: "The log service ignored the userId filter and returned other customers' logs. Helply will not use this source until central-logging-service supports ?userId= (see the README)." });
      }
    } catch {
      issues.push({ code: "filter_failed", message: "The log service failed when filtering by userId. Update central-logging-service to a version with the userId filter." });
    }
    return done(true, sample.length);
  }));

  // ── customer identity ─────────────────────────────────────────────────
  route("get", "/v1/identity", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const w = repo.getWorkspace(ctx.wsOf(req));
    res.json({ configured: Boolean(ctx.identitySecret(w)), workspaceId: w.id, tokenMaxAgeSeconds: config.tokenMaxAgeSeconds, secretSource: w.id === ctx.defaultWorkspaceId ? "environment" : "workspace" });
  });

  route("post", "/v1/identity/rotate-secret", guard({ role: "owner" }), (req, res) => {
    userOnly(req);
    const w = repo.getWorkspace(ctx.wsOf(req));
    if (w.id === ctx.defaultWorkspaceId) throw new HttpError(409, "env_managed", "This workspace's secret is set by HELPLY_JWT_SECRET");
    const secret = crypto.randomBytes(32).toString("hex");
    repo.updateWorkspace(w.id, { identitySecretEnc: vault.encrypt(secret) });
    ctx.audit(req, "identity_secret_rotated", {});
    res.json({ secret }); // shown once; existing customer tokens stop verifying immediately
  });

  const mintLimiter = createLimiter({ max: 120, keyFn: (req) => (req.principal ? `mint:${req.principal.workspaceId}` : null) });
  route("post", "/v1/identity/tokens", guard({ role: "admin", scope: "identity:mint" }), mintLimiter, (req, res) => {
    const { userId, name, visitorId } = req.body || {};
    if (visitorId !== undefined && (typeof visitorId !== "string" || !visitorId.trim() || visitorId.length > 128)) throw new HttpError(400, "invalid_visitor_id", "visitorId must be a non-empty string");
    if (typeof userId !== "string" || !userId.trim() || userId.length > 128) throw new HttpError(400, "invalid_user_id", "userId is required");
    const w = repo.getWorkspace(ctx.wsOf(req));
    if (repo.getIdentityKey(w.id).mode === "public_key") throw new HttpError(409, "public_key_mode", "This workspace verifies tokens with your public key, so Helply cannot sign them. Sign tokens in your own backend.");
    const secret = ctx.identitySecret(w);
    if (!secret) throw new HttpError(503, "identity_not_configured", "This workspace has no identity secret");
    const token = sign({ sub: userId.trim(), name: typeof name === "string" ? name.slice(0, 80) : undefined, tenant: w.id, aud: "helply", ...(visitorId ? { vid: visitorId.trim() } : {}) }, secret, { ttlSeconds: config.tokenMaxAgeSeconds });
    ctx.audit(req, "identity_token_minted", { userId: userId.trim(), visitorBound: Boolean(visitorId) });
    res.json({ token, expiresIn: config.tokenMaxAgeSeconds });
  });

  route("get", "/v1/identity/key", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    res.json(repo.getIdentityKey(ctx.wsOf(req)));
  });
  route("put", "/v1/identity/key", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const { alg, publicKeyPem, jwksUrl, kid } = req.body || {};
    if (!["RS256", "ES256"].includes(alg)) throw new HttpError(400, "invalid_alg", "alg must be RS256 or ES256");
    if (jwksUrl) throw new HttpError(400, "jwks_unsupported", "JWKS URLs are not supported yet: paste the public key as PEM");
    if (typeof publicKeyPem !== "string" || publicKeyPem.length > 4000) throw new HttpError(400, "invalid_key", "Paste the public key in PEM format");
    let key;
    try { key = nodeCrypto.createPublicKey(publicKeyPem); } catch { throw new HttpError(400, "invalid_key", "That is not a valid PEM public key (it must start with -----BEGIN PUBLIC KEY-----)"); }
    const ok = alg === "RS256" ? key.asymmetricKeyType === "rsa" && (key.asymmetricKeyDetails?.modulusLength || 0) >= 2048 : key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails?.namedCurve === "prime256v1";
    if (!ok) throw new HttpError(400, "invalid_key", alg === "RS256" ? "RS256 needs an RSA key of at least 2048 bits" : "ES256 needs a P-256 (prime256v1) key");
    const out = repo.setIdentityKey(ctx.wsOf(req), { mode: "public_key", alg, kid: typeof kid === "string" && kid.trim() ? kid.trim().slice(0, 80) : null, publicKeyPem: key.export({ type: "spki", format: "pem" }) });
    ctx.audit(req, "identity_key_changed", { mode: "public_key", alg });
    res.json(out);
  });
  route("delete", "/v1/identity/key", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    ctx.audit(req, "identity_key_changed", { mode: "shared_secret" });
    res.json(repo.setIdentityKey(ctx.wsOf(req), { mode: "shared_secret", alg: "HS256" }));
  });

  // ── webhooks ──────────────────────────────────────────────────────────
  const allowedEvents = EVENTS.filter((e) => e !== "webhook.test");
  const loadHook = (req) => {
    const h = repo.getWebhook(ctx.wsOf(req), req.params.id);
    if (!h) throw new HttpError(404, "not_found", "Webhook not found");
    return h;
  };

  route("get", "/v1/webhooks", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    res.json({ data: repo.listWebhooks(ctx.wsOf(req)), events: allowedEvents });
  });

  route("post", "/v1/webhooks", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    const { url, events } = req.body || {};
    const v = validateWebhookUrl(url, { allowHttp: config.allowInsecureWebhooks });
    if (!v.ok) throw new HttpError(400, "unsafe_webhook_url", `Webhook URL rejected: ${v.reason}`);
    if (!Array.isArray(events) || !events.length || !events.every((e) => allowedEvents.includes(e))) throw new HttpError(400, "invalid_events", `Events must be from: ${allowedEvents.join(", ")}`);
    if (repo.listWebhooks(ws).length >= 10) throw new HttpError(409, "too_many_webhooks", "Limit of 10 webhooks per workspace");
    const secret = randomToken("whsec_", 24);
    const hook = repo.createWebhook(ws, { url: v.url.toString(), events: [...new Set(events)], secretEnc: vault.encrypt(secret) });
    ctx.audit(req, "webhook_created", { webhookId: hook.id, host: v.url.host });
    res.status(201).json({ ...hook, secret }); // shown once
  });

  route("delete", "/v1/webhooks/:id", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    loadHook(req);
    repo.deleteWebhook(ctx.wsOf(req), req.params.id);
    ctx.audit(req, "webhook_deleted", { webhookId: req.params.id });
    res.sendStatus(204);
  });

  route("post", "/v1/webhooks/:id/test", guard({ role: "admin" }), ah(async (req, res) => {
    userOnly(req);
    const hook = loadHook(req);
    // Re-validate at send time: stored URLs get the same checks as new ones.
    const out = await ctx.webhooks.deliver(ctx.wsOf(req), hook, "webhook.test", { message: "Test delivery from Helply" }, { retry: false });
    res.json(out);
  }));

  route("get", "/v1/webhooks/:id/deliveries", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    loadHook(req);
    res.json({ data: repo.listDeliveries(ctx.wsOf(req), req.params.id) });
  });
};

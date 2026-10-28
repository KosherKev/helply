"use strict";
/**
 * Dashboard authentication. Three credential kinds, each resolving to a principal whose workspace id is the
 * ONLY tenant any query may use:
 *   session  "Authorization: Bearer <opaque>"   (hashed at rest, 12h)
 *   api key  "Authorization: Bearer hk_live_..." (hashed at rest, scoped)
 *   console  "X-Console-Key"                     (legacy single-workspace key; default workspace only)
 */
const { sha256, randomToken, safeEqual } = require("../security/crypto");
const { HttpError } = require("../errors");

const RANK = { agent: 1, admin: 2, owner: 3 };
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SCOPES = ["identity:mint", "conversations:read", "tickets:read", "tickets:write"];

const createAuth = ({ repo, config, defaultWorkspaceId }) => {
  /** Resolves req.principal (or null). Never throws for a missing credential; guards decide. */
  const authenticate = (req, res, next) => {
    req.principal = null;
    const header = req.get("authorization") || "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (bearer.startsWith("hk_")) {
      const key = repo.getApiKeyByHash(sha256(bearer));
      if (key) {
        repo.touchApiKey(key.id);
        req.principal = { type: "apikey", workspaceId: key.workspaceId, keyId: key.id, scopes: key.scopes, role: null };
      }
    } else if (bearer) {
      const s = repo.getSessionByHash(sha256(bearer));
      const m = s && repo.getMembership(s.workspace_id, s.user_id); // role is read live, so removal/demotion is immediate
      if (s && m) req.principal = { type: "user", workspaceId: s.workspace_id, userId: s.user_id, role: m.role, sessionHash: sha256(bearer) };
    } else if (config.consoleKey && safeEqual(req.get("x-console-key") || "", config.consoleKey)) {
      req.principal = { type: "console", workspaceId: defaultWorkspaceId, role: "admin", scopes: SCOPES };
    }
    next();
  };

  /**
   * Guard factory.
   * @param {{role?:"agent"|"admin"|"owner", scope?:string, apiKey?:boolean, legacyOpen?:boolean}} rule
   */
  const guard = ({ role = "agent", scope = null, legacyOpen = false } = {}) => (req, res, next) => {
    const p = req.principal;
    if (!p) {
      // Legacy demo behaviour: console endpoints open in demo mode when no console key is configured.
      if (legacyOpen && config.demoMode && !config.consoleKey) {
        req.principal = { type: "console", workspaceId: defaultWorkspaceId, role: "admin", scopes: SCOPES };
        return next();
      }
      return next(new HttpError(401, "unauthorized", "Sign in required"));
    }
    if (p.type === "apikey") {
      return scope && p.scopes.includes(scope) ? next() : next(new HttpError(403, "forbidden", "This API key cannot do that"));
    }
    if (RANK[p.role] < RANK[role]) return next(new HttpError(403, "forbidden", `Requires the ${role} role`));
    return next();
  };

  const createSession = (userId, workspaceId) => {
    const token = randomToken("hs_");
    repo.createSession({ tokenHash: sha256(token), userId, ws: workspaceId, expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() });
    return { token, expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() };
  };

  return { authenticate, guard, createSession, RANK, SCOPES };
};

/** Failed-login backoff per email (and per IP): 5 free failures, then 2^n seconds, capped at 15 minutes. */
const createLoginGuard = ({ now = () => Date.now() } = {}) => {
  const fails = new Map();
  const key = (k) => String(k).toLowerCase();
  return {
    check: (...keys) => {
      for (const k of keys) {
        const e = fails.get(key(k));
        if (e && e.until > now()) return Math.ceil((e.until - now()) / 1000);
      }
      return 0;
    },
    fail: (...keys) => {
      for (const k of keys) {
        const e = fails.get(key(k)) || { n: 0, until: 0 };
        e.n += 1;
        if (e.n >= 5) e.until = now() + Math.min(2 ** (e.n - 4), 900) * 1000;
        fails.set(key(k), e);
      }
    },
    success: (...keys) => keys.forEach((k) => fails.delete(key(k))),
  };
};

/** Fixed-window limiter with RateLimit-* headers. keyFn decides the bucket (IP, workspace, ...). */
const createLimiter = ({ windowMs = 60_000, max, keyFn, code = "rate_limited", now = () => Date.now() }) => {
  const buckets = new Map();
  return (req, res, next) => {
    const k = keyFn(req);
    if (k === null || k === undefined) return next();
    const t = now();
    let b = buckets.get(k);
    if (!b || b.reset <= t) {
      b = { n: 0, reset: t + windowMs };
      buckets.set(k, b);
      if (buckets.size > 10_000) for (const [bk, bv] of buckets) if (bv.reset <= t) buckets.delete(bk);
    }
    b.n += 1;
    res.set({ "RateLimit-Limit": String(max), "RateLimit-Remaining": String(Math.max(0, max - b.n)), "RateLimit-Reset": String(Math.ceil((b.reset - t) / 1000)) });
    if (b.n > max) return next(new HttpError(429, code, "Too many requests, slow down"));
    return next();
  };
};

module.exports = { createAuth, createLoginGuard, createLimiter, RANK, SCOPES };

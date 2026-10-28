"use strict";
/** Accounts, sessions, workspace settings, team, API keys, audit log. */
const crypto = require("node:crypto");
const { HttpError } = require("../errors");
const { sha256, randomToken, verifyPassword, hashPassword } = require("../security/crypto");
const { createLimiter } = require("../auth/auth");

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const LANGS = ["en", "tw", "gaa", "ee", "fat", "dag", "pcm"];
const DUMMY_HASH = "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // equalises timing for unknown emails

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "workspace";

module.exports = (ctx) => {
  const { config, repo, vault, route, ah, auth, loginGuard } = ctx;
  const { guard } = auth;
  const authLimiter = createLimiter({ max: config.rate.loginPerIpPerMin, keyFn: (req) => `login:${req.ip}` });

  const userOnly = (req) => {
    if (req.principal.type !== "user") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
  };
  const sessionPayload = (user, workspaceId, role) => {
    const s = auth.createSession(user.id, workspaceId);
    const w = repo.getWorkspace(workspaceId);
    return { session: s.token, expiresAt: s.expiresAt, user: { id: user.id, email: user.email, name: user.name }, role, workspace: publicWorkspace(w) };
  };
  const publicWorkspace = (w) => ({ id: w.id, name: w.name, slug: w.slug, publicKey: w.publicKey, settings: w.settings, createdAt: w.createdAt });

  route("post", "/v1/auth/register", authLimiter, ah(async (req, res) => {
    if (!config.allowSignup) throw new HttpError(403, "signup_disabled", "Sign-up is closed on this server");
    const { email, password, name, workspaceName } = req.body || {};
    if (typeof email !== "string" || !EMAIL.test(email)) throw new HttpError(400, "invalid_email", "Enter a valid email");
    if (typeof password !== "string" || password.length < 10 || password.length > 200) throw new HttpError(400, "weak_password", "Password must be at least 10 characters");
    if (typeof workspaceName !== "string" || workspaceName.trim().length < 2) throw new HttpError(400, "workspace_name_required", "Give your workspace a name");
    if (repo.getUserByEmail(email)) throw new HttpError(409, "email_taken", "That email is already registered");
    const passwordHash = await hashPassword(password);
    const w = repo.createWorkspace({ name: workspaceName.trim(), slug: `${slugify(workspaceName)}-${crypto.randomBytes(3).toString("hex")}`, identitySecretEnc: vault.encrypt(crypto.randomBytes(32).toString("hex")), settings: { aiLive: false } }); // new workspaces stay paused until setup is complete
    const user = repo.createUser({ email, passwordHash, name: typeof name === "string" ? name.trim().slice(0, 80) : null });
    repo.addMembership(w.id, user.id, "owner");
    repo.addAudit(w.id, { actorType: "user", actorId: user.id, action: "workspace_created", detail: {} });
    res.status(201).json(sessionPayload(user, w.id, "owner"));
  }));

  route("post", "/v1/auth/login", authLimiter, ah(async (req, res) => {
    const { email, password, workspaceId } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string") throw new HttpError(400, "invalid_request", "Email and password are required");
    const wait = loginGuard.check(`email:${email}`, `ip:${req.ip}`);
    if (wait) throw Object.assign(new HttpError(429, "login_locked", `Too many failed attempts. Try again in ${wait}s`), { retryAfter: wait });
    const user = repo.getUserByEmail(email);
    const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    const membership = ok && user ? (workspaceId ? repo.getMembership(String(workspaceId), user.id) : repo.firstMembership(user.id)) : null;
    if (!ok || !user || !membership) {
      loginGuard.fail(`email:${email}`, `ip:${req.ip}`);
      if (user && membership === null && ok) throw new HttpError(403, "no_workspace", "You are not a member of that workspace");
      throw new HttpError(401, "invalid_credentials", "Wrong email or password");
    }
    loginGuard.success(`email:${email}`);
    repo.addAudit(membership.workspace_id, { actorType: "user", actorId: user.id, action: "login", detail: {} });
    res.json(sessionPayload({ id: user.id, email: user.email, name: user.name }, membership.workspace_id, membership.role));
  }));

  route("post", "/v1/auth/logout", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    repo.deleteSessionByHash(req.principal.sessionHash);
    res.sendStatus(204);
  });

  route("get", "/v1/auth/me", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    const u = repo.getUser(req.principal.userId);
    res.json({ user: { id: u.id, email: u.email, name: u.name }, role: req.principal.role, workspace: publicWorkspace(repo.getWorkspace(req.principal.workspaceId)) });
  });

  route("post", "/v1/auth/forgot-password", authLimiter, ah(async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    if (!EMAIL.test(email)) throw new HttpError(400, "invalid_email", "Enter a valid email");
    const user = repo.getUserByEmail(email);
    // Same answer whether or not the account exists. At most 3 links per hour per account.
    if (user && repo.recentPasswordResets(user.id) < 3) {
      const token = randomToken("hp_", 24);
      repo.createPasswordReset(user.id, sha256(token), new Date(Date.now() + 3_600_000).toISOString());
      const link = `${config.appUrl}/app/reset?token=${token}`;
      const sent = await ctx.mailer.send({ to: user.email, subject: `Reset your ${config.brand} password`, text: `Someone asked to reset the password for this account.\n\nOpen this link within one hour to choose a new one:\n${link}\n\nIf this was not you, ignore this email and your password stays the same.` });
      if (!sent.ok && config.demoMode) console.warn(`[helply] demo mode: email not sent (${sent.error}). Reset link: ${link}`);
      else if (!sent.ok) console.warn(`[helply] password reset email not sent (${sent.error})`);
    }
    res.status(202).json({ ok: true });
  }));

  route("post", "/v1/auth/reset-password", authLimiter, ah(async (req, res) => {
    const { token, password } = req.body || {};
    if (typeof password !== "string" || password.length < 10 || password.length > 200) throw new HttpError(400, "weak_password", "Password must be at least 10 characters");
    const r = typeof token === "string" ? repo.getPasswordReset(sha256(token)) : null;
    if (!r) throw new HttpError(400, "invalid_token", "This reset link is invalid or has expired");
    const workspaces = repo.completePasswordReset(r.id, r.user_id, await hashPassword(password));
    for (const w of workspaces) repo.addAudit(w, { actorType: "user", actorId: r.user_id, action: "password_reset", detail: {} });
    res.json({ ok: true });
  }));

  route("post", "/v1/auth/accept-invite", authLimiter, ah(async (req, res) => {
    const { token, password, name } = req.body || {};
    const inv = typeof token === "string" ? repo.getInvitationByTokenHash(sha256(token)) : null;
    if (!inv) throw new HttpError(400, "invalid_invitation", "This invitation is invalid or has expired");
    if (typeof password !== "string" || password.length < 10) throw new HttpError(400, "weak_password", "Password must be at least 10 characters");
    let user = repo.getUserByEmail(inv.email);
    if (user) {
      if (!(await verifyPassword(password, user.password_hash))) throw new HttpError(401, "invalid_credentials", "Wrong password for that account");
    } else {
      user = repo.createUser({ email: inv.email, passwordHash: await hashPassword(password), name: typeof name === "string" ? name.trim().slice(0, 80) : null });
    }
    if (!repo.getMembership(inv.workspace_id, user.id)) repo.addMembership(inv.workspace_id, user.id, inv.role);
    repo.markInvitationAccepted(inv.id);
    repo.addAudit(inv.workspace_id, { actorType: "user", actorId: user.id, action: "invitation_accepted", detail: { role: inv.role } });
    res.status(201).json(sessionPayload({ id: user.id, email: user.email, name: user.name }, inv.workspace_id, repo.getMembership(inv.workspace_id, user.id).role));
  }));

  // ── workspace ─────────────────────────────────────────────────────────
  route("get", "/v1/workspace", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    res.json(publicWorkspace(repo.getWorkspace(ctx.wsOf(req))));
  });

  route("patch", "/v1/workspace", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    const { name, settings } = req.body || {};
    const patch = {};
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 2) throw new HttpError(400, "invalid_name", "Name must be at least 2 characters");
      patch.name = name.trim();
    }
    if (settings !== undefined) {
      if (!settings || typeof settings !== "object") throw new HttpError(400, "invalid_settings", "settings must be an object");
      const s = {};
      if (settings.languages !== undefined) {
        if (!Array.isArray(settings.languages) || !settings.languages.length || !settings.languages.every((l) => LANGS.includes(l))) throw new HttpError(400, "invalid_settings", "languages must be known language codes");
        s.languages = [...new Set(settings.languages)];
      }
      if (settings.escalationThreshold !== undefined) {
        const n = Number(settings.escalationThreshold);
        if (!(n >= 0.05 && n <= 0.95)) throw new HttpError(400, "invalid_settings", "escalationThreshold must be between 0.05 and 0.95");
        s.escalationThreshold = n;
      }
      if (settings.retentionDays !== undefined) {
        const n = Number(settings.retentionDays);
        if (!Number.isInteger(n) || n < 1 || n > 365) throw new HttpError(400, "invalid_settings", "retentionDays must be 1 to 365");
        s.retentionDays = n;
      }
      if (settings.holdFlaggedReplies !== undefined) {
        if (typeof settings.holdFlaggedReplies !== "boolean") throw new HttpError(400, "invalid_settings", "holdFlaggedReplies must be a boolean");
        s.holdFlaggedReplies = settings.holdFlaggedReplies;
      }
      if (settings.aiLive !== undefined) {
        if (typeof settings.aiLive !== "boolean") throw new HttpError(400, "invalid_settings", "aiLive must be a boolean");
        if (settings.aiLive && !repo.getWorkspace(ws).settings.aiLive) {
          const ob = ctx.onboarding(ws);
          if (!ob.readyForLive) throw new HttpError(409, "not_ready", `Finish setup before switching the AI on: ${ob.steps.filter((x) => !x.optional && x.id !== "live" && x.status !== "done").map((x) => x.title).join(", ")}`);
        }
        s.aiLive = settings.aiLive;
      }
      if (settings.brandColor !== undefined) {
        if (typeof settings.brandColor !== "string" || !HEX.test(settings.brandColor)) throw new HttpError(400, "invalid_settings", "brandColor must be a #RRGGBB colour");
        s.brandColor = settings.brandColor;
      }
      patch.settings = s;
    }
    const before = repo.getWorkspace(ws).settings.aiLive;
    const w = repo.updateWorkspace(ws, patch);
    if (patch.settings?.aiLive !== undefined && patch.settings.aiLive !== before) ctx.audit(req, "ai_live_changed", { aiLive: patch.settings.aiLive });
    ctx.audit(req, "settings_changed", { fields: [...Object.keys(patch.settings || {}), ...(patch.name ? ["name"] : [])] });
    res.json(publicWorkspace(w));
  });

  // ── team ──────────────────────────────────────────────────────────────
  route("get", "/v1/members", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    res.json({ data: repo.listMembers(ctx.wsOf(req)).map((m) => ({ id: m.id, name: m.name || m.email.split("@")[0], role: m.role })) });
  });

  route("get", "/v1/team", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    res.json({ members: repo.listMembers(ws), invitations: repo.listInvitations(ws) });
  });

  route("post", "/v1/team/invitations", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const { email, role } = req.body || {};
    if (typeof email !== "string" || !EMAIL.test(email)) throw new HttpError(400, "invalid_email", "Enter a valid email");
    if (!["admin", "agent"].includes(role)) throw new HttpError(400, "invalid_role", "Role must be admin or agent");
    if (role === "admin" && req.principal.role !== "owner") throw new HttpError(403, "forbidden", "Only an owner can invite an admin");
    const token = randomToken("hi_", 24);
    const inv = repo.createInvitation(ctx.wsOf(req), { email, role, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() });
    ctx.audit(req, "member_invited", { email: inv.email, role });
    res.status(201).json({ invitation: inv, token, link: `${config.appUrl}/app/accept?token=${token}` }); // email delivery is out of scope
  });

  route("patch", "/v1/team/:userId", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    const target = repo.getMembership(ws, req.params.userId);
    if (!target) throw new HttpError(404, "not_found", "Member not found");
    const role = req.body?.role;
    if (!["owner", "admin", "agent"].includes(role)) throw new HttpError(400, "invalid_role", "Role must be owner, admin or agent");
    const actorOwner = req.principal.role === "owner";
    if ((role === "owner" || target.role === "owner") && !actorOwner) throw new HttpError(403, "forbidden", "Only an owner can change owner roles");
    if (target.role === "owner" && role !== "owner" && repo.countOwners(ws) <= 1) throw new HttpError(409, "last_owner", "A workspace needs at least one owner");
    repo.updateRole(ws, req.params.userId, role);
    ctx.audit(req, "member_role_changed", { userId: req.params.userId, role });
    res.json({ userId: req.params.userId, role });
  });

  route("delete", "/v1/team/:userId", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    const target = repo.getMembership(ws, req.params.userId);
    if (!target) throw new HttpError(404, "not_found", "Member not found");
    if (target.role === "owner" && req.principal.role !== "owner") throw new HttpError(403, "forbidden", "Only an owner can remove an owner");
    if (target.role === "owner" && repo.countOwners(ws) <= 1) throw new HttpError(409, "last_owner", "A workspace needs at least one owner");
    repo.removeMember(ws, req.params.userId);
    ctx.audit(req, "member_removed", { userId: req.params.userId });
    res.sendStatus(204);
  });

  // ── API keys ──────────────────────────────────────────────────────────
  route("get", "/v1/api-keys", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    res.json({ data: repo.listApiKeys(ctx.wsOf(req)) });
  });

  route("post", "/v1/api-keys", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const { name, scopes } = req.body || {};
    if (typeof name !== "string" || !name.trim()) throw new HttpError(400, "invalid_name", "Give the key a name");
    if (!Array.isArray(scopes) || !scopes.length || !scopes.every((s) => auth.SCOPES.includes(s))) throw new HttpError(400, "invalid_scopes", `Scopes must be from: ${auth.SCOPES.join(", ")}`);
    const key = randomToken("hk_live_", 24);
    const rec = repo.createApiKey(ctx.wsOf(req), { name: name.trim(), prefix: key.slice(0, 12), keyHash: sha256(key), scopes: [...new Set(scopes)] });
    ctx.audit(req, "key_created", { keyId: rec.id, scopes: rec.scopes });
    res.status(201).json({ ...rec, key }); // shown once
  });

  route("delete", "/v1/api-keys/:id", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    if (!repo.revokeApiKey(ctx.wsOf(req), req.params.id)) throw new HttpError(404, "not_found", "Key not found");
    ctx.audit(req, "key_revoked", { keyId: req.params.id });
    res.sendStatus(204);
  });

  // ── audit ─────────────────────────────────────────────────────────────
  route("get", "/v1/audit", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const { actor, action, from, to, limit, cursor } = req.query;
    res.json(repo.listAudit(ctx.wsOf(req), { actor, action, from, to, limit, cursor }));
  });
};

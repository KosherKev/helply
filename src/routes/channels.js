"use strict";
/**
 * Chat channels (ChatFlow) and the relay API that a connected ChatFlow server calls.
 *
 * Trust model: a relay key (hr_live_...) identifies exactly one channel, hence one workspace. It lets ChatFlow pass a visitor's
 * message and the company-signed identity token; it can do nothing else. The tenant never comes from the body. Identity is
 * verified on EVERY relayed message against the workspace's own secret; ChatFlow only carries the token and is not trusted
 * to say who the visitor is.
 */
const { HttpError } = require("../errors");
const { verify } = require("../identity/token");
const { sha256, randomToken } = require("../security/crypto");
const { createLimiter } = require("../auth/auth");
const { scrubString } = require("../logs/redact");

const KINDS = ["chatflow"];
const LANGS = new Set(["en", "tw", "gaa", "ee", "fat", "dag", "pcm"]);
const EVENT_TYPES = ["agent_joined", "agent_left", "agent_message", "conversation_closed", "conversation_reopened"];
const DAY_MS = 86_400_000;

module.exports = (ctx) => {
  const { config, repo, route, ah, auth, llm } = ctx;
  const { guard } = auth;
  const wsOf = ctx.wsOf;

  const newRelayKey = () => {
    const key = randomToken("hr_live_", 24);
    return { key, keyHash: sha256(key), keyPrefix: key.slice(0, 12) };
  };
  const loadChannel = (req) => {
    const c = repo.getChannel(wsOf(req), req.params.id);
    if (!c) throw new HttpError(404, "not_found", "Channel not found");
    return c;
  };

  // ── dashboard: manage channels (admin) ────────────────────────────────
  route("get", "/v1/channels", guard({ role: "admin" }), (req, res) => {
    if (req.principal.type === "apikey") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
    res.json({ data: repo.listChannels(wsOf(req)) });
  });

  route("post", "/v1/channels", guard({ role: "admin" }), (req, res) => {
    if (req.principal.type === "apikey") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
    const { kind, label, externalId } = req.body || {};
    if (!KINDS.includes(kind)) throw new HttpError(400, "invalid_kind", `kind must be one of: ${KINDS.join(", ")}`);
    if (typeof label !== "string" || !label.trim() || label.length > 60) throw new HttpError(400, "invalid_label", "Give the channel a short name");
    if (typeof externalId !== "string" || !externalId.trim() || externalId.length > 128) throw new HttpError(400, "invalid_external_id", "Enter the ChatFlow widget id");
    if (repo.findChannelByExternalId(kind, externalId.trim())) throw new HttpError(409, "channel_exists", "That ChatFlow property is already connected");
    const { key, keyHash, keyPrefix } = newRelayKey();
    const ch = repo.createChannel(wsOf(req), { kind, label: label.trim(), externalId: externalId.trim(), keyHash, keyPrefix });
    ctx.audit(req, "channel_connected", { channelId: ch.id, kind, externalId: ch.externalId });
    res.status(201).json({ ...ch, relayKey: key }); // shown once
  });

  route("delete", "/v1/channels/:id", guard({ role: "admin" }), (req, res) => {
    if (req.principal.type === "apikey") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
    const c = loadChannel(req);
    repo.deleteChannel(wsOf(req), c.id);
    ctx.audit(req, "channel_disconnected", { channelId: c.id });
    res.sendStatus(204);
  });

  route("post", "/v1/channels/:id/rotate-key", guard({ role: "admin" }), (req, res) => {
    if (req.principal.type === "apikey") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
    const c = loadChannel(req);
    const { key, keyHash, keyPrefix } = newRelayKey();
    repo.rotateChannelKey(wsOf(req), c.id, { keyHash, keyPrefix });
    ctx.audit(req, "channel_key_rotated", { channelId: c.id });
    res.json({ relayKey: key, keyPrefix }); // the old key stops working immediately
  });

  route("post", "/v1/channels/:id/test", guard({ role: "admin" }), (req, res) => {
    if (req.principal.type === "apikey") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
    const c = loadChannel(req);
    const w = repo.getWorkspace(wsOf(req));
    const issues = [];
    if (!c.lastSeenAt) issues.push({ code: "never_called", message: "ChatFlow has not called Helply yet. Paste the relay key into the property's AI settings, then send a test message in the widget." });
    else if (Date.now() - Date.parse(c.lastSeenAt) > DAY_MS) issues.push({ code: "stale", message: "ChatFlow has not called Helply in the last 24 hours. Check the key and that AI replies are switched on in ChatFlow." });
    if (!w.settings.aiLive) issues.push({ code: "ai_paused", message: "The AI is paused for this workspace, so every message goes to a person. Switch it on in Settings." });
    if (!llm.isConfigured()) issues.push({ code: "model_not_configured", message: "The language model is not configured on this server (GEMMA_API_KEY)." });
    res.json({ ok: issues.length === 0, issues });
  });

  // ── relay: called by the ChatFlow SERVER, never a browser ─────────────
  const relayAuth = Object.assign((req, res, next) => {
    const header = req.get("authorization") || "";
    const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const ch = key.startsWith("hr_") ? repo.getChannelByKeyHash(sha256(key)) : null;
    if (!ch) return next(new HttpError(401, "invalid_relay_key", "Invalid relay key"));
    req.relay = { workspaceId: ch.workspaceId, channelId: ch.id };
    return next();
  }, { rule: { role: "relay", scope: null, legacyOpen: false } });
  const relayLimiter = createLimiter({ max: config.rate.relayPerChannelPerMin, keyFn: (req) => (req.relay ? `relay:${req.relay.channelId}` : null) });
  const relayGuards = [relayAuth, relayLimiter];

  const idField = (v, name) => {
    if (typeof v !== "string" || !v.trim() || v.length > 128) throw new HttpError(400, "invalid_request", `${name} is required`);
    return v.trim();
  };
  /** Identity for a relayed message: verified against THIS workspace's secret, bound to this visitor if the token says so. */
  const verifyIdentity = (w, token, visitorId) => {
    if (typeof token !== "string" || !token) return null;
    const v = verify(token, ctx.identitySecret(w), { maxAgeSeconds: config.tokenMaxAgeSeconds, visitorId, ...ctx.identityVerify(w) });
    if (!v.ok) return null;
    const tenant = v.claims.tenant;
    if (tenant && tenant !== w.id && tenant !== w.slug) return null; // a token minted for another workspace is not ours
    return v;
  };

  route("post", "/v1/relay/message", ...relayGuards, ah(async (req, res) => {
    const b = req.body || {};
    const extConv = idField(b.externalConversationId, "externalConversationId");
    const extVisitor = idField(b.externalVisitorId, "externalVisitorId");
    const message = typeof b.message === "string" ? b.message.trim() : "";
    if (!message) throw new HttpError(400, "message_required", "A message is required");
    if (message.length > config.limits.maxMessageChars) throw new HttpError(400, "message_too_long", "Message is too long");
    const languageHint = LANGS.has(b.languageHint) ? b.languageHint : undefined;

    const { workspaceId: ws, channelId } = req.relay;
    const w = repo.getWorkspace(ws);
    repo.touchChannel(ws, channelId);
    const identity = verifyIdentity(w, b.identityToken, extVisitor);
    const customerId = identity?.claims.userId || null;
    const customerName = identity?.claims.name || null;

    const link = repo.getChannelConversation(ws, channelId, extConv);
    let conv = link ? repo.getConversation(ws, link.conversationId) : null;
    if (conv?.customerId && customerId && conv.customerId !== customerId) {
      // A different verified customer is now using this chat: never mix their history. Start a new Helply conversation.
      repo.addAudit(ws, { actorType: "system", action: "relay_identity_changed", detail: { channelId, externalConversationId: extConv } });
      conv = null;
    }
    if (!conv) {
      conv = repo.createConversation(ws, { customerId, customerName, language: languageHint || "en" });
    } else if (!conv.customerId && customerId) {
      repo.bindConversationCustomer(ws, conv.id, customerId, customerName);
      conv = repo.getConversation(ws, conv.id);
    }
    repo.linkChannelConversation(ws, { channelId, externalConversationId: extConv, conversationId: conv.id, externalVisitorId: extVisitor, customerId: customerId ?? link?.customerId ?? null });

    const reply = (o = {}) => res.json({
      conversationId: conv.id, reply: null, handledBy: "none", needsHuman: false, verified: Boolean(identity), requiresAuth: false, ticketId: null, held: false, suppressed: null, ...o,
    });
    if (conv.status === "human") { ctx.core.storeOnly(w, conv, message); return reply({ suppressed: "human_taken_over", needsHuman: true }); }
    if (!w.settings.aiLive) { ctx.core.storeOnly(w, conv, message, { handoff: true }); return reply({ suppressed: "ai_paused", needsHuman: true }); }
    if (b.agentOnline === true) { ctx.core.storeOnly(w, conv, message); return reply({ suppressed: "agent_online" }); }
    if (!llm.isConfigured()) throw new HttpError(503, "llm_not_configured", "Set GEMMA_API_KEY");

    const r = await ctx.core.converse({ workspace: w, identity, token: b.identityToken, conv, message, languageHint, visitorId: extVisitor });
    return reply({
      reply: { text: r.reply.text, english: r.reply.english, language: r.reply.language }, handledBy: "ai", needsHuman: r.needsHuman, verified: r.verified,
      requiresAuth: r.requiresAuth, ticketId: r.ticketId, held: Boolean(r.held),
    });
  }));

  route("post", "/v1/relay/events", ...relayGuards, (req, res) => {
    const b = req.body || {};
    const extConv = idField(b.externalConversationId, "externalConversationId");
    if (!EVENT_TYPES.includes(b.type)) throw new HttpError(400, "invalid_event", `type must be one of: ${EVENT_TYPES.join(", ")}`);
    const { workspaceId: ws, channelId } = req.relay;
    const link = repo.getChannelConversation(ws, channelId, extConv);
    const conv = link && repo.getConversation(ws, link.conversationId);
    if (!conv) throw new HttpError(404, "conversation_not_found", "Conversation not found");
    repo.touchChannel(ws, channelId);
    switch (b.type) {
      case "agent_joined":
        repo.updateConversation(ws, conv.id, { status: "human", handedOff: true });
        ctx.notify(ws, "conversation.handoff", { conversationId: conv.id, channel: true });
        break;
      case "agent_message": {
        const text = typeof b.text === "string" ? scrubString(b.text.trim()).slice(0, 2000) : "";
        if (!text) throw new HttpError(400, "text_required", "agent_message needs text");
        repo.addMessage(ws, conv.id, { role: "agent", text, english: conv.language === "en" ? text : null, language: conv.language, meta: { source: "chatflow" } });
        repo.updateConversation(ws, conv.id, { status: "human", handedOff: true });
        ctx.notify(ws, "message.customer", { conversationId: conv.id });
        break;
      }
      case "conversation_closed":
        repo.updateConversation(ws, conv.id, { status: "resolved" });
        break;
      case "conversation_reopened":
        if (conv.status === "resolved") repo.updateConversation(ws, conv.id, { status: "ai" });
        break;
      default: // agent_left: the conversation stays with a person until it is closed or reopened
        break;
    }
    res.json({ ok: true });
  });

  route("post", "/v1/relay/identify", ...relayGuards, (req, res) => {
    const b = req.body || {};
    const extVisitor = idField(b.externalVisitorId, "externalVisitorId");
    const w = repo.getWorkspace(req.relay.workspaceId);
    const v = verifyIdentity(w, b.identityToken, extVisitor);
    repo.touchChannel(w.id, req.relay.channelId);
    res.json({ verified: Boolean(v), expiresAt: v ? new Date(v.claims.exp * 1000).toISOString() : null });
  });

  route("get", "/v1/relay/config", ...relayGuards, (req, res) => {
    const w = repo.getWorkspace(req.relay.workspaceId);
    repo.touchChannel(w.id, req.relay.channelId);
    res.json({ aiEnabled: w.settings.aiLive && llm.isConfigured(), fallbackMessage: ctx.core.HANDOFF_TEXT, languages: w.settings.languages });
  });
};

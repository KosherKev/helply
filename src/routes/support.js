"use strict";
/** Customer-facing support endpoints, conversations (dashboard), takeover, agent replies, review queue, SSE. */
const { HttpError } = require("../errors");
const { verify } = require("../identity/token");
const { similarity } = require("../language");
const { scrubString } = require("../logs/redact");

const HOLD_TEXT = "A team member is checking this reply and will answer you shortly.";
const TEAM_TEXT = "A team member is handling this conversation and will reply here.";
const STATUSES = new Set(["ai", "needs_human", "human", "resolved"]);

module.exports = (ctx) => {
  const { config, repo, route, ah, agent, language, khaya, llm, bus, auth, requireLlm, ipLimiter } = ctx;
  const { guard } = auth;

  // ── tenant + identity resolution for CUSTOMER calls ───────────────────
  // The tenant comes from the credential: the token's `tenant` claim only selects WHICH secret to verify with;
  // the token is accepted only if its signature checks out against that workspace's own secret.
  const decodeTenant = (token) => {
    try {
      const claims = JSON.parse(Buffer.from(String(token).split(".")[1] || "", "base64url").toString("utf8"));
      return typeof claims.tenant === "string" ? claims.tenant : null;
    } catch {
      return null;
    }
  };
  const resolveCustomer = (token, publicKey) => {
    if (typeof token === "string" && token) {
      const tenant = decodeTenant(token);
      const w = tenant ? repo.findWorkspaceByIdOrSlug(tenant) : ctx.defaultEnabled ? repo.getWorkspace(ctx.defaultWorkspaceId) : null;
      if (w) {
        const identity = verify(token, ctx.identitySecret(w), { maxAgeSeconds: config.tokenMaxAgeSeconds });
        if (identity.ok) return { workspace: w, identity };
      }
    }
    if (typeof publicKey === "string" && publicKey) {
      const w = repo.getWorkspaceByPublicKey(publicKey);
      if (w) return { workspace: w, identity: null };
    }
    return ctx.defaultEnabled ? { workspace: repo.getWorkspace(ctx.defaultWorkspaceId), identity: null } : null;
  };

  const wsSupportHits = new Map();
  const workspaceLimit = (wsId) => {
    const now = Date.now();
    const recent = (wsSupportHits.get(wsId) || []).filter((t) => now - t < 60_000);
    if (recent.length >= config.rate.supportPerWorkspacePerMin) throw new HttpError(429, "rate_limited", "Too many requests for this workspace");
    recent.push(now);
    wsSupportHits.set(wsId, recent);
  };

  const handleCustomer = async (req, { text, token, languageHint, conversationId, extra = {} }) => {
    const message = typeof text === "string" ? text.trim() : "";
    if (!message) throw new HttpError(400, "message_required", "A message is required");
    if (message.length > config.limits.maxMessageChars) throw new HttpError(400, "message_too_long", "Message is too long");
    const resolved = resolveCustomer(token, req.body?.publicKey || req.get("x-helply-public-key"));
    if (!resolved) throw new HttpError(400, "workspace_required", "Send a signed customer token or a workspace public key");
    const w = resolved.workspace;
    workspaceLimit(w.id);
    const customerId = resolved.identity?.claims.userId || null;
    const customerName = resolved.identity?.claims.name || null;

    let conv = null;
    if (conversationId !== undefined && conversationId !== null) {
      conv = repo.getConversation(w.id, String(conversationId));
      // A conversation bound to a verified customer can only be continued by that same verified customer.
      if (!conv || (conv.customerId && conv.customerId !== customerId)) throw new HttpError(404, "conversation_not_found", "Conversation not found");
    }
    if (!conv) conv = repo.createConversation(w.id, { customerId, customerName, language: languageHint || "en" });
    else if (!conv.customerId && customerId) conv = repo.updateConversation(w.id, conv.id, { customerName });
    if (!conv.customerId && customerId) repo.db.prepare("UPDATE conversations SET customer_id = ? WHERE workspace_id = ? AND id = ? AND customer_id IS NULL").run(customerId, w.id, conv.id);

    if (conv.status === "human") {
      const m = repo.addMessage(w.id, conv.id, { role: "customer", text: message, english: null, language: conv.language });
      ctx.notify(w.id, "message.customer", { conversationId: conv.id });
      return {
        verified: Boolean(resolved.identity), user: resolved.identity ? { id: customerId, name: customerName } : null, requiresAuth: false, needsHuman: true,
        understanding: { language: conv.language, languageName: language.names[conv.language] || conv.language, english: message, intent: "human_request" },
        reply: { language: "en", english: TEAM_TEXT, text: TEAM_TEXT }, roundTrip: null, evidence: null, rootCause: null, ticketId: null, trace: [],
        conversationId: conv.id, messageId: m.id, handledBy: "human", ...extra,
      };
    }

    const history = repo.listMessages(w.id, conv.id, { limit: 12, sentOnly: true }).map((m) => ({ role: m.role === "customer" ? "customer" : "assistant", text: m.english || m.text }));
    const settings = w.settings;
    const result = await agent.handleMessage({
      text: message, token: resolved.identity ? token : undefined, languageHint,
      ctx: {
        store: ctx.store.forWorkspace(w.id), cls: ctx.logSourceFor(w), jwtSecret: ctx.identitySecret(w), roundTripThreshold: settings.escalationThreshold,
        history, conversationId: conv.id,
        audit: ({ action, detail }) => repo.addAudit(w.id, { actorType: "customer", actorId: customerId, action, detail }),
      },
    });

    const lang = result.understanding.language;
    repo.addMessage(w.id, conv.id, { role: "customer", text: message, english: result.understanding.english, language: lang, intent: result.understanding.intent, meta: { understanding: result.understanding } });
    const held = Boolean(result.roundTrip?.reviewRecommended && settings.holdFlaggedReplies);
    const ai = repo.addMessage(w.id, conv.id, {
      role: "ai", text: result.reply.text, english: result.reply.english, language: lang, status: held ? "pending_review" : "sent",
      reviewRecommended: Boolean(result.roundTrip?.reviewRecommended),
      meta: { roundTrip: result.roundTrip, evidence: result.evidence, rootCause: result.rootCause, trace: result.trace, ticketId: result.ticketId, needsHuman: result.needsHuman, requiresAuth: result.requiresAuth, understanding: result.understanding },
    });
    const wasHandedOff = conv.handedOff;
    repo.updateConversation(w.id, conv.id, {
      language: lang, status: result.needsHuman ? "needs_human" : "ai", handedOff: wasHandedOff || result.needsHuman,
      firstResponseMs: conv.firstResponseMs ?? result.trace[result.trace.length - 1]?.ms ?? null, customerName: customerName || conv.customerName,
    });

    if (result.ticketId) {
      const t = repo.getTicket(w.id, result.ticketId);
      ctx.notify(w.id, "ticket.created", { ticket: t });
      if (t.status === "needs_human") ctx.notify(w.id, "ticket.needs_human", { ticket: t });
    }
    if (result.needsHuman && !wasHandedOff) ctx.notify(w.id, "conversation.handoff", { conversationId: conv.id, customerId });
    ctx.notify(w.id, "message.customer", { conversationId: conv.id });
    if (held) {
      ctx.notify(w.id, "reply.needs_review", { conversationId: conv.id, messageId: ai.id });
      result.reply = { language: "en", english: HOLD_TEXT, text: HOLD_TEXT };
    }
    return { ...result, conversationId: conv.id, messageId: ai.id, handledBy: "ai", ...(held ? { held: true } : {}), ...extra };
  };

  // ── public endpoints ──────────────────────────────────────────────────
  route("post", "/v1/demo/token", (req, res, next) => {
    if (!config.demoMode) return next(new HttpError(404, "not_found", "Not found"));
    if (!config.jwtSecret) return next(new HttpError(503, "identity_not_configured", "Set HELPLY_JWT_SECRET"));
    const user = ctx.DEMO_USERS.find((u) => u.id === req.body?.userId);
    if (!user) return next(new HttpError(400, "unknown_demo_user", "Unknown demo user"));
    const token = require("../identity/token").sign({ sub: user.id, name: user.name, tenant: "demo-shop" }, config.jwtSecret, { ttlSeconds: config.tokenMaxAgeSeconds });
    return res.json({ token, user, expiresIn: config.tokenMaxAgeSeconds });
  });

  route("post", "/v1/support/message", ipLimiter(config.rate.supportPerIpPerMin), requireLlm, ah(async (req, res) => {
    const { message, token, language: languageHint, conversationId } = req.body || {};
    res.json(await handleCustomer(req, { text: message, token, languageHint, conversationId }));
  }));

  route("post", "/v1/support/voice", ipLimiter(config.rate.supportPerIpPerMin), requireLlm, ah(async (req, res) => {
    if (!khaya.isConfigured()) throw new HttpError(501, "voice_not_configured", "Set KHAYA_API_KEY");
    const { audioBase64, language: lang = "tw", token, conversationId } = req.body || {};
    if (typeof audioBase64 !== "string" || !audioBase64) throw new HttpError(400, "audio_required", "audioBase64 is required");
    const audio = Buffer.from(audioBase64, "base64");
    if (!audio.length || audio.length > config.limits.maxAudioBytes) throw new HttpError(400, "audio_size", "Audio must be under 5 MB");
    const transcript = await khaya.transcribe(audio, language.asrCode(lang));
    const result = await handleCustomer(req, { text: transcript, token, languageHint: lang, conversationId });
    let replyAudio = null;
    try {
      const wav = await khaya.synthesize(result.reply.text, language.ttsCode(result.reply.language));
      replyAudio = { mimeType: "audio/wav", base64: wav.toString("base64") };
    } catch {
      /* text reply is still returned */
    }
    res.json({ transcript, ...result, replyAudio });
  }));

  // Customer polling for agent replies after a takeover (customer-side SSE is PLANNED).
  route("get", "/v1/support/conversations/:id/messages", ipLimiter(120), ah(async (req, res) => {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const resolved = resolveCustomer(token, req.get("x-helply-public-key"));
    if (!resolved) throw new HttpError(400, "workspace_required", "Send a signed customer token or a workspace public key");
    const conv = repo.getConversation(resolved.workspace.id, req.params.id);
    const customerId = resolved.identity?.claims.userId || null;
    if (!conv || (conv.customerId && conv.customerId !== customerId)) throw new HttpError(404, "conversation_not_found", "Conversation not found");
    const messages = repo.listMessages(resolved.workspace.id, conv.id, { sentOnly: true, afterId: req.query.after ? String(req.query.after) : null })
      .filter((m) => m.role !== "customer")
      .map((m) => ({ id: m.id, role: m.role, text: m.text, english: m.english, language: m.language, createdAt: m.createdAt }));
    res.json({ status: conv.status, messages });
  }));

  // ── conversations (dashboard) ─────────────────────────────────────────
  const userOnly = (req) => {
    if (req.principal.type === "apikey") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
  };
  const loadConv = (req) => {
    const c = repo.getConversation(ctx.wsOf(req), req.params.id);
    if (!c) throw new HttpError(404, "not_found", "Conversation not found");
    return c;
  };

  route("get", "/v1/conversations", guard({ role: "agent", scope: "conversations:read" }), (req, res, next) => {
    const { status, language: lang, q, userId, from, to, limit, cursor } = req.query;
    if (status && !STATUSES.has(status)) return next(new HttpError(400, "invalid_status", "Unknown status"));
    return res.json(repo.listConversations(ctx.wsOf(req), { status, language: lang, q: q && String(q).slice(0, 100), userId, from, to, limit, cursor }));
  });

  route("get", "/v1/conversations/:id", guard({ role: "agent", scope: "conversations:read" }), (req, res) => {
    const c = loadConv(req);
    const ws = ctx.wsOf(req);
    const tickets = repo.listTickets(ws, { limit: 100 }).data.filter((t) => t.conversationId === c.id).map((t) => t.id);
    res.json({ ...c, messages: repo.listMessages(ws, c.id), ticketIds: tickets });
  });

  route("post", "/v1/conversations/:id/takeover", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    const c = loadConv(req);
    const u = repo.updateConversation(ctx.wsOf(req), c.id, { status: "human", handedOff: true, assigneeId: req.principal.userId || null });
    ctx.audit(req, "conversation_takeover", { conversationId: c.id });
    ctx.notify(ctx.wsOf(req), "conversation.handoff", { conversationId: c.id, takenBy: req.principal.userId || null });
    res.json(u);
  });

  route("post", "/v1/conversations/:id/resolve", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    const c = loadConv(req);
    ctx.audit(req, "conversation_resolved", { conversationId: c.id });
    res.json(repo.updateConversation(ctx.wsOf(req), c.id, { status: "resolved" }));
  });

  /** Translate an English draft for the customer and run the same back-translation check (nothing is sent). */
  const previewTranslation = async (conv, text) => {
    if (conv.language === "en") return { text, english: text, roundTrip: null };
    const loc = await language.fromEnglish(text, conv.language);
    const back = await language.toEnglish(loc.text, conv.language);
    const sim = Math.round(similarity(text, back.text) * 100) / 100;
    return { text: loc.text, english: text, roundTrip: { backTranslation: back.text, similarity: sim, reviewRecommended: false, provider: loc.provider } };
  };
  const withThreshold = (ws, p) => {
    if (p.roundTrip) p.roundTrip.reviewRecommended = p.roundTrip.similarity < repo.getWorkspace(ws).settings.escalationThreshold;
    return p;
  };
  const draftText = (body) => {
    const text = typeof body?.text === "string" ? scrubString(body.text.trim()) : "";
    if (!text) throw new HttpError(400, "text_required", "Reply text is required");
    if (text.length > config.limits.maxMessageChars) throw new HttpError(400, "message_too_long", "Reply is too long");
    return text;
  };

  route("post", "/v1/conversations/:id/translate-preview", guard({ role: "agent" }), requireLlm, ah(async (req, res) => {
    userOnly(req);
    const c = loadConv(req);
    res.json(withThreshold(ctx.wsOf(req), await previewTranslation(c, draftText(req.body)).catch(() => { throw new HttpError(502, "translation_failed", "Could not translate right now"); })));
  }));

  route("post", "/v1/conversations/:id/messages", guard({ role: "agent" }), ah(async (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    const c = loadConv(req);
    const text = draftText(req.body);
    const mode = req.body.language === "customer" ? "customer" : "en";
    let out = { text, english: c.language === "en" ? text : null, roundTrip: null };
    if (mode === "en" && c.language !== "en") {
      if (!llm.isConfigured() && !khaya.isConfigured()) throw new HttpError(503, "llm_not_configured", "Set GEMMA_API_KEY");
      out = withThreshold(ws, await previewTranslation(c, text).catch(() => { throw new HttpError(502, "translation_failed", "Could not translate right now"); }));
    }
    const hold = Boolean(out.roundTrip?.reviewRecommended && repo.getWorkspace(ws).settings.holdFlaggedReplies);
    const m = repo.addMessage(ws, c.id, {
      role: "agent", text: out.text, english: out.english, language: c.language, status: hold ? "pending_review" : "sent",
      reviewRecommended: Boolean(out.roundTrip?.reviewRecommended), meta: { roundTrip: out.roundTrip }, authorId: req.principal.userId,
    });
    repo.updateConversation(ws, c.id, { status: "human", handedOff: true, assigneeId: req.principal.userId });
    ctx.audit(req, "agent_reply", { conversationId: c.id, messageId: m.id, held: hold });
    if (hold) ctx.notify(ws, "reply.needs_review", { conversationId: c.id, messageId: m.id });
    res.status(201).json({ message: m, roundTrip: out.roundTrip, held: hold });
  }));

  // ── review queue ──────────────────────────────────────────────────────
  route("get", "/v1/replies/pending", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    res.json({
      data: repo.listPendingMessages(ws).map((m) => {
        const msgs = repo.listMessages(ws, m.conversationId, { limit: 100 });
        const lastCustomer = [...msgs].reverse().find((x) => x.role === "customer");
        return { id: m.id, conversationId: m.conversationId, role: m.role, text: m.text, english: m.english, language: m.language, roundTrip: m.meta?.roundTrip || null, customerMessage: lastCustomer?.english || lastCustomer?.text || null, createdAt: m.createdAt };
      }),
    });
  });

  const loadPending = (req) => {
    const m = repo.getMessage(ctx.wsOf(req), req.params.id);
    if (!m || m.status !== "pending_review") throw new HttpError(404, "not_found", "No pending reply with that id");
    return m;
  };
  route("post", "/v1/replies/:id/approve", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    const m = loadPending(req);
    const edited = typeof req.body?.text === "string" && req.body.text.trim() ? scrubString(req.body.text.trim()).slice(0, config.limits.maxMessageChars) : undefined;
    const out = repo.updateMessage(ws, m.id, { text: edited, status: "sent" });
    ctx.audit(req, "reply_approved", { messageId: m.id, edited: Boolean(edited) });
    res.json(out);
  });
  route("post", "/v1/replies/:id/reject", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    const m = loadPending(req);
    const out = repo.updateMessage(ws, m.id, { status: "rejected" });
    repo.updateConversation(ws, m.conversationId, { status: "needs_human", handedOff: true });
    ctx.audit(req, "reply_rejected", { messageId: m.id });
    res.json(out);
  });

  // ── dashboard SSE ─────────────────────────────────────────────────────
  route("get", "/v1/events", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
    res.flushHeaders();
    res.write(": connected\n\n");
    const off = bus.subscribe(ctx.wsOf(req), (e) => res.write(`event: ${e.type}\ndata: ${JSON.stringify({ at: e.at, ...e.data })}\n\n`));
    const beat = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.on("close", () => {
      clearInterval(beat);
      off();
    });
  });
};

"use strict";
/**
 * The one place a customer turn is run and recorded, shared by the direct support API and the ChatFlow relay so both get
 * identical identity, scoping, redaction, persistence, ticketing and notification behaviour.
 * Callers decide WHICH workspace and WHICH verified identity; this module never reads either from request input.
 */
const { FALLBACK } = require("../agent/supportAgent");

const HOLD_TEXT = "A team member is checking this reply and will answer you shortly.";

module.exports = (ctx) => {
  const { repo, agent } = ctx;

  /** Store the customer's message without any AI work (person is handling it, or the AI is paused/suppressed). */
  const storeOnly = (w, conv, message, { handoff = false } = {}) => {
    const m = repo.addMessage(w.id, conv.id, { role: "customer", text: message, english: null, language: conv.language });
    if (handoff && conv.status !== "human") {
      const wasHandedOff = conv.handedOff;
      repo.updateConversation(w.id, conv.id, { status: "needs_human", handedOff: true });
      if (!wasHandedOff) ctx.notify(w.id, "conversation.handoff", { conversationId: conv.id, customerId: conv.customerId });
    }
    ctx.notify(w.id, "message.customer", { conversationId: conv.id });
    return m;
  };

  /** Run the full AI pipeline for one message and persist everything. */
  const converse = async ({ workspace: w, identity, token, conv, message, languageHint, visitorId, test = false, trustedIdentity }) => {
    // A test run is real (real logs, real model) but never notifies anyone: no webhooks, SSE or review-queue noise.
    const notify = test ? () => {} : ctx.notify;
    const customerId = identity?.claims.userId || null;
    const customerName = identity?.claims.name || null;
    const history = repo.listMessages(w.id, conv.id, { limit: 12, sentOnly: true }).map((m) => ({ role: m.role === "customer" ? "customer" : "assistant", text: m.english || m.text }));
    const settings = w.settings;
    const result = await agent.handleMessage({
      text: message, token: identity ? token : undefined, languageHint,
      ctx: {
        store: ctx.store.forWorkspace(w.id), cls: ctx.logSourceFor(w), jwtSecret: ctx.identitySecret(w), identityKey: ctx.identityVerify(w), trustedIdentity, roundTripThreshold: settings.escalationThreshold, tone: repo.getBusinessProfile(w.id).tone, playbooks: repo.listPlaybooks(w.id), rules: repo.getHandoffRules(w.id),
        history, conversationId: conv.id, visitorId,
        audit: ({ action, detail }) => repo.addAudit(w.id, { actorType: "customer", actorId: customerId, action, detail: test ? { ...detail, test: true } : detail }),
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

    // A question nobody could answer is a knowledge gap, unless this was a test run or the customer asked for a person.
    if (!test && result.trace.some((t) => t.step === "knowledge" && t.answered === false) && result.understanding.intent !== "human_request") {
      repo.recordGap(w.id, { question: result.understanding.english, language: lang, conversationId: conv.id });
    }
    if (result.ticketId) {
      const t = repo.getTicket(w.id, result.ticketId);
      notify(w.id, "ticket.created", { ticket: t });
      if (t.status === "needs_human") notify(w.id, "ticket.needs_human", { ticket: t });
    }
    if (result.needsHuman && !wasHandedOff) notify(w.id, "conversation.handoff", { conversationId: conv.id, customerId });
    notify(w.id, "message.customer", { conversationId: conv.id });
    if (held) {
      notify(w.id, "reply.needs_review", { conversationId: conv.id, messageId: ai.id });
      result.reply = { language: "en", english: HOLD_TEXT, text: HOLD_TEXT };
    }
    return { ...result, conversationId: conv.id, messageId: ai.id, handledBy: "ai", ...(held ? { held: true } : {}) };
  };

  return { converse, storeOnly, HANDOFF_TEXT: FALLBACK.handoff };
};

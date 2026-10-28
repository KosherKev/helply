"use strict";
/**
 * The support pipeline.
 *   identity -> understand (+translate in) -> route -> answer -> translate out -> round-trip check
 * Account questions are answered ONLY from validated, redacted, user-scoped log evidence.
 */
const { verify } = require("../identity/token");
const { buildEvidence } = require("../logs/evidence");
const { scrubString } = require("../logs/redact");
const { similarity } = require("../language");
const { HttpError } = require("../errors");
const P = require("./prompts");

const FALLBACK = {
  handoff: "I will pass this to a team member, and they will reply as soon as they can.",
  signIn: "To look into your account, please sign in first, then ask me again.",
  noEvidence: "I could not find anything in your recent activity that explains this. I have sent it to our team to check.",
  logsDown: "I cannot look at your account activity right now. I have sent this to our team to check.",
};
const INTENTS = new Set(["general_question", "account_issue", "human_request", "other"]);
const LANGS = new Set(["en", "tw", "gaa", "ee", "fat", "dag", "pcm"]);

const clamp01 = (n) => (Number.isFinite(Number(n)) ? Math.min(1, Math.max(0, Number(n))) : 0);
const round2 = (n) => Math.round(n * 100) / 100;

/** Final guard on anything customer-facing or developer-facing the model wrote. */
const cleanText = (text, max = 400) =>
  scrubString(String(text ?? ""))
    .replace(/<[^>]*>/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[`*#>]/g, "") // markdown characters; underscores stay so identifiers like ORDER_UPDATE_FAILED survive
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const createSupportAgent = ({ config, llm, language, store, fetchImpl = fetch, now = () => Date.now() }) => {
  const understand = async (message, hint, history = []) => {
    const fallback = { language: LANGS.has(hint) ? hint : "en", english: message, intent: "general_question", hints: {} };
    try {
      const r = await llm.generate({
        system: P.UNDERSTAND,
        user: `${history.length ? `<conversation_so_far>\n${history.map((h) => `${h.role}: ${P.escape(h.text)}`).join("\n")}\n</conversation_so_far>\n` : ""}<customer_message>${P.escape(message)}</customer_message>`,
        json: true,
        maxOutputTokens: 400,
      });
      const j = r.json;
      if (!j || typeof j !== "object") return fallback;
      return {
        language: LANGS.has(j.language) ? j.language : fallback.language,
        english: typeof j.english === "string" && j.english.trim() ? j.english.trim().slice(0, 1200) : message,
        intent: INTENTS.has(j.intent) ? j.intent : "general_question",
        hints: j.hints && typeof j.hints === "object" ? j.hints : {},
      };
    } catch {
      return fallback;
    }
  };

  const answerFromKnowledge = async (english, scoped) => {
    const chunks = scoped.retrieve(english, 3);
    if (!chunks.length) return null;
    const knowledge = chunks.map((c) => `[${c.title}] ${P.escape(c.text)}`).join("\n---\n");
    const r = await llm.generate({
      system: P.KB,
      user: `<knowledge>\n${knowledge}\n</knowledge>\n<customer_message>${P.escape(english)}</customer_message>`,
      maxOutputTokens: 300,
    });
    if (r.text.includes(P.NO_ANSWER)) return null;
    return { text: cleanText(r.text), sources: chunks.map((c) => c.title) };
  };

  const explainFromLogs = async (english, ev) => {
    const ids = new Set(ev.lines.map((l) => l.id));
    const r = await llm.generate({
      system: P.EXPLAIN,
      user: `<customer_message>${P.escape(english)}</customer_message>\n<log_evidence>\n${ev.lines.map((l) => JSON.stringify(l)).join("\n")}\n</log_evidence>`,
      json: true,
      maxOutputTokens: 600,
    });
    const j = r.json;
    if (!j || typeof j !== "object") return { found: false };
    const cited = Array.isArray(j.cited_lines) ? [...new Set(j.cited_lines.filter((id) => ids.has(id)))] : [];
    const found = j.found === true && cited.length > 0 && typeof j.customer_reply === "string" && j.customer_reply.trim();
    if (!found) return { found: false };
    return {
      found: true,
      customerReply: cleanText(j.customer_reply),
      rootCause: cleanText(j.root_cause, 300),
      suggestedFix: cleanText(j.suggested_fix, 300),
      citedLines: cited,
      confidence: round2(clamp01(j.confidence)),
      needsHuman: j.needs_human === true,
    };
  };

  /**
   * @param {{text:string, token?:string, languageHint?:string, ctx?:object}} input
   * `ctx` carries the per-request workspace: { store, cls, jwtSecret, roundTripThreshold, history, conversationId, audit }.
   * The server derives it from the credential, never from the request body.
   */
  const handleMessage = async ({ text, token, languageHint, ctx = {} } = {}) => {
    const S = ctx.store || store;
    const cls = ctx.cls === undefined ? config.cls : ctx.cls;
    const secret = ctx.jwtSecret === undefined ? config.jwtSecret : ctx.jwtSecret;
    const threshold = ctx.roundTripThreshold ?? config.roundTripThreshold;
    const conversationId = ctx.conversationId || null;
    const audit = ctx.audit || (() => {});
    const t0 = now();
    const trace = [];
    const mark = (step, detail = {}) => trace.push({ step, ms: now() - t0, ...detail });

    const message = typeof text === "string" ? text.trim() : "";
    if (!message) throw new HttpError(400, "message_required", "A message is required");
    if (message.length > config.limits.maxMessageChars) throw new HttpError(400, "message_too_long", "Message is too long");

    const identity = token
      ? verify(token, secret, { visitorId: ctx.visitorId, now: now(), maxAgeSeconds: config.tokenMaxAgeSeconds })
      : { ok: false, reason: "none" };
    mark("identity", { verified: identity.ok, ...(identity.ok ? {} : { reason: identity.reason }) });

    const u = await understand(message, languageHint, (ctx.history || []).slice(-6));
    mark("understand", { language: u.language, intent: u.intent, model: llm.model });

    let english = u.english;
    if (u.language !== "en") {
      try {
        const r = await language.toEnglish(message, u.language);
        english = r.text;
        mark("translate_in", { provider: r.provider });
      } catch {
        mark("translate_in", { provider: "model-understanding" });
      }
    }

    let replyEnglish;
    let evidence = null;
    let rootCause = null;
    let ticket = null;
    let requiresAuth = false;
    let needsHuman = false;

    if (u.intent === "human_request") {
      replyEnglish = FALLBACK.handoff;
      needsHuman = true;
      ticket = S.createTicket({ conversationId, title: "Customer asked for a person", userId: identity.ok ? identity.claims.userId : null, language: u.language, customerMessage: english, replyEnglish, status: "needs_human" });
    } else if (u.intent === "account_issue") {
      if (!identity.ok) {
        replyEnglish = FALLBACK.signIn;
        requiresAuth = true;
      } else {
        let ev = null;
        try {
          ev = await buildEvidence({
            cls,
            userId: identity.claims.userId, // verified identity only
            hints: u.hints,
            now: now(),
            fetchImpl,
            maxLines: config.limits.evidenceLines,
            queryLimit: config.limits.logQueryLimit,
          });
          mark("logs", { fetched: ev.meta.fetched, kept: ev.meta.kept, droppedForScope: ev.meta.droppedForScope });
          audit({ action: "log_lookup", detail: { userId: identity.claims.userId, conversationId, fetched: ev.meta.fetched, kept: ev.meta.kept, droppedForScope: ev.meta.droppedForScope } });
        } catch (err) {
          mark("logs", { error: err.name });
          audit({ action: "log_lookup", detail: { userId: identity.claims.userId, conversationId, error: err.name } });
        }

        if (!ev) {
          replyEnglish = FALLBACK.logsDown;
          needsHuman = true;
          ticket = S.createTicket({ conversationId, title: "Log lookup unavailable", userId: identity.claims.userId, language: u.language, customerMessage: english, replyEnglish, status: "needs_human" });
        } else if (!ev.lines.length) {
          replyEnglish = FALLBACK.noEvidence;
          needsHuman = true;
          ticket = S.createTicket({ conversationId, title: "No matching activity found", userId: identity.claims.userId, language: u.language, customerMessage: english, replyEnglish, status: "needs_human" });
        } else {
          const ex = await explainFromLogs(english, ev);
          mark("explain", { found: ex.found, model: llm.model });
          if (ex.found) {
            evidence = ev.lines.filter((l) => ex.citedLines.includes(l.id));
            rootCause = { summary: ex.rootCause, suggestedFix: ex.suggestedFix, citedLines: ex.citedLines, confidence: ex.confidence };
            replyEnglish = ex.customerReply;
            needsHuman = ex.needsHuman;
            ticket = S.createTicket({ conversationId,
              title: ex.rootCause.slice(0, 120),
              userId: identity.claims.userId,
              language: u.language,
              customerMessage: english,
              replyEnglish,
              rootCause,
              evidence,
              status: ex.needsHuman ? "needs_human" : "open",
            });
          } else {
            replyEnglish = FALLBACK.noEvidence;
            needsHuman = true;
            ticket = S.createTicket({ conversationId, title: "Logs did not explain the issue", userId: identity.claims.userId, language: u.language, customerMessage: english, replyEnglish, evidence: ev.lines.slice(0, 5), status: "needs_human" });
          }
        }
      }
    } else {
      let kb = null;
      try {
        kb = await answerFromKnowledge(english, S);
      } catch {
        kb = null;
      }
      mark("knowledge", { answered: Boolean(kb), sources: kb?.sources });
      if (kb) {
        replyEnglish = kb.text;
      } else {
        replyEnglish = FALLBACK.handoff;
        needsHuman = true;
        ticket = S.createTicket({ conversationId, title: "Question not covered by the knowledge base", userId: identity.ok ? identity.claims.userId : null, language: u.language, customerMessage: english, replyEnglish, status: "needs_human" });
      }
    }

    const reply = { language: u.language, english: replyEnglish, text: replyEnglish };
    let roundTrip = null;
    if (u.language !== "en") {
      try {
        const loc = await language.fromEnglish(replyEnglish, u.language);
        reply.text = loc.text;
        const back = await language.toEnglish(loc.text, u.language);
        const sim = round2(similarity(replyEnglish, back.text));
        roundTrip = { backTranslation: back.text, similarity: sim, reviewRecommended: sim < threshold, provider: loc.provider };
        mark("translate_out", { provider: loc.provider, similarity: sim });
      } catch {
        mark("translate_out", { error: true });
      }
    }

    mark("done");
    return {
      verified: identity.ok,
      user: identity.ok ? { id: identity.claims.userId, name: identity.claims.name } : null,
      requiresAuth,
      needsHuman,
      understanding: { language: u.language, languageName: language.names[u.language] || u.language, english, intent: u.intent },
      reply,
      roundTrip,
      evidence,
      rootCause,
      ticketId: ticket?.id || null,
      trace,
    };
  };

  return { handleMessage };
};

module.exports = { createSupportAgent, cleanText, FALLBACK };

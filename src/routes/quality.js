"use strict";
/** Inbox counts and assignment, issues, playbooks, handoff rules, knowledge gaps, feedback and quality. */
const { HttpError } = require("../errors");
const { scrubString } = require("../logs/redact");

const ISSUE_STATUS = ["open", "investigating", "fixed", "wont_fix"];
const SEVERITY = ["low", "normal", "high"];
const OUTSIDE = ["ai_only", "handoff", "ai_and_notify"];
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const REASONS = ["wrong", "unclear", "translation", "tone", "other"];

module.exports = (ctx) => {
  const { repo, route, auth } = ctx;
  const { guard } = auth;
  const ws = ctx.wsOf;
  const userOnly = (req) => {
    if (req.principal.type === "apikey") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
  };
  const str = (v, name, { max, min = 0, required = false, nullable = false }) => {
    if (v === undefined || v === null || v === "") {
      if (required) throw new HttpError(400, "invalid_request", `${name} is required`);
      return nullable ? null : "";
    }
    if (typeof v !== "string" || v.trim().length < min || v.trim().length > max) throw new HttpError(400, "invalid_request", `${name} must be ${min || 1} to ${max} characters`);
    return v.trim();
  };

  // ── inbox ─────────────────────────────────────────────────────────────
  route("get", "/v1/inbox/counts", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    res.json(repo.inboxCounts(ws(req), req.principal.userId));
  });

  route("patch", "/v1/conversations/:id", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    const c = repo.getConversation(ws(req), req.params.id);
    if (!c) throw new HttpError(404, "not_found", "Conversation not found");
    const { assigneeId } = req.body || {};
    if (assigneeId === undefined) throw new HttpError(400, "invalid_request", "assigneeId is required (or null to unassign)");
    if (assigneeId !== null && !repo.getMembership(ws(req), String(assigneeId))) throw new HttpError(400, "invalid_assignee", "Assignee is not a member of this workspace");
    const out = repo.updateConversation(ws(req), c.id, { assigneeId });
    ctx.audit(req, "conversation_assigned", { conversationId: c.id, assigneeId });
    res.json(out);
  });

  // ── issues ────────────────────────────────────────────────────────────
  const loadIssue = (req) => {
    const i = repo.getIssue(ws(req), req.params.id);
    if (!i) throw new HttpError(404, "not_found", "Issue not found");
    return i;
  };
  route("get", "/v1/issues", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    const { status, q, limit, cursor } = req.query;
    if (status && !ISSUE_STATUS.includes(status)) throw new HttpError(400, "invalid_status", "Unknown status");
    res.json(repo.listIssues(ws(req), { status, q: q && String(q).slice(0, 100), limit, cursor }));
  });
  route("get", "/v1/issues/:id", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    res.json(loadIssue(req));
  });
  route("patch", "/v1/issues/:id", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    const cur = loadIssue(req);
    const { status, assigneeId } = req.body || {};
    if (status !== undefined && !ISSUE_STATUS.includes(status)) throw new HttpError(400, "invalid_status", "Unknown status");
    if (assigneeId !== undefined && assigneeId !== null && !repo.getMembership(ws(req), String(assigneeId))) throw new HttpError(400, "invalid_assignee", "Assignee is not a member of this workspace");
    const out = repo.updateIssue(ws(req), cur.id, { status, assigneeId });
    ctx.audit(req, "issue_status_changed", { issueId: cur.id, status, assigneeId });
    res.json(out);
  });
  route("get", "/v1/issues/:id/export", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    const i = loadIssue(req);
    const ev = i.evidence.map((l) => `${l.id} ${l.time} ${l.level} ${l.method || ""} ${l.path || ""} ${l.status ?? ""}${l.error ? ` ${l.error.code || ""} ${l.error.message}` : ""}`.replace(/\s+/g, " ").trim());
    res.json({
      title: `[${i.id}] ${i.summary.slice(0, 100)}`,
      body: [`## Customer impact`, `${i.affectedCustomers} customer(s) affected across ${i.count} report(s), first seen ${i.firstSeen}, last seen ${i.lastSeen}.`, ``, `## Root cause`, i.summary, ``, `## Suggested fix`, i.suggestedFix || "Needs investigation.", ``, `## Evidence (latest ticket)`, "```", ev.length ? ev.join("\n") : "No log lines attached.", "```", ``, `_Tickets: ${i.ticketIds.join(", ")}_`].join("\n"),
    });
  });

  // ── playbooks ─────────────────────────────────────────────────────────
  const pbFields = (b, partial) => {
    const o = {};
    const has = (k) => !partial || b[k] !== undefined;
    if (has("errorCode")) { o.errorCode = str(b.errorCode, "errorCode", { max: 80, required: true }); if (!/^[A-Za-z0-9_.:-]+$/.test(o.errorCode)) throw new HttpError(400, "invalid_request", "errorCode may use letters, digits and _ . : -"); }
    if (has("title")) o.title = str(b.title, "title", { max: 120, required: true });
    if (has("customerWording")) o.customerWording = scrubString(str(b.customerWording, "customerWording", { max: 500, required: true }));
    if (b.pathPattern !== undefined) o.pathPattern = str(b.pathPattern, "pathPattern", { max: 200, nullable: true });
    if (b.internalNote !== undefined) o.internalNote = scrubString(str(b.internalNote, "internalNote", { max: 1000, nullable: true }) || "") || null;
    if (b.ownerTeam !== undefined) o.ownerTeam = str(b.ownerTeam, "ownerTeam", { max: 80, nullable: true });
    if (b.severity !== undefined) { if (!SEVERITY.includes(b.severity)) throw new HttpError(400, "invalid_request", "severity must be low, normal or high"); o.severity = b.severity; }
    for (const k of ["alwaysHandoff", "enabled"]) if (b[k] !== undefined) { if (typeof b[k] !== "boolean") throw new HttpError(400, "invalid_request", `${k} must be a boolean`); o[k] = b[k]; }
    return o;
  };
  const loadPb = (req) => {
    const p = repo.getPlaybook(ws(req), req.params.id);
    if (!p) throw new HttpError(404, "not_found", "Playbook not found");
    return p;
  };
  route("get", "/v1/playbooks/suggestions", guard({ role: "agent" }), (req, res) => { userOnly(req); res.json({ data: repo.playbookSuggestions(ws(req)) }); });
  route("get", "/v1/playbooks", guard({ role: "agent" }), (req, res) => { userOnly(req); res.json({ data: repo.listPlaybooks(ws(req)) }); });
  route("post", "/v1/playbooks", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const out = repo.createPlaybook(ws(req), pbFields(req.body || {}, false));
    ctx.audit(req, "playbook_created", { playbookId: out.id, errorCode: out.errorCode });
    res.status(201).json(out);
  });
  route("put", "/v1/playbooks/:id", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const cur = loadPb(req);
    const out = repo.updatePlaybook(ws(req), cur.id, pbFields(req.body || {}, true));
    ctx.audit(req, "playbook_updated", { playbookId: cur.id });
    res.json(out);
  });
  route("delete", "/v1/playbooks/:id", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const cur = loadPb(req);
    repo.deletePlaybook(ws(req), cur.id);
    ctx.audit(req, "playbook_deleted", { playbookId: cur.id });
    res.sendStatus(204);
  });

  // ── handoff rules ─────────────────────────────────────────────────────
  route("get", "/v1/handoff-rules", guard({ role: "agent" }), (req, res) => { userOnly(req); res.json(repo.getHandoffRules(ws(req))); });
  route("put", "/v1/handoff-rules", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const b = req.body || {};
    const intents = Array.isArray(b.alwaysHandoffIntents) ? [...new Set(b.alwaysHandoffIntents)] : [];
    if (!intents.every((i) => ["human_request", "account_issue"].includes(i))) throw new HttpError(400, "invalid_request", "alwaysHandoffIntents may contain human_request and account_issue");
    if (!intents.includes("human_request")) intents.push("human_request"); // asking for a person is always honoured
    const keywords = Array.isArray(b.keywords) ? b.keywords : [];
    if (keywords.length > 50 || !keywords.every((k) => typeof k === "string" && k.trim().length >= 2 && k.length <= 40)) throw new HttpError(400, "invalid_request", "keywords: up to 50 entries of 2 to 40 characters");
    const min = Number(b.minConfidence);
    if (!(min >= 0 && min <= 1)) throw new HttpError(400, "invalid_request", "minConfidence must be between 0 and 1");
    if (!OUTSIDE.includes(b.outsideHours || "ai_only")) throw new HttpError(400, "invalid_request", `outsideHours must be one of: ${OUTSIDE.join(", ")}`);
    const email = str(b.notifyEmail, "notifyEmail", { max: 254, nullable: true });
    if (email && !EMAIL.test(email)) throw new HttpError(400, "invalid_request", "notifyEmail is not a valid email");
    const out = repo.putHandoffRules(ws(req), { alwaysHandoffIntents: intents, keywords: [...new Set(keywords.map((k) => k.trim().toLowerCase()))], minConfidence: min, outsideHours: b.outsideHours || "ai_only", notifyEmail: email });
    ctx.audit(req, "handoff_rules_changed", {});
    res.json(out);
  });

  // ── knowledge gaps ────────────────────────────────────────────────────
  const loadGap = (req) => {
    const g = repo.getGap(ws(req), req.params.id);
    if (!g) throw new HttpError(404, "not_found", "Gap not found");
    return g;
  };
  route("get", "/v1/knowledge-gaps", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    if (req.query.status && !["open", "resolved", "dismissed"].includes(req.query.status)) throw new HttpError(400, "invalid_status", "Unknown status");
    res.json(repo.listGaps(ws(req), { status: req.query.status, limit: req.query.limit, cursor: req.query.cursor }));
  });
  route("post", "/v1/knowledge-gaps/:id/resolve", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const g = loadGap(req);
    const { faqId, faq } = req.body || {};
    if (faqId !== undefined && !repo.getFaq(ws(req), String(faqId))) throw new HttpError(404, "not_found", "FAQ entry not found");
    if (faq !== undefined) {
      const question = scrubString(str(faq?.question, "faq.question", { min: 3, max: 300, required: true }));
      const answer = scrubString(str(faq?.answer, "faq.answer", { max: 1000, required: true }));
      if (repo.faqExists(ws(req), question)) throw new HttpError(409, "faq_exists", "An FAQ entry with that question already exists");
      const created = repo.createFaq(ws(req), { question, answer, language: g.language, source: "gap" });
      ctx.audit(req, "faq_created", { faqId: created.id, fromGap: g.id });
    }
    const out = repo.setGapStatus(ws(req), g.id, "resolved");
    ctx.audit(req, "knowledge_gap_resolved", { gapId: g.id });
    res.json(out);
  });
  route("post", "/v1/knowledge-gaps/:id/dismiss", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const g = loadGap(req);
    res.json(repo.setGapStatus(ws(req), g.id, "dismissed"));
  });

  // ── feedback and quality ──────────────────────────────────────────────
  route("post", "/v1/messages/:id/feedback", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    const { rating, reason, note } = req.body || {};
    if (!["good", "bad"].includes(rating)) throw new HttpError(400, "invalid_request", "rating must be good or bad");
    if (reason !== undefined && !REASONS.includes(reason)) throw new HttpError(400, "invalid_request", `reason must be one of: ${REASONS.join(", ")}`);
    if (!repo.rateMessage(ws(req), req.params.id, req.principal.userId, { rating, reason, note: typeof note === "string" ? note : null })) throw new HttpError(404, "not_found", "AI message not found");
    res.json({ ok: true });
  });
  route("get", "/v1/analytics/quality", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    const iso = (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);
    res.json(repo.qualitySummary(ws(req), { from: iso(req.query.from), to: iso(req.query.to) }));
  });
};

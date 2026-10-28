"use strict";
/** Tickets, knowledge, analytics, customer data erasure. */
const { HttpError } = require("../errors");

const STATUS = ["open", "needs_human", "resolved"];
const PRIORITY = ["low", "normal", "high", "urgent"];
const MAX_UPLOAD = 1_000_000;

/** The developer handoff: Markdown ready to paste into a GitHub issue. */
const exportGithub = (t, notes) => {
  const ev = (t.evidence || []).map((l) => `${l.id} ${l.time} ${l.level} ${l.method || ""} ${l.path || ""} ${l.status ?? ""}${l.error ? ` ${l.error.code || ""} ${l.error.message}` : ""}`.replace(/\s+/g, " ").trim());
  const rc = t.rootCause;
  const body = [
    `## Customer impact`,
    `Customer \`${t.userId || "anonymous"}\` (${t.language}) reported: "${t.customerMessage}"`,
    ``,
    `## Root cause${rc ? ` (confidence ${Math.round(rc.confidence * 100)}%)` : ""}`,
    rc ? rc.summary : "Not determined from the logs.",
    ``,
    `## Suggested fix`,
    rc ? rc.suggestedFix : "Needs investigation.",
    ``,
    `## Evidence${rc ? ` (cited: ${rc.citedLines.join(", ")})` : ""}`,
    "```",
    ev.length ? ev.join("\n") : "No log lines attached.",
    "```",
    ...(notes.length ? [``, `## Internal notes`, ...notes.map((n) => `- ${n.text}`)] : []),
    ``,
    `_Ticket ${t.id}, opened by Helply_`,
  ].join("\n");
  return { title: `[${t.id}] ${t.title}`, body };
};

const parseCsv = (text) => {
  const rows = String(text).split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  if (rows.length < 2) return rows.map((r) => r.join(" ")).join("\n\n");
  const [head, ...rest] = rows;
  return rest.map((r) => head.map((h, i) => `${h}: ${r[i] ?? ""}`).join("; ")).join("\n\n");
};

module.exports = (ctx) => {
  const { repo, route, auth } = ctx;
  const { guard } = auth;
  const ws = ctx.wsOf;

  // ── tickets ───────────────────────────────────────────────────────────
  route("get", "/v1/tickets", guard({ role: "agent", scope: "tickets:read", legacyOpen: true }), (req, res, next) => {
    const { status, assigneeId, priority, language, q, limit, cursor } = req.query;
    if (status && !STATUS.includes(status)) return next(new HttpError(400, "invalid_status", "Unknown status"));
    if (priority && !PRIORITY.includes(priority)) return next(new HttpError(400, "invalid_priority", "Unknown priority"));
    const page = repo.listTickets(ws(req), { status, assigneeId, priority, language, q: q && String(q).slice(0, 100), limit, cursor });
    return res.json({ ...page, tickets: page.data }); // `tickets` is the v1.0 name, kept as an alias
  });

  const loadTicket = (req) => {
    const t = repo.getTicket(ws(req), req.params.id);
    if (!t) throw new HttpError(404, "not_found", "Ticket not found");
    return t;
  };

  route("get", "/v1/tickets/:id", guard({ role: "agent", scope: "tickets:read", legacyOpen: true }), (req, res) => {
    const t = loadTicket(req);
    res.json({ ...t, notes: repo.listNotes(ws(req), t.id) });
  });

  route("patch", "/v1/tickets/:id", guard({ role: "agent", scope: "tickets:write", legacyOpen: true }), (req, res) => {
    const t = loadTicket(req);
    const { status, assigneeId, priority } = req.body || {};
    const patch = {};
    if (status !== undefined) {
      if (!STATUS.includes(status)) throw new HttpError(400, "invalid_status", "Unknown status");
      patch.status = status;
    }
    if (priority !== undefined) {
      if (!PRIORITY.includes(priority)) throw new HttpError(400, "invalid_priority", "Unknown priority");
      patch.priority = priority;
    }
    if (assigneeId !== undefined) {
      // Assignee must belong to THIS workspace.
      if (assigneeId !== null && !repo.getMembership(ws(req), String(assigneeId))) throw new HttpError(400, "invalid_assignee", "Assignee is not a member of this workspace");
      patch.assigneeId = assigneeId;
    }
    const out = repo.updateTicket(ws(req), t.id, patch);
    ctx.audit(req, "ticket_updated", { ticketId: t.id, ...patch });
    res.json(out);
  });

  route("post", "/v1/tickets/:id/notes", guard({ role: "agent", scope: "tickets:write" }), (req, res) => {
    const t = loadTicket(req);
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) throw new HttpError(400, "text_required", "Note text is required");
    const note = repo.addNote(ws(req), t.id, { authorId: req.principal.userId || null, text });
    ctx.audit(req, "ticket_note_added", { ticketId: t.id });
    res.status(201).json(note);
  });

  route("get", "/v1/tickets/:id/export", guard({ role: "agent", scope: "tickets:read" }), (req, res) => {
    if ((req.query.format || "github-markdown") !== "github-markdown") throw new HttpError(400, "invalid_format", "Only github-markdown is supported");
    const t = loadTicket(req);
    res.json(exportGithub(t, repo.listNotes(ws(req), t.id)));
  });

  // ── knowledge ─────────────────────────────────────────────────────────
  route("get", "/v1/knowledge", guard({ role: "agent", legacyOpen: true }), (req, res) => res.json({ documents: repo.listKnowledge(ws(req)) }));

  route("get", "/v1/knowledge/:id", guard({ role: "agent" }), (req, res) => {
    const d = repo.getKnowledge(ws(req), req.params.id);
    if (!d) throw new HttpError(404, "not_found", "Document not found");
    res.json(d);
  });

  const validText = (text) => {
    if (typeof text !== "string" || text.trim().length < 20) throw new HttpError(400, "text_required", "Provide at least 20 characters of text");
    return text;
  };

  route("post", "/v1/knowledge", guard({ role: "admin", legacyOpen: true }), (req, res) => {
    const { title, text } = req.body || {};
    const doc = repo.addKnowledge(ws(req), { title, text: validText(text) });
    ctx.audit(req, "knowledge_added", { docId: doc.id });
    res.status(201).json(doc);
  });

  route("post", "/v1/knowledge/upload", guard({ role: "admin" }), (req, res) => {
    const { filename, contentBase64, text } = req.body || {};
    const name = typeof filename === "string" ? filename.slice(0, 120) : "";
    const ext = (name.match(/\.(txt|md|csv)$/i) || [])[1]?.toLowerCase();
    if (!ext) throw new HttpError(400, "unsupported_file", "Only .txt, .md and .csv files can be uploaded");
    const raw = typeof contentBase64 === "string" ? Buffer.from(contentBase64, "base64") : Buffer.from(typeof text === "string" ? text : "", "utf8");
    if (!raw.length) throw new HttpError(400, "file_required", "The file is empty");
    if (raw.length > MAX_UPLOAD) throw new HttpError(413, "file_too_large", "Files must be under 1 MB");
    let body = raw.toString("utf8");
    if (body.includes("\u0000")) throw new HttpError(400, "unsupported_file", "That does not look like a text file");
    if (ext === "csv") body = parseCsv(body);
    const doc = repo.addKnowledge(ws(req), { title: name.replace(/\.[^.]+$/, ""), text: validText(body) });
    ctx.audit(req, "knowledge_uploaded", { docId: doc.id, filename: name });
    res.status(201).json(doc);
  });

  route("put", "/v1/knowledge/:id", guard({ role: "admin" }), (req, res) => {
    const { title, text } = req.body || {};
    if (text !== undefined) validText(text);
    const doc = repo.updateKnowledge(ws(req), req.params.id, { title, text });
    if (!doc) throw new HttpError(404, "not_found", "Document not found");
    ctx.audit(req, "knowledge_updated", { docId: doc.id });
    res.json(doc);
  });

  route("post", "/v1/knowledge/:id/reindex", guard({ role: "admin" }), (req, res) => {
    const doc = repo.reindexKnowledge(ws(req), req.params.id);
    if (!doc) throw new HttpError(404, "not_found", "Document not found");
    res.json(doc);
  });

  route("delete", "/v1/knowledge/:id", guard({ role: "admin", legacyOpen: true }), (req, res) => {
    if (!repo.deleteKnowledge(ws(req), req.params.id)) throw new HttpError(404, "not_found", "Document not found");
    ctx.audit(req, "knowledge_deleted", { docId: req.params.id });
    res.sendStatus(204);
  });

  // ── analytics ─────────────────────────────────────────────────────────
  const isoOrUndef = (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);
  route("get", "/v1/analytics/summary", guard({ role: "agent" }), (req, res) => {
    if (req.principal.type === "apikey") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
    res.json(repo.analyticsSummary(ws(req), { from: isoOrUndef(req.query.from), to: isoOrUndef(req.query.to) }));
  });

  route("get", "/v1/analytics/timeseries", guard({ role: "agent" }), (req, res) => {
    if (req.principal.type === "apikey") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
    const metric = req.query.metric || "conversations";
    const interval = req.query.interval || "day";
    if (!["conversations", "handoffs", "errors"].includes(metric)) throw new HttpError(400, "invalid_metric", "metric must be conversations, handoffs or errors");
    if (!["hour", "day"].includes(interval)) throw new HttpError(400, "invalid_interval", "interval must be hour or day");
    res.json({ metric, interval, data: repo.analyticsTimeseries(ws(req), { metric, interval, from: isoOrUndef(req.query.from), to: isoOrUndef(req.query.to) }) });
  });

  // ── privacy ───────────────────────────────────────────────────────────
  route("delete", "/v1/customers/:userId/data", guard({ role: "admin" }), (req, res) => {
    if (req.principal.type === "apikey") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
    const userId = String(req.params.userId).slice(0, 128);
    const erased = repo.eraseCustomer(ws(req), userId);
    ctx.audit(req, "data_erased", { userId, ...erased });
    res.json({ erased });
  });

};

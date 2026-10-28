"use strict";
/**
 * SQLite repository. EVERY method takes the workspace id as its first argument and puts it in the
 * WHERE clause of every query (tenant isolation, invariant 8). Cross-workspace lookups exist only for
 * credentials (session/api-key/invitation hash, workspace public key) and are named for what they are.
 */
const crypto = require("node:crypto");
const { newId } = require("../security/crypto");
const { scrubString } = require("../logs/redact");

const now = () => new Date().toISOString();
const json = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
const parse = (s, d = null) => {
  if (s === null || s === undefined) return d;
  try {
    return JSON.parse(s);
  } catch {
    return d;
  }
};
const like = (s) => `%${String(s).replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
const clampLimit = (n, d = 25) => Math.min(100, Math.max(1, Number.parseInt(n, 10) || d));

const tokenize = (s) => (String(s).toLowerCase().match(/[a-z0-9ɛɔ]+/g) || []).filter((w) => w.length > 2);

const chunkText = (text, max = 800) => {
  const paras = String(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > max) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.flatMap((c) => (c.length > max * 1.5 ? c.match(new RegExp(`.{1,${max}}`, "gs")) : [c]));
};

/** Stable key for "the same root cause" across customers: lowercase, no digits/ids, first words. */
const fingerprint = (summary) => {
  if (!summary) return null;
  const norm = String(summary).toLowerCase().replace(/[0-9a-f]{8,}/g, "").replace(/[0-9]+/g, "").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 12).join(" ");
  return norm ? crypto.createHash("sha1").update(norm).digest("hex").slice(0, 10) : null;
};

const DEFAULT_SETTINGS = Object.freeze({
  languages: ["en", "tw", "gaa", "ee", "fat", "dag", "pcm"],
  escalationThreshold: 0.4,
  retentionDays: 30,
  holdFlaggedReplies: false,
  brandColor: "#0F7B4F",
  aiLive: true, // false = paused: every customer message goes to a person, no model or log work
});

const createRepo = (db) => {
  const q = (sql) => db.prepare(sql);
  const need = (ws) => {
    if (!ws || typeof ws !== "string") throw new Error("workspace id is required");
    return ws;
  };

  // ── mappers ───────────────────────────────────────────────────────────
  const toWorkspace = (r) =>
    r && { id: r.id, name: r.name, slug: r.slug, publicKey: r.public_key, identitySecretEnc: r.identity_secret_enc, settings: { ...DEFAULT_SETTINGS, ...parse(r.settings_json, {}) }, createdAt: r.created_at };
  const toTicket = (r) =>
    r && {
      id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, status: r.status, priority: r.priority, assigneeId: r.assignee_id, conversationId: r.conversation_id,
      title: r.title, userId: r.user_id, language: r.language, customerMessage: r.customer_message, replyEnglish: r.reply_english,
      rootCause: parse(r.root_cause_json), evidence: parse(r.evidence_json, []),
    };
  const toConversation = (r) =>
    r && {
      id: r.id, customerId: r.customer_id, customerName: r.customer_name, language: r.language, status: r.status, handedOff: Boolean(r.handed_off),
      assigneeId: r.assignee_id, firstResponseMs: r.first_response_ms, createdAt: r.created_at, updatedAt: r.updated_at,
      ...(r.last_text !== undefined ? { lastMessage: r.last_text, messageCount: r.message_count } : {}),
    };
  const toMessage = (r) =>
    r && {
      id: r.id, conversationId: r.conversation_id, role: r.role, text: r.text, english: r.text_english, language: r.language, intent: r.intent,
      status: r.status, reviewRecommended: Boolean(r.review_recommended), meta: parse(r.meta_json, {}), authorId: r.author_id, createdAt: r.created_at,
    };

  // ── workspaces ────────────────────────────────────────────────────────
  const createWorkspace = ({ id = newId("ws"), name, slug, identitySecretEnc = null, settings = {} }) => {
    q("INSERT INTO workspaces (id, name, slug, public_key, identity_secret_enc, settings_json, created_at) VALUES (?,?,?,?,?,?,?)").run(
      id, String(name).slice(0, 80), slug, `pk_${crypto.randomBytes(12).toString("base64url")}`, identitySecretEnc, JSON.stringify(settings), now()
    );
    return toWorkspace(q("SELECT * FROM workspaces WHERE id = ?").get(id));
  };
  const getWorkspace = (id) => toWorkspace(q("SELECT * FROM workspaces WHERE id = ?").get(String(id)));
  const findWorkspaceByIdOrSlug = (v) => toWorkspace(q("SELECT * FROM workspaces WHERE id = ? OR slug = ?").get(String(v), String(v)));
  const getWorkspaceByPublicKey = (k) => toWorkspace(q("SELECT * FROM workspaces WHERE public_key = ?").get(String(k)));
  const updateWorkspace = (ws, { name, settings, identitySecretEnc }) => {
    const cur = getWorkspace(need(ws));
    if (!cur) return null;
    q("UPDATE workspaces SET name = ?, settings_json = ?, identity_secret_enc = ? WHERE id = ?").run(
      name !== undefined ? String(name).slice(0, 80) : cur.name,
      JSON.stringify(settings !== undefined ? { ...cur.settings, ...settings } : cur.settings),
      identitySecretEnc !== undefined ? identitySecretEnc : cur.identitySecretEnc,
      ws
    );
    return getWorkspace(ws);
  };

  // ── users, memberships, invitations ───────────────────────────────────
  const createUser = ({ email, passwordHash, name = null }) => {
    const id = newId("usr");
    q("INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?,?,?,?,?)").run(id, email.toLowerCase(), passwordHash, name, now());
    return { id, email: email.toLowerCase(), name };
  };
  const getUserByEmail = (email) => q("SELECT * FROM users WHERE email = ?").get(String(email).toLowerCase()) || null;
  const getUser = (id) => q("SELECT id, email, name, created_at FROM users WHERE id = ?").get(String(id)) || null;
  const addMembership = (ws, userId, role) => q("INSERT INTO memberships (workspace_id, user_id, role, created_at) VALUES (?,?,?,?)").run(need(ws), userId, role, now());
  const getMembership = (ws, userId) => q("SELECT * FROM memberships WHERE workspace_id = ? AND user_id = ?").get(need(ws), String(userId)) || null;
  const firstMembership = (userId) => q("SELECT * FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1").get(String(userId)) || null;
  const listMembers = (ws) =>
    q("SELECT u.id, u.email, u.name, m.role, m.created_at AS createdAt FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY m.created_at").all(need(ws));
  const updateRole = (ws, userId, role) => q("UPDATE memberships SET role = ? WHERE workspace_id = ? AND user_id = ?").run(role, need(ws), userId).changes > 0;
  const removeMember = (ws, userId) => {
    q("DELETE FROM sessions WHERE workspace_id = ? AND user_id = ?").run(need(ws), userId);
    return q("DELETE FROM memberships WHERE workspace_id = ? AND user_id = ?").run(ws, userId).changes > 0;
  };
  const countOwners = (ws) => q("SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ? AND role = 'owner'").get(need(ws)).n;

  const createInvitation = (ws, { email, role, tokenHash, expiresAt }) => {
    const id = newId("inv");
    q("INSERT INTO invitations (id, workspace_id, email, role, token_hash, expires_at, created_at) VALUES (?,?,?,?,?,?,?)").run(id, need(ws), email.toLowerCase(), role, tokenHash, expiresAt, now());
    return { id, email: email.toLowerCase(), role, expiresAt };
  };
  const listInvitations = (ws) =>
    q("SELECT id, email, role, expires_at AS expiresAt, created_at AS createdAt FROM invitations WHERE workspace_id = ? AND accepted_at IS NULL AND expires_at > ? ORDER BY created_at DESC").all(need(ws), now());
  /** Credential lookup: the invitation token is the secret. */
  const getInvitationByTokenHash = (h) => q("SELECT * FROM invitations WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?").get(h, now()) || null;
  const markInvitationAccepted = (id) => q("UPDATE invitations SET accepted_at = ? WHERE id = ?").run(now(), id);

  // ── sessions & api keys (credential lookups by hash) ──────────────────
  const createSession = ({ tokenHash, userId, ws, expiresAt }) => {
    q("INSERT INTO sessions (id, token_hash, user_id, workspace_id, expires_at, created_at) VALUES (?,?,?,?,?,?)").run(newId("ses"), tokenHash, userId, need(ws), expiresAt, now());
  };
  const getSessionByHash = (h) => q("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?").get(h, now()) || null;
  const deleteSessionByHash = (h) => q("DELETE FROM sessions WHERE token_hash = ?").run(h);

  const createApiKey = (ws, { name, prefix, keyHash, scopes }) => {
    const id = newId("key");
    q("INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, scopes, created_at) VALUES (?,?,?,?,?,?,?)").run(id, need(ws), String(name).slice(0, 60), prefix, keyHash, scopes.join(","), now());
    return { id, name, prefix, scopes };
  };
  const toKey = (r) => ({ id: r.id, name: r.name, prefix: r.prefix, scopes: r.scopes.split(",").filter(Boolean), createdAt: r.created_at, lastUsedAt: r.last_used_at, revokedAt: r.revoked_at });
  const listApiKeys = (ws) => q("SELECT * FROM api_keys WHERE workspace_id = ? ORDER BY created_at DESC").all(need(ws)).map(toKey);
  const getApiKeyByHash = (h) => {
    const r = q("SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL").get(h);
    return r ? { ...toKey(r), workspaceId: r.workspace_id } : null;
  };
  const touchApiKey = (id) => q("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(now(), id);
  const revokeApiKey = (ws, id) => q("UPDATE api_keys SET revoked_at = ? WHERE workspace_id = ? AND id = ? AND revoked_at IS NULL").run(now(), need(ws), id).changes > 0;

  // ── log source ────────────────────────────────────────────────────────
  const getLogSource = (ws) => {
    const r = q("SELECT * FROM log_sources WHERE workspace_id = ?").get(need(ws));
    return r && { baseUrl: r.base_url, apiKeyEnc: r.api_key_enc, service: r.service, userIdField: r.user_id_field, updatedAt: r.updated_at };
  };
  const putLogSource = (ws, { baseUrl, apiKeyEnc, service, userIdField }) => {
    q(
      `INSERT INTO log_sources (workspace_id, base_url, api_key_enc, service, user_id_field, updated_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(workspace_id) DO UPDATE SET base_url = excluded.base_url, api_key_enc = excluded.api_key_enc, service = excluded.service, user_id_field = excluded.user_id_field, updated_at = excluded.updated_at`
    ).run(need(ws), baseUrl, apiKeyEnc, service, userIdField || "metadata.userId", now());
  };

  // ── conversations & messages ──────────────────────────────────────────
  const createConversation = (ws, { customerId = null, customerName = null, language = "en", isTest = false }) => {
    const id = newId("c");
    const t = now();
    q("INSERT INTO conversations (id, workspace_id, customer_id, customer_name, language, status, is_test, created_at, updated_at) VALUES (?,?,?,?,?,'ai',?,?,?)").run(id, need(ws), customerId, customerName, language, isTest ? 1 : 0, t, t);
    return getConversation(ws, id);
  };
  const getConversation = (ws, id) => toConversation(q("SELECT * FROM conversations WHERE workspace_id = ? AND id = ?").get(need(ws), String(id)));
  /** Bind a verified customer to a conversation once (never overwrites an existing binding). */
  const bindConversationCustomer = (ws, id, customerId, name = null) =>
    q("UPDATE conversations SET customer_id = ?, customer_name = COALESCE(customer_name, ?) WHERE workspace_id = ? AND id = ? AND customer_id IS NULL").run(customerId, name, need(ws), String(id)).changes > 0;
  const updateConversation = (ws, id, patch) => {
    const cur = getConversation(ws, id);
    if (!cur) return null;
    const m = { ...cur, ...patch };
    q("UPDATE conversations SET status = ?, language = ?, handed_off = ?, assignee_id = ?, first_response_ms = ?, customer_name = ?, updated_at = ? WHERE workspace_id = ? AND id = ?").run(
      m.status, m.language, m.handedOff ? 1 : 0, m.assigneeId ?? null, m.firstResponseMs ?? null, m.customerName ?? null, now(), ws, id
    );
    return getConversation(ws, id);
  };
  const listConversations = (ws, { status, language, q: text, userId, from, to, limit, cursor } = {}) => {
    const where = ["c.workspace_id = ?", "c.is_test = 0"];
    const args = [need(ws)];
    if (status) { where.push("c.status = ?"); args.push(status); }
    if (language) { where.push("c.language = ?"); args.push(language); }
    if (userId) { where.push("c.customer_id = ?"); args.push(userId); }
    if (from) { where.push("c.created_at >= ?"); args.push(from); }
    if (to) { where.push("c.created_at <= ?"); args.push(to); }
    if (cursor) { where.push("c.seq < ?"); args.push(Number(cursor) || 0); }
    if (text) {
      where.push("(c.customer_id LIKE ? ESCAPE '\\' OR c.customer_name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM messages m WHERE m.workspace_id = c.workspace_id AND m.conversation_id = c.id AND (m.text LIKE ? ESCAPE '\\' OR m.text_english LIKE ? ESCAPE '\\')))");
      args.push(like(text), like(text), like(text), like(text));
    }
    const lim = clampLimit(limit);
    const rows = q(
      `SELECT c.*, c.seq AS _seq,
        (SELECT COALESCE(m.text_english, m.text) FROM messages m WHERE m.workspace_id = c.workspace_id AND m.conversation_id = c.id ORDER BY m.seq DESC LIMIT 1) AS last_text,
        (SELECT COUNT(*) FROM messages m WHERE m.workspace_id = c.workspace_id AND m.conversation_id = c.id) AS message_count
       FROM conversations c WHERE ${where.join(" AND ")} ORDER BY c.seq DESC LIMIT ?`
    ).all(...args, lim + 1);
    const page = rows.slice(0, lim);
    return { data: page.map(toConversation), nextCursor: rows.length > lim ? String(page[page.length - 1]._seq) : null };
  };
  const addMessage = (ws, conversationId, m) => {
    if (!getConversation(ws, conversationId)) throw new Error("conversation not found in workspace");
    const id = newId("m");
    q("INSERT INTO messages (id, workspace_id, conversation_id, role, text, text_english, language, intent, status, review_recommended, meta_json, author_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      id, ws, conversationId, m.role, m.text, m.english ?? null, m.language ?? null, m.intent ?? null, m.status || "sent", m.reviewRecommended ? 1 : 0, json(m.meta), m.authorId ?? null, now()
    );
    q("UPDATE conversations SET updated_at = ? WHERE workspace_id = ? AND id = ?").run(now(), ws, conversationId);
    return getMessage(ws, id);
  };
  const getMessage = (ws, id) => toMessage(q("SELECT * FROM messages WHERE workspace_id = ? AND id = ?").get(need(ws), String(id)));
  const listMessages = (ws, conversationId, { limit = 200, sentOnly = false, afterId = null } = {}) => {
    const after = afterId ? q("SELECT seq FROM messages WHERE workspace_id = ? AND id = ?").get(need(ws), afterId)?.seq || 0 : 0;
    const rows = q(`SELECT * FROM messages WHERE workspace_id = ? AND conversation_id = ? AND seq > ? ${sentOnly ? "AND status = 'sent'" : ""} ORDER BY seq ASC LIMIT ?`).all(need(ws), String(conversationId), after, clampLimit(limit, 200));
    return rows.map(toMessage);
  };
  const updateMessage = (ws, id, { text, english, status }) => {
    const cur = getMessage(ws, id);
    if (!cur) return null;
    q("UPDATE messages SET text = ?, text_english = ?, status = ? WHERE workspace_id = ? AND id = ?").run(text ?? cur.text, english === undefined ? cur.english : english, status ?? cur.status, ws, id);
    return getMessage(ws, id);
  };
  const listPendingMessages = (ws) =>
    q("SELECT * FROM messages WHERE workspace_id = ? AND status = 'pending_review' ORDER BY seq ASC").all(need(ws)).map(toMessage);

  // ── tickets ───────────────────────────────────────────────────────────
  const createTicket = (ws, t) => {
    need(ws);
    const n = q("SELECT COALESCE(MAX(CAST(SUBSTR(id, 3) AS INTEGER)), 0) + 1 AS n FROM tickets WHERE workspace_id = ?").get(ws).n;
    const id = `T-${String(n).padStart(4, "0")}`;
    const ts = now();
    const isTest = t.conversationId ? (q("SELECT is_test FROM conversations WHERE workspace_id = ? AND id = ?").get(ws, t.conversationId)?.is_test ?? 0) : 0;
    q("INSERT INTO tickets (id, workspace_id, conversation_id, status, priority, assignee_id, title, user_id, language, customer_message, reply_english, root_cause_json, evidence_json, fingerprint, is_test, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      id, ws, t.conversationId ?? null, t.status || "open", t.priority || "normal", t.assigneeId ?? null, String(t.title || "Customer issue").slice(0, 140), t.userId || null, t.language || "en",
      scrubString(t.customerMessage || ""), t.replyEnglish || "", json(t.rootCause), JSON.stringify(t.evidence || []), fingerprint(t.rootCause?.summary), isTest, ts, ts
    );
    return getTicket(ws, id);
  };
  const getTicket = (ws, id) => toTicket(q("SELECT * FROM tickets WHERE workspace_id = ? AND id = ?").get(need(ws), String(id)));
  const listTickets = (ws, { status, assigneeId, priority, language, q: text, limit, cursor } = {}) => {
    const where = ["workspace_id = ?", "is_test = 0"];
    const args = [need(ws)];
    if (status) { where.push("status = ?"); args.push(status); }
    if (assigneeId) { where.push("assignee_id = ?"); args.push(assigneeId); }
    if (priority) { where.push("priority = ?"); args.push(priority); }
    if (language) { where.push("language = ?"); args.push(language); }
    if (cursor) { where.push("seq < ?"); args.push(Number(cursor) || 0); }
    if (text) { where.push("(title LIKE ? ESCAPE '\\' OR customer_message LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' OR user_id LIKE ? ESCAPE '\\')"); args.push(like(text), like(text), like(text), like(text)); }
    const lim = clampLimit(limit);
    const rows = q(`SELECT * FROM tickets WHERE ${where.join(" AND ")} ORDER BY seq DESC LIMIT ?`).all(...args, lim + 1);
    const page = rows.slice(0, lim);
    return { data: page.map(toTicket), nextCursor: rows.length > lim ? String(page[page.length - 1].seq) : null };
  };
  const updateTicket = (ws, id, patch) => {
    const cur = getTicket(ws, id);
    if (!cur) return null;
    const m = { ...cur, ...patch };
    q("UPDATE tickets SET status = ?, priority = ?, assignee_id = ?, updated_at = ? WHERE workspace_id = ? AND id = ?").run(m.status, m.priority, m.assigneeId ?? null, now(), ws, id);
    return getTicket(ws, id);
  };
  const addNote = (ws, ticketId, { authorId, text }) => {
    if (!getTicket(ws, ticketId)) return null;
    const id = newId("note");
    q("INSERT INTO ticket_notes (id, workspace_id, ticket_id, author_id, text, created_at) VALUES (?,?,?,?,?,?)").run(id, ws, ticketId, authorId ?? null, scrubString(text).slice(0, 2000), now());
    return { id, ticketId, authorId: authorId ?? null, text: scrubString(text).slice(0, 2000), createdAt: now() };
  };
  const listNotes = (ws, ticketId) =>
    q("SELECT id, ticket_id AS ticketId, author_id AS authorId, text, created_at AS createdAt FROM ticket_notes WHERE workspace_id = ? AND ticket_id = ? ORDER BY created_at, id").all(need(ws), String(ticketId));

  // ── knowledge ─────────────────────────────────────────────────────────
  const indexDoc = (ws, docId, body) => {
    q("DELETE FROM knowledge_chunks WHERE workspace_id = ? AND doc_id = ?").run(ws, docId);
    const ins = q("INSERT INTO knowledge_chunks (workspace_id, doc_id, text) VALUES (?,?,?)");
    const chunks = chunkText(String(body).slice(0, 100_000));
    for (const c of chunks) ins.run(ws, docId, c);
    return chunks.length;
  };
  const summarizeDoc = (ws, id) =>
    q("SELECT d.id, d.title, d.created_at AS createdAt, d.updated_at AS updatedAt, (SELECT COUNT(*) FROM knowledge_chunks k WHERE k.workspace_id = d.workspace_id AND k.doc_id = d.id) AS chunks FROM knowledge_docs d WHERE d.workspace_id = ? AND d.id = ?").get(need(ws), String(id)) || null;
  const addKnowledge = (ws, { title, text }) => {
    const id = `K-${crypto.randomBytes(4).toString("hex")}`;
    const t = now();
    q("INSERT INTO knowledge_docs (id, workspace_id, title, body, created_at, updated_at) VALUES (?,?,?,?,?,?)").run(id, need(ws), String(title || "Untitled").slice(0, 120), String(text || "").slice(0, 100_000), t, t);
    indexDoc(ws, id, text || "");
    return summarizeDoc(ws, id);
  };
  const listKnowledge = (ws) => q("SELECT id FROM knowledge_docs WHERE workspace_id = ? ORDER BY created_at, id").all(need(ws)).map((r) => summarizeDoc(ws, r.id));
  const getKnowledge = (ws, id) => {
    const d = q("SELECT * FROM knowledge_docs WHERE workspace_id = ? AND id = ?").get(need(ws), String(id));
    return d && { ...summarizeDoc(ws, id), text: d.body };
  };
  const updateKnowledge = (ws, id, { title, text }) => {
    const d = q("SELECT * FROM knowledge_docs WHERE workspace_id = ? AND id = ?").get(need(ws), String(id));
    if (!d) return null;
    const body = text === undefined ? d.body : String(text).slice(0, 100_000);
    q("UPDATE knowledge_docs SET title = ?, body = ?, updated_at = ? WHERE workspace_id = ? AND id = ?").run(title === undefined ? d.title : String(title).slice(0, 120), body, now(), ws, id);
    indexDoc(ws, id, body);
    return summarizeDoc(ws, id);
  };
  const reindexKnowledge = (ws, id) => {
    const d = q("SELECT * FROM knowledge_docs WHERE workspace_id = ? AND id = ?").get(need(ws), String(id));
    if (!d) return null;
    indexDoc(ws, id, d.body);
    return summarizeDoc(ws, id);
  };
  const deleteKnowledge = (ws, id) => {
    q("DELETE FROM knowledge_chunks WHERE workspace_id = ? AND doc_id = ?").run(need(ws), String(id));
    return q("DELETE FROM knowledge_docs WHERE workspace_id = ? AND id = ?").run(ws, String(id)).changes > 0;
  };
  const retrieve = (ws, query, k = 3) => {
    need(ws);
    const qs = new Set(tokenize(query));
    if (!qs.size) return [];
    const rows = q("SELECT d.title AS title, c.text AS text FROM knowledge_chunks c JOIN knowledge_docs d ON d.id = c.doc_id AND d.workspace_id = c.workspace_id WHERE c.workspace_id = ?").all(ws).map((r) => ({ ...r, boost: 1 }));
    // FAQ entries are company-approved answers: they rank above documents. Business details are only offered when the question matches them.
    for (const f of q("SELECT question, answer FROM faqs WHERE workspace_id = ? AND enabled = 1").all(ws)) rows.push({ title: "FAQ", text: `Q: ${f.question}\nA: ${f.answer}`, boost: 1.5 });
    const p = getBusinessProfile(ws);
    const detail = [p.name, p.about, p.hours && `Opening hours: ${p.hours} (${p.timezone})`, p.contactEmail && `Email: ${p.contactEmail}`, p.contactPhone && `Phone: ${p.contactPhone}`, p.website && `Website: ${p.website}`].filter(Boolean).join(". ");
    if (p.about || p.hours || p.contactEmail || p.contactPhone) rows.push({ title: "Business details", text: detail, boost: 1.2 });
    const scored = [];
    for (const r of rows) {
      const words = new Set(tokenize(r.text));
      let hits = 0;
      for (const w of qs) if (words.has(w)) hits += 1;
      if (hits) scored.push({ title: r.title, text: r.text, score: (r.boost * hits) / Math.sqrt(words.size + 1) });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  };

  // ── audit (append only) ───────────────────────────────────────────────
  const addAudit = (ws, { actorType = "system", actorId = null, action, detail = {} }) => {
    const id = newId("evt");
    q("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, detail_json, created_at) VALUES (?,?,?,?,?,?,?)").run(id, need(ws), actorType, actorId, action, JSON.stringify(detail), now());
    return id;
  };
  const listAudit = (ws, { actor, action, from, to, limit, cursor } = {}) => {
    const where = ["workspace_id = ?"];
    const args = [need(ws)];
    if (actor) { where.push("actor_id = ?"); args.push(actor); }
    if (action) { where.push("action = ?"); args.push(action); }
    if (from) { where.push("created_at >= ?"); args.push(from); }
    if (to) { where.push("created_at <= ?"); args.push(to); }
    if (cursor) { where.push("seq < ?"); args.push(Number(cursor) || 0); }
    const lim = clampLimit(limit, 50);
    const rows = q(`SELECT * FROM audit_events WHERE ${where.join(" AND ")} ORDER BY seq DESC LIMIT ?`).all(...args, lim + 1);
    const page = rows.slice(0, lim);
    return {
      data: page.map((r) => ({ id: r.id, actorType: r.actor_type, actorId: r.actor_id, action: r.action, detail: parse(r.detail_json, {}), createdAt: r.created_at })),
      nextCursor: rows.length > lim ? String(page[page.length - 1].seq) : null,
    };
  };

  // ── webhooks ──────────────────────────────────────────────────────────
  const toHook = (r) => r && { id: r.id, url: r.url, events: r.events.split(",").filter(Boolean), createdAt: r.created_at };
  const createWebhook = (ws, { url, events, secretEnc }) => {
    const id = newId("wh");
    q("INSERT INTO webhooks (id, workspace_id, url, events, secret_enc, created_at) VALUES (?,?,?,?,?,?)").run(id, need(ws), url, events.join(","), secretEnc, now());
    return getWebhook(ws, id);
  };
  const getWebhook = (ws, id) => toHook(q("SELECT * FROM webhooks WHERE workspace_id = ? AND id = ?").get(need(ws), String(id)));
  const getWebhookSecretEnc = (ws, id) => q("SELECT secret_enc FROM webhooks WHERE workspace_id = ? AND id = ?").get(need(ws), String(id))?.secret_enc || null;
  const listWebhooks = (ws) => q("SELECT * FROM webhooks WHERE workspace_id = ? ORDER BY created_at").all(need(ws)).map(toHook);
  const listWebhooksForEvent = (ws, event) => listWebhooks(ws).filter((h) => h.events.includes(event));
  const deleteWebhook = (ws, id) => {
    q("DELETE FROM webhook_deliveries WHERE workspace_id = ? AND webhook_id = ?").run(need(ws), String(id));
    return q("DELETE FROM webhooks WHERE workspace_id = ? AND id = ?").run(ws, String(id)).changes > 0;
  };
  const addDelivery = (ws, { webhookId, event }) => {
    const id = newId("dlv");
    q("INSERT INTO webhook_deliveries (id, workspace_id, webhook_id, event, status, created_at) VALUES (?,?,?,?, 'pending', ?)").run(id, need(ws), webhookId, event, now());
    return id;
  };
  const updateDelivery = (ws, id, { status, attempts, responseStatus = null, error = null }) =>
    q("UPDATE webhook_deliveries SET status = ?, attempts = ?, response_status = ?, error = ? WHERE workspace_id = ? AND id = ?").run(status, attempts, responseStatus, error, need(ws), id);
  const listDeliveries = (ws, webhookId, limit = 50) =>
    q("SELECT id, event, status, attempts, response_status AS responseStatus, error, created_at AS createdAt FROM webhook_deliveries WHERE workspace_id = ? AND webhook_id = ? ORDER BY seq DESC LIMIT ?").all(need(ws), String(webhookId), clampLimit(limit, 50));

  // ── business profile, FAQ, onboarding state ───────────────────────────
  const PROFILE_DEFAULTS = { about: "", website: null, hours: null, timezone: "Africa/Accra", contactEmail: null, contactPhone: null, languages: ["en"], tone: "friendly", escalation: { email: null, phone: null, whatsapp: null }, updatedAt: null };
  const getBusinessProfile = (ws) => {
    const r = q("SELECT * FROM business_profiles WHERE workspace_id = ?").get(need(ws));
    if (!r) return { name: getWorkspace(ws)?.name || "", ...PROFILE_DEFAULTS };
    return { name: r.name, about: r.about, website: r.website, hours: r.hours, timezone: r.timezone, contactEmail: r.contact_email, contactPhone: r.contact_phone, languages: parse(r.languages_json, ["en"]), tone: r.tone, escalation: { email: null, phone: null, whatsapp: null, ...parse(r.escalation_json, {}) }, updatedAt: r.updated_at };
  };
  const putBusinessProfile = (ws, p) => {
    q(
      `INSERT INTO business_profiles (workspace_id, name, about, website, hours, timezone, contact_email, contact_phone, languages_json, tone, escalation_json, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(workspace_id) DO UPDATE SET name=excluded.name, about=excluded.about, website=excluded.website, hours=excluded.hours, timezone=excluded.timezone, contact_email=excluded.contact_email,
         contact_phone=excluded.contact_phone, languages_json=excluded.languages_json, tone=excluded.tone, escalation_json=excluded.escalation_json, updated_at=excluded.updated_at`
    ).run(need(ws), p.name, p.about, p.website, p.hours, p.timezone, p.contactEmail, p.contactPhone, JSON.stringify(p.languages), p.tone, JSON.stringify(p.escalation), now());
    return getBusinessProfile(ws);
  };
  const toFaq = (r) => r && { id: r.id, question: r.question, answer: r.answer, language: r.language, tags: parse(r.tags_json, []), enabled: Boolean(r.enabled), source: r.source, createdAt: r.created_at, updatedAt: r.updated_at };
  const createFaq = (ws, f) => {
    const id = newId("faq");
    const t = now();
    q("INSERT INTO faqs (id, workspace_id, question, answer, language, tags_json, enabled, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(id, need(ws), f.question, f.answer, f.language || "en", JSON.stringify(f.tags || []), f.enabled === false ? 0 : 1, f.source || "manual", t, t);
    return getFaq(ws, id);
  };
  const getFaq = (ws, id) => toFaq(q("SELECT * FROM faqs WHERE workspace_id = ? AND id = ?").get(need(ws), String(id)));
  const countFaqs = (ws, { enabledOnly = false } = {}) => q(`SELECT COUNT(*) AS n FROM faqs WHERE workspace_id = ? ${enabledOnly ? "AND enabled = 1" : ""}`).get(need(ws)).n;
  const faqExists = (ws, question) => Boolean(q("SELECT 1 FROM faqs WHERE workspace_id = ? AND LOWER(question) = LOWER(?)").get(need(ws), String(question)));
  const listFaqs = (ws, { q: text, language, enabled, limit, cursor } = {}) => {
    const where = ["workspace_id = ?"];
    const args = [need(ws)];
    if (language) { where.push("language = ?"); args.push(language); }
    if (enabled === "true" || enabled === "false") { where.push("enabled = ?"); args.push(enabled === "true" ? 1 : 0); }
    if (cursor) { where.push("seq < ?"); args.push(Number(cursor) || 0); }
    if (text) { where.push("(question LIKE ? ESCAPE '\\' OR answer LIKE ? ESCAPE '\\')"); args.push(like(text), like(text)); }
    const lim = clampLimit(limit);
    const rows = q(`SELECT * FROM faqs WHERE ${where.join(" AND ")} ORDER BY seq DESC LIMIT ?`).all(...args, lim + 1);
    const pageRows = rows.slice(0, lim);
    return { data: pageRows.map(toFaq), nextCursor: rows.length > lim ? String(pageRows[pageRows.length - 1].seq) : null };
  };
  const updateFaq = (ws, id, patch) => {
    const cur = getFaq(ws, id);
    if (!cur) return null;
    const m = { ...cur, ...patch };
    q("UPDATE faqs SET question = ?, answer = ?, language = ?, tags_json = ?, enabled = ?, updated_at = ? WHERE workspace_id = ? AND id = ?").run(m.question, m.answer, m.language, JSON.stringify(m.tags), m.enabled ? 1 : 0, now(), ws, id);
    return getFaq(ws, id);
  };
  const deleteFaq = (ws, id) => q("DELETE FROM faqs WHERE workspace_id = ? AND id = ?").run(need(ws), String(id)).changes > 0;
  const getOnboardingState = (ws) => {
    const r = q("SELECT * FROM onboarding_state WHERE workspace_id = ?").get(need(ws));
    return r && { logTestAt: r.log_test_at, logTestOk: r.log_test_ok === 1, logTestHasUserId: r.log_test_has_user_id === 1, testRanAt: r.test_ran_at, testOk: r.test_ok === 1 };
  };
  const upsertState = (ws, cols) => {
    q("INSERT OR IGNORE INTO onboarding_state (workspace_id, updated_at) VALUES (?, ?)").run(need(ws), now());
    for (const [k, v] of Object.entries(cols)) q(`UPDATE onboarding_state SET ${k} = ?, updated_at = ? WHERE workspace_id = ?`).run(v, now(), ws);
  };
  const recordLogTest = (ws, { ok, hasUserId }) => upsertState(ws, { log_test_at: now(), log_test_ok: ok ? 1 : 0, log_test_has_user_id: hasUserId ? 1 : 0 });
  const recordCustomerTest = (ws, { ok }) => upsertState(ws, { test_ran_at: now(), test_ok: ok ? 1 : 0 });
  const countKnowledgeDocs = (ws) => q("SELECT COUNT(*) AS n FROM knowledge_docs WHERE workspace_id = ?").get(need(ws)).n;
  const hasVerifiedCustomerActivity = (ws) =>
    Boolean(q("SELECT 1 FROM audit_events WHERE workspace_id = ? AND action = 'identity_token_minted' LIMIT 1").get(need(ws)) || q("SELECT 1 FROM conversations WHERE workspace_id = ? AND customer_id IS NOT NULL AND is_test = 0 LIMIT 1").get(ws));

  // ── inbox ─────────────────────────────────────────────────────────────
  const inboxCounts = (ws, userId) => {
    need(ws);
    const c = (extra, ...a) => q(`SELECT COUNT(*) AS n FROM conversations WHERE workspace_id = ? AND is_test = 0 ${extra}`).get(ws, ...a).n;
    return {
      needsHuman: c("AND status = 'needs_human'"),
      mine: userId ? c("AND status = 'human' AND assignee_id = ?", userId) : 0,
      unassigned: c("AND status IN ('needs_human','human') AND assignee_id IS NULL"),
      aiActive: c("AND status = 'ai'"),
      resolvedToday: c("AND status = 'resolved' AND updated_at >= ?", `${now().slice(0, 10)}T00:00:00.000Z`),
    };
  };

  // ── issues (root causes grouped across customers; derived from tickets) ──
  const issueRows = (ws) => q(
    `SELECT fingerprint, COUNT(*) AS count, COUNT(DISTINCT user_id) AS affected, MIN(created_at) AS first_seen, MAX(created_at) AS last_seen,
            GROUP_CONCAT(id) AS ticket_ids, MAX(seq) AS latest_seq
     FROM tickets WHERE workspace_id = ? AND is_test = 0 AND fingerprint IS NOT NULL GROUP BY fingerprint`
  ).all(need(ws));
  const shapeIssue = (ws, r) => {
    const latest = q("SELECT root_cause_json, evidence_json FROM tickets WHERE workspace_id = ? AND seq = ?").get(ws, r.latest_seq);
    const rc = parse(latest?.root_cause_json, {});
    const st = q("SELECT * FROM issue_state WHERE workspace_id = ? AND fingerprint = ?").get(ws, r.fingerprint);
    let status = st?.status || "open";
    if (status === "fixed" && st.fixed_at && r.last_seen > st.fixed_at) status = "open"; // regression: it happened again after the fix
    const text = (rc.summary || "").toLowerCase();
    const severity = r.count >= 10 || r.affected >= 5 ? "high" : r.count >= 3 ? "normal" : "low";
    return {
      id: `iss_${r.fingerprint}`, summary: rc.summary || "Unexplained issue", suggestedFix: rc.suggestedFix || null, status, severity, count: r.count, affectedCustomers: r.affected,
      firstSeen: r.first_seen, lastSeen: r.last_seen, assigneeId: st?.assignee_id || null, ticketIds: r.ticket_ids.split(",").sort().reverse(), fixedAt: st?.fixed_at || null, _text: text, _evidence: parse(latest?.evidence_json, []),
    };
  };
  const strip = ({ _text, _evidence, ...o }) => o; // eslint-disable-line no-unused-vars
  const listIssues = (ws, { status, q: text, limit, cursor } = {}) => {
    let all = issueRows(ws).map((r) => shapeIssue(ws, r));
    if (status) all = all.filter((i) => i.status === status);
    if (text) all = all.filter((i) => i._text.includes(String(text).toLowerCase()));
    all.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
    const lim = clampLimit(limit);
    const off = Number(cursor) || 0;
    const pageRows = all.slice(off, off + lim);
    return { data: pageRows.map(strip), nextCursor: off + lim < all.length ? String(off + lim) : null };
  };
  const getIssue = (ws, id) => {
    const fp = String(id).replace(/^iss_/, "");
    const r = issueRows(ws).find((x) => x.fingerprint === fp);
    if (!r) return null;
    const i = shapeIssue(ws, r);
    const notes = i.ticketIds.flatMap((t) => listNotes(ws, t));
    return { ...strip(i), evidence: i._evidence, notes };
  };
  const updateIssue = (ws, id, { status, assigneeId }) => {
    const cur = getIssue(ws, id);
    if (!cur) return null;
    const fp = String(id).replace(/^iss_/, "");
    const st = q("SELECT * FROM issue_state WHERE workspace_id = ? AND fingerprint = ?").get(ws, fp);
    const nextStatus = status ?? cur.status;
    const fixedAt = nextStatus === "fixed" ? (cur.status === "fixed" ? cur.fixedAt : now()) : null;
    q(`INSERT INTO issue_state (workspace_id, fingerprint, status, assignee_id, fixed_at, updated_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(workspace_id, fingerprint) DO UPDATE SET status = excluded.status, assignee_id = excluded.assignee_id, fixed_at = excluded.fixed_at, updated_at = excluded.updated_at`)
      .run(ws, fp, nextStatus, assigneeId === undefined ? (st?.assignee_id ?? null) : assigneeId, fixedAt, now());
    const { evidence, notes, ...issue } = getIssue(ws, id); // eslint-disable-line no-unused-vars
    return issue;
  };

  // ── playbooks ─────────────────────────────────────────────────────────
  const toPlaybook = (r) => r && { id: r.id, errorCode: r.error_code, pathPattern: r.path_pattern, title: r.title, customerWording: r.customer_wording, internalNote: r.internal_note, ownerTeam: r.owner_team, severity: r.severity, alwaysHandoff: Boolean(r.always_handoff), enabled: Boolean(r.enabled), createdAt: r.created_at, updatedAt: r.updated_at };
  const getPlaybook = (ws, id) => toPlaybook(q("SELECT * FROM playbooks WHERE workspace_id = ? AND id = ?").get(need(ws), String(id)));
  const listPlaybooks = (ws) => q("SELECT * FROM playbooks WHERE workspace_id = ? ORDER BY error_code, created_at").all(need(ws)).map(toPlaybook);
  const createPlaybook = (ws, p) => {
    const id = newId("pb");
    const t = now();
    q("INSERT INTO playbooks (id, workspace_id, error_code, path_pattern, title, customer_wording, internal_note, owner_team, severity, always_handoff, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, need(ws), p.errorCode, p.pathPattern ?? null, p.title, p.customerWording, p.internalNote ?? null, p.ownerTeam ?? null, p.severity || "normal", p.alwaysHandoff ? 1 : 0, p.enabled === false ? 0 : 1, t, t);
    return getPlaybook(ws, id);
  };
  const updatePlaybook = (ws, id, patch) => {
    const cur = getPlaybook(ws, id);
    if (!cur) return null;
    const m = { ...cur, ...patch };
    q("UPDATE playbooks SET error_code = ?, path_pattern = ?, title = ?, customer_wording = ?, internal_note = ?, owner_team = ?, severity = ?, always_handoff = ?, enabled = ?, updated_at = ? WHERE workspace_id = ? AND id = ?")
      .run(m.errorCode, m.pathPattern, m.title, m.customerWording, m.internalNote, m.ownerTeam, m.severity, m.alwaysHandoff ? 1 : 0, m.enabled ? 1 : 0, now(), ws, id);
    return getPlaybook(ws, id);
  };
  const deletePlaybook = (ws, id) => q("DELETE FROM playbooks WHERE workspace_id = ? AND id = ?").run(need(ws), String(id)).changes > 0;
  const playbookSuggestions = (ws) => {
    const have = new Set(listPlaybooks(ws).map((p) => p.errorCode));
    const seen = new Map();
    for (const t of q("SELECT id, evidence_json, created_at FROM tickets WHERE workspace_id = ? AND is_test = 0 ORDER BY seq DESC LIMIT 300").all(need(ws))) {
      for (const l of parse(t.evidence_json, [])) {
        const code = l?.error?.code;
        if (!code || have.has(code)) continue;
        const e = seen.get(code) || { errorCode: code, count: 0, lastSeen: t.created_at, sampleTicketIds: [] };
        e.count += 1;
        if (e.sampleTicketIds.length < 3 && !e.sampleTicketIds.includes(t.id)) e.sampleTicketIds.push(t.id);
        seen.set(code, e);
      }
    }
    return [...seen.values()].sort((a, b) => b.count - a.count).slice(0, 20);
  };

  // ── handoff rules ─────────────────────────────────────────────────────
  const HANDOFF_DEFAULTS = { alwaysHandoffIntents: ["human_request"], keywords: [], minConfidence: 0.6, outsideHours: "ai_only", notifyEmail: null };
  const getHandoffRules = (ws) => {
    const r = q("SELECT rules_json FROM handoff_rules WHERE workspace_id = ?").get(need(ws));
    return { ...HANDOFF_DEFAULTS, ...parse(r?.rules_json, {}) };
  };
  const putHandoffRules = (ws, rules) => {
    q("INSERT INTO handoff_rules (workspace_id, rules_json, updated_at) VALUES (?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET rules_json = excluded.rules_json, updated_at = excluded.updated_at").run(need(ws), JSON.stringify(rules), now());
    return getHandoffRules(ws);
  };

  // ── knowledge gaps ────────────────────────────────────────────────────
  const clusterKey = (text) => [...new Set(tokenize(text))].sort().slice(0, 8).join(" ");
  const toGap = (r) => r && { id: r.id, question: r.question, count: r.count, language: r.language, firstSeen: r.first_seen, lastSeen: r.last_seen, status: r.status, sampleConversationIds: parse(r.conversations_json, []) };
  const recordGap = (ws, { question, language = "en", conversationId = null }) => {
    const key = clusterKey(question);
    if (!key) return null;
    const cur = q("SELECT * FROM knowledge_gaps WHERE workspace_id = ? AND cluster_key = ? AND status = 'open'").get(need(ws), key);
    if (cur) {
      const convs = parse(cur.conversations_json, []);
      if (conversationId && !convs.includes(conversationId) && convs.length < 5) convs.push(conversationId);
      q("UPDATE knowledge_gaps SET count = count + 1, last_seen = ?, conversations_json = ? WHERE id = ?").run(now(), JSON.stringify(convs), cur.id);
      return getGap(ws, cur.id);
    }
    const id = newId("gap");
    const t = now();
    q("INSERT INTO knowledge_gaps (id, workspace_id, cluster_key, question, language, conversations_json, first_seen, last_seen) VALUES (?,?,?,?,?,?,?,?)").run(id, ws, key, scrubString(question).slice(0, 300), language, JSON.stringify(conversationId ? [conversationId] : []), t, t);
    return getGap(ws, id);
  };
  const getGap = (ws, id) => toGap(q("SELECT * FROM knowledge_gaps WHERE workspace_id = ? AND id = ?").get(need(ws), String(id)));
  const listGaps = (ws, { status, limit, cursor } = {}) => {
    const where = ["workspace_id = ?"];
    const args = [need(ws)];
    where.push("status = ?"); args.push(status || "open");
    const lim = clampLimit(limit);
    const off = Number(cursor) || 0;
    const rows = q(`SELECT * FROM knowledge_gaps WHERE ${where.join(" AND ")} ORDER BY count DESC, last_seen DESC LIMIT ? OFFSET ?`).all(...args, lim + 1, off);
    return { data: rows.slice(0, lim).map(toGap), nextCursor: rows.length > lim ? String(off + lim) : null };
  };
  const setGapStatus = (ws, id, status) => (q("UPDATE knowledge_gaps SET status = ? WHERE workspace_id = ? AND id = ?").run(status, need(ws), String(id)).changes ? getGap(ws, id) : null);

  // ── feedback and quality ──────────────────────────────────────────────
  const rateMessage = (ws, messageId, userId, { rating, reason = null, note = null }) => {
    const m = getMessage(ws, messageId);
    if (!m || m.role !== "ai") return false;
    q(`INSERT INTO message_feedback (workspace_id, message_id, user_id, rating, reason, note, created_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(message_id, user_id) DO UPDATE SET rating = excluded.rating, reason = excluded.reason, note = excluded.note, created_at = excluded.created_at`)
      .run(ws, messageId, userId, rating, reason, note ? scrubString(note).slice(0, 500) : null, now());
    return true;
  };
  const qualitySummary = (ws, { from, to } = {}) => {
    need(ws);
    const { f, t } = range(from, to);
    const fb = q("SELECT rating, COUNT(*) AS n FROM message_feedback WHERE workspace_id = ? AND created_at >= ? AND created_at <= ? GROUP BY rating").all(ws, f, t);
    const good = fb.find((x) => x.rating === "good")?.n || 0;
    const rated = fb.reduce((n, x) => n + x.n, 0);
    const msgs = q("SELECT meta_json, review_recommended FROM messages WHERE workspace_id = ? AND role = 'ai' AND created_at >= ? AND created_at <= ? AND conversation_id NOT IN (SELECT id FROM conversations WHERE workspace_id = ? AND is_test = 1)").all(ws, f, t, ws);
    let fromKnowledge = 0; let fromLogs = 0; let flagged = 0;
    const reasons = new Map();
    for (const m of msgs) {
      const meta = parse(m.meta_json, {});
      const trace = meta.trace || [];
      const kb = trace.find((x) => x.step === "knowledge");
      const ex = trace.find((x) => x.step === "explain");
      if (kb?.answered) fromKnowledge += 1;
      if (ex?.found) fromLogs += 1;
      if (m.review_recommended) flagged += 1;
      if (meta.needsHuman) {
        const reason = meta.understanding?.intent === "human_request" ? "customer_asked" : kb && !kb.answered ? "knowledge_miss" : ex && !ex.found ? "no_evidence" : trace.find((x) => x.step === "logs")?.error ? "logs_unavailable" : "other";
        reasons.set(reason, (reasons.get(reason) || 0) + 1);
      }
    }
    const r2 = (n) => Math.round(n * 100) / 100;
    return {
      ratedReplies: rated, goodRate: rated ? r2(good / rated) : 0, answeredFromKnowledge: msgs.length ? r2(fromKnowledge / msgs.length) : 0, answeredFromLogs: msgs.length ? r2(fromLogs / msgs.length) : 0,
      flaggedTranslations: flagged, handoffReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    };
  };

  // ── identity key mode, customers, password resets, sites ──────────────
  const getIdentityKey = (ws) => {
    const r = q("SELECT identity_mode, identity_alg, identity_kid, identity_public_pem FROM workspaces WHERE id = ?").get(need(ws));
    return { mode: r.identity_mode, alg: r.identity_alg, kid: r.identity_kid, publicKeyPem: r.identity_public_pem, jwksUrl: null };
  };
  const setIdentityKey = (ws, { mode, alg, kid = null, publicKeyPem = null }) => {
    q("UPDATE workspaces SET identity_mode = ?, identity_alg = ?, identity_kid = ?, identity_public_pem = ? WHERE id = ?").run(mode, alg, kid, publicKeyPem, need(ws));
    return getIdentityKey(ws);
  };
  const listCustomers = (ws, { q: text, limit, cursor } = {}) => {
    const args = [need(ws)];
    let filter = "";
    if (text) { filter = "AND (customer_id LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\')"; args.push(like(text), like(text)); }
    const lim = clampLimit(limit);
    const off = Number(cursor) || 0;
    const rows = q(
      `SELECT customer_id AS id, MAX(customer_name) AS name, COUNT(*) AS conversations, MIN(created_at) AS first_seen, MAX(updated_at) AS last_seen, GROUP_CONCAT(DISTINCT language) AS languages,
         (SELECT COUNT(*) FROM tickets t WHERE t.workspace_id = conversations.workspace_id AND t.user_id = conversations.customer_id AND t.is_test = 0) AS tickets
       FROM conversations WHERE workspace_id = ? AND is_test = 0 AND customer_id IS NOT NULL ${filter} GROUP BY customer_id ORDER BY last_seen DESC LIMIT ? OFFSET ?`
    ).all(...args, lim + 1, off);
    const toC = (r) => ({ id: r.id, name: r.name, conversations: r.conversations, tickets: r.tickets, firstSeen: r.first_seen, lastSeen: r.last_seen, languages: String(r.languages || "en").split(",") });
    return { data: rows.slice(0, lim).map(toC), nextCursor: rows.length > lim ? String(off + lim) : null };
  };
  const getCustomer = (ws, userId) => {
    const one = listCustomers(ws, { q: userId, limit: 100 });
    const c = one.data.find((x) => x.id === String(userId));
    if (!c) return null;
    return { ...c, conversationIds: q("SELECT id FROM conversations WHERE workspace_id = ? AND customer_id = ? AND is_test = 0 ORDER BY seq DESC LIMIT 100").all(ws, c.id).map((r) => r.id), ticketIds: q("SELECT id FROM tickets WHERE workspace_id = ? AND user_id = ? AND is_test = 0 ORDER BY seq DESC LIMIT 100").all(ws, c.id).map((r) => r.id) };
  };
  const issueCustomers = (ws, ticketIds) => {
    const rows = ticketIds.map((id) => q("SELECT user_id FROM tickets WHERE workspace_id = ? AND id = ?").get(need(ws), id)).filter(Boolean);
    return { customerIds: [...new Set(rows.map((r) => r.user_id).filter(Boolean))], withoutCustomer: rows.filter((r) => !r.user_id).length };
  };
  const createPasswordReset = (userId, tokenHash, expiresAt) => q("INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?)").run(newId("pr"), userId, tokenHash, expiresAt, now());
  const getPasswordReset = (tokenHash) => q("SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?").get(tokenHash, now()) || null;
  const recentPasswordResets = (userId) => q("SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > ?").get(userId, new Date(Date.now() - 3_600_000).toISOString()).n;
  const completePasswordReset = (resetId, userId, passwordHash) => {
    q("UPDATE password_resets SET used_at = ? WHERE id = ?").run(now(), resetId);
    q("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
    q("DELETE FROM sessions WHERE user_id = ?").run(userId); // every session of that user ends
    return q("SELECT workspace_id FROM memberships WHERE user_id = ?").all(userId).map((r) => r.workspace_id);
  };
  const toSite = (r) => r && { id: r.id, url: r.url, status: r.status, pages: r.pages, lastIndexedAt: r.last_indexed_at, error: r.error };
  const createSite = (ws, url) => { const id = newId("site"); q("INSERT INTO knowledge_sites (id, workspace_id, url, created_at) VALUES (?,?,?,?)").run(id, need(ws), url, now()); return getSite(ws, id); };
  const getSite = (ws, id) => toSite(q("SELECT * FROM knowledge_sites WHERE workspace_id = ? AND id = ?").get(need(ws), String(id)));
  const listSites = (ws) => q("SELECT * FROM knowledge_sites WHERE workspace_id = ? ORDER BY created_at").all(need(ws)).map(toSite);
  const setSite = (ws, id, { status, pages, error = null, indexed = false }) =>
    q("UPDATE knowledge_sites SET status = ?, pages = COALESCE(?, pages), error = ?, last_indexed_at = CASE WHEN ? THEN ? ELSE last_indexed_at END WHERE workspace_id = ? AND id = ?").run(status, pages ?? null, error, indexed ? 1 : 0, now(), need(ws), String(id));
  const clearSiteDocs = (ws, id) => {
    for (const d of q("SELECT id FROM knowledge_docs WHERE workspace_id = ? AND site_id = ?").all(need(ws), String(id))) deleteKnowledge(ws, d.id);
  };
  const addSiteDoc = (ws, siteId, { title, text }) => { const d = addKnowledge(ws, { title, text }); q("UPDATE knowledge_docs SET site_id = ? WHERE workspace_id = ? AND id = ?").run(siteId, ws, d.id); return d; };
  const deleteSite = (ws, id) => { clearSiteDocs(ws, id); return q("DELETE FROM knowledge_sites WHERE workspace_id = ? AND id = ?").run(need(ws), String(id)).changes > 0; };

  // ── channels (ChatFlow) ───────────────────────────────────────────────
  const toChannel = (r) => r && { id: r.id, kind: r.kind, label: r.label, externalId: r.external_id, status: r.status, lastSeenAt: r.last_seen_at, keyPrefix: r.key_prefix, createdAt: r.created_at };
  const createChannel = (ws, { kind, label, externalId, keyHash, keyPrefix }) => {
    const id = newId("ch");
    q("INSERT INTO channels (id, workspace_id, kind, label, external_id, key_hash, key_prefix, created_at) VALUES (?,?,?,?,?,?,?,?)").run(id, need(ws), kind, String(label).slice(0, 60), String(externalId).slice(0, 128), keyHash, keyPrefix, now());
    return getChannel(ws, id);
  };
  const getChannel = (ws, id) => toChannel(q("SELECT * FROM channels WHERE workspace_id = ? AND id = ?").get(need(ws), String(id)));
  const findChannelByExternalId = (kind, externalId) => q("SELECT id FROM channels WHERE kind = ? AND external_id = ?").get(kind, String(externalId)) || null;
  const listChannels = (ws) => q("SELECT * FROM channels WHERE workspace_id = ? ORDER BY created_at").all(need(ws)).map(toChannel);
  /** Credential lookup: the relay key is the secret. Returns the channel and its workspace. */
  const getChannelByKeyHash = (h) => {
    const r = q("SELECT * FROM channels WHERE key_hash = ?").get(String(h));
    return r ? { ...toChannel(r), workspaceId: r.workspace_id } : null;
  };
  const rotateChannelKey = (ws, id, { keyHash, keyPrefix }) =>
    q("UPDATE channels SET key_hash = ?, key_prefix = ?, status = 'pending', last_seen_at = NULL WHERE workspace_id = ? AND id = ?").run(keyHash, keyPrefix, need(ws), String(id)).changes > 0;
  const deleteChannel = (ws, id) => q("DELETE FROM channels WHERE workspace_id = ? AND id = ?").run(need(ws), String(id)).changes > 0;
  const touchChannel = (ws, id) => q("UPDATE channels SET status = 'connected', last_seen_at = ? WHERE workspace_id = ? AND id = ?").run(now(), need(ws), String(id));
  const getChannelConversation = (ws, channelId, externalConversationId) => {
    const r = q("SELECT * FROM channel_conversations WHERE workspace_id = ? AND channel_id = ? AND external_conversation_id = ?").get(need(ws), String(channelId), String(externalConversationId));
    return r && { channelId: r.channel_id, externalConversationId: r.external_conversation_id, conversationId: r.conversation_id, externalVisitorId: r.external_visitor_id, customerId: r.customer_id };
  };
  /** Maps (channel, their conversation id) to ours; remapping replaces the target (used when a different verified customer appears). */
  const linkChannelConversation = (ws, { channelId, externalConversationId, conversationId, externalVisitorId = null, customerId = null }) =>
    q(
      `INSERT INTO channel_conversations (workspace_id, channel_id, external_conversation_id, conversation_id, external_visitor_id, customer_id, created_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(channel_id, external_conversation_id) DO UPDATE SET conversation_id = excluded.conversation_id, external_visitor_id = excluded.external_visitor_id, customer_id = excluded.customer_id`
    ).run(need(ws), String(channelId), String(externalConversationId), conversationId, externalVisitorId, customerId, now());

  // ── analytics ─────────────────────────────────────────────────────────
  const range = (from, to) => ({ f: from || "0000", t: to || "9999" });
  const analyticsSummary = (ws, { from, to } = {}) => {
    need(ws);
    const { f, t } = range(from, to);
    const c = q(
      `SELECT COUNT(*) AS conversations,
              SUM(CASE WHEN handed_off = 0 AND status != 'needs_human' AND status != 'human' THEN 1 ELSE 0 END) AS resolvedByAI,
              SUM(handed_off) AS handedOff, AVG(first_response_ms) AS avgFirstResponseMs
       FROM conversations WHERE workspace_id = ? AND is_test = 0 AND created_at >= ? AND created_at <= ?`
    ).get(ws, f, t);
    const languages = q("SELECT language AS code, COUNT(*) AS count FROM conversations WHERE workspace_id = ? AND is_test = 0 AND created_at >= ? AND created_at <= ? GROUP BY language ORDER BY count DESC").all(ws, f, t);
    const intents = q("SELECT intent, COUNT(*) AS count FROM messages WHERE workspace_id = ? AND role = 'customer' AND intent IS NOT NULL AND created_at >= ? AND created_at <= ? AND conversation_id NOT IN (SELECT id FROM conversations WHERE workspace_id = ? AND is_test = 1) GROUP BY intent ORDER BY count DESC").all(ws, f, t, ws);
    const rv = q("SELECT COUNT(*) AS n, SUM(review_recommended) AS flagged FROM messages WHERE workspace_id = ? AND role = 'ai' AND language != 'en' AND created_at >= ? AND created_at <= ? AND conversation_id NOT IN (SELECT id FROM conversations WHERE workspace_id = ? AND is_test = 1)").get(ws, f, t, ws);
    const causes = q(
      `SELECT fingerprint, MAX(json_extract(root_cause_json, '$.summary')) AS summary, COUNT(*) AS count, MAX(created_at) AS lastSeen
       FROM tickets WHERE workspace_id = ? AND is_test = 0 AND fingerprint IS NOT NULL AND created_at >= ? AND created_at <= ? GROUP BY fingerprint ORDER BY count DESC, lastSeen DESC LIMIT 5`
    ).all(ws, f, t);
    const needsHuman = q("SELECT COUNT(*) AS n FROM tickets WHERE workspace_id = ? AND is_test = 0 AND status = 'needs_human'").get(ws).n;
    const total = c.conversations || 0;
    return {
      conversations: total,
      resolvedByAI: c.resolvedByAI || 0,
      handedOff: c.handedOff || 0,
      handoffRate: total ? Math.round(((c.handedOff || 0) / total) * 100) / 100 : 0,
      avgFirstResponseMs: c.avgFirstResponseMs === null ? null : Math.round(c.avgFirstResponseMs),
      languages,
      intents,
      reviewRate: rv.n ? Math.round(((rv.flagged || 0) / rv.n) * 100) / 100 : 0,
      topRootCauses: causes,
      ticketsNeedingHuman: needsHuman,
    };
  };
  const analyticsTimeseries = (ws, { metric = "conversations", interval = "day", from, to } = {}) => {
    need(ws);
    const { f, t } = range(from, to);
    const len = interval === "hour" ? 13 : 10; // ISO prefix length
    const table = metric === "errors" ? "tickets" : "conversations";
    const extra = `AND is_test = 0 ${metric === "handoffs" ? "AND handed_off = 1" : ""}`;
    return q(`SELECT SUBSTR(created_at, 1, ${len}) AS bucket, COUNT(*) AS count FROM ${table} WHERE workspace_id = ? AND created_at >= ? AND created_at <= ? ${extra} GROUP BY bucket ORDER BY bucket`).all(ws, f, t);
  };

  // ── privacy ───────────────────────────────────────────────────────────
  const eraseCustomer = (ws, userId) => {
    need(ws);
    const convs = q("SELECT id FROM conversations WHERE workspace_id = ? AND customer_id = ?").all(ws, String(userId)).map((r) => r.id);
    const tickets = q("SELECT id FROM tickets WHERE workspace_id = ? AND user_id = ?").all(ws, String(userId)).map((r) => r.id);
    let messages = 0;
    db.exec("BEGIN");
    try {
      for (const id of convs) messages += q("DELETE FROM messages WHERE workspace_id = ? AND conversation_id = ?").run(ws, id).changes;
      for (const id of tickets) q("DELETE FROM ticket_notes WHERE workspace_id = ? AND ticket_id = ?").run(ws, id);
      q("DELETE FROM tickets WHERE workspace_id = ? AND user_id = ?").run(ws, String(userId));
      q("DELETE FROM conversations WHERE workspace_id = ? AND customer_id = ?").run(ws, String(userId));
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    return { conversations: convs.length, messages, tickets: tickets.length };
  };
  /** Retention sweep: drop messages (and empty conversations) older than the cutoff. */
  const purgeOlderThan = (ws, cutoffIso) => {
    need(ws);
    const m = q("DELETE FROM messages WHERE workspace_id = ? AND created_at < ?").run(ws, cutoffIso).changes;
    q("DELETE FROM conversations WHERE workspace_id = ? AND created_at < ? AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conversations.id)").run(ws, cutoffIso);
    return m;
  };

  return {
    db, DEFAULT_SETTINGS,
    createWorkspace, getWorkspace, findWorkspaceByIdOrSlug, getWorkspaceByPublicKey, updateWorkspace,
    createUser, getUserByEmail, getUser, addMembership, getMembership, firstMembership, listMembers, updateRole, removeMember, countOwners,
    createInvitation, listInvitations, getInvitationByTokenHash, markInvitationAccepted,
    createSession, getSessionByHash, deleteSessionByHash,
    createApiKey, listApiKeys, getApiKeyByHash, touchApiKey, revokeApiKey,
    getLogSource, putLogSource,
    createConversation, getConversation, bindConversationCustomer, updateConversation, listConversations, addMessage, getMessage, listMessages, updateMessage, listPendingMessages,
    createTicket, getTicket, listTickets, updateTicket, addNote, listNotes,
    addKnowledge, listKnowledge, getKnowledge, updateKnowledge, reindexKnowledge, deleteKnowledge, retrieve,
    addAudit, listAudit,
    createWebhook, getWebhook, getWebhookSecretEnc, listWebhooks, listWebhooksForEvent, deleteWebhook, addDelivery, updateDelivery, listDeliveries,
    getBusinessProfile, putBusinessProfile, createFaq, getFaq, countFaqs, faqExists, listFaqs, updateFaq, deleteFaq, getOnboardingState, recordLogTest, recordCustomerTest, countKnowledgeDocs, hasVerifiedCustomerActivity,
    inboxCounts, listIssues, getIssue, updateIssue, getPlaybook, listPlaybooks, createPlaybook, updatePlaybook, deletePlaybook, playbookSuggestions, getHandoffRules, putHandoffRules,
    recordGap, getGap, listGaps, setGapStatus, rateMessage, qualitySummary,
    getIdentityKey, setIdentityKey, listCustomers, getCustomer, issueCustomers, createPasswordReset, getPasswordReset, recentPasswordResets, completePasswordReset,
    createSite, getSite, listSites, setSite, clearSiteDocs, addSiteDoc, deleteSite,
    createChannel, getChannel, findChannelByExternalId, listChannels, getChannelByKeyHash, rotateChannelKey, deleteChannel, touchChannel, getChannelConversation, linkChannelConversation,
    analyticsSummary, analyticsTimeseries, eraseCustomer, purgeOlderThan,
  };
};

module.exports = { createRepo, chunkText, fingerprint, DEFAULT_SETTINGS };

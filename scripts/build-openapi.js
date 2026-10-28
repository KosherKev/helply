"use strict";
/**
 * Builds docs/openapi.yaml (OpenAPI 3.1) from the operation table below.
 *   node scripts/build-openapi.js
 * test/contract.test.js fails when a route exists in code but not here (or the reverse), when a guard's role or
 * scope disagrees with `x-min-role` / `x-scope`, or when real responses stop matching these schemas.
 */
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const S = (name) => ({ $ref: `#/components/schemas/${name}` });
const str = { type: "string" };
const int = { type: "integer" };
const num = { type: "number" };
const bool = { type: "boolean" };
const nul = (t) => ({ ...t, type: [t.type, "null"] });
const obj = (properties, required = Object.keys(properties), extra = {}) => ({ type: "object", properties, required, ...extra });
const arr = (items) => ({ type: "array", items });
const en = (...v) => ({ type: "string", enum: v });
const lang = en("en", "tw", "gaa", "ee", "fat", "dag", "pcm");
const page = (item) => obj({ data: arr(item), nextCursor: nul(str) });

const schemas = {
  Error: obj({ error: obj({ code: str, message: str }), requestId: str }, ["error"]),
  LogLine: obj({ id: str, time: str, level: en("info", "warn", "error", "debug"), method: nul(str), path: nul(str), status: nul(int), durationMs: nul(int), traceId: nul(str), error: nul(obj({ message: str, code: nul(str) })), response: nul(str) }),
  TraceStep: obj({ step: en("identity", "understand", "translate_in", "logs", "explain", "knowledge", "translate_out", "done"), ms: num }, ["step", "ms"], { additionalProperties: true }),
  RootCause: obj({ summary: str, suggestedFix: str, citedLines: arr(str), confidence: num }),
  RoundTrip: obj({ backTranslation: str, similarity: num, reviewRecommended: bool, provider: en("khaya", "gemma", "none") }),
  Understanding: obj({ language: lang, languageName: str, english: str, intent: en("general_question", "account_issue", "human_request", "other") }),
  SupportResponse: obj({
    verified: bool, user: nul(obj({ id: str, name: nul(str) })), requiresAuth: bool, needsHuman: bool, understanding: S("Understanding"),
    reply: obj({ language: lang, english: str, text: str }), roundTrip: { oneOf: [{ type: "null" }, S("RoundTrip")] },
    evidence: { oneOf: [{ type: "null" }, arr(S("LogLine"))] }, rootCause: { oneOf: [{ type: "null" }, S("RootCause")] },
    ticketId: nul(str), trace: arr(S("TraceStep")), conversationId: str, messageId: str, handledBy: en("ai", "human"), held: bool,
  }, ["verified", "user", "requiresAuth", "needsHuman", "understanding", "reply", "roundTrip", "evidence", "rootCause", "ticketId", "trace", "conversationId", "messageId", "handledBy"]),
  VoiceResponse: { allOf: [S("SupportResponse"), obj({ transcript: str, replyAudio: nul(obj({ mimeType: str, base64: str })) }, ["transcript", "replyAudio"])] },
  Ticket: obj({
    id: str, createdAt: str, updatedAt: str, status: en("open", "needs_human", "resolved"), priority: en("low", "normal", "high", "urgent"), assigneeId: nul(str), conversationId: nul(str),
    title: str, userId: nul(str), language: lang, customerMessage: str, replyEnglish: str, rootCause: { oneOf: [{ type: "null" }, S("RootCause")] }, evidence: arr(S("LogLine")), notes: arr(S("Note")),
  }, ["id", "createdAt", "updatedAt", "status", "priority", "assigneeId", "conversationId", "title", "userId", "language", "customerMessage", "replyEnglish", "rootCause", "evidence"]),
  TicketPage: obj({ data: arr(S("Ticket")), tickets: arr(S("Ticket")), nextCursor: nul(str) }),
  Note: obj({ id: str, ticketId: str, authorId: nul(str), text: str, createdAt: str }),
  Message: obj({ id: str, conversationId: str, role: en("customer", "ai", "agent"), text: str, english: nul(str), language: nul(str), intent: nul(str), status: en("sent", "pending_review", "rejected"), reviewRecommended: bool, meta: { type: "object", additionalProperties: true }, authorId: nul(str), createdAt: str }),
  Conversation: obj({ id: str, customerId: nul(str), customerName: nul(str), language: lang, status: en("ai", "needs_human", "human", "resolved"), handedOff: bool, assigneeId: nul(str), firstResponseMs: nul(int), createdAt: str, updatedAt: str, lastMessage: nul(str), messageCount: int },
    ["id", "customerId", "customerName", "language", "status", "handedOff", "assigneeId", "firstResponseMs", "createdAt", "updatedAt"]),
  ConversationPage: page(S("Conversation")),
  ConversationDetail: { allOf: [S("Conversation"), obj({ messages: arr(S("Message")), ticketIds: arr(str) })] },
  AgentReplyResult: obj({ message: S("Message"), roundTrip: { oneOf: [{ type: "null" }, S("RoundTrip")] }, held: bool }),
  TranslationPreview: obj({ text: str, english: str, roundTrip: { oneOf: [{ type: "null" }, S("RoundTrip")] } }),
  PendingReply: obj({ id: str, conversationId: str, role: en("ai", "agent"), text: str, english: nul(str), language: nul(str), roundTrip: { oneOf: [{ type: "null" }, S("RoundTrip")] }, customerMessage: nul(str), createdAt: str }),
  WorkspaceSettings: obj({ languages: arr(lang), escalationThreshold: num, retentionDays: int, holdFlaggedReplies: bool, brandColor: str, aiLive: bool }),
  Workspace: obj({ id: str, name: str, slug: str, publicKey: str, settings: S("WorkspaceSettings"), createdAt: str }),
  User: obj({ id: str, email: str, name: nul(str) }),
  Session: obj({ session: str, expiresAt: str, user: S("User"), role: en("owner", "admin", "agent"), workspace: S("Workspace") }),
  Me: obj({ user: S("User"), role: en("owner", "admin", "agent"), workspace: S("Workspace") }),
  Member: obj({ id: str, email: str, name: nul(str), role: en("owner", "admin", "agent"), createdAt: str }),
  Invitation: obj({ id: str, email: str, role: en("admin", "agent"), expiresAt: str, createdAt: str }, ["id", "email", "role", "expiresAt"]),
  Team: obj({ members: arr(S("Member")), invitations: arr(S("Invitation")) }),
  ApiKey: obj({ id: str, name: str, prefix: str, scopes: arr(en("identity:mint", "conversations:read", "tickets:read", "tickets:write")), createdAt: str, lastUsedAt: nul(str), revokedAt: nul(str) }, ["id", "name", "prefix", "scopes"]),
  LogSource: obj({ source: { enum: ["workspace", "environment", null] }, baseUrl: nul(str), service: nul(str), userIdField: str, apiKeyMasked: nul(str) }),
  LogSourceTest: obj({ ok: bool, sampleCount: int, issues: arr(obj({ code: str, message: str })) }),
  Webhook: obj({ id: str, url: str, events: arr(str), createdAt: str }),
  Delivery: obj({ id: str, event: str, status: en("pending", "delivered", "failed"), attempts: int, responseStatus: nul(int), error: nul(str), createdAt: str }),
  AuditEvent: obj({ id: str, actorType: str, actorId: nul(str), action: str, detail: { type: "object", additionalProperties: true }, createdAt: str }),
  KnowledgeDoc: obj({ id: str, title: str, chunks: int, createdAt: str, updatedAt: str, text: str }, ["id", "title", "chunks", "createdAt"]),
  AnalyticsSummary: obj({
    conversations: int, resolvedByAI: int, handedOff: int, handoffRate: num, avgFirstResponseMs: nul(int), languages: arr(obj({ code: str, count: int })), intents: arr(obj({ intent: str, count: int })),
    reviewRate: num, topRootCauses: arr(obj({ fingerprint: str, summary: nul(str), count: int, lastSeen: str })), ticketsNeedingHuman: int,
  }),
  Capabilities: obj({
    brand: str, demoMode: bool, signupEnabled: bool, model: str,
    capabilities: obj({ model: bool, languageLayer: en("khaya", "model-fallback"), voice: bool, logs: bool, identity: bool }),
    languages: arr(obj({ code: str, name: str })), demoUsers: arr(obj({ id: str, name: str })), demoLogin: obj({ email: str, password: str }),
  }, ["brand", "demoMode", "signupEnabled", "model", "capabilities", "languages"]),
};

// ── v1.2 PLANNED schemas (see docs/API_V1_2_PLAN.md). Not implemented: dev:mock serves fixtures for them. ──
const nullable = (s) => ({ oneOf: [{ type: "null" }, s] });
Object.assign(schemas, {
  OnboardingStep: obj({
    id: en("workspace", "logs_shipped", "log_source", "identity", "business_profile", "knowledge", "channel", "test", "live"),
    title: str, description: str, status: en("done", "todo", "their_side", "blocked"), detail: nul(str), actionPath: nul(str), optional: bool,
  }),
  Onboarding: obj({ steps: arr(S("OnboardingStep")), completed: int, total: int, readyForLive: bool, live: bool }),
  BusinessProfile: obj({
    name: str, about: str, website: nul(str), hours: nul(str), timezone: str, contactEmail: nul(str), contactPhone: nul(str),
    languages: arr(lang), tone: en("friendly", "formal", "concise"), escalation: obj({ email: nul(str), phone: nul(str), whatsapp: nul(str) }), updatedAt: nul(str),
  }, ["name", "about", "timezone", "languages", "tone", "escalation"]),
  Faq: obj({ id: str, question: str, answer: str, language: lang, tags: arr(str), enabled: bool, source: en("manual", "import", "gap"), createdAt: str, updatedAt: str }),
  FaqImportResult: obj({ created: int, skipped: int, errors: arr(obj({ row: int, message: str })) }),
  KnowledgeSite: obj({ id: str, url: str, status: en("queued", "crawling", "ready", "failed"), pages: int, lastIndexedAt: nul(str), error: nul(str) }),
  Playbook: obj({
    id: str, errorCode: str, pathPattern: nul(str), title: str, customerWording: str, internalNote: nul(str), ownerTeam: nul(str),
    severity: en("low", "normal", "high"), alwaysHandoff: bool, enabled: bool, createdAt: str, updatedAt: str,
  }),
  PlaybookSuggestion: obj({ errorCode: str, count: int, lastSeen: str, sampleTicketIds: arr(str) }),
  HandoffRules: obj({ alwaysHandoffIntents: arr(en("human_request", "account_issue")), keywords: arr(str), minConfidence: num, outsideHours: en("ai_only", "handoff", "ai_and_notify"), notifyEmail: nul(str) }),
  KnowledgeGap: obj({ id: str, question: str, count: int, language: lang, firstSeen: str, lastSeen: str, status: en("open", "resolved", "dismissed"), sampleConversationIds: arr(str) }),
  Issue: obj({
    id: str, summary: str, suggestedFix: nul(str), status: en("open", "investigating", "fixed", "wont_fix"), severity: en("low", "normal", "high"), count: int, affectedCustomers: int,
    firstSeen: str, lastSeen: str, assigneeId: nul(str), ticketIds: arr(str), fixedAt: nul(str),
  }),
  IssueDetail: { allOf: [S("Issue"), obj({ evidence: arr(S("LogLine")), notes: arr(S("Note")) })] },
  NotifyFixedResult: obj({ dryRun: bool, affectedCustomers: int, notified: int, skipped: int }),
  Customer: obj({ id: str, name: nul(str), conversations: int, tickets: int, firstSeen: str, lastSeen: str, languages: arr(lang) }),
  CustomerDetail: { allOf: [S("Customer"), obj({ conversationIds: arr(str), ticketIds: arr(str) })] },
  Channel: obj({ id: str, kind: en("chatflow"), label: str, externalId: str, status: en("pending", "connected", "error"), lastSeenAt: nul(str), keyPrefix: str, createdAt: str }),
  ChannelCreated: { allOf: [S("Channel"), obj({ relayKey: str })] },
  ChannelTest: obj({ ok: bool, issues: arr(obj({ code: str, message: str })) }),
  RelayReply: obj({
    conversationId: str, reply: nullable(obj({ text: str, english: str, language: lang })), handledBy: en("ai", "none"), needsHuman: bool, verified: bool, requiresAuth: bool,
    ticketId: nul(str), held: bool, suppressed: nullable(en("agent_online", "human_taken_over", "ai_paused", "cap_reached", "outside_hours")),
  }),
  RelayConfig: obj({ aiEnabled: bool, fallbackMessage: str, languages: arr(lang) }),
  IdentityKey: obj({ mode: en("shared_secret", "public_key"), alg: en("HS256", "RS256", "ES256"), kid: nul(str), publicKeyPem: nul(str), jwksUrl: nul(str) }),
  QualitySummary: obj({ ratedReplies: int, goodRate: num, answeredFromKnowledge: num, answeredFromLogs: num, flaggedTranslations: int, handoffReasons: arr(obj({ reason: str, count: int })) }),
  InboxCounts: obj({ needsHuman: int, mine: int, unassigned: int, aiActive: int, resolvedToday: int }),
});

const ref = (n) => S(n);
const json = (schema) => ({ "application/json": { schema } });

/** [summary, tag, access, requestSchema|null, responseSchema|null, status, extras] */
const ops = {
  "GET /health": ["Liveness", "System", "public", null, obj({ ok: bool, brand: str }), 200],
  "GET /v1/config": ["Capabilities and demo info", "System", "public", null, ref("Capabilities"), 200],
  "POST /v1/demo/token": ["Mint a demo customer token (demo mode only, else 404)", "System", "public", obj({ userId: str }), obj({ token: str, user: obj({ id: str, name: str }), expiresIn: int }), 200],

  "POST /v1/support/message": ["Customer message", "Support", "public", obj({ message: str, token: str, language: lang, conversationId: str, publicKey: str }, ["message"]), ref("SupportResponse"), 200],
  "POST /v1/support/voice": ["Customer voice message", "Support", "public", obj({ audioBase64: str, language: lang, token: str, conversationId: str, publicKey: str }, ["audioBase64"]), ref("VoiceResponse"), 200],
  "GET /v1/support/conversations/{id}/messages": ["Customer polls for agent and AI replies", "Support", "public", null, obj({ status: en("ai", "needs_human", "human", "resolved"), messages: arr(obj({ id: str, role: str, text: str, english: nul(str), language: nul(str), createdAt: str })) }), 200, { query: ["after"] }],

  "POST /v1/auth/register": ["Create a workspace and its owner (when sign-up is open)", "Auth", "public", obj({ email: str, password: str, workspaceName: str, name: str }, ["email", "password", "workspaceName"]), ref("Session"), 201],
  "POST /v1/auth/login": ["Log in (backoff after repeated failures)", "Auth", "public", obj({ email: str, password: str, workspaceId: str }, ["email", "password"]), ref("Session"), 200],
  "POST /v1/auth/accept-invite": ["Accept a team invitation", "Auth", "public", obj({ token: str, password: str, name: str }, ["token", "password"]), ref("Session"), 201],
  "POST /v1/auth/logout": ["Log out", "Auth", "agent", null, null, 204],
  "GET /v1/auth/me": ["Current user, role and workspace", "Auth", "agent", null, ref("Me"), 200],

  "GET /v1/workspace": ["Workspace and settings", "Workspace", "agent", null, ref("Workspace"), 200],
  "PATCH /v1/workspace": ["Update name and settings", "Workspace", "admin", obj({ name: str, settings: S("WorkspaceSettings") }, []), ref("Workspace"), 200],
  "GET /v1/members": ["Member names for assignee pickers (no emails)", "Team", "agent", null, obj({ data: arr(obj({ id: str, name: str, role: en("owner", "admin", "agent") })) }), 200],
  "GET /v1/team": ["Members and pending invitations", "Team", "admin", null, ref("Team"), 200],
  "POST /v1/team/invitations": ["Invite a member (returns a link; email delivery is out of scope)", "Team", "admin", obj({ email: str, role: en("admin", "agent") }), obj({ invitation: S("Invitation"), token: str, link: str }), 201],
  "PATCH /v1/team/{userId}": ["Change a member's role", "Team", "admin", obj({ role: en("owner", "admin", "agent") }), obj({ userId: str, role: str }), 200],
  "DELETE /v1/team/{userId}": ["Remove a member", "Team", "admin", null, null, 204],
  "GET /v1/api-keys": ["List API keys (prefix only)", "Developers", "admin", null, obj({ data: arr(S("ApiKey")) }), 200],
  "POST /v1/api-keys": ["Create an API key (shown once)", "Developers", "admin", obj({ name: str, scopes: arr(str) }), { allOf: [S("ApiKey"), obj({ key: str })] }, 201],
  "DELETE /v1/api-keys/{id}": ["Revoke an API key", "Developers", "admin", null, null, 204],
  "GET /v1/audit": ["Audit events (append only)", "Audit", "admin", null, page(S("AuditEvent")), 200, { query: ["actor", "action", "from", "to", "limit", "cursor"] }],

  "GET /v1/log-source": ["Log source (key masked)", "Connections", "admin", null, ref("LogSource"), 200],
  "PUT /v1/log-source": ["Set the log source (key encrypted at rest)", "Connections", "admin", obj({ baseUrl: str, apiKey: str, service: str, userIdField: str }, ["baseUrl", "service"]), ref("LogSource"), 200],
  "POST /v1/log-source/test": ["Test connectivity and userId filtering, with plain-language issues", "Connections", "admin", null, ref("LogSourceTest"), 200],
  "GET /v1/identity": ["Identity configuration", "Connections", "admin", null, obj({ configured: bool, workspaceId: str, tokenMaxAgeSeconds: int, secretSource: str }), 200],
  "POST /v1/identity/rotate-secret": ["Rotate the workspace signing secret (shown once)", "Connections", "owner", null, obj({ secret: str }), 200],
  "POST /v1/identity/tokens": ["Mint a customer token (API key scope identity:mint, or admin session). Optional visitorId binds it to one chat visitor (claim vid)", "Connections", "admin", obj({ userId: str, name: str, visitorId: str }, ["userId"]), obj({ token: str, expiresIn: int }), 200, { scope: "identity:mint" }],

  "GET /v1/webhooks": ["List webhooks and available events", "Developers", "admin", null, obj({ data: arr(S("Webhook")), events: arr(str) }), 200],
  "POST /v1/webhooks": ["Create a webhook (https only, SSRF-protected; secret shown once)", "Developers", "admin", obj({ url: str, events: arr(str) }), { allOf: [S("Webhook"), obj({ secret: str })] }, 201],
  "DELETE /v1/webhooks/{id}": ["Delete a webhook", "Developers", "admin", null, null, 204],
  "POST /v1/webhooks/{id}/test": ["Send a signed test delivery", "Developers", "admin", null, obj({ deliveryId: str, ok: bool, status: nul(int), error: nul(str) }), 200],
  "GET /v1/webhooks/{id}/deliveries": ["Delivery log", "Developers", "admin", null, obj({ data: arr(S("Delivery")) }), 200],

  "GET /v1/conversations": ["List conversations", "Conversations", "agent", null, ref("ConversationPage"), 200, { scope: "conversations:read", query: ["status", "language", "q", "userId", "from", "to", "limit", "cursor"] }],
  "GET /v1/conversations/{id}": ["Conversation with messages, evidence and trace", "Conversations", "agent", null, ref("ConversationDetail"), 200, { scope: "conversations:read" }],
  "POST /v1/conversations/{id}/takeover": ["Take over from the AI", "Conversations", "agent", null, ref("Conversation"), 200],
  "POST /v1/conversations/{id}/resolve": ["Resolve", "Conversations", "agent", null, ref("Conversation"), 200],
  "POST /v1/conversations/{id}/translate-preview": ["Translate a draft and run the round-trip check (nothing is sent)", "Conversations", "agent", obj({ text: str }), ref("TranslationPreview"), 200],
  "POST /v1/conversations/{id}/messages": ["Send an agent reply (translated unless language is 'customer')", "Conversations", "agent", obj({ text: str, language: en("en", "customer") }, ["text"]), ref("AgentReplyResult"), 201],
  "GET /v1/replies/pending": ["Review queue", "Review", "agent", null, obj({ data: arr(S("PendingReply")) }), 200],
  "POST /v1/replies/{id}/approve": ["Approve (optionally edited) and send", "Review", "agent", obj({ text: str }, []), ref("Message"), 200],
  "POST /v1/replies/{id}/reject": ["Reject a held reply", "Review", "agent", null, ref("Message"), 200],
  "GET /v1/events": ["Dashboard server-sent events (new ticket, handoff, review needed)", "Conversations", "agent", null, { type: "string" }, 200],

  "GET /v1/tickets": ["List tickets (cursor pagination)", "Tickets", "agent", null, ref("TicketPage"), 200, { scope: "tickets:read", legacy: true, query: ["status", "assigneeId", "priority", "language", "q", "limit", "cursor"] }],
  "GET /v1/tickets/{id}": ["Ticket with notes", "Tickets", "agent", null, ref("Ticket"), 200, { scope: "tickets:read", legacy: true }],
  "PATCH /v1/tickets/{id}": ["Update status, assignee, priority", "Tickets", "agent", obj({ status: en("open", "needs_human", "resolved"), assigneeId: nul(str), priority: en("low", "normal", "high", "urgent") }, []), ref("Ticket"), 200, { scope: "tickets:write", legacy: true }],
  "POST /v1/tickets/{id}/notes": ["Add an internal note", "Tickets", "agent", obj({ text: str }), ref("Note"), 201, { scope: "tickets:write" }],
  "GET /v1/tickets/{id}/export": ["Developer handoff as GitHub issue Markdown", "Tickets", "agent", null, obj({ title: str, body: str }), 200, { scope: "tickets:read", query: ["format"] }],

  "GET /v1/knowledge": ["List documents", "Knowledge", "agent", null, obj({ documents: arr(S("KnowledgeDoc")) }), 200, { legacy: true }],
  "POST /v1/knowledge": ["Add a document", "Knowledge", "admin", obj({ title: str, text: str }, ["text"]), ref("KnowledgeDoc"), 201, { legacy: true }],
  "POST /v1/knowledge/upload": ["Upload .txt, .md or .csv (max 1 MB)", "Knowledge", "admin", obj({ filename: str, contentBase64: str }, ["filename"]), ref("KnowledgeDoc"), 201],
  "GET /v1/knowledge/{id}": ["Document with text", "Knowledge", "agent", null, ref("KnowledgeDoc"), 200],
  "PUT /v1/knowledge/{id}": ["Edit and reindex", "Knowledge", "admin", obj({ title: str, text: str }, []), ref("KnowledgeDoc"), 200],
  "POST /v1/knowledge/{id}/reindex": ["Reindex", "Knowledge", "admin", null, ref("KnowledgeDoc"), 200],
  "DELETE /v1/knowledge/{id}": ["Delete", "Knowledge", "admin", null, null, 204, { legacy: true }],

  "GET /v1/analytics/summary": ["KPIs, language mix, intents, top root causes", "Analytics", "agent", null, ref("AnalyticsSummary"), 200, { query: ["from", "to"] }],
  "GET /v1/analytics/timeseries": ["Time series", "Analytics", "agent", null, obj({ metric: str, interval: str, data: arr(obj({ bucket: str, count: int })) }), 200, { query: ["metric", "interval", "from", "to"] }],
  "DELETE /v1/customers/{userId}/data": ["Erase a customer's conversations, messages and tickets", "Privacy", "admin", null, obj({ erased: obj({ conversations: int, messages: int, tickets: int }) }), 200],

  // PLANNED: not built; the contract test asserts these are NOT routed so the spec cannot silently go stale.
  "GET /widget.js": ["Embeddable chat script", "Planned", "public", null, { type: "string" }, 200, { planned: true }],
  "POST /v1/widget/session": ["Origin-allowlisted widget bootstrap", "Planned", "public", null, obj({ token: str }), 200, { planned: true }],
  "GET /v1/conversations/{id}/events": ["Customer-side SSE (v1.1 ships polling instead)", "Planned", "public", null, { type: "string" }, 200, { planned: true }],
  // ── v1.2 PLANNED: onboarding, business info, FAQ, playbooks, issues, channels (ChatFlow relay), identity keys. x-priority: P0 first. ──
  "GET /v1/onboarding": ["Onboarding checklist computed from the workspace's real state", "Onboarding", "agent", null, ref("Onboarding"), 200],
  "POST /v1/onboarding/test": ["Run a real test customer message through the full pipeline (not counted in analytics)", "Onboarding", "admin", obj({ userId: str, message: str, language: lang }, ["userId", "message"]), ref("SupportResponse"), 200],
  "POST /v1/onboarding/go-live": ["Switch the AI on for customers (requires readyForLive)", "Onboarding", "admin", null, ref("Onboarding"), 200],
  "POST /v1/onboarding/pause": ["Pause the AI: every message goes to a person", "Onboarding", "admin", null, ref("Onboarding"), 200],
  "GET /v1/business-profile": ["Business profile the assistant may rely on", "Business", "agent", null, ref("BusinessProfile"), 200],
  "PUT /v1/business-profile": ["Replace the business profile", "Business", "admin", ref("BusinessProfile"), ref("BusinessProfile"), 200],
  "GET /v1/faqs": ["List FAQ entries", "Business", "agent", null, page(S("Faq")), 200, { query: ["q", "language", "enabled", "limit", "cursor"] }],
  "POST /v1/faqs": ["Create an FAQ entry", "Business", "admin", obj({ question: str, answer: str, language: lang, tags: arr(str), enabled: bool }, ["question", "answer"]), ref("Faq"), 201],
  "PUT /v1/faqs/{id}": ["Edit an FAQ entry", "Business", "admin", obj({ question: str, answer: str, language: lang, tags: arr(str), enabled: bool }, []), ref("Faq"), 200],
  "DELETE /v1/faqs/{id}": ["Delete an FAQ entry", "Business", "admin", null, null, 204],
  "POST /v1/faqs/import": ["Import FAQ from CSV (columns question, answer, language, tags)", "Business", "admin", obj({ filename: str, contentBase64: str }), ref("FaqImportResult"), 200],
  "GET /v1/knowledge/sites": ["Websites indexed for answers", "Business", "agent", null, obj({ data: arr(S("KnowledgeSite")) }), 200],
  "POST /v1/knowledge/sites": ["Index a website (SSRF-safe crawler, capped pages and size)", "Business", "admin", obj({ url: str }), ref("KnowledgeSite"), 201],
  "POST /v1/knowledge/sites/{id}/reindex": ["Re-crawl a website", "Business", "admin", null, ref("KnowledgeSite"), 200],
  "DELETE /v1/knowledge/sites/{id}": ["Remove an indexed website", "Business", "admin", null, null, 204],
  "GET /v1/playbooks": ["Error playbooks: error code to customer wording and owner", "Playbooks", "agent", null, obj({ data: arr(S("Playbook")) }), 200],
  "POST /v1/playbooks": ["Create a playbook", "Playbooks", "admin", obj({ errorCode: str, pathPattern: nul(str), title: str, customerWording: str, internalNote: nul(str), ownerTeam: nul(str), severity: en("low", "normal", "high"), alwaysHandoff: bool, enabled: bool }, ["errorCode", "title", "customerWording"]), ref("Playbook"), 201],
  "PUT /v1/playbooks/{id}": ["Edit a playbook", "Playbooks", "admin", obj({ errorCode: str, pathPattern: nul(str), title: str, customerWording: str, internalNote: nul(str), ownerTeam: nul(str), severity: en("low", "normal", "high"), alwaysHandoff: bool, enabled: bool }, []), ref("Playbook"), 200],
  "DELETE /v1/playbooks/{id}": ["Delete a playbook", "Playbooks", "admin", null, null, 204],
  "GET /v1/playbooks/suggestions": ["Error codes seen in evidence that have no playbook yet", "Playbooks", "agent", null, obj({ data: arr(S("PlaybookSuggestion")) }), 200],
  "GET /v1/handoff-rules": ["When the AI must hand over to a person", "Business", "agent", null, ref("HandoffRules"), 200],
  "PUT /v1/handoff-rules": ["Replace handoff rules", "Business", "admin", ref("HandoffRules"), ref("HandoffRules"), 200],
  "GET /v1/knowledge-gaps": ["Questions the AI could not answer, clustered", "Quality", "agent", null, page(S("KnowledgeGap")), 200, { query: ["status", "limit", "cursor"] }],
  "POST /v1/knowledge-gaps/{id}/resolve": ["Close a gap, optionally creating an FAQ from it", "Quality", "admin", obj({ faqId: str, faq: obj({ question: str, answer: str }) }, []), ref("KnowledgeGap"), 200],
  "POST /v1/knowledge-gaps/{id}/dismiss": ["Dismiss a gap", "Quality", "admin", null, ref("KnowledgeGap"), 200],
  "POST /v1/messages/{id}/feedback": ["Rate an AI reply (good or bad, with a reason)", "Quality", "agent", obj({ rating: en("good", "bad"), reason: en("wrong", "unclear", "translation", "tone", "other"), note: str }, ["rating"]), obj({ ok: bool }), 200],
  "GET /v1/analytics/quality": ["AI quality summary", "Quality", "agent", null, ref("QualitySummary"), 200, { query: ["from", "to"] }],
  "GET /v1/issues": ["Root causes grouped across customers", "Issues", "agent", null, page(S("Issue")), 200, { query: ["status", "q", "limit", "cursor"] }],
  "GET /v1/issues/{id}": ["One issue with sample evidence and notes", "Issues", "agent", null, ref("IssueDetail"), 200],
  "PATCH /v1/issues/{id}": ["Update status or assignee", "Issues", "agent", obj({ status: en("open", "investigating", "fixed", "wont_fix"), assigneeId: nul(str) }, []), ref("Issue"), 200],
  "POST /v1/issues/{id}/notify-fixed": ["Hand affected customers and your wording to your webhook (event issue.fixed); call with dryRun true first", "Issues", "admin", obj({ message: str, dryRun: bool }, ["dryRun"]), ref("NotifyFixedResult"), 200],
  "GET /v1/issues/{id}/export": ["Issue as GitHub issue Markdown", "Issues", "agent", null, obj({ title: str, body: str }), 200],
  "GET /v1/customers": ["Customers who have contacted support", "Customers", "agent", null, page(S("Customer")), 200, { query: ["q", "limit", "cursor"] }],
  "GET /v1/customers/{userId}": ["One customer's conversations and tickets", "Customers", "agent", null, ref("CustomerDetail"), 200],
  "GET /v1/inbox/counts": ["Counts for the inbox tabs", "Conversations", "agent", null, ref("InboxCounts"), 200],
  "PATCH /v1/conversations/{id}": ["Assign a conversation", "Conversations", "agent", obj({ assigneeId: nul(str) }, ["assigneeId"]), ref("Conversation"), 200],
  "GET /v1/channels": ["Connected channels (ChatFlow properties)", "Channels", "admin", null, obj({ data: arr(S("Channel")) }), 200],
  "POST /v1/channels": ["Connect a ChatFlow property; returns the relay key once", "Channels", "admin", obj({ kind: en("chatflow"), label: str, externalId: str }), ref("ChannelCreated"), 201],
  "DELETE /v1/channels/{id}": ["Disconnect a channel and revoke its key", "Channels", "admin", null, null, 204],
  "POST /v1/channels/{id}/rotate-key": ["Issue a new relay key (old one stops working)", "Channels", "admin", null, obj({ relayKey: str, keyPrefix: str }), 200],
  "POST /v1/channels/{id}/test": ["Check the channel has called Helply and the key is valid", "Channels", "admin", null, ref("ChannelTest"), 200],
  "POST /v1/relay/message": ["ChatFlow server relays a visitor message and gets the AI reply", "Relay", "relay", obj({ externalConversationId: str, externalVisitorId: str, message: str, identityToken: str, languageHint: lang, agentOnline: bool }, ["externalConversationId", "externalVisitorId", "message"]), ref("RelayReply"), 200],
  "POST /v1/relay/events": ["ChatFlow tells Helply what happened in its inbox", "Relay", "relay", obj({ externalConversationId: str, type: en("agent_joined", "agent_left", "agent_message", "conversation_closed", "conversation_reopened"), text: str, at: str }, ["externalConversationId", "type"]), obj({ ok: bool }), 200],
  "POST /v1/relay/identify": ["Refresh a visitor's verified identity when the widget gets a new token", "Relay", "relay", obj({ externalVisitorId: str, identityToken: str }), obj({ verified: bool, expiresAt: nul(str) }), 200],
  "GET /v1/relay/config": ["What ChatFlow needs to know before relaying", "Relay", "relay", null, ref("RelayConfig"), 200],
  "GET /v1/identity/key": ["Customer-token verification mode and public key", "Connections", "admin", null, ref("IdentityKey"), 200],
  "DELETE /v1/identity/key": ["Go back to shared-secret verification", "Connections", "admin", null, ref("IdentityKey"), 200],
  "PUT /v1/identity/key": ["Switch to public-key verification (RS256/ES256, PEM or JWKS URL)", "Connections", "admin", obj({ alg: en("RS256", "ES256"), publicKeyPem: nul(str), jwksUrl: nul(str), kid: nul(str) }, ["alg"]), ref("IdentityKey"), 200],
  "POST /v1/auth/forgot-password": ["Email a reset link (always 202, never reveals if the email exists)", "Auth", "public", obj({ email: str }), obj({ ok: bool }), 202],
  "POST /v1/auth/reset-password": ["Set a new password with the emailed token", "Auth", "public", obj({ token: str, password: str }), obj({ ok: bool }), 200],
};


const paramsFor = (p, extra = {}) => [
  ...[...p.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: str })),
  ...(extra.query || []).map((name) => ({ name, in: "query", required: false, schema: ["limit"].includes(name) ? int : str })),
];

const build = () => {
  const paths = {};
  for (const [key, [summary, tag, access, req, res, status, extra = {}]] of Object.entries(ops)) {
    const [method, p] = key.split(" ");
    const op = { tags: [tag], summary, operationId: `${method.toLowerCase()}${p.replace(/\{(\w+)\}/g, "_$1").replace(/[^A-Za-z0-9_]+/g, "_")}`, parameters: paramsFor(p, extra) };
    if (!op.parameters.length) delete op.parameters;
    if (extra.planned) op["x-planned"] = true;
    if (extra.priority) op["x-priority"] = extra.priority;
    if (access === "public") op.security = [];
    else if (access === "relay") {
      op.security = [{ relayAuth: [] }];
      op["x-min-role"] = "relay";
    } else {
      op.security = access === "agent" || access === "admin" || access === "owner"
        ? [{ sessionAuth: [] }, ...(extra.scope ? [{ apiKeyAuth: [] }] : []), ...(extra.legacy ? [{ consoleKey: [] }] : [])]
        : [];
      op["x-min-role"] = access;
      if (extra.scope) op["x-scope"] = extra.scope;
      if (extra.legacy) op["x-legacy-open"] = true;
    }
    if (req) op.requestBody = { required: true, content: json(req) };
    const okContent = res ? (res.type === "string" ? { "text/plain": { schema: res } } : json(res)) : undefined;
    op.responses = {
      [String(status)]: { description: status === 204 ? "No content" : "OK", ...(okContent ? { content: okContent } : {}) },
      ...(access === "public" ? {} : { 401: { description: "No or invalid credential", content: json(S("Error")) }, 403: { description: "Role or scope not allowed", content: json(S("Error")) } }),
      default: { description: "Error", content: json(S("Error")) },
    };
    (paths[p] ||= {})[method.toLowerCase()] = op;
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Helply API", version: "1.2.0", license: { name: "MIT", identifier: "MIT" },
      description: "Open-source support that speaks Ghanaian languages and reads your logs. Tenant id is always taken from the credential (session, API key, verified customer token), never from a request body. Operations marked x-planned are PLANNED and not implemented.",
    },
    servers: [{ url: "http://localhost:8787" }],
    tags: [...new Set(Object.values(ops).map((o) => o[1]))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        sessionAuth: { type: "http", scheme: "bearer", description: "Opaque session token from /v1/auth/login (12h)." },
        apiKeyAuth: { type: "http", scheme: "bearer", description: "hk_live_... workspace API key; scopes limit what it can reach." },
        relayAuth: { type: "http", scheme: "bearer", description: "hr_live_... channel relay key, held by a connected ChatFlow server (PLANNED)." },
        consoleKey: { type: "apiKey", in: "header", name: "X-Console-Key", description: "Legacy single-workspace key (default workspace only)." },
      },
      schemas,
    },
  };
};

if (require.main === module) {
  const out = path.join(__dirname, "..", "docs", "openapi.yaml");
  fs.writeFileSync(out, `# GENERATED by scripts/build-openapi.js: edit the script, then run it. test/contract.test.js keeps it honest.\n${YAML.stringify(build(), { lineWidth: 0, aliasDuplicateObjects: false })}`);
  console.log(`wrote ${out}`);
}

module.exports = { build };

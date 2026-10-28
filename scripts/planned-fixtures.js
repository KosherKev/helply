"use strict";
/**
 * Canned responses for every PLANNED operation in docs/openapi.yaml, served by `npm run dev:mock` so the dashboard can be
 * built before the backend exists. test/planned-fixtures.test.js validates each fixture against the spec's schema, so these
 * cannot drift from the contract. They are examples, not behaviour: nothing here is persisted.
 */
const T = "2026-10-28T10:00:00.000Z";
const T2 = "2026-10-28T14:30:00.000Z";

const step = (id, title, description, status, detail = null, actionPath = null) => ({ id, title, description, status, detail, actionPath });
const onboarding = (live = false) => ({
  steps: [
    step("workspace", "Create the workspace", "Name your company and become its owner", "done"),
    step("logs_shipped", "Ship logs with the user id", "Your app logs metadata.userId on each request", "their_side", "Add the id to your request logs, then run the log source test.", "/app/connections"),
    step("log_source", "Connect the log source", "URL, read-only key and service name", "done", "Connected. 4 recent log lines, user id filter works."),
    step("identity", "Connect customer identity", "Sign tokens in your backend", "done"),
    step("business_profile", "Add your business details", "Hours, contacts, tone and languages", "todo", null, "/app/business"),
    step("knowledge", "Add FAQ and policies", "At least 5 FAQ entries or one document", "todo", "0 FAQ entries, 5 documents.", "/app/business/faq"),
    step("channel", "Link your chat channel", "Connect a ChatFlow property", "todo", null, "/app/connections"),
    step("test", "Test as a customer", "Send a test message through the full pipeline", "todo", null, "/app/onboarding"),
    step("live", "Switch the AI on", "Customers start getting AI replies", live ? "done" : "blocked", live ? null : "Finish the steps above first."),
  ],
  completed: live ? 9 : 3, total: 9, readyForLive: live, live,
});

const profile = {
  name: "KwikPay Shop", about: "Online shop in Accra selling phones and accessories. We deliver nationwide and accept mobile money.", website: "https://kwikpay.example",
  hours: "Mon to Sat, 8am to 6pm", timezone: "Africa/Accra", contactEmail: "help@kwikpay.example", contactPhone: "+233200000000", languages: ["en", "tw", "pcm"], tone: "friendly",
  escalation: { email: "support@kwikpay.example", phone: null, whatsapp: "+233200000000" }, updatedAt: T,
};
const faq = (id, q, a, o = {}) => ({ id, question: q, answer: a, language: "en", tags: ["delivery"], enabled: true, source: "manual", createdAt: T, updatedAt: T, ...o });
const faqs = [faq("faq_1", "How long does delivery take?", "1 to 3 working days in Greater Accra, 3 to 6 elsewhere."), faq("faq_2", "Can I return an item?", "Yes, within 7 days if unused and in its packaging.", { tags: ["returns"] })];
const site = { id: "site_1", url: "https://kwikpay.example", status: "ready", pages: 12, lastIndexedAt: T, error: null };
const playbook = {
  id: "pb_1", errorCode: "PROVIDER_TIMEOUT", pathPattern: "/api/payments/*", title: "MoMo provider timeout",
  customerWording: "Your payment may have reached MTN even though our page timed out. Please do not pay again; we are checking.", internalNote: "Gateway retries are capped at 1. Check the MTN status page.",
  ownerTeam: "Payments", severity: "high", alwaysHandoff: false, enabled: true, createdAt: T, updatedAt: T,
};
const gap = { id: "gap_1", question: "Do you deliver to Tamale on Sundays?", count: 7, language: "en", firstSeen: T, lastSeen: T2, status: "open", sampleConversationIds: ["c_1", "c_2"] };
const issue = {
  id: "iss_91ab", summary: "MoMo gateway times out, then the webhook fails to mark the order paid", suggestedFix: "Make the webhook idempotent and retry the order update.", status: "open", severity: "high",
  count: 14, affectedCustomers: 9, firstSeen: T, lastSeen: T2, assigneeId: null, ticketIds: ["T-0001", "T-0004"], fixedAt: null,
};
const line = { id: "L1", time: T, level: "error", method: "POST", path: "/api/payments/momo", status: 504, durationMs: 30012, traceId: "trace-1", error: { message: "gateway timeout", code: "PROVIDER_TIMEOUT" }, response: null };
const channel = { id: "ch_1", kind: "chatflow", label: "KwikPay website", externalId: "wid_8f3a", status: "connected", lastSeenAt: T2, keyPrefix: "hr_live_Ab12", createdAt: T };
const relayReply = (o = {}) => ({
  conversationId: "c_1", reply: { text: "Your payment reached MTN, but our system did not mark the order as paid. We are fixing it.", english: "Your payment reached MTN, but our system did not mark the order as paid. We are fixing it.", language: "en" },
  handledBy: "ai", needsHuman: false, verified: true, requiresAuth: false, ticketId: "T-0001", held: false, suppressed: null, ...o,
});
const page = (data) => ({ data, nextCursor: null });
const supportResponse = {
  verified: true, user: { id: "usr_demo_ama", name: "Ama Mensah" }, requiresAuth: false, needsHuman: false,
  understanding: { language: "en", languageName: "English", english: "My MoMo payment failed", intent: "account_issue" },
  reply: { language: "en", english: "Your payment timed out at MTN.", text: "Your payment timed out at MTN." }, roundTrip: null, evidence: [line],
  rootCause: { summary: "Gateway timeout", suggestedFix: "Retry with idempotency", citedLines: ["L1"], confidence: 0.9 }, ticketId: "T-0099", trace: [{ step: "identity", ms: 0, verified: true }], conversationId: "c_test", messageId: "m_test", handledBy: "ai",
};

/** key = "METHOD /path/with/{params}" exactly as in docs/openapi.yaml; value = the 2xx response body (null for 204). */
module.exports = {
  "GET /v1/onboarding": onboarding(false),
  "POST /v1/onboarding/test": supportResponse,
  "POST /v1/onboarding/go-live": onboarding(true),
  "POST /v1/onboarding/pause": onboarding(false),
  "GET /v1/business-profile": profile,
  "PUT /v1/business-profile": profile,
  "GET /v1/faqs": page(faqs),
  "POST /v1/faqs": faqs[0],
  "PUT /v1/faqs/{id}": faqs[0],
  "DELETE /v1/faqs/{id}": null,
  "POST /v1/faqs/import": { created: 12, skipped: 1, errors: [{ row: 7, message: "answer is empty" }] },
  "GET /v1/knowledge/sites": { data: [site] },
  "POST /v1/knowledge/sites": { ...site, status: "queued", pages: 0, lastIndexedAt: null },
  "POST /v1/knowledge/sites/{id}/reindex": { ...site, status: "crawling" },
  "DELETE /v1/knowledge/sites/{id}": null,
  "GET /v1/playbooks": { data: [playbook] },
  "POST /v1/playbooks": playbook,
  "PUT /v1/playbooks/{id}": playbook,
  "DELETE /v1/playbooks/{id}": null,
  "GET /v1/playbooks/suggestions": { data: [{ errorCode: "WEBHOOK_ORDER_NOT_FOUND", count: 6, lastSeen: T2, sampleTicketIds: ["T-0003"] }] },
  "GET /v1/handoff-rules": { alwaysHandoffIntents: ["human_request"], keywords: ["refund", "fraud", "lawyer"], minConfidence: 0.6, outsideHours: "ai_and_notify", notifyEmail: "support@kwikpay.example" },
  "PUT /v1/handoff-rules": { alwaysHandoffIntents: ["human_request"], keywords: ["refund", "fraud", "lawyer"], minConfidence: 0.6, outsideHours: "ai_and_notify", notifyEmail: "support@kwikpay.example" },
  "GET /v1/knowledge-gaps": page([gap]),
  "POST /v1/knowledge-gaps/{id}/resolve": { ...gap, status: "resolved" },
  "POST /v1/knowledge-gaps/{id}/dismiss": { ...gap, status: "dismissed" },
  "POST /v1/messages/{id}/feedback": { ok: true },
  "GET /v1/analytics/quality": { ratedReplies: 48, goodRate: 0.83, answeredFromKnowledge: 0.41, answeredFromLogs: 0.37, flaggedTranslations: 5, handoffReasons: [{ reason: "no_evidence", count: 9 }, { reason: "customer_asked", count: 6 }] },
  "GET /v1/issues": page([issue]),
  "GET /v1/issues/{id}": { ...issue, evidence: [line], notes: [{ id: "note_1", ticketId: "T-0001", authorId: null, text: "Raised with the MTN account manager.", createdAt: T2 }] },
  "PATCH /v1/issues/{id}": { ...issue, status: "investigating" },
  "POST /v1/issues/{id}/notify-fixed": { dryRun: true, affectedCustomers: 9, notified: 0, skipped: 2 },
  "GET /v1/issues/{id}/export": { title: "[iss_91ab] MoMo gateway times out, then the webhook fails", body: "## Customer impact\n9 customers affected.\n\n## Evidence\n```\nL1 POST /api/payments/momo 504 PROVIDER_TIMEOUT\n```" },
  "GET /v1/customers": page([{ id: "usr_demo_ama", name: "Ama Mensah", conversations: 3, tickets: 2, firstSeen: T, lastSeen: T2, languages: ["en", "pcm"] }]),
  "GET /v1/customers/{userId}": { id: "usr_demo_ama", name: "Ama Mensah", conversations: 3, tickets: 2, firstSeen: T, lastSeen: T2, languages: ["en", "pcm"], conversationIds: ["c_1", "c_2", "c_3"], ticketIds: ["T-0001", "T-0004"] },
  "GET /v1/inbox/counts": { needsHuman: 4, mine: 2, unassigned: 3, aiActive: 11, resolvedToday: 17 },
  "PATCH /v1/conversations/{id}": { id: "c_1", customerId: "usr_demo_ama", customerName: "Ama Mensah", language: "en", status: "human", handedOff: true, assigneeId: "usr_agent", firstResponseMs: 820, createdAt: T, updatedAt: T2 },
  "GET /v1/channels": { data: [channel] },
  "POST /v1/channels": { ...channel, status: "pending", lastSeenAt: null, relayKey: "hr_live_Ab12EXAMPLEEXAMPLEEXAMPLE" },
  "DELETE /v1/channels/{id}": null,
  "POST /v1/channels/{id}/rotate-key": { relayKey: "hr_live_Zz99EXAMPLEEXAMPLEEXAMPLE", keyPrefix: "hr_live_Zz99" },
  "POST /v1/channels/{id}/test": { ok: false, issues: [{ code: "never_called", message: "ChatFlow has not called Helply yet. Paste the relay key into the property's AI settings, then send a test message in the widget." }] },
  "POST /v1/relay/message": relayReply(),
  "POST /v1/relay/events": { ok: true },
  "POST /v1/relay/identify": { verified: true, expiresAt: T2 },
  "GET /v1/relay/config": { aiEnabled: true, fallbackMessage: "A team member will reply shortly.", languages: ["en", "tw", "gaa", "ee", "fat", "dag", "pcm"] },
  "GET /v1/identity/key": { mode: "shared_secret", alg: "HS256", kid: null, publicKeyPem: null, jwksUrl: null },
  "PUT /v1/identity/key": { mode: "public_key", alg: "RS256", kid: "2026-10", publicKeyPem: "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----", jwksUrl: null },
  "POST /v1/auth/forgot-password": { ok: true },
  "POST /v1/auth/reset-password": { ok: true },
  // Relay variants the dashboard never calls but ChatFlow's developer will want to see.
  __relayVariants: {
    agentOnline: relayReply({ reply: null, handledBy: "none", suppressed: "agent_online", ticketId: null }),
    needsSignIn: relayReply({ verified: false, requiresAuth: true, ticketId: null, reply: { text: "Please sign in so I can look at your account.", english: "Please sign in so I can look at your account.", language: "en" } }),
    handoff: relayReply({ needsHuman: true, reply: { text: "I will pass this to a team member.", english: "I will pass this to a team member.", language: "en" } }),
  },
};

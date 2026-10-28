"use strict";
/**
 * Demo data for the default workspace, recreated on every cold start (Render's disk is ephemeral): business details, FAQ and
 * two sample conversations with tickets so the dashboard is not empty. Idempotent (does nothing once the profile exists).
 * Fictional. Demo mode only.
 */
const line = (id, minsAgo, o) => ({ id, time: new Date(Date.now() - minsAgo * 60_000).toISOString(), level: "error", method: "POST", path: "/api/payments/momo", status: 504, durationMs: null, traceId: "trc-demo", error: null, response: null, ...o });

const seedDemoData = ({ repo, workspaceId: ws }) => {
  if (repo.getBusinessProfile(ws).updatedAt) return false;
  repo.putBusinessProfile(ws, {
    name: "KwikPay Shop", about: "KwikPay Shop is a fictional online store in Accra selling phones and accessories, with delivery across Ghana and mobile money checkout.",
    website: "https://kwikpay.example", hours: "Mon to Sat, 8am to 6pm", timezone: "Africa/Accra", contactEmail: "help@kwikpay.example", contactPhone: "+233200000000",
    languages: ["en", "tw", "pcm"], tone: "friendly", escalation: { email: "support@kwikpay.example", phone: null, whatsapp: "+233200000000" },
  });
  for (const [question, answer, tags] of [
    ["Do you offer cash on delivery?", "Yes, cash on delivery is available in Greater Accra only.", ["payments", "delivery"]],
    ["Which mobile money networks do you accept?", "We accept MTN MoMo, Vodafone Cash and AirtelTigo Money.", ["payments"]],
    ["Can I change my delivery address after ordering?", "Yes, within one hour of ordering, by contacting support with your order number.", ["delivery"]],
    ["What if my payment shows as failed but money left my wallet?", "Do not pay again. Wait 10 minutes and check your order status; if it still says awaiting payment, contact support and we will check.", ["payments"]],
    ["Do you sell second-hand phones?", "No, every phone is new and comes with a 12 month warranty.", ["products"]],
  ]) repo.createFaq(ws, { question, answer, tags });

  if (repo.listConversations(ws, { limit: 1 }).data.length) return true;
  const ama = repo.createConversation(ws, { customerId: "usr_demo_ama", customerName: "Ama Mensah", language: "pcm" });
  const evidence = [
    line("L1", 33, { error: { message: "MTN MoMo gateway timeout after 30000ms", code: "PROVIDER_TIMEOUT" }, durationMs: 30012 }),
    line("L2", 29, { path: "/webhooks/momo", status: 500, error: { message: "Order lookup failed: orderRef is undefined", code: "WEBHOOK_ORDER_NOT_FOUND" } }),
  ];
  const rootCause = { summary: "The MoMo gateway timed out, then the success webhook failed because the order reference was undefined, so the order stayed unpaid.", suggestedFix: "Make the webhook look up the order by payment reference and retry order updates.", citedLines: ["L1", "L2"], confidence: 0.9 };
  const t = repo.createTicket(ws, { conversationId: ama.id, title: rootCause.summary.slice(0, 120), userId: "usr_demo_ama", language: "pcm", customerMessage: "I paid with MoMo but they say my order is not paid.", replyEnglish: "Your payment reached MTN but our system did not mark the order as paid. We are fixing it.", rootCause, evidence, status: "open" });
  repo.addMessage(ws, ama.id, { role: "customer", text: "I don pay with MoMo but dem say my order never pay.", english: "I paid with MoMo but they say my order is not paid.", language: "pcm", intent: "account_issue" });
  repo.addMessage(ws, ama.id, {
    role: "ai", text: "We sorry for the wahala. Your payment reach MTN but our system no mark your order as paid. Our team dey fix am.", english: "We are sorry for the trouble. Your payment reached MTN but our system did not mark your order as paid. Our team is fixing it.", language: "pcm",
    meta: { evidence, rootCause, ticketId: t.id, needsHuman: false, trace: [{ step: "identity", ms: 0, verified: true }, { step: "understand", ms: 3900 }, { step: "logs", ms: 4300, fetched: 12, kept: 12, droppedForScope: 0 }, { step: "explain", ms: 9800, found: true }, { step: "done", ms: 12000 }], understanding: { language: "pcm", languageName: "Ghanaian Pidgin", english: "I paid with MoMo but they say my order is not paid.", intent: "account_issue" } },
  });
  repo.updateConversation(ws, ama.id, { status: "ai", firstResponseMs: 12000 });

  const kofi = repo.createConversation(ws, { customerId: null, language: "en" });
  repo.createTicket(ws, { conversationId: kofi.id, title: "Question not covered by the knowledge base", language: "en", customerMessage: "Do you deliver to Tamale on Sundays?", replyEnglish: "I will pass this to a team member, and they will reply as soon as they can.", status: "needs_human" });
  repo.addMessage(ws, kofi.id, { role: "customer", text: "Do you deliver to Tamale on Sundays?", english: "Do you deliver to Tamale on Sundays?", language: "en", intent: "general_question" });
  repo.addMessage(ws, kofi.id, { role: "ai", text: "I will pass this to a team member, and they will reply as soon as they can.", english: "I will pass this to a team member, and they will reply as soon as they can.", language: "en", meta: { needsHuman: true, trace: [{ step: "knowledge", ms: 800, answered: false }], understanding: { language: "en", languageName: "English", english: "Do you deliver to Tamale on Sundays?", intent: "general_question" } } });
  repo.updateConversation(ws, kofi.id, { status: "needs_human", handedOff: true, firstResponseMs: 1500 });
  repo.recordGap(ws, { question: "Do you deliver to Tamale on Sundays?", language: "en", conversationId: kofi.id });
  return true;
};

module.exports = { seedDemoData };

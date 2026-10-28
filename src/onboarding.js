"use strict";
/**
 * The onboarding checklist is COMPUTED from the workspace's real state on every call (nothing is stored per step), so it
 * can never disagree with reality. Only two facts are remembered because they cannot be derived: the last log source test
 * and the last "test as a customer" (table onboarding_state).
 */
const WEEK_MS = 7 * 86_400_000;

module.exports = (ctx) => {
  const { repo } = ctx;

  return (ws) => {
    const w = repo.getWorkspace(ws);
    const st = repo.getOnboardingState(ws);
    const src = ctx.logSourceFor(w);
    const logConfigured = Boolean(src?.baseUrl && src?.apiKey);
    const profile = repo.getBusinessProfile(ws);
    const faqs = repo.countFaqs(ws, { enabledOnly: true });
    const docs = repo.countKnowledgeDocs(ws);
    const channels = repo.listChannels(ws);
    const missing = [];
    if ((profile.about || "").trim().length < 20) missing.push("a short description of your business");
    if (!profile.hours) missing.push("opening hours");
    if (!profile.escalation.email && !profile.escalation.phone && !profile.escalation.whatsapp) missing.push("a contact for escalations");
    const testFresh = st?.testOk && st.testRanAt && Date.now() - Date.parse(st.testRanAt) < WEEK_MS;
    const identityUsed = repo.hasVerifiedCustomerActivity(ws);

    const step = (id, title, description, status, detail = null, actionPath = null, optional = false) => ({ id, title, description, status, detail, actionPath, optional });
    const steps = [
      step("workspace", "Create the workspace", "Name your company and become its owner", "done"),
      step("logs_shipped", "Ship logs with the user id", "Your app logs metadata.userId on each request",
        st?.logTestHasUserId ? "done" : "their_side",
        st?.logTestHasUserId ? null : logConfigured ? "Your logs do not carry metadata.userId yet. Add the logged-in user's id to each request log, then run the log source test again." : "Connect the log source first, then run its test.", "/app/connections"),
      step("log_source", "Connect the log source", "URL, read-only key and service name",
        logConfigured && st?.logTestOk ? "done" : "todo",
        !logConfigured ? "No log source yet." : st?.logTestOk ? null : st?.logTestAt ? "The last test found problems. Open Connections to see them." : "Saved but not tested yet. Run the test.", "/app/connections"),
      step("identity", "Connect customer identity", "Sign tokens in your backend",
        identityUsed ? "done" : "todo", identityUsed ? null : "Mint a test token or sign one in your backend, then use it in a chat or in the test below.", "/app/connections"),
      step("business_profile", "Add your business details", "Hours, contacts, tone and languages",
        missing.length ? "todo" : "done", missing.length ? `Still needed: ${missing.join(", ")}.` : null, "/app/business"),
      step("knowledge", "Add FAQ and policies", "At least 5 FAQ entries or one document",
        faqs >= 5 || docs >= 1 ? "done" : "todo", faqs >= 5 || docs >= 1 ? null : `${faqs} FAQ ${faqs === 1 ? "entry" : "entries"}, ${docs} ${docs === 1 ? "document" : "documents"}.`, "/app/business/faq"),
      step("channel", "Link your chat channel", "Connect a ChatFlow property (optional if you call the API yourself)",
        channels.some((c) => c.lastSeenAt) ? "done" : "todo",
        channels.length ? (channels.some((c) => c.lastSeenAt) ? null : "Connected, but ChatFlow has not called Helply yet.") : null, "/app/connections", true),
      step("test", "Test as a customer", "Send a test message through the full pipeline",
        testFresh ? "done" : "todo", testFresh ? null : st?.testRanAt ? "The last test did not produce a verified, error-free answer, or is older than 7 days." : null, "/app/onboarding"),
    ];
    const ready = steps.every((s) => s.optional || s.status === "done");
    const live = w.settings.aiLive;
    steps.push(step("live", "Switch the AI on", "Customers start getting AI replies", live ? "done" : ready ? "todo" : "blocked", live || ready ? null : "Finish the steps above first.", "/app/onboarding"));
    return { steps, completed: steps.filter((s) => s.status === "done").length, total: steps.length, readyForLive: ready, live };
  };
};

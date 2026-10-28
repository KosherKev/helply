// Frontend development without keys: the REAL app (real SQLite, auth, tenancy, redaction) with scripted fakes for
// Gemma, Khaya and central-logging-service. Never use for anything but local UI work. `npm run dev:mock`.
const { buildApp } = require("../src/server");
const { load } = require("../src/config");
const row = (uid, o) => ({ _id: Math.random().toString(16).slice(2), timestamp: new Date(Date.now() - 60000 * (o.age || 1)).toISOString(), level: "error", service: "demo-shop-api", traceId: "trace-abc123", metadata: { userId: uid }, method: "POST", path: "/api/payments/momo", statusCode: 504, error: { message: "gateway timeout", code: "PROVIDER_TIMEOUT" }, ...o });
const rows = [
  row("usr_demo_ama", { path: "/api/payments/momo", statusCode: 504, age: 3 }),
  row("usr_demo_ama", { path: "/api/webhooks/momo", statusCode: 500, error: { message: "order update failed token=abcd1234efgh5678ijkl", code: "ORDER_UPDATE_FAILED" }, age: 2 }),
  row("usr_demo_ama", { level: "warn", path: "/api/orders/ord_1", statusCode: 200, error: null, age: 1 }),
  row("usr_demo_kofi", { path: "/api/kofi-private", statusCode: 500 }),
];
const llm = {
  model: "gemma-4-31b-it (fake)", isConfigured: () => true,
  generate: async ({ system, user }) => {
    await new Promise((r) => setTimeout(r, 350));
    if (system.includes("analyse ONE")) {
      const t = /<customer_message>([\s\S]*?)<\/customer_message>/.exec(user)?.[1] || "";
      const l = t.toLowerCase();
      const pcm = l.includes("don pay") || l.includes("dem say");
      if (l.includes("person") || l.includes("human")) return { json: { language: "en", english: t, intent: "human_request", hints: {} } };
      if (l.includes("momo") || l.includes("kofi")) return { json: { language: pcm ? "pcm" : "en", english: pcm ? "I paid with MoMo but they say my order is not paid." : t, intent: "account_issue", hints: { keywords: ["momo"] } } };
      return { json: { language: "en", english: t, intent: "general_question", hints: {} } };
    }
    if (system.includes("explain a customer's problem")) return { json: { found: true, customer_reply: "Your MoMo payment reached MTN, but our system failed to mark your order as paid. Your money is safe and we are fixing it.", root_cause: "The MoMo gateway timed out and the webhook that marks the order paid then failed with ORDER_UPDATE_FAILED.", cited_lines: ["L1", "L2"], confidence: 0.86, suggested_fix: "Make the webhook idempotent and retry order updates when the provider callback fails.", needs_human: false } };
    if (system.includes("careful translator")) return { text: "translated" };
    return { text: /deliver/i.test(user) ? "Orders in Greater Accra arrive in 1 to 3 working days." : "[[NO_ANSWER]]" };
  },
};
const language = {
  names: { en: "English", tw: "Twi", gaa: "Ga", ee: "Ewe", fat: "Fante", dag: "Dagbani", pcm: "Ghanaian Pidgin" }, asrCode: (l) => l, ttsCode: (l) => l,
  toEnglish: async (t) => ({ text: String(t).replace(/^\(pcm\) /, ""), provider: "gemma" }),
  fromEnglish: async (t, l) => ({ text: `(${l}) ${t}`, provider: "gemma" }),
};
const fetchImpl = async (url, init) => {
  const u = new URL(url);
  if (!u.hostname.includes("logs.test") && !u.hostname.includes("cls.test")) return fetch(url, init);
  const uid = u.searchParams.get("userId");
  return { ok: true, status: 200, json: async () => ({ data: uid ? rows.filter((r) => r.metadata.userId === uid) : rows }) };
};
const config = load({ DEMO_MODE: "true", HELPLY_JWT_SECRET: "dev-secret-dev-secret-dev-secret-1234", CLS_BASE_URL: "http://cls.test", CLS_API_KEY: "k", CORS_ORIGIN: "*", ALLOW_PRIVATE_LOG_SOURCES: "true", ALLOW_INSECURE_WEBHOOKS: "true", PORT: "8787" });
const app = buildApp(config, { llm, language, fetchImpl });
app.locals.ready.then(() => app.listen(8787, () => console.log("dev api on 8787")));

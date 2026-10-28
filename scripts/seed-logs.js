"use strict";
/**
 * Seeds central-logging-service with a realistic, FICTIONAL story for the demo:
 *   Ama's MoMo payment times out, her retry is blocked as a duplicate, and the provider's success
 *   webhook then fails to update her order. Kofi's logs sit alongside (scoping must hide them).
 * Run:  CLS_BASE_URL=... CLS_WRITE_KEY=sk_live_... npm run seed
 */
require("../src/loadEnv").loadEnv();
const { load } = require("../src/config");

const cfg = load();
const WRITE_KEY = process.env.CLS_WRITE_KEY || "";
if (!cfg.cls.baseUrl || !WRITE_KEY) {
  console.error("Set CLS_BASE_URL and CLS_WRITE_KEY (a key with the logs:write scope).");
  process.exit(1);
}

const SERVICE = cfg.cls.service;
const AMA = "usr_demo_ama";
const KOFI = "usr_demo_kofi";
const FAKE_JWT = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3JfZGVtbyJ9.ZmFrZS1zZWVkLXNpZ25hdHVyZQ"; // fake, shows redaction
let seq = 0;

const minsAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
const entry = ({ ago, level = "info", method, path, status, ms = 40, user, body = {}, res = {}, error = null, meta = {} }) => {
  seq += 1;
  return {
    timestamp: minsAgo(ago),
    level,
    service: SERVICE,
    traceId: `trc-${String(seq).padStart(4, "0")}-demo`,
    method,
    path,
    statusCode: status,
    duration: ms,
    request: { headers: { authorization: FAKE_JWT, "content-type": "application/json" }, body, query: {}, ip: "197.255.10.20" },
    response: { body: res },
    ...(error ? { error } : {}), // the service's schema rejects error: null
    metadata: { userId: user, ...meta },
  };
};

const logs = [];
// ── Ama: the story ──────────────────────────────────────────────
logs.push(entry({ ago: 44, method: "GET", path: "/api/products", status: 200, user: AMA, res: { items: 24 } }));
logs.push(entry({ ago: 40, method: "POST", path: "/api/cart/items", status: 201, user: AMA, body: { sku: "SKU-118", qty: 1 }, res: { cartItems: 1 } }));
logs.push(entry({ ago: 36, method: "POST", path: "/api/orders", status: 201, ms: 120, user: AMA, res: { orderId: "ORD-5521", total: 250, currency: "GHS", status: "awaiting_payment" } }));
logs.push(entry({ ago: 33, level: "error", method: "POST", path: "/api/payments/momo", status: 504, ms: 30012, user: AMA, body: { orderId: "ORD-5521", amount: 250, momoNumber: "0240000001", provider: "mtn_momo" }, res: { error: "PROVIDER_TIMEOUT", provider: "mtn_momo", reference: "PAY-8841", message: "Payment provider did not respond" }, error: { message: "MTN MoMo gateway timeout after 30000ms", code: "PROVIDER_TIMEOUT" }, meta: { reference: "PAY-8841" } }));
logs.push(entry({ ago: 31, level: "error", method: "POST", path: "/api/payments/momo", status: 409, ms: 55, user: AMA, body: { orderId: "ORD-5521", amount: 250, momoNumber: "0240000001", provider: "mtn_momo" }, res: { error: "DUPLICATE_PENDING_TRANSACTION", reference: "PAY-8841" }, error: { message: "A transaction with reference PAY-8841 is still pending", code: "DUPLICATE_PENDING_TRANSACTION" }, meta: { reference: "PAY-8841" } }));
logs.push(entry({ ago: 29, level: "error", method: "POST", path: "/webhooks/momo", status: 500, ms: 18, user: AMA, body: { reference: "PAY-8841", status: "SUCCESSFUL", amount: 250 }, res: { received: false }, error: { message: "Order lookup failed: orderRef is undefined", code: "WEBHOOK_ORDER_NOT_FOUND" }, meta: { reference: "PAY-8841" } }));
logs.push(entry({ ago: 27, method: "GET", path: "/api/orders/ORD-5521", status: 200, user: AMA, res: { orderId: "ORD-5521", status: "awaiting_payment", paid: false } }));
logs.push(entry({ ago: 26, method: "GET", path: "/api/cart", status: 200, user: AMA, res: { cartItems: 1 } }));
// ── Kofi: a clean purchase and an unrelated failure (must never surface for Ama) ──
logs.push(entry({ ago: 38, method: "POST", path: "/api/orders", status: 201, ms: 98, user: KOFI, res: { orderId: "ORD-5522", total: 90, currency: "GHS", status: "awaiting_payment" } }));
logs.push(entry({ ago: 35, level: "error", method: "POST", path: "/api/payments/momo", status: 402, ms: 210, user: KOFI, body: { orderId: "ORD-5522", amount: 90 }, res: { error: "INSUFFICIENT_FUNDS" }, error: { message: "Insufficient funds", code: "INSUFFICIENT_FUNDS" } }));
logs.push(entry({ ago: 30, method: "POST", path: "/api/payments/momo", status: 200, ms: 640, user: KOFI, body: { orderId: "ORD-5522", amount: 90 }, res: { status: "SUCCESSFUL", reference: "PAY-8842" }, meta: { reference: "PAY-8842" } }));
logs.push(entry({ ago: 29, method: "POST", path: "/webhooks/momo", status: 200, ms: 22, user: KOFI, body: { orderRef: "ORD-5522", reference: "PAY-8842", status: "SUCCESSFUL" }, res: { received: true }, meta: { reference: "PAY-8842" } }));
// ── Background noise ───────────────────────────────────────────
for (let i = 0; i < 28; i += 1) {
  const user = i % 2 ? AMA : KOFI;
  logs.push(entry({ ago: 60 - i, method: "GET", path: i % 3 ? "/api/products" : "/api/categories", status: 200, ms: 20 + (i % 7) * 9, user, res: { ok: true } }));
}

const post = async (batch) => {
  const res = await fetch(`${cfg.cls.baseUrl}/api/v1/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": WRITE_KEY },
    body: JSON.stringify({ logs: batch }),
  });
  if (!res.ok) throw new Error(`CLS ${res.status}: ${(await res.text()).slice(0, 200)}`);
};

(async () => {
  for (let i = 0; i < logs.length; i += 20) await post(logs.slice(i, i + 20));
  console.log(`Seeded ${logs.length} fictional logs for service "${SERVICE}" (users: ${AMA}, ${KOFI}).`);
})().catch((err) => {
  console.error("Seeding failed:", err.message);
  process.exit(1);
});

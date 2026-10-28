"use strict";
/** Outbound webhooks: HMAC signed, retried with backoff, every attempt recorded in webhook_deliveries. */
const crypto = require("node:crypto");
const { postJson } = require("./ssrf");

const EVENTS = ["ticket.created", "ticket.needs_human", "reply.needs_review", "conversation.handoff", "webhook.test"];

const sign = (secret, timestamp, body) => `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

const createWebhookService = ({ repo, vault, send = postJson, retryDelaysMs = [1000, 5000, 25000], schedule = setTimeout, sendOptions = {} }) => {
  const attempt = async (ws, hook, secret, deliveryId, body, n) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    try {
      const r = await send(hook.url, body, { "X-Helply-Timestamp": timestamp, "X-Helply-Signature": sign(secret, timestamp, body), "X-Helply-Event": hook.event }, sendOptions);
      const ok = r.status >= 200 && r.status < 300;
      repo.updateDelivery(ws, deliveryId, { status: ok ? "delivered" : n > retryDelaysMs.length ? "failed" : "pending", attempts: n, responseStatus: r.status, error: ok ? null : `HTTP ${r.status}` });
      return { ok, status: r.status, error: ok ? null : `HTTP ${r.status}` };
    } catch (err) {
      const error = String(err.code || err.message || "error").slice(0, 120);
      repo.updateDelivery(ws, deliveryId, { status: n > retryDelaysMs.length ? "failed" : "pending", attempts: n, error });
      return { ok: false, status: null, error };
    }
  };

  /** Deliver one event to one hook. `retry:false` makes a single attempt and returns its outcome. */
  const deliver = async (ws, hook, event, data, { retry = true } = {}) => {
    const secret = vault.decrypt(repo.getWebhookSecretEnc(ws, hook.id));
    const deliveryId = repo.addDelivery(ws, { webhookId: hook.id, event });
    const body = JSON.stringify({ id: deliveryId, event, createdAt: new Date().toISOString(), data });
    const h = { ...hook, event };
    const first = await attempt(ws, h, secret, deliveryId, body, 1);
    if (!retry || first.ok) return { deliveryId, ...first };
    const run = (n) => {
      if (n > retryDelaysMs.length + 1) return;
      const t = schedule(async () => {
        const r = await attempt(ws, h, secret, deliveryId, body, n);
        if (!r.ok) run(n + 1);
      }, retryDelaysMs[n - 2]);
      t?.unref?.();
    };
    run(2);
    return { deliveryId, ...first };
  };

  const emit = (ws, event, data) => {
    for (const hook of repo.listWebhooksForEvent(ws, event)) deliver(ws, hook, event, data).catch(() => {});
  };

  return { deliver, emit, sign, EVENTS };
};

module.exports = { createWebhookService, sign, EVENTS };

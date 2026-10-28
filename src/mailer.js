"use strict";
/** Outbound email through the email microservice (POST {url}/send-email, header x-api-key). Never throws: returns { ok }. */
const createMailer = ({ url, apiKey, fetchImpl = fetch }) => ({
  configured: Boolean(url),
  send: async ({ to, subject, text }) => {
    if (!url) return { ok: false, error: "not_configured" };
    try {
      const res = await fetchImpl(`${url}/send-email`, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey || "" }, body: JSON.stringify({ to, subject, text, html: `<p>${String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>` }), signal: AbortSignal.timeout(10_000) });
      return res.ok ? { ok: true } : { ok: false, error: `http_${res.status}` };
    } catch (err) {
      return { ok: false, error: err.name };
    }
  },
});
module.exports = { createMailer };

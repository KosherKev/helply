"use strict";
/**
 * Redaction applied to every log value BEFORE it reaches the model, a ticket, or a customer.
 * central-logging-service does not redact at ingest, so this is the line of defence.
 */

const LONG_SENSITIVE = [
  "password", "passwd", "secret", "token", "authorization", "apikey", "cookie", "credential",
  "privatekey", "cardnumber", "cardno", "accountnumber", "accountno",
];
const SHORT_SENSITIVE = ["pin", "otp", "ssn", "cvv", "cvc"];
const SKIP_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const MAX_STR = 400;
const MAX_DEPTH = 6;
const MAX_ITEMS = 20;
const MAX_KEYS = 40;

const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const API_KEY = /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b|AIza[0-9A-Za-z_-]{20,}/g;
// "token=abc123", "password: hunter2", "?api_key=...": secrets embedded in free text (error messages, URLs).
const KV_SECRET = /\b(password|passwd|pwd|secret|client[_-]?secret|(?:access|refresh|auth|id|session|api)[_-]?token|token|api[_-]?key|apikey|authorization|pin|otp|cvv|cvc|ssn)(["']?\s*[:=]\s*["']?)(?!\[REDACTED\])[^\s"'&,;)]{3,}/gi;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const GH_PHONE = /(?:\+?233|\b0)[\s-]?[235-9]\d[\s-]?\d{3}[\s-]?\d{4}\b/g;
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;

const isSensitiveKey = (key) => {
  const n = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (LONG_SENSITIVE.some((s) => n.includes(s))) return true;
  return SHORT_SENSITIVE.some((s) => n === s || n.endsWith(s));
};

const luhn = (digits) => {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
};

const scrubString = (input) => {
  let s = String(input);
  s = s
    .replace(JWT, "[jwt]")
    .replace(BEARER, "Bearer [REDACTED]")
    .replace(KV_SECRET, "$1$2[REDACTED]")
    .replace(API_KEY, "[api-key]")
    .replace(EMAIL, "[email]")
    .replace(GH_PHONE, "[phone]")
    .replace(CARD, (m) => (luhn(m.replace(/\D/g, "")) ? "[card]" : m));
  return s.length > MAX_STR ? `${s.slice(0, MAX_STR)}…` : s;
};

const redact = (value, depth = 0) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, MAX_KEYS)) {
      if (SKIP_KEYS.has(k)) continue;
      out[k] = isSensitiveKey(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
};

module.exports = { redact, scrubString, isSensitiveKey };

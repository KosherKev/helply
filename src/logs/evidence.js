"use strict";
/**
 * Builds the evidence the model is allowed to see.
 *
 * Retrieval, not agency: the model never calls a tool and never chooses whose logs to read.
 * It only proposes hints (time window, keywords). This module validates those hints, applies the
 * scope from the verified identity and server config, re-checks scope on every returned row,
 * redacts, ranks and caps.
 */
const { queryLogs } = require("./clsClient");
const { redact } = require("./redact");

const TRACE_RE = /^[A-Za-z0-9._:-]{6,128}$/;

const clampInt = (v, lo, hi, d) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

const sanitizeHints = (raw) => {
  const h = raw && typeof raw === "object" ? raw : {};
  const keywords = Array.isArray(h.keywords)
    ? h.keywords
        .filter((k) => typeof k === "string")
        .map((k) => k.trim().toLowerCase().replace(/[^a-z0-9 _/.:-]/g, ""))
        .filter((k) => k.length >= 2 && k.length <= 40)
        .slice(0, 3)
    : [];
  const statusOk = Number.isInteger(h.statusCode) && h.statusCode >= 100 && h.statusCode <= 599;
  return {
    windowMinutes: clampInt(h.timeWindowMinutes, 1, 1440, 180),
    keywords,
    statusCode: statusOk ? h.statusCode : null,
    traceId: typeof h.traceId === "string" && TRACE_RE.test(h.traceId.trim()) ? h.traceId.trim() : null,
  };
};

const scoreLog = (log, hints) => {
  let s = 0;
  if (log.level === "error") s += 5;
  else if (log.level === "warn") s += 2;
  const status = Number(log.statusCode);
  if (status >= 500) s += 3;
  else if (status >= 400) s += 2;
  if (hints.statusCode && status === hints.statusCode) s += 3;
  if (log.error?.message) s += 1;
  const hay = JSON.stringify([log.path, log.error, log.response?.body]).toLowerCase();
  for (const k of hints.keywords) if (hay.includes(k)) s += 2;
  return s;
};

const snippet = (value, max = 300) => {
  if (value === undefined || value === null) return null;
  const r = redact(value);
  const str = typeof r === "string" ? r : JSON.stringify(r);
  return str.length > max ? `${str.slice(0, max)}…` : str;
};

const compact = (log, id) => ({
  id,
  time: new Date(log.timestamp).toISOString(),
  level: log.level,
  method: log.method || null,
  path: log.path ? redact(String(log.path)) : null,
  status: log.statusCode ?? null,
  durationMs: log.duration ?? null,
  traceId: log.traceId || null,
  error:
    log.error && (log.error.message || log.error.code)
      ? { message: redact(String(log.error.message || "")), code: log.error.code || null }
      : null,
  response: snippet(log.response?.body),
});

const dedupeKey = (l) => String(l._id || `${l.traceId}|${l.timestamp}|${l.path}|${l.statusCode}`);

/**
 * @returns {Promise<{lines:Array, meta:{windowMinutes:number, fetched:number, kept:number, droppedForScope:number}, hints:object}>}
 */
const buildEvidence = async ({
  cls,
  userId,
  hints,
  now = Date.now(),
  fetchImpl = fetch,
  maxLines = 25,
  queryLimit = 50,
}) => {
  if (!userId) throw new Error("A verified userId is required");
  const h = sanitizeHints(hints);
  const from = now - h.windowMinutes * 60_000;

  const batches = [await queryLogs(cls, { userId, from, to: now, limit: queryLimit }, { fetchImpl })];
  if (h.traceId) batches.push(await queryLogs(cls, { userId, traceId: h.traceId, limit: queryLimit }, { fetchImpl }));

  const seen = new Set();
  const fetched = [];
  for (const row of batches.flat()) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    fetched.push(row);
  }

  // Defence in depth: never trust the source to have scoped correctly.
  const scoped = fetched.filter((l) => l?.metadata?.userId === userId && l?.service === cls.service);

  const ranked = scoped
    .map((l) => ({ l, s: scoreLog(l, h) }))
    .sort((a, b) => b.s - a.s || new Date(b.l.timestamp) - new Date(a.l.timestamp))
    .slice(0, maxLines)
    .map((x) => x.l)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // chronological for the model

  const lines = ranked.map((l, i) => compact(l, `L${i + 1}`));
  return {
    lines,
    hints: h,
    meta: { windowMinutes: h.windowMinutes, fetched: fetched.length, kept: lines.length, droppedForScope: fetched.length - scoped.length },
  };
};

module.exports = { buildEvidence, sanitizeHints, scoreLog };

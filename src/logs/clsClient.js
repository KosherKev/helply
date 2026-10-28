"use strict";
/** Read-only client for central-logging-service: GET /api/v1/logs */

class ClsError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "ClsError";
    this.status = status;
  }
}

/**
 * @param {{baseUrl:string, apiKey:string, service:string}} cls
 * @param {{userId:string, from?:number, to?:number, level?:string, traceId?:string, limit?:number}} q
 */
const queryLogs = async (cls, q, { fetchImpl = fetch, timeoutMs = 8000 } = {}) => {
  if (!cls?.baseUrl || !cls?.apiKey) throw new ClsError("Log source is not configured");
  if (typeof q.userId !== "string" || !q.userId) throw new ClsError("A verified user id is required"); // fail closed: never query unscoped
  const url = new URL(`${cls.baseUrl}/api/v1/logs`);
  const p = url.searchParams;
  p.set("service", cls.service); // scope fixed by server config, never by the request
  p.set("userId", q.userId); // scope fixed by the VERIFIED identity
  if (q.from) p.set("from", new Date(q.from).toISOString());
  if (q.to) p.set("to", new Date(q.to).toISOString());
  if (q.level) p.set("level", q.level);
  if (q.traceId) p.set("traceId", q.traceId);
  p.set("limit", String(Math.min(Number(q.limit) || 50, 100)));
  p.set("sortBy", "timestamp");
  p.set("sortOrder", "desc");

  let res;
  try {
    res = await fetchImpl(url, {
      headers: { "X-API-Key": cls.apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new ClsError(`Log source unreachable: ${err.name}`);
  }
  if (!res.ok) throw new ClsError(`Log source returned ${res.status}`, res.status);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
};

/**
 * Connection test for the dashboard ONLY (never called from the support path): fetches a few recent rows,
 * optionally scoped, so an admin can see whether the source carries and filters on metadata.userId.
 */
const probeLogs = async (cls, { userId, limit = 20 } = {}, { fetchImpl = fetch, timeoutMs = 8000 } = {}) => {
  if (!cls?.baseUrl || !cls?.apiKey) throw new ClsError("Log source is not configured");
  const url = new URL(`${cls.baseUrl}/api/v1/logs`);
  url.searchParams.set("service", cls.service);
  url.searchParams.set("limit", String(limit));
  if (userId) url.searchParams.set("userId", userId);
  let res;
  try {
    res = await fetchImpl(url, { headers: { "X-API-Key": cls.apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new ClsError(`Log source unreachable: ${err.name}`);
  }
  if (!res.ok) throw new ClsError(`Log source returned ${res.status}`, res.status);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
};

module.exports = { queryLogs, probeLogs, ClsError };

"use strict";
/** In-process pub/sub keyed by workspace id: dashboards subscribe over SSE; only their own workspace's events arrive. */
const createBus = () => {
  const subs = new Map(); // workspaceId -> Set<fn>
  return {
    emit: (ws, type, data = {}) => {
      for (const fn of subs.get(ws) || []) {
        try { fn({ type, data, at: new Date().toISOString() }); } catch { /* subscriber gone */ }
      }
    },
    subscribe: (ws, fn) => {
      if (!subs.has(ws)) subs.set(ws, new Set());
      subs.get(ws).add(fn);
      return () => subs.get(ws)?.delete(fn);
    },
  };
};
module.exports = { createBus };

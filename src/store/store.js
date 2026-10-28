"use strict";
/** In-memory store for tickets and company knowledge. Swap for a database later. */
const crypto = require("node:crypto");
const { scrubString } = require("../logs/redact");

const tokenize = (s) => (String(s).toLowerCase().match(/[a-z0-9ɛɔ]+/g) || []).filter((w) => w.length > 2);

const chunkText = (text, max = 800) => {
  const paras = String(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > max) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.flatMap((c) => (c.length > max * 1.5 ? c.match(new RegExp(`.{1,${max}}`, "gs")) : [c]));
};

const createStore = () => {
  const knowledge = [];
  const tickets = [];
  let seq = 0;

  const addKnowledge = ({ title, text }) => {
    const doc = {
      id: `K-${crypto.randomBytes(4).toString("hex")}`,
      title: String(title || "Untitled").slice(0, 120),
      chunks: chunkText(String(text || "").slice(0, 100_000)),
      createdAt: new Date().toISOString(),
    };
    knowledge.push(doc);
    return { id: doc.id, title: doc.title, chunks: doc.chunks.length, createdAt: doc.createdAt };
  };

  const retrieve = (query, k = 3) => {
    const q = new Set(tokenize(query));
    if (!q.size) return [];
    const scored = [];
    for (const doc of knowledge) {
      for (const text of doc.chunks) {
        const words = new Set(tokenize(text));
        let hits = 0;
        for (const w of q) if (words.has(w)) hits += 1;
        if (hits) scored.push({ title: doc.title, text, score: hits / Math.sqrt(words.size + 1) });
      }
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  };

  const createTicket = (t) => {
    seq += 1;
    const ticket = {
      id: `T-${String(seq).padStart(4, "0")}`,
      createdAt: new Date().toISOString(),
      status: t.status || "open",
      title: String(t.title || "Customer issue").slice(0, 140),
      userId: t.userId || null,
      language: t.language || "en",
      customerMessage: scrubString(t.customerMessage || ""),
      replyEnglish: t.replyEnglish || "",
      rootCause: t.rootCause || null,
      evidence: t.evidence || [],
    };
    tickets.unshift(ticket);
    return ticket;
  };

  return {
    addKnowledge,
    retrieve,
    listKnowledge: () => knowledge.map((d) => ({ id: d.id, title: d.title, chunks: d.chunks.length, createdAt: d.createdAt })),
    deleteKnowledge: (id) => {
      const i = knowledge.findIndex((d) => d.id === id);
      if (i === -1) return false;
      knowledge.splice(i, 1);
      return true;
    },
    createTicket,
    listTickets: ({ status } = {}) => tickets.filter((t) => !status || t.status === status),
    getTicket: (id) => tickets.find((t) => t.id === id) || null,
    updateTicket: (id, patch) => {
      const t = tickets.find((x) => x.id === id);
      if (!t) return null;
      if (["open", "needs_human", "resolved"].includes(patch.status)) t.status = patch.status;
      return t;
    },
  };
};

module.exports = { createStore, chunkText };

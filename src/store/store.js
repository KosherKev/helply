"use strict";
/**
 * Store facade. `repo` is the SQLite repository (every method takes a workspace id).
 * `forWorkspace(id)` binds one workspace so the agent can call plain methods without ever naming a tenant.
 * `createStore()` with no arguments gives an in-memory database with one default workspace (tests, demo).
 */
const { openDb } = require("../db/db");
const { createRepo, chunkText } = require("./repo");

const DEFAULT_WORKSPACE_ID = "ws_default";

const scope = (repo, ws) => {
  if (!ws) throw new Error("workspace id is required");
  return {
    workspaceId: ws,
    addKnowledge: (d) => repo.addKnowledge(ws, d),
    retrieve: (query, k) => repo.retrieve(ws, query, k),
    listKnowledge: () => repo.listKnowledge(ws),
    deleteKnowledge: (id) => repo.deleteKnowledge(ws, id),
    createTicket: (t) => repo.createTicket(ws, t),
    listTickets: ({ status } = {}) => repo.listTickets(ws, { status, limit: 100 }).data,
    getTicket: (id) => repo.getTicket(ws, id),
    updateTicket: (id, patch) => repo.updateTicket(ws, id, patch),
  };
};

const createStore = ({ db = openDb(":memory:"), ensureDefault = true } = {}) => {
  const repo = createRepo(db);
  if (ensureDefault && !repo.getWorkspace(DEFAULT_WORKSPACE_ID)) repo.createWorkspace({ id: DEFAULT_WORKSPACE_ID, name: "Default workspace", slug: "default" });
  return { repo, db, DEFAULT_WORKSPACE_ID, forWorkspace: (ws) => scope(repo, ws), ...(ensureDefault ? scope(repo, DEFAULT_WORKSPACE_ID) : {}) };
};

module.exports = { createStore, chunkText, DEFAULT_WORKSPACE_ID };

-- Helply v1.1 schema. Every tenant table carries workspace_id; repositories require it.

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL UNIQUE,            -- publishable key for anonymous (knowledge-only) widget calls
  identity_secret_enc TEXT,                   -- AES-256-GCM; signs customer tokens
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,                -- scrypt$N$salt$hash
  name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE memberships (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','agent')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','agent')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,            -- SHA-256 of the opaque bearer token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,                       -- comma separated
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE log_sources (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL,
  api_key_enc TEXT NOT NULL,                  -- AES-256-GCM
  service TEXT NOT NULL,
  user_id_field TEXT NOT NULL DEFAULT 'metadata.userId',
  updated_at TEXT NOT NULL
);

CREATE TABLE conversations (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  customer_id TEXT,                           -- verified customer id, or NULL when anonymous
  customer_name TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'ai' CHECK (status IN ('ai','needs_human','human','resolved')),
  handed_off INTEGER NOT NULL DEFAULT 0,
  assignee_id TEXT,
  first_response_ms INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX conversations_ws ON conversations(workspace_id, seq);

CREATE TABLE messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer','ai','agent')),
  text TEXT NOT NULL,                         -- in the customer's language
  text_english TEXT,
  language TEXT,
  intent TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','pending_review','rejected')),
  review_recommended INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT,                             -- understanding, roundTrip, evidence, rootCause, trace
  author_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX messages_conv ON messages(workspace_id, conversation_id, seq);

CREATE TABLE tickets (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,                           -- "T-0001", unique per workspace
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','needs_human','resolved')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assignee_id TEXT,
  title TEXT NOT NULL,
  user_id TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  customer_message TEXT NOT NULL DEFAULT '',
  reply_english TEXT NOT NULL DEFAULT '',
  root_cause_json TEXT,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  fingerprint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, id)
);
CREATE INDEX tickets_ws ON tickets(workspace_id, seq);

CREATE TABLE ticket_notes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ticket_id TEXT NOT NULL,
  author_id TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE knowledge_docs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE knowledge_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  doc_id TEXT NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
  text TEXT NOT NULL
);
CREATE INDEX knowledge_chunks_ws ON knowledge_chunks(workspace_id);

CREATE TABLE audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL,                   -- user | api_key | system | customer
  actor_id TEXT,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX audit_ws ON audit_events(workspace_id, seq);
-- Audit events are immutable.
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END;

CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT NOT NULL,                       -- comma separated
  secret_enc TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE webhook_deliveries (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','delivered','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  response_status INTEGER,
  error TEXT,
  created_at TEXT NOT NULL
);

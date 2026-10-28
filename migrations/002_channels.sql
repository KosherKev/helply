-- Chat channels (ChatFlow) and the mapping from a channel's own conversation ids to Helply conversations.

CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('chatflow')),
  label TEXT NOT NULL,
  external_id TEXT NOT NULL,                  -- e.g. the ChatFlow widget id
  key_hash TEXT NOT NULL UNIQUE,              -- SHA-256 of the relay key (hr_live_...), never the key itself
  key_prefix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','connected','error')),
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (kind, external_id)                  -- one workspace per ChatFlow property
);
CREATE INDEX channels_ws ON channels(workspace_id);

CREATE TABLE channel_conversations (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  external_conversation_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  external_visitor_id TEXT,
  customer_id TEXT,                           -- informational identity link; no log lookup ever uses it
  created_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, external_conversation_id)
);
CREATE INDEX channel_conversations_conv ON channel_conversations(workspace_id, conversation_id);

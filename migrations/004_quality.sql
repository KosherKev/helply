CREATE TABLE issue_state (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','fixed','wont_fix')),
  assignee_id TEXT,
  fixed_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, fingerprint)
);

CREATE TABLE playbooks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  error_code TEXT NOT NULL,
  path_pattern TEXT,
  title TEXT NOT NULL,
  customer_wording TEXT NOT NULL,
  internal_note TEXT,
  owner_team TEXT,
  severity TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('low','normal','high')),
  always_handoff INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX playbooks_ws ON playbooks(workspace_id, error_code);

CREATE TABLE handoff_rules (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  rules_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE knowledge_gaps (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  cluster_key TEXT NOT NULL,
  question TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  conversations_json TEXT NOT NULL DEFAULT '[]',
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE INDEX knowledge_gaps_ws ON knowledge_gaps(workspace_id, status, last_seen);

CREATE TABLE message_feedback (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('good','bad')),
  reason TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

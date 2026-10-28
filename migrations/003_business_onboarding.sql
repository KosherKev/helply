-- Business details, FAQ, onboarding state, and a flag that keeps test conversations out of lists and analytics.

CREATE TABLE business_profiles (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  about TEXT NOT NULL DEFAULT '',
  website TEXT,
  hours TEXT,
  timezone TEXT NOT NULL DEFAULT 'Africa/Accra',
  contact_email TEXT,
  contact_phone TEXT,
  languages_json TEXT NOT NULL DEFAULT '["en"]',
  tone TEXT NOT NULL DEFAULT 'friendly' CHECK (tone IN ('friendly','formal','concise')),
  escalation_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE faqs (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  tags_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','gap')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX faqs_ws ON faqs(workspace_id, seq);

-- What the onboarding checklist needs to remember that cannot be recomputed from other tables.
CREATE TABLE onboarding_state (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  log_test_at TEXT,
  log_test_ok INTEGER,                        -- the last log source test passed completely
  log_test_has_user_id INTEGER,               -- ...and found metadata.userId on real rows
  test_ran_at TEXT,
  test_ok INTEGER,                            -- the last "test as a customer" produced a verified, error-free answer
  updated_at TEXT NOT NULL
);

ALTER TABLE conversations ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tickets ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;

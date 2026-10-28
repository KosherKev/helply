ALTER TABLE workspaces ADD COLUMN identity_mode TEXT NOT NULL DEFAULT 'shared_secret' CHECK (identity_mode IN ('shared_secret','public_key'));
ALTER TABLE workspaces ADD COLUMN identity_alg TEXT NOT NULL DEFAULT 'HS256';
ALTER TABLE workspaces ADD COLUMN identity_kid TEXT;
ALTER TABLE workspaces ADD COLUMN identity_public_pem TEXT;

CREATE TABLE password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE knowledge_sites (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','crawling','ready','failed')),
  pages INTEGER NOT NULL DEFAULT 0,
  last_indexed_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX knowledge_sites_ws ON knowledge_sites(workspace_id);
ALTER TABLE knowledge_docs ADD COLUMN site_id TEXT;

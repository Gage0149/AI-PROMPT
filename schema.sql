CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '未分类',
  tags TEXT NOT NULL DEFAULT '[]',
  content TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  source_revision TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

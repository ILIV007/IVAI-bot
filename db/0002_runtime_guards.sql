PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS processed_updates (
  telegram_update_id TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS runtime_counters (
  scope TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, subject_id, bucket)
);

CREATE INDEX IF NOT EXISTS idx_processed_updates_expires_at ON processed_updates(expires_at);
CREATE INDEX IF NOT EXISTS idx_runtime_counters_expires_at ON runtime_counters(expires_at);

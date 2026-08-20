CREATE TABLE IF NOT EXISTS user_reengagement (
  telegram_user_id TEXT PRIMARY KEY REFERENCES users(telegram_user_id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  delivery_state TEXT NOT NULL DEFAULT 'idle' CHECK (delivery_state IN ('idle', 'sending', 'sent', 'failed', 'blocked')),
  last_sent_at TEXT,
  last_attempt_at TEXT,
  lease_until TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reengagement_claim
  ON user_reengagement(enabled, delivery_state, last_sent_at, last_attempt_at, lease_until);

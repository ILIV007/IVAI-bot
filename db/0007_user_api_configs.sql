-- BYOK ("My API", v3.8.0): one custom-provider config per user. The API key
-- is stored AES-256-GCM encrypted (iv_hex:ciphertext_hex, tag appended to the
-- ciphertext); plaintext keys never reach this table.
-- NOTE: apply this file directly with the D1 query API. There is no
-- d1_migrations table on the live database (verified 2026-11-14), so no
-- runner row exists to record; migration 0006 must never be executed
-- (owner decision 2026-11-03) and is recorded as skipped in the deployment
-- checklist instead.
CREATE TABLE IF NOT EXISTS user_api_configs (
  telegram_user_id TEXT PRIMARY KEY REFERENCES users(telegram_user_id) ON DELETE CASCADE,
  preset TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  active_model TEXT NOT NULL,
  vision_model TEXT,
  transcription_model TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'invalid')),
  auth_failures INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

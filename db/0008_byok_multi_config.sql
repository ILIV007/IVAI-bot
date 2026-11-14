-- BYOK ("My API", v3.9.0): several custom-provider configs per user, one
-- active at a time. SQLite cannot ALTER a primary key, so the table is
-- rebuilt: existing single configs are copied as config_id 'default'
-- (named "My API 1") with their encrypted keys untouched — no user is asked
-- for their key again. The active config lives in
-- user_preferences.active_api_config_id (NULL = IVAI models); users whose
-- single config was enabled keep it active.
-- NOTE: apply this file DIRECTLY with the D1 query API as one batch
-- ({"sql": [...]} — the statements must run in order). There is no
-- d1_migrations table on the live database (verified 2026-11-14), so no
-- runner row exists to record; migration 0006 must never be executed
-- (owner decision 2026-11-03) and is recorded as skipped in the deployment
-- checklist instead. Apply exactly once: the ADD COLUMN and the table swap
-- are not safe to re-run.
CREATE TABLE IF NOT EXISTS user_api_configs_new (
  telegram_user_id TEXT NOT NULL REFERENCES users(telegram_user_id) ON DELETE CASCADE,
  config_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'My API 1',
  preset TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  active_model TEXT NOT NULL,
  vision_model TEXT,
  transcription_model TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'invalid')),
  auth_failures INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_user_id, config_id)
);
INSERT OR IGNORE INTO user_api_configs_new
  (telegram_user_id, config_id, name, preset, base_url, api_key_encrypted, active_model, vision_model, transcription_model, enabled, status, auth_failures, updated_at)
  SELECT telegram_user_id, 'default', 'My API 1', preset, base_url, api_key_encrypted, active_model, vision_model, transcription_model, enabled, status, auth_failures, updated_at
  FROM user_api_configs;
DROP TABLE user_api_configs;
ALTER TABLE user_api_configs_new RENAME TO user_api_configs;
ALTER TABLE user_preferences ADD COLUMN active_api_config_id TEXT;
INSERT INTO user_preferences (telegram_user_id, active_api_config_id)
  SELECT telegram_user_id, 'default' FROM user_api_configs WHERE enabled = 1
  ON CONFLICT(telegram_user_id) DO UPDATE SET active_api_config_id = excluded.active_api_config_id;

ALTER TABLE tasks ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE tasks ADD COLUMN reminder_status TEXT NOT NULL DEFAULT 'pending' CHECK (reminder_status IN ('pending', 'sending', 'sent', 'retry', 'failed'));
ALTER TABLE tasks ADD COLUMN reminder_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN reminder_lease_until TEXT;
ALTER TABLE tasks ADD COLUMN reminded_at TEXT;
ALTER TABLE tasks ADD COLUMN reminder_message_id TEXT;
ALTER TABLE tasks ADD COLUMN reminder_last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_due_reminders
  ON tasks(status, reminder_status, due_at, reminder_lease_until);

CREATE INDEX IF NOT EXISTS idx_tasks_user_status
  ON tasks(telegram_user_id, status, due_at);

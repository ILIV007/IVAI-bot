import { APP, MODES } from "./config.js";

export function conversationKey({ chatId, userId, threadId, replyTo }) {
  return [chatId, userId, threadId || "main", replyTo || "root"].join(":");
}

export async function upsertUser({ user, chat, language = "en" }, env) {
  if (!env.IVAI_DB || !user?.id) return;
  await env.IVAI_DB
    .prepare(`INSERT INTO users (telegram_user_id, username, first_name, language, last_seen_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(telegram_user_id) DO UPDATE SET
        username=excluded.username,
        first_name=excluded.first_name,
        language=COALESCE(users.language, excluded.language),
        last_seen_at=CURRENT_TIMESTAMP`)
    .bind(String(user.id), user.username || null, user.first_name || null, language)
    .run();

  if (chat?.id) {
    await env.IVAI_DB
      .prepare(`INSERT INTO chats (telegram_chat_id, type, title, last_seen_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(telegram_chat_id) DO UPDATE SET title=excluded.title, last_seen_at=CURRENT_TIMESTAMP`)
      .bind(String(chat.id), chat.type || "private", chat.title || null)
      .run();
  }
}

export async function getUserSettings(userId, env) {
  if (!env.IVAI_DB || !userId) return { mode: MODES.AUTO, selectedModel: null, memoryEnabled: false, language: null };
  const row = await env.IVAI_DB
    .prepare(`SELECT u.language, p.mode, p.selected_model AS selectedModel, p.memory_enabled AS memoryEnabled
      FROM users u LEFT JOIN user_preferences p ON u.telegram_user_id = p.telegram_user_id
      WHERE u.telegram_user_id = ? LIMIT 1`)
    .bind(String(userId))
    .first();
  return {
    language: row?.language || null,
    mode: row?.mode || MODES.AUTO,
    selectedModel: row?.selectedModel || null,
    memoryEnabled: Boolean(row?.memoryEnabled)
  };
}

export async function setMemoryEnabled(userId, enabled, env) {
  if (!env.IVAI_DB || !userId) return;
  await env.IVAI_DB
    .prepare(`INSERT INTO user_preferences (telegram_user_id, mode, memory_enabled, updated_at)
      VALUES (?, 'auto', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(telegram_user_id) DO UPDATE SET memory_enabled=excluded.memory_enabled, updated_at=CURRENT_TIMESTAMP`)
    .bind(String(userId), enabled ? 1 : 0)
    .run();
}

export async function setSelectedModel(userId, modelId, env) {
  if (!env.IVAI_DB || !userId) return;
  await env.IVAI_DB
    .prepare(`INSERT INTO user_preferences (telegram_user_id, mode, selected_model, memory_enabled, updated_at)
      VALUES (?, 'auto', ?, 0, CURRENT_TIMESTAMP)
      ON CONFLICT(telegram_user_id) DO UPDATE SET selected_model=excluded.selected_model, updated_at=CURRENT_TIMESTAMP`)
    .bind(String(userId), modelId || null)
    .run();
}

export async function setUserLanguage(userId, language, env) {
  if (!env.IVAI_DB || !userId) return;
  await env.IVAI_DB.prepare("UPDATE users SET language=?, last_seen_at=CURRENT_TIMESTAMP WHERE telegram_user_id=?").bind(language, String(userId)).run();
}

export async function setUserMode(userId, mode, env) {
  if (!env.IVAI_DB || !userId) return;
  await env.IVAI_DB
    .prepare(`INSERT INTO user_preferences (telegram_user_id, mode, memory_enabled, updated_at)
      VALUES (?, ?, 0, CURRENT_TIMESTAMP)
      ON CONFLICT(telegram_user_id) DO UPDATE SET mode=excluded.mode, updated_at=CURRENT_TIMESTAMP`)
    .bind(String(userId), mode)
    .run();
}

export async function getGuestMemory(key, env) {
  if (!env.IVAI_KV) return [];
  try {
    return JSON.parse((await env.IVAI_KV.get(`guest:${key}`)) || "[]");
  } catch {
    return [];
  }
}

export async function clearGuestMemory(key, env) {
  if (!env.IVAI_KV) return;
  await env.IVAI_KV.delete(`guest:${key}`);
}

export async function saveGuestMemory(key, messages, env) {
  if (!env.IVAI_KV) return;
  await env.IVAI_KV.put(`guest:${key}`, JSON.stringify(messages.slice(-APP.maxContextMessages)), {
    expirationTtl: APP.guestMemoryTtlSeconds
  });
}

export async function getUserDebugStats(userId, env) {
  if (!env.IVAI_DB || !userId) return { feedbackCount: 0, lastSeenAt: null };
  const [user, feedback] = await Promise.all([
    env.IVAI_DB.prepare("SELECT last_seen_at FROM users WHERE telegram_user_id=? LIMIT 1").bind(String(userId)).first(),
    env.IVAI_DB.prepare("SELECT COUNT(*) AS count FROM feedback WHERE telegram_user_id=?").bind(String(userId)).first()
  ]);
  return { feedbackCount: Number(feedback?.count || 0), lastSeenAt: user?.last_seen_at || null };
}

export async function getAdminOperationalStats(env) {
  const fallback = {
    totalUsers: null,
    activeUsers7d: null,
    activeUsers30d: null,
    activeChats30d: null,
    feedback7d: null,
    pendingBroadcasts: null,
    workersAiBudgetRemaining: null
  };
  if (!env.IVAI_DB) return fallback;
  const date = new Date().toISOString().slice(0, 10);
  const [totalUsers, activeUsers7d, activeUsers30d, activeChats30d, feedback7d, pendingBroadcasts, workersAiCounter] = await Promise.all([
    env.IVAI_DB.prepare("SELECT COUNT(*) AS count FROM users").first(),
    env.IVAI_DB.prepare("SELECT COUNT(*) AS count FROM users WHERE last_seen_at >= datetime('now', '-7 days')").first(),
    env.IVAI_DB.prepare("SELECT COUNT(*) AS count FROM users WHERE last_seen_at >= datetime('now', '-30 days')").first(),
    env.IVAI_DB.prepare("SELECT COUNT(*) AS count FROM chats WHERE last_seen_at >= datetime('now', '-30 days')").first(),
    env.IVAI_DB.prepare("SELECT COUNT(*) AS count FROM feedback WHERE created_at >= datetime('now', '-7 days')").first(),
    env.IVAI_DB.prepare("SELECT COUNT(*) AS count FROM broadcast_campaigns WHERE status IN ('draft','confirmed','queued','sending')").first(),
    env.IVAI_DB.prepare("SELECT value FROM runtime_counters WHERE scope='quota:workers-ai' AND subject_id='system' AND bucket=? LIMIT 1").bind(date).first()
  ]);
  const workersAiUsed = Number(workersAiCounter?.value || 0);
  return {
    totalUsers: Number(totalUsers?.count || 0),
    activeUsers7d: Number(activeUsers7d?.count || 0),
    activeUsers30d: Number(activeUsers30d?.count || 0),
    activeChats30d: Number(activeChats30d?.count || 0),
    feedback7d: Number(feedback7d?.count || 0),
    pendingBroadcasts: Number(pendingBroadcasts?.count || 0),
    workersAiBudgetRemaining: Math.max(0, APP.systemDailyWorkersAiBudget - workersAiUsed)
  };
}

export async function recordFeedback({ userId, chatId, messageId, model, score, kind, detail }, env) {
  if (!env.IVAI_DB || !userId) return;
  await env.IVAI_DB
    .prepare(`INSERT INTO feedback (telegram_user_id, telegram_chat_id, telegram_message_id, model, score, kind, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
    .bind(String(userId), String(chatId || ""), String(messageId || ""), model || null, score, kind, detail || null)
    .run();
}

export async function createBroadcastDraft({ authorId, content, audienceRule = "active" }, env) {
  const id = crypto.randomUUID();
  await env.IVAI_DB
    .prepare(`INSERT INTO broadcast_campaigns (id, status, content, audience_rule, created_by, created_at, updated_at)
      VALUES (?, 'draft', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
    .bind(id, content, audienceRule, String(authorId))
    .run();
  return id;
}

export async function getBroadcastCampaign(id, env) {
  return env.IVAI_DB?.prepare("SELECT * FROM broadcast_campaigns WHERE id = ? LIMIT 1").bind(id).first() || null;
}

export async function markBroadcastConfirmed(id, authorId, env) {
  await env.IVAI_DB
    .prepare(`UPDATE broadcast_campaigns SET status='confirmed', confirmed_by=?, confirmed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='draft'`)
    .bind(String(authorId), id)
    .run();
}

export async function writeAdminAudit({ actorId, action, targetType, targetId, metadata }, env) {
  if (!env.IVAI_DB) return;
  await env.IVAI_DB
    .prepare(`INSERT INTO admin_audit_logs (actor_telegram_user_id, action, target_type, target_id, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
    .bind(String(actorId), action, targetType || null, targetId || null, JSON.stringify(metadata || {}))
    .run();
}

function taskId() {
  return crypto.randomUUID();
}

export async function createSecretaryTask({ userId, chatId, title, dueAt = null }, env) {
  if (!env.IVAI_DB || !userId || !chatId || !title) throw new Error("Task storage is unavailable");
  const id = taskId();
  await env.IVAI_DB.prepare(`INSERT INTO tasks (
    id, telegram_user_id, telegram_chat_id, title, due_at, status, reminder_status, updated_at
  ) VALUES (?, ?, ?, ?, ?, 'open', ?)`).bind(
    id, String(userId), String(chatId), String(title).slice(0, 500), dueAt, dueAt ? "pending" : "sent"
  ).run();
  return { id, title: String(title).slice(0, 500), dueAt };
}

export async function listSecretaryTasks(userId, env, { includeClosed = false, limit = 12 } = {}) {
  if (!env.IVAI_DB || !userId) return [];
  const query = includeClosed
    ? "SELECT id, title, due_at AS dueAt, status, reminder_status AS reminderStatus FROM tasks WHERE telegram_user_id=? ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, due_at IS NULL, due_at ASC, created_at DESC LIMIT ?"
    : "SELECT id, title, due_at AS dueAt, status, reminder_status AS reminderStatus FROM tasks WHERE telegram_user_id=? AND status='open' ORDER BY due_at IS NULL, due_at ASC, created_at DESC LIMIT ?";
  const result = await env.IVAI_DB.prepare(query).bind(String(userId), limit).all();
  return result?.results || [];
}

export async function updateSecretaryTaskStatus({ id, userId, status }, env) {
  if (!env.IVAI_DB || !id || !userId || !["done", "cancelled"].includes(status)) return false;
  const result = await env.IVAI_DB.prepare("UPDATE tasks SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND telegram_user_id=? AND status='open'").bind(status, id, String(userId)).run();
  return Boolean(result?.meta?.changes);
}

export async function claimDueSecretaryTasks(env, { limit = 4, now = new Date().toISOString(), leaseSeconds = 15 * 60 } = {}) {
  if (!env.IVAI_DB) return [];
  const candidates = await env.IVAI_DB.prepare(`SELECT id, telegram_user_id AS userId, telegram_chat_id AS chatId, title, due_at AS dueAt, reminder_attempts AS attempts
    FROM tasks
    WHERE status='open' AND due_at IS NOT NULL
      AND reminder_status IN ('pending', 'retry', 'sending')
      AND due_at <= ?
      AND (reminder_lease_until IS NULL OR reminder_lease_until <= ?)
    ORDER BY due_at ASC LIMIT ?`).bind(now, now, limit).all();
  const leaseUntil = new Date(Date.parse(now) + leaseSeconds * 1000).toISOString();
  const claimed = [];
  for (const task of candidates?.results || []) {
    const update = await env.IVAI_DB.prepare(`UPDATE tasks SET reminder_status='sending', reminder_attempts=reminder_attempts+1,
      reminder_lease_until=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='open' AND reminder_status IN ('pending','retry','sending')
        AND (reminder_lease_until IS NULL OR reminder_lease_until <= ?)`)
      .bind(leaseUntil, task.id, now).run();
    if (update?.meta?.changes) claimed.push({ ...task, attempts: Number(task.attempts || 0) + 1 });
  }
  return claimed;
}

export async function markSecretaryReminderSent({ id, messageId = null }, env) {
  if (!env.IVAI_DB || !id) return;
  await env.IVAI_DB.prepare(`UPDATE tasks SET reminder_status='sent', reminder_lease_until=NULL, reminded_at=CURRENT_TIMESTAMP,
    reminder_message_id=?, reminder_last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(messageId ? String(messageId) : null, id).run();
}

export async function markSecretaryReminderFailed({ id, attempts, error }, env) {
  if (!env.IVAI_DB || !id) return;
  const status = Number(attempts || 0) >= 3 ? "failed" : "retry";
  await env.IVAI_DB.prepare(`UPDATE tasks SET reminder_status=?, reminder_lease_until=NULL, reminder_last_error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(status, String(error || "Telegram delivery failed").slice(0, 500), id).run();
}

export async function getReengagementPreference(userId, env) {
  if (!env.IVAI_DB || !userId) return { enabled: true };
  const row = await env.IVAI_DB.prepare("SELECT enabled, last_sent_at AS lastSentAt FROM user_reengagement WHERE telegram_user_id=?").bind(String(userId)).first();
  return row ? { enabled: Boolean(row.enabled), lastSentAt: row.lastSentAt || null } : { enabled: true, lastSentAt: null };
}

export async function setReengagementPreference(userId, enabled, env) {
  if (!env.IVAI_DB || !userId) return false;
  await env.IVAI_DB.prepare(`INSERT INTO user_reengagement (telegram_user_id, enabled, delivery_state, updated_at)
    VALUES (?, ?, 'idle', CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_user_id) DO UPDATE SET enabled=excluded.enabled,
      delivery_state=CASE WHEN excluded.enabled=1 THEN 'idle' ELSE user_reengagement.delivery_state END,
      lease_until=NULL, updated_at=CURRENT_TIMESTAMP`).bind(String(userId), enabled ? 1 : 0).run();
  return true;
}

export async function claimReengagementUsers(env, { limit = 5, now = new Date().toISOString(), inactiveDays = 15, resendDays = 15, leaseSeconds = 15 * 60 } = {}) {
  if (!env.IVAI_DB) return [];
  const inactiveBefore = new Date(Date.parse(now) - inactiveDays * 24 * 60 * 60 * 1000).toISOString();
  const resendBefore = new Date(Date.parse(now) - resendDays * 24 * 60 * 60 * 1000).toISOString();
  const retryBefore = new Date(Date.parse(now) - 24 * 60 * 60 * 1000).toISOString();
  const candidates = await env.IVAI_DB.prepare(`SELECT u.telegram_user_id AS userId, u.language
    FROM users u
    LEFT JOIN user_reengagement r ON r.telegram_user_id=u.telegram_user_id
    WHERE datetime(u.last_seen_at) <= datetime(?)
      AND COALESCE(r.enabled, 1)=1
      AND (r.last_sent_at IS NULL OR datetime(r.last_sent_at) <= datetime(?))
      AND (r.delivery_state IS NULL OR r.delivery_state IN ('idle','sent') OR (r.delivery_state='failed' AND datetime(r.last_attempt_at) <= datetime(?)))
      AND (r.lease_until IS NULL OR datetime(r.lease_until) <= datetime(?))
    ORDER BY u.last_seen_at ASC LIMIT ?`).bind(inactiveBefore, resendBefore, retryBefore, now, limit).all();
  const leaseUntil = new Date(Date.parse(now) + leaseSeconds * 1000).toISOString();
  const claimed = [];
  for (const candidate of candidates?.results || []) {
    await env.IVAI_DB.prepare(`INSERT INTO user_reengagement (telegram_user_id, enabled, delivery_state, last_attempt_at, lease_until, updated_at)
      VALUES (?, 1, 'sending', ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(telegram_user_id) DO UPDATE SET delivery_state='sending', last_attempt_at=excluded.last_attempt_at,
        lease_until=excluded.lease_until, updated_at=CURRENT_TIMESTAMP
      WHERE user_reengagement.enabled=1 AND (user_reengagement.lease_until IS NULL OR datetime(user_reengagement.lease_until) <= datetime(?))
        AND (user_reengagement.last_sent_at IS NULL OR datetime(user_reengagement.last_sent_at) <= datetime(?))
        AND (user_reengagement.delivery_state IN ('idle','sent') OR (user_reengagement.delivery_state='failed' AND datetime(user_reengagement.last_attempt_at) <= datetime(?)))`)
      .bind(String(candidate.userId), now, leaseUntil, now, resendBefore, retryBefore).run();
    const claimedRow = await env.IVAI_DB.prepare("SELECT delivery_state AS state, lease_until AS leaseUntil FROM user_reengagement WHERE telegram_user_id=?").bind(String(candidate.userId)).first();
    if (claimedRow?.state === "sending" && claimedRow.leaseUntil === leaseUntil) claimed.push(candidate);
  }
  return claimed;
}

export async function markReengagementSent(userId, env) {
  if (!env.IVAI_DB || !userId) return;
  await env.IVAI_DB.prepare("UPDATE user_reengagement SET delivery_state='sent', last_sent_at=CURRENT_TIMESTAMP, lease_until=NULL, last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE telegram_user_id=?").bind(String(userId)).run();
}

export async function markReengagementFailure({ userId, error, blocked = false }, env) {
  if (!env.IVAI_DB || !userId) return;
  await env.IVAI_DB.prepare("UPDATE user_reengagement SET delivery_state=?, lease_until=NULL, last_error=?, updated_at=CURRENT_TIMESTAMP WHERE telegram_user_id=?")
    .bind(blocked ? "blocked" : "failed", String(error || "Telegram delivery failed").slice(0, 500), String(userId)).run();
}

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

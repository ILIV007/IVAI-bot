import { APP, ROLE } from "./config.js";

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

export function hasValidWebhookSecret(request, env) {
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  return constantTimeEqual(request.headers.get("X-Telegram-Bot-Api-Secret-Token"), expected);
}

export function parseAdminIds(env) {
  return new Set(
    String(env.ADMIN_TELEGRAM_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value))
  );
}

export async function getRole(userId, env) {
  const id = String(userId || "");
  if (!id) return ROLE.USER;
  if (parseAdminIds(env).has(id)) return ROLE.OWNER;
  const stored = await env.IVAI_DB
    ?.prepare("SELECT role FROM roles WHERE telegram_user_id = ? AND is_active = 1 LIMIT 1")
    .bind(id)
    .first();
  return [ROLE.ADMIN, ROLE.MODERATOR].includes(stored?.role) ? stored.role : ROLE.USER;
}

export function canManage(role) {
  return role === ROLE.OWNER || role === ROLE.ADMIN || role === ROLE.MODERATOR;
}

export function canBroadcast(role) {
  return role === ROLE.OWNER || role === ROLE.ADMIN;
}

export async function claimUpdate(updateId, env) {
  if (!env.IVAI_KV || !updateId) return true;
  const key = `dedupe:update:${updateId}`;
  const existing = await env.IVAI_KV.get(key);
  if (existing) return false;
  await env.IVAI_KV.put(key, "1", { expirationTtl: APP.updateDedupeTtlSeconds });
  return true;
}

export async function allowUsage({ scope, id, limit, windowSeconds = 3600 }, env) {
  if (!env.IVAI_KV || !id) return { allowed: true, remaining: limit };
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `rate:${scope}:${id}:${bucket}`;
  const current = Number(await env.IVAI_KV.get(key) || 0);
  if (current >= limit) return { allowed: false, remaining: 0 };
  await env.IVAI_KV.put(key, String(current + 1), { expirationTtl: windowSeconds + 60 });
  return { allowed: true, remaining: limit - current - 1 };
}

export async function reserveWorkersAiBudget(units, env) {
  if (!env.IVAI_KV) return { allowed: true, remaining: APP.systemDailyWorkersAiBudget };
  const date = new Date().toISOString().slice(0, 10);
  const key = `quota:workers-ai:${date}`;
  const current = Number(await env.IVAI_KV.get(key) || 0);
  if (current + units > APP.systemDailyWorkersAiBudget) return { allowed: false, remaining: Math.max(0, APP.systemDailyWorkersAiBudget - current) };
  await env.IVAI_KV.put(key, String(current + units), { expirationTtl: 2 * 24 * 60 * 60 });
  return { allowed: true, remaining: APP.systemDailyWorkersAiBudget - current - units };
}

export function safeError(error) {
  const message = String(error?.message || "");
  if (/429|rate|quota/i.test(message)) return "RATE_LIMIT";
  if (/timeout|abort/i.test(message)) return "TIMEOUT";
  return "TEMPORARY_FAILURE";
}

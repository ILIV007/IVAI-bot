import { APP, ROLE } from "./config.js";

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function expiryIso(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function logRuntimeGuardFallback(operation, error) {
  console.warn(JSON.stringify({ event: "runtime_guard_d1_fallback", operation, error: String(error?.message || "unknown") }));
}

async function incrementRuntimeCounter({ scope, id, bucket, units, limit, ttlSeconds }, env) {
  if (units > limit) return null;
  if (!env.IVAI_DB) return undefined;
  try {
    const row = await env.IVAI_DB
      .prepare(`INSERT INTO runtime_counters (scope, subject_id, bucket, value, expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(scope, subject_id, bucket) DO UPDATE SET
          value = runtime_counters.value + excluded.value,
          expires_at = excluded.expires_at,
          updated_at = CURRENT_TIMESTAMP
        WHERE runtime_counters.value + excluded.value <= ?
        RETURNING value`)
      .bind(scope, String(id), String(bucket), units, expiryIso(ttlSeconds), limit)
      .first();
    return row ? Number(row.value) : null;
  } catch (error) {
    logRuntimeGuardFallback("counter", error);
    return undefined;
  }
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
  if (!updateId) return true;
  if (env.IVAI_DB) {
    try {
      const result = await env.IVAI_DB
        .prepare("INSERT OR IGNORE INTO processed_updates (telegram_update_id, expires_at) VALUES (?, ?)")
        .bind(String(updateId), expiryIso(APP.updateDedupeTtlSeconds))
        .run();
      return Number(result.meta?.changes || 0) > 0;
    } catch (error) {
      logRuntimeGuardFallback("dedupe", error);
    }
  }
  if (!env.IVAI_KV) return true;
  const key = `dedupe:update:${updateId}`;
  const existing = await env.IVAI_KV.get(key);
  if (existing) return false;
  await env.IVAI_KV.put(key, "1", { expirationTtl: APP.updateDedupeTtlSeconds });
  return true;
}

export async function releaseUpdateClaim(updateId, env) {
  if (!updateId) return;
  let releasedByD1 = false;
  if (env.IVAI_DB) {
    try {
      await env.IVAI_DB
        .prepare("DELETE FROM processed_updates WHERE telegram_update_id = ?")
        .bind(String(updateId))
        .run();
      releasedByD1 = true;
    } catch (error) {
      logRuntimeGuardFallback("dedupe_release", error);
    }
  }
  if (!releasedByD1 && env.IVAI_KV) {
    await env.IVAI_KV.delete(`dedupe:update:${updateId}`);
  }
}

export async function allowUsage({ scope, id, limit, windowSeconds = 3600 }, env) {
  if (!id) return { allowed: true, remaining: limit };
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const next = await incrementRuntimeCounter({ scope: `rate:${scope}`, id, bucket, units: 1, limit, ttlSeconds: windowSeconds + 60 }, env);
  if (next !== undefined) return next === null ? { allowed: false, remaining: 0 } : { allowed: true, remaining: Math.max(0, limit - next) };
  if (!env.IVAI_KV) return { allowed: true, remaining: limit };
  const key = `rate:${scope}:${id}:${bucket}`;
  const current = Number(await env.IVAI_KV.get(key) || 0);
  if (current >= limit) return { allowed: false, remaining: 0 };
  await env.IVAI_KV.put(key, String(current + 1), { expirationTtl: windowSeconds + 60 });
  return { allowed: true, remaining: limit - current - 1 };
}

export async function reserveWorkersAiBudget(units, env) {
  const date = new Date().toISOString().slice(0, 10);
  const next = await incrementRuntimeCounter({
    scope: "quota:workers-ai",
    id: "system",
    bucket: date,
    units,
    limit: APP.systemDailyWorkersAiBudget,
    ttlSeconds: 2 * 24 * 60 * 60
  }, env);
  if (next !== undefined) return next === null
    ? { allowed: false, remaining: 0 }
    : { allowed: true, remaining: Math.max(0, APP.systemDailyWorkersAiBudget - next) };
  if (!env.IVAI_KV) return { allowed: true, remaining: APP.systemDailyWorkersAiBudget };
  const key = `quota:workers-ai:${date}`;
  const current = Number(await env.IVAI_KV.get(key) || 0);
  if (current + units > APP.systemDailyWorkersAiBudget) return { allowed: false, remaining: Math.max(0, APP.systemDailyWorkersAiBudget - current) };
  await env.IVAI_KV.put(key, String(current + units), { expirationTtl: 2 * 24 * 60 * 60 });
  return { allowed: true, remaining: APP.systemDailyWorkersAiBudget - current - units };
}

export async function cleanupRuntimeGuards(env) {
  if (!env.IVAI_DB) return;
  try {
    await Promise.all([
      env.IVAI_DB.prepare("DELETE FROM processed_updates WHERE expires_at < CURRENT_TIMESTAMP").run(),
      env.IVAI_DB.prepare("DELETE FROM runtime_counters WHERE expires_at < CURRENT_TIMESTAMP").run()
    ]);
  } catch (error) {
    console.warn(JSON.stringify({ event: "runtime_guard_cleanup_failed", error: String(error?.message || "unknown") }));
  }
}

export function safeError(error) {
  const message = String(error?.message || "");
  if (/429|rate|quota/i.test(message)) return "RATE_LIMIT";
  if (/timeout|abort/i.test(message)) return "TIMEOUT";
  return "TEMPORARY_FAILURE";
}

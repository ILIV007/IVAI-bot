import { canBroadcast, canManage, getRole } from "./security.js";
import { createBroadcastDraft, getAdminOperationalStats, writeAdminAudit } from "./storage.js";

const encoder = new TextEncoder();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });
}

function equalHex(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let value = 0;
  for (let i = 0; i < left.length; i += 1) value |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return value === 0;
}

async function hmac(key, data) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data)));
}

function toHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const values = new URLSearchParams(initData);
  const actualHash = values.get("hash");
  if (!actualHash) return null;
  values.delete("hash");
  const authDate = Number(values.get("auth_date") || 0);
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 60 * 60) return null;
  const dataCheckString = [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = await hmac(encoder.encode("WebAppData"), botToken);
  const calculatedHash = toHex(await hmac(secret, dataCheckString));
  if (!equalHex(calculatedHash, actualHash)) return null;
  try {
    return JSON.parse(values.get("user") || "null");
  } catch {
    return null;
  }
}

async function metrics(env) {
  const stats = await getAdminOperationalStats(env);
  return {
    activeUsers: stats.activeUsers30d,
    pendingBroadcasts: stats.pendingBroadcasts,
    aiBudgetRemaining: stats.workersAiBudgetRemaining,
    totalUsers: stats.totalUsers,
    activeUsers7d: stats.activeUsers7d,
    activeChats30d: stats.activeChats30d,
    feedback7d: stats.feedback7d
  };
}

async function adminUser(request, env) {
  const initData = request.headers.get("x-telegram-init-data") || "";
  const telegramUser = await verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
  if (!telegramUser?.id) return null;
  const role = await getRole(telegramUser.id, env);
  return { telegramUser, role };
}

export async function handleAdminRequest(request, env) {
  const actor = await adminUser(request, env);
  if (!actor || !canManage(actor.role)) return json({ error: "unauthorized" }, 401);
  const url = new URL(request.url);

  if (url.pathname === "/admin/session") {
    return json({ admin: true, role: actor.role, metrics: await metrics(env) });
  }

  if (url.pathname === "/admin/broadcast/draft") {
    if (!canBroadcast(actor.role)) return json({ error: "forbidden" }, 403);
    const body = await request.json().catch(() => ({}));
    const content = String(body.content || "").trim();
    if (!content || content.length > 3500) return json({ error: "invalid_content" }, 400);
    const id = await createBroadcastDraft({ authorId: actor.telegramUser.id, content }, env);
    await writeAdminAudit({ actorId: actor.telegramUser.id, action: "broadcast_draft_created", targetType: "broadcast", targetId: id, metadata: { channel: "mini_app" } }, env);
    return json({ id, status: "draft" }, 201);
  }

  return json({ error: "not_found" }, 404);
}

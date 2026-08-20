import { canBroadcast, canManage, getRole } from "./security.js";
import { createBroadcastDraft, getAdminOperationalStats, writeAdminAudit } from "./storage.js";
import { getVerifiedWebAppUser, verifyTelegramInitData } from "./webapp-auth.js";

export { verifyTelegramInitData } from "./webapp-auth.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });
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
  const telegramUser = await getVerifiedWebAppUser(request, env);
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

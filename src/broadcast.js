import { escapeHtml, sendMessage } from "./telegram.js";

const DELIVERY_BATCH_SIZE = 12;
const SEED_BATCH_SIZE = 250;
const MAX_DELIVERY_ATTEMPTS = 3;
const DELIVERY_LEASE_SECONDS = 15 * 60;

function deliveryId() {
  return crypto.randomUUID();
}

function deliveryLeaseUntil(now, leaseSeconds) {
  return new Date(Date.parse(now) + leaseSeconds * 1000).toISOString();
}

/**
 * Takes an idempotent, bounded snapshot of eligible users. New users created
 * after confirmation are intentionally excluded from the in-flight campaign.
 * Repeated cron runs continue from users not yet represented in deliveries.
 */
export async function seedBroadcastDeliveries(campaignId, env, limit = SEED_BATCH_SIZE) {
  const campaign = await env.IVAI_DB
    .prepare("SELECT id, status, confirmed_at FROM broadcast_campaigns WHERE id = ? LIMIT 1")
    .bind(campaignId)
    .first();
  if (!campaign || !["confirmed", "queued", "sending"].includes(campaign.status)) return { seeded: 0, status: campaign?.status || "missing" };

  const recipients = await env.IVAI_DB
    .prepare(`SELECT u.telegram_user_id FROM users u
      WHERE u.last_seen_at >= datetime('now', '-90 days')
        AND u.created_at <= COALESCE(?, CURRENT_TIMESTAMP)
        AND NOT EXISTS (
          SELECT 1 FROM broadcast_deliveries d
          WHERE d.campaign_id = ? AND d.telegram_user_id = u.telegram_user_id
        )
      ORDER BY u.last_seen_at DESC LIMIT ?`)
    .bind(campaign.confirmed_at, campaignId, Math.max(1, Math.min(Number(limit) || SEED_BATCH_SIZE, SEED_BATCH_SIZE)))
    .all();

  let seeded = 0;
  for (const recipient of recipients.results || []) {
    const result = await env.IVAI_DB
      .prepare(`INSERT OR IGNORE INTO broadcast_deliveries (id, campaign_id, telegram_user_id, status, updated_at)
        VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)`)
      .bind(deliveryId(), campaignId, recipient.telegram_user_id)
      .run();
    seeded += Number(result.meta?.changes || 0);
  }

  await env.IVAI_DB
    .prepare(`UPDATE broadcast_campaigns SET status = CASE WHEN status = 'confirmed' THEN 'queued' ELSE status END, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(campaignId)
    .run();
  return { seeded, status: "queued" };
}

/**
 * Claims a bounded batch before external Telegram work begins. Each candidate
 * is conditionally leased in D1, so concurrent cron invocations cannot send
 * the same recipient twice. A lease expires only after a conservative window,
 * allowing a later scheduled run to recover from a terminated invocation.
 */
async function claimBroadcastDeliveries(campaignId, env, { limit, now, leaseSeconds }) {
  const candidates = await env.IVAI_DB
    .prepare(`SELECT id, telegram_user_id, attempts FROM broadcast_deliveries
      WHERE campaign_id=? AND status='pending'
        AND (lease_until IS NULL OR lease_until <= ?)
      ORDER BY updated_at ASC LIMIT ?`)
    .bind(campaignId, now, limit)
    .all();
  const leaseUntil = deliveryLeaseUntil(now, leaseSeconds);
  const claimed = [];
  for (const candidate of candidates?.results || []) {
    const claimToken = crypto.randomUUID();
    const result = await env.IVAI_DB
      .prepare(`UPDATE broadcast_deliveries SET claim_token=?, lease_until=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND campaign_id=? AND status='pending'
          AND (lease_until IS NULL OR lease_until <= ?)`)
      .bind(claimToken, leaseUntil, candidate.id, campaignId, now)
      .run();
    if (Number(result.meta?.changes || 0) === 1) claimed.push({ ...candidate, claimToken });
  }
  return claimed;
}

export async function processBroadcastBatch(campaignId, env, limit = DELIVERY_BATCH_SIZE, { now = new Date().toISOString(), leaseSeconds = DELIVERY_LEASE_SECONDS } = {}) {
  const campaign = await env.IVAI_DB
    .prepare("SELECT id, status, content FROM broadcast_campaigns WHERE id = ? LIMIT 1")
    .bind(campaignId)
    .first();
  if (!campaign || !["queued", "sending"].includes(campaign.status)) return { sent: 0, status: campaign?.status || "missing" };

  const rows = await claimBroadcastDeliveries(campaignId, env, {
    limit: Math.max(1, Math.min(Number(limit) || DELIVERY_BATCH_SIZE, DELIVERY_BATCH_SIZE)),
    now,
    leaseSeconds
  });
  if (!rows.length) {
    const remaining = await env.IVAI_DB.prepare("SELECT COUNT(*) AS count FROM broadcast_deliveries WHERE campaign_id=? AND status='pending'").bind(campaignId).first();
    if (!Number(remaining?.count || 0)) {
      await env.IVAI_DB.prepare("UPDATE broadcast_campaigns SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(campaignId).run();
      return { sent: 0, status: "completed" };
    }
    return { sent: 0, status: campaign.status };
  }

  await env.IVAI_DB.prepare("UPDATE broadcast_campaigns SET status='sending', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(campaignId).run();
  let sent = 0;
  for (const delivery of rows) {
    const attempts = Number(delivery.attempts || 0) + 1;
    try {
      await sendMessage(env, { chatId: delivery.telegram_user_id, text: escapeHtml(campaign.content) });
      const result = await env.IVAI_DB
        .prepare(`UPDATE broadcast_deliveries SET status='sent', attempts=?, sent_at=CURRENT_TIMESTAMP,
          claim_token=NULL, lease_until=NULL, updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND status='pending' AND claim_token=?`)
        .bind(attempts, delivery.id, delivery.claimToken)
        .run();
      sent += Number(result.meta?.changes || 0);
    } catch (error) {
      const message = String(error.message || "delivery failed").slice(0, 200);
      const blocked = /blocked|chat not found|user is deactivated/i.test(message);
      const status = blocked ? "blocked" : attempts >= MAX_DELIVERY_ATTEMPTS ? "failed" : "pending";
      await env.IVAI_DB
        .prepare(`UPDATE broadcast_deliveries SET status=?, attempts=?, last_error=?, claim_token=NULL,
          lease_until=NULL, updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND status='pending' AND claim_token=?`)
        .bind(status, attempts, message, delivery.id, delivery.claimToken)
        .run();
    }
  }
  return { sent, status: "sending" };
}

export async function cancelBroadcast(campaignId, actorId, env) {
  await env.IVAI_DB
    .prepare(`UPDATE broadcast_campaigns SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('draft','confirmed','queued','sending')`)
    .bind(campaignId)
    .run();
  await env.IVAI_DB
    .prepare(`INSERT INTO admin_audit_logs (actor_telegram_user_id, action, target_type, target_id, metadata, created_at)
      VALUES (?, 'broadcast_cancelled', 'broadcast', ?, '{}', CURRENT_TIMESTAMP)`)
    .bind(String(actorId), campaignId)
    .run();
}

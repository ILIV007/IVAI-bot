import assert from "node:assert/strict";
import test from "node:test";
import { processBroadcastBatch, seedBroadcastDeliveries } from "../src/broadcast.js";

class BroadcastD1 {
  constructor({ campaign, users = [], deliveries = [] }) {
    this.campaigns = new Map([[campaign.id, { ...campaign }]]);
    this.users = users.map((user) => ({ lastSeenAt: "2026-08-21T12:00:00.000Z", ...user }));
    this.deliveries = new Map(deliveries.map((delivery) => [delivery.id, { ...delivery }]));
  }

  prepare(sql) {
    return {
      bind: (...params) => ({
        first: async () => this.#first(sql, params),
        all: async () => this.#all(sql, params),
        run: async () => this.#run(sql, params)
      })
    };
  }

  async #first(sql, params) {
    if (sql.includes("SELECT id, status, confirmed_at FROM broadcast_campaigns")) return this.campaigns.get(params[0]) || null;
    if (sql.includes("SELECT id, status, content FROM broadcast_campaigns")) return this.campaigns.get(params[0]) || null;
    if (sql.includes("SELECT COUNT(*) AS count FROM broadcast_deliveries")) {
      const [campaignId] = params;
      return { count: [...this.deliveries.values()].filter((delivery) => delivery.campaign_id === campaignId && delivery.status === "pending").length };
    }
    throw new Error(`Unhandled first query: ${sql}`);
  }

  async #all(sql, params) {
    if (sql.includes("SELECT u.telegram_user_id FROM users u")) {
      const [confirmedAt, campaignId, limit] = params;
      const rows = this.users
        .filter((user) => user.created_at <= confirmedAt)
        .filter((user) => ![...this.deliveries.values()].some((delivery) => delivery.campaign_id === campaignId && delivery.telegram_user_id === user.telegram_user_id))
        .slice(0, Number(limit));
      return { results: rows.map((user) => ({ telegram_user_id: user.telegram_user_id })) };
    }
    if (sql.includes("SELECT id, telegram_user_id, attempts FROM broadcast_deliveries")) {
      const [campaignId, now, limit] = params;
      const rows = [...this.deliveries.values()]
        .filter((delivery) => delivery.campaign_id === campaignId && delivery.status === "pending")
        .filter((delivery) => !delivery.lease_until || delivery.lease_until <= now)
        .sort((left, right) => String(left.updated_at).localeCompare(String(right.updated_at)))
        .slice(0, Number(limit));
      return { results: rows };
    }
    throw new Error(`Unhandled all query: ${sql}`);
  }

  async #run(sql, params) {
    if (sql.includes("INSERT OR IGNORE INTO broadcast_deliveries")) {
      const [id, campaignId, userId] = params;
      const duplicate = [...this.deliveries.values()].some((delivery) => delivery.campaign_id === campaignId && delivery.telegram_user_id === userId);
      if (duplicate) return { meta: { changes: 0 } };
      this.deliveries.set(id, { id, campaign_id: campaignId, telegram_user_id: userId, status: "pending", attempts: 0, updated_at: new Date().toISOString() });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE broadcast_deliveries SET claim_token=?")) {
      const [claimToken, leaseUntil, id, campaignId, now] = params;
      const delivery = this.deliveries.get(id);
      if (!delivery || delivery.campaign_id !== campaignId || delivery.status !== "pending" || (delivery.lease_until && delivery.lease_until > now)) return { meta: { changes: 0 } };
      Object.assign(delivery, { claim_token: claimToken, lease_until: leaseUntil, updated_at: now });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE broadcast_campaigns SET status = CASE")) {
      const campaign = this.campaigns.get(params[0]);
      if (campaign?.status === "confirmed") campaign.status = "queued";
      return { meta: { changes: campaign ? 1 : 0 } };
    }
    if (sql.includes("UPDATE broadcast_campaigns SET status='sending'")) {
      const campaign = this.campaigns.get(params[0]);
      if (campaign) campaign.status = "sending";
      return { meta: { changes: campaign ? 1 : 0 } };
    }
    if (sql.includes("UPDATE broadcast_campaigns SET status='completed'")) {
      const campaign = this.campaigns.get(params[0]);
      if (campaign) campaign.status = "completed";
      return { meta: { changes: campaign ? 1 : 0 } };
    }
    if (sql.includes("UPDATE broadcast_deliveries SET status='sent'")) {
      const [attempts, id, claimToken] = params;
      const delivery = this.deliveries.get(id);
      if (!delivery || delivery.status !== "pending" || delivery.claim_token !== claimToken) return { meta: { changes: 0 } };
      Object.assign(delivery, { status: "sent", attempts, claim_token: null, lease_until: null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE broadcast_deliveries SET status=?, attempts=?")) {
      const [status, attempts, lastError, id, claimToken] = params;
      const delivery = this.deliveries.get(id);
      if (!delivery || delivery.status !== "pending" || delivery.claim_token !== claimToken) return { meta: { changes: 0 } };
      Object.assign(delivery, { status, attempts, last_error: lastError, claim_token: null, lease_until: null, updated_at: new Date().toISOString() });
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unhandled run query: ${sql}`);
  }
}

function campaign(id = "campaign-1", status = "confirmed") {
  return { id, status, content: "Service update", confirmed_at: "2026-08-21T10:00:00.000Z" };
}

function env(db) {
  return { IVAI_DB: db, TELEGRAM_BOT_TOKEN: "test-token" };
}

test("broadcast seeding snapshots eligible users beyond the first 250 without adding late arrivals", async () => {
  const users = Array.from({ length: 260 }, (_, index) => ({
    telegram_user_id: `user-${index + 1}`,
    created_at: "2026-08-21T09:00:00.000Z"
  }));
  users.push({ telegram_user_id: "late-user", created_at: "2026-08-21T11:00:00.000Z" });
  const db = new BroadcastD1({ campaign: campaign(), users });

  const first = await seedBroadcastDeliveries("campaign-1", env(db));
  db.campaigns.get("campaign-1").status = "sending";
  const second = await seedBroadcastDeliveries("campaign-1", env(db));

  assert.equal(first.seeded, 250);
  assert.equal(second.seeded, 10);
  assert.equal(db.deliveries.size, 260);
  assert.ok(![...db.deliveries.values()].some((delivery) => delivery.telegram_user_id === "late-user"));
});

test("broadcast retries transient delivery failures and stops after the bounded attempt limit", async () => {
  const db = new BroadcastD1({
    campaign: campaign("campaign-2", "queued"),
    deliveries: [{ id: "delivery-1", campaign_id: "campaign-2", telegram_user_id: "user-1", status: "pending", attempts: 0, updated_at: "2026-08-21T10:00:00.000Z" }]
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, description: "Internal Server Error" }), { status: 500 });
  try {
    await processBroadcastBatch("campaign-2", env(db), 1);
    assert.equal(db.deliveries.get("delivery-1").status, "pending");
    assert.equal(db.deliveries.get("delivery-1").attempts, 1);
    assert.equal(db.deliveries.get("delivery-1").claim_token, null);

    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    const recovered = await processBroadcastBatch("campaign-2", env(db), 1);
    assert.equal(recovered.sent, 1);
    assert.equal(db.deliveries.get("delivery-1").status, "sent");
    assert.equal(db.deliveries.get("delivery-1").attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("broadcast records a permanent failure after three transient attempts", async () => {
  const db = new BroadcastD1({
    campaign: campaign("campaign-3", "queued"),
    deliveries: [{ id: "delivery-3", campaign_id: "campaign-3", telegram_user_id: "user-3", status: "pending", attempts: 2, updated_at: "2026-08-21T10:00:00.000Z" }]
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, description: "Temporary failure" }), { status: 500 });
  try {
    await processBroadcastBatch("campaign-3", env(db), 1);
    assert.equal(db.deliveries.get("delivery-3").status, "failed");
    assert.equal(db.deliveries.get("delivery-3").attempts, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("overlapping broadcast batches claim a recipient once and never double-send", async () => {
  const db = new BroadcastD1({
    campaign: campaign("campaign-4", "queued"),
    deliveries: [{ id: "delivery-4", campaign_id: "campaign-4", telegram_user_id: "user-4", status: "pending", attempts: 0, updated_at: "2026-08-21T10:00:00.000Z" }]
  });
  const originalFetch = globalThis.fetch;
  let sends = 0;
  globalThis.fetch = async () => {
    sends += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(JSON.stringify({ ok: true, result: { message_id: sends } }), { status: 200 });
  };
  try {
    const now = "2026-08-21T12:00:00.000Z";
    const [first, second] = await Promise.all([
      processBroadcastBatch("campaign-4", env(db), 1, { now }),
      processBroadcastBatch("campaign-4", env(db), 1, { now })
    ]);
    assert.equal(first.sent + second.sent, 1);
    assert.equal(sends, 1);
    assert.equal(db.deliveries.get("delivery-4").status, "sent");
    assert.equal(db.deliveries.get("delivery-4").attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

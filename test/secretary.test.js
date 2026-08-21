import assert from "node:assert/strict";
import test from "node:test";
import { processSecretaryReminderBatch } from "../src/secretary.js";

class SecretaryRetryD1 {
  constructor() {
    this.task = {
      id: "task-retry-1",
      userId: "user-1",
      chatId: "chat-1",
      title: "Retry boundary",
      dueAt: "2026-08-21T10:00:00.000Z",
      reminderStatus: "pending",
      attempts: 2,
      leaseUntil: null
    };
  }

  prepare(sql) {
    return {
      bind: (...params) => ({
        all: async () => this.#all(sql, params),
        run: async () => this.#run(sql, params)
      })
    };
  }

  async #all(sql) {
    if (!sql.includes("FROM tasks") || !sql.includes("reminder_status IN")) throw new Error(`Unhandled all query: ${sql}`);
    const task = this.task;
    const eligible = task.reminderStatus === "pending" && !task.leaseUntil;
    return { results: eligible ? [{ id: task.id, userId: task.userId, chatId: task.chatId, title: task.title, dueAt: task.dueAt, attempts: task.attempts }] : [] };
  }

  async #run(sql, params) {
    if (sql.includes("UPDATE tasks SET reminder_status='sending'")) {
      this.task.reminderStatus = "sending";
      this.task.attempts += 1;
      this.task.leaseUntil = params[0];
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE tasks SET reminder_status=?")) {
      this.task.reminderStatus = params[0];
      this.task.leaseUntil = null;
      this.task.lastError = params[1];
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unhandled run query: ${sql}`);
  }
}

test("Secretary marks a reminder failed on its third claimed delivery attempt", async () => {
  const db = new SecretaryRetryD1();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, description: "Temporary failure" }), { status: 500 });
  try {
    const summary = await processSecretaryReminderBatch({ IVAI_DB: db, TELEGRAM_BOT_TOKEN: "test-token" }, { now: "2026-08-21T12:00:00.000Z" });
    assert.deepEqual(summary, { claimed: 1, sent: 0, retried: 0, failed: 1 });
    assert.equal(db.task.attempts, 3);
    assert.equal(db.task.reminderStatus, "failed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

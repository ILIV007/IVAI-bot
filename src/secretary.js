import { claimDueSecretaryTasks, markSecretaryReminderFailed, markSecretaryReminderSent } from "./storage.js";
import { telegram } from "./telegram.js";

function reminderText(task) {
  return `<b>⏰ IVAI reminder</b>\n\n${escapeHtml(task.title)}\n\n<i>Scheduled for ${escapeHtml(formatDueAt(task.dueAt))}</i>`;
}

function formatDueAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || "") : date.toISOString().replace(".000Z", "Z");
}

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function processSecretaryReminderBatch(env, { limit = 4, now } = {}) {
  const tasks = await claimDueSecretaryTasks(env, { limit, now });
  const summary = { claimed: tasks.length, sent: 0, retried: 0, failed: 0 };
  for (const task of tasks) {
    try {
      const sent = await telegram(env, "sendMessage", {
        chat_id: task.chatId,
        text: reminderText(task),
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      await markSecretaryReminderSent({ id: task.id, messageId: sent?.message_id }, env);
      summary.sent += 1;
    } catch (error) {
      const attempts = Number(task.attempts || 0);
      await markSecretaryReminderFailed({ id: task.id, attempts, error: error?.message }, env);
      if (attempts >= 3) summary.failed += 1;
      else summary.retried += 1;
      console.error(JSON.stringify({ event: "secretary_reminder_failure", taskId: task.id, attempts, error: String(error?.message || "unknown") }));
    }
  }
  return summary;
}

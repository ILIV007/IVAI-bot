import { claimDueSecretaryTasks, getUserSettings, markSecretaryReminderFailed, markSecretaryReminderSent } from "./storage.js";
import { richLineBreaks, sendRichMessage, telegram } from "./telegram.js";

function reminderText(task, language) {
  const html = language === "fa"
    ? `<b>⏰ یادآوری</b>\n${escapeHtml(task.title)}\n\n<i>برای ${escapeHtml(formatDueAt(task.dueAt))}</i>\nتمام شد؟ در <code>/tasks</code> ببندیدش.`
    : `<b>⏰ Reminder</b>\n${escapeHtml(task.title)}\n\n<i>For ${escapeHtml(formatDueAt(task.dueAt))}</i>\nDone with it? Open <code>/tasks</code> to close it.`;
  return html;
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
      // Reminders speak the owner's stored language; a lookup failure
      // falls back to English rather than dropping the reminder.
      const language = (await getUserSettings(task.userId, env).catch(() => null))?.language || "en";
      const html = reminderText(task, language);
      let sent;
      try {
        sent = await sendRichMessage(env, { chatId: task.chatId, html: richLineBreaks(html), rtl: language === "fa" });
      } catch {
        sent = await telegram(env, "sendMessage", {
          chat_id: task.chatId,
          text: html,
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
      }
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

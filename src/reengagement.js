import { claimReengagementUsers, markReengagementFailure, markReengagementSent } from "./storage.js";
import { telegram } from "./telegram.js";

const COPY = Object.freeze({
  en: { text: "<b>🪐 IVAI is still here</b>\n\nHave a question, idea, or task? Send it anytime — free AI, your language, your pace.", open: "Open IVAI", pause: "Pause reminders" },
  fa: { text: "<b>🪐 IVAI هنوز اینجاست</b>\n\nسؤال، ایده یا کاری دارید؟ هر زمان پیام بدهید — AI رایگان، به زبان شما و با سرعت خودتان.", open: "باز کردن IVAI", pause: "توقف یادآوری‌ها" },
  ar: { text: "<b>🪐 ما زلنا هنا</b>\n\nلديك سؤال أو فكرة أو مهمة؟ أرسلها في أي وقت — ذكاء اصطناعي مجاني بلغتك.", open: "فتح IVAI", pause: "إيقاف التذكيرات" },
  es: { text: "<b>🪐 IVAI sigue aquí</b>\n\n¿Tienes una pregunta, idea o tarea? Escríbeme cuando quieras: IA gratuita en tu idioma.", open: "Abrir IVAI", pause: "Pausar recordatorios" },
  tr: { text: "<b>🪐 IVAI hâlâ burada</b>\n\nBir sorunuz, fikriniz veya göreviniz mi var? İstediğiniz zaman yazın: dilinizde ücretsiz yapay zekâ.", open: "IVAI’yi aç", pause: "Hatırlatmaları duraklat" },
  ru: { text: "<b>🪐 IVAI всё ещё здесь</b>\n\nЕсть вопрос, идея или задача? Напишите в любое время — бесплатный ИИ на вашем языке.", open: "Открыть IVAI", pause: "Приостановить напоминания" },
  "pt-BR": { text: "<b>🪐 IVAI continua aqui</b>\n\nTem uma pergunta, ideia ou tarefa? Escreva quando quiser: IA gratuita no seu idioma.", open: "Abrir IVAI", pause: "Pausar lembretes" },
  id: { text: "<b>🪐 IVAI masih di sini</b>\n\nPunya pertanyaan, ide, atau tugas? Kirim kapan saja — AI gratis dalam bahasa Anda.", open: "Buka IVAI", pause: "Jeda pengingat" },
  hi: { text: "<b>🪐 IVAI अभी भी यहाँ है</b>\n\nकोई सवाल, विचार या काम है? कभी भी संदेश भेजें — आपकी भाषा में निःशुल्क AI.", open: "IVAI खोलें", pause: "रिमाइंडर रोकें" },
  fr: { text: "<b>🪐 IVAI est toujours là</b>\n\nUne question, une idée ou une tâche ? Écrivez à tout moment : une IA gratuite dans votre langue.", open: "Ouvrir IVAI", pause: "Mettre en pause" },
  de: { text: "<b>🪐 IVAI ist noch da</b>\n\nEine Frage, Idee oder Aufgabe? Schreib jederzeit – kostenlose KI in deiner Sprache.", open: "IVAI öffnen", pause: "Erinnerungen pausieren" }
});

function copyFor(language) {
  return COPY[language] || COPY.en;
}

function isBlocked(error) {
  return /blocked|chat not found|user is deactivated|forbidden/i.test(String(error?.message || error || ""));
}

export async function processReengagementBatch(env, { limit = 5, now } = {}) {
  const users = await claimReengagementUsers(env, { limit, now, inactiveDays: 15, resendDays: 15 });
  const summary = { claimed: users.length, sent: 0, failed: 0, blocked: 0 };
  for (const user of users) {
    const copy = copyFor(user.language);
    try {
      await telegram(env, "sendMessage", {
        chat_id: user.userId,
        text: copy.text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[
            { text: copy.open, url: "https://t.me/IVAI_Llm_bot" },
            { text: copy.pause, callback_data: "notify:off", style: "danger" }
          ]]
        }
      });
      await markReengagementSent(user.userId, env);
      summary.sent += 1;
    } catch (error) {
      const blocked = isBlocked(error);
      await markReengagementFailure({ userId: user.userId, error: error?.message, blocked }, env);
      if (blocked) summary.blocked += 1;
      else summary.failed += 1;
      console.error(JSON.stringify({ event: "reengagement_delivery_failure", userId: String(user.userId), blocked, error: String(error?.message || "unknown") }));
    }
  }
  return summary;
}

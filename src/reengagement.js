import { claimReengagementUsers, markReengagementFailure, markReengagementSent } from "./storage.js";
import { richLineBreaks, sendRichMessage, telegram } from "./telegram.js";

const COPY = Object.freeze({
  en: { text: "<b>🪐 Still here, whenever you need me</b>\n\nGot a question, an idea, or a task? Send it anytime — free AI, in your language, at your pace.", open: "Open IVAI", pause: "Pause reminders" },
  fa: { text: "<b>🪐 هر وقت لازم داشتی، اینجام</b>\n\nسؤال، ایده یا کاری داری؟ هر وقت خواستی بفرست — AI رایگان، به زبان خودت و با سرعت خودت.", open: "باز کردن IVAI", pause: "توقف یادآوری‌ها" },
  ar: { text: "<b>🪐 ما زلنا هنا، متى ما احتجتني</b>\n\nلديك سؤال أو فكرة أو مهمة؟ أرسلها في أي وقت — ذكاء اصطناعي مجاني، بلغتك، وعلى إيقاعك.", open: "فتح IVAI", pause: "إيقاف التذكيرات" },
  es: { text: "<b>🪐 Sigo aquí, cuando me necesites</b>\n\n¿Tienes una pregunta, una idea o una tarea? Escríbela cuando quieras: IA gratuita, en tu idioma y a tu ritmo.", open: "Abrir IVAI", pause: "Pausar recordatorios" },
  tr: { text: "<b>🪐 İhtiyacın olduğunda hâlâ buradayım</b>\n\nBir sorun, fikrin veya görevin mi var? İstediğin zaman yaz — dilinde ücretsiz yapay zekâ, kendi hızında.", open: "IVAI’yi aç", pause: "Hatırlatmaları duraklat" },
  ru: { text: "<b>🪐 Я всё ещё здесь, когда понадоблюсь</b>\n\nЕсть вопрос, идея или задача? Напишите в любое время — бесплатный ИИ на вашем языке и в вашем темпе.", open: "Открыть IVAI", pause: "Приостановить напоминания" },
  "pt-BR": { text: "<b>🪐 Ainda estou aqui, quando precisar de mim</b>\n\nTem uma pergunta, uma ideia ou uma tarefa? Escreva quando quiser — IA gratuita, no seu idioma e no seu ritmo.", open: "Abrir IVAI", pause: "Pausar lembretes" },
  id: { text: "<b>🪐 Masih di sini, kapan pun kamu butuh</b>\n\nPunya pertanyaan, ide, atau tugas? Kirim kapan saja — AI gratis, dalam bahasamu, sesuai waktumu.", open: "Buka IVAI", pause: "Jeda pengingat" },
  hi: { text: "<b>🪐 जब भी ज़रूरत हो, मैं यहीं हूँ</b>\n\nकोई सवाल, विचार या काम है? कभी भी भेजें — आपकी भाषा में, आपकी गति से निःशुल्क AI.", open: "IVAI खोलें", pause: "रिमाइंडर रोकें" },
  fr: { text: "<b>🪐 Toujours là, quand tu as besoin de moi</b>\n\nUne question, une idée ou une tâche ? Écris à tout moment — une IA gratuite, dans ta langue, à ton rythme.", open: "Ouvrir IVAI", pause: "Mettre en pause" },
  de: { text: "<b>🪐 Immer noch da, wann immer du mich brauchst</b>\n\nEine Frage, Idee oder Aufgabe? Schreib jederzeit — kostenlose KI in deiner Sprache, in deinem Tempo.", open: "IVAI öffnen", pause: "Erinnerungen pausieren" }
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
    const keyboard = {
      inline_keyboard: [[
        { text: copy.open, url: "https://t.me/IVAI_Llm_bot" },
        { text: copy.pause, callback_data: "notify:off", style: "danger" }
      ]]
    };
    try {
      try {
        await sendRichMessage(env, { chatId: user.userId, html: richLineBreaks(copy.text), keyboard, rtl: ["fa", "ar"].includes(user.language) });
      } catch {
        await telegram(env, "sendMessage", {
          chat_id: user.userId,
          text: copy.text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: keyboard
        });
      }
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

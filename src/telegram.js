import { APP, MODES } from "./config.js";

const API = "https://api.telegram.org";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function modeKeyboard(language = "en") {
  const fa = language === "fa";
  return {
    inline_keyboard: [
      [
        { text: fa ? "⚡ سریع" : "⚡ Fast", callback_data: "mode:fast" },
        { text: fa ? "🧠 عمیق" : "🧠 Deep", callback_data: "mode:deep" }
      ],
      [
        { text: fa ? "💻 کد" : "💻 Code", callback_data: "mode:code" },
        { text: fa ? "✨ پرامپت" : "✨ Prompt", callback_data: "mode:prompt" }
      ],
      [
        { text: fa ? "🔀 خودکار" : "🔀 Auto", callback_data: "mode:auto" },
        { text: fa ? "⚙️ تنظیمات" : "⚙️ Settings", callback_data: "settings:open" }
      ]
    ]
  };
}

export function feedbackKeyboard(token) {
  return {
    inline_keyboard: [
      [
        { text: "👍", callback_data: `feedback:up:${token}` },
        { text: "👎", callback_data: `feedback:down:${token}` },
        { text: "↻", callback_data: `retry:${token}` },
        { text: "📋", copy_text: { text: token } }
      ]
    ]
  };
}

export function adminKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "📣 Broadcast", callback_data: "admin:broadcast" },
        { text: "📊 Stats", callback_data: "admin:stats" }
      ],
      [
        { text: "🛡 Guard", callback_data: "admin:guard" },
        { text: "⚙️ Policies", callback_data: "admin:policy" }
      ]
    ]
  };
}

export async function telegram(env, method, body) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram token is not configured");
  const response = await fetch(`${API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) throw new Error(`Telegram ${method} failed: ${json.description || response.status}`);
  return json.result;
}

export async function sendTyping(env, chatId) {
  return telegram(env, "sendChatAction", { chat_id: chatId, action: "typing" });
}

export async function sendMessage(env, { chatId, text, replyTo, keyboard, disablePreview = true }) {
  const parts = splitText(text, APP.maxTelegramText);
  let finalMessage;
  for (let index = 0; index < parts.length; index += 1) {
    finalMessage = await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: parts[index],
      parse_mode: "HTML",
      disable_web_page_preview: disablePreview,
      reply_parameters: index === 0 && replyTo ? { message_id: replyTo } : undefined,
      reply_markup: index === parts.length - 1 ? keyboard : undefined
    });
  }
  return finalMessage;
}

export async function editMessage(env, { chatId, messageId, text, keyboard }) {
  return telegram(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: text.slice(0, APP.maxTelegramText),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard
  });
}

export async function answerCallback(env, callbackQueryId, text = "") {
  return telegram(env, "answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: false });
}

export function splitText(text, maxLength) {
  const value = String(text || "");
  if (value.length <= maxLength) return [value];
  const parts = [];
  let remaining = value;
  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf("\n", maxLength - 100);
    if (cut < maxLength * 0.55) cut = remaining.lastIndexOf(" ", maxLength - 40);
    if (cut < maxLength * 0.4) cut = maxLength - 1;
    parts.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

export function welcomeText(language = "en") {
  if (language === "fa") {
    return "<b>🪐 IVAI</b>\n\nدستیار هوشمند رایگان شما. حالت مناسب را انتخاب کنید یا پیام‌تان را بفرستید.";
  }
  return "<b>🪐 IVAI</b>\n\nYour free AI assistant. Choose a mode or send a message.";
}

export function modeLabel(mode, language = "en") {
  const fa = language === "fa";
  const labels = fa
    ? { [MODES.AUTO]: "خودکار", [MODES.FAST]: "سریع", [MODES.DEEP]: "عمیق", [MODES.CODE]: "کد", [MODES.PROMPT]: "پرامپت" }
    : { [MODES.AUTO]: "Auto", [MODES.FAST]: "Fast", [MODES.DEEP]: "Deep", [MODES.CODE]: "Code", [MODES.PROMPT]: "Prompt" };
  return labels[mode] || mode;
}

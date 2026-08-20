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
        { text: fa ? "▦ حالت‌های بیشتر" : "▦ More modes", callback_data: "modes:more" }
      ]
    ]
  };
}

export function extendedModeKeyboard(language = "en") {
  const fa = language === "fa";
  return {
    inline_keyboard: [
      [
        { text: fa ? "👤 مهمان" : "👤 Guest", callback_data: "mode:guest" },
        { text: fa ? "🛡 Guard" : "🛡 Guard", callback_data: "mode:guard" }
      ],
      [
        { text: fa ? "🗂 منشی" : "🗂 Secretary", callback_data: "mode:secretary" },
        { text: fa ? "📣 مدیریت" : "📣 Management", callback_data: "mode:management" }
      ],
      [
        { text: fa ? "🧵 Thread" : "🧵 Thread", callback_data: "mode:thread" },
        { text: fa ? "← بازگشت" : "← Back", callback_data: "modes:back" }
      ]
    ]
  };
}

export function feedbackKeyboard() {
  // Message actions are intentionally opt-in through commands and admin flows.
  // Keeping ordinary AI replies button-free reduces visual noise and accidental taps.
  return undefined;
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

export async function sendMessage(env, { chatId, text, replyTo, keyboard, disablePreview = true, parseMode = "HTML" }) {
  const parts = splitText(text, APP.maxTelegramText);
  let finalMessage;
  for (let index = 0; index < parts.length; index += 1) {
    finalMessage = await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: parts[index],
      parse_mode: parseMode || undefined,
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

export function shortModelLabel(model = "") {
  const value = String(model || "").toLowerCase();
  if (value.includes("whisper")) return "Whisper";
  if (value.includes("llama-guard")) return "Llama Guard";
  if (value.includes("llama-4-scout")) return "Llama 4 Scout";
  if (value.includes("glm-4.7-flash")) return "GLM 4.7 Flash";
  if (value.includes("gemma-4")) return "Gemma 4";
  if (value.includes("gpt-oss-20b")) return "GPT-OSS 20B";
  if (value.includes("llama-3.2-3b")) return "Llama 3.2";
  if (value.includes("llama-3.1-8b")) return "Llama 3.1";
  if (value.includes("gemini-2.5-flash-lite")) return "Gemini Flash Lite";
  const compact = String(model || "IVAI")
    .replace(/^@cf\//, "")
    .replace(/^[^/]+\//, "")
    .replace(/:free$/i, "")
    .replace(/-instruct|-it|-instant/gi, "")
    .replaceAll("-", " ");
  return compact.length > 34 ? `${compact.slice(0, 31)}…` : compact;
}

export function responseMeta({ model, mode, language = "en" }) {
  const detail = mode ? ` · ${escapeHtml(modeLabel(mode, language))}` : "";
  return `<blockquote>🪐 <a href="https://t.me/IVAI_Llm_bot">@IVAI_Llm_bot</a> · ${escapeHtml(shortModelLabel(model))}${detail}</blockquote>`;
}

export function modeLabel(mode, language = "en") {
  const fa = language === "fa";
  const labels = fa
    ? { [MODES.AUTO]: "خودکار", [MODES.FAST]: "سریع", [MODES.DEEP]: "عمیق", [MODES.CODE]: "کد", [MODES.PROMPT]: "پرامپت", [MODES.GUEST]: "مهمان", [MODES.GUARD]: "Guard", [MODES.SECRETARY]: "منشی", [MODES.MANAGEMENT]: "مدیریت", [MODES.THREAD]: "Thread" }
    : { [MODES.AUTO]: "Auto", [MODES.FAST]: "Fast", [MODES.DEEP]: "Deep", [MODES.CODE]: "Code", [MODES.PROMPT]: "Prompt", [MODES.GUEST]: "Guest", [MODES.GUARD]: "Guard", [MODES.SECRETARY]: "Secretary", [MODES.MANAGEMENT]: "Management", [MODES.THREAD]: "Thread" };
  return labels[mode] || mode;
}

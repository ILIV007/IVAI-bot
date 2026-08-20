import { APP, MODES } from "./config.js";

const API = "https://api.telegram.org";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function button(text, callbackData, style) {
  return { text, callback_data: callbackData, ...(style ? { style } : {}) };
}

function providerIcon(provider) {
  return { "workers-ai": "🟣", openrouter: "🔵", groq: "🟠", google: "🟢" }[provider] || "⚪";
}

export function modeKeyboard(language = "en") {
  const fa = language === "fa";
  return {
    inline_keyboard: [
      [
        button(fa ? "🔀 خودکار" : "🔀 Auto", "mode:auto", "primary"),
        button(fa ? "⚡ سریع" : "⚡ Fast", "mode:fast"),
        button(fa ? "🧠 عمیق" : "🧠 Deep", "mode:deep")
      ],
      [
        button(fa ? "🎛 انتخاب مدل" : "🎛 Pick model", "menu:models", "success"),
        button(fa ? "📖 راهنما" : "📖 Help", "menu:help")
      ],
      [
        button(fa ? "⚙️ تنظیمات" : "⚙️ Settings", "menu:settings"),
        button(fa ? "🌐 زبان" : "🌐 Language", "menu:language")
      ]
    ]
  };
}

export function modelPickerKeyboard(models, { page = 0, selectedModel, language = "en", pageSize = 6 } = {}) {
  const safePage = Math.max(0, Math.min(page, Math.max(0, Math.ceil(models.length / pageSize) - 1)));
  const start = safePage * pageSize;
  const pageModels = models.slice(start, start + pageSize);
  const rows = [];
  for (let index = 0; index < pageModels.length; index += 2) {
    rows.push(pageModels.slice(index, index + 2).map((model, offset) => {
      const absoluteIndex = start + index + offset;
      const selected = model.id === selectedModel;
      return button(`${selected ? "✓ " : ""}${providerIcon(model.provider)} ${shortModelLabel(model.name)}`, `model:pick:${absoluteIndex}`, selected ? "success" : undefined);
    }));
  }
  const nav = [];
  if (safePage > 0) nav.push(button("◀", `model:page:${safePage - 1}`));
  nav.push(button(`${safePage + 1}/${Math.max(1, Math.ceil(models.length / pageSize))}`, "model:noop"));
  if (start + pageSize < models.length) nav.push(button("▶", `model:page:${safePage + 1}`));
  rows.push(nav);
  rows.push([
    button(language === "fa" ? "🔀 Auto" : "🔀 Auto", "model:auto", "primary"),
    button(language === "fa" ? "↻ به‌روزرسانی" : "↻ Refresh", "model:refresh"),
    button(language === "fa" ? "← منو" : "← Menu", "menu:main")
  ]);
  return { inline_keyboard: rows };
}

export function settingsKeyboard(language = "en", memoryEnabled = false) {
  const fa = language === "fa";
  return { inline_keyboard: [
    [button(memoryEnabled ? (fa ? "✓ حافظه روشن" : "✓ Memory on") : (fa ? "حافظه خاموش" : "Memory off"), "settings:memory", memoryEnabled ? "success" : undefined)],
    [button(fa ? "↺ بازنشانی تنظیمات" : "↺ Reset settings", "settings:reset", "danger")],
    [button(fa ? "← منو" : "← Menu", "menu:main")]
  ] };
}

export function extendedModeKeyboard(language = "en") {
  return modeKeyboard(language);
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

export function thinkingText(language = "en", frame = 0) {
  const dots = [".", "..", "..."][frame % 3];
  return language === "fa" ? `<i>IVAI در حال فکر کردن${dots}</i>` : `<i>IVAI is thinking${dots}</i>`;
}

export function startThinkingAnimation(env, { chatId, messageId, language = "en", intervalMs = 900 }) {
  let stopped = false;
  let frame = 1;
  let timer;
  let wake;
  const task = (async () => {
    while (!stopped) {
      await new Promise((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, intervalMs);
      });
      timer = undefined;
      if (stopped) break;
      await Promise.all([
        editMessage(env, { chatId, messageId, text: thinkingText(language, frame) }).catch(() => {}),
        sendTyping(env, chatId).catch(() => {})
      ]);
      frame += 1;
    }
  })();
  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      wake?.();
      await task;
    }
  };
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
    return "<b>🪐 IVAI</b>\nدستیار AI رایگان و کم‌مصرف شما\n\nیک پیام بفرستید تا چت را شروع کنیم. <b>Auto</b> بهترین مسیر رایگان را انتخاب می‌کند؛ برای کنترل بیشتر، یک مدل رایگان از picker انتخاب کنید.\n\n<b>شروع سریع:</b> پیام خود را بنویسید، یک حالت انتخاب کنید یا <code>/help</code> را بزنید.";
  }
  return "<b>🪐 IVAI</b>\nYour low-cost, free AI assistant\n\nSend any message to begin. <b>Auto</b> chooses the best available free route; use the model picker when you want a preferred model.\n\n<b>Quick start:</b> write your prompt, pick one of three modes, or use <code>/help</code>.";
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
  return `<blockquote>🪐 <a href="https://t.me/IVAI_Llm_bot">IVAI</a> · ${escapeHtml(shortModelLabel(model))}${detail}</blockquote>`;
}

export function modeLabel(mode, language = "en") {
  const fa = language === "fa";
  const labels = fa
    ? { [MODES.AUTO]: "خودکار", [MODES.FAST]: "سریع", [MODES.DEEP]: "عمیق", [MODES.CODE]: "کد", [MODES.PROMPT]: "پرامپت", [MODES.GUEST]: "مهمان", [MODES.GUARD]: "Guard", [MODES.SECRETARY]: "منشی", [MODES.MANAGEMENT]: "مدیریت", [MODES.THREAD]: "Thread" }
    : { [MODES.AUTO]: "Auto", [MODES.FAST]: "Fast", [MODES.DEEP]: "Deep", [MODES.CODE]: "Code", [MODES.PROMPT]: "Prompt", [MODES.GUEST]: "Guest", [MODES.GUARD]: "Guard", [MODES.SECRETARY]: "Secretary", [MODES.MANAGEMENT]: "Management", [MODES.THREAD]: "Thread" };
  return labels[mode] || mode;
}

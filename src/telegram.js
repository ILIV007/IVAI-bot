import { APP, getLanguageOption, LANGUAGE_OPTIONS, MODES } from "./config.js";

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

export function modeKeyboard(language = "en", { includeTerminal = false } = {}) {
  const fa = language === "fa";
  const rows = [
    [
      button(fa ? "🔀 خودکار" : "🔀 Auto", "mode:auto", "primary"),
      button(fa ? "⚡ سریع" : "⚡ Fast", "mode:fast", "success"),
      button(fa ? "🧠 عمیق" : "🧠 Deep", "mode:deep", "primary")
    ],
    [
      button(fa ? "🎛 انتخاب مدل" : "🎛 Pick model", "menu:models", "success"),
      button(fa ? "🌐 زبان" : "🌐 Language", "menu:language", "primary")
    ],
    [
      button(fa ? "📖 راهنما" : "📖 Help", "menu:help", "primary"),
      button(fa ? "⚙️ تنظیمات" : "⚙️ Settings", "menu:settings")
    ]
  ];
  if (includeTerminal) rows.splice(2, 0, terminalKeyboard(language).inline_keyboard[0]);
  return { inline_keyboard: rows };
}

export function startKeyboard(language = "en", { includeTerminal = false } = {}) {
  const fa = language === "fa";
  const rows = [];
  if (includeTerminal) rows.push(terminalKeyboard(language).inline_keyboard[0]);
  rows.push([
    button(fa ? "🎛 بازکردن کنترل‌ها" : "🎛 Open controls", "menu:main", "primary"),
    button(fa ? "📖 راهنمای شروع" : "📖 Getting started", "menu:help", "success")
  ]);
  return { inline_keyboard: rows };
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

export function languageKeyboard(selectedCode = "en", page = 0, pageSize = 6) {
  const maxPage = Math.max(0, Math.ceil(LANGUAGE_OPTIONS.length / pageSize) - 1);
  const safePage = Math.max(0, Math.min(page, maxPage));
  const start = safePage * pageSize;
  const options = LANGUAGE_OPTIONS.slice(start, start + pageSize);
  const rows = [];
  for (let index = 0; index < options.length; index += 2) {
    rows.push(options.slice(index, index + 2).map((option) => button(
      `${option.code === selectedCode ? "✓ " : ""}${option.native}`,
      `lang:set:${option.code}`,
      option.code === selectedCode ? "success" : undefined
    )));
  }
  const nav = [];
  if (safePage > 0) nav.push(button("◀", `lang:page:${safePage - 1}`));
  nav.push(button(`${safePage + 1}/${maxPage + 1}`, "lang:noop"));
  if (safePage < maxPage) nav.push(button("▶", `lang:page:${safePage + 1}`));
  rows.push(nav);
  rows.push([button("← Menu", "menu:main")]);
  return { inline_keyboard: rows };
}

export function languageMenuText(language = "en") {
  const selected = getLanguageOption(language);
  return language === "fa" ? `<b>🌐 زبان</b>\n\nزبان فعلی: <b>${escapeHtml(selected.native)}</b>` : `<b>🌐 Language</b>\n\nCurrent language: <b>${escapeHtml(selected.native)}</b>`;
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

export function terminalKeyboard(language = "en") {
  const label = language === "fa" ? "⌘ بازکردن IVAI Terminal" : language === "ar" ? "⌘ افتح IVAI Terminal" : "⌘ Open IVAI Terminal";
  return { inline_keyboard: [[{ text: label, web_app: { url: APP.terminalAppUrl }, style: "success" }]] };
}

export function requiredMembershipText(language = "en", { checkFailed = false } = {}) {
  const channel = `@${APP.requiredChannelUsername}`;
  if (language === "fa") {
    const detail = checkFailed ? "بررسی عضویت موقتاً در دسترس نبود. پس از عضویت، چند لحظه بعد دوباره بررسی کنید." : "برای استفاده از IVAI ابتدا باید عضو کانال شوید.";
    return `<b>🔒 عضویت در ${channel} لازم است</b>\n\n${detail}\n\n۱) روی «عضویت در کانال» بزنید\n۲) عضو ${channel} شوید\n۳) به اینجا برگردید و «بررسی عضویت» را بزنید`;
  }
  if (language === "ar") {
    const detail = checkFailed ? "تعذر التحقق من العضوية مؤقتًا. بعد الانضمام، انتظر لحظة ثم تحقق مرة أخرى." : "يجب الانضمام إلى القناة قبل استخدام IVAI.";
    return `<b>🔒 Membership in ${channel} is required</b>\n\n${detail}\n\n1) Join ${channel}\n2) Return here\n3) Tap Check membership`;
  }
  const detail = checkFailed ? "Membership could not be verified temporarily. After joining, wait a moment and check again." : "You must join the channel before using IVAI.";
  return `<b>🔒 Membership in ${channel} is required</b>\n\n${detail}\n\n1) Join ${channel}\n2) Return here\n3) Tap Check membership`;
}

export function requiredMembershipKeyboard(language = "en") {
  const join = language === "fa" ? "↗ عضویت در کانال" : language === "ar" ? "↗ انضم إلى القناة" : "↗ Join channel";
  const check = language === "fa" ? "✓ بررسی عضویت" : language === "ar" ? "✓ تحقق من العضوية" : "✓ Check membership";
  return { inline_keyboard: [[
    { text: join, url: APP.requiredChannelUrl, style: "success" },
    button(check, "membership:check", "primary")
  ]] };
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

export async function sendTyping(env, chatId, { threadId, businessConnectionId, directMessagesTopicId } = {}) {
  return telegram(env, "sendChatAction", {
    chat_id: chatId,
    action: "typing",
    message_thread_id: threadId || undefined,
    business_connection_id: businessConnectionId || undefined,
    direct_messages_topic_id: directMessagesTopicId || undefined
  });
}

export function thinkingText(language = "en", frame = 0) {
  const dots = [".", "..", "..."][frame % 3];
  return language === "fa" ? `<i>IVAI در حال فکر کردن${dots}</i>` : `<i>IVAI is thinking${dots}</i>`;
}

export function startThinkingAnimation(env, { chatId, messageId, language = "en", intervalMs = 900, threadId, businessConnectionId, directMessagesTopicId }) {
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
        editMessage(env, { chatId, messageId, text: thinkingText(language, frame), businessConnectionId }).catch(() => {}),
        sendTyping(env, chatId, { threadId, businessConnectionId, directMessagesTopicId }).catch(() => {})
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

export async function sendRichMessage(env, { chatId, html, replyTo, keyboard, threadId, businessConnectionId, directMessagesTopicId, silent = false, rtl = false }) {
  return telegram(env, "sendRichMessage", {
    chat_id: chatId,
    business_connection_id: businessConnectionId || undefined,
    message_thread_id: threadId || undefined,
    direct_messages_topic_id: directMessagesTopicId || undefined,
    rich_message: { html, is_rtl: rtl || undefined, skip_entity_detection: false },
    disable_notification: silent || undefined,
    reply_parameters: replyTo ? { message_id: replyTo } : undefined,
    reply_markup: keyboard
  });
}

export async function sendRichMessageDraft(env, { chatId, draftId, html, threadId, rtl = false }) {
  return telegram(env, "sendRichMessageDraft", {
    chat_id: chatId,
    message_thread_id: threadId || undefined,
    draft_id: draftId,
    rich_message: { html, is_rtl: rtl || undefined, skip_entity_detection: false }
  });
}

export async function sendMessage(env, { chatId, text, replyTo, keyboard, disablePreview = true, parseMode = "HTML", threadId, businessConnectionId, directMessagesTopicId, receiverUserId, callbackQueryId, silent = false }) {
  const parts = splitText(text, APP.maxTelegramText);
  let finalMessage;
  for (let index = 0; index < parts.length; index += 1) {
    finalMessage = await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: parts[index],
      parse_mode: parseMode || undefined,
      disable_web_page_preview: disablePreview,
      message_thread_id: threadId || undefined,
      business_connection_id: businessConnectionId || undefined,
      direct_messages_topic_id: directMessagesTopicId || undefined,
      receiver_user_id: receiverUserId || undefined,
      callback_query_id: callbackQueryId || undefined,
      disable_notification: silent || undefined,
      reply_parameters: index === 0 && replyTo ? { message_id: replyTo } : undefined,
      reply_markup: index === parts.length - 1 ? keyboard : undefined
    });
  }
  return finalMessage;
}

export async function editMessage(env, { chatId, messageId, text, keyboard, businessConnectionId }) {
  return telegram(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: text.slice(0, APP.maxTelegramText),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    business_connection_id: businessConnectionId || undefined,
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
    return "<b>🪐 به IVAI خوش آمدید</b>\nدستیار AI رایگان، کم‌مصرف و English-first شما\n\nیک پیام بفرستید تا گفت‌وگو شروع شود. <b>Auto</b> بهترین مسیر رایگان را انتخاب می‌کند و در خطا فقط fallback رایگان فعال می‌شود.\n\n<b>شروع سریع</b>\n۱) پیام خود را بنویسید\n۲) برای گفت‌وگوی حرفه‌ای، <b>IVAI Terminal</b> را باز کنید\n۳) برای انتخاب mode و مدل، «Open controls» را بزنید.";
  }
  return "<b>🪐 Welcome to IVAI</b>\nYour English-first, free and low-consumption AI assistant\n\nSend a message to begin. <b>Auto</b> chooses the best free route and falls back only to another free provider when needed.\n\n<b>Quick start</b>\n1) Write your prompt\n2) Open <b>IVAI Terminal</b> for a focused chat workspace\n3) Use “Open controls” to choose a mode or model.";
}

export function menuText(language = "en") {
  if (language === "fa") return "<b>🎛 کنترل‌های IVAI</b>\n\nحالت پاسخ، مدل انتخابی، زبان و حافظه را از اینجا مدیریت کنید.\n\n<b>راهنمای رنگ‌ها:</b> آبی = مسیر اصلی، سبز = اقدام سریع یا انتخاب، قرمز = حذف یا بازنشانی.";
  return "<b>🎛 IVAI controls</b>\n\nManage response mode, preferred model, language and memory from one place.\n\n<b>Color guide:</b> blue = primary route, green = quick action or active choice, red = reset or cancellation.";
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

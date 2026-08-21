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

export function providerIcon(provider) {
  return { "workers-ai": "🟣", openrouter: "🔵", groq: "🟠", google: "🟢" }[provider] || "⚪";
}

export function providerLabel(provider, language = "en") {
  const labels = {
    "workers-ai": { en: "Cloudflare Workers AI", fa: "Cloudflare Workers AI", ar: "Cloudflare Workers AI" },
    openrouter: { en: "OpenRouter Free", fa: "OpenRouter Free", ar: "OpenRouter Free" },
    groq: { en: "Groq", fa: "Groq", ar: "Groq" },
    google: { en: "Google Gemini", fa: "Google Gemini", ar: "Google Gemini" }
  };
  return labels[provider]?.[language] || labels[provider]?.en || "Unknown provider";
}

function modelScope(scope = "all") {
  return ["all", "workers-ai", "openrouter", "groq", "google", "fast", "deep", "code"].includes(scope) ? scope : "all";
}

function modelMatchesScope(model, scope) {
  const selected = modelScope(scope);
  return selected === "all" || model.provider === selected || model.category === selected;
}

function categoryIcon(category) {
  return { fast: "⚡", deep: "🧠", code: "⌘" }[category] || "✦";
}

export function modelCategoryLabel(category, language = "en") {
  const labels = {
    fast: { en: "Fast", fa: "سریع", ar: "سريع" },
    deep: { en: "Deep", fa: "عمیق", ar: "عميق" },
    code: { en: "Code", fa: "کد", ar: "برمجة" }
  };
  return labels[category]?.[language] || labels[category]?.en || "General";
}

function modelUseCase(category, language = "en") {
  const labels = {
    fast: { en: "quick chat and drafting", fa: "گفتگوی سریع و نگارش", ar: "الدردشة والكتابة السريعة" },
    deep: { en: "analysis and reasoning", fa: "تحلیل و استدلال", ar: "التحليل والاستدلال" },
    code: { en: "programming and debugging", fa: "برنامه‌نویسی و دیباگ", ar: "البرمجة وتصحيح الأخطاء" }
  };
  return labels[category]?.[language] || labels[category]?.en || "general work";
}

export function modeKeyboard(language = "en", { includeTerminal = false } = {}) {
  const fa = language === "fa";
  const ar = language === "ar";
  const rows = [
    [button(fa ? "🔀 خودکار" : ar ? "🔀 تلقائي" : "🔀 Auto", "mode:auto", "primary")],
    [
      button(fa ? "⚡ سریع" : ar ? "⚡ سريع" : "⚡ Fast", "mode:fast", "primary"),
      button(fa ? "🧠 عمیق" : ar ? "🧠 عميق" : "🧠 Deep", "mode:deep", "primary"),
      button(fa ? "⌘ کد" : ar ? "⌘ برمجة" : "⌘ Code", "mode:code", "primary")
    ]
  ];
  if (includeTerminal) rows.push(terminalKeyboard(language).inline_keyboard[0]);
  rows.push(
    [button(fa ? "🎛 انتخاب مدل" : ar ? "🎛 اختر النموذج" : "🎛 Pick model", "menu:models", "danger")],
    [
      button(fa ? "📖 راهنما" : ar ? "📖 مساعدة" : "📖 Help", "menu:help"),
      button(fa ? "⚙️ تنظیمات" : ar ? "⚙️ الإعدادات" : "⚙️ Settings", "menu:settings"),
      button(fa ? "🌐 زبان" : ar ? "🌐 اللغة" : "🌐 Language", "menu:language")
    ]
  );
  return { inline_keyboard: rows };
}

export function startKeyboard(language = "en", { includeTerminal = false } = {}) {
  const fa = language === "fa";
  const ar = language === "ar";
  const terminalLabel = fa ? "⌘ سایت IVAI" : ar ? "⌘ موقع IVAI" : "⌘ IVAI Terminal";
  const terminal = includeTerminal
    ? { text: terminalLabel, web_app: { url: APP.terminalAppUrl }, style: "success" }
    : { text: terminalLabel, url: APP.terminalAppUrl, style: "success" };
  return { inline_keyboard: [[
    button(fa ? "📋 منو" : ar ? "📋 القائمة" : "📋 Menu", "menu:main", "primary"),
    terminal,
    button(fa ? "🌐 زبان" : ar ? "🌐 اللغة" : "🌐 Language", "menu:language", "danger")
  ]] };
}

export function modelPickerKeyboard(models, { page = 0, selectedModel, language = "en", pageSize = 6, scope = "all" } = {}) {
  const activeScope = modelScope(scope);
  const scopedModels = models.filter((model) => modelMatchesScope(model, activeScope));
  const safePage = Math.max(0, Math.min(page, Math.max(0, Math.ceil(scopedModels.length / pageSize) - 1)));
  const start = safePage * pageSize;
  const pageModels = scopedModels.slice(start, start + pageSize);
  const scopedLabel = (value, label) => `${activeScope === value ? "✓ " : ""}${label}`;
  const fa = language === "fa";
  const ar = language === "ar";
  const rows = [
    [
      button(scopedLabel("workers-ai", "🟣 CF"), "model:view:workers-ai", "primary"),
      button(scopedLabel("openrouter", "🔵 OpenRouter"), "model:view:openrouter", "primary"),
      button(scopedLabel("groq", "🟠 Groq"), "model:view:groq", "primary"),
      button(scopedLabel("google", "🟢 Gemini"), "model:view:google", "primary")
    ],
    [
      button(scopedLabel("all", fa ? "◉ همه" : ar ? "◉ الكل" : "◉ All"), "model:view:all", "danger"),
      button(scopedLabel("fast", fa ? "⚡ سریع" : ar ? "⚡ سريع" : "⚡ Fast"), "model:view:fast", "danger"),
      button(scopedLabel("deep", fa ? "🧠 عمیق" : ar ? "🧠 عميق" : "🧠 Deep"), "model:view:deep", "danger"),
      button(scopedLabel("code", fa ? "⌘ کد" : ar ? "⌘ برمجة" : "⌘ Code"), "model:view:code", "danger")
    ]
  ];
  for (let index = 0; index < pageModels.length; index += 2) {
    rows.push(pageModels.slice(index, index + 2).map((model, offset) => {
      const absoluteIndex = start + index + offset;
      const selected = model.id === selectedModel;
      const label = `${selected ? "✓ " : ""}${providerIcon(model.provider)} ${shortModelLabel(model.name)} ${categoryIcon(model.category)}`;
      return button(label.slice(0, 64), `model:pick:${absoluteIndex}:${activeScope}:${safePage}`, selected ? "success" : undefined);
    }));
  }
  const nav = [];
  if (safePage > 0) nav.push(button("◀", `model:page:${activeScope}:${safePage - 1}`));
  nav.push(button(`${safePage + 1}/${Math.max(1, Math.ceil(scopedModels.length / pageSize))}`, "model:noop"));
  if (start + pageSize < scopedModels.length) nav.push(button("▶", `model:page:${activeScope}:${safePage + 1}`));
  rows.push(nav);
  rows.push([
    button(fa ? "🔀 حالت خودکار" : ar ? "🔀 تلقائي" : "🔀 Auto route", `model:auto:${activeScope}`, "primary"),
    button(fa ? "↻ تازه‌سازی" : ar ? "↻ تحديث" : "↻ Refresh", `model:refresh:${activeScope}`),
    button(fa ? "← منو" : ar ? "← القائمة" : "← Menu", "menu:main")
  ]);
  return { inline_keyboard: rows };
}

export function modelPickerText(models, { selectedModel, language = "en", scope = "all" } = {}) {
  const activeScope = modelScope(scope);
  const scopedModels = models.filter((model) => modelMatchesScope(model, activeScope));
  const selected = models.find((model) => model.id === selectedModel);
  const current = selected ? `${providerIcon(selected.provider)} <code>${escapeHtml(shortModelLabel(selected.name))}</code>` : (language === "fa" ? "🔀 <code>Auto</code>" : language === "ar" ? "🔀 <code>تلقائي</code>" : "🔀 <code>Auto</code>");
  const view = activeScope === "all" ? (language === "fa" ? "همهٔ مدل‌های رایگان" : language === "ar" ? "كل النماذج المجانية" : "all free models") : `${categoryIcon(activeScope)} ${escapeHtml(activeScope === "workers-ai" || activeScope === "openrouter" || activeScope === "groq" || activeScope === "google" ? providerLabel(activeScope, language) : modelCategoryLabel(activeScope, language))}`;
  if (language === "fa") return `<b>🎛 انتخاب مدل AI رایگان</b>\n\n<b>مدل فعال:</b> ${current}\n<b>نمایش:</b> ${view} · <code>${scopedModels.length}</code> مدل\n\nرنگ هر emoji پروایدر را مشخص می‌کند: 🟣 Cloudflare · 🔵 OpenRouter · 🟠 Groq · 🟢 Gemini\n⚡ سریع، 🧠 تحلیلی و ⌘ کدنویسی را فیلتر می‌کنند. مدل انتخابی فقط در اولویت است؛ fallback رایگان همیشه فعال می‌ماند.`;
  if (language === "ar") return `<b>🎛 اختيار نموذج AI مجاني</b>\n\n<b>النموذج النشط:</b> ${current}\n<b>العرض:</b> ${view} · <code>${scopedModels.length}</code> نموذج\n\nلون كل emoji يعرّف الموفر: 🟣 Cloudflare · 🔵 OpenRouter · 🟠 Groq · 🟢 Gemini\n⚡ للسرعة و🧠 للتحليل و⌘ للبرمجة. النموذج المختار له الأولوية فقط، ويبقى fallback المجاني نشطًا.`;
  return `<b>🎛 Free AI model picker</b>\n\n<b>Active model:</b> ${current}\n<b>Viewing:</b> ${view} · <code>${scopedModels.length}</code> models\n\nEach colored provider emoji identifies the route: 🟣 Cloudflare · 🔵 OpenRouter · 🟠 Groq · 🟢 Gemini\nUse ⚡ for quick work, 🧠 for analysis, and ⌘ for code. A selected model is preferred only; the free fallback remains active.`;
}

export function modelSelectionText(model, language = "en") {
  const name = escapeHtml(shortModelLabel(model.name || model.id));
  const provider = escapeHtml(providerLabel(model.provider, language));
  const category = escapeHtml(modelCategoryLabel(model.category, language));
  const useCase = escapeHtml(modelUseCase(model.category, language));
  const context = Number(model.contextLength) > 0 ? ` · <code>${Number(model.contextLength).toLocaleString()}</code>` : "";
  const headline = `${providerIcon(model.provider)} <b>${name}</b>`;
  if (language === "fa") return `<b>✓ مدل انتخاب شد</b>\n\n${headline}\n<b>پروایدر:</b> ${provider}\n<b>دسته:</b> <code>${category}</code> · ${useCase}${context}\n\nاین مدل در اولویت است و اگر موقتاً در دسترس نباشد، fallback رایگان به‌صورت خودکار ادامه می‌دهد.`;
  if (language === "ar") return `<b>✓ تم اختيار النموذج</b>\n\n${headline}\n<b>الموفر:</b> ${provider}\n<b>الفئة:</b> <code>${category}</code> · ${useCase}${context}\n\nيأخذ هذا النموذج الأولوية. إذا لم يكن متاحًا مؤقتًا، يستمر fallback المجاني تلقائيًا.`;
  return `<b>✓ Model selected</b>\n\n${headline}\n<b>Provider:</b> ${provider}\n<b>Best for:</b> <code>${category}</code> · ${useCase}${context}\n\nThis model is preferred. If it is temporarily unavailable, the free fallback continues automatically.`;
}

export function languageKeyboard(selectedCode = "en", page = 0, pageSize = 6) {
  const maxPage = Math.max(0, Math.ceil(LANGUAGE_OPTIONS.length / pageSize) - 1);
  const safePage = Math.max(0, Math.min(page, maxPage));
  const start = safePage * pageSize;
  const options = LANGUAGE_OPTIONS.slice(start, start + pageSize);
  const rows = [];
  for (let index = 0; index < options.length; index += 2) {
    rows.push(options.slice(index, index + 2).map((option) => button(
      `${option.code === selectedCode ? "✓ " : ""}${option.flag || "🌐"} ${option.native}`,
      `lang:set:${option.code}`,
      option.code === selectedCode ? "success" : undefined
    )));
  }
  const nav = [];
  if (safePage > 0) nav.push(button("◀", `lang:page:${safePage - 1}`));
  nav.push(button(`${safePage + 1}/${maxPage + 1}`, "lang:noop"));
  if (safePage < maxPage) nav.push(button("▶", `lang:page:${safePage + 1}`));
  rows.push(nav);
  rows.push([button(selectedCode === "fa" ? "← منو" : "← Menu", "menu:main")]);
  return { inline_keyboard: rows };
}

export function languageMenuText(language = "en") {
  const selected = getLanguageOption(language);
  const label = `${selected.flag || "🌐"} ${escapeHtml(selected.native)}`;
  return language === "fa" ? `<b>🌐 زبان</b>\n\nزبان فعلی: <b>${label}</b>` : `<b>🌐 Language</b>\n\nCurrent language: <b>${label}</b>`;
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

const TERMINAL_MENU_BUTTON_KEY = "runtime:terminal-menu-button:v1";

// Telegram exposes a persistent button beside the composer only after this Bot API setting.
// The KV marker avoids spending an additional Bot API request on every private command.
export async function ensureTerminalMenuButton(env) {
  try {
    if (await env.IVAI_KV?.get(TERMINAL_MENU_BUTTON_KEY)) return true;
    await telegram(env, "setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "IVAI",
        web_app: { url: APP.terminalAppUrl }
      }
    });
    await env.IVAI_KV?.put(TERMINAL_MENU_BUTTON_KEY, "configured", { expirationTtl: 24 * 60 * 60 });
    return true;
  } catch (error) {
    console.warn(JSON.stringify({ event: "terminal_menu_button_failure", error: String(error?.message || "unknown") }));
    return false;
  }
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

export async function answerCallback(env, callbackQueryId, text = "", { showAlert = false } = {}) {
  return telegram(env, "answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: showAlert });
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
    return "<b>🪐 IVAI</b> — دستیار AI رایگان برای گفتگو، تحلیل، نوشتن و کد.\n\n• متن، عکس و voice\n• پاسخ‌های Auto، Fast، Deep و Code\n• انتخاب مدل، حافظهٔ اختیاری و IVAI Terminal\n• Guard و یادآوری‌های رایگان";
  }
  if (language === "ar") {
    return "<b>🪐 IVAI</b> — مساعد AI مجاني للدردشة والتحليل والكتابة والبرمجة.\n\n• رسائل نصية وصور وصوت\n• أوضاع Auto وFast وDeep وCode\n• اختيار النموذج والذاكرة الاختيارية وIVAI Terminal\n• فحوص Guard وتذكيرات مجانية";
  }
  return "<b>🪐 IVAI</b> — a free AI assistant for chat, analysis, writing and code.\n\n• Text, photo and voice prompts\n• Auto, Fast, Deep and Code replies\n• Model picker, optional memory and IVAI Terminal\n• Guard checks and free reminders";
}

export function menuText(language = "en", settings = {}) {
  const mode = escapeHtml(modeLabel(settings.mode || MODES.AUTO, language));
  const model = escapeHtml(settings.selectedModel ? shortModelLabel(settings.selectedModel) : "Auto");
  const memory = settings.memoryEnabled ? (language === "fa" ? "روشن" : language === "ar" ? "مفعّلة" : "On") : (language === "fa" ? "خاموش" : language === "ar" ? "متوقفة" : "Off");
  if (language === "fa") return `<b>🎛 منوی IVAI</b>\n\n<b>وضعیت شما</b>\n<b>حالت پاسخ:</b> <code>${mode}</code>\n<b>مدل:</b> <code>${model}</code>\n<b>حافظه:</b> <code>${memory}</code>\n\n<b>راهنمای کنترل‌ها</b>\n• <b>Auto</b> مسیر رایگان مناسب را انتخاب می‌کند.\n• <b>Fast</b> برای پاسخ سریع، <b>Deep</b> برای تحلیل دقیق و <b>Code</b> برای برنامه‌نویسی است.\n• <b>IVAI Terminal</b> فضای گفتگوی سبک درون Telegram است.\n• <b>Pick model</b> یک مدل رایگان را در اولویت می‌گذارد؛ fallback رایگان فعال می‌ماند.\n• <b>Settings</b> حافظه را مدیریت می‌کند و <b>Language</b> زبان پاسخ‌ها و رابط را تغییر می‌دهد.\n\n<code>/new</code> گفتگوی تازه‌ای را شروع می‌کند و فقط context همین گفتگو را پاک می‌کند؛ زبان، مدل، حالت پاسخ و تنظیم حافظه شما حفظ می‌شوند.\n\nیک بخش را انتخاب کنید.`;
  if (language === "ar") return `<b>🎛 قائمة IVAI</b>\n\n<b>حالتك</b>\n<b>وضع الرد:</b> <code>${mode}</code>\n<b>النموذج:</b> <code>${model}</code>\n<b>الذاكرة:</b> <code>${memory}</code>\n\n<b>دليل التحكم</b>\n• <b>Auto</b> يختار المسار المجاني المناسب.\n• <b>Fast</b> للرد السريع، و<b>Deep</b> للتحليل، و<b>Code</b> للبرمجة.\n• <b>IVAI Terminal</b> مساحة دردشة خفيفة داخل Telegram.\n• <b>Pick model</b> يعطي الأولوية لنموذج مجاني مع استمرار fallback المجاني.\n• <b>Settings</b> لإدارة الذاكرة و<b>Language</b> لتغيير لغة الواجهة والردود.\n\n<code>/new</code> يبدأ محادثة جديدة ويمسح سياق هذه المحادثة فقط، مع الاحتفاظ باللغة والنموذج ووضع الرد وإعداد الذاكرة.\n\nاختر أحد الأقسام.`;
  return `<b>🎛 IVAI menu</b>\n\n<b>Your status</b>\n<b>Response mode:</b> <code>${mode}</code>\n<b>Model:</b> <code>${model}</code>\n<b>Memory:</b> <code>${memory}</code>\n\n<b>Control guide</b>\n• <b>Auto</b> chooses the suitable free route.\n• <b>Fast</b> is for speed, <b>Deep</b> for deeper analysis, and <b>Code</b> for programming work.\n• <b>IVAI Terminal</b> is the lightweight chat workspace inside Telegram.\n• <b>Pick model</b> prioritizes one free model while the free fallback remains active.\n• <b>Settings</b> manages memory, while <b>Language</b> changes reply and interface language.\n\n<code>/new</code> starts a fresh chat and clears only this conversation’s context; your language, model, response mode and memory setting stay unchanged.\n\nChoose a section to continue.`;
}

export function shortModelLabel(model = "") {
  const value = String(model || "").toLowerCase();
  if (value.includes("whisper")) return "Whisper";
  if (value.includes("llama-guard")) return "Llama Guard";
  if (value.includes("llama-4-scout")) return "Llama 4 Scout";
  if (value.includes("glm-4.7-flash")) return "GLM 4.7 Flash";
  if (value.includes("gemma-4")) return "Gemma 4";
  if (value.includes("gpt-oss-120b")) return "GPT-OSS 120B";
  if (value.includes("gpt-oss-20b")) return "GPT-OSS 20B";
  if (value.includes("granite-4.0-h-micro")) return "Granite 4 Micro";
  if (value.includes("llama-4-scout")) return "Llama 4 Scout";
  if (value.includes("llama-3.2-3b")) return "Llama 3.2 3B";
  if (value.includes("llama-3.2-1b")) return "Llama 3.2 1B";
  if (value.includes("llama-3.1-8b")) return "Llama 3.1 8B";
  if (value.includes("qwen3-30b")) return "Qwen3 30B";
  if (value.includes("gemini-3.7-flash")) return "Gemini 3.7 Flash";
  if (value.includes("gemini-3.6-flash")) return "Gemini 3.6 Flash";
  if (value.includes("gemini-3.5-flash-lite")) return "Gemini 3.5 Flash Lite";
  if (value.includes("gemini-3.5-flash")) return "Gemini 3.5 Flash";
  if (value.includes("gemini-3.1-flash-lite")) return "Gemini 3.1 Flash Lite";
  if (value.includes("gemini-2.5-flash-lite")) return "Gemini 2.5 Flash Lite";
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

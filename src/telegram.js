import { APP, BYOK_PRESETS, getLanguageOption, LANGUAGE_OPTIONS, MODES } from "./config.js";

const API = "https://api.telegram.org";
// A stuck Telegram API call must not hang the handler either.
const TELEGRAM_TIMEOUT_MS = 15_000;

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Standard sendMessage/editMessageText have no is_rtl flag. Seed every RTL
// paragraph with RLM after its opening HTML tags, without altering the user or
// model content itself. Rich Messages keep using Telegram's native is_rtl flag.
export function stabilizeRtlText(value = "") {
  return String(value).split("\n").map((line) => {
    if (!/[\u0600-\u06ff]/.test(line) || line.includes("\u200f")) return line;
    return line.replace(/^(\s*(?:<(?!\/)[^>]+>\s*)*)/, "$1\u200f");
  }).join("\n");
}

function button(text, callbackData, style) {
  return { text, callback_data: callbackData, ...(style ? { style } : {}) };
}

export function providerIcon(provider) {
  return { "workers-ai": "🟣", openrouter: "🔵", groq: "🟠", google: "🟢" }[provider] || "⚪";
}

// Use Web Crypto instead of an isolate-level PRNG. Rejection sampling keeps every
// configured sticker equally likely even when the pack size does not divide 2^32.
export function secureRandomIndex(length, fillRandomValues = crypto.getRandomValues.bind(crypto)) {
  const count = Number(length);
  if (!Number.isSafeInteger(count) || count < 1) return 0;
  const range = 0x1_0000_0000;
  const upperBound = range - (range % count);
  const value = new Uint32Array(1);
  do {
    fillRandomValues(value);
  } while (value[0] >= upperBound);
  return value[0] % count;
}

export function pickWelcomeSticker(indexSelector = secureRandomIndex) {
  const stickers = APP.welcomeStickerFileIds || [];
  if (!stickers.length) return null;
  const index = Number(indexSelector(stickers.length));
  return stickers[Number.isSafeInteger(index) && index >= 0 && index < stickers.length ? index : 0];
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

// Callback payloads must fit Telegram's 64-byte limit, but catalog order can change
// while a picker is open. A compact 64-bit deterministic token keeps each button tied
// to the displayed model ID rather than to a stale array index.
export function modelPickToken(modelId = "") {
  const value = String(modelId);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `m${first.toString(36)}${second.toString(36)}`;
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
    [button(fa ? "🎛 انتخاب مدل" : ar ? "🎛 اختر النموذج" : "🎛 Pick model", "menu:models")],
    [button(fa ? "🔑 API من" : "🔑 My API", "byok:open", "danger")],
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
  const terminalLabel = fa ? "⌘ بازکردن IVAI" : ar ? "⌘ افتح IVAI" : "⌘ Open IVAI";
  const terminal = includeTerminal
    ? { text: terminalLabel, web_app: { url: APP.terminalAppUrl }, style: "success" }
    : { text: terminalLabel, url: APP.terminalAppUrl, style: "success" };
  return { inline_keyboard: [[
    button(fa ? "📋 بازکردن منو" : ar ? "📋 افتح القائمة" : "📋 Open menu", "menu:main", "primary"),
    terminal,
    button(fa ? "🌐 تغییر زبان" : ar ? "🌐 تغيير اللغة" : "🌐 Language", "menu:language", "danger")
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
      const selected = model.id === selectedModel;
      const label = `${selected ? "✓ " : ""}${providerIcon(model.provider)} ${shortModelLabel(model.name)} ${categoryIcon(model.category)}`;
      return button(label.slice(0, 64), `model:pick:${modelPickToken(model.id)}:${activeScope}:${safePage}`, selected ? "success" : undefined);
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

export function modelRouteLabel(selectedModel, language = "en") {
  if (!selectedModel) return language === "fa" ? "خودکار" : language === "ar" ? "تلقائي" : "Auto";
  const label = shortModelLabel(selectedModel);
  return language === "fa" ? `دستی · ${label}` : language === "ar" ? `مثبّت · ${label}` : `Pinned · ${label}`;
}

export function modelPickerText(models, { selectedModel, language = "en", scope = "all" } = {}) {
  const activeScope = modelScope(scope);
  const scopedModels = models.filter((model) => modelMatchesScope(model, activeScope));
  const selected = models.find((model) => model.id === selectedModel);
  const current = selected ? `${providerIcon(selected.provider)} <code>${escapeHtml(modelRouteLabel(selected.name, language))}</code>` : `🔀 <code>${escapeHtml(modelRouteLabel(null, language))}</code>`;
  const view = activeScope === "all" ? (language === "fa" ? "همهٔ مدل‌های رایگان" : language === "ar" ? "كل النماذج المجانية" : "all free models") : `${categoryIcon(activeScope)} ${escapeHtml(activeScope === "workers-ai" || activeScope === "openrouter" || activeScope === "groq" || activeScope === "google" ? providerLabel(activeScope, language) : modelCategoryLabel(activeScope, language))}`;
  if (language === "fa") return `<b>🎛 مسیر مدل AI رایگان</b>\n\n<b>مسیر مدل:</b> ${current}\n<b>نمایش:</b> ${view} · <code>${scopedModels.length}</code> مدل\n\nهر رنگ یک پروایدر است: 🟣 Cloudflare · 🔵 OpenRouter · 🟠 Groq · 🟢 Gemini\n⚡، 🧠 و ⌘ فقط همین فهرست را فیلتر می‌کنند. انتخاب مدل فقط مسیر را ثابت می‌کند — حالت پاسخ همان می‌ماند و fallback رایگان روشن می‌ماند.`;
  if (language === "ar") return `<b>🎛 مسار نموذج AI مجاني</b>\n\n<b>مسار النموذج:</b> ${current}\n<b>العرض:</b> ${view} · <code>${scopedModels.length}</code> نموذج\n\nكل لون يعرّف موفرًا: 🟣 Cloudflare · 🔵 OpenRouter · 🟠 Groq · 🟢 Gemini\n⚡ و🧠 و⌘ مرشحات لهذه القائمة فقط. اختيار نموذج يثبّت المسار فقط — يبقى وضع الرد كما هو، ويبقى fallback المجاني نشطًا.`;
  return `<b>🎛 Free AI model route</b>\n\n<b>Model route:</b> ${current}\n<b>Viewing:</b> ${view} · <code>${scopedModels.length}</code> models\n\nEach color is a provider: 🟣 Cloudflare · 🔵 OpenRouter · 🟠 Groq · 🟢 Gemini\n⚡, 🧠, and ⌘ only filter this list. Picking a model pins the route — your response mode stays the same, and the free fallback stays on.`;
}

export function modelSelectionText(model, language = "en", mode = MODES.AUTO) {
  const name = escapeHtml(shortModelLabel(model.name || model.id));
  const provider = escapeHtml(providerLabel(model.provider, language));
  const category = escapeHtml(modelCategoryLabel(model.category, language));
  const useCase = escapeHtml(modelUseCase(model.category, language));
  const context = Number(model.contextLength) > 0 ? ` · <code>${Number(model.contextLength).toLocaleString()}</code>${language === "fa" ? " توکن" : language === "ar" ? " توكن" : " tokens"}` : "";
  const headline = `${providerIcon(model.provider)} <b>${name}</b>`;
  const responseMode = escapeHtml(modeLabel(mode, language));
  if (language === "fa") return `<b>✓ مسیر مدل ثابت شد</b>\n\n${headline}\nپروایدر: ${provider}\nبهترین کاربرد: <code>${category}</code> · ${useCase}${context}\nحالت پاسخ: <code>${responseMode}</code> (بدون تغییر)\n\nفقط مسیر مدل ثابت شد. اگر هر وقت در دسترس نبود، fallback رایگان خودکار ادامه می‌دهد.`;
  if (language === "ar") return `<b>✓ تم تثبيت مسار النموذج</b>\n\n${headline}\nالموفر: ${provider}\nالأفضل لـ: <code>${category}</code> · ${useCase}${context}\nوضع الرد: <code>${responseMode}</code> (دون تغيير)\n\nهذا الاختيار يثبّت مسار النموذج فقط. إذا لم يكن متاحًا أبدًا، يتولى fallback المجاني تلقائيًا.`;
  return `<b>✓ Model route pinned</b>\n\n${headline}\nProvider: ${provider}\nBest for: <code>${category}</code> · ${useCase}${context}\nResponse mode: <code>${responseMode}</code> (unchanged)\n\nOnly the model route is pinned. If it is ever unavailable, the free fallback takes over automatically.`;
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
  return language === "fa" ? `<b>🌐 زبان</b>\nزبان فعلی: <b>${label}</b>\nزبان را پایین انتخاب کنید — روی منوها و پاسخ‌ها اعمال می‌شود.` : `<b>🌐 Language</b>\nCurrent language: <b>${label}</b>\nPick a language below — it applies to menus and replies.`;
}

export function settingsKeyboard(language = "en", memoryEnabled = false) {
  const fa = language === "fa";
  // My API lives in the main menu since v3.9.0, not here, so there is exactly
  // one entry point to it.
  return { inline_keyboard: [
    // The button names the state it switches TO, so a redelivered callback
    // (Telegram retry, double tap) re-applies the same target instead of
    // toggling twice and looking dead.
    [button(memoryEnabled ? (fa ? "✓ حافظه روشن" : "✓ Memory on") : (fa ? "حافظه خاموش" : "Memory off"), memoryEnabled ? "settings:memory:off" : "settings:memory:on", memoryEnabled ? "success" : undefined)],
    [button(fa ? "↺ بازنشانی تنظیمات" : "↺ Reset settings", "settings:reset", "danger")],
    [button(fa ? "← منو" : "← Menu", "menu:main")]
  ] };
}

// BYOK ("My API", v3.8.0; multi-config since v3.9.0) keyboards. One job per
// screen: pick a provider, pick a model, or manage one saved config. Every
// config-scoped callback carries the config id (`byok:<action>:<configId>`),
// so the screens never depend on a single "the config".
export function byokListKeyboard(language = "en", configs = [], activeConfigId = null) {
  const fa = language === "fa";
  const rows = configs.map((config) => [button(`${config.configId === activeConfigId ? "● " : ""}${config.name || config.preset}`, `byok:config:${config.configId}`)]);
  rows.push([button(fa ? "➕ افزودن API" : "➕ Add API", "byok:presets", "primary")]);
  rows.push([button(fa ? "← منو" : "← Menu", "menu:main")]);
  return { inline_keyboard: rows };
}

export function byokPresetKeyboard(language = "en", presetIds = []) {
  const fa = language === "fa";
  const rows = [];
  for (let index = 0; index < presetIds.length; index += 2) {
    rows.push(presetIds.slice(index, index + 2).map((id) => button(BYOK_PRESETS[id]?.label || id, `byok:preset:${id}`)));
  }
  rows.push([button(fa ? "✕ لغو" : "✕ Cancel", "byok:cancel")]);
  rows.push([button(fa ? "← API من" : "← My API", "byok:list")]);
  return { inline_keyboard: rows };
}

export function byokModelKeyboard(language = "en", models = [], configId = null, customModels = [], activeModel = null) {
  const fa = language === "fa";
  const all = [...(models || []), ...(customModels || [])];
  const rows = all.map((model, index) => [button(`${model === activeModel ? "● " : ""}${model}`, `byok:model:${configId}:${index}`)]);
  rows.push([button(fa ? "➕ افزودن مدل…" : "➕ Add a model…", `byok:model:${configId}:other`)]);
  rows.push([button(fa ? "← API من" : "← My API", configId ? `byok:config:${configId}` : "byok:open")]);
  return { inline_keyboard: rows };
}

export function byokManageKeyboard(language = "en", state = "inactive", configId = null) {
  const fa = language === "fa";
  const id = configId || "";
  if (state === "saved") {
    return { inline_keyboard: [
      [button(fa ? "🧪 آزمایش اتصال" : "🧪 Test connection", `byok:test:${id}`, "primary")],
      [button(fa ? "✕ لغو" : "✕ Cancel", "byok:cancel")]
    ] };
  }
  if (state === "active") {
    return { inline_keyboard: [
      [button(fa ? "⏸ استفاده از مدل‌های IVAI" : "⏸ Use IVAI models instead", "byok:disable")],
      [
        button(fa ? "🎛 تغییر مدل" : "🎛 Change model", `byok:models:${id}`),
        button(fa ? "✏️ تغییر نام" : "✏️ Rename", `byok:rename:${id}`)
      ],
      [button(fa ? "🗑 حذف API من" : "🗑 Remove my API", `byok:remove:${id}`, "danger")],
      [button(fa ? "← API من" : "← My API", "byok:list")]
    ] };
  }
  if (state === "invalid") {
    return { inline_keyboard: [
      [button(fa ? "🔑 ورود کلید تازه" : "🔑 Enter a new key", `byok:rekey:${id}`, "primary")],
      [button(fa ? "🗑 حذف API من" : "🗑 Remove my API", `byok:remove:${id}`, "danger")],
      [button(fa ? "← API من" : "← My API", "byok:list")]
    ] };
  }
  return { inline_keyboard: [
    [button(fa ? "▶ استفاده از API من" : "▶ Use my API", `byok:enable:${id}`, "primary")],
    [
      button(fa ? "🎛 تغییر مدل" : "🎛 Change model", `byok:models:${id}`),
      button(fa ? "✏️ تغییر نام" : "✏️ Rename", `byok:rename:${id}`)
    ],
    [button(fa ? "🗑 حذف API من" : "🗑 Remove my API", `byok:remove:${id}`, "danger")],
    [button(fa ? "← API من" : "← My API", "byok:list")]
  ] };
}

export function byokTestFailedKeyboard(language = "en", configId = null) {
  const fa = language === "fa";
  const id = configId || "";
  return { inline_keyboard: [
    [button(fa ? "🧪 آزمایش دوباره" : "🧪 Retry test", `byok:test:${id}`, "primary")],
    [button(fa ? "🔑 تغییر کلید" : "🔑 Change key", `byok:rekey:${id}`)],
    [button(fa ? "← API من" : "← My API", id ? `byok:config:${id}` : "byok:open")]
  ] };
}

export function byokCancelKeyboard(language = "en") {
  const fa = language === "fa";
  return { inline_keyboard: [[button(fa ? "✕ لغو" : "✕ Cancel", "byok:cancel")]] };
}

export function byokRemoveConfirmKeyboard(language = "en", configId = null) {
  const fa = language === "fa";
  const id = configId || "";
  return { inline_keyboard: [
    [button(fa ? "✓ بله، حذف کن" : "✓ Yes, remove it", `byok:remove:yes:${id}`, "danger")],
    [button(fa ? "← بازگشت" : "← Back", id ? `byok:config:${id}` : "byok:open")]
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
    if (checkFailed) return `<b>🔒 برای استفاده از IVAI عضو ${channel} شوید</b>\n\nتلگرام فعلاً نتوانست عضویت شما را بررسی کند. عضو کانال شوید، کمی صبر کنید و دوباره «بررسی عضویت» را بزنید.`;
    return `<b>🔒 برای استفاده از IVAI عضو ${channel} شوید</b>\n\nIVAI برای اعضای کانال رایگان است — فقط یک لحظه طول می‌کشد:\n۱) «عضویت در کانال» را بزنید\n۲) عضو ${channel} شوید\n۳) برگردید و «بررسی عضویت» را بزنید`;
  }
  if (language === "ar") {
    if (checkFailed) return `<b>🔒 انضم إلى ${channel} لاستخدام IVAI</b>\n\nتعذّر على Telegram التحقق من عضويتك الآن. انضم إلى القناة، وانتظر لحظة، ثم اضغط «التحقق من العضوية» مرة أخرى.`;
    return `<b>🔒 انضم إلى ${channel} لاستخدام IVAI</b>\n\nIVAI مجاني لأعضاء القناة — يستغرق لحظة فقط:\n1) اضغط «الانضمام إلى القناة»\n2) انضم إلى ${channel}\n3) عُد واضغط «التحقق من العضوية»`;
  }
  if (checkFailed) return `<b>🔒 Join ${channel} to use IVAI</b>\n\nTelegram couldn't check your membership just now. Join the channel, wait a moment, then tap «Check membership» again.`;
  return `<b>🔒 Join ${channel} to use IVAI</b>\n\nIVAI is free for channel members — it only takes a moment:\n1) Tap «Join channel»\n2) Join ${channel}\n3) Come back and tap «Check membership»`;
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) throw new Error(`Telegram ${method} failed: ${json.description || response.status}`);
  return json.result;
}

export async function deleteMessage(env, { chatId, messageId }) {
  return telegram(env, "deleteMessage", { chat_id: chatId, message_id: messageId });
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
  return language === "fa" ? `<i>⚡ IVAI در حال فکر کردن${dots}</i>` : `<i>⚡ IVAI is thinking${dots}</i>`;
}

export function startThinkingAnimation(env, { chatId, messageId, language = "en", intervalMs = 2000, threadId, businessConnectionId, directMessagesTopicId }) {
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
      // The animated progress message is itself the indicator (v3.7.5): a 2s
      // edit cadence is plenty, and the old per-tick typing call doubled the
      // Telegram traffic for no visible gain.
      await editMessage(env, { chatId, messageId, text: thinkingText(language, frame), businessConnectionId }).catch(() => {});
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

// Telegram chat actions expire after ~5 seconds, so a single sendTyping is
// invisible on slow routes. This refresher re-sends the action until stop(),
// mirroring startThinkingAnimation's start/stop contract; it sends no messages.
export function startTypingRefresher(env, { chatId, intervalMs = 4000, threadId, businessConnectionId, directMessagesTopicId }) {
  let stopped = false;
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
      await sendTyping(env, chatId, { threadId, businessConnectionId, directMessagesTopicId }).catch(() => {});
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

export async function sendSticker(env, { chatId, sticker, replyTo, threadId, businessConnectionId, directMessagesTopicId, silent = false }) {
  if (!sticker) return null;
  return telegram(env, "sendSticker", {
    chat_id: chatId,
    sticker,
    business_connection_id: businessConnectionId || undefined,
    message_thread_id: threadId || undefined,
    direct_messages_topic_id: directMessagesTopicId || undefined,
    disable_notification: silent || undefined,
    reply_parameters: replyTo ? { message_id: replyTo } : undefined
  });
}

export async function sendMessage(env, { chatId, text, replyTo, keyboard, disablePreview = true, parseMode = "HTML", threadId, businessConnectionId, directMessagesTopicId, receiverUserId, callbackQueryId, silent = false }) {
  const parts = splitText(text, APP.maxTelegramText);
  let finalMessage;
  for (let index = 0; index < parts.length; index += 1) {
    finalMessage = await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: stabilizeRtlText(parts[index]),
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
  try {
    return await telegram(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: stabilizeRtlText(text.slice(0, APP.maxTelegramText)),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      business_connection_id: businessConnectionId || undefined,
      reply_markup: keyboard
    });
  } catch (error) {
    // Telegram treats an unchanged edit as a 400. It is an idempotent callback no-op,
    // not an application failure, and should not cause webhook retries or error noise.
    const detail = String(error?.message || "");
    if (/message is not modified|message content and reply markup are exactly the same/i.test(detail)) {
      console.info(JSON.stringify({ event: "telegram_edit_noop" }));
      return null;
    }
    throw error;
  }
}

// Rich-message edits (Bot API 10.1, v3.11.0): there is NO editRichMessage
// method — editMessageText takes a rich_message parameter instead, mutually
// exclusive with text. Callback-edited screens use this so a Rich screen
// stays Rich after a tap; callers fall back to the plain edit on failure.
export async function editRichMessage(env, { chatId, messageId, html, keyboard, rtl = false, businessConnectionId }) {
  try {
    return await telegram(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      rich_message: { html, is_rtl: rtl || undefined, skip_entity_detection: false },
      disable_web_page_preview: true,
      business_connection_id: businessConnectionId || undefined,
      reply_markup: keyboard
    });
  } catch (error) {
    const detail = String(error?.message || "");
    if (/message is not modified|message content and reply markup are exactly the same/i.test(detail)) {
      console.info(JSON.stringify({ event: "telegram_edit_noop" }));
      return null;
    }
    throw error;
  }
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
    return "<b>🪐 IVAI — دستیار AI رایگان شما</b>\nگفتگو، نوشتن، تحلیل و کد — رایگان، خصوصی و به زبان شما.\n\n• متن، عکس و voice\n• پاسخ‌های Auto، Fast، Deep و Code\n• مدل‌های خودتان، حافظه و IVAI Terminal\nبرای شروع، هر سؤالی بفرستید.";
  }
  if (language === "ar") {
    return "<b>🪐 IVAI — مساعدك المجاني للذكاء الاصطناعي</b>\nالدردشة والكتابة والتحليل والبرمجة — مجاني، خاص، وبلغتك.\n\n• نصوص وصور وصوت\n• أوضاع Auto وFast وDeep وCode\n• نماذجك الخاصة وذاكرتك وIVAI Terminal\nأرسل أي سؤال للبدء.";
  }
  return "<b>🪐 IVAI — your free AI assistant</b>\nChat, write, analyze, and code — free, private, in your language.\n\n• Text, photos, and voice\n• Auto, Fast, Deep, and Code replies\n• Your own models, memory, and IVAI Terminal\nSend any question to start.";
}

export function menuText(language = "en", settings = {}) {
  const mode = escapeHtml(modeLabel(settings.mode || MODES.AUTO, language));
  const model = escapeHtml(modelRouteLabel(settings.selectedModel, language));
  const memory = settings.memoryEnabled ? (language === "fa" ? "روشن" : language === "ar" ? "مفعّلة" : "On") : (language === "fa" ? "خاموش" : language === "ar" ? "متوقفة" : "Off");
  // S1 (v3.11.0): the menu always names the engine answering — IVAI models,
  // or the active My API config. settings.engine is set by the router from
  // the live active config; without it the menu still reads "IVAI models".
  const engine = escapeHtml(settings.engine || (language === "fa" ? "مدل‌های IVAI" : language === "ar" ? "نماذج IVAI" : "IVAI models"));
  if (language === "fa") return `<b>🎛 منوی IVAI</b>\n\n<b>تنظیمات شما</b>\nحالت پاسخ: <code>${mode}</code>\nمسیر مدل: <code>${model}</code>\nحافظه: <code>${memory}</code>\nموتور: <code>${engine}</code>\n\n<b>چطور کار می‌کند</b>\n• <b>Auto</b> مسیر رایگان را خودش انتخاب می‌کند.\n• <b>Fast</b> سریع است، <b>Deep</b> بیشتر فکر می‌کند و <b>Code</b> برای برنامه‌نویسی است.\n• <b>Pick model</b> فقط مدل را ثابت می‌کند — حالت پاسخ همان می‌ماند.\n• <b>My API</b> با کلید خودتان جواب می‌دهد، نه با مدل‌های IVAI.\n\nیک بخش را پایین انتخاب کنید.`;
  if (language === "ar") return `<b>🎛 قائمة IVAI</b>\n\n<b>إعداداتك</b>\nوضع الرد: <code>${mode}</code>\nمسار النموذج: <code>${model}</code>\nالذاكرة: <code>${memory}</code>\nالمحرك: <code>${engine}</code>\n\n<b>كيف يعمل</b>\n• <b>Auto</b> يختار مسارًا مجانيًا لك.\n• <b>Fast</b> سريع، و<b>Deep</b> يفكر أكثر، و<b>Code</b> للبرمجة.\n• <b>Pick model</b> يثبّت النموذج فقط — يبقى وضع الرد كما هو.\n• <b>My API</b> يجيب بمفتاحك الخاص بدل نماذج IVAI.\n\nاختر قسمًا أدناه.`;
  return `<b>🎛 IVAI menu</b>\n\n<b>Your setup</b>\nResponse mode: <code>${mode}</code>\nModel route: <code>${model}</code>\nMemory: <code>${memory}</code>\nEngine: <code>${engine}</code>\n\n<b>How it works</b>\n• <b>Auto</b> picks a free route for you.\n• <b>Fast</b> is quick, <b>Deep</b> thinks more, <b>Code</b> is for programming.\n• <b>Pick model</b> pins only the model — your response mode stays as it is.\n• <b>My API</b> answers with your own key instead of IVAI models.\n\nChoose a section below.`;
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
  if (value.includes("gemini-3.8-flash")) return "Gemini 3.8 Flash";
  if (value.includes("gemini-3.6-flash")) return "Gemini 3.6 Flash";
  if (value.includes("gemini-3.5-flash-lite")) return "Gemini 3.5 Flash Lite";
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
  // Rich messages use is_rtl for Persian and Arabic. Isolate the compact metadata
  // run so Telegram's bidi renderer does not reverse the IVAI/model/mode sequence.
  const isolate = language === "fa" || language === "ar";
  const prefix = isolate ? "\u2066" : ""; // Left-to-right isolate
  const suffix = isolate ? "\u2069" : ""; // Pop directional isolate
  return `<blockquote>${prefix}🪐 <a href="https://t.me/IVAI_Llm_bot">IVAI</a> · ${escapeHtml(shortModelLabel(model))}${detail}${suffix}</blockquote>`;
}

export function modeLabel(mode, language = "en") {
  const fa = language === "fa";
  const labels = fa
    ? { [MODES.AUTO]: "خودکار", [MODES.FAST]: "سریع", [MODES.DEEP]: "عمیق", [MODES.CODE]: "کد", [MODES.PROMPT]: "پرامپت", [MODES.GUEST]: "مهمان", [MODES.GUARD]: "Guard", [MODES.SECRETARY]: "منشی", [MODES.MANAGEMENT]: "مدیریت", [MODES.THREAD]: "Thread" }
    : { [MODES.AUTO]: "Auto", [MODES.FAST]: "Fast", [MODES.DEEP]: "Deep", [MODES.CODE]: "Code", [MODES.PROMPT]: "Prompt", [MODES.GUEST]: "Guest", [MODES.GUARD]: "Guard", [MODES.SECRETARY]: "Secretary", [MODES.MANAGEMENT]: "Management", [MODES.THREAD]: "Thread" };
  return labels[mode] || mode;
}

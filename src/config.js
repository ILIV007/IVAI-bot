export const APP = Object.freeze({
  name: "IVAI",
  version: "3.3.37",
  terminalAppUrl: "https://ivai-bot.ivai-bot.workers.dev/app",
  // Bot-owned file IDs from the IVAILlmBot pack; refresh deliberately when that pack changes.
  welcomeStickerFileIds: Object.freeze([
    "CAACAgQAAxUAAWqJaukeCtE4-rdUxTeaXC0wNPmBAAJUMwAC3q5RUGJDQwt5y8nYPQQ",
    "CAACAgQAAxUAAWqJaumox5uu1QXNtRck8ya8rymFAAJlHgAC-TlIUBaH3YkJc82LPQQ"
  ]),
  requiredChannelId: -1003162460662,
  requiredChannelUsername: "ILIVIR3",
  requiredChannelUrl: "https://t.me/ILIVIR3",
  timezone: "UTC",
  maxTelegramText: 4096,
  maxInlineResults: 10,
  // Session memory keeps three complete user/assistant turns, expires after 30 minutes of inactivity, and can never outlive two hours.
  maxContextMessages: 6,
  conversationSessionIdleSeconds: 30 * 60,
  conversationSessionAbsoluteSeconds: 2 * 60 * 60,
  guestMemoryTtlSeconds: 60 * 60,
  updateDedupeTtlSeconds: 10 * 60,
  cacheTtlSeconds: 15 * 60,
  userHourlyTextLimit: 24,
  userDailyMediaLimit: 4,
  // Cloudflare Workers Free grants 10,000 Neurons/day. Requests reserve a conservative estimate from this 8,000-Neuron budget, preserving a 20% buffer for metering variance.
  systemDailyWorkersAiBudget: 8000,
  maxInputCharacters: 12000,
  maxOutputTokens: {
    fast: 700,
    auto: 900,
    deep: 1600,
    code: 1800,
    prompt: 1000,
    guard: 300,
    secretary: 900,
    management: 900,
    thread: 900
  }
});

export const MODES = Object.freeze({
  AUTO: "auto",
  FAST: "fast",
  DEEP: "deep",
  CODE: "code",
  PROMPT: "prompt",
  GUEST: "guest",
  GUARD: "guard",
  SECRETARY: "secretary",
  MANAGEMENT: "management",
  THREAD: "thread",
  INLINE: "inline"
});

export const USER_FACING_MODES = new Set([
  MODES.AUTO,
  MODES.FAST,
  MODES.DEEP,
  MODES.CODE,
  MODES.PROMPT,
  MODES.GUEST,
  MODES.GUARD,
  MODES.SECRETARY,
  MODES.MANAGEMENT,
  MODES.THREAD
]);

export const LANGUAGE_OPTIONS = Object.freeze([
  { code: "en", label: "English", native: "English", flag: "🇬🇧", rtl: false },
  { code: "fa", label: "Persian", native: "فارسی", flag: "🇮🇷", rtl: true },
  { code: "ar", label: "Arabic", native: "العربية", flag: "🇸🇦", rtl: true },
  { code: "es", label: "Spanish", native: "Español", flag: "🇪🇸", rtl: false },
  { code: "tr", label: "Turkish", native: "Türkçe", flag: "🇹🇷", rtl: false },
  { code: "ru", label: "Russian", native: "Русский", flag: "🇷🇺", rtl: false },
  { code: "pt-BR", label: "Portuguese (Brazil)", native: "Português", flag: "🇧🇷", rtl: false },
  { code: "id", label: "Indonesian", native: "Bahasa Indonesia", flag: "🇮🇩", rtl: false },
  { code: "hi", label: "Hindi", native: "हिन्दी", flag: "🇮🇳", rtl: false },
  { code: "fr", label: "French", native: "Français", flag: "🇫🇷", rtl: false },
  { code: "de", label: "German", native: "Deutsch", flag: "🇩🇪", rtl: false }
]);

export const SUPPORTED_LANGUAGE_CODES = new Set(LANGUAGE_OPTIONS.map((language) => language.code));

export function getLanguageOption(code = "en") {
  return LANGUAGE_OPTIONS.find((language) => language.code === code) || LANGUAGE_OPTIONS[0];
}

export const ROLE = Object.freeze({
  OWNER: "owner",
  ADMIN: "admin",
  MODERATOR: "moderator",
  USER: "user"
});

export const SECRET_NAMES = Object.freeze([
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "ADMIN_TELEGRAM_IDS",
  "OPENROUTER_API_KEY",
  "GOOGLE_API_KEY",
  "GROQ_API_KEY"
]);

// Only models confirmed for the current no-charge tier are listed here. Frontier models
// that require paid billing (for example Cloudflare GLM 5.2) are intentionally excluded.
// The static entries are conservative production fallbacks; OpenRouter's dynamic catalog is
// separately verified from zero-price metadata before it is exposed in the picker.
export const FREE_MODEL_POLICY = Object.freeze({
  workersAi: Object.freeze({
    text: Object.freeze([
      "@cf/zai-org/glm-4.7-flash",
      "@cf/google/gemma-4-26b-a4b-it",
      "@cf/openai/gpt-oss-20b",
      "@cf/openai/gpt-oss-120b",
      "@cf/ibm-granite/granite-4.0-h-micro",
      "@cf/meta/llama-3.2-1b-instruct",
      "@cf/meta/llama-3.2-3b-instruct",
      "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      "@cf/qwen/qwen3-30b-a3b-fp8"
    ]),
    // Llama 4 Scout produces a final OpenAI-compatible vision reply on the Workers AI binding.
    // Gemma 4 remains a free-tier fallback, but its reasoning-first output can exhaust a short reply budget.
    vision: Object.freeze([
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      "@cf/google/gemma-4-26b-a4b-it"
    ]),
    speech: Object.freeze([
      "@cf/openai/whisper-large-v3-turbo",
      "@cf/openai/whisper"
    ]),
    guard: Object.freeze(["@cf/meta/llama-guard-3-8b"])
  }),
  // The official free router selects only currently available zero-cost models.
  openRouter: Object.freeze(["openrouter/free"]),
  // Groq retired llama-3.1-8b-instant on 2026-08-16; these are active production models.
  groq: Object.freeze([
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "qwen/qwen3.6-27b"
  ]),
  // Text-only Gemini calls: no Search grounding, Maps, media generation, or paid-only model.
  google: Object.freeze([
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
  ])
});

export function defaultFreeModelFor(provider, mode = MODES.AUTO) {
  if (provider === "workers-ai") {
    return [MODES.DEEP, MODES.CODE].includes(mode)
      ? FREE_MODEL_POLICY.workersAi.text[1]
      : FREE_MODEL_POLICY.workersAi.text[0];
  }
  if (provider === "google") {
    if ([MODES.DEEP, MODES.CODE].includes(mode)) return FREE_MODEL_POLICY.google[0];
    if (mode === MODES.FAST) return FREE_MODEL_POLICY.google[2];
    return FREE_MODEL_POLICY.google[1];
  }
  if (provider === "groq") {
    return [MODES.DEEP, MODES.CODE].includes(mode)
      ? FREE_MODEL_POLICY.groq[1]
      : FREE_MODEL_POLICY.groq[0];
  }
  if (provider === "openrouter") return FREE_MODEL_POLICY.openRouter[0];
  return null;
}

export function modeOutputLimit(mode) {
  return APP.maxOutputTokens[mode] ?? APP.maxOutputTokens.auto;
}

export function getBrand() {
  return {
    name: APP.name,
    voice: "Precise, calm, transparent, privacy-aware, and helpful.",
    rule: "Do not claim a feature, source, or action that has not actually happened."
  };
}

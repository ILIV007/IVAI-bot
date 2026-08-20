export const APP = Object.freeze({
  name: "IVAI",
  version: "3.3.0",
  timezone: "UTC",
  maxTelegramText: 4096,
  maxInlineResults: 10,
  maxContextMessages: 6,
  guestMemoryTtlSeconds: 60 * 60,
  updateDedupeTtlSeconds: 10 * 60,
  cacheTtlSeconds: 15 * 60,
  userHourlyTextLimit: 24,
  userDailyMediaLimit: 4,
  systemDailyWorkersAiBudget: 9000,
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
  { code: "en", label: "English", native: "English", rtl: false },
  { code: "fa", label: "Persian", native: "فارسی", rtl: true },
  { code: "ar", label: "Arabic", native: "العربية", rtl: true },
  { code: "es", label: "Spanish", native: "Español", rtl: false },
  { code: "tr", label: "Turkish", native: "Türkçe", rtl: false },
  { code: "ru", label: "Russian", native: "Русский", rtl: false },
  { code: "pt-BR", label: "Portuguese (Brazil)", native: "Português", rtl: false },
  { code: "id", label: "Indonesian", native: "Bahasa Indonesia", rtl: false },
  { code: "hi", label: "Hindi", native: "हिन्दी", rtl: false },
  { code: "fr", label: "French", native: "Français", rtl: false },
  { code: "de", label: "German", native: "Deutsch", rtl: false }
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

// Only entries confirmed as usable under a free-tier policy may be added here.
// The runtime gate rejects every model not present in this allowlist.
export const FREE_MODEL_POLICY = Object.freeze({
  workersAi: {
    text: ["@cf/zai-org/glm-4.7-flash", "@cf/google/gemma-4-26b-a4b-it"],
    vision: ["@cf/meta/llama-4-scout-17b-16e-instruct"],
    speech: ["@cf/openai/whisper"],
    guard: ["@cf/meta/llama-guard-3-8b"]
  },
  openRouter: [
    "meta-llama/llama-3.2-3b-instruct:free",
    "openai/gpt-oss-20b:free"
  ],
  groq: ["llama-3.1-8b-instant"],
  google: ["gemini-2.5-flash-lite"]
});

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

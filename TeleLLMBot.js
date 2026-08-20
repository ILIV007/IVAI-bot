// ==========================================
// IVAI Bot v3.2 — Per-User Dynamic Models, Clean UI, Space Theme
// ==========================================

const CONFIG = {
  TIMEOUT: 25 * 1000,
  TYPING_INTERVAL: 1500,
  PARALLEL_TIMEOUT: 20 * 1000,
  RETRY_BASE_DELAY: 500,
  MAX_RETRIES: 2,
  CIRCUIT_THRESHOLD: 3,
  CIRCUIT_COOLDOWN: 60 * 1000,
  MEMORY_TTL: 60 * 60,
  CACHE_TTL: 2 * 60 * 60,
  MAX_CONTEXT: 5,
  MAX_LENGTH: 4096,
  MAX_TOKENS: 32000,
  REMINDER_DAYS: 15,
  AUTO_UPDATE_DAYS: 15,
  GROQ_MAX_TOKENS: 8192,
  GROQ_MAX_CONTEXT_CHARS: 12000,
  ACTIVE_TIMEOUT: 10000,
  ACTIVE_BATCH: 3,
  ACTIVE_DELAY: 1000,
  KV: {
    MODE: "mode:",
    MODEL: "model:",
    MEMORY: "mem:",
    CACHE: "cache:",
    FAILED: "failed:",
    LOGS: "logs:",
    LAST: "last:",
    STATS: "stats:",
    LAST_ACTIVE: "last_active:",
    LANG: "lang:",
    MODELS_UPDATED: "models_updated",
    MODELS_DATA: "models_data:",
    USER_MODELS: "user_models:"
  }
};

// ==========================================
// 🪐 TRANSLATIONS — FA + EN (Reduced emojis)
// ==========================================
const STRINGS = {
  fa: {
    start_title: "🪐 IVAI",
    start_welcome: "به IVAI خوش آمدید — دستیار هوشمند رایگان شما با مدل‌های OpenRouter، Groq و Google AI Studio. سوال شما را به بهترین مدل موجود ارسال می‌کنم و باکیفیت‌ترین پاسخ را انتخاب می‌کنم.\n\n✓ حالت پرامپت مستر\n✓ پاسخ‌دهی خودکار و هوشمند\n✓ پشتیبانی از فارسی و انگلیسی\n\n<blockquote>🌀@ILIVIR3</blockquote>",
    start_providers: "⚡ ارائه‌دهندگان",
    send_anything: "هر چی دوست داری بفرست!",
    mode_fast: "🟢 سریع",
    mode_deep: "🔴 عمیق",
    mode_code: "🔵 کد",
    mode_prompt: "🎯 پرامپت",
    mode_auto: "🔀 خودکار",
    mode_set: "✓ حالت:",
    lang_select: "🌍 زبان خود را انتخاب کنید",
    lang_set: "✓ زبان تنظیم شد",
    help_title: "📖 راهنمای IVAI",
    help_modes: "حالت‌های گفتگو",
    help_models: "انتخاب مدل",
    help_providers: "ارائه‌دهندگان",
    help_memory: "حافظه",
    help_tools: "ابزارها",
    help_tip: "نکته",
    memory_empty: "<i>خالی</i>",
    memory_cleared: "🗑 حافظه پاک شد",
    reset_complete: "✓ تنظیمات بازنشانی شد",
    back_auto: "✓ بازگشت به حالت خودکار",
    all_failed: "همه مدل‌ها ناموفق بودند.",
    models_failed_list: "مدل‌های ناموفق:",
    emergency_suffix: "_(⚠️ حالت اضطراری)_",
    groq_suffix: "_(🔴 پاسخ از Groq)_",
    google_suffix: "_(🟢 پاسخ از Google AI Studio)_",
    debug_title: "🔧 دیباگ v3.2",
    debug_user: "کاربر",
    debug_mode: "حالت",
    debug_requests: "درخواست‌ها",
    debug_avg_time: "میانگین",
    debug_memory: "حافظه",
    debug_models: "مدل‌ها",
    debug_circuit: "مدار",
    debug_last: "آخرین",
    debug_parallel: "موازی",
    debug_providers: "🔵 OpenRouter | 🔴 Groq | 🟢 Google",
    select_model: "انتخاب مدل",
    model_selected: "✓ انتخاب شد",
    model_single_mode: "حالت → تک",
    invalid_number: "شماره نامعتبر",
    active_title: "🔍 وضعیت مدل‌ها",
    active_testing: "⏳ در حال تست مدل‌ها...",
    active_ready: "✅ سالم",
    active_failed: "❌ غیرفعال",
    active_none: "هیچ‌کدام",
    active_note: "مدل‌های غیرفعال ممکن است به دلیل محدودیت نرخ یا حذف از سرویس باشند. /refreshmodels را امتحان کنید.",
    reminder_text: "سلام! وقتشه برگردی!\n\n۱۵ روزه که چت نکردیم. IVAI منتظرته!\n\nبفرست هر چی دوست داری یا /start بزن!\n\n<blockquote>🌀@ILIVIR3</blockquote>"
  },
  en: {
    start_title: "🪐 IVAI",
    start_welcome: "Welcome to IVAI — your free AI assistant powered by models across OpenRouter, Groq, and Google AI Studio. I automatically route your questions to the best available model and pick the highest-quality answer.\n\n✓ Prompt master mode\n✓ Smart auto-routing\n✓ Multi language support\n\n<blockquote>🌀@ILIVIR3</blockquote>",
    start_providers: "⚡ Providers",
    send_anything: "Send me anything!",
    mode_fast: "🟢 Fast",
    mode_deep: "🔴 Deep",
    mode_code: "🔵 Code",
    mode_prompt: "🎯 Prompt",
    mode_auto: "🔀 Auto",
    mode_set: "✓ Mode:",
    lang_select: "🌍 Select your language",
    lang_set: "✓ Language set",
    help_title: "📖 IVAI Guide",
    help_modes: "Conversation Modes",
    help_models: "Model Selection",
    help_providers: "Providers",
    help_memory: "Memory",
    help_tools: "Tools",
    help_tip: "Tip",
    memory_empty: "<i>Empty</i>",
    memory_cleared: "🗑 Memory cleared",
    reset_complete: "✓ Reset complete",
    back_auto: "✓ Back to auto-mode",
    all_failed: "All models failed.",
    models_failed_list: "Failed models:",
    emergency_suffix: "_(⚠️ Emergency)_",
    groq_suffix: "_(🔴 Served via Groq backup)_",
    google_suffix: "_(🟢 Served via Google AI Studio)_",
    debug_title: "🔧 Debug v3.2",
    debug_user: "User",
    debug_mode: "Mode",
    debug_requests: "Requests",
    debug_avg_time: "Avg",
    debug_memory: "Memory",
    debug_models: "Models",
    debug_circuit: "Circuit",
    debug_last: "Last",
    debug_parallel: "Parallel",
    debug_providers: "🔵 OpenRouter | 🔴 Groq | 🟢 Google",
    select_model: "Select a Model",
    model_selected: "✓ Selected",
    model_single_mode: "Mode → SINGLE",
    invalid_number: "Invalid number",
    active_title: "🔍 Model Status",
    active_testing: "⏳ Testing models...",
    active_ready: "✅ Healthy",
    active_failed: "❌ Down",
    active_none: "None",
    active_note: "Down models may be rate-limited or removed. Try /refreshmodels.",
    reminder_text: "Hey! Long time no see!\n\nIt's been 15 days. IVAI misses you!\n\nSend me anything or tap /start!\n\n<blockquote>🌀@ILIVIR3</blockquote>"
  }
};

const SUPPORTED_LANGS = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "fa", name: "Farsi", flag: "🇮🇷" }
];

async function getLang(userId, env) {
  if (!userId) return "en";
  try {
    const saved = await env.IVAI_KV.get(CONFIG.KV.LANG + userId);
    if (saved && STRINGS[saved]) return saved;
  } catch {}
  return "en";
}

function t(key, lang) {
  return STRINGS[lang]?.[key] || STRINGS.en[key] || key;
}

// ==========================================
// 🪐 DEFAULT MODELS (Static Fallback)
// ==========================================
const DEFAULT_FAST = [
  { id: "meta-llama/llama-3.2-3b-instruct:free", name: "Llama 3.2 3B", temp: 0.6, tokens: 8192, group: 1, provider: "openrouter" },
  { id: "nvidia/nemotron-nano-9b-v2:free", name: "Nemotron Nano 9B", temp: 0.5, tokens: 128000, group: 1, provider: "openrouter" },
  { id: "nvidia/nemotron-nano-12b-v2-vl:free", name: "Nemotron VL 12B", temp: 0.5, tokens: 128000, group: 1, provider: "openrouter" },
  { id: "openai/gpt-oss-20b:free", name: "GPT-OSS 20B", temp: 0.6, tokens: 131072, group: 2, provider: "openrouter" },
  { id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B", temp: 0.6, tokens: 262144, group: 2, provider: "openrouter" },
  { id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free", name: "Dolphin 24B", temp: 0.3, tokens: 32768, group: 2, provider: "openrouter" },
  { id: "liquid/lfm-2.5-1.2b-thinking:free", name: "LFM Thinking", temp: 0.3, tokens: 32768, group: 3, provider: "openrouter" }
];

const DEFAULT_DEEP = [
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", temp: 0.6, tokens: 65536, group: 1, provider: "openrouter" },
  { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B", temp: 0.6, tokens: 262144, group: 1, provider: "openrouter" },
  { id: "nvidia/nemotron-3-nano-30b-a3b:free", name: "Nemotron 30B", temp: 0.5, tokens: 256000, group: 2, provider: "openrouter" },
  { id: "qwen/qwen3-next-80b-a3b-instruct:free", name: "Qwen3 80B", temp: 0.6, tokens: 262144, group: 2, provider: "openrouter" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 120B", temp: 0.5, tokens: 262144, group: 2, provider: "openrouter" },
  { id: "openai/gpt-oss-120b:free", name: "GPT-OSS 120B", temp: 0.5, tokens: 131072, group: 3, provider: "openrouter" },
  { id: "nousresearch/hermes-3-llama-3.1-405b:free", name: "Hermes 405B", temp: 0.6, tokens: 131072, group: 3, provider: "openrouter" },
  { id: "z-ai/glm-4.5-air:free", name: "GLM 4.5 Air", temp: 0.6, tokens: 131072, group: 3, provider: "openrouter" }
];

const DEFAULT_CODE = [
  { id: "qwen/qwen3-coder:free", name: "Qwen3 Coder 480B", temp: 0.1, tokens: 262000, group: 1, provider: "openrouter" },
  { id: "poolside/laguna-m.1:free", name: "Laguna M.1", temp: 0.2, tokens: 131072, group: 1, provider: "openrouter" },
  { id: "poolside/laguna-xs.2:free", name: "Laguna XS.2", temp: 0.2, tokens: 131072, group: 2, provider: "openrouter" },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", name: "Nemotron Reason", temp: 0.5, tokens: 256000, group: 2, provider: "openrouter" },
  { id: "tencent/hy3-preview:free", name: "Tencent Hy3", temp: 0.6, tokens: 262144, group: 3, provider: "openrouter" },
  { id: "baidu/cobuddy:free", name: "Baidu CoBuddy", temp: 0.2, tokens: 131072, group: 3, provider: "openrouter" },
  { id: "minimax/minimax-m2.5:free", name: "MiniMax M2.5", temp: 0.6, tokens: 196608, group: 3, provider: "openrouter" }
];

const GROQ_MODELS = [
  { id: "llama-3.3-70b-versatile", name: "Groq Llama 70B", temp: 0.6, tokens: 8192, group: 1, provider: "groq", supportsMaxTokens: true },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Groq Llama 4 Scout", temp: 0.6, tokens: 4096, group: 2, provider: "groq", supportsMaxTokens: false },
  { id: "qwen/qwen3-32b", name: "Groq Qwen3 32B", temp: 0.6, tokens: 8192, group: 2, provider: "groq", supportsMaxTokens: true },
  { id: "llama-3.1-8b-instant", name: "Groq Llama 8B", temp: 0.6, tokens: 8192, group: 3, provider: "groq", supportsMaxTokens: true }
];

const GOOGLE_MODELS = [
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", temp: 0.6, tokens: 262144, group: 1, provider: "google" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", temp: 0.6, tokens: 262144, group: 2, provider: "google" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", temp: 0.5, tokens: 524288, group: 3, provider: "google" }
];

const EMERGENCY_MODELS = [
  { id: "gemini-2.5-flash-lite", name: "Gemini Flash Lite", temp: 0.7, tokens: 262144, provider: "google" },
  { id: "llama-3.1-8b-instant", name: "Groq Llama 8B", temp: 0.7, tokens: 8192, provider: "groq", supportsMaxTokens: true },
  { id: "openai/gpt-oss-20b:free", name: "Emergency 20B", temp: 0.7, tokens: 131072, provider: "openrouter" }
];

let FAST_MODELS = [...DEFAULT_FAST];
let DEEP_MODELS = [...DEFAULT_DEEP];
let CODE_MODELS = [...DEFAULT_CODE];
let ALL_MODELS = [];

function rebuildAllModels() {
  ALL_MODELS = [...FAST_MODELS, ...DEEP_MODELS, ...CODE_MODELS, ...GROQ_MODELS, ...GOOGLE_MODELS];
}
rebuildAllModels();

// ==========================================
// 🎲 RANDOM EMOJI GENERATOR (Space themed)
// ==========================================
const EMOJI_POOL = [
  "🪐", "🌀", "👾", "🛸", "🌌", "🌠", "🔮", "🧬", "⚡", "💫",
  "🌙", "⭐", "🚀", "🛰️", "🔭", "🧿", "🪞", "💎", "🧩", "🎯",
  "🧪", "🔬", "🎛️", "📡", "🧭", "🗝️", "🪬", "⚛️"
];

function getRandomEmoji(seed) {
  if (!seed) return EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  return EMOJI_POOL[Math.abs(hash) % EMOJI_POOL.length];
}

// ==========================================
// 🔄 PER-USER AUTO-UPDATE SYSTEM
// ==========================================

async function fetchModelsFromOpenRouter() {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models?offset=0&limit=1000", {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  } catch (e) {
    console.error("[AUTO-UPDATE] Fetch failed:", e);
    return null;
  }
}

function categorizeModel(modelId, name, description, contextLength) {
  const lowerId = modelId.toLowerCase();
  const lowerName = (name || "").toLowerCase();
  const lowerDesc = (description || "").toLowerCase();
  const paramMatch = lowerId.match(/(\d+(\.\d+)?)b/);
  const params = paramMatch ? parseFloat(paramMatch[1]) : 0;
  
  if (lowerId.includes("coder") || lowerId.includes("code") || 
      lowerName.includes("coder") || lowerName.includes("code") ||
      lowerId.includes("laguna") || lowerId.includes("dolphin")) {
    return "code";
  }
  if (lowerId.includes("thinking") || lowerId.includes("reason") ||
      lowerId.includes("deep") || lowerId.includes("hermes") ||
      params >= 30 || lowerDesc.includes("reasoning")) {
    return "deep";
  }
  if (params > 0 && params < 30) return "fast";
  if (contextLength > 100000) return "deep";
  return "fast";
}

function cleanModelName(name, id) {
  if (name) {
    return name.replace(/:free$/, "").replace(/\s*\(free\)$/i, "").trim();
  }
  const parts = id.split("/");
  const last = parts[parts.length - 1];
  return last.replace(/:free$/, "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim();
}

async function updateModelsForUser(userId, env) {
  const models = await fetchModelsFromOpenRouter();
  if (!models || models.length === 0) return false;
  
  const freeModels = models.filter(m => m.id && m.id.includes(":free"));
  if (freeModels.length === 0) return false;
  
  const categorized = { fast: [], deep: [], code: [] };
  
  for (const m of freeModels) {
    const cat = categorizeModel(m.id, m.name, m.description, m.context_length);
    const paramMatch = m.id.match(/(\d+(\.\d+)?)b/);
    const params = paramMatch ? parseFloat(paramMatch[1]) : 0;
    
    const modelEntry = {
      id: m.id,
      name: cleanModelName(m.name, m.id),
      emoji: getRandomEmoji(m.id),
      temp: cat === "code" ? 0.2 : (cat === "deep" ? 0.5 : 0.6),
      tokens: m.context_length || 8192,
      group: params >= 70 ? 3 : (params >= 30 ? 2 : 1),
      provider: "openrouter"
    };
    
    if (cat === "fast" && categorized.fast.length < 10) categorized.fast.push(modelEntry);
    else if (cat === "deep" && categorized.deep.length < 10) categorized.deep.push(modelEntry);
    else if (cat === "code" && categorized.code.length < 10) categorized.code.push(modelEntry);
  }
  
  await env.IVAI_KV.put(CONFIG.KV.USER_MODELS + userId, JSON.stringify(categorized), {
    expirationTtl: CONFIG.AUTO_UPDATE_DAYS * 24 * 60 * 60
  });
  
  console.log(`[AUTO-UPDATE] User ${userId}: synced ${freeModels.length} free models`);
  return true;
}

async function loadUserModels(userId, env) {
  try {
    const data = await env.IVAI_KV.get(CONFIG.KV.USER_MODELS + userId);
    if (!data) return null;
    return JSON.parse(data);
  } catch { return null; }
}

async function applyUserModels(userId, env) {
  const dynamic = await loadUserModels(userId, env);
  if (!dynamic) return false;
  if (dynamic.fast?.length > 0) FAST_MODELS = dynamic.fast;
  if (dynamic.deep?.length > 0) DEEP_MODELS = dynamic.deep;
  if (dynamic.code?.length > 0) CODE_MODELS = dynamic.code;
  rebuildAllModels();
  return true;
}

async function resetUserModels(userId, env) {
  await env.IVAI_KV.delete(CONFIG.KV.USER_MODELS + userId);
  FAST_MODELS = [...DEFAULT_FAST];
  DEEP_MODELS = [...DEFAULT_DEEP];
  CODE_MODELS = [...DEFAULT_CODE];
  rebuildAllModels();
}
// ==========================================
// 📝 PROMPTS
// ==========================================

const PROMPTS = {
  code: "You are IVAI, expert programmer. Write complete, production-ready code with detailed comments. Always use proper code blocks. Respond in user's language.",
  deep: "You are IVAI, expert analyst. Provide comprehensive, detailed answers with deep reasoning. Never cut off. Respond in user's language.",
  fast: "You are IVAI. Give accurate, helpful answers quickly. Respond in user's language.",
  emergency: "You are IVAI. Give brief helpful answer. Respond in user's language.",
  prompt: `You are Lyra, a master-level AI prompt optimization specialist. Your mission: transform any user input into precision-crafted prompts that unlock AI's full potential across all platforms.

THE 4-D METHODOLOGY

1. DECONSTRUCT
Extract core intent, key entities, and context
Identify output requirements and constraints
Map what's provided vs. what's missing

2. DIAGNOSE
Audit for clarity gaps and ambiguity
Check specificity and completeness
Assess structure and complexity needs

3. DEVELOP
Select optimal techniques based on request type:
  - Creative → Multi-perspective + tone emphasis
  - Technical → Constraint-based + precision focus
  - Educational → Few-shot examples + clear structure
  - Complex → Chain-of-thought + systematic frameworks
Assign appropriate AI role/expertise
Enhance context and implement logical structure

4. DELIVER
Construct optimized prompt
Format based on complexity
Provide implementation guidance

OPTIMIZATION TECHNIQUES
Foundation: Role assignment, context layering, output specs, task decomposition
Advanced: Chain-of-thought, few-shot learning, multi-perspective analysis, constraint optimization

RESPONSE FORMATS
Simple Requests:
Your Optimized Prompt:
\`\`\`
[Improved prompt]
\`\`\`
What Changed: [Key improvements]

Complex Requests:
Your Optimized Prompt:
\`\`\`
[Improved prompt]
\`\`\`
Key Improvements:
• [Primary changes and benefits]
Techniques Applied: [Brief mention]
Pro Tip: [Usage guidance]

RULE: Always wrap the final optimized prompt inside a code block so the user can copy it easily. Respond in the user's language.`
};

function detectCodeMode(text) {
  const strongPatterns = [
    /\`\`\`[\s\S]*?\`\`\`/,
    /def\s+\w+\s*\([^)]*\)\s*:/,
    /class\s+\w+[\s\(:{]/,
    /#include\s*<[^>]+>/,
    /import\s+[\w.]+|from\s+[\w.]+\s+import/,
    /const\s+|let\s+|var\s+\w+\s*=/,
    /function\s+\w+\s*\(/,
    /public\s+(static\s+)?(void|int|String|bool)/,
    /SELECT\s+.*\s+FROM\s+/i,
    /<[^>]+>.*<\/[^>]+>/
  ];
  for (const pattern of strongPatterns) {
    if (pattern.test(text)) return true;
  }
  const codeKeywords = /\b(write|create|generate|build|fix|debug)\s+(code|script|function|program|app|api|class|module)\b/i;
  const langKeywords = /\b(python|javascript|typescript|java|c\+\+|rust|go|sql|html|css|react|node)\b/i;
  return codeKeywords.test(text) || langKeywords.test(text);
}

function getModelCategory(modelId) {
  if (CODE_MODELS.some(m => m.id === modelId)) return "code";
  if (DEEP_MODELS.some(m => m.id === modelId)) return "deep";
  if (GROQ_MODELS.some(m => m.id === modelId)) return "fast";
  if (GOOGLE_MODELS.some(m => m.id === modelId)) return "fast";
  return "fast";
}

function getProviderColor(provider) {
  if (provider === "google") return "🟢";
  if (provider === "groq") return "🔴";
  return "🔵";
}

function getProviderLabel(provider) {
  if (provider === "google") return "🟢 Google";
  if (provider === "groq") return "🔴 Groq";
  return "🔵 OpenRouter";
}

// ==========================================
// 🎯 Inline Keyboards — Prompt on full row
// ==========================================

function startKeyboard(lang) {
  return {
    inline_keyboard: [
      [
        { text: "🟢 " + t("mode_fast", lang), callback_data: "mode_fast" },
        { text: "🔴 " + t("mode_deep", lang), callback_data: "mode_deep" },
        { text: "🔵 " + t("mode_code", lang), callback_data: "mode_code" }
      ],
      [
        { text: "🎯 " + t("mode_prompt", lang), callback_data: "mode_prompt" }
      ],
      [
        { text: "🔀 " + t("mode_auto", lang), callback_data: "mode_auto" },
        { text: "🎛 " + (lang === "fa" ? "انتخاب مدل" : "Pick Model"), callback_data: "menu_model" }
      ],
      [
        { text: "🌍 Language", callback_data: "menu_lang" }
      ]
    ]
  };
}

function compactStartKeyboard(lang) {
  return {
    inline_keyboard: [
      [
        { text: "🔀 " + t("mode_auto", lang), callback_data: "mode_auto" },
        { text: "🎯 " + t("mode_prompt", lang), callback_data: "mode_prompt" },
        { text: "🎛 " + (lang === "fa" ? "مدل" : "Model"), callback_data: "menu_model" }
      ],
      [
        { text: "🇬🇧 Language", callback_data: "menu_lang" },
        { text: "📋 " + (lang === "fa" ? "منوی کامل" : "Full Menu"), callback_data: "menu_main" }
      ]
    ]
  };
}

function langKeyboard() {
  return {
    inline_keyboard: SUPPORTED_LANGS.map(l => [{
      text: `${l.flag} ${l.name}`,
      callback_data: `lang_${l.code}`
    }])
  };
}

function modelListKeyboard(page = 0) {
  const perPage = 8;
  const start = page * perPage;
  const end = start + perPage;
  const pageModels = ALL_MODELS.slice(start, end);
  
  const buttons = pageModels.map((m, i) => ({
    text: `${getProviderColor(m.provider)} ${m.emoji || getRandomEmoji()} ${m.name}`,
    callback_data: `pick_${start + i}`
  }));
  
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  
  const nav = [];
  if (page > 0) nav.push({ text: "◀ Prev", callback_data: `page_${page - 1}` });
  nav.push({ text: "✕ Close", callback_data: "close" });
  if (end < ALL_MODELS.length) nav.push({ text: "Next ▶", callback_data: `page_${page + 1}` });
  rows.push(nav);
  
  return { inline_keyboard: rows };
}
// ==========================================
// 🎯 Entry Point
// ==========================================
export default {
  async fetch(request, env) {
    if (request.headers.get("X-Cron") || request.cf?.cron) {
      return new Response("Cron processed", { status: 200 });
    }

    if (request.method !== "POST") {
      return new Response("🪐 IVAI v3.2 — Space Edition", { status: 200 });
    }

    try {
      const update = await request.json();
      
      if (update.callback_query) {
        return await handleCallback(update.callback_query, env);
      }
      
      const msg = update.message;
      if (!msg?.text) return new Response("ok");

      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const text = msg.text.trim();
      const lang = await getLang(userId, env);

      // Apply per-user models if exist, else defaults
      await applyUserModels(userId, env);

      await env.IVAI_KV.put(CONFIG.KV.LAST_ACTIVE + userId, Date.now().toString(), { expirationTtl: 864000 });

      // ==================== COMMANDS ====================

      if (text === "/start") {
        await sendCompactStart(env, chatId, lang);
        return new Response("ok");
      }

      if (text === "/menu") {
        await sendMenu(env, chatId, lang);
        return new Response("ok");
      }

      if (text === "/lang") {
        await sendHTML(env, chatId, `<b>${t("lang_select", lang)}</b>`, langKeyboard());
        return new Response("ok");
      }

      if (text === "/help") {
        await sendHelp(env, chatId, lang);
        return new Response("ok");
      }

      if (["/fast", "/deep", "/code", "/prompt", "/auto"].includes(text)) {
        const mode = text.replace("/", "");
        await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
        await env.IVAI_KV.put(CONFIG.KV.MODE + userId, mode);
        const labels = { fast: t("mode_fast", lang), deep: t("mode_deep", lang), code: t("mode_code", lang), prompt: t("mode_prompt", lang), auto: t("mode_auto", lang) };
        await sendHTML(env, chatId, `${t("mode_set", lang)} <b>${labels[mode]}</b>`);
        return new Response("ok");
      }

      if (text === "/model") {
        await sendHTML(env, chatId, 
          `<b>${t("select_model", lang)}</b>\n\n${t("debug_providers", lang)}`,
          modelListKeyboard(0)
        );
        return new Response("ok");
      }

      if (text.startsWith("/pick ")) {
        const num = parseInt(text.split(" ")[1]);
        if (isNaN(num) || num < 1 || num > ALL_MODELS.length) {
          await sendHTML(env, chatId, `${t("invalid_number", lang)} (1-${ALL_MODELS.length})`);
          return new Response("ok");
        }
        const selected = ALL_MODELS[num - 1];
        await env.IVAI_KV.put(CONFIG.KV.MODEL + userId, selected.id);
        const providerLabel = getProviderLabel(selected.provider);
        await sendHTML(env, chatId, `${t("model_selected", lang)}: ${getRandomEmoji()} <b>${selected.name}</b> (${providerLabel})\n${t("model_single_mode", lang)}`);
        return new Response("ok");
      }

      if (text === "/model off" || text === "/model auto" || text === "/model clear") {
        await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
        await sendHTML(env, chatId, t("back_auto", lang));
        return new Response("ok");
      }

      if (text === "/memory show") {
        const mem = await getMemory(userId, env);
        const preview = mem.map((m, i) => `${i + 1}. <b>${m.role}</b>: ${m.content.substring(0, 50)}...`).join("\n");
        await sendHTML(env, chatId, `🧠 <b>Memory (${mem.length})</b>\n${preview || t("memory_empty", lang)}`);
        return new Response("ok");
      }

      if (text === "/memory clear") {
        await env.IVAI_KV.delete(CONFIG.KV.MEMORY + userId);
        await sendHTML(env, chatId, t("memory_cleared", lang));
        return new Response("ok");
      }

      if (text === "/debug") {
        const debugInfo = await generateDebugInfo(userId, env, lang);
        await sendHTML(env, chatId, debugInfo);
        return new Response("ok");
      }

      if (text === "/active") {
        await handleActiveCommand(env, chatId, userId, lang);
        return new Response("ok");
      }

      if (text === "/models") {
        const fmt = (m, i) => `${i + 1}. ${getProviderColor(m.provider)} ${m.emoji || getRandomEmoji()} <b>${m.name}</b> | G${m.group}`;
        await sendHTML(env, chatId, `<b>📋 ${ALL_MODELS.length} Models</b>\n\n<b>Fast:</b>\n${FAST_MODELS.map(fmt).join("\n")}`);
        await sendHTML(env, chatId, `<b>Deep:</b>\n${DEEP_MODELS.map(fmt).join("\n")}`);
        await sendHTML(env, chatId, `<b>Code:</b>\n${CODE_MODELS.map(fmt).join("\n")}`);
        await sendHTML(env, chatId, `<b>Groq:</b>\n${GROQ_MODELS.map(fmt).join("\n")}`);
        await sendHTML(env, chatId, `<b>Google:</b>\n${GOOGLE_MODELS.map(fmt).join("\n")}`);
        return new Response("ok");
      }

      if (text === "/logs") {
        const logs = await env.IVAI_KV.get(CONFIG.KV.LOGS + userId) || "[]";
        const recent = JSON.parse(logs).slice(-15).map(l => `• [${l.t}] [${l.l}] ${l.m}`).join("\n");
        await sendHTML(env, chatId, `🐛 <b>Logs</b>\n${recent || "<i>No logs</i>"}`);
        return new Response("ok");
      }

      if (text === "/reset") {
        await env.IVAI_KV.put(CONFIG.KV.FAILED + userId, "{}", { expirationTtl: 3600 });
        await env.IVAI_KV.delete(CONFIG.KV.MEMORY + userId);
        await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
        await env.IVAI_KV.delete(CONFIG.KV.MODE + userId);
        await env.IVAI_KV.delete(CONFIG.KV.LOGS + userId);
        await env.IVAI_KV.delete(CONFIG.KV.STATS + userId);
        await env.IVAI_KV.delete(CONFIG.KV.LAST_ACTIVE + userId);
        await env.IVAI_KV.delete(CONFIG.KV.LANG + userId);
        await resetUserModels(userId, env);  // ← resets to defaults
        await sendHTML(env, chatId, t("reset_complete", lang));
        return new Response("ok");
      }

      if (text === "/refreshmodels") {
        const ok = await updateModelsForUser(userId, env);
        if (ok) {
          await applyUserModels(userId, env);
          await sendHTML(env, chatId, `✓ <b>Models Updated!</b>\nLoaded fresh models from OpenRouter API for you.`);
        } else {
          await sendHTML(env, chatId, "⚠ <b>Update failed.</b>\nUsing default models.");
        }
        return new Response("ok");
      }

      // ==================== PROCESSING ====================

      let typingActive = true;
      const typingInterval = setInterval(() => {
        if (typingActive) sendTyping(env, chatId);
      }, CONFIG.TYPING_INTERVAL);

      try {
        const startTime = Date.now();
        const result = await processMessage(text, userId, env, lang);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        typingActive = false;
        clearInterval(typingInterval);

        if (result.fromCache) {
          await updateStats(userId, "cache_hit", 0, env);
        } else {
          await updateStats(userId, result.error ? "fail" : "success", parseFloat(duration), env);
        }

        await saveLastRequest(userId, {
          timestamp: new Date().toISOString(),
          model: result.model,
          mode: result.mode,
          duration: parseFloat(duration),
          length: result.text.length,
          tries: result.tried,
          success: !result.error
        }, env);

        const tried = result.tried > 1 ? ` | 🔄 ${result.tried} models` : "";
        const footer = result.model ? `🪐 <b>${result.model}</b> | ⏱ ${duration}s${tried}` : "";
        await sendSmart(env, chatId, result.text, footer);

      } catch (err) {
        typingActive = false;
        clearInterval(typingInterval);
        await log(env, userId, "FATAL", err.message);
        await sendHTML(env, chatId, `💥 <b>Error</b>\n${t("all_failed", lang)}\n\n${err.message?.substring(0, 200)}`);
      }

      return new Response("ok");

    } catch (err) {
      console.error("Top-level error:", err);
      return new Response("ok");
    }
  }
};
// ==========================================
// 🔴 /active — Batched Model Health Check
// ==========================================

async function pingModel(model, env) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.ACTIVE_TIMEOUT);
  const testMsg = [{ role: "user", content: "Say OK." }];
  
  try {
    let res;
    if (model.provider === "groq") {
      res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: model.id, messages: testMsg, max_tokens: 10, temperature: 0 }),
        signal: controller.signal
      });
    } else if (model.provider === "google") {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${env.GOOGLE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Say OK." }] }],
          generationConfig: { maxOutputTokens: 10, temperature: 0 }
        }),
        signal: controller.signal
      });
    } else {
      res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://t.me/IVAIBot",
          "X-Title": "IVAI-ActiveCheck"
        },
        body: JSON.stringify({ model: model.id, messages: testMsg, max_tokens: 10, temperature: 0 }),
        signal: controller.signal
      });
    }
    clearTimeout(timeout);
    if (!res.ok) return false;
    const json = await res.json();
    if (model.provider === "google") {
      return !!(json.candidates?.[0]?.content?.parts?.[0]?.text);
    }
    return !!(json.choices?.[0]?.message?.content);
  } catch (e) {
    clearTimeout(timeout);
    return false;
  }
}

async function handleActiveCommand(env, chatId, userId, lang) {
  await sendHTML(env, chatId, `<b>${t("active_testing", lang)}</b>\n<i>${lang === "fa" ? "این بررسی حدود ۱۵ ثانیه طول می‌کشد..." : "This check takes about 15 seconds..."}</i>`);
  
  const results = [];
  for (let i = 0; i < ALL_MODELS.length; i += CONFIG.ACTIVE_BATCH) {
    const batch = ALL_MODELS.slice(i, i + CONFIG.ACTIVE_BATCH);
    const batchResults = await Promise.all(batch.map(async (m) => {
      const ok = await pingModel(m, env);
      return { model: m, ok };
    }));
    results.push(...batchResults);
    if (i + CONFIG.ACTIVE_BATCH < ALL_MODELS.length) {
      await new Promise(r => setTimeout(r, CONFIG.ACTIVE_DELAY));
    }
  }
  
  // Clean display: provider color + random emoji + clean name (no "(free)")
  const okList = results.filter(r => r.ok).map(r => 
    `${getProviderColor(r.model.provider)} ${r.model.emoji || getRandomEmoji()} ${r.model.name}`
  );
  const failList = results.filter(r => !r.ok).map(r => 
    `${getProviderColor(r.model.provider)} ${r.model.emoji || getRandomEmoji()} ${r.model.name}`
  );
  
  const text = `<b>${t("active_title", lang)}</b> — <i>${new Date().toLocaleTimeString()}</i>\n\n` +
    `✅ <b>${t("active_ready", lang)} (${okList.length}):</b>\n${okList.join("\n") || t("active_none", lang)}\n\n` +
    `❌ <b>${t("active_failed", lang)} (${failList.length}):</b>\n${failList.join("\n") || t("active_none", lang)}\n\n` +
    `<i>${t("active_note", lang)}</i>`;
  
  await sendHTML(env, chatId, text);
}
// ==========================================
// 🔔 15-DAY REMINDER SYSTEM
// ==========================================

async function sendReminders(env) {
  try {
    console.log("[REMINDER] Cron triggered");
    return new Response("Cron processed", { status: 200 });
  } catch (e) {
    console.error("[REMINDER ERROR]", e);
    return new Response("Cron error", { status: 200 });
  }
}

// ==========================================
// 🆕 COMPACT /start
// ==========================================

async function sendCompactStart(env, chatId, lang) {
  const text = `<b>${t("start_title", lang)}</b>\n\n${t("start_welcome", lang)}\n\n${t("send_anything", lang)}`;
  await sendHTML(env, chatId, text, compactStartKeyboard(lang));
}

// ==========================================
// 📋 /menu — Full Menu
// ==========================================

async function sendMenu(env, chatId, lang) {
  const text = 
    `<b>${t("start_title", lang)}</b>\n\n` +
    `AI models across 3 providers. Best answer picked automatically.\n\n` +
    `<b>${t("start_providers", lang)}</b>\n` +
    `${t("debug_providers", lang)}\n\n` +
    `${t("send_anything", lang)}`;

  await sendHTML(env, chatId, text, startKeyboard(lang));
}

// ==========================================
// 🆕 HELP — Language Aware
// ==========================================

async function sendHelp(env, chatId, lang) {
  await sendHTML(env, chatId,
    `<b>${t("help_title", lang)}</b>\n\n` +
    `<b>${t("help_modes", lang)}:</b>\n` +
    `${t("mode_fast", lang)} — <code>/fast</code>\n` +
    `${t("mode_deep", lang)} — <code>/deep</code>\n` +
    `${t("mode_code", lang)} — <code>/code</code>\n` +
    `${t("mode_prompt", lang)} — <code>/prompt</code>\n` +
    `${t("mode_auto", lang)} — <code>/auto</code>\n\n` +
    `<b>${t("help_models", lang)}:</b>\n` +
    `<code>/model</code> — Browse all models\n` +
    `<code>/pick &lt;number&gt;</code> — Lock to one model\n` +
    `<code>/model off</code> — Return to auto selection\n\n` +
    `<b>${t("help_providers", lang)}:</b>\n` +
    `${t("debug_providers", lang)}\n\n` +
    `<b>${t("help_memory", lang)}:</b>\n` +
    `<code>/memory show</code> — View context\n` +
    `<code>/memory clear</code> — Wipe memory\n\n` +
    `<b>${t("help_tools", lang)}:</b>\n` +
    `<code>/active</code> — Check model status\n` +
    `<code>/debug</code> — System status\n` +
    `<code>/lang</code> — Change language\n` +
    `<code>/models</code> — List all models\n` +
    `<code>/logs</code> — Error logs\n` +
    `<code>/reset</code> — Factory reset\n\n` +
    `<b>${t("help_tip", lang)}:</b> Use <code>/prompt</code> then type your rough idea.`
  );
}

// ==========================================
// 🆕 CALLBACK HANDLER
// ==========================================

async function handleCallback(query, env) {
  const data = query.data;
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const messageId = query.message.message_id;
  const lang = await getLang(userId, env);

  // Load user models for callbacks too
  await applyUserModels(userId, env);

  await answerCallback(env, query.id);

  if (data.startsWith("mode_")) {
    const mode = data.replace("mode_", "");
    await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
    await env.IVAI_KV.put(CONFIG.KV.MODE + userId, mode);
    const labels = { 
      fast: t("mode_fast", lang), 
      deep: t("mode_deep", lang), 
      code: t("mode_code", lang), 
      prompt: t("mode_prompt", lang), 
      auto: t("mode_auto", lang) 
    };
    await editMessageHTML(env, chatId, messageId, `${t("mode_set", lang)} <b>${labels[mode]}</b>\n\n${t("send_anything", lang)}`);
    return new Response("ok");
  }

  if (data === "menu_main") {
    await sendMenu(env, chatId, lang);
    return new Response("ok");
  }

  if (data === "menu_model") {
    await editMessageHTML(env, chatId, messageId,
      `<b>${t("select_model", lang)}</b>\n\n${t("debug_providers", lang)}`,
      modelListKeyboard(0)
    );
    return new Response("ok");
  }

  if (data === "menu_lang") {
    await editMessageHTML(env, chatId, messageId,
      `<b>${t("lang_select", lang)}</b>`,
      langKeyboard()
    );
    return new Response("ok");
  }

  if (data.startsWith("lang_")) {
    const newLang = data.replace("lang_", "");
    if (STRINGS[newLang]) {
      await env.IVAI_KV.put(CONFIG.KV.LANG + userId, newLang);
      await editMessageHTML(env, chatId, messageId, `${t("lang_set", newLang)}: ${SUPPORTED_LANGS.find(l => l.code === newLang)?.flag || newLang}`);
    }
    return new Response("ok");
  }

  if (data.startsWith("pick_")) {
    const num = parseInt(data.replace("pick_", ""));
    if (num >= 0 && num < ALL_MODELS.length) {
      const selected = ALL_MODELS[num];
      await env.IVAI_KV.put(CONFIG.KV.MODEL + userId, selected.id);
      const providerLabel = getProviderLabel(selected.provider);
      let note = "";
      if (selected.provider === "groq") {
        note = "\n\n⚠ <b>Note:</b> Groq has limited context. Memory will be simplified.";
      }
      await editMessageHTML(env, chatId, messageId, 
        `${t("model_selected", lang)}: ${getRandomEmoji()} <b>${selected.name}</b> (${providerLabel})\n${t("model_single_mode", lang)}${note}\n\n${t("send_anything", lang)}`
      );
    }
    return new Response("ok");
  }

  if (data.startsWith("page_")) {
    const page = parseInt(data.replace("page_", ""));
    await editMessageHTML(env, chatId, messageId,
      `<b>${t("select_model", lang)}</b>\n\n${t("debug_providers", lang)}`,
      modelListKeyboard(page)
    );
    return new Response("ok");
  }

  if (data === "close") {
    await deleteMessage(env, chatId, messageId);
    return new Response("ok");
  }

  return new Response("ok");
}

// ==========================================
// 🔥 PROCESS MESSAGE
// ==========================================

async function processMessage(prompt, userId, env, lang) {
  const lower = prompt.toLowerCase();
  if (lower === "hi" || lower === "hello" || lower === "سلام" || lower === "hey") {
    return { 
      text: `${t("send_anything", lang)} 👋`, 
      model: null, emoji: "", tried: 0, mode: "fast", error: false, fromCache: false 
    };
  }

  const selectedModelId = await env.IVAI_KV.get(CONFIG.KV.MODEL + userId);
  if (selectedModelId) {
    return await processWithSelectedModel(prompt, selectedModelId, userId, env, lang);
  }

  return await processParallel(prompt, userId, env, lang);
}

async function processWithSelectedModel(prompt, modelId, userId, env, lang) {
  const model = ALL_MODELS.find(m => m.id === modelId);
  if (!model) {
    await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
    return await processParallel(prompt, userId, env, lang);
  }

  const category = getModelCategory(modelId);
  const context = await getMemory(userId, env);
  const messages = buildMessages(prompt, category, context, lang);

  const cacheKey = await hashKey(`single:${modelId}:${prompt}`);
  const cached = await env.IVAI_KV.get(CONFIG.KV.CACHE + userId + ":" + cacheKey);
  if (cached) {
    const data = JSON.parse(cached);
    if (Date.now() - data.ts < CONFIG.CACHE_TTL * 1000) {
      return { text: data.text, model: model.name, emoji: getRandomEmoji(), tried: 0, mode: "selected", error: false, fromCache: true };
    }
  }

  try {
    const result = await callWithFastRetry(messages, model, env);
    await saveMemory(userId, { role: "user", content: prompt }, env);
    await saveMemory(userId, { role: "assistant", content: result }, env);
    await saveCache(userId, cacheKey, result, model, env);

    return { text: result, model: model.name, emoji: getRandomEmoji(), tried: 1, mode: "selected", error: false, fromCache: false };
  } catch (err) {
    await log(env, userId, "SELECTED_FAIL", `${model.name}: ${err.message?.substring(0, 60)}`);

    for (const em of EMERGENCY_MODELS.filter(m => m.provider !== "groq" || env.GROQ_API_KEY).filter(m => m.provider !== "google" || env.GOOGLE_API_KEY)) {
      try {
        const emergencyMsg = [{ role: "user", content: PROMPTS.emergency + "\n\n" + prompt }];
        const result = await callWithFastRetry(emergencyMsg, em, env);
        return {
          text: result + `\n\n${t("emergency_suffix", lang)}`,
          model: em.name,
          emoji: getRandomEmoji(),
          tried: 2,
          mode: "selected",
          error: false,
          fromCache: false
        };
      } catch (e) { continue; }
    }

    return { 
      text: `${t("all_failed", lang)}\n\n<b>${t("models_failed_list", lang)}</b>\n• ${model.name}: ${err.message?.substring(0, 60)}\n\n💡 /active`, 
      model: null, 
      emoji: "💥", 
      tried: 2, 
      mode: "selected", 
      error: true, 
      fromCache: false 
    };
  }
}

async function processParallel(prompt, userId, env, lang) {
  let mode = await env.IVAI_KV.get(CONFIG.KV.MODE + userId) || "auto";

  if (mode === "auto") {
    if (detectCodeMode(prompt)) mode = "code";
    else if (prompt.length > 100 || /explain|why|how|analysis|story|طور|چرا|توضیح|تحلیل/i.test(prompt.toLowerCase())) mode = "deep";
    else mode = "fast";
  }

  let models;
  if (mode === "fast") models = [...FAST_MODELS];
  else if (mode === "deep") models = [...DEEP_MODELS];
  else if (mode === "code") models = [...CODE_MODELS];
  else if (mode === "prompt") models = [...CODE_MODELS];
  else models = [...FAST_MODELS];

  const cacheKey = await hashKey(`${mode}:${prompt}`);
  const cached = await env.IVAI_KV.get(CONFIG.KV.CACHE + userId + ":" + cacheKey);
  if (cached) {
    const data = JSON.parse(cached);
    if (Date.now() - data.ts < CONFIG.CACHE_TTL * 1000) {
      return { ...data, tried: 0, emoji: getRandomEmoji(), mode, error: false, fromCache: true };
    }
  }

  const context = await getMemory(userId, env);
  const messages = buildMessages(prompt, mode, context, lang);
  const failed = await getFailedModels(env, userId);

  const availableByGroup = {};
  for (const m of models) {
    if (isCircuitOpen(m.id, failed)) continue;
    if (!availableByGroup[m.group]) availableByGroup[m.group] = [];
    availableByGroup[m.group].push(m);
  }

  const parallelModels = [];
  for (const g of [1, 2, 3]) {
    if (availableByGroup[g]?.length > 0) {
      parallelModels.push(availableByGroup[g][0]);
    }
  }

  let triedCount = 0;
  const failureLog = [];

  if (parallelModels.length >= 2) {
    triedCount = parallelModels.length;
    try {
      const raceResult = await trueRaceModels(messages, parallelModels, env);

      if (failed[raceResult.model.id]) {
        delete failed[raceResult.model.id];
        await env.IVAI_KV.put(CONFIG.KV.FAILED + userId, JSON.stringify(failed), { expirationTtl: CONFIG.CIRCUIT_COOLDOWN * 2 });
      }

      await saveMemory(userId, { role: "user", content: prompt }, env);
      await saveMemory(userId, { role: "assistant", content: raceResult.text }, env);
      await saveCache(userId, cacheKey, raceResult.text, raceResult.model, env);

      return { text: raceResult.text, model: raceResult.model.name, emoji: getRandomEmoji(), tried: triedCount, mode, error: false, fromCache: false };
    } catch (e) {
      await log(env, userId, "PARALLEL_FAIL", e.message?.substring(0, 80));
      failureLog.push({ name: "Parallel group", err: e.message?.substring(0, 40) });
    }
  }

  const triedIds = new Set(parallelModels.map(m => m.id));
  const remaining = models.filter(m => !isCircuitOpen(m.id, failed) && !triedIds.has(m.id));

  for (const model of remaining) {
    triedCount++;
    try {
      const result = await callWithFastRetry(messages, model, env);

      if (failed[model.id]) {
        delete failed[model.id];
        await env.IVAI_KV.put(CONFIG.KV.FAILED + userId, JSON.stringify(failed), { expirationTtl: CONFIG.CIRCUIT_COOLDOWN * 2 });
      }

      await saveMemory(userId, { role: "user", content: prompt }, env);
      await saveMemory(userId, { role: "assistant", content: result }, env);
      await saveCache(userId, cacheKey, result, model, env);

      return { text: result, model: model.name, emoji: getRandomEmoji(), tried: triedCount, mode, error: false, fromCache: false };
    } catch (err) {
      await log(env, userId, "FAIL", `${model.name}: ${err.message?.substring(0, 60)}`);
      recordFailure(model.id, failed, env, userId);
      failureLog.push({ name: model.name, err: err.message?.substring(0, 40) });
    }
  }

  // GROQ FALLBACK
  if (env.GROQ_API_KEY) {
    const groqModels = GROQ_MODELS.filter(m => !isCircuitOpen(m.id, failed));
    for (const model of groqModels) {
      triedCount++;
      try {
        const simpleMessages = [
          { role: "system", content: PROMPTS[mode] || PROMPTS.fast },
          { role: "user", content: prompt }
        ];
        
        const result = await callWithFastRetry(simpleMessages, model, env);

        if (failed[model.id]) {
          delete failed[model.id];
          await env.IVAI_KV.put(CONFIG.KV.FAILED + userId, JSON.stringify(failed), { expirationTtl: CONFIG.CIRCUIT_COOLDOWN * 2 });
        }

        await saveMemory(userId, { role: "user", content: prompt }, env);
        await saveMemory(userId, { role: "assistant", content: result }, env);
        await saveCache(userId, cacheKey, result, model, env);

        return { 
          text: result + `\n\n${t("groq_suffix", lang)}`, 
          model: model.name, 
          emoji: getRandomEmoji(), 
          tried: triedCount, 
          mode: "groq", 
          error: false, 
          fromCache: false 
        };
      } catch (err) {
        await log(env, userId, "GROQ_FAIL", `${model.name}: ${err.message?.substring(0, 100)}`);
        recordFailure(model.id, failed, env, userId);
        failureLog.push({ name: model.name, err: err.message?.substring(0, 40) });
      }
    }
  }

  // GOOGLE FALLBACK
  if (env.GOOGLE_API_KEY) {
    const googleModels = GOOGLE_MODELS.filter(m => !isCircuitOpen(m.id, failed));
    for (const model of googleModels) {
      triedCount++;
      try {
        const result = await callWithFastRetry(messages, model, env);

        if (failed[model.id]) {
          delete failed[model.id];
          await env.IVAI_KV.put(CONFIG.KV.FAILED + userId, JSON.stringify(failed), { expirationTtl: CONFIG.CIRCUIT_COOLDOWN * 2 });
        }

        await saveMemory(userId, { role: "user", content: prompt }, env);
        await saveMemory(userId, { role: "assistant", content: result }, env);
        await saveCache(userId, cacheKey, result, model, env);

        return { 
          text: result + `\n\n${t("google_suffix", lang)}`, 
          model: model.name, 
          emoji: getRandomEmoji(), 
          tried: triedCount, 
          mode: "google", 
          error: false, 
          fromCache: false 
        };
      } catch (err) {
        await log(env, userId, "GOOGLE_FAIL", `${model.name}: ${err.message?.substring(0, 60)}`);
        recordFailure(model.id, failed, env, userId);
        failureLog.push({ name: model.name, err: err.message?.substring(0, 40) });
      }
    }
  }

  // Emergency candidates
  const availEmergency = EMERGENCY_MODELS.filter(m => m.provider !== "groq" || env.GROQ_API_KEY).filter(m => m.provider !== "google" || env.GOOGLE_API_KEY);
  for (const em of availEmergency) {
    triedCount++;
    try {
      const emergencyMsg = [{ role: "user", content: PROMPTS.emergency + "\n\n" + prompt }];
      const result = await callWithFastRetry(emergencyMsg, em, env);
      return {
        text: result + `\n\n${t("emergency_suffix", lang)}`,
        model: em.name,
        emoji: getRandomEmoji(),
        tried: triedCount,
        mode: "emergency",
        error: false,
        fromCache: false
      };
    } catch (e) {
      failureLog.push({ name: em.name, err: e.message?.substring(0, 40) });
    }
  }

  const failSummary = failureLog.slice(-5).map(f => `• ${f.name}: ${f.err}`).join("\n");
  return { 
    text: `${t("all_failed", lang)}\n\n<b>${t("models_failed_list", lang)}</b>\n${failSummary}\n\n💡 /active — ${lang === "fa" ? "بررسی وضعیت" : "Check status"}`, 
    model: null, 
    emoji: "💥", 
    tried: triedCount, 
    mode: "emergency", 
    error: true, 
    fromCache: false 
  };
}
// ==========================================
// 🏁 TRUE PARALLEL RACE
// ==========================================

async function trueRaceModels(messages, models, env) {
  return new Promise((resolve, reject) => {
    let pending = models.length;
    let resolved = false;
    const errors = [];

    const checkDone = () => {
      if (!resolved && pending === 0) {
        reject(new Error(`All ${models.length} parallel models failed: ${errors.join("; ")}`));
      }
    };

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Parallel timeout (${CONFIG.PARALLEL_TIMEOUT}ms)`));
      }
    }, CONFIG.PARALLEL_TIMEOUT);

    for (const model of models) {
      callAPI(messages, model, env)
        .then(text => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            resolve({ text, model });
          }
        })
        .catch(err => {
          if (!resolved) {
            errors.push(`${model.name}: ${err.message?.substring(0, 40)}`);
          }
        })
        .finally(() => {
          pending--;
          if (!resolved) checkDone();
        });
    }
  });
}

// ==========================================
// ⚡ FAST RETRY (404 non-retryable)
// ==========================================

async function callWithFastRetry(messages, model, env, attempt = 1) {
  try {
    return await callAPI(messages, model, env);
  } catch (err) {
    const msg = err.message || "";
    const isRetryable =
      msg.includes("5") ||
      msg.includes("429") ||
      msg.includes("timeout") ||
      msg.includes("abort") ||
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("overloaded") ||
      msg.includes("413");

    if (isRetryable && attempt < CONFIG.MAX_RETRIES) {
      await new Promise(r => setTimeout(r, CONFIG.RETRY_BASE_DELAY * attempt));
      return callWithFastRetry(messages, model, env, attempt + 1);
    }
    throw err;
  }
}

// ==========================================
// 📞 API ROUTER (3 Providers)
// ==========================================

async function callAPI(messages, model, env) {
  if (model.provider === "groq") {
    return callGroqAPI(messages, model, env.GROQ_API_KEY);
  }
  if (model.provider === "google") {
    return callGoogleAPI(messages, model, env.GOOGLE_API_KEY);
  }
  return callOpenRouterAPI(messages, model, env.OPENROUTER_API_KEY);
}

async function callOpenRouterAPI(messages, model, apiKey) {
  const payload = {
    model: model.id,
    messages: messages,
    max_tokens: Math.min(model.tokens, CONFIG.MAX_TOKENS),
    temperature: model.temp
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://t.me/IVAIBot",
        "X-Title": "IVAI-v3.2"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (res.status === 404) throw new Error("404: Model not found");
    if (res.status === 429) throw new Error("429: Rate limited");
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.substring(0, 150)}`);
    }

    const json = await res.json();
    if (json.error) throw new Error(`API: ${JSON.stringify(json.error).substring(0, 150)}`);

    const content = json.choices?.[0]?.message?.content;
    if (!content?.trim()) throw new Error("Empty response");

    return content.trim();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ==========================================
// 🔴 GROQ API
// ==========================================

function truncateMessagesForGroq(messages) {
  let totalChars = 0;
  const result = [];
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgChars = msg.content?.length || 0;
    
    if (totalChars + msgChars > CONFIG.GROQ_MAX_CONTEXT_CHARS && result.length > 0) {
      continue;
    }
    
    totalChars += msgChars;
    result.unshift(msg);
  }
  
  const hasSystem = result.some(m => m.role === "system");
  const originalSystem = messages.find(m => m.role === "system");
  if (!hasSystem && originalSystem) {
    result.unshift(originalSystem);
  }
  
  return result;
}

async function callGroqAPI(messages, model, apiKey) {
  const truncatedMessages = truncateMessagesForGroq(messages);
  
  const payload = {
    model: model.id,
    messages: truncatedMessages,
    temperature: model.temp
  };

  if (model.supportsMaxTokens !== false) {
    payload.max_tokens = Math.min(model.tokens, CONFIG.GROQ_MAX_TOKENS);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (res.status === 429) throw new Error("429: Groq rate limited");
    if (res.status === 400) {
      const text = await res.text();
      throw new Error(`400: ${text.substring(0, 200)}`);
    }
    if (res.status === 413) {
      throw new Error("413: Request too large for Groq context window");
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.substring(0, 150)}`);
    }

    const json = await res.json();
    if (json.error) throw new Error(`API: ${JSON.stringify(json.error).substring(0, 150)}`);

    const content = json.choices?.[0]?.message?.content;
    if (!content?.trim()) throw new Error("Empty response");

    return content.trim();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ==========================================
// 🟢 GOOGLE API
// ==========================================

async function callGoogleAPI(messages, model, apiKey) {
  const systemMsg = messages.find(m => m.role === "system");
  const userMsgs = messages.filter(m => m.role !== "system");
  
  const limitedMsgs = userMsgs.slice(-6);
  
  const contents = limitedMsgs.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content?.substring(0, 8000) || "" }]
  }));

  const payload = {
    contents: contents,
    generationConfig: {
      maxOutputTokens: Math.min(model.tokens, 8192),
      temperature: model.temp
    }
  };

  if (systemMsg) {
    payload.systemInstruction = { 
      parts: [{ text: systemMsg.content?.substring(0, 4000) || "" }] 
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      }
    );

    clearTimeout(timeout);

    if (res.status === 429) throw new Error("429: Google rate limited");
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.substring(0, 150)}`);
    }

    const json = await res.json();
    if (json.error) throw new Error(`API: ${JSON.stringify(json.error).substring(0, 150)}`);

        const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content?.trim()) throw new Error("Empty response");

    return content.trim();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ==========================================
// 📤 Telegram Senders (Consolidated)
// ==========================================

async function sendHTML(env, chatId, html, keyboard = null) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: html.substring(0, 4096),
    parse_mode: "HTML"
  };
  if (keyboard) body.reply_markup = keyboard;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const plain = html.replace(/<[^>]*>/g, "");
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: plain.substring(0, 4096) })
      });
    }
  } catch {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: "Message delivery failed" })
    });
  }
}

async function editMessageHTML(env, chatId, messageId, html, keyboard = null) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`;
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text: html.substring(0, 4096),
    parse_mode: "HTML"
  };
  if (keyboard) body.reply_markup = keyboard;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {}
}

async function deleteMessage(env, chatId, messageId) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteMessage`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
  } catch {}
}

async function answerCallback(env, callbackQueryId) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId })
    });
  } catch {}
}

// MARKDOWN TO HTML
function markdownToHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<b>$1</b>')
    .replace(/^[-*]\s+(.+)$/gm, '• $1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>');
}

async function sendSmart(env, chatId, text, footer) {
  let mainText = text;
  const footerHTML = footer ? `<blockquote>${footer}</blockquote>` : '';
  const available = CONFIG.MAX_LENGTH - footerHTML.length - 20;
  
  if (mainText.length > available) {
    mainText = smartTruncate(mainText, available);
  }
  
  let html = markdownToHTML(mainText);
  if (footerHTML) {
    html += '\n' + footerHTML;
  }
  
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: html.substring(0, 4096),
    parse_mode: "HTML"
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const plain = (mainText + (footer ? `\n\n${footer.replace(/<[^>]*>/g, '')}` : '')).substring(0, 4096);
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: plain })
      });
    }
  } catch {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: "Message delivery failed" })
    });
  }
}

async function sendTyping(env, chatId) {
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    });
  } catch {}
}

// ==========================================
// 🛠️ Utilities
// ==========================================

function buildMessages(prompt, mode, context, lang) {
  const system = PROMPTS[mode] || PROMPTS.fast;
  const langNote = lang !== "en" ? ` Respond in ${lang === 'fa' ? 'Persian (Farsi)' : lang} language.` : "";
  const messages = [{ role: "system", content: system + langNote }];
  if (context.length > 0) messages.push(...context);
  messages.push({ role: "user", content: prompt });
  return messages;
}

function smartTruncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  let cutPoint = text.lastIndexOf("\n\n", maxLen - 100);
  if (cutPoint < maxLen * 0.7) cutPoint = text.lastIndexOf(". ", maxLen - 50);
  if (cutPoint < maxLen * 0.7) cutPoint = text.lastIndexOf(" ", maxLen - 20);
  if (cutPoint > 100) return text.substring(0, cutPoint) + "\n\n_... [truncated]_";
  return text.substring(0, maxLen - 20) + "\n\n_..._";
}

// ==========================================
// 📊 Stats
// ==========================================

async function getStats(userId, env) {
  try {
    const data = await env.IVAI_KV.get(CONFIG.KV.STATS + userId);
    return data ? JSON.parse(data) : { total: 0, success: 0, fails: 0, cacheHits: 0, totalTime: 0 };
  } catch {
    return { total: 0, success: 0, fails: 0, cacheHits: 0, totalTime: 0 };
  }
}

async function updateStats(userId, type, duration, env) {
  try {
    const stats = await getStats(userId, env);
    stats.total = (stats.total || 0) + 1;
    if (type === "success") {
      stats.success = (stats.success || 0) + 1;
      stats.totalTime = (stats.totalTime || 0) + duration;
    } else if (type === "fail") {
      stats.fails = (stats.fails || 0) + 1;
    } else if (type === "cache_hit") {
      stats.cacheHits = (stats.cacheHits || 0) + 1;
    }
    await env.IVAI_KV.put(CONFIG.KV.STATS + userId, JSON.stringify(stats), { expirationTtl: 86400 });
  } catch (e) {
    console.error("Stats error:", e);
  }
}

async function getLastRequest(userId, env) {
  try {
    const data = await env.IVAI_KV.get(CONFIG.KV.LAST + userId);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

async function saveLastRequest(userId, data, env) {
  try {
    await env.IVAI_KV.put(CONFIG.KV.LAST + userId, JSON.stringify(data), { expirationTtl: 3600 });
  } catch {}
}

// ==========================================
// 🔌 Circuit Breaker (Per-User)
// ==========================================

async function getFailedModels(env, userId) {
  try {
    const data = await env.IVAI_KV.get(CONFIG.KV.FAILED + (userId || "sys"));
    if (!data) return {};
    const parsed = JSON.parse(data);
    const now = Date.now();
    Object.keys(parsed).forEach(k => {
      if (now - parsed[k].ts > CONFIG.CIRCUIT_COOLDOWN) delete parsed[k];
    });
    return parsed;
  } catch { return {}; }
}

function isCircuitOpen(modelId, failed) {
  const record = failed[modelId];
  if (!record) return false;
  return record.count >= CONFIG.CIRCUIT_THRESHOLD &&
         (Date.now() - record.ts) < CONFIG.CIRCUIT_COOLDOWN;
}

async function recordFailure(modelId, failed, env, userId) {
  const now = Date.now();
  const current = failed[modelId] || { count: 0, ts: 0 };
  if (now - current.ts < CONFIG.CIRCUIT_COOLDOWN) current.count++;
  else current.count = 1;
  current.ts = now;
  failed[modelId] = current;
  await env.IVAI_KV.put(CONFIG.KV.FAILED + (userId || "sys"), JSON.stringify(failed), { expirationTtl: CONFIG.CIRCUIT_COOLDOWN * 2 });
}

// ==========================================
// 🧠 Memory & Cache
// ==========================================

async function getMemory(userId, env) {
  try {
    const data = await env.IVAI_KV.get(CONFIG.KV.MEMORY + userId);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

async function saveMemory(userId, message, env) {
  try {
    const mem = await getMemory(userId, env);
    mem.push(message);
    await env.IVAI_KV.put(CONFIG.KV.MEMORY + userId, JSON.stringify(mem.slice(-CONFIG.MAX_CONTEXT)), {
      expirationTtl: CONFIG.MEMORY_TTL
    });
  } catch {}
}

async function saveCache(userId, key, text, model, env) {
  try {
    await env.IVAI_KV.put(CONFIG.KV.CACHE + userId + ":" + key, JSON.stringify({
      text, model: model.name, emoji: getRandomEmoji(), ts: Date.now()
    }), { expirationTtl: CONFIG.CACHE_TTL });
  } catch {}
}

async function hashKey(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).substring(0, 16);
}

async function log(env, userId, level, message) {
  const entry = {
    t: new Date().toISOString().split("T")[1].split(".")[0],
    l: level,
    m: message.substring(0, 100)
  };
  console.log(`[${entry.t}] [${level}] ${message}`);
  try {
    const key = CONFIG.KV.LOGS + (userId || "sys");
    const existing = await env.IVAI_KV.get(key) || "[]";
    const logs = JSON.parse(existing);
    logs.push(entry);
    await env.IVAI_KV.put(key, JSON.stringify(logs.slice(-20)), { expirationTtl: 3600 });
  } catch {}
}

async function generateDebugInfo(userId, env, lang) {
  const [currentMode, selectedModelId, failed, stats, lastReq, memory] = await Promise.all([
    env.IVAI_KV.get(CONFIG.KV.MODE + userId),
    env.IVAI_KV.get(CONFIG.KV.MODEL + userId),
    getFailedModels(env, userId),
    getStats(userId, env),
    getLastRequest(userId, env),
    getMemory(userId, env)
  ]);

  const selectedModel = selectedModelId ? ALL_MODELS.find(m => m.id === selectedModelId) : null;
  const mode = selectedModel ? "SELECTED" : (currentMode || "auto").toUpperCase();

  let avgTime = "N/A";
  if (stats.success > 0 && stats.totalTime > 0) {
    avgTime = (stats.totalTime / stats.success).toFixed(1);
  }

  const failedList = Object.entries(failed);
  const circuitStatus = failedList.length > 0
    ? failedList.map(([id, data]) => {
        const model = ALL_MODELS.find(m => m.id === id);
        const name = model ? model.name : id.split("/").pop();
        const secsLeft = Math.max(0, Math.ceil((CONFIG.CIRCUIT_COOLDOWN - (Date.now() - data.ts)) / 1000));
        const isOpen = data.count >= CONFIG.CIRCUIT_THRESHOLD;
        return `• ${name}: ${data.count}f${isOpen ? ` 🔒${secsLeft}s` : ""}`;
      }).join("\n")
    : "_All healthy_";

  const getModeModels = (m) => {
    if (m === "fast") return FAST_MODELS;
    if (m === "deep") return DEEP_MODELS;
    if (m === "code") return CODE_MODELS;
    if (m === "prompt") return CODE_MODELS;
    return ALL_MODELS;
  };

  const modeModels = selectedModel ? [selectedModel] : getModeModels(currentMode || "auto");
  const availableModels = modeModels.filter(m => !isCircuitOpen(m.id, failed)).length;

  const lastInfo = lastReq
    ? `\n📊 *Last:*\n` +
      `• ${lastReq.model} | ${lastReq.mode}\n` +
      `• ⏱ ${lastReq.duration}s | 📝 ${lastReq.length}ch\n` +
      `• 🔄 ${lastReq.tries} models | ${lastReq.success ? "✓" : "✗"}\n` +
      `• 🕐 ${new Date(lastReq.timestamp).toLocaleTimeString()}`
    : "";

  return `${t("debug_title", lang)}\n\n` +
         `${t("debug_user", lang)} | ${t("debug_mode", lang)}: *${mode}*\n` +
         (selectedModel ? `📌 ${getRandomEmoji()} ${selectedModel.name}${selectedModel.provider !== "openrouter" ? " " + getProviderColor(selectedModel.provider) : ""}\n` : "") +
         `${t("debug_requests", lang)}: ${stats.total} (✓${stats.success}|✗${stats.fails}|💾${stats.cacheHits || 0})\n` +
         `${t("debug_avg_time", lang)}: ${avgTime}s | ${t("debug_memory", lang)}: ${memory.length}msg\n\n` +
         `${t("debug_models", lang)}: ${availableModels}/${modeModels.length} avail\n` +
         `${t("debug_circuit", lang)} (60s):\n${circuitStatus}` +
         lastInfo + `\n\n` +
         `${t("debug_parallel", lang)}: 3 groups | 25s timeout | 60s circuit\n` +
         `${t("debug_providers", lang)}`;
}

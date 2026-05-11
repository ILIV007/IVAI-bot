// ==========================================
// IVAI Bot v28.0 — Premium UI Edition
// New: Inline Keyboard Menus, Reactions, Polished /start
// ==========================================

const CONFIG = {
  TIMEOUT: 25 * 1000,
  TYPING_INTERVAL: 1500,
  PARALLEL_TIMEOUT: 20 * 1000,
  RETRY_BASE_DELAY: 500,
  MAX_RETRIES: 2,
  CIRCUIT_THRESHOLD: 2,
  CIRCUIT_COOLDOWN: 30 * 1000,
  MEMORY_TTL: 60 * 60,
  CACHE_TTL: 2 * 60 * 60,
  MAX_CONTEXT: 5,
  MAX_LENGTH: 4096,
  MAX_TOKENS: 32000,
  KV: {
    MODE: "mode:",
    MODEL: "model:",
    MEMORY: "mem:",
    CACHE: "cache:",
    FAILED: "failed:",
    LOGS: "logs:",
    LAST: "last:",
    STATS: "stats:"
  }
};

// ... (Models same as v27)
const FAST_MODELS = [
  { id: "meta-llama/llama-3.2-3b-instruct:free", name: "Llama 3.2 3B", emoji: "🚀", temp: 0.6, tokens: 8192, group: 1 },
  { id: "nvidia/nemotron-nano-9b-v2:free", name: "Nemotron Nano 9B", emoji: "⚡", temp: 0.5, tokens: 128000, group: 1 },
  { id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B", emoji: "💎", temp: 0.6, tokens: 262144, group: 2 },
  { id: "nvidia/nemotron-3-nano-30b-a3b:free", name: "Nemotron 30B", emoji: "🤖", temp: 0.5, tokens: 256000, group: 2 },
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", emoji: "🦙", temp: 0.6, tokens: 65536, group: 3 },
  { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B", emoji: "🌟", temp: 0.6, tokens: 262144, group: 3 },
  { id: "openai/gpt-oss-20b:free", name: "GPT-OSS 20B", emoji: "🆕", temp: 0.6, tokens: 131072, group: 3 }
];

const DEEP_MODELS = [
  { id: "nousresearch/hermes-3-llama-3.1-405b:free", name: "Hermes 405B", emoji: "🎯", temp: 0.6, tokens: 131072, group: 1 },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 120B", emoji: "🔥", temp: 0.5, tokens: 262144, group: 1 },
  { id: "qwen/qwen3-next-80b-a3b-instruct:free", name: "Qwen3 80B", emoji: "🔮", temp: 0.6, tokens: 262144, group: 2 },
  { id: "openai/gpt-oss-120b:free", name: "GPT-OSS 120B", emoji: "🧠", temp: 0.5, tokens: 131072, group: 2 },
  { id: "z-ai/glm-4.5-air:free", name: "GLM 4.5 Air", emoji: "🔄", temp: 0.6, tokens: 131072, group: 3 },
  { id: "minimax/minimax-m2.5:free", name: "MiniMax M2.5", emoji: "🌊", temp: 0.6, tokens: 196608, group: 3 },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", name: "Nemotron Reason", emoji: "🧪", temp: 0.5, tokens: 256000, group: 3 },
  { id: "tencent/hy3-preview:free", name: "Tencent Hy3", emoji: "🐲", temp: 0.6, tokens: 262144, group: 3 }
];

const CODE_MODELS = [
  { id: "qwen/qwen3-coder:free", name: "Qwen3 Coder 480B", emoji: "🏆", temp: 0.1, tokens: 262000, group: 1 },
  { id: "poolside/laguna-m.1:free", name: "Laguna M.1", emoji: "🏖️", temp: 0.2, tokens: 131072, group: 1 },
  { id: "nvidia/nemotron-nano-12b-v2-vl:free", name: "Nemotron VL 12B", emoji: "🎨", temp: 0.2, tokens: 128000, group: 2 },
  { id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free", name: "Dolphin 24B", emoji: "🐬", temp: 0.3, tokens: 32768, group: 2 },
  { id: "poolside/laguna-xs.2:free", name: "Laguna XS.2", emoji: "⚡", temp: 0.2, tokens: 131072, group: 3 },
  { id: "baidu/cobuddy:free", name: "Baidu CoBuddy", emoji: "🐼", temp: 0.2, tokens: 131072, group: 3 },
  { id: "liquid/lfm-2.5-1.2b-thinking:free", name: "LFM Thinking", emoji: "💧", temp: 0.3, tokens: 32768, group: 3 }
];

const ALL_MODELS = [...FAST_MODELS, ...DEEP_MODELS, ...CODE_MODELS];
const EMERGENCY_MODEL = { id: "meta-llama/llama-3.2-3b-instruct:free", name: "Emergency 3B", emoji: "🆘", temp: 0.7, tokens: 8192 };

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
    /```[\s\S]*?```/,
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
  return "fast";
}

// ==========================================
// 🎯 Inline Keyboards
// ==========================================

function modeKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🚀 Fast", callback_data: "mode_fast" },
        { text: "🧠 Deep", callback_data: "mode_deep" },
        { text: "💻 Code", callback_data: "mode_code" }
      ],
      [
        { text: "🎯 Prompt Master", callback_data: "mode_prompt" },
        { text: "🔀 Auto", callback_data: "mode_auto" }
      ]
    ]
  };
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🎛 Pick Model", callback_data: "menu_model" },
        { text: "🧠 Memory", callback_data: "menu_memory" }
      ],
      [
        { text: "🔧 Debug", callback_data: "menu_debug" },
        { text: "📖 Help", callback_data: "menu_help" }
      ],
      [
        { text: "🗑️ Reset", callback_data: "menu_reset" }
      ]
    ]
  };
}

function modelListKeyboard(page = 0) {
  const perPage = 8;
  const start = page * perPage;
  const end = start + perPage;
  const pageModels = ALL_MODELS.slice(start, end);
  
  const buttons = pageModels.map((m, i) => ({
    text: `${m.emoji} ${m.name}`,
    callback_data: `pick_${start + i}`
  }));
  
  // Arrange in pairs
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  
  // Navigation
  const nav = [];
  if (page > 0) nav.push({ text: "◀️ Prev", callback_data: `page_${page - 1}` });
  nav.push({ text: "❌ Close", callback_data: "close" });
  if (end < ALL_MODELS.length) nav.push({ text: "Next ▶️", callback_data: `page_${page + 1}` });
  rows.push(nav);
  
  return { inline_keyboard: rows };
}

// ==========================================
// 🎯 Entry Point
// ==========================================
export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("🤖 IVAI v28.0 — Premium Edition", { status: 200 });
    }

    try {
      const update = await request.json();
      
      // Handle Callback Queries (Inline Buttons)
      if (update.callback_query) {
        return await handleCallback(update.callback_query, env);
      }
      
      const msg = update.message;
      if (!msg?.text) return new Response("ok");

      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const text = msg.text.trim();

      // ==================== COMMANDS ====================

      if (text === "/start") {
        await sendStart(env, chatId);
        return new Response("ok");
      }

      if (text === "/help") {
        await sendHTML(env, chatId,
          "<b>📖 IVAI Bot — Complete Guide</b>\n\n" +
          "<b>🎚 Conversation Modes:</b>\n" +
          "🚀 <code>/fast</code> — Speed mode. Quick answers & chat.\n" +
          "🧠 <code>/deep</code> — Deep mode. Analysis, stories, explanations.\n" +
          "💻 <code>/code</code> — Code mode. Programming & technical tasks.\n" +
          "🎯 <code>/prompt</code> — <b>Prompt Master</b>. Turn rough ideas into pro AI prompts using Lyra engine. Uses Code models for best results.\n" +
          "🔀 <code>/auto</code> — Auto detect. I pick the mode based on your message.\n\n" +
          "<b>🎛 Model Selection:</b>\n" +
          "<code>/model</code> — Browse all 22 models with inline buttons\n" +
          "<code>/pick &lt;number&gt;</code> — Lock to one specific model\n" +
          "<code>/model off</code> — Return to mode-based auto selection\n\n" +
          "<b>🧠 Memory:</b>\n" +
          "<code>/memory show</code> — View last 5 messages in context\n" +
          "<code>/memory clear</code> — Wipe conversation memory\n\n" +
          "<b>🔧 Tools:</b>\n" +
          "<code>/debug</code> — System status, circuits & stats\n" +
          "<code>/models</code> — List all models by category\n" +
          "<code>/logs</code> — Recent error logs\n" +
          "<code>/reset</code> — Factory reset everything\n\n" +
          "<b>💡 Tip:</b> Use <code>/prompt</code> then type your rough idea.\n" +
          "Example: <code>/prompt</code> then \"write a marketing email for a sneaker shop\""
        );
        return new Response("ok");
      }

      if (["/fast", "/deep", "/code", "/prompt", "/auto"].includes(text)) {
        const mode = text.replace("/", "");
        await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
        await env.IVAI_KV.put(CONFIG.KV.MODE + userId, mode);
        const labels = { fast: "🚀 FAST", deep: "🧠 DEEP", code: "💻 CODE", prompt: "🎯 PROMPT MASTER", auto: "🔀 AUTO" };
        await sendHTML(env, chatId, `✅ Mode: <b>${labels[mode]}</b>`);
        return new Response("ok");
      }

      if (text === "/model") {
        await sendHTMLWithKeyboard(env, chatId, 
          "<b>🎯 Select a Model</b>\n\nClick a model below or use <code>/pick &lt;number&gt;</code>",
          modelListKeyboard(0)
        );
        return new Response("ok");
      }

      if (text.startsWith("/pick ")) {
        const num = parseInt(text.split(" ")[1]);
        if (isNaN(num) || num < 1 || num > ALL_MODELS.length) {
          await sendHTML(env, chatId, `❌ Invalid number. Use /model to see list (1-${ALL_MODELS.length})`);
          return new Response("ok");
        }
        const selected = ALL_MODELS[num - 1];
        await env.IVAI_KV.put(CONFIG.KV.MODEL + userId, selected.id);
        await sendHTML(env, chatId, `✅ Selected: ${selected.emoji} <b>${selected.name}</b>\nMode → 🎯 <b>SINGLE</b>`);
        return new Response("ok");
      }

      if (text === "/model off" || text === "/model auto" || text === "/model clear") {
        await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
        await sendHTML(env, chatId, "✅ Back to auto-mode");
        return new Response("ok");
      }

      if (text === "/memory show") {
        const mem = await getMemory(userId, env);
        const preview = mem.map((m, i) => `${i + 1}. <b>${m.role}</b>: ${m.content.substring(0, 50)}...`).join("\n");
        await sendHTML(env, chatId, `🧠 <b>Memory (${mem.length})</b>\n${preview || "<i>Empty</i>"}`);
        return new Response("ok");
      }

      if (text === "/memory clear") {
        await env.IVAI_KV.delete(CONFIG.KV.MEMORY + userId);
        await sendHTML(env, chatId, "🗑️ Memory cleared");
        return new Response("ok");
      }

      if (text === "/debug") {
        const debugInfo = await generateDebugInfo(userId, env);
        await sendHTML(env, chatId, debugInfo);
        return new Response("ok");
      }

      if (text === "/models") {
        const fmt = (m, i) => `${i + 1}. ${m.emoji} <b>${m.name}</b> | G${m.group}`;
        await sendHTML(env, chatId, `<b>📋 ${ALL_MODELS.length} Verified Models</b>\n\n<b>🚀 Fast:</b>\n${FAST_MODELS.map(fmt).join("\n")}`);
        await sendHTML(env, chatId, `<b>🧠 Deep:</b>\n${DEEP_MODELS.map(fmt).join("\n")}`);
        await sendHTML(env, chatId, `<b>💻 Code:</b>\n${CODE_MODELS.map(fmt).join("\n")}`);
        return new Response("ok");
      }

      if (text === "/logs") {
        const logs = await env.IVAI_KV.get(CONFIG.KV.LOGS + userId) || "[]";
        const recent = JSON.parse(logs).slice(-10).map(l => `• [${l.t}] [${l.l}] ${l.m}`).join("\n");
        await sendHTML(env, chatId, `🐛 <b>Logs</b>\n${recent || "<i>No logs</i>"}`);
        return new Response("ok");
      }

      if (text === "/reset") {
        await env.IVAI_KV.put(CONFIG.KV.FAILED, "{}");
        await env.IVAI_KV.delete(CONFIG.KV.MEMORY + userId);
        await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
        await env.IVAI_KV.delete(CONFIG.KV.MODE + userId);
        await env.IVAI_KV.delete(CONFIG.KV.LOGS + userId);
        await env.IVAI_KV.delete(CONFIG.KV.STATS + userId);
        await sendHTML(env, chatId, "✅ Reset complete");
        return new Response("ok");
      }

      // ==================== PROCESSING ====================

      let typingActive = true;
      const typingInterval = setInterval(() => {
        if (typingActive) sendTyping(env, chatId);
      }, CONFIG.TYPING_INTERVAL);

      try {
        const startTime = Date.now();
        const result = await processMessage(text, userId, env);
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

        const footer = result.model ? `\n\n${result.emoji} *${result.model}* ⏱ ${duration}s` : "";
        const tried = result.tried > 1 ? ` (${result.tried} models)` : "";

        await sendSmart(env, chatId, result.text, footer + tried);

      } catch (err) {
        typingActive = false;
        clearInterval(typingInterval);
        await log(env, userId, "FATAL", err.message);
        await sendHTML(env, chatId, "💥 <b>Error</b>\nTry /reset");
      }

      return new Response("ok");

    } catch (err) {
      return new Response("ok");
    }
  }
};

// ==========================================
// 🆕 START SCREEN — Premium UI
// ==========================================

async function sendStart(env, chatId) {
  const text = 
    "<b>🤖 IVAI v28.0</b> — <i>Premium Edition</i>\n\n" +
    "<b>⚡ What I Do</b>\n" +
    "I run <b>22 AI models</b> in parallel and pick the best answer — fast, deep, code, or prompt optimization.\n\n" +
    "<b>🎯 Superpowers</b>\n" +
    "• <b>🚀 Fast</b> — Lightning quick answers\n" +
    "• <b>🧠 Deep</b> — Expert analysis & reasoning\n" +
    "• <b>💻 Code</b> — Production-ready programming\n" +
    "• <b>🎯 Prompt Master</b> — Turn rough ideas into pro AI prompts <i>(powered by Lyra)</i>\n" +
    "• <b>🔀 Auto</b> — I detect what you need\n\n" +
    "<b>🎛 Model Control</b>\n" +
    "Pick any of 22 models, or let me choose. Circuit breaker keeps things running even when APIs hiccup.\n\n" +
    "<b>🚀 Quick Start</b>\n" +
    "Pick a mode below or just start typing!";

  await sendHTMLWithKeyboard(env, chatId, text, modeKeyboard());
}

// ==========================================
// 🆕 CALLBACK HANDLER
// ==========================================

async function handleCallback(query, env) {
  const data = query.data;
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const messageId = query.message.message_id;

  // Answer callback to stop loading spinner
  await answerCallback(env, query.id);

  if (data.startsWith("mode_")) {
    const mode = data.replace("mode_", "");
    await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
    await env.IVAI_KV.put(CONFIG.KV.MODE + userId, mode);
    const labels = { fast: "🚀 FAST", deep: "🧠 DEEP", code: "💻 CODE", prompt: "🎯 PROMPT MASTER", auto: "🔀 AUTO" };
    await editMessageHTML(env, chatId, messageId, `✅ Mode: <b>${labels[mode]}</b>\n\nSend me anything!`);
    return new Response("ok");
  }

  if (data === "menu_model") {
    await editMessageHTMLWithKeyboard(env, chatId, messageId,
      "<b>🎯 Select a Model</b>\n\nClick a model below:",
      modelListKeyboard(0)
    );
    return new Response("ok");
  }

  if (data === "menu_memory") {
    const mem = await getMemory(userId, env);
    const preview = mem.map((m, i) => `${i + 1}. <b>${m.role}</b>: ${m.content.substring(0, 50)}...`).join("\n");
    await editMessageHTML(env, chatId, messageId, `🧠 <b>Memory (${mem.length})</b>\n${preview || "<i>Empty</i>"}`);
    return new Response("ok");
  }

  if (data === "menu_debug") {
    const debugInfo = await generateDebugInfo(userId, env);
    await editMessageHTML(env, chatId, messageId, debugInfo);
    return new Response("ok");
  }

  if (data === "menu_help") {
    await editMessageHTML(env, chatId, messageId,
      "<b>📖 Quick Help</b>\n\n" +
      "<code>/fast</code> <code>/deep</code> <code>/code</code> <code>/prompt</code> <code>/auto</code> — Modes\n" +
      "<code>/model</code> — Pick model\n" +
      "<code>/memory show</code> <code>/memory clear</code> — Memory\n" +
      "<code>/debug</code> <code>/logs</code> <code>/reset</code> — Tools\n\n" +
      "Just type anything and I'll respond!"
    );
    return new Response("ok");
  }

  if (data === "menu_reset") {
    await env.IVAI_KV.put(CONFIG.KV.FAILED, "{}");
    await env.IVAI_KV.delete(CONFIG.KV.MEMORY + userId);
    await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
    await env.IVAI_KV.delete(CONFIG.KV.MODE + userId);
    await env.IVAI_KV.delete(CONFIG.KV.LOGS + userId);
    await env.IVAI_KV.delete(CONFIG.KV.STATS + userId);
    await editMessageHTML(env, chatId, messageId, "✅ <b>Reset Complete</b>\nAll settings cleared. Starting fresh!");
    return new Response("ok");
  }

  if (data.startsWith("pick_")) {
    const num = parseInt(data.replace("pick_", ""));
    if (num >= 0 && num < ALL_MODELS.length) {
      const selected = ALL_MODELS[num];
      await env.IVAI_KV.put(CONFIG.KV.MODEL + userId, selected.id);
      await editMessageHTML(env, chatId, messageId, 
        `✅ Selected: ${selected.emoji} <b>${selected.name}</b>\nMode → 🎯 <b>SINGLE</b>\n\nSend me anything!`
      );
    }
    return new Response("ok");
  }

  if (data.startsWith("page_")) {
    const page = parseInt(data.replace("page_", ""));
    await editMessageHTMLWithKeyboard(env, chatId, messageId,
      "<b>🎯 Select a Model</b>\n\nClick a model below:",
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
// 🔥 PROCESS MESSAGE (unchanged from v27)
// ==========================================

async function processMessage(prompt, userId, env) {
  const lower = prompt.toLowerCase();
  if (lower === "hi" || lower === "hello" || lower === "سلام" || lower === "hey") {
    return { text: "Hi! 👋 IVAI ready! Try /start for the menu or just type anything.", model: null, emoji: "", tried: 0, mode: "fast", error: false, fromCache: false };
  }

  const selectedModelId = await env.IVAI_KV.get(CONFIG.KV.MODEL + userId);
  if (selectedModelId) {
    return await processWithSelectedModel(prompt, selectedModelId, userId, env);
  }

  return await processParallel(prompt, userId, env);
}

async function processWithSelectedModel(prompt, modelId, userId, env) {
  const model = ALL_MODELS.find(m => m.id === modelId);
  if (!model) {
    await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
    return await processParallel(prompt, userId, env);
  }

  const category = getModelCategory(modelId);
  const context = await getMemory(userId, env);
  const messages = buildMessages(prompt, category, context);
  const apiKey = env.OPENROUTER_API_KEY;

  const cacheKey = await hashKey(`single:${modelId}:${prompt}`);
  const cached = await env.IVAI_KV.get(CONFIG.KV.CACHE + userId + ":" + cacheKey);
  if (cached) {
    const data = JSON.parse(cached);
    if (Date.now() - data.ts < CONFIG.CACHE_TTL * 1000) {
      return { text: data.text, model: model.name, emoji: model.emoji, tried: 0, mode: "selected", error: false, fromCache: true };
    }
  }

  try {
    const result = await callWithFastRetry(messages, model, apiKey, env);
    await saveMemory(userId, { role: "user", content: prompt }, env);
    await saveMemory(userId, { role: "assistant", content: result }, env);
    await saveCache(userId, cacheKey, result, model, env);

    return { text: result, model: model.name, emoji: model.emoji, tried: 1, mode: "selected", error: false, fromCache: false };
  } catch (err) {
    await log(env, userId, "SELECTED_FAIL", `${model.name}: ${err.message.substring(0, 50)}`);

    try {
      const emergencyMsg = [{ role: "user", content: PROMPTS.emergency + "\n\n" + prompt }];
      const result = await callWithFastRetry(emergencyMsg, EMERGENCY_MODEL, apiKey, env);
      return {
        text: result + "\n\n_(⚠️ Selected model failed, emergency fallback)_",
        model: "Emergency 3B",
        emoji: "🆘",
        tried: 2,
        mode: "selected",
        error: false,
        fromCache: false
      };
    } catch (e) {
      return { text: "Selected model failed. Try /model off to switch to auto.", model: model.name, emoji: "💥", tried: 2, mode: "selected", error: true, fromCache: false };
    }
  }
}

async function processParallel(prompt, userId, env) {
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
      return { ...data, tried: 0, emoji: "💾", mode, error: false, fromCache: true };
    }
  }

  const context = await getMemory(userId, env);
  const messages = buildMessages(prompt, mode, context);
  const failed = await getFailedModels(env);
  const apiKey = env.OPENROUTER_API_KEY;

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

  if (parallelModels.length >= 2) {
    triedCount = parallelModels.length;
    try {
      const raceResult = await trueRaceModels(messages, parallelModels, apiKey);

      if (failed[raceResult.model.id]) {
        delete failed[raceResult.model.id];
        await env.IVAI_KV.put(CONFIG.KV.FAILED, JSON.stringify(failed));
      }

      await saveMemory(userId, { role: "user", content: prompt }, env);
      await saveMemory(userId, { role: "assistant", content: raceResult.text }, env);
      await saveCache(userId, cacheKey, raceResult.text, raceResult.model, env);

      return { text: raceResult.text, model: raceResult.model.name, emoji: raceResult.model.emoji, tried: triedCount, mode, error: false, fromCache: false };
    } catch (e) {
      await log(env, userId, "PARALLEL_FAIL", e.message.substring(0, 80));
    }
  }

  const triedIds = new Set(parallelModels.map(m => m.id));
  const remaining = models.filter(m => !isCircuitOpen(m.id, failed) && !triedIds.has(m.id));

  for (const model of remaining) {
    triedCount++;
    try {
      const result = await callWithFastRetry(messages, model, apiKey, env);

      if (failed[model.id]) {
        delete failed[model.id];
        await env.IVAI_KV.put(CONFIG.KV.FAILED, JSON.stringify(failed));
      }

      await saveMemory(userId, { role: "user", content: prompt }, env);
      await saveMemory(userId, { role: "assistant", content: result }, env);
      await saveCache(userId, cacheKey, result, model, env);

      return { text: result, model: model.name, emoji: model.emoji, tried: triedCount, mode, error: false, fromCache: false };
    } catch (err) {
      await log(env, userId, "FAIL", `${model.name}: ${err.message.substring(0, 50)}`);
      recordFailure(model.id, failed, env);
    }
  }

  try {
    const emergencyMsg = [{ role: "user", content: PROMPTS.emergency + "\n\n" + prompt }];
    const result = await callWithFastRetry(emergencyMsg, EMERGENCY_MODEL, apiKey, env);
    return {
      text: result + "\n\n_(⚠️ Emergency)_",
      model: "Emergency 3B",
      emoji: "🆘",
      tried: triedCount + 1,
      mode: "emergency",
      error: false,
      fromCache: false
    };
  } catch (e) {
    return { text: "All models failed. Try /reset", model: null, emoji: "💥", tried: triedCount, mode: "emergency", error: true, fromCache: false };
  }
}

async function trueRaceModels(messages, models, apiKey) {
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
      callAPI(messages, model, apiKey)
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
            pending--;
            checkDone();
          }
        });
    }
  });
}

async function callWithFastRetry(messages, model, apiKey, env, attempt = 1) {
  try {
    return await callAPI(messages, model, apiKey);
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
      msg.includes("404");

    if (isRetryable && attempt < CONFIG.MAX_RETRIES) {
      await new Promise(r => setTimeout(r, CONFIG.RETRY_BASE_DELAY * attempt));
      return callWithFastRetry(messages, model, apiKey, env, attempt + 1);
    }
    throw err;
  }
}

async function callAPI(messages, model, apiKey) {
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
        "X-Title": "IVAI-v28-Premium"
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
// 📤 Telegram — Premium Senders
// ==========================================

async function sendHTML(env, chatId, html) {
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
      const plain = html.replace(/<[^>]+>/g, "");
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

async function sendHTMLWithKeyboard(env, chatId, html, keyboard) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: html.substring(0, 4096),
    parse_mode: "HTML",
    reply_markup: keyboard
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      await sendHTML(env, chatId, html);
    }
  } catch {
    await sendHTML(env, chatId, html);
  }
}

async function editMessageHTML(env, chatId, messageId, html) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`;
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text: html.substring(0, 4096),
    parse_mode: "HTML"
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {}
}

async function editMessageHTMLWithKeyboard(env, chatId, messageId, html, keyboard) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`;
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text: html.substring(0, 4096),
    parse_mode: "HTML",
    reply_markup: keyboard
  };

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

async function sendSmart(env, chatId, text, footer) {
  let fullText = text + (footer || "");

  if (fullText.length > CONFIG.MAX_LENGTH - 100) {
    fullText = smartTruncate(fullText, CONFIG.MAX_LENGTH - 100);
  }

  const hasCodeBlock = /```/.test(fullText);

  if (hasCodeBlock) {
    const ok = await sendRaw(env, chatId, fullText, "Markdown");
    if (!ok) {
      await sendRaw(env, chatId, fullText.replace(/[_*[\]`]/g, ""), null);
    }
  } else {
    const escaped = escapeMarkdown(fullText);
    const ok = await sendRaw(env, chatId, escaped, "Markdown");
    if (!ok) {
      await sendRaw(env, chatId, fullText, null);
    }
  }
}

async function sendRaw(env, chatId, text, parseMode) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: text.substring(0, 4096)
  };
  if (parseMode) body.parse_mode = parseMode;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return res.ok;
  } catch {
    return false;
  }
}

function escapeMarkdown(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[');
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

function buildMessages(prompt, mode, context) {
  const system = PROMPTS[mode] || PROMPTS.fast;
  const messages = [{ role: "system", content: system }];
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
// 🔌 Circuit Breaker
// ==========================================

async function getFailedModels(env) {
  try {
    const data = await env.IVAI_KV.get(CONFIG.KV.FAILED);
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

async function recordFailure(modelId, failed, env) {
  const now = Date.now();
  const current = failed[modelId] || { count: 0, ts: 0 };
  if (now - current.ts < CONFIG.CIRCUIT_COOLDOWN) current.count++;
  else current.count = 1;
  current.ts = now;
  failed[modelId] = current;
  await env.IVAI_KV.put(CONFIG.KV.FAILED, JSON.stringify(failed));
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
      text, model: model.name, emoji: model.emoji, ts: Date.now()
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

async function generateDebugInfo(userId, env) {
  const [currentMode, selectedModelId, failed, stats, lastReq, memory] = await Promise.all([
    env.IVAI_KV.get(CONFIG.KV.MODE + userId),
    env.IVAI_KV.get(CONFIG.KV.MODEL + userId),
    getFailedModels(env),
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
      `• 🔄 ${lastReq.tries} models | ${lastReq.success ? "✅" : "❌"}\n` +
      `• 🕐 ${new Date(lastReq.timestamp).toLocaleTimeString()}`
    : "";

  return `🔧 *Debug v28*\n\n` +
         `👤 User | 🎚 *${mode}*\n` +
         (selectedModel ? `📌 ${selectedModel.emoji} ${selectedModel.name}\n` : "") +
         `📈 ${stats.total}req (✅${stats.success}|❌${stats.fails}|💾${stats.cacheHits || 0})\n` +
         `⏱ Avg: ${avgTime}s | 🧠 ${memory.length}msg\n\n` +
         `🌐 *Models:* ${availableModels}/${modeModels.length} avail\n` +
         `🔌 *Circuit (30s):*\n${circuitStatus}` +
         lastInfo + `\n\n` +
         `⚡ Parallel: 3 groups | 25s timeout | 30s circuit`;
}

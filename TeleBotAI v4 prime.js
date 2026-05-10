// ==========================================
// IVAI Bot v25.0 - Fixed, Updated & Model Selection
// ==========================================
// FIXES:
//   1. Telegram URL spaces (was breaking all sends)
//   2. OpenRouter URL trailing space
//   3. raceModels() was completely broken
//   4. Missing CONFIG.KV.STATS key
//   5. updateStats() never called
//   6. Parallel processing was actually sequential
//   7. 13 dead models removed, replaced with verified live ones
//   8. send() was destroying code block formatting
//   9. Added model selection feature
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

// ==========================================
// 🚀 7 FAST Models (all verified live on OpenRouter)
// ==========================================
const FAST_MODELS = [
  { id: "meta-llama/llama-3.2-3b-instruct:free", name: "Llama 3.2 3B", emoji: "🚀", temp: 0.6, tokens: 8192, group: 1 },
  { id: "nvidia/nemotron-nano-9b-v2:free", name: "Nemotron Nano 9B", emoji: "⚡", temp: 0.5, tokens: 128000, group: 1 },
  { id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B", emoji: "💎", temp: 0.6, tokens: 262144, group: 2 },
  { id: "nvidia/nemotron-3-nano-30b-a3b:free", name: "Nemotron 30B", emoji: "🤖", temp: 0.5, tokens: 256000, group: 2 },
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", emoji: "🦙", temp: 0.6, tokens: 65536, group: 3 },
  { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B", emoji: "🌟", temp: 0.6, tokens: 262144, group: 3 },
  { id: "openai/gpt-oss-20b:free", name: "GPT-OSS 20B", emoji: "🆕", temp: 0.6, tokens: 131072, group: 3 }
];

// ==========================================
// 🧠 8 DEEP Models (all verified live)
// ==========================================
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

// ==========================================
// 💻 7 CODE Models (all verified live)
// ==========================================
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
  emergency: "You are IVAI. Give brief helpful answer. Respond in user's language."
};

// ==========================================
// 🔥 Smart Code Detection (improved)
// ==========================================
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

// ==========================================
// 🎯 Entry Point
// ==========================================
export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("🤖 IVAI v25.0 - Fixed & Updated", { status: 200 });
    }

    try {
      const update = await request.json();
      const msg = update.message;
      if (!msg?.text) return new Response("ok");

      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const text = msg.text.trim();

      // ==================== COMMANDS ====================

      if (text === "/start") {
        await send(env, chatId,
          "🤖 *IVAI v25\\.0 \\/ Fixed & Updated*\n\n" +
          "⚡ *What's New:*\n" +
          "• 22 verified models \\(13 dead removed\\)\n" +
          "• True parallel execution\n" +
          "• Model selection \\(/model\\)\n" +
          "• Fixed URL bugs\n" +
          "• Stats actually work now\n\n" +
          "🚀 /fast \\| 🧠 /deep \\| 💻 /code \\| 🔀 /auto\n" +
          "🎯 /model \\<name\\> \\| /pick \\<num\\> \\| /models"
        );
        return new Response("ok");
      }

      if (["/fast", "/deep", "/code", "/auto"].includes(text)) {
        const mode = text.replace("/", "");
        await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
        await env.IVAI_KV.put(CONFIG.KV.MODE + userId, mode);
        await send(env, chatId, `✅ Mode: *${mode.toUpperCase()}*`);
        return new Response("ok");
      }

      // 🆕 MODEL SELECTION: Show list
      if (text === "/model") {
        const currentModel = await env.IVAI_KV.get(CONFIG.KV.MODEL + userId);
        const currentMode = await env.IVAI_KV.get(CONFIG.KV.MODE + userId) || "auto";

        let header = "🎯 *Select a Model*\n\n";
        if (currentModel) {
          const m = ALL_MODELS.find(x => x.id === currentModel);
          header += `📌 Current: ${m ? m.emoji + " " + m.name : currentModel}\n\n`;
        } else {
          header += `Mode: *${currentMode.toUpperCase()}* \\(auto\\-select\\)\n\n`;
        }
        header += "Use /pick <number> to select:\n\n";

        const fastList = FAST_MODELS.map((m, i) => `${ALL_MODELS.indexOf(m) + 1}. ${m.emoji} ${m.name}`).join("\n");
        const deepList = DEEP_MODELS.map((m, i) => `${ALL_MODELS.indexOf(m) + 1}. ${m.emoji} ${m.name}`).join("\n");
        const codeList = CODE_MODELS.map((m, i) => `${ALL_MODELS.indexOf(m) + 1}. ${m.emoji} ${m.name}`).join("\n");

        const fullText = header +
          `*🚀 Fast:*\n${fastList}\n\n` +
          `*🧠 Deep:*\n${deepList}\n\n` +
          `*💻 Code:*\n${codeList}\n\n` +
          `Use /model off to return to auto\\-mode`;

        await send(env, chatId, fullText);
        return new Response("ok");
      }

      // 🆕 PICK MODEL BY NUMBER
      if (text.startsWith("/pick ")) {
        const num = parseInt(text.split(" ")[1]);
        if (isNaN(num) || num < 1 || num > ALL_MODELS.length) {
          await send(env, chatId, `❌ Invalid number\\. Use /model to see list \\(1\\-${ALL_MODELS.length}\\)`);
          return new Response("ok");
        }

        const selected = ALL_MODELS[num - 1];
        await env.IVAI_KV.put(CONFIG.KV.MODEL + userId, selected.id);
        await send(env, chatId, `✅ Selected: ${selected.emoji} *${selected.name}*\nMode → 🎯 *SINGLE*`);
        return new Response("ok");
      }

      // 🆕 CLEAR MODEL SELECTION
      if (text === "/model off" || text === "/model auto" || text === "/model clear") {
        await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
        await send(env, chatId, "✅ Back to auto\\-mode");
        return new Response("ok");
      }

      if (text === "/memory show") {
        const mem = await getMemory(userId, env);
        const preview = mem.map((m, i) => `${i + 1}. *${m.role}*: ${m.content.substring(0, 50)}...`).join("\n");
        await send(env, chatId, `🧠 *Memory \\(${mem.length}\\)*\n${preview || "_Empty_"}`);
        return new Response("ok");
      }

      if (text === "/memory clear") {
        await env.IVAI_KV.delete(CONFIG.KV.MEMORY + userId);
        await send(env, chatId, "🗑️ Memory cleared");
        return new Response("ok");
      }

      if (text === "/debug") {
        const debugInfo = await generateDebugInfo(userId, env);
        await send(env, chatId, debugInfo);
        return new Response("ok");
      }

      if (text === "/models") {
        const formatModel = (m, i) => `${i + 1}. ${m.emoji} *${m.name}* \\| G${m.group}`;

        const msg1 = `📋 *${ALL_MODELS.length} Verified Models*\n\n*🚀 Fast:*\n${FAST_MODELS.map(formatModel).join("\n")}`;
        const msg2 = `*🧠 Deep:*\n${DEEP_MODELS.map(formatModel).join("\n")}`;
        const msg3 = `*💻 Code:*\n${CODE_MODELS.map(formatModel).join("\n")}`;

        await send(env, chatId, msg1);
        await send(env, chatId, msg2);
        await send(env, chatId, msg3);
        return new Response("ok");
      }

      if (text === "/logs") {
        const logs = await env.IVAI_KV.get(CONFIG.KV.LOGS + userId) || "[]";
        const recent = JSON.parse(logs).slice(-10).map(l => `• \`${l.t}\` [${l.l}] ${l.m}`).join("\n");
        await send(env, chatId, `🐛 *Logs*\n${recent || "_No logs_"}`);
        return new Response("ok");
      }

      if (text === "/reset") {
        await env.IVAI_KV.put(CONFIG.KV.FAILED, "{}");
        await env.IVAI_KV.delete(CONFIG.KV.MEMORY + userId);
        await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
        await env.IVAI_KV.delete(CONFIG.KV.MODE + userId);
        await env.IVAI_KV.delete(CONFIG.KV.LOGS + userId);
        await env.IVAI_KV.delete(CONFIG.KV.STATS + userId);
        await send(env, chatId, "✅ Reset complete");
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

        // 🔧 FIX: Actually update stats
        await updateStats(userId, result.error ? "fail" : "success", parseFloat(duration), env);

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
        const tried = result.tried > 1 ? ` \`(${result.tried} models)\`` : "";

        await sendSmart(env, chatId, result.text, footer + tried);

      } catch (err) {
        typingActive = false;
        clearInterval(typingInterval);
        await log(env, userId, "FATAL", err.message);
        await send(env, chatId, "💥 *Error*\nTry /reset");
      }

      return new Response("ok");

    } catch (err) {
      return new Response("ok");
    }
  }
};

// ==========================================
// 🔥 PROCESS MESSAGE - With model selection
// ==========================================

async function processMessage(prompt, userId, env) {
  const lower = prompt.toLowerCase();
  if (lower === "hi" || lower === "hello" || lower === "سلام" || lower === "hey") {
    return { text: "Hi! 👋 IVAI ready!", model: null, emoji: "", tried: 0, mode: "fast", error: false };
  }

  // 🆕 CHECK: If user selected a specific model, use ONLY that
  const selectedModelId = await env.IVAI_KV.get(CONFIG.KV.MODEL + userId);
  if (selectedModelId) {
    return await processWithSelectedModel(prompt, selectedModelId, userId, env);
  }

  // Otherwise, use mode-based parallel processing
  return await processParallel(prompt, userId, env);
}

// ==========================================
// 🆕 Process with user-selected specific model
// ==========================================

async function processWithSelectedModel(prompt, modelId, userId, env) {
  const model = ALL_MODELS.find(m => m.id === modelId);
  if (!model) {
    // Model no longer valid, clear selection
    await env.IVAI_KV.delete(CONFIG.KV.MODEL + userId);
    return await processParallel(prompt, userId, env);
  }

  const context = await getMemory(userId, env);
  const messages = buildMessages(prompt, "fast", context);
  const apiKey = env.OPENROUTER_API_KEY;

  // Check cache
  const cacheKey = await hashKey(`single:${modelId}:${prompt}`);
  const cached = await env.IVAI_KV.get(CONFIG.KV.CACHE + userId + ":" + cacheKey);
  if (cached) {
    const data = JSON.parse(cached);
    if (Date.now() - data.ts < CONFIG.CACHE_TTL * 1000) {
      await updateStats(userId, "cache_hit", 0, env);
      return { text: data.text, model: model.name, emoji: model.emoji, tried: 0, mode: "selected", error: false };
    }
  }

  try {
    const result = await callWithFastRetry(messages, model, apiKey, env);

    await saveMemory(userId, { role: "user", content: prompt }, env);
    await saveMemory(userId, { role: "assistant", content: result }, env);
    await saveCache(userId, cacheKey, result, model, env);

    return { text: result, model: model.name, emoji: model.emoji, tried: 1, mode: "selected", error: false };
  } catch (err) {
    await log(env, userId, "SELECTED_FAIL", `${model.name}: ${err.message.substring(0, 50)}`);

    // Fallback: try emergency
    try {
      const emergencyMsg = [{ role: "user", content: PROMPTS.emergency + "\n\n" + prompt }];
      const result = await callWithFastRetry(emergencyMsg, EMERGENCY_MODEL, apiKey, env);
      return {
        text: result + "\n\n_(⚠️ Selected model failed, emergency fallback)_",
        model: "Emergency 3B",
        emoji: "🆘",
        tried: 2,
        mode: "selected",
        error: false
      };
    } catch (e) {
      return { text: "Selected model failed. Try /model off to switch to auto.", model: model.name, emoji: "💥", tried: 2, mode: "selected", error: true };
    }
  }
}

// ==========================================
// 🔥 PARALLEL PROCESSING - Actually parallel!
// ==========================================

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
  else models = [...FAST_MODELS];

  // Cache
  const cacheKey = await hashKey(`${mode}:${prompt}`);
  const cached = await env.IVAI_KV.get(CONFIG.KV.CACHE + userId + ":" + cacheKey);
  if (cached) {
    const data = JSON.parse(cached);
    if (Date.now() - data.ts < CONFIG.CACHE_TTL * 1000) {
      await updateStats(userId, "cache_hit", 0, env);
      return { ...data, tried: 0, emoji: "💾", mode, error: false };
    }
  }

  const context = await getMemory(userId, env);
  const messages = buildMessages(prompt, mode, context);
  const failed = await getFailedModels(env);
  const apiKey = env.OPENROUTER_API_KEY;

  // 🔥 FIX: TRUE PARALLEL - Pick best from each group, race them!
  const availableByGroup = {};
  for (const m of models) {
    if (isCircuitOpen(m.id, failed)) continue;
    if (!availableByGroup[m.group]) availableByGroup[m.group] = [];
    availableByGroup[m.group].push(m);
  }

  // Pick top model from each group for parallel race
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

      if (raceResult) {
        // Clear from failed
        if (failed[raceResult.model.id]) {
          delete failed[raceResult.model.id];
          await env.IVAI_KV.put(CONFIG.KV.FAILED, JSON.stringify(failed));
        }

        await saveMemory(userId, { role: "user", content: prompt }, env);
        await saveMemory(userId, { role: "assistant", content: raceResult.text }, env);
        await saveCache(userId, cacheKey, raceResult.text, raceResult.model, env);

        return { text: raceResult.text, model: raceResult.model.name, emoji: raceResult.model.emoji, tried: 1, mode, error: false };
      }
    } catch (e) {
      await log(env, userId, "PARALLEL_FAIL", e.message.substring(0, 80));
      // Record failures for all parallel models
      for (const m of parallelModels) {
        recordFailure(m.id, failed, env);
      }
    }
  }

  // Fallback: Try remaining models sequentially
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

      return { text: result, model: model.name, emoji: model.emoji, tried: triedCount, mode, error: false };
    } catch (err) {
      await log(env, userId, "FAIL", `${model.name}: ${err.message.substring(0, 50)}`);
      recordFailure(model.id, failed, env);
    }
  }

  // Emergency fallback
  try {
    const emergencyMsg = [{ role: "user", content: PROMPTS.emergency + "\n\n" + prompt }];
    const result = await callWithFastRetry(emergencyMsg, EMERGENCY_MODEL, apiKey, env);

    return {
      text: result + "\n\n_(⚠️ Emergency)_",
      model: "Emergency 3B",
      emoji: "🆘",
      tried: triedCount + 1,
      mode: "emergency",
      error: false
    };
  } catch (e) {
    return { text: "All models failed. Try /reset", model: null, emoji: "💥", tried: triedCount, mode, error: true };
  }
}

// ==========================================
// 🏁 TRUE PARALLEL RACE - Fixed implementation
// ==========================================

async function trueRaceModels(messages, models, apiKey) {
  // 🔧 FIX: Old raceModels was completely broken
  // New approach: Promise.any-like - returns first SUCCESS, rejects if ALL fail

  return new Promise((resolve, reject) => {
    let settledCount = 0;
    let successCount = 0;
    const total = models.length;
    const errors = [];

    for (const model of models) {
      callAPI(messages, model, apiKey)
        .then(result => {
          successCount++;
          // First success wins! Resolve immediately
          resolve({ text: result, model: model });
        })
        .catch(err => {
          settledCount++;
          errors.push(`${model.name}: ${err.message?.substring(0, 40)}`);
          // If all failed, reject
          if (settledCount === total) {
            reject(new Error(`All ${total} parallel models failed: ${errors.join("; ")}`));
          }
        });
    }

    // Safety timeout
    setTimeout(() => {
      if (successCount === 0) {
        reject(new Error(`Parallel timeout (${CONFIG.PARALLEL_TIMEOUT}ms)`));
      }
    }, CONFIG.PARALLEL_TIMEOUT);
  });
}

// ==========================================
// ⚡ FAST RETRY
// ==========================================

async function callWithFastRetry(messages, model, apiKey, env, attempt = 1) {
  try {
    return await callAPI(messages, model, apiKey);
  } catch (err) {
    const isRetryable =
      err.message?.includes("5") ||
      err.message?.includes("429") ||
      err.message?.includes("timeout") ||
      err.message?.includes("abort") ||
      err.message?.includes("fetch") ||
      err.message?.includes("network") ||
      err.message?.includes("overloaded") ||
      err.message?.includes("404");

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
    // 🔧 FIX: Removed trailing space from URL
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://t.me/IVAIBot",
        "X-Title": "IVAI-v25-Fixed"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (res.status === 404) {
      throw new Error(`404: Model not found`);
    }

    if (res.status === 429) {
      throw new Error(`429: Rate limited`);
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
// 📤 Telegram - 🔧 ALL URL BUGS FIXED
// ==========================================

async function sendSmart(env, chatId, text, footer) {
  const hasCodeBlock = /```[\s\S]*?```/.test(text);

  let fullText = text + (footer || "");

  if (fullText.length > CONFIG.MAX_LENGTH - 100) {
    fullText = smartTruncate(fullText, CONFIG.MAX_LENGTH - 100);
  }

  if (hasCodeBlock) {
    // 🔧 FIX: Better code block handling
    try {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: fullText.substring(0, 4000),
          parse_mode: "Markdown"
        })
      });
      return;
    } catch (e) {
      // Fallback to plain text
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: fullText.substring(0, 4000)
        })
      });
      return;
    }
  }

  // Default path
  await send(env, chatId, fullText);
}

async function send(env, chatId, text) {
  // 🔧 FIX: Removed space from URL (was "bot " + token, now "bot" + token)
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  if (text.length > CONFIG.MAX_LENGTH) {
    text = smartTruncate(text, CONFIG.MAX_LENGTH);
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown"
      })
    });

    if (!res.ok) {
      // Fallback without Markdown
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text.replace(/[_*[\]`]/g, "").substring(0, 4000)
        })
      });
    }
  } catch (e) {
    // Last resort: plain text
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.substring(0, 4000)
      })
    });
  }
}

async function sendTyping(env, chatId) {
  try {
    // 🔧 FIX: Removed space from URL
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

  if (context.length > 0) {
    messages.push(...context);
  }
  messages.push({ role: "user", content: prompt });

  return messages;
}

function smartTruncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  let cutPoint = text.lastIndexOf("\n\n", maxLen - 100);
  if (cutPoint < maxLen * 0.7) cutPoint = text.lastIndexOf(". ", maxLen - 50);
  if (cutPoint < maxLen * 0.7) cutPoint = text.lastIndexOf(" ", maxLen - 20);

  if (cutPoint > 100) {
    return text.substring(0, cutPoint) + "\n\n_... [truncated]_";
  }
  return text.substring(0, maxLen - 20) + "\n\n_..._";
}

// ==========================================
// 📊 Stats - 🔧 FIXED (was broken before)
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
  } catch {
    return null;
  }
}

async function saveLastRequest(userId, data, env) {
  try {
    await env.IVAI_KV.put(CONFIG.KV.LAST + userId, JSON.stringify(data), { expirationTtl: 3600 });
  } catch {}
}

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
  } catch {
    return {};
  }
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

async function getMemory(userId, env) {
  try {
    const data = await env.IVAI_KV.get(CONFIG.KV.MEMORY + userId);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
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
  const [currentMode, selectedModel, failed, stats, lastReq, memory] = await Promise.all([
    env.IVAI_KV.get(CONFIG.KV.MODE + userId),
    env.IVAI_KV.get(CONFIG.KV.MODEL + userId),
    getFailedModels(env),
    getStats(userId, env),
    getLastRequest(userId, env),
    getMemory(userId, env)
  ]);

  const mode = currentMode || "auto";
  const modelInfo = selectedModel
    ? `📌 Model: ${ALL_MODELS.find(m => m.id === selectedModel)?.name || selectedModel}\n`
    : "";

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
    return [...FAST_MODELS, ...DEEP_MODELS, ...CODE_MODELS];
  };

  const modeModels = getModeModels(mode);
  const availableModels = modeModels.filter(m => !isCircuitOpen(m.id, failed)).length;

  const lastInfo = lastReq
    ? `\n📊 *Last:*\n` +
      `• ${lastReq.model} | ${lastReq.mode}\n` +
      `• ⏱ ${lastReq.duration}s | 📝 ${lastReq.length}ch\n` +
      `• 🔄 ${lastReq.tries} models | ${lastReq.success ? "✅" : "❌"}\n` +
      `• 🕐 ${new Date(lastReq.timestamp).toLocaleTimeString()}`
    : "";

  return `🔧 *Debug v25*\n\n` +
         `👤 User | 🎚 *${mode.toUpperCase()}*\n` +
         modelInfo +
         `📈 ${stats.total}req (✅${stats.success}|❌${stats.fails}|💾${stats.cacheHits || 0})\n` +
         `⏱ Avg: ${avgTime}s | 🧠 ${memory.length}msg\n\n` +
         `🌐 *Models:* ${availableModels}/${modeModels.length} avail\n` +
         `🔌 *Circuit (30s):*\n${circuitStatus}` +
         lastInfo + `\n\n` +
         `⚡ Parallel: 3 groups | 25s timeout | 30s circuit`;
}

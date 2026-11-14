import { APP, defaultFreeModelFor, FREE_MODEL_POLICY, getBrand, getLanguageOption, MODES } from "./config.js";
import { responseProfile, resolveResponseMode } from "./response-profile.js";
import { reserveWorkersAiBudget } from "./security.js";

// Hard timeouts (mirroring media.js): one stuck provider must never stall the
// whole fallback chain until the platform kills the invocation.
const FETCH_TIMEOUT_MS = 15_000;
const BINDING_TIMEOUT_MS = 25_000;
const CHAIN_DEADLINE_MS = 45_000;

function fetchWithTimeout(url, init = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Binding calls (env.AI.run) cannot be aborted, so race them against a timer;
// the abandoned call is left behind and the chain moves on. Exported so the
// media paths (media.js) race their binding calls the same way.
export function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function systemInstruction(profile, language) {
  const brand = getBrand();
  const selectedLanguage = getLanguageOption(language);
  const languageInstruction = `Respond in ${selectedLanguage.label} unless the user explicitly requests another language. Keep UI-facing labels concise and natural for ${selectedLanguage.native}.`;
  const richFormattingInstruction = profile.allowRichMath
    ? "When a mathematical expression improves clarity, use `$...$` for a short inline formula or a fenced `math` block for a short display formula. Use visible `[^note]: text` footnotes only for genuinely provided or clearly qualified notes; never invent sources, citations, hidden reasoning, policies, or internal instructions."
    : "Do not rely on rich mathematical or footnote syntax; keep the response broadly compatible.";
  return `${brand.name} is a ${brand.voice} assistant. ${brand.rule} ${profile.instruction} ${richFormattingInstruction} ${languageInstruction}`;
}

function normalizeMessages({ text, context, profile, language }) {
  const system = { role: "system", content: systemInstruction(profile, language) };
  const memory = (context || []).slice(-APP.maxContextMessages).map((entry) => ({
    role: entry.role === "assistant" ? "assistant" : "user",
    content: String(entry.content || "").slice(0, 3000)
  }));
  return [system, ...memory, { role: "user", content: String(text).slice(0, APP.maxInputCharacters) }];
}

function guardReplyText(raw, language) {
  const verdict = String(raw || "").trim().toLowerCase();
  if (/^unsafe\b/.test(verdict)) {
    return language === "fa"
      ? "**نتیجهٔ Guard: نیازمند احتیاط**\n\nاین پیام توسط classifier ایمنی به‌عنوان محتوای بالقوه ناامن علامت‌گذاری شد. در Guard Mode پردازش بیشتر انجام نمی‌شود."
      : "**Guard result: caution required**\n\nThe safety classifier flagged this input as potentially unsafe. Guard Mode will not process it further.";
  }
  if (/^safe\b/.test(verdict)) {
    return language === "fa"
      ? "**نتیجهٔ Guard: بدون دسته‌بندی ایمنی**\n\nGuard بررسی را انجام داد و دستهٔ ناامنی مشخصی علامت‌گذاری نشد. برای پاسخ کامل، حالت دیگری مانند /auto را انتخاب کنید."
      : "**Guard result: no safety category flagged**\n\nGuard completed a safety check without flagging a category. Choose another mode such as /auto for a full answer.";
  }
  return language === "fa"
    ? "**نتیجهٔ Guard: نامشخص**\n\nclassifier ایمنی نتیجهٔ قابل‌تفسیر برنگرداند؛ برای احتیاط، Guard Mode پاسخ محتوایی تولید نکرد."
    : "**Guard result: inconclusive**\n\nThe safety classifier did not return a recognizable verdict, so Guard Mode did not generate a content response.";
}

async function runGuard({ text, language }, env) {
  if (!env.AI?.run) throw new Error("Workers AI is not configured");
  const profile = responseProfile(MODES.GUARD);
  const budget = await reserveWorkersAiBudget(profile.workersAiReserve, env);
  if (!budget.allowed) throw new Error("Workers AI free quota guard blocked Guard Mode");
  const model = FREE_MODEL_POLICY.workersAi.guard[0];
  const result = await withTimeout(env.AI.run(model, {
    messages: [{ role: "user", content: String(text).slice(0, APP.maxInputCharacters) }],
    max_tokens: 96,
    temperature: 0
  }), BINDING_TIMEOUT_MS, "Workers AI");
  const raw = result?.response || result?.result?.response || result?.choices?.[0]?.message?.content;
  if (!String(raw || "").trim()) throw new Error("Llama Guard returned an empty response");
  return { text: guardReplyText(raw, language), provider: "workers-ai", model };
}

async function runWorkersAi({ messages, profile, selectedModel, maxTokens }, env) {
  if (!env.AI?.run) throw new Error("Workers AI is not configured");
  const budget = await reserveWorkersAiBudget(profile.workersAiReserve, env);
  if (!budget.allowed) throw new Error("Workers AI free quota guard blocked the request");
  const model = FREE_MODEL_POLICY.workersAi.text.includes(selectedModel)
    ? selectedModel
    : defaultFreeModelFor("workers-ai");
  const result = await withTimeout(env.AI.run(model, {
    messages,
    // A call site may override the profile's output budget (channel-post
    // comments do — see CHANNEL_COMMENT_MAX_TOKENS in router.js).
    max_tokens: maxTokens ?? profile.maxOutputTokens,
    temperature: profile.temperature
  }), BINDING_TIMEOUT_MS, "Workers AI");
  const text = result?.response || result?.result?.response || result?.choices?.[0]?.message?.content;
  if (!String(text || "").trim()) throw new Error("Workers AI returned an empty response");
  return { text: String(text).trim(), provider: "workers-ai", model };
}

function isOpenRouterFreeModel(model) {
  return model === "openrouter/free" || String(model || "").endsWith(":free");
}

async function runOpenRouter({ messages, profile, selectedModel }, env) {
  if (!env.OPENROUTER_API_KEY) throw new Error("OpenRouter is not configured");
  const model = isOpenRouterFreeModel(selectedModel)
    ? selectedModel
    : defaultFreeModelFor("openrouter");
  const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "http-referer": "https://t.me/IVAI_Llm_bot",
      "x-title": "IVAI"
    },
    body: JSON.stringify({ model, messages, max_tokens: profile.maxOutputTokens, temperature: profile.temperature })
  });
  if (!response.ok) throw new Error(`OpenRouter failed: ${response.status}`);
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (!String(text || "").trim()) throw new Error("OpenRouter returned an empty response");
  return { text: String(text).trim(), provider: "openrouter", model: payload.model || model };
}

async function runGroq({ messages, profile, selectedModel }, env) {
  if (!env.GROQ_API_KEY) throw new Error("Groq is not configured");
  const model = FREE_MODEL_POLICY.groq.includes(selectedModel)
    ? selectedModel
    : defaultFreeModelFor("groq");
  const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: Math.min(profile.maxOutputTokens, 1024), temperature: profile.temperature })
  });
  if (!response.ok) throw new Error(`Groq failed: ${response.status}`);
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (!String(text || "").trim()) throw new Error("Groq returned an empty response");
  return { text: String(text).trim(), provider: "groq", model };
}

async function runGoogle({ messages, profile, selectedModel }, env) {
  if (!env.GOOGLE_API_KEY) throw new Error("Google AI Studio is not configured");
  const model = FREE_MODEL_POLICY.google.includes(selectedModel)
    ? selectedModel
    : defaultFreeModelFor("google");
  const system = messages.find((message) => message.role === "system")?.content || "";
  const contents = messages.filter((message) => message.role !== "system").map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GOOGLE_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: profile.maxOutputTokens, temperature: profile.temperature }
    })
  });
  if (!response.ok) throw new Error(`Google AI Studio failed: ${response.status}`);
  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
  if (!String(text || "").trim()) throw new Error("Google AI Studio returned an empty response");
  return { text: String(text).trim(), provider: "google", model };
}

// BYOK ("My API", v3.8.0): one OpenAI-compatible runner for every preset and
// Custom endpoint — the same chat-completion shape as runGroq, pointed at the
// user's base URL with their key. Thinking models may answer in
// reasoning_content, so that counts as content. The key never appears in an
// error message or a log line.
export async function runCustomApi({ messages, profile, byokConfig, maxTokens }, env) {
  const baseUrl = String(byokConfig?.baseUrl || "").replace(/\/+$/, "");
  const model = byokConfig?.model;
  if (!baseUrl || !model || !byokConfig?.apiKey) throw new Error("Custom API is not configured");
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${byokConfig.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens ?? profile.maxOutputTokens, temperature: profile.temperature })
  });
  if (!response.ok) throw new Error(`Custom API failed: ${response.status}`);
  const payload = await response.json();
  const message = payload?.choices?.[0]?.message;
  const text = message?.content || message?.reasoning_content;
  if (!String(text || "").trim()) throw new Error("Custom API returned an empty response");
  return { text: String(text).trim(), provider: "byok", model: payload.model || model };
}

export async function generateReply({ text, selectedMode, selectedModel, language, context, maxTokens, byokConfig }, env) {
  const profile = responseProfile(selectedMode);
  if (profile.mode === MODES.GUARD) return { ...(await runGuard({ text, language }, env)), mode: profile.mode };
  const messages = normalizeMessages({ text, context, profile, language });
  // BYOK first (private chats only — the caller never passes a config for
  // group turns, and Guard never reaches this branch): the user's own API
  // answers; on any failure the free chain takes over and the caller adds a
  // one-line notice (fellBackFromByok). A 401 is flagged so the caller can
  // count it toward invalidating a dead key.
  let byokAttempted = false;
  let byokAuthFailed = false;
  if (byokConfig?.enabled && byokConfig?.status === "valid" && byokConfig?.apiKey && byokConfig?.baseUrl && byokConfig?.model) {
    byokAttempted = true;
    try {
      return { ...(await runCustomApi({ messages, profile, byokConfig, maxTokens }, env)), mode: profile.mode, fellBackFromByok: false, byokAuthFailed: false };
    } catch (error) {
      const message = String(error.message || error);
      byokAuthFailed = /401/.test(message);
      console.error(JSON.stringify({ event: "provider_attempt_failed", provider: "byok", error: message.slice(0, 120) }));
    }
  }
  const preferred = selectedModel?.startsWith("@cf/") ? runWorkersAi
    : isOpenRouterFreeModel(selectedModel) ? runOpenRouter
      : FREE_MODEL_POLICY.groq.includes(selectedModel) ? runGroq
        : FREE_MODEL_POLICY.google.includes(selectedModel) ? runGoogle
          : null;
  const attempts = preferred ? [preferred, ...[runWorkersAi, runOpenRouter, runGroq, runGoogle].filter((attempt) => attempt !== preferred)] : [runWorkersAi, runOpenRouter, runGroq, runGoogle];
  const providerOf = new Map([[runWorkersAi, "workers-ai"], [runOpenRouter, "openrouter"], [runGroq, "groq"], [runGoogle, "google"]]);
  const startedAt = Date.now();
  const failures = [];
  for (const [index, attempt] of attempts.entries()) {
    // Overall deadline: never start another attempt once the chain has burned
    // its budget — bail out so the caller's failure path still runs.
    if (index > 0 && Date.now() - startedAt > CHAIN_DEADLINE_MS) break;
    const attemptStartedAt = Date.now();
    try {
      return { ...(await attempt({ messages, profile, selectedModel, maxTokens }, env)), mode: profile.mode, fellBackFromByok: byokAttempted, byokAuthFailed };
    } catch (error) {
      const message = String(error.message || error);
      failures.push(message.slice(0, 100));
      console.error(JSON.stringify({ event: "provider_attempt_failed", provider: providerOf.get(attempt), ms: Date.now() - attemptStartedAt, error: message.slice(0, 120) }));
    }
  }
  throw new Error(`No free AI provider is currently available: ${failures.join(" | ")}`);
}

// Retained for compatibility with existing callers/tests; `_text` is deliberately
// not a routing signal because Auto is a first-class response mode.
export function getDetectedMode(_text, selectedMode) {
  return resolveResponseMode(selectedMode);
}

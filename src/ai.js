import { APP, defaultFreeModelFor, FREE_MODEL_POLICY, getBrand, getLanguageOption, MODES } from "./config.js";
import { responseProfile, resolveResponseMode } from "./response-profile.js";
import { reserveWorkersAiBudget } from "./security.js";

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
  const result = await env.AI.run(model, {
    messages: [{ role: "user", content: String(text).slice(0, APP.maxInputCharacters) }],
    max_tokens: 96,
    temperature: 0
  });
  const raw = result?.response || result?.result?.response || result?.choices?.[0]?.message?.content;
  if (!String(raw || "").trim()) throw new Error("Llama Guard returned an empty response");
  return { text: guardReplyText(raw, language), provider: "workers-ai", model };
}

async function runWorkersAi({ messages, profile, selectedModel }, env) {
  if (!env.AI?.run) throw new Error("Workers AI is not configured");
  const budget = await reserveWorkersAiBudget(profile.workersAiReserve, env);
  if (!budget.allowed) throw new Error("Workers AI free quota guard blocked the request");
  const model = FREE_MODEL_POLICY.workersAi.text.includes(selectedModel)
    ? selectedModel
    : defaultFreeModelFor("workers-ai");
  const result = await env.AI.run(model, {
    messages,
    max_tokens: profile.maxOutputTokens,
    temperature: profile.temperature
  });
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
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GOOGLE_API_KEY}`, {
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

export async function generateReply({ text, selectedMode, selectedModel, language, context }, env) {
  const profile = responseProfile(selectedMode);
  if (profile.mode === MODES.GUARD) return { ...(await runGuard({ text, language }, env)), mode: profile.mode };
  const messages = normalizeMessages({ text, context, profile, language });
  const preferred = selectedModel?.startsWith("@cf/") ? runWorkersAi
    : isOpenRouterFreeModel(selectedModel) ? runOpenRouter
      : FREE_MODEL_POLICY.groq.includes(selectedModel) ? runGroq
        : FREE_MODEL_POLICY.google.includes(selectedModel) ? runGoogle
          : null;
  const attempts = preferred ? [preferred, ...[runWorkersAi, runOpenRouter, runGroq, runGoogle].filter((attempt) => attempt !== preferred)] : [runWorkersAi, runOpenRouter, runGroq, runGoogle];
  const failures = [];
  for (const attempt of attempts) {
    try {
      return { ...(await attempt({ messages, profile, selectedModel }, env)), mode: profile.mode };
    } catch (error) {
      failures.push(String(error.message || error).slice(0, 100));
    }
  }
  throw new Error(`No free AI provider is currently available: ${failures.join(" | ")}`);
}

// Retained for compatibility with existing callers/tests; `_text` is deliberately
// not a routing signal because Auto is a first-class response mode.
export function getDetectedMode(_text, selectedMode) {
  return resolveResponseMode(selectedMode);
}

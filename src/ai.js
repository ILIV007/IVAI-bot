import { APP, FREE_MODEL_POLICY, MODES, modeOutputLimit, getBrand } from "./config.js";
import { reserveWorkersAiBudget } from "./security.js";

function detectMode(text, selectedMode) {
  if (selectedMode && selectedMode !== MODES.AUTO) return selectedMode;
  const source = String(text || "");
  if (/```|\b(function|class|debug|typescript|javascript|python|sql|api|کد|برنامه|باگ)\b/i.test(source)) return MODES.CODE;
  if (source.length > 280 || /\b(analyze|explain|compare|reason|strategy|تحلیل|توضیح|مقایسه|استدلال)\b/i.test(source)) return MODES.DEEP;
  return MODES.FAST;
}

function systemInstruction(mode, language) {
  const brand = getBrand();
  const languageInstruction = language === "fa" ? "Respond in Persian unless the user explicitly requests another language." : "Respond in the user's language.";
  const modeInstruction = {
    [MODES.FAST]: "Give a concise and accurate answer. Do not add unnecessary sections.",
    [MODES.DEEP]: "Give a structured, carefully reasoned answer, but avoid hidden chain-of-thought. State concise reasoning and conclusions.",
    [MODES.CODE]: "Provide correct, secure, production-minded code with a short explanation and fenced code blocks when appropriate.",
    [MODES.PROMPT]: "Transform the request into a precise reusable prompt. Include an optimized prompt and brief usage notes.",
    [MODES.GUARD]: "Prioritize safety, clarity, and concise moderation guidance.",
    [MODES.SECRETARY]: "Turn the request into clear notes, tasks, dates, and next actions. Do not invent commitments.",
    [MODES.MANAGEMENT]: "Assist with community management using concise, transparent, actionable guidance.",
    [MODES.THREAD]: "Treat this conversation or Telegram topic as a focused work thread. Keep context scoped to the thread, summarize decisions briefly, and end with the next useful action when appropriate."
  }[mode] || "Give a helpful, accurate response.";
  return `${brand.name} is a ${brand.voice} assistant. ${brand.rule} ${modeInstruction} ${languageInstruction}`;
}

function normalizeMessages({ text, context, mode, language }) {
  const system = { role: "system", content: systemInstruction(mode, language) };
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
  const budget = await reserveWorkersAiBudget(1, env);
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

async function runWorkersAi({ messages, mode, selectedModel }, env) {
  if (!env.AI?.run) throw new Error("Workers AI is not configured");
  const budget = await reserveWorkersAiBudget(mode === MODES.DEEP ? 4 : 2, env);
  if (!budget.allowed) throw new Error("Workers AI free quota guard blocked the request");
  const model = FREE_MODEL_POLICY.workersAi.text.includes(selectedModel) ? selectedModel : FREE_MODEL_POLICY.workersAi.text[0];
  const result = await env.AI.run(model, {
    messages,
    max_tokens: modeOutputLimit(mode),
    temperature: mode === MODES.CODE ? 0.2 : 0.55
  });
  const text = result?.response || result?.result?.response || result?.choices?.[0]?.message?.content;
  if (!String(text || "").trim()) throw new Error("Workers AI returned an empty response");
  return { text: String(text).trim(), provider: "workers-ai", model };
}

async function runOpenRouter({ messages, mode, selectedModel }, env) {
  if (!env.OPENROUTER_API_KEY) throw new Error("OpenRouter is not configured");
  const model = selectedModel?.endsWith(":free") ? selectedModel : FREE_MODEL_POLICY.openRouter[mode === MODES.CODE ? 1 : 0];
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "http-referer": "https://t.me/IVAI_Llm_bot",
      "x-title": "IVAI"
    },
    body: JSON.stringify({ model, messages, max_tokens: modeOutputLimit(mode), temperature: mode === MODES.CODE ? 0.2 : 0.55 })
  });
  if (!response.ok) throw new Error(`OpenRouter failed: ${response.status}`);
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (!String(text || "").trim()) throw new Error("OpenRouter returned an empty response");
  return { text: String(text).trim(), provider: "openrouter", model: payload.model || model };
}

async function runGroq({ messages, mode, selectedModel }, env) {
  if (!env.GROQ_API_KEY) throw new Error("Groq is not configured");
  const model = FREE_MODEL_POLICY.groq.includes(selectedModel) ? selectedModel : FREE_MODEL_POLICY.groq[0];
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: Math.min(modeOutputLimit(mode), 1024), temperature: 0.55 })
  });
  if (!response.ok) throw new Error(`Groq failed: ${response.status}`);
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (!String(text || "").trim()) throw new Error("Groq returned an empty response");
  return { text: String(text).trim(), provider: "groq", model };
}

async function runGoogle({ messages, mode, selectedModel }, env) {
  if (!env.GOOGLE_API_KEY) throw new Error("Google AI Studio is not configured");
  const model = FREE_MODEL_POLICY.google.includes(selectedModel) ? selectedModel : FREE_MODEL_POLICY.google[0];
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
      generationConfig: { maxOutputTokens: modeOutputLimit(mode), temperature: 0.55 }
    })
  });
  if (!response.ok) throw new Error(`Google AI Studio failed: ${response.status}`);
  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
  if (!String(text || "").trim()) throw new Error("Google AI Studio returned an empty response");
  return { text: String(text).trim(), provider: "google", model };
}

export async function generateReply({ text, selectedMode, selectedModel, language, context }, env) {
  const mode = detectMode(text, selectedMode);
  if (mode === MODES.GUARD) return { ...(await runGuard({ text, language }, env)), mode };
  const messages = normalizeMessages({ text, context, mode, language });
  const preferred = selectedModel?.startsWith("@cf/") ? runWorkersAi
    : selectedModel?.endsWith(":free") ? runOpenRouter
      : FREE_MODEL_POLICY.groq.includes(selectedModel) ? runGroq
        : FREE_MODEL_POLICY.google.includes(selectedModel) ? runGoogle
          : null;
  const attempts = preferred ? [preferred, ...[runWorkersAi, runOpenRouter, runGroq, runGoogle].filter((attempt) => attempt !== preferred)] : [runWorkersAi, runOpenRouter, runGroq, runGoogle];
  const failures = [];
  for (const attempt of attempts) {
    try {
      return { ...(await attempt({ messages, mode, selectedModel }, env)), mode };
    } catch (error) {
      failures.push(String(error.message || error).slice(0, 100));
    }
  }
  throw new Error(`No free AI provider is currently available: ${failures.join(" | ")}`);
}

export function getDetectedMode(text, selectedMode) {
  return detectMode(text, selectedMode);
}

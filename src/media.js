import { FREE_MODEL_POLICY } from "./config.js";
import { reserveWorkersAiBudget } from "./security.js";

const TELEGRAM_FILE_BASE = "https://api.telegram.org/file";
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const NETWORK_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url, init = {}, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function telegramApi(env, method, body) {
  const response = await fetchWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(`Telegram ${method} failed`);
  return payload.result;
}

export async function downloadTelegramFile(fileId, env) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram token is not configured");
  const metadata = await telegramApi(env, "getFile", { file_id: fileId });
  if (!metadata?.file_path) throw new Error("Telegram file metadata is incomplete");
  if (Number(metadata.file_size || 0) > MAX_MEDIA_BYTES) throw new Error("Media is too large for the free-tier policy");
  const response = await fetchWithTimeout(`${TELEGRAM_FILE_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${metadata.file_path}`);
  if (!response.ok) throw new Error("Telegram file download failed");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("Media is too large for the free-tier policy");
  return { bytes, filePath: metadata.file_path, mimeType: response.headers.get("content-type") || "application/octet-stream" };
}

export async function transcribeVoice({ fileId, languageHint }, env) {
  if (!env.AI?.run) throw new Error("Workers AI is not configured");
  const media = await downloadTelegramFile(fileId, env);
  // Reserve enough of the daily free budget for transcription plus a bounded response; refusal is safer than nearing the paid boundary.
  const budget = await reserveWorkersAiBudget(600, env);
  if (!budget.allowed) throw new Error("Workers AI free quota guard blocked voice transcription");
  const model = FREE_MODEL_POLICY.workersAi.speech[0];
  const result = await env.AI.run(model, {
    audio: [...media.bytes],
    task: "transcribe",
    language: languageHint === "fa" ? "fa" : undefined
  });
  const text = result?.text || result?.transcription || result?.result?.text;
  if (!String(text || "").trim()) throw new Error("Voice transcription returned an empty result");
  return { text: String(text).trim(), provider: "workers-ai", model };
}

export async function analyzePhoto({ fileId, caption = "", language = "en" }, env) {
  if (!env.AI?.run) throw new Error("Workers AI is not configured");
  const media = await downloadTelegramFile(fileId, env);
  // Image understanding is comparatively expensive, so it receives the largest fixed reservation.
  const budget = await reserveWorkersAiBudget(1000, env);
  if (!budget.allowed) throw new Error("Workers AI free quota guard blocked image analysis");
  const model = FREE_MODEL_POLICY.workersAi.vision[0];
  const prompt = caption || (language === "fa" ? "این تصویر را دقیق و کوتاه توضیح بده." : "Describe this image accurately and concisely.");
  const dataUrl = `data:${media.mimeType};base64,${bytesToBase64(media.bytes)}`;
  const result = await env.AI.run(model, {
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: dataUrl } }
      ]
    }],
    // Photo replies are concise by design; a bounded completion preserves the daily free allocation.
    max_tokens: 320
  });
  const text = result?.response || result?.result?.response || result?.choices?.[0]?.message?.content;
  if (!String(text || "").trim()) throw new Error("Vision model returned an empty result");
  return { text: String(text).trim(), provider: "workers-ai", model };
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

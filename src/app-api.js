import { generateReply } from "./ai.js";
import { APP, SUPPORTED_LANGUAGE_CODES } from "./config.js";
import { allowUsage, safeError } from "./security.js";
import { conversationKey, getGuestMemory, getUserSettings, saveGuestMemory, upsertUser } from "./storage.js";
import { getVerifiedWebAppUser } from "./webapp-auth.js";
import { getRequiredChannelMembership } from "./membership.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    }
  });
}

function isValidPrompt(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= APP.maxInputCharacters;
}

function terminalConversationKey(userId) {
  // Keep terminal history separate from the private Telegram chat while reusing
  // the same short, opt-in, TTL-bounded memory store.
  return conversationKey({ chatId: userId, userId, threadId: "terminal" });
}

function responseText(language, key) {
  const fa = language === "fa";
  const values = {
    busy: fa ? "مسیر رایگان فعلاً مشغول است. کمی بعد دوباره تلاش کنید." : "This free route is busy right now. Please try again shortly.",
    temporary: fa ? "مشکلی موقت رخ داد. لطفاً دوباره تلاش کنید." : "A temporary problem occurred. Please try again.",
    invalid: fa ? "متن پیام معتبر نیست." : "Enter a valid message to continue."
  };
  return values[key] || values.temporary;
}

async function terminalUser(request, env) {
  const initData = String(request.headers.get("x-telegram-init-data") || "");
  const telegramUser = await getVerifiedWebAppUser(request, env);
  if (!telegramUser?.id) {
    console.warn(JSON.stringify({ event: "terminal_auth_rejected", initDataPresent: Boolean(initData), initDataLength: initData.length }));
    return null;
  }
  const membership = await getRequiredChannelMembership(telegramUser.id, env);
  if (!membership.allowed) return { blocked: true, telegramUser, membership };
  const settings = await getUserSettings(telegramUser.id, env);
  const requestedLanguage = String(settings.language || telegramUser.language_code || "en").replace("_", "-");
  const language = SUPPORTED_LANGUAGE_CODES.has(requestedLanguage) ? requestedLanguage : "en";
  await upsertUser({ user: telegramUser, chat: { id: telegramUser.id, type: "private" }, language }, env);
  return { telegramUser, settings: { ...settings, language } };
}

function publicSettings(settings) {
  return {
    language: settings.language,
    mode: settings.mode,
    selectedModel: settings.selectedModel || null,
    memoryEnabled: Boolean(settings.memoryEnabled)
  };
}

export async function handleAppRequest(request, env) {
  const url = new URL(request.url);
  const actor = await terminalUser(request, env);
  if (!actor) return json({ ok: false, code: "UNAUTHORIZED", message: "Open IVAI Terminal from Telegram." }, 401);
  if (actor.blocked) return json({ ok: false, code: "CHANNEL_REQUIRED", message: "Join @ILIVIR3 before using IVAI Terminal.", membershipReason: actor.membership.reason }, 403);

  if (url.pathname === "/app/session") {
    return json({ ok: true, settings: publicSettings(actor.settings) });
  }

  if (url.pathname !== "/app/chat") return json({ ok: false, code: "NOT_FOUND" }, 404);

  const body = await request.json().catch(() => null);
  const text = body?.text;
  if (!isValidPrompt(text)) return json({ ok: false, code: "INVALID_INPUT", message: responseText(actor.settings.language, "invalid") }, 400);

  const usage = await allowUsage({ scope: "text", id: actor.telegramUser.id, limit: APP.userHourlyTextLimit }, env);
  if (!usage.allowed) return json({ ok: false, code: "RATE_LIMIT", message: responseText(actor.settings.language, "busy"), remaining: 0 }, 429);

  const prompt = text.trim();
  const key = terminalConversationKey(actor.telegramUser.id);
  const context = actor.settings.memoryEnabled ? await getGuestMemory(key, env) : [];
  try {
    const result = await generateReply({
      text: prompt,
      selectedMode: actor.settings.mode,
      selectedModel: actor.settings.selectedModel,
      language: actor.settings.language,
      context
    }, env);
    if (actor.settings.memoryEnabled) {
      await saveGuestMemory(key, [...context, { role: "user", content: prompt }, { role: "assistant", content: result.text }], env);
    }
    return json({
      ok: true,
      text: result.text,
      model: result.model,
      mode: result.mode,
      language: actor.settings.language,
      remaining: usage.remaining
    });
  } catch (error) {
    const code = safeError(error);
    console.error(JSON.stringify({ event: "terminal_ai_failure", code, userId: String(actor.telegramUser.id) }));
    return json({
      ok: false,
      code,
      message: responseText(actor.settings.language, code === "RATE_LIMIT" ? "busy" : "temporary"),
      remaining: usage.remaining
    }, code === "RATE_LIMIT" ? 429 : 503);
  }
}

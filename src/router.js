import { APP, MODES, USER_FACING_MODES } from "./config.js";
import { generateReply } from "./ai.js";
import { getFreeModelCatalog, refreshFreeModelCatalog, renderModelList, selectCatalogModel } from "./catalog.js";
import { analyzePhoto, transcribeVoice } from "./media.js";
import { cancelBroadcast } from "./broadcast.js";
import { allowUsage, canBroadcast, canManage, getRole, safeError } from "./security.js";
import {
  clearGuestMemory,
  conversationKey,
  createBroadcastDraft,
  getGuestMemory,
  getAdminOperationalStats,
  getUserDebugStats,
  getUserSettings,
  markBroadcastConfirmed,
  recordFeedback,
  saveGuestMemory,
  setMemoryEnabled,
  setSelectedModel,
  setUserLanguage,
  setUserMode,
  upsertUser,
  writeAdminAudit
} from "./storage.js";
import { adminKeyboard, answerCallback, editMessage, escapeHtml, extendedModeKeyboard, modeKeyboard, modeLabel, responseMeta, sendMessage, sendTyping, telegram, welcomeText } from "./telegram.js";

const COMMAND_MODE = Object.freeze({
  "/auto": MODES.AUTO,
  "/fast": MODES.FAST,
  "/deep": MODES.DEEP,
  "/code": MODES.CODE,
  "/prompt": MODES.PROMPT,
  "/guest": MODES.GUEST,
  "/guard": MODES.GUARD,
  "/secretary": MODES.SECRETARY,
  "/management": MODES.MANAGEMENT,
  "/thread": MODES.THREAD
});

function languageFromMessage(message) {
  return /[\u0600-\u06ff]/.test(message?.text || message?.caption || "") ? "fa" : "en";
}

function userMessage(update) {
  return update.message || update.edited_message || update.business_message || null;
}

function responseText(language, key) {
  const fa = language === "fa";
  const values = {
    noAccess: fa ? "<b>دسترسی ادمین ندارید.</b>" : "<b>Admin access is required.</b>",
    invalidMode: fa ? "حالت انتخاب‌شده معتبر نیست." : "The requested mode is not valid.",
    saved: fa ? "✓ تنظیمات ذخیره شد." : "✓ Setting saved.",
    busy: fa ? "سهمیهٔ رایگان این مسیر فعلاً پر است؛ کمی بعد دوباره تلاش کنید." : "This free route is busy right now. Please try again shortly.",
    temporary: fa ? "مشکلی موقت رخ داد. لطفاً دوباره تلاش کنید." : "A temporary problem occurred. Please try again.",
    draftCreated: fa ? "✓ پیش‌نویس broadcast ساخته شد. ابتدا آن را بررسی کنید؛ انتشار خودکار نیست." : "✓ Broadcast draft created. Review it first; it has not been sent.",
    confirmed: fa ? "✓ broadcast تأیید شد و آمادهٔ صف ارسال امن است." : "✓ Broadcast confirmed and ready for the safe delivery queue.",
    cancelled: fa ? "✓ broadcast لغو شد." : "✓ Broadcast cancelled.",
    feedbackSaved: fa ? "بازخورد شما ثبت شد." : "Your feedback was saved.",
    unsupportedMedia: fa ? "این نوع پیام هنوز پشتیبانی نمی‌شود. فعلاً متن، عکس یا voice ارسال کنید." : "This message type is not supported yet. Please send text, a photo, or a voice message.",
    retry: fa ? "برای بازتولید پاسخ، پیام اصلی را دوباره بفرستید." : "Please resend the original prompt to generate a new response.",
    refreshFailed: fa ? "به‌روزرسانی مدل‌ها موقتاً ممکن نشد." : "The model catalog could not be refreshed right now."
  };
  return values[key] || values.temporary;
}

function helpText(language) {
  if (language === "fa") {
    return `<b>راهنمای IVAI</b>\n\n<b>حالت‌های اصلی</b>\n/auto · /fast · /deep · /code · /prompt\n\n<b>حالت‌های متمرکز</b>\n/guest · /guard · /secretary · /management · /thread\n\n<b>مدل‌ها</b>\n/models · /refreshmodels · /pick 1 · /model off\n\n<b>حافظه</b>\n/memory on · /memory show · /memory clear\n\n<b>زبان</b>\n/lang\n\n<b>سایر</b>\n/debug · /reset · /admin`;
  }
  return `<b>IVAI Help</b>\n\n<b>Core modes</b>\n/auto · /fast · /deep · /code · /prompt\n\n<b>Focused modes</b>\n/guest · /guard · /secretary · /management · /thread\n\n<b>Models</b>\n/models · /refreshmodels · /pick 1 · /model off\n\n<b>Memory</b>\n/memory on · /memory show · /memory clear\n\n<b>Language</b>\n/lang\n\n<b>Other</b>\n/debug · /reset · /admin`;
}

function renderAiText(text) {
  // Escape all model output before applying a limited, safe presentation layer.
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^#{1,3}\s+(.+)$/gm, "<b>$1</b>");
}

function getThreadId(message) {
  return message.message_thread_id || message.reply_to_message?.message_id || null;
}

function contextKey(message) {
  return conversationKey({
    chatId: message.chat?.id,
    userId: message.from?.id,
    threadId: getThreadId(message),
    replyTo: message.reply_to_message?.message_id
  });
}

function commandParts(text) {
  const [rawCommand = "", ...argumentsList] = String(text || "").trim().split(/\s+/);
  return { command: rawCommand.toLowerCase().split("@")[0], args: argumentsList, argumentText: argumentsList.join(" ").trim() };
}

async function saveFeedbackToken({ token, userId, chatId, responseMessageId, model, mode }, env) {
  if (!env.IVAI_KV) return;
  await env.IVAI_KV.put(`feedback:${token}`, JSON.stringify({ userId, chatId, responseMessageId, model, mode }), {
    expirationTtl: 24 * 60 * 60
  });
}

async function sendModelList(chatId, language, selectedModel, env) {
  const catalog = await getFreeModelCatalog(env);
  const selected = selectedModel ? `\n\n<b>${language === "fa" ? "مدل قفل‌شده" : "Locked model"}:</b> <code>${escapeHtml(selectedModel)}</code>` : "";
  const heading = language === "fa" ? "<b>مدل‌های رایگان موجود</b>" : "<b>Available free models</b>";
  await sendMessage(env, {
    chatId,
    text: `${heading}\n${renderModelList(catalog, language)}${selected}\n\n${language === "fa" ? "برای انتخاب: /pick شماره" : "To select: /pick number"}`
  });
}

async function handleCommand(message, env, language) {
  const userId = message.from?.id;
  const chatId = message.chat?.id;
  const { command, args, argumentText } = commandParts(message.text);
  const settings = await getUserSettings(userId, env);

  if (command === "/start" || command === "/menu") {
    await sendMessage(env, { chatId, text: welcomeText(language), keyboard: modeKeyboard(language), replyTo: message.message_id });
    return true;
  }
  if (command === "/help") {
    await sendMessage(env, { chatId, text: helpText(language), replyTo: message.message_id });
    return true;
  }
  if (COMMAND_MODE[command]) {
    await setUserMode(userId, COMMAND_MODE[command], env);
    await sendMessage(env, { chatId, text: `${responseText(language, "saved")} <b>${escapeHtml(modeLabel(COMMAND_MODE[command], language))}</b>`, replyTo: message.message_id });
    return true;
  }
  if (command === "/lang") {
    await sendMessage(env, {
      chatId,
      text: "<b>Language / زبان</b>",
      keyboard: { inline_keyboard: [[{ text: "English", callback_data: "lang:en" }, { text: "فارسی", callback_data: "lang:fa" }]] },
      replyTo: message.message_id
    });
    return true;
  }
  if (command === "/models" || (command === "/model" && !argumentText)) {
    await sendModelList(chatId, language, settings.selectedModel, env);
    return true;
  }
  if (command === "/model" && args[0] === "off") {
    await setSelectedModel(userId, null, env);
    await sendMessage(env, { chatId, text: language === "fa" ? "✓ انتخاب مدل برداشته شد؛ Auto policy فعال است." : "✓ Model lock removed; Auto policy is active.", replyTo: message.message_id });
    return true;
  }
  if (command === "/pick") {
    const model = await selectCatalogModel(args[0], env);
    if (!model) {
      await sendMessage(env, { chatId, text: language === "fa" ? "شمارهٔ مدل معتبر نیست. ابتدا /models را ببینید." : "That model number is not valid. Run /models first.", replyTo: message.message_id });
      return true;
    }
    await setSelectedModel(userId, model.id, env);
    await sendMessage(env, { chatId, text: `${responseText(language, "saved")} <code>${escapeHtml(model.id)}</code>`, replyTo: message.message_id });
    return true;
  }
  if (command === "/refreshmodels") {
    try {
      const refreshed = await refreshFreeModelCatalog(env);
      const text = refreshed.refreshed
        ? (language === "fa" ? `✓ ${refreshed.models.length} مدل رایگان به‌روزرسانی شد.` : `✓ Refreshed ${refreshed.models.length} free models.`)
        : refreshed.reason;
      await sendMessage(env, { chatId, text: escapeHtml(text), replyTo: message.message_id });
    } catch (error) {
      console.error(JSON.stringify({ event: "model_catalog_refresh_failure", error: String(error?.message || "unknown") }));
      await sendMessage(env, { chatId, text: responseText(language, "refreshFailed"), replyTo: message.message_id });
    }
    return true;
  }
  if (command === "/memory") {
    const action = (args[0] || "show").toLowerCase();
    const key = contextKey(message);
    if (action === "on" || action === "off") {
      await setMemoryEnabled(userId, action === "on", env);
      await sendMessage(env, { chatId, text: action === "on" ? (language === "fa" ? "✓ حافظهٔ کوتاه‌مدت فعال شد." : "✓ Short-term memory enabled.") : (language === "fa" ? "✓ حافظه غیرفعال شد." : "✓ Memory disabled."), replyTo: message.message_id });
      return true;
    }
    if (action === "clear") {
      await clearGuestMemory(key, env);
      await sendMessage(env, { chatId, text: language === "fa" ? "✓ حافظهٔ این گفت‌وگو پاک شد." : "✓ This conversation memory was cleared.", replyTo: message.message_id });
      return true;
    }
    const memory = await getGuestMemory(key, env);
    const preview = memory.length ? memory.map((entry) => `<b>${entry.role}:</b> ${escapeHtml(String(entry.content).slice(0, 280))}`).join("\n\n") : (language === "fa" ? "حافظه‌ای برای این گفت‌وگو نیست." : "There is no stored memory for this conversation.");
    await sendMessage(env, { chatId, text: preview, replyTo: message.message_id });
    return true;
  }
  if (command === "/debug") {
    const stats = await getUserDebugStats(userId, env);
    await sendMessage(env, { chatId, text: `<b>IVAI Status</b>\nMode: <code>${escapeHtml(settings.mode)}</code>\nModel: <code>${escapeHtml(settings.selectedModel || "auto")}</code>\nMemory: <code>${settings.memoryEnabled ? "on" : "off"}</code>\nFeedback: <code>${stats.feedbackCount}</code>`, replyTo: message.message_id });
    return true;
  }
  if (command === "/active") {
    await sendMessage(env, { chatId, text: language === "fa" ? "IVAI برای حفظ سهمیهٔ رایگان، health check پرهزینهٔ همهٔ مدل‌ها را اجرا نمی‌کند. مسیرهای فعال با درخواست واقعی و fallback ترتیبی بررسی می‌شوند." : "To protect the free quota, IVAI does not ping every model. Active routes are verified on real requests with sequential fallback.", replyTo: message.message_id });
    return true;
  }
  if (command === "/reset") {
    await setUserMode(userId, MODES.AUTO, env);
    await setSelectedModel(userId, null, env);
    await setMemoryEnabled(userId, false, env);
    await clearGuestMemory(contextKey(message), env);
    await sendMessage(env, { chatId, text: language === "fa" ? "✓ تنظیمات IVAI بازنشانی شد." : "✓ IVAI settings were reset.", replyTo: message.message_id });
    return true;
  }
  if (command === "/admin") {
    const role = await getRole(userId, env);
    if (!canManage(role)) {
      await sendMessage(env, { chatId, text: responseText(language, "noAccess"), replyTo: message.message_id });
      return true;
    }
    await sendMessage(env, { chatId, text: "<b>IVAI Admin</b>\nSelect an action.", keyboard: adminKeyboard(), replyTo: message.message_id });
    return true;
  }
  if (command === "/broadcast") {
    const role = await getRole(userId, env);
    if (!canBroadcast(role)) {
      await sendMessage(env, { chatId, text: responseText(language, "noAccess"), replyTo: message.message_id });
      return true;
    }
    if (!argumentText) {
      await sendMessage(env, { chatId, text: "Usage: <code>/broadcast your message</code>", replyTo: message.message_id });
      return true;
    }
    const campaignId = await createBroadcastDraft({ authorId: userId, content: argumentText }, env);
    await writeAdminAudit({ actorId: userId, action: "broadcast_draft_created", targetType: "broadcast", targetId: campaignId }, env);
    await sendMessage(env, {
      chatId,
      text: `${responseText(language, "draftCreated")}\n\n<b>Preview</b>\n${escapeHtml(argumentText)}`,
      keyboard: { inline_keyboard: [[{ text: "✓ Confirm", callback_data: `broadcast:confirm:${campaignId}` }, { text: "✕ Cancel", callback_data: `broadcast:cancel:${campaignId}` }]] }
    });
    return true;
  }
  if (command.startsWith("/")) {
    await sendMessage(env, { chatId, text: language === "fa" ? "فرمان ناشناخته است. /help را بزنید." : "Unknown command. Use /help.", replyTo: message.message_id });
    return true;
  }
  return false;
}

async function processText(message, env) {
  const text = message.text.trim();
  const userId = message.from?.id;
  const chatId = message.chat.id;
  const knownSettings = await getUserSettings(userId, env);
  const language = knownSettings.language || languageFromMessage(message) || "en";
  await upsertUser({ user: message.from, chat: message.chat, language }, env);
  if (text.startsWith("/") && await handleCommand(message, env, language)) return;

  const settings = await getUserSettings(userId, env);
  const usage = await allowUsage({ scope: "text", id: userId, limit: APP.userHourlyTextLimit }, env);
  if (!usage.allowed) {
    await sendMessage(env, { chatId, text: responseText(language, "busy"), replyTo: message.message_id });
    return;
  }

  const key = contextKey(message);
  const context = settings.memoryEnabled ? await getGuestMemory(key, env) : [];
  await sendTyping(env, chatId).catch(() => {});
  const progress = await sendMessage(env, {
    chatId,
    text: language === "fa" ? "<i>IVAI در حال فکرکردن است…</i>" : "<i>IVAI is thinking…</i>",
    replyTo: message.message_id
  }).catch(() => null);

  try {
    const result = await generateReply({ text, selectedMode: settings.mode, selectedModel: settings.selectedModel, language, context }, env);
    if (settings.memoryEnabled) {
      await saveGuestMemory(key, [...context, { role: "user", content: text }, { role: "assistant", content: result.text }], env);
    }
    const finalText = `${renderAiText(result.text)}\n\n${responseMeta({ model: result.model, mode: result.mode, language })}`;
    if (finalText.length <= APP.maxTelegramText) {
      if (progress?.message_id) await editMessage(env, { chatId, messageId: progress.message_id, text: finalText });
      else await sendMessage(env, { chatId, text: finalText, replyTo: message.message_id });
      return;
    }
    if (progress?.message_id) {
      await editMessage(env, {
        chatId,
        messageId: progress.message_id,
        text: language === "fa" ? "<i>پاسخ طولانی است و در پیام‌های زیر ارسال شد.</i>" : "<i>The full response is sent below.</i>"
      });
    }
    await sendMessage(env, { chatId, text: result.text, replyTo: message.message_id, parseMode: null });
    await sendMessage(env, { chatId, text: responseMeta({ model: result.model, mode: result.mode, language }) });
  } catch (error) {
    const code = safeError(error);
    const failureText = responseText(language, code === "RATE_LIMIT" ? "busy" : "temporary");
    if (progress?.message_id) await editMessage(env, { chatId, messageId: progress.message_id, text: failureText }).catch(() => {});
    else await sendMessage(env, { chatId, text: failureText, replyTo: message.message_id });
    console.error(JSON.stringify({ event: "ai_failure", code, userId: String(userId) }));
  }
}

async function processMedia(message, env) {
  const userId = message.from?.id;
  const chatId = message.chat?.id;
  const language = (await getUserSettings(userId, env)).language || languageFromMessage(message) || "en";
  await upsertUser({ user: message.from, chat: message.chat, language }, env);
  const usage = await allowUsage({ scope: "media", id: userId, limit: APP.userDailyMediaLimit, windowSeconds: 24 * 60 * 60 }, env);
  if (!usage.allowed) {
    await sendMessage(env, { chatId, text: responseText(language, "busy"), replyTo: message.message_id });
    return;
  }
  try {
    let result;
    let prefix = "";
    if (message.voice) {
      result = await transcribeVoice({ fileId: message.voice.file_id, languageHint: language }, env);
      prefix = language === "fa" ? "<b>متن صوت:</b>\n" : "<b>Voice transcription:</b>\n";
    } else if (message.photo?.length) {
      result = await analyzePhoto({ fileId: message.photo.at(-1).file_id, caption: message.caption || "", language }, env);
    } else {
      await sendMessage(env, { chatId, text: responseText(language, "unsupportedMedia"), replyTo: message.message_id });
      return;
    }
    await sendMessage(env, {
      chatId,
      text: `${prefix}${renderAiText(result.text)}\n\n${responseMeta({ model: result.model, language })}`,
      replyTo: message.message_id
    });
  } catch (error) {
    const code = safeError(error);
    await sendMessage(env, { chatId, text: responseText(language, code === "RATE_LIMIT" ? "busy" : "temporary"), replyTo: message.message_id });
    console.error(JSON.stringify({ event: "media_failure", code, userId: String(userId) }));
  }
}

async function handleInlineQuery(query, env) {
  const userId = query.from?.id;
  const language = (await getUserSettings(userId, env)).language || (query.from?.language_code === "fa" ? "fa" : "en");
  const prompt = String(query.query || "").trim();
  if (!prompt) {
    await telegram(env, "answerInlineQuery", {
      inline_query_id: query.id,
      cache_time: 10,
      is_personal: true,
      results: [{ type: "article", id: "ivai-help", title: "Ask IVAI", description: "Type a question after @IVAI_Llm_bot", input_message_content: { message_text: "<b>IVAI Inline</b>\nType a question after @IVAI_Llm_bot.", parse_mode: "HTML" } }]
    });
    return;
  }
  const usage = await allowUsage({ scope: "inline", id: userId, limit: Math.max(8, Math.floor(APP.userHourlyTextLimit / 2)) }, env);
  if (!usage.allowed) {
    await telegram(env, "answerInlineQuery", {
      inline_query_id: query.id, cache_time: 3, is_personal: true,
      results: [{ type: "article", id: "ivai-busy", title: "IVAI is temporarily busy", description: "Please try again shortly.", input_message_content: { message_text: "IVAI is temporarily busy. Please try again shortly." } }]
    });
    return;
  }
  try {
    const settings = await getUserSettings(userId, env);
    const result = await generateReply({ text: prompt, selectedMode: settings.mode, selectedModel: settings.selectedModel, language, context: [] }, env);
    const token = crypto.randomUUID().replaceAll("-", "").slice(0, 24);
    if (env.IVAI_KV) await env.IVAI_KV.put(`inline:${token}`, JSON.stringify({ userId, model: result.model, mode: result.mode }), { expirationTtl: 24 * 60 * 60 });
    await telegram(env, "answerInlineQuery", {
      inline_query_id: query.id,
      cache_time: 0,
      is_personal: true,
      results: [{
        type: "article",
        id: token,
        title: "IVAI",
        description: result.text.slice(0, 100),
        input_message_content: { message_text: `${renderAiText(result.text)}\n\n${responseMeta({ model: result.model, mode: result.mode, language })}`, parse_mode: "HTML", disable_web_page_preview: true }
      }]
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "inline_failure", code: safeError(error), userId: String(userId) }));
    await telegram(env, "answerInlineQuery", {
      inline_query_id: query.id, cache_time: 3, is_personal: true,
      results: [{ type: "article", id: "ivai-error", title: "IVAI is temporarily unavailable", description: "Please try again shortly.", input_message_content: { message_text: "IVAI is temporarily unavailable. Please try again shortly." } }]
    });
  }
}

async function handleChosenInlineResult(result, env) {
  const session = await env.IVAI_KV?.get(`inline:${result.result_id}`);
  if (!session) return;
  try {
    const parsed = JSON.parse(session);
    await recordFeedback({ userId: result.from?.id, chatId: null, messageId: result.inline_message_id || null, model: parsed.model, score: 1, kind: "inline_selected" }, env);
  } catch {
    // Selection tracking is best-effort and never blocks Telegram updates.
  }
}

function adminStatsText(stats) {
  const value = (item) => item ?? "n/a";
  return `<b>IVAI Operations</b>\n\n<b>Audience</b>\nTotal users: <code>${value(stats.totalUsers)}</code>\nActive users (7d): <code>${value(stats.activeUsers7d)}</code>\nActive users (30d): <code>${value(stats.activeUsers30d)}</code>\nActive chats (30d): <code>${value(stats.activeChats30d)}</code>\n\n<b>Operations</b>\nFeedback (7d): <code>${value(stats.feedback7d)}</code>\nBroadcasts awaiting delivery: <code>${value(stats.pendingBroadcasts)}</code>\nWorkers AI daily budget remaining: <code>${value(stats.workersAiBudgetRemaining)}</code>`;
}

async function processCallback(query, env) {
  const userId = query.from?.id;
  const chatId = query.message?.chat?.id;
  const language = (await getUserSettings(userId, env)).language || "en";
  const data = String(query.data || "");
  await answerCallback(env, query.id).catch(() => {});

  if (data === "modes:more") {
    if (!chatId || !query.message?.message_id) return;
    await editMessage(env, {
      chatId,
      messageId: query.message.message_id,
      text: language === "fa" ? "<b>حالت‌های متمرکز</b>\n\nحالت مناسب وظیفه‌تان را انتخاب کنید. تنظیمات در پیام بعدی شما اعمال می‌شود." : "<b>Focused modes</b>\n\nChoose the mode that matches your task. Your setting will apply to the next message.",
      keyboard: extendedModeKeyboard(language)
    });
    return;
  }
  if (data === "modes:back") {
    if (!chatId || !query.message?.message_id) return;
    await editMessage(env, {
      chatId,
      messageId: query.message.message_id,
      text: welcomeText(language),
      keyboard: modeKeyboard(language)
    });
    return;
  }
  if (data.startsWith("mode:")) {
    const mode = data.slice(5);
    if (!USER_FACING_MODES.has(mode)) {
      await sendMessage(env, { chatId, text: responseText(language, "invalidMode") });
      return;
    }
    await setUserMode(userId, mode, env);
    await sendMessage(env, { chatId, text: `${responseText(language, "saved")} <b>${escapeHtml(modeLabel(mode, language))}</b>` });
    return;
  }
  if (data.startsWith("lang:")) {
    const selected = data.slice(5);
    if (!["en", "fa"].includes(selected)) return;
    await setUserLanguage(userId, selected, env);
    await sendMessage(env, { chatId, text: selected === "fa" ? "✓ زبان فارسی فعال شد." : "✓ English is now active." });
    return;
  }
  if (data === "settings:open") {
    const settings = await getUserSettings(userId, env);
    await sendMessage(env, { chatId, text: `<b>Settings</b>\nMode: <code>${escapeHtml(settings.mode)}</code>\nModel: <code>${escapeHtml(settings.selectedModel || "auto")}</code>\nMemory: <code>${settings.memoryEnabled ? "on" : "off"}</code>\n\nUse /help for commands.` });
    return;
  }
  if (data.startsWith("feedback:")) {
    const [, scoreText, token] = data.split(":");
    const raw = await env.IVAI_KV?.get(`feedback:${token}`);
    const session = raw ? JSON.parse(raw) : {};
    await recordFeedback({ userId, chatId, messageId: session.responseMessageId, model: session.model, score: scoreText === "up" ? 1 : -1, kind: "message" }, env);
    await sendMessage(env, { chatId, text: responseText(language, "feedbackSaved") });
    return;
  }
  if (data.startsWith("retry:")) {
    await sendMessage(env, { chatId, text: responseText(language, "retry") });
    return;
  }
  if (data.startsWith("broadcast:confirm:")) {
    const role = await getRole(userId, env);
    if (!canBroadcast(role)) return;
    const campaignId = data.slice("broadcast:confirm:".length);
    await markBroadcastConfirmed(campaignId, userId, env);
    await writeAdminAudit({ actorId: userId, action: "broadcast_confirmed", targetType: "broadcast", targetId: campaignId }, env);
    await sendMessage(env, { chatId, text: responseText(language, "confirmed") });
    return;
  }
  if (data.startsWith("broadcast:cancel:")) {
    const role = await getRole(userId, env);
    if (!canBroadcast(role)) return;
    await cancelBroadcast(data.slice("broadcast:cancel:".length), userId, env);
    await sendMessage(env, { chatId, text: responseText(language, "cancelled") });
    return;
  }
  if (data === "admin:broadcast") {
    const role = await getRole(userId, env);
    await sendMessage(env, { chatId, text: canBroadcast(role) ? "Send <code>/broadcast your message</code> to create a reviewable draft." : responseText(language, "noAccess") });
    return;
  }
  if (data === "admin:stats") {
    const role = await getRole(userId, env);
    if (!canManage(role)) {
      await sendMessage(env, { chatId, text: responseText(language, "noAccess") });
      return;
    }
    await sendMessage(env, { chatId, text: adminStatsText(await getAdminOperationalStats(env)) });
    return;
  }
  if (data === "admin:guard") {
    const role = await getRole(userId, env);
    if (!canManage(role)) {
      await sendMessage(env, { chatId, text: responseText(language, "noAccess") });
      return;
    }
    await sendMessage(env, { chatId, text: "<b>Guard status</b>\n\nGuard is available as an opt-in safety classifier through <code>/guard</code>. It uses Llama Guard in exactly one model call and returns a verdict without generating a second content response. Automatic classification remains off in ordinary chats." });
    return;
  }
  if (data === "admin:policy") {
    const role = await getRole(userId, env);
    if (!canManage(role)) {
      await sendMessage(env, { chatId, text: responseText(language, "noAccess") });
      return;
    }
    await sendMessage(env, { chatId, text: "<b>IVAI Free Policy</b>\n\n• Free routes only: Workers AI, OpenRouter <code>:free</code>, Groq free tier, and Google AI Studio free tier.\n• One model call per request; providers use ordered fallback, never parallel races.\n• Workers AI has a daily budget guard.\n• Broadcasts require a separate draft and confirmation before the delivery queue can run." });
  }
}

export async function handleUpdate(update, env) {
  if (update.inline_query) return handleInlineQuery(update.inline_query, env);
  if (update.chosen_inline_result) return handleChosenInlineResult(update.chosen_inline_result, env);
  if (update.callback_query) return processCallback(update.callback_query, env);
  const message = userMessage(update);
  if (!message) return;
  if (message.text) return processText(message, env);
  if (message.voice || message.photo?.length) return processMedia(message, env);
  const language = languageFromMessage(message) || "en";
  await upsertUser({ user: message.from, chat: message.chat, language }, env);
  if (message.chat?.id) await sendMessage(env, { chatId: message.chat.id, text: responseText(language, "unsupportedMedia"), replyTo: message.message_id });
}

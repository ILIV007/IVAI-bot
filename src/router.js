import { APP, MODES, SUPPORTED_LANGUAGE_CODES, USER_FACING_MODES } from "./config.js";
import { generateReply } from "./ai.js";
import { getFreeModelCatalog, refreshFreeModelCatalog, renderModelList, selectCatalogModel } from "./catalog.js";
import { analyzePhoto, transcribeVoice } from "./media.js";
import { cancelBroadcast } from "./broadcast.js";
import { allowUsage, canBroadcast, canManage, getRole, safeError } from "./security.js";
import { getRequiredChannelMembership } from "./membership.js";
import {
  clearGuestMemory,
  conversationKey,
  createSecretaryTask,
  createBroadcastDraft,
  getGuestMemory,
  getAdminOperationalStats,
  getUserDebugStats,
  getUserSettings,
  getReengagementPreference,
  listSecretaryTasks,
  markBroadcastConfirmed,
  recordFeedback,
  saveGuestMemory,
  setMemoryEnabled,
  setReengagementPreference,
  setSelectedModel,
  setUserLanguage,
  setUserMode,
  updateSecretaryTaskStatus,
  upsertUser,
  writeAdminAudit
} from "./storage.js";
import { adminKeyboard, answerCallback, editMessage, escapeHtml, languageKeyboard, languageMenuText, menuText, modelPickerKeyboard, modeKeyboard, modeLabel, requiredMembershipKeyboard, requiredMembershipText, responseMeta, sendMessage, sendRichMessage, sendRichMessageDraft, sendTyping, settingsKeyboard, startKeyboard, startThinkingAnimation, telegram, terminalKeyboard, thinkingText, welcomeText } from "./telegram.js";

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

function membershipConfirmedText(language) {
  return language === "fa" ? "<b>✓ عضویت تأیید شد</b>\n\nاکنون می‌توانید از IVAI استفاده کنید." : language === "ar" ? "<b>✓ تم تأكيد العضوية</b>\n\nيمكنك الآن استخدام IVAI." : "<b>✓ Membership confirmed</b>\n\nYou can now use IVAI.";
}

async function isRequiredChannelMember(userId, env) {
  return getRequiredChannelMembership(userId, env);
}

async function sendMembershipRequired(message, language, membership, env) {
  if (!message?.chat?.id) return;
  await sendMessage(env, {
    chatId: message.chat.id,
    text: requiredMembershipText(language, { checkFailed: membership?.reason === "CHECK_FAILED" }),
    keyboard: requiredMembershipKeyboard(language),
    replyTo: message.message_id,
    ...messageSendContext(message)
  });
}

async function answerInlineMembershipRequired(query, language, env) {
  await telegram(env, "answerInlineQuery", {
    inline_query_id: query.id,
    cache_time: 0,
    is_personal: true,
    results: [{
      type: "article",
      id: "ivai-channel-required",
      title: "Join @ILIVIR3 to use IVAI",
      description: "Membership is required before AI requests are enabled.",
      input_message_content: { message_text: requiredMembershipText(language), parse_mode: "HTML" },
      reply_markup: requiredMembershipKeyboard(language)
    }]
  });
}

function languageFromMessage(message) {
  const text = String(message?.text || message?.caption || "");
  if (/[\u0600-\u06ff]/.test(text)) return /[\u0600-\u06ff]/.test(text) && /[\u0621-\u064a]/.test(text) && !/[\u067e\u0686\u0698\u06af]/.test(text) ? "ar" : "fa";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[\u0900-\u097f]/.test(text)) return "hi";
  const code = String(message?.from?.language_code || "").replace("_", "-");
  const exact = [...SUPPORTED_LANGUAGE_CODES].find((value) => value.toLowerCase() === code.toLowerCase());
  const base = code.split("-")[0].toLowerCase();
  return exact || (SUPPORTED_LANGUAGE_CODES.has(base) ? base : "en");
}

function userMessage(update) {
  return update.message || update.edited_message || update.business_message || null;
}

async function handleGuestMessage(message, env) {
  const guestQueryId = message?.guest_query_id;
  const prompt = String(message?.text || message?.caption || "").trim();
  if (!guestQueryId || !prompt) return;
  const language = languageFromMessage(message);
  const userId = message?.guest_bot_caller_user?.id || message?.from?.id || "guest";
  const membership = await isRequiredChannelMember(userId, env);
  if (!membership.allowed) {
    await telegram(env, "answerGuestQuery", {
      guest_query_id: guestQueryId,
      result: { type: "article", id: "ivai-channel-required", title: "Join @ILIVIR3 to use IVAI", input_message_content: { message_text: requiredMembershipText(language), parse_mode: "HTML" }, reply_markup: requiredMembershipKeyboard(language) }
    });
    return;
  }
  const usage = await allowUsage({ scope: "guest", id: userId, limit: APP.userHourlyTextLimit }, env);
  let text;
  try {
    if (!usage.allowed) throw new Error("RATE_LIMIT");
    const result = await generateReply({ text: prompt, selectedMode: MODES.GUEST, language, context: [] }, env);
    text = `${renderAiText(result.text)}\n\n${responseMeta({ model: result.model, mode: MODES.GUEST, language })}`;
  } catch (error) {
    text = responseText(language, safeError(error) === "RATE_LIMIT" ? "busy" : "temporary");
  }
  await telegram(env, "answerGuestQuery", {
    guest_query_id: guestQueryId,
    result: {
      type: "article",
      id: crypto.randomUUID(),
      title: "IVAI",
      input_message_content: { message_text: text, parse_mode: "HTML", disable_web_page_preview: true }
    }
  });
}

async function handleMessageReaction(reaction, env) {
  const emoji = reaction?.new_reaction?.find((entry) => entry?.type === "emoji")?.emoji;
  const score = emoji === "👍" ? 1 : emoji === "👎" ? -1 : null;
  if (!score || !reaction?.user?.id || !reaction?.chat?.id || !reaction?.message_id) return;
  await recordFeedback({
    userId: reaction.user.id,
    chatId: reaction.chat.id,
    messageId: reaction.message_id,
    score,
    kind: "reaction"
  }, env).catch((error) => console.error(JSON.stringify({ event: "reaction_feedback_failure", error: String(error?.message || "unknown") })));
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
    return `<b>راهنمای IVAI</b>\n\n<b>شروع سریع</b>\nیک پیام بفرستید؛ حالت <code>/auto</code> بهترین مسیر رایگان را انتخاب می‌کند.\n\n<b>سه حالت اصلی</b>\n<code>/auto</code> — انتخاب خودکار\n<code>/fast</code> — پاسخ کوتاه و سریع\n<code>/deep</code> — پاسخ ساختاریافته و دقیق\n\n<b>انتخاب مدل رایگان</b>\n<code>/models</code> یا دکمهٔ «انتخاب مدل»؛ مدل انتخابی اولویت دارد و در خطا fallback رایگان فعال می‌ماند.\n<code>/model off</code> — بازگشت به Auto\n\n<b>ابزارها</b>\n<code>/guard</code> — بررسی ایمنی یک‌مرحله‌ای\n<code>/task عنوان</code> · <code>/task in 30m | عنوان</code> · <code>/tasks</code>\n<code>/memory on|off|show|clear</code>\n<code>/terminal</code> — بازکردن رابط سبک IVAI Terminal در چت خصوصی\n<code>/lang</code> · <code>/notify on|off</code> · <code>/debug</code> · <code>/reset</code>\n\n<b>نکته</b>\nهمهٔ مسیرهای مدل فقط free-only هستند.`;
  }
  return `<b>IVAI Help</b>\n\n<b>Quick start</b>\nSend a message. <code>/auto</code> chooses the best available free route.\n\n<b>Three main modes</b>\n<code>/auto</code> — automatic routing\n<code>/fast</code> — concise, quick answers\n<code>/deep</code> — structured, careful answers\n\n<b>Choose a free AI model</b>\nUse <code>/models</code> or the “Pick model” button. A chosen model is preferred, while free fallback remains available on failure.\n<code>/model off</code> — return to Auto\n\n<b>Tools</b>\n<code>/guard</code> — one-call safety check\n<code>/task title</code> · <code>/task in 30m | title</code> · <code>/tasks</code>\n<code>/memory on|off|show|clear</code>\n<code>/terminal</code> — open the lightweight IVAI Terminal in this private chat\n<code>/lang</code> · <code>/notify on|off</code> · <code>/debug</code> · <code>/reset</code>\n\n<b>Policy</b>\nEvery model route is free-only.`;
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

function messageSendContext(message) {
  return {
    threadId: message.message_thread_id || undefined,
    businessConnectionId: message.business_connection_id || undefined,
    directMessagesTopicId: message.direct_messages_topic?.topic_id || undefined
  };
}

function commandParts(text) {
  const [rawCommand = "", ...argumentsList] = String(text || "").trim().split(/\s+/);
  return { command: rawCommand.toLowerCase().split("@")[0], args: argumentsList, argumentText: argumentsList.join(" ").trim() };
}

function mainKeyboard(language, message) {
  return modeKeyboard(language, { includeTerminal: message?.chat?.type === "private" });
}

function welcomeKeyboard(language, message) {
  return startKeyboard(language, { includeTerminal: message?.chat?.type === "private" });
}

function terminalMemoryKey(userId) {
  return conversationKey({ chatId: userId, userId, threadId: "terminal" });
}

async function clearUserMemory(message, env) {
  await Promise.all([
    clearGuestMemory(contextKey(message), env),
    clearGuestMemory(terminalMemoryKey(message.from?.id), env)
  ]);
}

function parseTaskInput(input) {
  const value = String(input || "").trim();
  if (!value) return { error: "missing" };
  const pipe = value.indexOf("|");
  if (pipe < 0) return { title: value.slice(0, 500), dueAt: null };
  const dueText = value.slice(0, pipe).trim();
  const title = value.slice(pipe + 1).trim().slice(0, 500);
  if (!title) return { error: "missing" };
  let dueAt;
  const relative = dueText.match(/^in\s+(\d{1,4})\s*([mh])$/i);
  if (relative) {
    const amount = Number(relative[1]);
    dueAt = new Date(Date.now() + amount * (relative[2].toLowerCase() === "h" ? 60 * 60 * 1000 : 60 * 1000));
  } else {
    if (!/(Z|[+-]\d{2}:\d{2})$/i.test(dueText)) return { error: "timezone" };
    dueAt = new Date(dueText);
  }
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now() + 30 * 1000) return { error: "date" };
  return { title, dueAt: dueAt.toISOString() };
}

function secretaryTaskText(tasks, language) {
  const title = language === "fa" ? "<b>🗂 Taskهای IVAI</b>" : "<b>🗂 IVAI tasks</b>";
  if (!tasks.length) return `${title}\n\n${language === "fa" ? "task باز ندارید." : "You have no open tasks."}`;
  return `${title}\n\n${tasks.map((task, index) => {
    const due = task.dueAt ? `\n<i>${escapeHtml(task.dueAt.replace(".000Z", "Z"))}</i>` : "";
    return `${index + 1}. ${escapeHtml(task.title)}${due}\n<code>${task.id.slice(0, 8)}</code>`;
  }).join("\n\n")}`;
}

function reengagementText(language, enabled) {
  if (language === "fa") return enabled ? "<b>🔔 یادآوری‌های IVAI روشن است</b>\n\nاگر ۱۵ روز غیرفعال باشید، حداکثر یک پیام دوستانه دریافت می‌کنید." : "<b>🔕 یادآوری‌های IVAI متوقف است</b>\n\nهر زمان خواستید با <code>/notify on</code> دوباره فعالش کنید.";
  if (language === "ar") return enabled ? "<b>🔔 تذكيرات IVAI مفعّلة</b>\n\nقد تتلقى رسالة ودية واحدة فقط بعد 15 يومًا من عدم النشاط." : "<b>🔕 تم إيقاف تذكيرات IVAI</b>\n\nيمكنك تفعيلها لاحقًا عبر <code>/notify on</code>.";
  return enabled ? "<b>🔔 IVAI reminders are on</b>\n\nAfter 15 inactive days, you may receive at most one friendly check-in." : "<b>🔕 IVAI reminders are paused</b>\n\nYou can turn them back on anytime with <code>/notify on</code>.";
}

function reengagementKeyboard(language, enabled) {
  return { inline_keyboard: [[{
    text: enabled ? (language === "fa" ? "توقف یادآوری‌ها" : "Pause reminders") : (language === "fa" ? "فعال‌کردن یادآوری‌ها" : "Enable reminders"),
    callback_data: enabled ? "notify:off" : "notify:on",
    style: enabled ? "danger" : "success"
  }]] };
}

function secretaryTaskKeyboard(tasks, language) {
  const rows = tasks.slice(0, 8).map((task) => [
    { text: `${language === "fa" ? "✓ انجام" : "✓ Done"}: ${String(task.title).slice(0, 20)}`, callback_data: `task:done:${task.id}`, style: "success" },
    { text: language === "fa" ? "لغو" : "Cancel", callback_data: `task:cancel:${task.id}`, style: "danger" }
  ]);
  return rows.length ? { inline_keyboard: rows } : undefined;
}

async function saveFeedbackToken({ token, userId, chatId, responseMessageId, model, mode }, env) {
  if (!env.IVAI_KV) return;
  await env.IVAI_KV.put(`feedback:${token}`, JSON.stringify({ userId, chatId, responseMessageId, model, mode }), {
    expirationTtl: 24 * 60 * 60
  });
}

async function modelPickerView(language, selectedModel, env, page = 0) {
  const catalog = await getFreeModelCatalog(env);
  const locked = selectedModel ? `<code>${escapeHtml(selectedModel)}</code>` : (language === "fa" ? "Auto" : "Auto");
  const heading = language === "fa" ? "<b>انتخاب مدل AI رایگان</b>" : "<b>Free AI model picker</b>";
  const detail = language === "fa" ? "مدل انتخابی شما اولویت دارد؛ اگر موقتاً در دسترس نباشد، fallback رایگان و ترتیبی فعال می‌شود." : "Your selected model is preferred; if it is temporarily unavailable, ordered free fallback stays active.";
  return { text: `${heading}\n\n<b>${language === "fa" ? "مدل فعال" : "Active model"}:</b> ${locked}\n${detail}`, keyboard: modelPickerKeyboard(catalog, { page, selectedModel, language }) };
}

async function sendModelList(chatId, language, selectedModel, env, replyTo) {
  const view = await modelPickerView(language, selectedModel, env);
  await sendMessage(env, { chatId, text: view.text, keyboard: view.keyboard, replyTo });
}

async function handleCommand(message, env, language) {
  const userId = message.from?.id;
  const chatId = message.chat?.id;
  const { command, args, argumentText } = commandParts(message.text);
  const settings = await getUserSettings(userId, env);

  if (command === "/start") {
    await sendMessage(env, { chatId, text: welcomeText(language), keyboard: welcomeKeyboard(language, message), replyTo: message.message_id });
    return true;
  }
  if (command === "/menu") {
    await sendMessage(env, { chatId, text: menuText(language), keyboard: mainKeyboard(language, message), replyTo: message.message_id });
    return true;
  }
  if (command === "/help") {
    await sendMessage(env, { chatId, text: helpText(language), keyboard: mainKeyboard(language, message), replyTo: message.message_id });
    return true;
  }
  if (command === "/terminal") {
    if (message.chat?.type !== "private") {
      await sendMessage(env, { chatId, text: language === "fa" ? "IVAI Terminal فقط در چت خصوصی با بات باز می‌شود." : "IVAI Terminal can only be opened in a private chat with the bot.", replyTo: message.message_id });
      return true;
    }
    const text = language === "fa" ? "<b>IVAI Terminal</b> آماده است. پیام‌ها در همان رابط سبک ردوبدل می‌شوند و از همان مسیرهای رایگان IVAI استفاده می‌کنند." : "<b>IVAI Terminal</b> is ready. Messages stay inside the lightweight terminal and use the same IVAI free-only routes.";
    await sendMessage(env, { chatId, text, keyboard: terminalKeyboard(language), replyTo: message.message_id });
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
      text: languageMenuText(language),
      keyboard: languageKeyboard(language),
      replyTo: message.message_id
    });
    return true;
  }
  if (command === "/notify") {
    const action = String(args[0] || "show").toLowerCase();
    if (action === "on" || action === "off") await setReengagementPreference(userId, action === "on", env);
    const preference = await getReengagementPreference(userId, env);
    await sendMessage(env, { chatId, text: reengagementText(language, preference.enabled), keyboard: reengagementKeyboard(language, preference.enabled), replyTo: message.message_id });
    return true;
  }
  if (command === "/models" || (command === "/model" && !argumentText)) {
    await sendModelList(chatId, language, settings.selectedModel, env, message.message_id);
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
  if (command === "/task") {
    const parsed = parseTaskInput(argumentText);
    if (parsed.error) {
      const usage = language === "fa" ? "استفاده: <code>/task عنوان</code> یا <code>/task in 30m | عنوان</code> یا <code>/task 2026-08-21T09:00:00+03:30 | عنوان</code>" : "Usage: <code>/task title</code>, <code>/task in 30m | title</code>, or <code>/task 2026-08-21T09:00:00+03:30 | title</code>";
      await sendMessage(env, { chatId, text: usage, replyTo: message.message_id });
      return true;
    }
    try {
      const task = await createSecretaryTask({ userId, chatId, title: parsed.title, dueAt: parsed.dueAt }, env);
      const due = task.dueAt ? `\n\n${language === "fa" ? "یادآوری" : "Reminder"}: <code>${escapeHtml(task.dueAt.replace(".000Z", "Z"))}</code>` : "";
      await sendMessage(env, { chatId, text: `${language === "fa" ? "✓ task ساخته شد" : "✓ Task created"}: <b>${escapeHtml(task.title)}</b>${due}`, replyTo: message.message_id });
    } catch {
      await sendMessage(env, { chatId, text: responseText(language, "temporary"), replyTo: message.message_id });
    }
    return true;
  }
  if (command === "/tasks") {
    const tasks = await listSecretaryTasks(userId, env);
    await sendMessage(env, { chatId, text: secretaryTaskText(tasks, language), keyboard: secretaryTaskKeyboard(tasks, language), replyTo: message.message_id });
    return true;
  }
  if (command === "/done" || command === "/cancel") {
    const token = String(args[0] || "").toLowerCase();
    const tasks = await listSecretaryTasks(userId, env, { limit: 50 });
    const matches = tasks.filter((task) => task.id.toLowerCase().startsWith(token));
    const ok = token.length >= 4 && matches.length === 1 && await updateSecretaryTaskStatus({ id: matches[0].id, userId, status: command === "/done" ? "done" : "cancelled" }, env);
    await sendMessage(env, { chatId, text: ok ? (command === "/done" ? (language === "fa" ? "✓ task انجام شد." : "✓ Task marked done.") : (language === "fa" ? "✓ task لغو شد." : "✓ Task cancelled.")) : (language === "fa" ? "شناسهٔ task معتبر نیست. /tasks را باز کنید." : "That task ID is not valid. Open /tasks."), replyTo: message.message_id });
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
      await clearUserMemory(message, env);
      await sendMessage(env, { chatId, text: language === "fa" ? "✓ حافظهٔ این گفت‌وگو و IVAI Terminal پاک شد." : "✓ This conversation and IVAI Terminal memory were cleared.", replyTo: message.message_id });
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
    await clearUserMemory(message, env);
    await sendMessage(env, { chatId, text: language === "fa" ? "✓ تنظیمات IVAI و حافظهٔ Terminal بازنشانی شد." : "✓ IVAI settings and Terminal memory were reset.", replyTo: message.message_id });
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
  const delivery = messageSendContext(message);
  const knownSettings = await getUserSettings(userId, env);
  const language = knownSettings.language || languageFromMessage(message) || "en";
  const membership = await isRequiredChannelMember(userId, env);
  if (!membership.allowed) {
    await sendMembershipRequired(message, language, membership, env);
    return;
  }
  await upsertUser({ user: message.from, chat: message.chat, language }, env);
  if (text.startsWith("/") && await handleCommand(message, env, language)) return;

  const settings = await getUserSettings(userId, env);
  const usage = await allowUsage({ scope: "text", id: userId, limit: APP.userHourlyTextLimit }, env);
  if (!usage.allowed) {
    await sendMessage(env, { chatId, text: responseText(language, "busy"), replyTo: message.message_id, ...delivery });
    return;
  }

  const key = contextKey(message);
  const context = settings.memoryEnabled ? await getGuestMemory(key, env) : [];
  await sendTyping(env, chatId, delivery).catch(() => {});
  const richEligible = message.chat?.type === "private" && !delivery.businessConnectionId;
  let richDraftActive = false;
  if (richEligible) {
    try {
      await sendRichMessageDraft(env, {
        chatId,
        draftId: Number(message.message_id) || 1,
        html: `<tg-thinking>${language === "fa" ? "IVAI در حال فکر کردن" : "IVAI is thinking"}</tg-thinking>`,
        threadId: delivery.threadId,
        rtl: language === "fa"
      });
      richDraftActive = true;
    } catch (error) {
      console.info(JSON.stringify({ event: "rich_draft_fallback", error: String(error?.message || "unknown") }));
    }
  }
  const progress = richDraftActive ? null : await sendMessage(env, {
    chatId,
    text: thinkingText(language, 0),
    replyTo: message.message_id,
    ...delivery
  }).catch(() => null);
  const thinking = progress?.message_id ? startThinkingAnimation(env, { chatId, messageId: progress.message_id, language, ...delivery }) : null;

  try {
    const result = await generateReply({ text, selectedMode: settings.mode, selectedModel: settings.selectedModel, language, context }, env);
    await thinking?.stop();
    if (settings.memoryEnabled) {
      await saveGuestMemory(key, [...context, { role: "user", content: text }, { role: "assistant", content: result.text }], env);
    }
    const finalText = `${renderAiText(result.text)}\n\n${responseMeta({ model: result.model, mode: result.mode, language })}`;
    if (finalText.length <= APP.maxTelegramText) {
      if (richDraftActive) {
        try {
          await sendRichMessage(env, { chatId, html: finalText, replyTo: message.message_id, ...delivery, rtl: language === "fa" });
          return;
        } catch (error) {
          console.info(JSON.stringify({ event: "rich_message_fallback", error: String(error?.message || "unknown") }));
        }
      }
      if (progress?.message_id) await editMessage(env, { chatId, messageId: progress.message_id, text: finalText, businessConnectionId: delivery.businessConnectionId });
      else await sendMessage(env, { chatId, text: finalText, replyTo: message.message_id, ...delivery });
      return;
    }
    if (progress?.message_id) {
      await editMessage(env, {
        chatId,
        messageId: progress.message_id,
        text: language === "fa" ? "<i>پاسخ طولانی است و در پیام‌های زیر ارسال شد.</i>" : "<i>The full response is sent below.</i>",
        businessConnectionId: delivery.businessConnectionId
      });
    }
    await sendMessage(env, { chatId, text: result.text, replyTo: message.message_id, parseMode: null, ...delivery });
    await sendMessage(env, { chatId, text: responseMeta({ model: result.model, mode: result.mode, language }), ...delivery });
  } catch (error) {
    await thinking?.stop();
    const code = safeError(error);
    const failureText = responseText(language, code === "RATE_LIMIT" ? "busy" : "temporary");
    if (progress?.message_id) await editMessage(env, { chatId, messageId: progress.message_id, text: failureText, businessConnectionId: delivery.businessConnectionId }).catch(() => {});
    else await sendMessage(env, { chatId, text: failureText, replyTo: message.message_id, ...delivery });
    console.error(JSON.stringify({ event: "ai_failure", code, userId: String(userId) }));
  }
}

async function processMedia(message, env) {
  const userId = message.from?.id;
  const chatId = message.chat?.id;
  const delivery = messageSendContext(message);
  const language = (await getUserSettings(userId, env)).language || languageFromMessage(message) || "en";
  const membership = await isRequiredChannelMember(userId, env);
  if (!membership.allowed) {
    await sendMembershipRequired(message, language, membership, env);
    return;
  }
  await upsertUser({ user: message.from, chat: message.chat, language }, env);
  const usage = await allowUsage({ scope: "media", id: userId, limit: APP.userDailyMediaLimit, windowSeconds: 24 * 60 * 60 }, env);
  if (!usage.allowed) {
    await sendMessage(env, { chatId, text: responseText(language, "busy"), replyTo: message.message_id, ...delivery });
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
      await sendMessage(env, { chatId, text: responseText(language, "unsupportedMedia"), replyTo: message.message_id, ...delivery });
      return;
    }
    await sendMessage(env, {
      chatId,
      text: `${prefix}${renderAiText(result.text)}\n\n${responseMeta({ model: result.model, language })}`,
      replyTo: message.message_id,
      ...delivery
    });
  } catch (error) {
    const code = safeError(error);
    await sendMessage(env, { chatId, text: responseText(language, code === "RATE_LIMIT" ? "busy" : "temporary"), replyTo: message.message_id, ...delivery });
    console.error(JSON.stringify({ event: "media_failure", code, userId: String(userId) }));
  }
}

async function handleInlineQuery(query, env) {
  const userId = query.from?.id;
  const language = (await getUserSettings(userId, env)).language || (query.from?.language_code === "fa" ? "fa" : "en");
  const prompt = String(query.query || "").trim();
  const membership = await isRequiredChannelMember(userId, env);
  if (!membership.allowed) return answerInlineMembershipRequired(query, language, env);
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
  const messageId = query.message?.message_id;
  if (!chatId || !messageId) return;

  if (data === "membership:check") {
    const membership = await isRequiredChannelMember(userId, env);
    if (!membership.allowed) {
      await editMessage(env, { chatId, messageId, text: requiredMembershipText(language, { checkFailed: membership.reason === "CHECK_FAILED" }), keyboard: requiredMembershipKeyboard(language) });
      return;
    }
    await editMessage(env, { chatId, messageId, text: membershipConfirmedText(language), keyboard: welcomeKeyboard(language, query.message) });
    return;
  }

  const membership = await isRequiredChannelMember(userId, env);
  if (!membership.allowed) {
    await editMessage(env, { chatId, messageId, text: requiredMembershipText(language, { checkFailed: membership.reason === "CHECK_FAILED" }), keyboard: requiredMembershipKeyboard(language) });
    return;
  }

  if (data === "notify:on" || data === "notify:off") {
    const enabled = data === "notify:on";
    await setReengagementPreference(userId, enabled, env);
    await editMessage(env, { chatId, messageId, text: reengagementText(language, enabled), keyboard: reengagementKeyboard(language, enabled) });
    return;
  }
  if (data.startsWith("task:")) {
    const [, action, taskId] = data.split(":");
    if (!["done", "cancel"].includes(action) || !taskId) return;
    const changed = await updateSecretaryTaskStatus({ id: taskId, userId, status: action === "done" ? "done" : "cancelled" }, env);
    const tasks = await listSecretaryTasks(userId, env);
    const prefix = changed ? (action === "done" ? (language === "fa" ? "✓ task انجام شد." : "✓ Task marked done.") : (language === "fa" ? "✓ task لغو شد." : "✓ Task cancelled.")) : (language === "fa" ? "این task دیگر باز نیست." : "This task is no longer open.");
    await editMessage(env, { chatId, messageId, text: `${prefix}\n\n${secretaryTaskText(tasks, language)}`, keyboard: secretaryTaskKeyboard(tasks, language) });
    return;
  }
  if (data === "menu:main" || data === "modes:back") {
    await editMessage(env, { chatId, messageId, text: menuText(language), keyboard: mainKeyboard(language, query.message) });
    return;
  }
  if (data === "menu:help") {
    await editMessage(env, { chatId, messageId, text: helpText(language), keyboard: mainKeyboard(language, query.message) });
    return;
  }
  if (data === "menu:models") {
    const settings = await getUserSettings(userId, env);
    const view = await modelPickerView(language, settings.selectedModel, env);
    await editMessage(env, { chatId, messageId, text: view.text, keyboard: view.keyboard });
    return;
  }
  if (data.startsWith("model:page:")) {
    const page = Number(data.slice("model:page:".length));
    const settings = await getUserSettings(userId, env);
    const view = await modelPickerView(language, settings.selectedModel, env, Number.isFinite(page) ? page : 0);
    await editMessage(env, { chatId, messageId, text: view.text, keyboard: view.keyboard });
    return;
  }
  if (data.startsWith("model:pick:")) {
    const index = Number(data.slice("model:pick:".length));
    const catalog = await getFreeModelCatalog(env);
    const model = catalog[index];
    if (!model) return;
    await setSelectedModel(userId, model.id, env);
    const view = await modelPickerView(language, model.id, env, Math.floor(index / 6));
    await editMessage(env, { chatId, messageId, text: `${language === "fa" ? "✓ مدل انتخاب شد" : "✓ Model selected"}: <code>${escapeHtml(model.id)}</code>\n${language === "fa" ? "این مدل در اولویت است و fallback رایگان باقی می‌ماند." : "This model is preferred; free fallback remains available."}`, keyboard: view.keyboard });
    return;
  }
  if (data === "model:auto") {
    await setSelectedModel(userId, null, env);
    const view = await modelPickerView(language, null, env);
    await editMessage(env, { chatId, messageId, text: `${language === "fa" ? "✓ Auto policy فعال شد." : "✓ Auto policy is active."}\n\n${view.text}`, keyboard: view.keyboard });
    return;
  }
  if (data === "model:refresh") {
    try { await refreshFreeModelCatalog(env); } catch { /* The picker keeps the last safe catalog. */ }
    const settings = await getUserSettings(userId, env);
    const view = await modelPickerView(language, settings.selectedModel, env);
    await editMessage(env, { chatId, messageId, text: view.text, keyboard: view.keyboard });
    return;
  }
  if (data === "model:noop") return;
  if (data === "menu:settings" || data === "settings:open") {
    const settings = await getUserSettings(userId, env);
    const text = `<b>${language === "fa" ? "تنظیمات IVAI" : "IVAI settings"}</b>\n\n${language === "fa" ? "حالت" : "Mode"}: <code>${escapeHtml(modeLabel(settings.mode, language))}</code>\n${language === "fa" ? "مدل" : "Model"}: <code>${escapeHtml(settings.selectedModel || "Auto")}</code>\n${language === "fa" ? "حافظه" : "Memory"}: <code>${settings.memoryEnabled ? "on" : "off"}</code>`;
    await editMessage(env, { chatId, messageId, text, keyboard: settingsKeyboard(language, settings.memoryEnabled) });
    return;
  }
  if (data === "settings:memory") {
    const settings = await getUserSettings(userId, env);
    await setMemoryEnabled(userId, !settings.memoryEnabled, env);
    const next = { ...settings, memoryEnabled: !settings.memoryEnabled };
    const text = `<b>${language === "fa" ? "تنظیمات IVAI" : "IVAI settings"}</b>\n\n${language === "fa" ? "حافظه" : "Memory"}: <code>${next.memoryEnabled ? "on" : "off"}</code>`;
    await editMessage(env, { chatId, messageId, text, keyboard: settingsKeyboard(language, next.memoryEnabled) });
    return;
  }
  if (data === "settings:reset") {
    await setUserMode(userId, MODES.AUTO, env);
    await setSelectedModel(userId, null, env);
    await setMemoryEnabled(userId, false, env);
    await Promise.all([
      clearGuestMemory(conversationKey({ chatId, userId, threadId: getThreadId(query.message), replyTo: query.message?.reply_to_message?.message_id }), env),
      clearGuestMemory(terminalMemoryKey(userId), env)
    ]);
    await editMessage(env, { chatId, messageId, text: language === "fa" ? "✓ تنظیمات و حافظهٔ Terminal بازنشانی شد." : "✓ Settings and Terminal memory were reset.", keyboard: mainKeyboard(language, query.message) });
    return;
  }
  if (data === "menu:language") {
    await editMessage(env, { chatId, messageId, text: languageMenuText(language), keyboard: languageKeyboard(language) });
    return;
  }

  if (data === "modes:more") {
    await editMessage(env, { chatId, messageId, text: helpText(language), keyboard: mainKeyboard(language, query.message) });
    return;
  }
  if (data === "modes:back") {
    if (!chatId || !query.message?.message_id) return;
    await editMessage(env, {
      chatId,
      messageId: query.message.message_id,
      text: menuText(language),
      keyboard: mainKeyboard(language, query.message)
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
  if (data.startsWith("lang:page:")) {
    const page = Number(data.slice("lang:page:".length));
    await editMessage(env, { chatId, messageId, text: languageMenuText(language), keyboard: languageKeyboard(language, Number.isFinite(page) ? page : 0) });
    return;
  }
  if (data.startsWith("lang:set:") || data === "lang:en" || data === "lang:fa") {
    const selected = data.startsWith("lang:set:") ? data.slice("lang:set:".length) : data.slice(5);
    if (!SUPPORTED_LANGUAGE_CODES.has(selected)) return;
    await setUserLanguage(userId, selected, env);
    await editMessage(env, { chatId, messageId, text: selected === "fa" ? "✓ زبان فارسی فعال شد." : selected === "ar" ? "✓ تم تفعيل العربية." : `✓ ${escapeHtml(selected)} is now active.`, keyboard: mainKeyboard(selected, query.message) });
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
  if (update.guest_message) return handleGuestMessage(update.guest_message, env);
  if (update.message_reaction) return handleMessageReaction(update.message_reaction, env);
  if (update.inline_query) return handleInlineQuery(update.inline_query, env);
  if (update.chosen_inline_result) return handleChosenInlineResult(update.chosen_inline_result, env);
  if (update.callback_query) return processCallback(update.callback_query, env);
  const message = userMessage(update);
  if (!message) return;
  if (message.text) return processText(message, env);
  if (message.voice || message.photo?.length) return processMedia(message, env);
  const language = languageFromMessage(message) || "en";
  const membership = await isRequiredChannelMember(message.from?.id, env);
  if (!membership.allowed) {
    await sendMembershipRequired(message, language, membership, env);
    return;
  }
  await upsertUser({ user: message.from, chat: message.chat, language }, env);
  if (message.chat?.id) await sendMessage(env, { chatId: message.chat.id, text: responseText(language, "unsupportedMedia"), replyTo: message.message_id });
}

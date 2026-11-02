import { APP, GROUP_POLICY, MODES, SUPPORTED_LANGUAGE_CODES, USER_FACING_MODES } from "./config.js";
import { generateReply } from "./ai.js";
import { getFreeModelCatalog, refreshFreeModelCatalog, renderModelList, selectCatalogModel } from "./catalog.js";
import { analyzePhoto, transcribeVoice } from "./media.js";
import { cancelBroadcast } from "./broadcast.js";
import { allowUsage, canBroadcast, canManage, getRole, safeError } from "./security.js";
import { getRequiredChannelMembership } from "./membership.js";
import {
  conversationKey,
  createSecretaryTask,
  createBroadcastDraft,
  ensureConversationSession,
  getConversationSession,
  getAdminOperationalStats,
  getUserDebugStats,
  getUserSettings,
  getReengagementPreference,
  listSecretaryTasks,
  markBroadcastConfirmed,
  recordFeedback,
  resetUserAgentPreferences,
  saveConversationSession,
  startNewConversationSession,
  setMemoryEnabled,
  setReengagementPreference,
  setSelectedModel,
  setUserLanguage,
  setUserMode,
  updateSecretaryTaskStatus,
  upsertUser,
  writeAdminAudit
} from "./storage.js";
import { adminKeyboard, answerCallback, editMessage, ensureTerminalMenuButton, escapeHtml, languageKeyboard, languageMenuText, menuText, modelPickerKeyboard, modelPickerText, modelPickToken, modelRouteLabel, modelSelectionText, modeKeyboard, modeLabel, pickWelcomeSticker, requiredMembershipKeyboard, requiredMembershipText, responseMeta, sendMessage, sendRichMessage, sendRichMessageDraft, sendSticker, sendTyping, settingsKeyboard, splitText, startKeyboard, startThinkingAnimation, startTypingRefresher, telegram, terminalKeyboard, thinkingText, welcomeText } from "./telegram.js";
import { renderRichAiText, renderStandardAiText } from "./rich-renderer.js";

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

function membershipCheckAlertText(language, { checkFailed = false } = {}) {
  if (language === "fa") return checkFailed ? "بررسی از Telegram تأیید نشد. بات باید administrator کانال @ILIVIR3 باشد." : "عضویت شما هنوز در کانال تأیید نشده است.";
  if (language === "ar") return checkFailed ? "تعذر التحقق من Telegram. يجب أن يكون البوت مشرفًا في @ILIVIR3." : "لم يتم تأكيد عضويتك في القناة بعد.";
  return checkFailed ? "Telegram could not verify membership. The bot must be an administrator of @ILIVIR3." : "Your channel membership is not active yet.";
}

async function isRequiredChannelMember(userId, env) {
  const first = await getRequiredChannelMembership(userId, env);
  // A denial served from the cache may be stale by the time a prompt would be
  // shown (the user may have joined since). Re-verify live once before any
  // membership prompt is sent; a denial that was already checked live stands.
  if (first.allowed || !first.fromCache) return first;
  return getRequiredChannelMembership(userId, env, { fresh: true });
}

async function sendMembershipRequired(message, language, membership, env) {
  if (!message?.chat?.id) return;
  const context = messageSendContext(message);
  const text = requiredMembershipText(language, { checkFailed: membership?.reason === "CHECK_FAILED" });
  const keyboard = requiredMembershipKeyboard(language);
  // The prompt is a Rich Message with the Join/Check buttons inside the message
  // itself; fall back to a plain message when Rich is unavailable.
  try {
    await sendRichMessage(env, {
      chatId: message.chat.id,
      html: text,
      keyboard,
      replyTo: message.message_id,
      rtl: ["fa", "ar"].includes(language),
      ...context
    });
  } catch {
    await sendMessage(env, { chatId: message.chat.id, text, keyboard, replyTo: message.message_id, ...context });
  }
}

// Private entry-point messages (start/menu/help and similar) carry their
// keyboard inside a Rich Message instead of as buttons under a plain message.
// Groups and any Rich failure keep the plain sendMessage path.
async function sendEntryMessage(env, message, { html, keyboard, language = "en" }) {
  const context = messageSendContext(message);
  if (message.chat?.type === "private") {
    try {
      await sendRichMessage(env, {
        chatId: message.chat.id,
        html,
        keyboard,
        replyTo: message.message_id,
        rtl: ["fa", "ar"].includes(language),
        ...context
      });
      return;
    } catch { /* Fall through to the plain message. */ }
  }
  await sendMessage(env, { chatId: message.chat.id, text: html, keyboard, replyTo: message.message_id, ...context });
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

function scriptLanguageFromMessage(message) {
  const text = String(message?.text || message?.caption || "");
  if (/[\u0600-\u06ff]/.test(text)) {
    const telegramLanguage = String(message?.from?.language_code || "").replace("_", "-").toLowerCase();
    const persianSpecific = /[\u067e\u0686\u0698\u06af\u06a9\u06cc]/.test(text);
    const arabicSpecific = /[\u0621\u0623\u0625\u0626\u0629\u0649\u0624]/.test(text);
    return !persianSpecific && (telegramLanguage === "ar" || telegramLanguage.startsWith("ar-") || arabicSpecific) ? "ar" : "fa";
  }
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[\u0900-\u097f]/.test(text)) return "hi";
  return null;
}

function languageFromMessage(message) {
  const scripted = scriptLanguageFromMessage(message);
  if (scripted) return scripted;
  const code = String(message?.from?.language_code || "").replace("_", "-");
  const exact = [...SUPPORTED_LANGUAGE_CODES].find((value) => value.toLowerCase() === code.toLowerCase());
  const base = code.split("-")[0].toLowerCase();
  return exact || (SUPPORTED_LANGUAGE_CODES.has(base) ? base : "en");
}

function activeConversationLanguage(message, settings, session) {
  return scriptLanguageFromMessage(message) || session?.language || settings?.language || "en";
}

// --- Group gate (v3.4.0) -------------------------------------------------------
// In groups the bot stays silent unless a message is a real trigger: a post from
// the required channel, a reply to the bot, or a mention/command addressed to it.

// Group turns (v3.5.0) always run the Fast profile on the lightest pinned free
// model, overriding the user's stored mode/model at the group call sites only —
// private chats keep the user's own settings, and provider fallback is unchanged.
const GROUP_MODEL = "@cf/zai-org/glm-4.7-flash";
// Group model context is capped at the last 5 chain messages (seed + injected
// reply + Session), which is also what keeps group token spend minimal.
const GROUP_CONTEXT_LIMIT = 5;
function botIdFromEnv(env) {
  const id = Number(String(env.TELEGRAM_BOT_TOKEN || "").split(":")[0]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isGroupChat(message) {
  return ["group", "supergroup"].includes(message?.chat?.type);
}

function isChannelPost(message) {
  return String(message?.sender_chat?.id ?? "") === String(APP.requiredChannelId);
}

function hasBotMention(message, botId) {
  const text = String(message?.text || message?.caption || "");
  const suffix = `@${APP.botUsername.toLowerCase()}`;
  const entities = message?.entities || message?.caption_entities || [];
  for (const entity of entities) {
    const slice = text.slice(entity.offset, entity.offset + entity.length).toLowerCase();
    if (entity.type === "text_mention" && botId && Number(entity.user?.id) === botId) return true;
    if ((entity.type === "mention" || entity.type === "bot_command") && slice.endsWith(suffix)) return true;
  }
  if (!entities.length && text.toLowerCase().includes(suffix)) return true;
  const firstToken = text.trim().split(/\s+/)[0] || "";
  return firstToken.startsWith("/") && firstToken.toLowerCase().endsWith(suffix);
}

// GroupAnonymousBot identity: an admin posting as the group itself — the
// sender_chat IS this chat. It has no user to membership-check or quota.
function isAnonGroupAdmin(message) {
  return Boolean(message?.sender_chat) && String(message.sender_chat.id) === String(message?.chat?.id);
}

// Narrow diagnostics for trigger near-misses only (a reply aimed at a bot/post
// the gate could not match, or a bot-addressed entity) — never ordinary chatter,
// so production logs can explain a missed trigger without logging the group.
function logGroupGateNearMiss(message, reason) {
  console.info(JSON.stringify({ event: "group_gate", trigger: null, chatId: String(message?.chat?.id || ""), reason }));
}

function hasBotAddressedEntity(message) {
  const text = String(message?.text || message?.caption || "");
  const entities = message?.entities || message?.caption_entities || [];
  return entities.some((entity) => {
    if (entity.type === "bot_command") return true;
    if (entity.type === "text_mention") return Boolean(entity.user?.is_bot);
    // Bot usernames always end in "bot", so a mention slice that does is a bot.
    return entity.type === "mention" && text.slice(entity.offset, entity.offset + entity.length).toLowerCase().endsWith("bot");
  });
}

function groupTrigger(message, env) {
  if (!isGroupChat(message)) return null;
  if (isChannelPost(message)) return "channel_post";
  const botId = botIdFromEnv(env);
  const target = message.reply_to_message;
  const repliedFrom = target?.from;
  let trigger = null;
  if (target && repliedFrom && ((botId && Number(repliedFrom.id) === botId) || String(repliedFrom.username || "").toLowerCase() === APP.botUsername.toLowerCase())) {
    trigger = "reply";
  } else if (target && (String(target.sender_chat?.id ?? "") === String(APP.requiredChannelId)
    || (Number(repliedFrom?.id) === 777000 && String(target.forward_from_chat?.id ?? "") === String(APP.requiredChannelId)))) {
    // A comment threaded directly on the channel post in the discussion group.
    trigger = "post_reply";
  } else if (hasBotMention(message, botId)) {
    trigger = "mention";
  }
  if (trigger) {
    // Other bots and foreign sender_chat identities never trigger the bot; the
    // anonymous group admin (sender_chat === this chat) is the only exception.
    const rejectedSender = (message.from?.is_bot && !isAnonGroupAdmin(message))
      || (message.sender_chat && !isAnonGroupAdmin(message))
      || Number(message.from?.id) === 777000
      || (Number(message.from?.id) === 1087968824 && !isAnonGroupAdmin(message));
    if (!rejectedSender) return trigger;
    logGroupGateNearMiss(message, "sender_rejected");
    return null;
  }
  if (target && (repliedFrom?.is_bot || Number(repliedFrom?.id) === 777000 || target.sender_chat)) {
    logGroupGateNearMiss(message, "reply_target_unmatched");
  } else if (hasBotAddressedEntity(message)) {
    logGroupGateNearMiss(message, "mention_unmatched");
  }
  return null;
}

function stripBotMention(text) {
  return String(text || "").replace(new RegExp(`@${APP.botUsername}\\b`, "gi"), "").replace(/\s+/g, " ").trim();
}

// Primary tier: the group linked to the required channel (resolved lazily via
// getChat and cached for a day), an explicit PRIMARY_GROUP_CHAT_ID, or any chat
// receiving a channel post. Everything else is the stricter "other" tier.
async function groupTier(message, env, trigger) {
  if (trigger === "channel_post" || trigger === "post_reply") return "primary";
  if (env.PRIMARY_GROUP_CHAT_ID && String(env.PRIMARY_GROUP_CHAT_ID) === String(message.chat.id)) return "primary";
  try {
    const key = `linked:${APP.requiredChannelId}`;
    let linked = await env.IVAI_KV?.get(key);
    if (linked === null || linked === undefined) {
      const chat = await telegram(env, "getChat", { chat_id: APP.requiredChannelId });
      linked = String(chat?.linked_chat_id || "");
      await env.IVAI_KV?.put(key, linked, { expirationTtl: 24 * 60 * 60 });
    }
    if (linked && String(linked) === String(message.chat.id)) return "primary";
  } catch { /* Fail safe to the stricter tier. */ }
  return "other";
}

async function passGroupLimits(message, env, tier, trigger) {
  const chatId = message.chat.id;
  if (trigger === "channel_post") {
    return (await allowUsage({ scope: "chanpost", id: chatId, limit: GROUP_POLICY.channelPostHourlyLimit }, env)).allowed;
  }
  try {
    if (await env.IVAI_KV?.get(`groupcd:${chatId}`)) return false;
  } catch { /* A cache read failure must not block a legitimate trigger. */ }
  const hourly = await allowUsage({ scope: "group", id: chatId, limit: tier === "primary" ? GROUP_POLICY.primaryHourlyLimit : GROUP_POLICY.otherHourlyLimit }, env);
  if (!hourly.allowed) return false;
  if (tier === "other") {
    const daily = await allowUsage({ scope: "groupday", id: chatId, limit: GROUP_POLICY.otherDailyLimit, windowSeconds: 24 * 60 * 60 }, env);
    if (!daily.allowed) return false;
  }
  return true;
}

async function setGroupCooldown(message, env, tier) {
  try {
    await env.IVAI_KV?.put(`groupcd:${message.chat.id}`, "1", {
      expirationTtl: tier === "primary" ? GROUP_POLICY.primaryCooldownSeconds : GROUP_POLICY.otherCooldownSeconds
    });
  } catch { /* Best-effort. */ }
}

// Reply-chain memory (v3.5.0): the model never saw the message a user replied
// to, so follow-ups lost their topic. The replied-to text/caption (capped) joins
// the turn's context as an assistant turn when it is the bot's own message and
// as a user turn otherwise; it is saved with the turn so the chain persists.
function repliedContextEntry(message, env) {
  const target = message?.reply_to_message;
  const content = String(target?.text || target?.caption || "").trim().slice(0, 600);
  if (!target || !content) return null;
  const botId = botIdFromEnv(env);
  const fromBot = (botId && Number(target.from?.id) === botId)
    || String(target.from?.username || "").toLowerCase() === APP.botUsername.toLowerCase();
  return { role: fromBot ? "assistant" : "user", content };
}

// Shared per-thread seed scope for a channel post: keyed by the post's thread
// (its message_thread_id, or its message id, which is what Telegram uses as the
// comment thread id) under a fixed "channel" user scope so every participant
// continuing that thread shares the same post + comment context.
function channelThreadSeedKey(message) {
  return conversationKey({
    chatId: message.chat?.id,
    userId: "channel",
    threadId: message.message_thread_id || message.message_id
  });
}

// Channel-post comment sampling (v3.5.1): not every post earns a comment.
// The verdict hashes the chat + message ids (FNV-1a), so it is stable per
// post — no stored state, no randomness — and keeps roughly
// GROUP_POLICY.channelPostReplyRate of eligible posts.
export function channelPostSampled(message) {
  const key = `chanpost:${message?.chat?.id}:${message?.message_id}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100 < Math.round(GROUP_POLICY.channelPostReplyRate * 100);
}

function logChannelCommentSkip(message, reason) {
  console.info(JSON.stringify({ event: "channel_comment_skip", reason, chatId: String(message?.chat?.id || "") }));
}

async function handleChannelPost(message, env) {
  // A channel post's text is its text or, for a media post, its caption —
  // the caption IS the post text, whatever media it carries (v3.5.4).
  const postText = String(message.text || message.caption || "").trim();
  // Eligibility and sampling run BEFORE the channel-post limit bucket: a
  // skipped post performs no work, so it must not burn quota (v3.5.1).
  if (!postText) {
    // A media-only post (photo, video, sticker, GIF, file, audio...) with no
    // text/caption never earns a comment (v3.5.4).
    logChannelCommentSkip(message, "media_type");
    return;
  }
  // Short posts never earn a comment: under 200 characters of text or
  // fewer than 20 words. The metric is content amount, not line count —
  // a long paragraph-style post is not a short post (v3.5.5).
  const wordCount = postText.split(/\s+/).filter(Boolean).length;
  if (postText.length < 200 || wordCount < 20) {
    logChannelCommentSkip(message, "short_post");
    return;
  }
  if (!channelPostSampled(message)) {
    logChannelCommentSkip(message, "sampled_out");
    return;
  }
  if (!await passGroupLimits(message, env, "primary", "channel_post")) return;
  try {
    // The reply is ONE comment in the post's own language, written like a
    // smart, witty group member with a soul: anchored in a concrete detail
    // from the post, first-person with a real take, never report-speak and
    // never a summary — and it carries no model/mode footer in the group.
    const language = scriptLanguageFromMessage(message) || "en";
    const result = await generateReply({
      text: `A post from the IVAI channel was just shared in its discussion group. Write ONE comment reacting to this post, in the SAME language as the post, as a smart, witty friend who actually hangs out in this group — never as an analyst filing a report. How: (1) pick one SPECIFIC detail from THIS post — a number, a name, a concrete fact, or a consequence it mentions — and if you can, turn it into a small vivid picture or an everyday-life comparison; (2) react like a person: first person is natural ("به نظرم", "in my view"), feelings and taste are welcome, and land one clear personal take — a judgment, a verdict, or a wry line. Hard rules: do NOT summarize, restate, paraphrase, or quote the post back; NO report-speak — never "this shows that", "this indicates", "could be improved by", no listing of implications, no neutral explainer tone; NO generic one-liners that could fit any post on this topic — if the comment would still work under a different post about the same subject, it is wrong. Keep it short: typically 1–3 lines (one or two sentences is often enough), at most 5. A single emoji is welcome when it genuinely fits, never required. No headings, no 'Summary' or 'Opinion' labels, no preamble, just the comment itself.\n\nPost:\n${postText}`,
      selectedMode: MODES.FAST,
      selectedModel: GROUP_MODEL,
      language,
      context: []
    }, env);
    // Models ignore length instructions, so the 5-line cap is enforced here too.
    const comment = String(result.text || "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 5).join("\n");
    if (!comment) return;
    await sendMessage(env, {
      chatId: message.chat.id,
      text: renderStandardAiText(comment),
      replyTo: message.message_id,
      ...messageSendContext(message)
    });
    // Seed the shared thread Session with the post + comment so a follow-up
    // anywhere in this thread still knows what the conversation is about.
    await saveConversationSession(channelThreadSeedKey(message), [
      { role: "user", content: postText },
      { role: "assistant", content: comment }
    ], env).catch(() => {});
  } catch (error) {
    console.error(JSON.stringify({ event: "channel_post_reply_failure", code: safeError(error), chatId: String(message.chat.id) }));
  }
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
    text = `${renderStandardAiText(result.text)}\n\n${responseMeta({ model: result.model, mode: MODES.GUEST, language })}`;
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
    return `<b>📖 راهنمای IVAI</b>\n\nیک پیام بفرستید؛ <code>Auto</code> مسیر رایگان مناسب را انتخاب می‌کند.\n\n<b>حالت‌ها</b>\n<code>Auto</code> انتخاب خودکار · <code>Fast</code> پاسخ سریع · <code>Deep</code> پاسخ دقیق\n\n<b>ابزارها</b>\n<code>/new</code> گفتگوی جدید · <code>/models</code> مدل رایگان · <code>/memory on|off</code> حافظه\n<code>/terminal</code> محیط گفتگو · <code>/details پرسش</code> پاسخِ بازشونده · <code>/task عنوان</code> یادآور · <code>/guard</code> بررسی ایمنی\n\n<blockquote>هر Session حافظهٔ کوتاه و مستقل دارد؛ همهٔ مسیرها رایگان هستند.</blockquote>`;
  }
  return `<b>📖 IVAI Help</b>\n\nSend a message; <code>Auto</code> selects a suitable free route.\n\n<b>Modes</b>\n<code>Auto</code> automatic · <code>Fast</code> concise · <code>Deep</code> detailed\n\n<b>Tools</b>\n<code>/new</code> new chat · <code>/models</code> free model · <code>/memory on|off</code> memory\n<code>/terminal</code> chat workspace · <code>/details prompt</code> expandable answer · <code>/task title</code> reminder · <code>/guard</code> safety check\n\n<blockquote>Each Session has short, independent memory; every route is free-only.</blockquote>`;
}

function newConversationText(language) {
  if (language === "fa") return "<b>🪐 گفتگوی تازه آماده است!</b>\n\n<blockquote>context قبلی و تنظیمات Agent بازنشانی شدند: حالت Auto، مدل خودکار و حافظه خاموش است. زبان رابط تو بدون تغییر مانده است. از کجا شروع کنیم؟</blockquote>";
  if (language === "ar") return "<b>🪐 محادثة جديدة جاهزة!</b>\n\n<blockquote>تمت إعادة تعيين سياق المحادثة وإعدادات الوكيل: الوضع تلقائي، واختيار النموذج تلقائي، والذاكرة متوقفة. تبقى لغة الواجهة كما هي. من أين نبدأ؟</blockquote>";
  return "<b>🪐 Fresh chat, ready to go!</b>\n\n<blockquote>Your previous context and Agent settings were reset: Auto mode, automatic model routing, and Memory off. Your interface language is unchanged. What would you like to explore?</blockquote>";
}

function getThreadId(message) {
  // A follow-up sent outside the thread view carries no thread id of its own,
  // but its reply target does; keying on the target's thread keeps the
  // follow-up in the same conversation Session as the thread it continues.
  return message.message_thread_id || message.reply_to_message?.message_thread_id || null;
}

function contextKey(message) {
  // Replies belong to their parent conversation. Only an explicit Telegram topic
  // establishes a separate Session boundary.
  return conversationKey({
    chatId: message.chat?.id,
    userId: message.from?.id,
    threadId: getThreadId(message)
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
    startNewConversationSession(contextKey(message), env),
    startNewConversationSession(terminalMemoryKey(message.from?.id), env)
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

function pickerScope(value = "all") {
  return ["all", "workers-ai", "openrouter", "groq", "google", "fast", "deep", "code"].includes(value) ? value : "all";
}

function scopedCatalog(catalog, scope) {
  const activeScope = pickerScope(scope);
  return activeScope === "all" ? catalog : catalog.filter((model) => model.provider === activeScope || model.category === activeScope);
}

async function modelPickerView(language, selectedModel, env, page = 0, scope = "all") {
  const catalog = await getFreeModelCatalog(env);
  const activeScope = pickerScope(scope);
  return {
    text: modelPickerText(catalog, { selectedModel, language, scope: activeScope }),
    keyboard: modelPickerKeyboard(catalog, { page, selectedModel, language, scope: activeScope })
  };
}

async function sendModelList(message, language, selectedModel, env) {
  const view = await modelPickerView(language, selectedModel, env);
  await sendEntryMessage(env, message, { html: view.text, keyboard: view.keyboard, language });
}

async function handleCommand(message, env, language) {
  const userId = message.from?.id;
  const chatId = message.chat?.id;
  const { command, args, argumentText } = commandParts(message.text);
  const settings = await getUserSettings(userId, env);

  if (command === "/start") {
    await startNewConversationSession(contextKey(message), env);
    const sticker = pickWelcomeSticker();
    if (sticker) {
      await sendSticker(env, { chatId, sticker, replyTo: message.message_id, ...messageSendContext(message) }).catch((error) => {
        console.warn(JSON.stringify({ event: "welcome_sticker_fallback", error: String(error?.message || "unknown") }));
      });
    }
    await sendEntryMessage(env, message, { html: welcomeText(language), keyboard: welcomeKeyboard(language, message), language });
    return true;
  }
  if (command === "/new") {
    await Promise.all([
      resetUserAgentPreferences(userId, env),
      startNewConversationSession(contextKey(message), env)
    ]);
    await sendMessage(env, { chatId, text: newConversationText(language), replyTo: message.message_id });
    return true;
  }
  if (command === "/menu") {
    await sendEntryMessage(env, message, { html: menuText(language, settings), keyboard: mainKeyboard(language, message), language });
    return true;
  }
  if (command === "/help") {
    await sendEntryMessage(env, message, { html: helpText(language), keyboard: mainKeyboard(language, message), language });
    return true;
  }
  if (command === "/terminal") {
    if (message.chat?.type !== "private") {
      await sendMessage(env, { chatId, text: language === "fa" ? "IVAI Terminal فقط در چت خصوصی با بات باز می‌شود." : "IVAI Terminal can only be opened in a private chat with the bot.", replyTo: message.message_id });
      return true;
    }
    const text = language === "fa" ? "<b>IVAI Terminal</b> آماده است. پیام‌ها در همان رابط سبک ردوبدل می‌شوند و از همان مسیرهای رایگان IVAI استفاده می‌کنند." : "<b>IVAI Terminal</b> is ready. Messages stay inside the lightweight terminal and use the same IVAI free-only routes.";
    await sendEntryMessage(env, message, { html: text, keyboard: terminalKeyboard(language), language });
    return true;
  }
  if (COMMAND_MODE[command]) {
    const mode = COMMAND_MODE[command];
    await setUserMode(userId, mode, env);
    const autoRoute = mode === MODES.AUTO
      ? (language === "fa" ? "\n<b>مسیر مدل:</b> <code>خودکار</code>" : language === "ar" ? "\n<b>مسار النموذج:</b> <code>تلقائي</code>" : "\n<b>Model route:</b> <code>Auto</code>")
      : "";
    await sendMessage(env, { chatId, text: `${responseText(language, "saved")} <b>${escapeHtml(modeLabel(mode, language))}</b>${autoRoute}`, replyTo: message.message_id });
    return true;
  }
  if (command === "/lang") {
    await sendEntryMessage(env, message, { html: languageMenuText(language), keyboard: languageKeyboard(language), language });
    return true;
  }
  if (command === "/notify") {
    const action = String(args[0] || "show").toLowerCase();
    if (action === "on" || action === "off") await setReengagementPreference(userId, action === "on", env);
    const preference = await getReengagementPreference(userId, env);
    await sendEntryMessage(env, message, { html: reengagementText(language, preference.enabled), keyboard: reengagementKeyboard(language, preference.enabled), language });
    return true;
  }
  if (command === "/models" || (command === "/model" && !argumentText)) {
    await sendModelList(message, language, settings.selectedModel, env);
    return true;
  }
  if (command === "/model" && args[0] === "off") {
    await setSelectedModel(userId, null, env);
    const mode = escapeHtml(modeLabel(settings.mode, language));
    const text = language === "fa"
      ? `✓ مسیر مدل خودکار شد. <b>حالت پاسخ:</b> <code>${mode}</code> (بدون تغییر)`
      : language === "ar"
        ? `✓ أصبح مسار النموذج تلقائيًا. <b>وضع الرد:</b> <code>${mode}</code> (دون تغيير)`
        : `✓ Model route is now Auto. <b>Response mode:</b> <code>${mode}</code> (unchanged)`;
    await sendMessage(env, { chatId, text, replyTo: message.message_id });
    return true;
  }
  if (command === "/pick") {
    const model = await selectCatalogModel(args[0], env);
    if (!model) {
      await sendMessage(env, { chatId, text: language === "fa" ? "شمارهٔ مدل معتبر نیست. ابتدا /models را ببینید." : "That model number is not valid. Run /models first.", replyTo: message.message_id });
      return true;
    }
    await setSelectedModel(userId, model.id, env);
    await sendMessage(env, { chatId, text: modelSelectionText(model, language, settings.mode), replyTo: message.message_id });
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
      const enabled = action === "on";
      await setMemoryEnabled(userId, enabled, env);
      // Turning Memory off resets both scopes immediately. New turns still keep a
      // bounded active Session so a normal multi-turn chat remains coherent.
      if (!enabled) await clearUserMemory(message, env);
      const text = enabled
        ? (language === "fa" ? "✓ تنظیم حافظه فعال شد؛ context کوتاه‌مدت گفت‌وگوی فعال هم حفظ می‌شود." : "✓ Memory preference enabled; active chat context remains available.")
        : (language === "fa" ? "✓ تنظیم حافظه خاموش شد و context فعلی چت و IVAI Terminal پاک شد. پیام‌های جدید فقط در Session فعال کوتاه‌مدت به‌هم متصل می‌مانند." : "✓ Memory preference is off and current chat/Terminal context was reset. New messages remain connected only within the short-lived active Session.");
      await sendMessage(env, { chatId, text, replyTo: message.message_id });
      return true;
    }
    if (action === "clear") {
      await clearUserMemory(message, env);
      await sendMessage(env, { chatId, text: language === "fa" ? "✓ حافظهٔ این گفت‌وگو و IVAI Terminal پاک شد." : "✓ This conversation and IVAI Terminal memory were cleared.", replyTo: message.message_id });
      return true;
    }
    const session = await getConversationSession(key, env);
    const memory = session?.messages || [];
    const preview = memory.length ? memory.map((entry) => `<b>${entry.role}:</b> ${escapeHtml(String(entry.content).slice(0, 280))}`).join("\n\n") : (language === "fa" ? "حافظه‌ای برای Session این گفت‌وگو نیست." : "There is no stored memory for this conversation Session.");
    await sendMessage(env, { chatId, text: preview, replyTo: message.message_id });
    return true;
  }
  if (command === "/debug") {
    const stats = await getUserDebugStats(userId, env);
    await sendMessage(env, { chatId, text: `<b>IVAI Status</b>\nResponse mode: <code>${escapeHtml(settings.mode)}</code>\nModel route: <code>${escapeHtml(modelRouteLabel(settings.selectedModel, "en"))}</code>\nMemory: <code>${settings.memoryEnabled ? "on" : "off"}</code>\nFeedback: <code>${stats.feedbackCount}</code>`, replyTo: message.message_id });
    return true;
  }
  if (command === "/active") {
    await sendMessage(env, { chatId, text: language === "fa" ? "IVAI برای حفظ سهمیهٔ رایگان، health check پرهزینهٔ همهٔ مدل‌ها را اجرا نمی‌کند. مسیرهای فعال با درخواست واقعی و fallback ترتیبی بررسی می‌شوند." : "To protect the free quota, IVAI does not ping every model. Active routes are verified on real requests with sequential fallback.", replyTo: message.message_id });
    return true;
  }
  if (command === "/reset") {
    await resetUserAgentPreferences(userId, env);
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
  // Group gate first: no trigger means total silence — no membership check,
  // settings load, upsert, session, or quota work happens for ordinary chatter.
  const isGroup = isGroupChat(message);
  let trigger = null;
  if (isGroup) {
    const commandSuffix = /^\/\S+@(\S+)/.exec(message.text.trim())?.[1];
    if (commandSuffix && commandSuffix.toLowerCase() !== APP.botUsername.toLowerCase()) {
      logGroupGateNearMiss(message, "command_for_other_bot");
      return;
    }
    trigger = groupTrigger(message, env);
    if (!trigger) return;
    if (trigger === "channel_post") return handleChannelPost(message, env);
  }
  let text = message.text.trim();
  const detailsCommand = text.match(/^\/details(?:@\w+)?\s+(.+)$/is);
  const richDetailsRequested = Boolean(detailsCommand);
  if (detailsCommand) text = detailsCommand[1].trim();
  if (trigger === "mention") {
    text = stripBotMention(text);
    if (!text) return;
  }
  const userId = message.from?.id;
  const chatId = message.chat.id;
  const delivery = messageSendContext(message);
  // The anonymous group admin has no user identity: no membership check and
  // no per-user quota apply to it (the per-chat group limits still do).
  const anonGroupAdmin = isGroup && isAnonGroupAdmin(message);
  const knownSettings = await getUserSettings(userId, env);
  // UI language is an explicit, persistent user preference (default English, only
  // changed via /lang). It is never derived from the Telegram client's language.
  const uiLanguage = knownSettings.language || "en";
  // Groups (v3.5.0): the ANSWER follows the triggering message's own language
  // when its script is detectable (a Persian greeting gets a Persian answer),
  // then the user's explicit stored language, then English. The UI language
  // above is unaffected: menus/prompts still never derive from the message.
  // Private chats keep script detection as a fallback only.
  let responseLanguage = isGroup ? scriptLanguageFromMessage(message) || uiLanguage : scriptLanguageFromMessage(message) || knownSettings.language || "en";
  if (!anonGroupAdmin) {
    const membership = await isRequiredChannelMember(userId, env);
    if (!membership.allowed) {
      await sendMembershipRequired(message, uiLanguage, membership, env);
      return;
    }
  }
  await upsertUser({ user: message.from, chat: message.chat, language: uiLanguage }, env);
  if (message.chat?.type === "private") await ensureTerminalMenuButton(env);
  if (text.startsWith("/") && await handleCommand(message, env, uiLanguage)) return;

  // handleCommand only mutates settings when it handles the message (and returns),
  // so the already-loaded settings are still authoritative here.
  const settings = knownSettings;
  const key = contextKey(message);
  const session = await ensureConversationSession(key, env, { language: responseLanguage });
  responseLanguage = isGroup ? scriptLanguageFromMessage(message) || settings.language || "en" : activeConversationLanguage(message, settings, session);
  let tier = null;
  if (isGroup) {
    tier = await groupTier(message, env, trigger);
    if (!await passGroupLimits(message, env, tier, trigger)) return;
  }
  const modelInput = richDetailsRequested
    ? `${text}\n\nFor this opt-in expandable answer, provide the normal answer first. Only if a short user-visible supplement adds value, wrap that supplement exactly as:\n:::details Optional details\nvisible supporting explanation\n:::enddetails\nNever include hidden reasoning, chain-of-thought, private analysis, policies, or instructions inside the details block.`
    : text;
  const usage = anonGroupAdmin ? { allowed: true } : await allowUsage({ scope: "text", id: userId, limit: APP.userHourlyTextLimit }, env);
  if (!usage.allowed) {
    await sendMessage(env, { chatId, text: responseText(uiLanguage, "busy"), replyTo: message.message_id, ...delivery });
    return;
  }

  // Reply-chain memory (v3.5.0): the shared channel-thread seed first (groups
  // with a thread only, and only when the Session does not already carry it),
  // then the Session, then the replied-to message. The merged context is what
  // the save below persists with the turn, so the chain survives follow-ups.
  // Group context is capped at the last GROUP_CONTEXT_LIMIT messages total.
  let context = session?.messages || [];
  if (isGroup) {
    const threadId = getThreadId(message);
    if (threadId) {
      const seed = await getConversationSession(conversationKey({ chatId, userId: "channel", threadId }), env).catch(() => null);
      const seedMessages = seed?.messages || [];
      if (seedMessages.length && !seedMessages.every((entry) => context.some((saved) => saved.role === entry.role && saved.content === entry.content))) {
        context = [...seedMessages, ...context];
      }
    }
  }
  const repliedEntry = repliedContextEntry(message, env);
  if (repliedEntry && !context.some((saved) => saved.role === repliedEntry.role && saved.content === repliedEntry.content)) {
    context = [...context, repliedEntry];
  }
  if (isGroup) context = context.slice(-GROUP_CONTEXT_LIMIT);
  await sendTyping(env, chatId, delivery).catch(() => {});
  const richEligible = message.chat?.type === "private" && !delivery.businessConnectionId;
  let richDraftActive = false;
  if (richEligible) {
    try {
      await sendRichMessageDraft(env, {
        chatId,
        draftId: Number(message.message_id) || 1,
        html: `<tg-thinking>${uiLanguage === "fa" ? "⏳ IVAI در حال فکر کردن" : "⏳ IVAI is thinking"}</tg-thinking>`,
        threadId: delivery.threadId,
        rtl: ["fa", "ar"].includes(responseLanguage)
      });
      richDraftActive = true;
    } catch (error) {
      console.info(JSON.stringify({ event: "rich_draft_fallback", error: String(error?.message || "unknown") }));
    }
  }
  // Groups get no progress/thinking message at all: one typing action, then the
  // final answer as a single reply to the trigger message.
  const progress = richDraftActive || isGroup ? null : await sendMessage(env, {
    chatId,
    text: thinkingText(uiLanguage, 0),
    replyTo: message.message_id,
    ...delivery
  }).catch(() => null);
  const thinking = progress?.message_id ? startThinkingAnimation(env, { chatId, messageId: progress.message_id, language: uiLanguage, ...delivery }) : null;
  // Groups have no progress message; a typing refresher keeps the indicator
  // alive while the model runs instead (chat actions expire after ~5 seconds).
  const typing = isGroup ? startTypingRefresher(env, { chatId, ...delivery }) : null;

  try {
    const result = await generateReply({
      text: modelInput,
      selectedMode: isGroup ? MODES.FAST : settings.mode,
      selectedModel: isGroup ? GROUP_MODEL : settings.selectedModel,
      language: responseLanguage,
      context
    }, env);
    if (isGroup) await setGroupCooldown(message, env, tier);
    await thinking?.stop();
    await typing?.stop();
    await saveConversationSession(key, [...context, { role: "user", content: text }, { role: "assistant", content: result.text }], env, { session, language: responseLanguage });
      // Groups never carry the model/mode footer (v3.5.0); private chats do.
      const footer = isGroup ? "" : `\n\n${responseMeta({ model: result.model, mode: result.mode, language: uiLanguage })}`;
      const finalText = `${renderStandardAiText(result.text)}${footer}`;
      // Keep the existing metadata block as-is: nesting a blockquote inside a Rich HTML
      // footer is not needed and can reduce parser compatibility across Telegram clients.
      const richFinalText = `${renderRichAiText(result.text, { allowDetails: richDetailsRequested, allowMath: [MODES.DEEP, MODES.CODE].includes(result.mode) })}\n${responseMeta({ model: result.model, mode: result.mode, language: uiLanguage })}`;
      if (finalText.length <= APP.maxTelegramText) {
        if (richDraftActive) {
          try {
            await sendRichMessage(env, { chatId, html: richFinalText, replyTo: message.message_id, ...delivery, rtl: ["fa", "ar"].includes(responseLanguage) });
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
        text: uiLanguage === "fa" ? "<i>پاسخ طولانی است و در پیام‌های زیر ارسال شد.</i>" : "<i>The full response is sent below.</i>",
        businessConnectionId: delivery.businessConnectionId
      });
    }
    // Split raw model output first, then render every part independently. This preserves the
    // safe HTML/blockquote layer for long replies without risking broken tags across boundaries.
    const rawParts = splitText(result.text, APP.maxTelegramText - 600);
    for (let index = 0; index < rawParts.length; index += 1) {
      const last = index === rawParts.length - 1;
      const formattedPart = renderStandardAiText(rawParts[index]);
      const textPart = last ? `${formattedPart}${footer}` : formattedPart;
      await sendMessage(env, { chatId, text: textPart, replyTo: isGroup || index === 0 ? message.message_id : undefined, ...delivery });
    }
  } catch (error) {
    await thinking?.stop();
    await typing?.stop();
    const code = safeError(error);
    const failureText = responseText(uiLanguage, code === "RATE_LIMIT" ? "busy" : "temporary");
    if (progress?.message_id) await editMessage(env, { chatId, messageId: progress.message_id, text: failureText, businessConnectionId: delivery.businessConnectionId }).catch(() => {});
    else await sendMessage(env, { chatId, text: failureText, replyTo: message.message_id, ...delivery });
    console.error(JSON.stringify({ event: "ai_failure", code, userId: String(userId) }));
  }
}

async function processMedia(message, env) {
  const isGroup = isGroupChat(message);
  let groupTriggerType = null;
  if (isGroup) {
    // Group media only proceeds as a reply to the bot or with a caption mention.
    groupTriggerType = groupTrigger(message, env);
    if (!groupTriggerType || groupTriggerType === "channel_post") return;
  }
  const userId = message.from?.id;
  const chatId = message.chat?.id;
  const delivery = messageSendContext(message);
  const storedLanguage = (await getUserSettings(userId, env)).language || "en";
  // Same v3.5.0 group rule as text turns: the answer follows the triggering
  // message's own language (e.g. a Persian photo caption) before stored/en.
  const language = isGroup ? scriptLanguageFromMessage(message) || storedLanguage : storedLanguage;
  // Same anonymous-group-admin exception as processText: no user to check.
  const anonGroupAdmin = isGroup && isAnonGroupAdmin(message);
  if (!anonGroupAdmin) {
    const membership = await isRequiredChannelMember(userId, env);
    if (!membership.allowed) {
      await sendMembershipRequired(message, language, membership, env);
      return;
    }
  }
  let tier = null;
  if (isGroup) {
    // Group media counts against the same per-chat limits/cooldown as group
    // text; without this it would bypass the group anti-spam policy entirely.
    tier = await groupTier(message, env, groupTriggerType);
    if (!await passGroupLimits(message, env, tier, groupTriggerType)) return;
    // Dedicated per-chat media cap on top of the shared group limits; a
    // blocked media is dropped silently like every other group limit.
    const mediaCap = await allowUsage({ scope: "groupmedia", id: chatId, limit: tier === "primary" ? GROUP_POLICY.primaryMediaHourlyLimit : GROUP_POLICY.otherMediaHourlyLimit }, env);
    if (!mediaCap.allowed) return;
  }
  await upsertUser({ user: message.from, chat: message.chat, language }, env);
  const usage = anonGroupAdmin ? { allowed: true } : await allowUsage({ scope: "media", id: userId, limit: APP.userDailyMediaLimit, windowSeconds: 24 * 60 * 60 }, env);
  if (!usage.allowed) {
    await sendMessage(env, { chatId, text: responseText(language, "busy"), replyTo: message.message_id, ...delivery });
    return;
  }
  if (isGroup) await sendTyping(env, chatId, delivery).catch(() => {});
  const typing = isGroup ? startTypingRefresher(env, { chatId, ...delivery }) : null;
  try {
    let result;
    let prefix = "";
    if (message.voice) {
      result = await transcribeVoice({ fileId: message.voice.file_id, languageHint: language }, env);
      prefix = language === "fa" ? "<b>متن صوت:</b>\n" : "<b>Voice transcription:</b>\n";
    } else if (message.photo?.length) {
      result = await analyzePhoto({ fileId: message.photo.at(-1).file_id, caption: message.caption || "", language }, env);
    } else {
      await typing?.stop();
      await sendMessage(env, { chatId, text: responseText(language, "unsupportedMedia"), replyTo: message.message_id, ...delivery });
      return;
    }
    await typing?.stop();
    await sendMessage(env, {
      chatId,
      // Groups never carry the model/mode footer (v3.5.0); private chats do.
      text: `${prefix}${renderStandardAiText(result.text)}${isGroup ? "" : `\n\n${responseMeta({ model: result.model, language })}`}`,
      replyTo: message.message_id,
      ...delivery
    });
    if (isGroup) await setGroupCooldown(message, env, tier);
  } catch (error) {
    await typing?.stop();
    const code = safeError(error);
    await sendMessage(env, { chatId, text: responseText(language, code === "RATE_LIMIT" ? "busy" : "temporary"), replyTo: message.message_id, ...delivery });
    console.error(JSON.stringify({ event: "media_failure", code, userId: String(userId) }));
  }
}

async function handleInlineQuery(query, env) {
  const userId = query.from?.id;
  const settings = await getUserSettings(userId, env);
  const language = settings.language || "en";
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
        input_message_content: { message_text: `${renderStandardAiText(result.text)}\n\n${responseMeta({ model: result.model, mode: result.mode, language })}`, parse_mode: "HTML", disable_web_page_preview: true }
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

function modeChangedText(mode, language) {
  const label = escapeHtml(modeLabel(mode, language));
  const autoRoute = mode === MODES.AUTO;
  if (language === "fa") {
    return `<b>✓ حالت پاسخ‌گویی تغییر کرد</b>\n\n<b>حالت فعال:</b> <code>${label}</code>${autoRoute ? "\n<b>مسیر مدل:</b> <code>خودکار</code>" : ""}`;
  }
  if (language === "ar") {
    return `<b>✓ تم تغيير نمط الاستجابة</b>\n\n<b>النمط النشط:</b> <code>${label}</code>${autoRoute ? "\n<b>مسار النموذج:</b> <code>تلقائي</code>" : ""}`;
  }
  return `<b>✓ Response mode changed</b>\n\n<b>Active mode:</b> <code>${label}</code>${autoRoute ? "\n<b>Model route:</b> <code>Auto</code>" : ""}`;
}

async function processCallback(query, env) {
  const userId = query.from?.id;
  const chatId = query.message?.chat?.id;
  const language = (await getUserSettings(userId, env)).language || "en";
  const data = String(query.data || "");
  const messageId = query.message?.message_id;
  if (!chatId || !messageId) return;

  if (data === "membership:check") {
    // The Check button always re-verifies live; a cached denial must never
    // decide the outcome of an explicit user-requested check.
    const membership = await getRequiredChannelMembership(userId, env, { fresh: true });
    if (!membership.allowed) {
      await answerCallback(env, query.id, membershipCheckAlertText(language, { checkFailed: membership.reason === "CHECK_FAILED" }), { showAlert: true }).catch(() => {});
      return;
    }
    await upsertUser({ user: query.from, chat: query.message.chat, language }, env);
    if (query.message.chat?.type === "private") await ensureTerminalMenuButton(env);
    await answerCallback(env, query.id).catch(() => {});
    await editMessage(env, { chatId, messageId, text: membershipConfirmedText(language), keyboard: welcomeKeyboard(language, query.message) });
    return;
  }

  await answerCallback(env, query.id).catch(() => {});
  const membership = await isRequiredChannelMember(userId, env);
  if (!membership.allowed) {
    await editMessage(env, { chatId, messageId, text: requiredMembershipText(language, { checkFailed: membership.reason === "CHECK_FAILED" }), keyboard: requiredMembershipKeyboard(language) });
    return;
  }
  await upsertUser({ user: query.from, chat: query.message.chat, language }, env);
  if (query.message.chat?.type === "private") await ensureTerminalMenuButton(env);

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
    const settings = await getUserSettings(userId, env);
    await editMessage(env, { chatId, messageId, text: menuText(language, settings), keyboard: mainKeyboard(language, query.message) });
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
  if (data.startsWith("model:view:")) {
    const scope = pickerScope(data.slice("model:view:".length));
    const settings = await getUserSettings(userId, env);
    const view = await modelPickerView(language, settings.selectedModel, env, 0, scope);
    await editMessage(env, { chatId, messageId, text: view.text, keyboard: view.keyboard });
    return;
  }
  if (data.startsWith("model:page:")) {
    const [requestedScope, requestedPage] = data.slice("model:page:".length).split(":");
    const legacyPage = requestedPage === undefined ? Number(requestedScope) : NaN;
    const scope = requestedPage === undefined ? "all" : pickerScope(requestedScope);
    const page = requestedPage === undefined ? legacyPage : Number(requestedPage);
    const settings = await getUserSettings(userId, env);
    const view = await modelPickerView(language, settings.selectedModel, env, Number.isFinite(page) ? page : 0, scope);
    await editMessage(env, { chatId, messageId, text: view.text, keyboard: view.keyboard });
    return;
  }
  if (data.startsWith("model:pick:")) {
    const [selectionToken, requestedScope = "all", requestedPage = "0"] = data.slice("model:pick:".length).split(":");
    const scope = pickerScope(requestedScope);
    const catalog = scopedCatalog(await getFreeModelCatalog(env), scope);
    // Numeric tokens are accepted only for pickers sent before v3.3.34. New buttons
    // use the stable ID-derived token so a catalog refresh cannot redirect a selection.
    const model = /^\d+$/.test(selectionToken)
      ? catalog[Number(selectionToken)]
      : catalog.find((entry) => modelPickToken(entry.id) === selectionToken);
    if (!model) {
      const settings = await getUserSettings(userId, env);
      const view = await modelPickerView(language, settings.selectedModel, env, 0, scope);
      const notice = language === "fa"
        ? "فهرست مدل‌ها تغییر کرده است. لطفاً مدل را دوباره انتخاب کنید."
        : language === "ar"
          ? "تغيّرت قائمة النماذج. يرجى اختيار النموذج مرة أخرى."
          : "The model list changed. Please choose the model again.";
      await editMessage(env, { chatId, messageId, text: `${notice}\n\n${view.text}`, keyboard: view.keyboard });
      return;
    }
    const settings = await getUserSettings(userId, env);
    await setSelectedModel(userId, model.id, env);
    const view = await modelPickerView(language, model.id, env, Number.isFinite(Number(requestedPage)) ? Number(requestedPage) : 0, scope);
    await editMessage(env, { chatId, messageId, text: modelSelectionText(model, language, settings.mode), keyboard: view.keyboard });
    return;
  }
  if (data === "model:auto" || data.startsWith("model:auto:")) {
    const scope = pickerScope(data.split(":")[2] || "all");
    await setSelectedModel(userId, null, env);
    const view = await modelPickerView(language, null, env, 0, scope);
    const confirmation = language === "fa" ? "✓ مسیر خودکار فعال شد." : language === "ar" ? "✓ تم تفعيل المسار التلقائي." : "✓ Auto route is active.";
    await editMessage(env, { chatId, messageId, text: `${confirmation}\n\n${view.text}`, keyboard: view.keyboard });
    return;
  }
  if (data === "model:refresh" || data.startsWith("model:refresh:")) {
    const scope = pickerScope(data.split(":")[2] || "all");
    try { await refreshFreeModelCatalog(env); } catch { /* The picker keeps the last safe catalog. */ }
    const settings = await getUserSettings(userId, env);
    const view = await modelPickerView(language, settings.selectedModel, env, 0, scope);
    await editMessage(env, { chatId, messageId, text: view.text, keyboard: view.keyboard });
    return;
  }
  if (data === "model:noop") return;
  if (data === "menu:settings" || data === "settings:open") {
    const settings = await getUserSettings(userId, env);
    const text = `<b>${language === "fa" ? "تنظیمات IVAI" : language === "ar" ? "إعدادات IVAI" : "IVAI settings"}</b>\n\n${language === "fa" ? "حالت پاسخ" : language === "ar" ? "وضع الرد" : "Response mode"}: <code>${escapeHtml(modeLabel(settings.mode, language))}</code>\n${language === "fa" ? "مسیر مدل" : language === "ar" ? "مسار النموذج" : "Model route"}: <code>${escapeHtml(modelRouteLabel(settings.selectedModel, language))}</code>\n${language === "fa" ? "حافظه" : language === "ar" ? "الذاكرة" : "Memory"}: <code>${settings.memoryEnabled ? "on" : "off"}</code>`;
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
    await resetUserAgentPreferences(userId, env);
    await Promise.all([
      startNewConversationSession(conversationKey({ chatId, userId, threadId: getThreadId(query.message) }), env),
      startNewConversationSession(terminalMemoryKey(userId), env)
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
  if (data.startsWith("mode:")) {
    const mode = data.slice(5);
    if (!USER_FACING_MODES.has(mode)) {
      await sendMessage(env, { chatId, text: responseText(language, "invalidMode") });
      return;
    }
    await setUserMode(userId, mode, env);
    const settings = await getUserSettings(userId, env);
    // A standalone confirmation remains visible even if the user has scrolled
    // past the Menu or Telegram folds an edited message into chat history.
    // Groups skip it: the edited Menu is confirmation enough and an extra
    // message per mode tap is exactly the clutter the group flow avoids.
    if (!isGroupChat(query.message)) {
      await sendMessage(env, {
        chatId,
        text: modeChangedText(mode, language),
        replyTo: messageId,
        ...messageSendContext(query.message)
      });
    }
    await editMessage(env, {
      chatId,
      messageId,
      text: menuText(language, settings),
      keyboard: mainKeyboard(language, query.message)
    });
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
    const settings = await getUserSettings(userId, env);
    await editMessage(env, { chatId, messageId, text: menuText(selected, { ...settings, language: selected }), keyboard: mainKeyboard(selected, query.message) });
    return;
  }
  if (data.startsWith("feedback:")) {
    const [, scoreText, token] = data.split(":");
    if (!(["up", "down"].includes(scoreText) && /^[A-Za-z0-9_-]{8,64}$/.test(token || ""))) return;
    const raw = await env.IVAI_KV?.get(`feedback:${token}`);
    let session;
    try { session = raw ? JSON.parse(raw) : null; } catch { session = null; }
    if (!session || String(session.userId) !== String(userId) || String(session.chatId) !== String(chatId)) return;
    await recordFeedback({ userId, chatId, messageId: session.responseMessageId, model: session.model, score: scoreText === "up" ? 1 : -1, kind: "message" }, env);
    await env.IVAI_KV?.delete(`feedback:${token}`);
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
  // Edited group messages are ignored entirely; channel posts in the linked
  // group go straight to the comment path regardless of media type.
  if (update.edited_message && isGroupChat(message)) return;
  if (isGroupChat(message) && isChannelPost(message)) return handleChannelPost(message, env);
  if (message.text) return processText(message, env);
  if (message.voice || message.photo?.length) return processMedia(message, env);
  if (isGroupChat(message)) return;
  const language = (await getUserSettings(message.from?.id, env)).language || "en";
  const membership = await isRequiredChannelMember(message.from?.id, env);
  if (!membership.allowed) {
    await sendMembershipRequired(message, language, membership, env);
    return;
  }
  await upsertUser({ user: message.from, chat: message.chat, language }, env);
  if (message.chat?.id) await sendMessage(env, { chatId: message.chat.id, text: responseText(language, "unsupportedMedia"), replyTo: message.message_id });
}

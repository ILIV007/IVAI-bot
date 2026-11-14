import { APP, BYOK_PRESETS, byokPreset, byokPresetIds, GROUP_POLICY, MODES, SUPPORTED_LANGUAGE_CODES, USER_FACING_MODES } from "./config.js";
import { generateReply, runCustomApi } from "./ai.js";
import { responseProfile } from "./response-profile.js";
import { getFreeModelCatalog, refreshFreeModelCatalog, renderModelList, selectCatalogModel } from "./catalog.js";
import { analyzePhoto, transcribeVoice } from "./media.js";
import { cancelBroadcast } from "./broadcast.js";
import { allowUsage, canBroadcast, canManage, getRole, parseAdminIds, safeError } from "./security.js";
import { getRequiredChannelMembership } from "./membership.js";
import {
  conversationKey,
  createSecretaryTask,
  createBroadcastDraft,
  deleteUserApiConfig,
  ensureConversationSession,
  getActiveUserApiConfigId,
  getConversationSession,
  getAdminOperationalStats,
  getUserApiConfig,
  getUserApiConfigMeta,
  addCustomByokModel,
  getUserDebugStats,
  getUserSettings,
  getReengagementPreference,
  listSecretaryTasks,
  listUserApiConfigs,
  markBroadcastConfirmed,
  markUserApiConfigInvalid,
  recordFeedback,
  renameUserApiConfig,
  resetUserAgentPreferences,
  resetUserApiAuthFailures,
  saveConversationSession,
  saveUserApiConfig,
  setActiveUserApiConfig,
  startNewConversationSession,
  setMemoryEnabled,
  setReengagementPreference,
  setSelectedModel,
  setUserApiConfigEnabled,
  setUserLanguage,
  setUserMode,
  updateSecretaryTaskStatus,
  updateUserApiConfigModel,
  upsertUser,
  writeAdminAudit
} from "./storage.js";
import { adminKeyboard, answerCallback, byokCancelKeyboard, byokListKeyboard, byokManageKeyboard, byokModelKeyboard, byokPresetKeyboard, byokRemoveConfirmKeyboard, byokTestFailedKeyboard, deleteMessage, editMessage, editRichMessage, ensureTerminalMenuButton, escapeHtml, languageKeyboard, languageMenuText, menuText, modelPickerKeyboard, modelPickerText, modelPickToken, modelRouteLabel, modelSelectionText, modeKeyboard, modeLabel, pickWelcomeSticker, requiredMembershipKeyboard, requiredMembershipText, responseMeta, richLineBreaks, sendMessage, sendRichMessage, sendRichMessageDraft, sendSticker, sendTyping, settingsKeyboard, splitText, startKeyboard, startThinkingAnimation, startTypingRefresher, telegram, terminalKeyboard, thinkingText, welcomeText } from "./telegram.js";
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
  return language === "fa" ? "<b>✓ عضویت تأیید شد!</b>\nحالا می‌توانید از IVAI استفاده کنید. برای شروع، هر سؤالی بفرستید." : language === "ar" ? "<b>✓ تم تأكيد العضوية!</b>\n\nيمكنك الآن استخدام IVAI. أرسل أي سؤال للبدء." : "<b>✓ You're in!</b>\nMembership confirmed — IVAI is ready when you are. Send any question to start.";
}

function membershipCheckAlertText(language, { checkFailed = false } = {}) {
  if (language === "fa") return checkFailed ? "تلگرام فعلاً نتوانست بررسی کند — بات باید ادمین کانال @ILIVIR3 باشد." : "هنوز عضو کانال نشده‌اید.";
  if (language === "ar") return checkFailed ? "تعذّر على Telegram التحقق الآن — يجب أن يكون البوت مشرفًا في @ILIVIR3." : "لم تنضم إلى القناة بعد.";
  return checkFailed ? "Telegram couldn't check that just now — the bot needs to be an admin of @ILIVIR3." : "You haven't joined the channel yet.";
}

async function isRequiredChannelMember(userId, env) {
  // Owners are exempt from the membership gate at every call site that uses
  // this wrapper (text, media, callbacks, inline, guest, fallback): a
  // membership-check outage must never lock the owner out of their own bot.
  if (userId && parseAdminIds(env).has(String(userId))) return { allowed: true, reason: "OWNER" };
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
      html: richLineBreaks(text),
      keyboard,
      replyTo: message.message_id,
      rtl: ["fa", "ar"].includes(language),
      ...context
    });
  } catch {
    await sendMessage(env, { chatId: message.chat.id, text, keyboard, replyTo: message.message_id, ...context });
  }
}

// Fresh Rich sends with a plain fallback (v3.11.0). Private chats try the
// Rich Message first; groups and any Rich failure keep the plain path.
// The copy is identical either way — only the rendering changes. plainText
// overrides the fallback body when the Rich HTML is not valid plain HTML
// (e.g. tables).
async function sendRichScreen(env, { chatId, html, keyboard, language = "en", plainText = null, replyTo, context = {}, rich = true }) {
  if (rich) {
    try {
      await sendRichMessage(env, { chatId, html: richLineBreaks(html), keyboard, replyTo, rtl: ["fa", "ar"].includes(language), ...context });
      return;
    } catch { /* Fall through to the plain message. */ }
  }
  await sendMessage(env, { chatId, text: plainText ?? html, keyboard, replyTo, ...context });
}

// Private entry-point messages (start/menu/help and similar) carry their
// keyboard inside a Rich Message instead of as buttons under a plain message.
// Groups and any Rich failure keep the plain sendMessage path.
async function sendEntryMessage(env, message, { html, keyboard, language = "en" }) {
  return sendRichScreen(env, {
    chatId: message.chat.id,
    html,
    keyboard,
    language,
    replyTo: message.message_id,
    context: messageSendContext(message),
    rich: message.chat?.type === "private"
  });
}

// Callback-edited screens go Rich the same way (v3.11.0): a Rich edit is an
// editMessageText with rich_message instead of text. Private chats try Rich
// first; groups and any Rich failure fall back to the plain edit.
async function editRichScreen(env, message, { html, keyboard, language = "en" }) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (message?.chat?.type === "private") {
    try {
      await editRichMessage(env, { chatId, messageId, html: richLineBreaks(html), keyboard, rtl: ["fa", "ar"].includes(language), businessConnectionId: message?.business_connection_id });
      return;
    } catch { /* Fall through to the plain edit. */ }
  }
  await editMessage(env, { chatId, messageId, text: html, keyboard, businessConnectionId: message?.business_connection_id });
}

// S1 (v3.11.0): the menu names the engine answering. The active BYOK config
// (valid + enabled) wins; anything else reads as IVAI models. Fail-soft: a
// storage failure never blocks the menu.
async function menuEngineLabel(language, userId, env) {
  const fallback = language === "fa" ? "مدل‌های IVAI" : language === "ar" ? "نماذج IVAI" : "IVAI models";
  try {
    const meta = await getUserApiConfigMeta(userId, env);
    if (!meta || !meta.enabled || meta.status !== "valid" || !meta.model) return fallback;
    return `🔑 ${meta.name} · ${meta.model}`;
  } catch {
    return fallback;
  }
}

async function menuTextForUser(language, settings, userId, env) {
  return menuText(language, { ...settings, engine: await menuEngineLabel(language, userId, env) });
}

// S2 (v3.11.0): when the limiter can say when the window resets, the busy
// message says so instead of a bare "try again" — only an approximate window,
// never the quota numbers.
function busyText(language, resetInSeconds) {
  const seconds = Number(resetInSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return responseText(language, "busy");
  if (seconds < 3600) {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return language === "fa"
      ? `این مسیر رایگان فعلاً شلوغ است — حدود ${minutes} دقیقهٔ دیگر دوباره تلاش کنید.`
      : `This free route is busy at the moment — please try again in ~${minutes} minutes.`;
  }
  const hours = Math.max(1, Math.ceil(seconds / 3600));
  return language === "fa"
    ? `این مسیر رایگان فعلاً شلوغ است — حدود ${hours} ساعت دیگر دوباره تلاش کنید.`
    : `This free route is busy at the moment — please try again in ~${hours} hours.`;
}

async function answerInlineMembershipRequired(query, language, env) {
  await telegram(env, "answerInlineQuery", {
    inline_query_id: query.id,
    cache_time: 0,
    is_personal: true,
    results: [{
      type: "article",
      id: "ivai-channel-required",
      title: language === "fa" ? "برای استفاده از IVAI عضو @ILIVIR3 شوید" : "Join @ILIVIR3 to use IVAI",
      description: language === "fa" ? "IVAI برای اعضای کانال رایگان است." : "IVAI is free for channel members.",
      input_message_content: { message_text: requiredMembershipText(language), parse_mode: "HTML" },
      reply_markup: requiredMembershipKeyboard(language)
    }]
  });
}

// Rich Message posts (Bot API 10.1) carry no text/caption: their content
// lives in message.rich_message.blocks as RichText trees. Flattening those
// blocks to plain text lets rich posts flow through the same paths as
// ordinary posts (channel-post comments, language detection, reply-chain
// context). The walk is defensive — the payload shape is outside our
// control, so malformed nodes (wrong types, missing fields, absurd
// nesting) degrade to "" instead of throwing.
export function richTextToPlain(node, depth = 0) {
  if (typeof node === "string") return node;
  if (depth > 32) return "";
  if (Array.isArray(node)) return node.map((child) => richTextToPlain(child, depth + 1)).join("");
  if (node && typeof node === "object") return richTextToPlain(node.text, depth + 1);
  return "";
}

export function richBlockToPlain(block, depth = 0) {
  if (typeof block === "string") return block;
  if (!block || typeof block !== "object" || Array.isArray(block) || depth > 32) return "";
  const next = depth + 1;
  const parts = [];
  // A block's own text comes first, then its title and caption (a caption is
  // an object with a text field, or a RichText itself — richTextToPlain
  // handles both).
  for (const field of ["text", "title", "caption"]) {
    const value = richTextToPlain(block[field], next);
    if (value) parts.push(value);
  }
  if (Array.isArray(block.items)) {
    for (const item of block.items) {
      const value = richBlockToPlain(item, next);
      if (value) parts.push(value);
    }
  }
  if (Array.isArray(block.rows)) {
    for (const row of block.rows) {
      const cells = Array.isArray(row) ? row : (Array.isArray(row?.cells) ? row.cells : []);
      const line = cells.map((cell) => richTextToPlain(cell, next)).filter(Boolean).join(" | ");
      if (line) parts.push(line);
    }
  }
  for (const field of ["blocks", "media"]) {
    if (Array.isArray(block[field])) {
      for (const child of block[field]) {
        const value = richBlockToPlain(child, next);
        if (value) parts.push(value);
      }
    }
  }
  return parts.join("\n");
}

export function messagePlainText(message) {
  const direct = String(message?.text || message?.caption || "");
  if (direct.trim()) return direct;
  const blocks = message?.rich_message?.blocks;
  if (!Array.isArray(blocks)) return "";
  try {
    return blocks.map((block) => richBlockToPlain(block)).filter(Boolean).join("\n").trim();
  } catch {
    return "";
  }
}

function scriptLanguageFromMessage(message) {
  const text = messagePlainText(message);
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
// Channel-post comments (v3.6.3) are the one exception to that pin: they run
// Fast on Qwen3 30B, whose multilingual quality (Persian included) is far
// stronger than GLM Flash's — the GLM pin produced word-salad comments on
// nuanced posts. Comments are capped at 10/hour in the linked group, so the
// heavier free model stays affordable; group reply/mention turns keep
// GROUP_MODEL, and the budget reserve is unaffected (it is a flat per-call
// amount keyed to the Fast profile, not to the model).
const CHANNEL_COMMENT_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
// Comments get their own output budget (v3.7.1): Qwen3 30B is a reasoning
// model whose internal reasoning shares the profile budget, and on some
// generations it ate so much of the Fast profile's 900 tokens that the
// comment itself was cut off mid-sentence. 1600 leaves room for both.
const CHANNEL_COMMENT_MAX_TOKENS = 1600;
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
  if (trigger === "channel_post") return "primary";
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
  const content = messagePlainText(target).trim().slice(0, 600);
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

// FNV-1a over the chat + message ids: stable per post, so every per-post
// verdict below is deterministic — no stored state, no randomness.
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// Channel-post comment sampling (v3.5.1): not every post earns a comment.
// The verdict hashes the chat + message ids (FNV-1a), so it is stable per
// post — no stored state, no randomness — and keeps roughly
// GROUP_POLICY.channelPostReplyRate of eligible posts.
export function channelPostSampled(message) {
  return fnv1a(`chanpost:${message?.chat?.id}:${message?.message_id}`) % 100 < Math.round(GROUP_POLICY.channelPostReplyRate * 100);
}

// Comment mode assignment (v3.7.6): since v3.7.2 the prompt let the model
// pick FUN or ANALYSIS per post, and live it picked ANALYSIS far too often —
// the balance the two modes exist for was lost. The mode is now assigned
// here, deterministically: a per-post hash draw weighted to
// GROUP_POLICY.channelCommentFunShare, tempered by a per-chat streak cap —
// once a run of one mode reaches its cap (drawn per run from the policy
// range, 2–3), the next comment is forced to the other mode. The draws use
// salts distinct from the sampling hash, so mode and sampling are
// independent verdicts on the same post.
const COMMENT_MODE_FUN = "fun";
const COMMENT_MODE_ANALYSIS = "analysis";

function commentModeCapDraw(message) {
  const span = GROUP_POLICY.channelCommentStreakCapMax - GROUP_POLICY.channelCommentStreakCapMin + 1;
  return GROUP_POLICY.channelCommentStreakCapMin + (fnv1a(`chanmodecap:${message?.chat?.id}:${message?.message_id}`) % span);
}

// Pure assignment: takes the validated streak state (or null) and returns
// the state to persist once this comment is actually sent — its `mode` is
// the mode assigned to this comment.
export function assignChannelCommentMode(state, message) {
  if (state && state.run >= state.cap) {
    const mode = state.mode === COMMENT_MODE_FUN ? COMMENT_MODE_ANALYSIS : COMMENT_MODE_FUN;
    return { mode, run: 1, cap: commentModeCapDraw(message) };
  }
  const mode = fnv1a(`chanmode:${message?.chat?.id}:${message?.message_id}`) % 100 < Math.round(GROUP_POLICY.channelCommentFunShare * 100)
    ? COMMENT_MODE_FUN
    : COMMENT_MODE_ANALYSIS;
  if (state && mode === state.mode) return { mode, run: state.run + 1, cap: state.cap };
  return { mode, run: 1, cap: commentModeCapDraw(message) };
}

function validCommentModeState(value) {
  if (!value || (value.mode !== COMMENT_MODE_FUN && value.mode !== COMMENT_MODE_ANALYSIS)) return null;
  if (!Number.isInteger(value.run) || value.run < 1) return null;
  if (!Number.isInteger(value.cap) || value.cap < GROUP_POLICY.channelCommentStreakCapMin || value.cap > GROUP_POLICY.channelCommentStreakCapMax) return null;
  return { mode: value.mode, run: value.run, cap: value.cap };
}

// The streak state is one small KV key per chat. Every access is fail-soft:
// a KV failure degrades to no-state behavior and can never break commenting.
async function loadChannelCommentMode(message, env) {
  try {
    const raw = await env.IVAI_KV?.get(`comment_mode:${message?.chat?.id}`);
    return raw ? validCommentModeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

async function saveChannelCommentMode(message, state, env) {
  try {
    await env.IVAI_KV?.put(`comment_mode:${message?.chat?.id}`, JSON.stringify(state));
  } catch { /* Best-effort: losing the streak only re-rolls the balance. */ }
}

function logChannelCommentSkip(message, reason) {
  console.info(JSON.stringify({ event: "channel_comment_skip", reason, chatId: String(message?.chat?.id || "") }));
}

// Completeness guard for channel-post comments (v3.7.1): a segment counts as
// complete when it ends at terminal punctuation or at an emoji cluster (ZWJ
// chains, skin tones, and variation selectors included). Even with reasoning
// disabled and a larger budget, a generation can still stop mid-sentence, so
// a comment whose tail is an unfinished fragment is cut back to the end of
// its last complete segment — and when nothing complete remains, or the only
// complete segment is a lone bare question (a question alone is not a take),
// the post gets no comment at all instead of a broken one.
const COMMENT_SEGMENT_END = /[.!?؟…:]+(?=\s|$)|(?:\p{Extended_Pictographic}(?:[\u{1F3FB}-\u{1F3FF}]|\uFE0F|\u200D\p{Extended_Pictographic})*)(?=\s|$)/gu;

export function completeChannelComment(comment) {
  const text = String(comment || "").trim();
  if (!text) return "";
  let lastEnd = 0;
  let segments = 0;
  for (const match of text.matchAll(COMMENT_SEGMENT_END)) {
    lastEnd = match.index + match[0].length;
    segments += 1;
  }
  if (!lastEnd) return "";
  const kept = text.slice(0, lastEnd);
  if (segments === 1 && /[?؟]$/.test(kept)) return "";
  return kept;
}

async function handleChannelPost(message, env) {
  // A channel post's text is its text or, for a media post, its caption —
  // the caption IS the post text, whatever media it carries (v3.5.4). A post
  // sent as a Rich Message carries neither: its blocks are flattened to
  // plain text instead (v3.7.3), and a rich post whose blocks carry no text
  // counts as media-only, exactly like a photo without a caption.
  const postText = messagePlainText(message).trim();
  // Eligibility and sampling run BEFORE the channel-post limit bucket: a
  // skipped post performs no work, so it must not burn quota (v3.5.1).
  if (!postText) {
    // A media-only post (photo, video, sticker, GIF, file, audio...) with no
    // text/caption — or no text in its rich blocks — never earns a comment.
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
    // The reply is ONE comment in the post's own language. The prompt is a
    // fresh start (v3.7.0): a short persona plus worked examples and a few
    // hard rules, replacing the accreted rule list of v3.4.1–v3.6.4 —
    // and the comment carries no model/mode footer in the group.
    // v3.7.2: the comment runs in ONE of two modes — FUN (the v3.7.0
    // comedy behavior, examples unchanged) or ANALYSIS (the very smart
    // friend: what is genuinely good here AND what else matters) —
    // taught by grouping the worked examples by mode.
    // v3.7.6: the mode is no longer the model's choice — live, its
    // self-selection skewed heavily to ANALYSIS and the balance was lost.
    // assignChannelCommentMode assigns it in code (60% FUN / 40% ANALYSIS
    // with a random 2–3 streak cap) and the prompt states the assignment.
    // v3.7.1: the prompt opens with Qwen3's "/no_think" soft switch — the
    // documented way to disable this hybrid model's reasoning — so reasoning
    // cannot eat the comment's token budget; the switch is a control token
    // in the instruction, not content, and is never echoed into the comment.
    const language = scriptLanguageFromMessage(message) || "en";
    const modeAssignment = assignChannelCommentMode(await loadChannelCommentMode(message, env), message);
    const modeLine = modeAssignment.mode === COMMENT_MODE_FUN
      ? "This comment's mode is FUN: a witty, alive reaction like the examples below. Never mix the two modes in one comment."
      : "This comment's mode is ANALYSIS: you are the very smart friend — say what is genuinely good or interesting here AND what else matters: the catch, the trade-off, the limit. Balanced and concrete; not a roast, not a verdict. Never mix the two modes in one comment.";
    const result = await generateReply({
      text: `/no_think
A post from the IVAI channel was just shared in its discussion group. Write ONE comment on it, in the SAME language as the post, and output only the comment itself.

You are a sharp, witty regular of this group with real taste: you read the post like a person, spot the one moment everyone will talk about — the embarrassing, funny, revealing, or absurd beat — and say what a smart friend would say. You never sound like a news summary or an analyst report.

${modeLine}

FUN examples:
Post: مایکروسافت به بعضی کاربرای کم‌مصرف ایکس‌باکس ایمیل داده و پیشنهاد داده کنسولشون رو از طریق Best Buy تا سقف ۳۷۵ دلار بفروشن؛ مبلغ نهایی به شرایط کنسول بستگی داره. → Comment: ایمیل از مایکروسافت یعنی انباره‌شون داره پر می‌شه 😄 ۳۷۵ دلار برای یه ایکس‌باکس که سال‌ها توی کمد خاک خورده — بدترین زمان برای فروش، بهترین زمان برای خرید.
Post: مادسازها حافظه RTX 5090 رو به ۹۶ گیگابایت رسوندن؛ ۳۲ تراشه GDDR7 حدود ۳۲۰۰ دلار درمیاد، در حالی که کارت رسمی انویدیا با همون ۹۶ گیگ حافظه (RTX PRO 6000) حدود ۱۶ هزار دلاره و VBIOS کارت با امضای دیجیتال قفل شده بود. → Comment: ۳۲ تا تراشه، ۳۲۰۰ دلار — و یهو کارتت می‌شه همون کارت ۱۶ هزار دلاری انویدیا. حالا معلومه چرا VBIOS رو با امضای دیجیتال قفل کرده بودن 😄
Post: Researchers built StreamVibe, a video agent that should offer help only at the right moment while you cook or assemble things; benchmarks show today's models still mistime interventions badly in long videos. → Comment: The hard part was never answering — it's knowing you've just put the pot on and what comes next. Most video assistants today would butt in every five seconds with something useless.

ANALYSIS examples:
Post: توسعه‌دهنده‌ی NTDEV ویندوز ۱۱ نسخه 26H2 رو با فقط ۱۲۸ مگابایت رم بوت کرده، در حالی که نیاز رسمی مایکروسافت ۴ گیگابایته؛ ISO حدود ۷۰۰ مگابایته و برنامه‌های پایه مثل Notepad و Paint کار می‌کنن، ولی Windows Update حذف شده و Task Manager با نسخه‌ی قدیمی جایگزین شده. → Comment: نکته‌ی اصلی خود ۱۲۸ مگ نیست؛ اینه که برای رسیدن بهش چی حذف شده: آپدیت نیست، Task Manager قدیمیه، کلی سرویس خوابیده. یعنی اون «حداقل ۴ گیگ» بیشتر وزن سرویس‌های مایکروسافته تا خود ویندوز — ولی Pico11 هم فعلاً بیشتر یه نمایشه تا سیستمی برای استفاده‌ی روزمره.
Post: Nota یه دستیار مطالعه‌ی محلیه که مقاله و PDF رو با مدل‌های Ollama کاملاً آفلاین می‌خونه؛ لازم نیست بین PDFخوان و مترجم و چت‌بات جابه‌جا شی، یادداشت و هایلایت کنار خود متن می‌مونه و همه‌ی داده‌ها توی مرورگر خودت ذخیره می‌شه. → Comment: قوی‌ترین بخشش همون محلی بودنه: PDFهات از دستگاهت بیرون نمی‌رن و برای مطالعه‌ی فارسی هم طراحی شده. سمت دیگه‌ش هم مهمه: کیفیت جواب یه مدل محلی کوچیک با مدل‌های ابری یکی نیست، و ذخیره‌سازی مرورگر برای یه آرشیو بزرگ مقاله‌ها زود سقف می‌خوره.

Hard rules:
- Same language as the post; one comment, typically 1–3 short lines.
- Always land something real: in FUN mode a take — a prediction, or one line of cause-and-effect; in ANALYSIS mode a balanced point — what is genuinely good here and what else matters. Never end on a bare question, "how interesting!", or empty amazement.
- One mode per comment — do not blend a joke into an analysis.
- No summaries, no report-speak ("this shows that…"), no generic lines that could fit any post.
- First person is opinions only — never invent memories, possessions, or things you did.
- A comparison only when it maps exactly and exposes the point; most comments need none.

Post:
${postText}`,
      selectedMode: MODES.FAST,
      selectedModel: CHANNEL_COMMENT_MODEL,
      maxTokens: CHANNEL_COMMENT_MAX_TOKENS,
      language,
      context: []
    }, env);
    // Models ignore length instructions, so the 5-line cap is enforced here too.
    const generated = String(result.text || "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 5).join("\n");
    // Completeness guard (v3.7.1): never send a comment that stops
    // mid-sentence — trim it to its last complete segment, or skip the post.
    const comment = completeChannelComment(generated);
    if (!comment) {
      if (generated) logChannelCommentSkip(message, "incomplete_comment");
      return;
    }
    await sendMessage(env, {
      chatId: message.chat.id,
      text: renderStandardAiText(comment),
      replyTo: message.message_id,
      ...messageSendContext(message)
    });
    // The comment actually went out, so the mode streak advances (v3.7.6):
    // skipped, incomplete, and failed comments never touch the state.
    await saveChannelCommentMode(message, modeAssignment, env);
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
      result: { type: "article", id: "ivai-channel-required", title: language === "fa" ? "برای استفاده از IVAI عضو @ILIVIR3 شوید" : "Join @ILIVIR3 to use IVAI", description: language === "fa" ? "IVAI برای اعضای کانال رایگان است." : "IVAI is free for channel members.", input_message_content: { message_text: requiredMembershipText(language), parse_mode: "HTML" }, reply_markup: requiredMembershipKeyboard(language) }
    });
    return;
  }
  const usage = await allowUsage({ scope: "guest", id: userId, limit: APP.userHourlyTextLimit }, env);
  let text;
  try {
    if (!usage.allowed) throw new Error("RATE_LIMIT");
    const result = await generateReply({ text: prompt, selectedMode: MODES.GUEST, language, context: [] }, env);
    text = `${renderStandardAiText(result.text)}\n\n${responseMeta({ model: result.model, mode: MODES.GUEST, language, rtl: ["fa", "ar"].includes(language) })}`;
  } catch (error) {
    text = safeError(error) === "RATE_LIMIT" ? busyText(language, usage.resetInSeconds) : responseText(language, "temporary");
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
    noAccess: fa ? "<b>فقط ادمین.</b> این کار به حساب ادمین نیاز دارد." : "<b>Admin only.</b> This action needs an admin account.",
    invalidMode: fa ? "چنین حالتی نیست. یکی را از منو انتخاب کنید." : "That mode isn't available. Pick one from the menu.",
    saved: fa ? "✓ ذخیره شد." : "✓ Saved.",
    busy: fa ? "این مسیر رایگان فعلاً شلوغ است — کمی بعد دوباره تلاش کنید." : "This free route is busy at the moment — please try again in a bit.",
    temporary: fa ? "از سمت ما مشکلی پیش آمد. لطفاً دوباره تلاش کنید." : "Something went wrong on our side. Please try again.",
    draftCreated: fa ? "✓ پیش‌نویس broadcast ساخته شد. هنوز چیزی ارسال نشده — اول بررسی کنید." : "✓ Broadcast draft created. Nothing is sent yet — review it first.",
    confirmed: fa ? "✓ broadcast تأیید شد. در صف ارسال امن قرار گرفت." : "✓ Broadcast confirmed. It's queued for safe delivery.",
    cancelled: fa ? "✓ broadcast لغو شد. چیزی ارسال نشد." : "✓ Broadcast cancelled. Nothing was sent.",
    feedbackSaved: fa ? "✓ ممنون — بازخورد شما ثبت شد." : "✓ Thanks — your feedback is saved.",
    unsupportedMedia: fa ? "این نوع پیام را هنوز نمی‌توانم پردازش کنم. لطفاً متن، عکس یا voice بفرستید." : "I can't handle that kind of message yet. Please send text, a photo, or a voice message.",
    retry: fa ? "پیام اصلی را دوباره بفرستید تا پاسخ تازه‌ای بسازم." : "Send the original prompt again and I'll generate a fresh reply.",
    refreshFailed: fa ? "فهرست مدل‌ها فعلاً به‌روز نشد — فهرست فعلی شما هنوز درست است." : "The model list couldn't be refreshed right now — your current list is still good.",
    byokFallback: fa ? "⚠️ API شما جواب نداد، پس با مدل‌های IVAI جواب دادم." : "⚠️ Your API didn't answer, so I replied with IVAI models instead.",
    byokFailure: fa ? "⚠️ API شما هم جواب نداد." : "⚠️ Your API didn't answer either."
  };
  return values[key] || values.temporary;
}

// --- BYOK ("My API", v3.8.0) -------------------------------------------------
// Private chats only: the user's own OpenAI-compatible provider. Group turns
// never load or decrypt the config, and Guard mode never uses it (see ai.js).
// Copy is English first; Persian only when the stored UI language is fa.
const BYOK_PENDING_TTL_SECONDS = 10 * 60;
const byokPendingKey = (userId) => `byok:pending:${userId}`;

function byokTrustLine(language) {
  return language === "fa"
    ? "🔒 کلید API شما رمزگذاری‌شده (AES-256-GCM) ذخیره می‌شود و دیگر نمایش داده نمی‌شود."
    : "🔒 Your API key is stored encrypted (AES-256-GCM) and never shown again.";
}

function byokPresetLabel(presetId) {
  return byokPreset(presetId)?.label || presetId || "Custom endpoint";
}

function byokPresetText(language, preset) {
  if (language === "fa") return `<b>🔑 ${escapeHtml(preset.label)}</b>\n\nکلید API خود را بفرستید. پیام شما را بلافاصله پس از ذخیره حذف می‌کنم تا در چت نماند.\n\n${byokTrustLine(language)}`;
  return `<b>🔑 ${escapeHtml(preset.label)}</b>\n\nSend your API key. I'll delete your message right after saving it, so it never stays in the chat.\n\n${byokTrustLine(language)}`;
}

function byokEndpointText(language) {
  if (language === "fa") return `<b>🔧 نقطهٔ پایانی سفارشی</b>\n\nآدرس پایهٔ API سازگار با OpenAI را بفرستید — مثلاً:\n<code>https://api.example.com/v1</code>\n\nباید با <code>https://</code> شروع شود.`;
  return `<b>🔧 Custom endpoint</b>\n\nSend the base URL of your OpenAI-compatible API — for example:\n<code>https://api.example.com/v1</code>\n\nIt must start with <code>https://</code>.`;
}

function byokKeyFormatText(language, preset) {
  if (language === "fa") return `این کلید شبیه کلید ${escapeHtml(preset.label)} نیست. لطفاً دوباره بفرستید — یا برای توقف <code>/cancel</code> را بزنید.`;
  return `That key doesn't look like a ${escapeHtml(preset.label)} key. Please send it again — or <code>/cancel</code> to stop.`;
}

function byokKeySavedText(language, preset) {
  if (language === "fa") return `<b>✓ کلید ${escapeHtml(preset.label)} ذخیره شد</b>\n\n${byokTrustLine(language)}\n\nمدل را انتخاب کنید و آماده‌اید — نیازی به تست نیست.`;
  return `<b>✓ ${escapeHtml(preset.label)} key saved</b>\n\n${byokTrustLine(language)}\n\nPick a model and you're ready — no test needed.`;
}

function byokAskModelText(language) {
  if (language === "fa") return `<b>✏️ مدل</b>\n\nشناسهٔ مدل را بفرستید — مثلاً:\n<code>openai/gpt-oss-120b</code>`;
  return `<b>✏️ Model</b>\n\nSend the model ID to use — for example:\n<code>openai/gpt-oss-120b</code>`;
}

function byokCancelledText(language) {
  return language === "fa" ? "✓ لغو شد — چیزی ذخیره نشد." : "✓ Cancelled — nothing was saved.";
}

function byokActivatedText(language, preset, model) {
  if (language === "fa") return `<b>✅ API من فعال شد</b>\n\n● <b>${escapeHtml(preset.label)}</b> · <code>${escapeHtml(model)}</code>\n\nاز این به بعد در چت خصوصی با API شما جواب می‌دهم. اگر جواب نداد، خودکار با مدل‌های IVAI ادامه می‌دهم.`;
  return `<b>✅ My API is active</b>\n\n● <b>${escapeHtml(preset.label)}</b> · <code>${escapeHtml(model)}</code>\n\nFrom now on, private chats answer through your API. If it doesn't respond, I automatically fall back to IVAI models.`;
}

function byokReadyText(language) {
  return language === "fa" ? "آماده! 🚀" : "Ready! 🚀";
}

// Activation confirmation (owner feedback 2026-11-14): one short message
// with a green tick, so the result is obvious in the first second. The
// manage screen is NOT concatenated here anymore — it repeated the config
// line and the ready line and turned the confirmation into a wall of text.
// The manage keyboard stays attached, so Test / Change model / Rename /
// Remove remain one tap away; the full manage screen still opens from the
// main menu. The "Ready!" line is NOT a separate message anymore (owner
// feedback 2026-11-14, v3.11.4): it is the first line of the persistent
// indicator below, so activation ends with exactly two messages.
async function sendByokActivated(env, { chatId, messageId, userId, language, preset, model, name, keyboard }) {
  const text = byokActivatedText(language, preset, model);
  if (messageId) await editMessage(env, { chatId, messageId, text, keyboard });
  else await sendMessage(env, { chatId, text, keyboard });
  // Phase 2: the persistent indicator follows the activation confirmation
  // and carries the "Ready!" line itself.
  await refreshByokIndicator(env, { userId, chatId, language, name: name || "My API", model });
}

// Phase 2 (v3.11.2): the persistent BYOK indicator — a plain notification
// message, sent on activation, that stays in the chat. On a config/model
// change the old one is deleted and a fresh one is sent; it is deleted only
// when the user taps Stop. No pin, no self-heal, no in-place edit (owner
// rule). Its message_id lives in KV under byok:indicator:<userId> with no
// TTL, for as long as BYOK is active.
const byokIndicatorKey = (userId) => `byok:indicator:${userId}`;

// Phase 2 (v3.11.2) + v3.11.4 merge: the indicator carries the "Ready!"
// line as its first line, so activation is two messages, not three — the
// confirmation, then this one message that stays in the chat. Re-sends on a
// config/model change and the rename refresh carry the same combined text.
function byokIndicatorText(language, name, model) {
  return `${byokReadyText(language)}\n🔑 Using your API — ${escapeHtml(name)} · ${escapeHtml(model)}`;
}

function byokIndicatorKeyboard() {
  return { inline_keyboard: [[{ text: "⏹ Stop BYOK", callback_data: "byok:stop" }]] };
}

// Deletes the old indicator (best effort) and sends a fresh one, storing
// its message_id. Fail-soft: a send/delete failure never breaks activation.
async function refreshByokIndicator(env, { userId, chatId, language, name, model }) {
  if (!userId || !chatId) return;
  const key = byokIndicatorKey(userId);
  try {
    const old = await env.IVAI_KV?.get(key).catch(() => null);
    if (old) await deleteMessage(env, { chatId, messageId: Number(old) }).catch(() => {});
    const text = byokIndicatorText(language, name, model);
    const keyboard = byokIndicatorKeyboard();
    let sent = null;
    try {
      // Rich HTML collapses raw newlines (v3.11.1 lesson): convert them
      // for the Rich send only; the plain fallback keeps the raw text.
      sent = await sendRichMessage(env, { chatId, html: richLineBreaks(text), keyboard });
    } catch {
      sent = await sendMessage(env, { chatId, text, keyboard }).catch(() => null);
    }
    if (sent?.message_id) await env.IVAI_KV?.put(key, String(sent.message_id)).catch(() => {});
  } catch { /* Best-effort. */ }
}

// Deletes the stored indicator message (best effort) and its KV key.
async function clearByokIndicator(env, { userId, chatId }) {
  if (!userId || !chatId) return;
  const key = byokIndicatorKey(userId);
  try {
    const old = await env.IVAI_KV?.get(key).catch(() => null);
    if (old) await deleteMessage(env, { chatId, messageId: Number(old) }).catch(() => {});
  } catch { /* Best-effort. */ }
  await env.IVAI_KV?.delete(key).catch(() => {});
}

function byokTestFailedText(language, error) {
  const detail = String(error || "").replace(/^Custom API failed: /, "");
  if (language === "fa") return `<b>✕ اتصال برقرار نشد</b>\n\nپاسخ سرویس: <code>${escapeHtml(detail)}</code>\n\nکلید یا نقطهٔ پایانی را بررسی کنید و دوباره آزمایش کنید.`;
  return `<b>✕ Connection failed</b>\n\nThe provider said: <code>${escapeHtml(detail)}</code>\n\nCheck your key or endpoint and try the test again.`;
}

function byokRemoveText(language, meta) {
  if (language === "fa") return `<b>🗑 حذف «${escapeHtml(meta?.name || "")}»؟</b>\n\n<b>${escapeHtml(byokPresetLabel(meta?.preset))}</b> · <code>${escapeHtml(meta?.model || "")}</code>\n\nکلید ذخیره‌شده پاک می‌شود و چت خصوصی دوباره با مدل‌های IVAI جواب می‌دهد.`;
  return `<b>🗑 Remove “${escapeHtml(meta?.name || "")}”?</b>\n\n<b>${escapeHtml(byokPresetLabel(meta?.preset))}</b> · <code>${escapeHtml(meta?.model || "")}</code>\n\nThe saved key will be deleted and private chats will answer with IVAI models again.`;
}

// The settings screen is about the IVAI side only since v3.9.0: My API lives
// in the main menu, and the ● Active marker lives on the My API list screen,
// so there is exactly one place that shows which engine is active.
async function settingsView(language, settings, env, userId) {
  const fa = language === "fa";
  const memory = settings.memoryEnabled ? (fa ? "روشن" : "on") : (fa ? "خاموش" : "off");
  const text = fa
    ? `<b>⚙️ تنظیمات IVAI</b>\nحالت پاسخ: <code>${escapeHtml(modeLabel(settings.mode, language))}</code>\nحافظه: <code>${memory}</code>\n\n<b>مدل‌های IVAI</b>\n${escapeHtml(modelRouteLabel(settings.selectedModel, language))}\n\nAPIهای خودتان در منوی اصلی، زیر <b>🔑 API من</b> هستند.`
    : `<b>⚙️ IVAI settings</b>\nResponse mode: <code>${escapeHtml(modeLabel(settings.mode, language))}</code>\nMemory: <code>${memory}</code>\n\n<b>IVAI models</b>\n${escapeHtml(modelRouteLabel(settings.selectedModel, language))}\n\nYour own APIs live under <b>🔑 My API</b> in the main menu.`;
  return { text, keyboard: settingsKeyboard(language, settings.memoryEnabled) };
}

// The My API list (v3.9.0): every saved config with exactly one ● Active
// marker, plus Add API. With no configs yet this is the provider picker.
async function byokListView(language, userId, env) {
  const fa = language === "fa";
  const configs = await listUserApiConfigs(userId, env).catch(() => []);
  const activeConfigId = await getActiveUserApiConfigId(userId, env).catch(() => null);
  if (!configs.length) {
    const text = fa
      ? `<b>🔑 API من</b>\n\nبا کلید API خودتان از IVAI استفاده کنید — متن، عکس و voice از طریق API شما پردازش می‌شوند. در گروه‌ها همچنان از مدل‌های IVAI استفاده می‌شود.\n\n${byokTrustLine(language)}\n\nپروایدر را پایین انتخاب کنید.`
      : `<b>🔑 My API</b>\n\nUse IVAI with your own API key — text, photos, and voice go through your API. Groups keep using IVAI models.\n\n${byokTrustLine(language)}\n\nChoose your provider below.`;
    return { text, keyboard: byokPresetKeyboard(language, byokPresetIds()) };
  }
  const lines = configs.map((config) => {
    const marker = config.configId === activeConfigId && config.enabled && config.status === "valid" ? "●" : "○";
    const invalid = config.status === "invalid" ? (fa ? " ⚠️ کلید نامعتبر" : " ⚠️ key invalid") : "";
    return `${marker} <b>${escapeHtml(config.name)}</b> — ${escapeHtml(byokPresetLabel(config.preset))} · <code>${escapeHtml(config.model || "")}</code>${invalid}`;
  }).join("\n");
  const text = fa
    ? `<b>🔑 API من</b>\n\n${lines}\n\n${byokTrustLine(language)}\n\nروی یک کانفیگ بزنید تا مدیریتش کنید، یا پایین یکی تازه اضافه کنید.`
    : `<b>🔑 My API</b>\n\n${lines}\n\n${byokTrustLine(language)}\n\nTap a config to manage it, or add a new one below.`;
  return { text, keyboard: byokListKeyboard(language, configs, activeConfigId) };
}

async function byokManageView(language, userId, env, configId) {
  const meta = await getUserApiConfigMeta(userId, env, configId).catch(() => null);
  if (!meta) return byokListView(language, userId, env);
  const fa = language === "fa";
  const activeConfigId = await getActiveUserApiConfigId(userId, env).catch(() => null);
  const header = `<b>🔑 ${escapeHtml(meta.name)}</b>\n\n`;
  if (meta.status === "invalid") {
    const text = fa
      ? `${header}⚠️ کلید <b>${escapeHtml(byokPresetLabel(meta.preset))}</b> شما دیگر کار نمی‌کند (سه بار خطای ورود). برای استفادهٔ دوباره از این API کلید تازه وارد کنید.\n\n${byokTrustLine(language)}`
      : `${header}⚠️ Your <b>${escapeHtml(byokPresetLabel(meta.preset))}</b> key stopped working (three sign-in failures). Enter a new key to use this API again.\n\n${byokTrustLine(language)}`;
    return { text, keyboard: byokManageKeyboard(language, "invalid", meta.configId) };
  }
  if (meta.enabled && meta.configId === activeConfigId) {
    const text = fa
      ? `${header}● <b>${escapeHtml(byokPresetLabel(meta.preset))}</b> · <code>${escapeHtml(meta.model)}</code>\n\nAPI و مدل آماده‌اند — شروع به چت کنید!\n\n${byokTrustLine(language)}`
      : `${header}● <b>${escapeHtml(byokPresetLabel(meta.preset))}</b> · <code>${escapeHtml(meta.model)}</code>\n\nYour API and model are ready — start chatting!\n\n${byokTrustLine(language)}`;
    return { text, keyboard: byokManageKeyboard(language, "active", meta.configId) };
  }
  // Saved-but-untested and tested-but-inactive read the same; only the
  // keyboard differs ("saved" offers the test, "inactive" offers activation).
  // Either way the next action is named, so the screen never reads like a
  // step is still missing.
  const state = meta.enabled ? "inactive" : "saved";
  const text = fa
    ? `${header}○ <b>${escapeHtml(byokPresetLabel(meta.preset))}</b> · <code>${escapeHtml(meta.model)}</code> (غیرفعال)\n\nاین API ذخیره شده ولی فعال نیست. برای فعال کردنش روی «▶ استفاده از API من» بزنید.\n\n${byokTrustLine(language)}`
    : `${header}○ <b>${escapeHtml(byokPresetLabel(meta.preset))}</b> · <code>${escapeHtml(meta.model)}</code> (inactive)\n\nThis API is saved but not active. Tap “▶ Use my API” to switch to it.\n\n${byokTrustLine(language)}`;
  return { text, keyboard: byokManageKeyboard(language, state, meta.configId) };
}

function byokModelView(language, meta) {
  const preset = byokPreset(meta?.preset);
  const models = preset?.chatModels || [];
  const text = language === "fa"
    ? `<b>🎛 مدل ${escapeHtml(preset?.label || "")}</b>\n\nکدام مدل پاسخ بدهد؟ مدل‌های اضافه‌شدهٔ شما هم در فهرست هستند — یا پایین یکی تازه اضافه کنید.`
    : `<b>🎛 ${escapeHtml(preset?.label || "")} model</b>\n\nWhich model should answer? Your added models are listed too — or add a new one below.`;
  return { text, keyboard: byokModelKeyboard(language, models, meta?.configId || null, meta?.customModels || [], meta?.model || null) };
}

function byokRenameText(language, meta) {
  if (language === "fa") return `<b>✏️ تغییر نام «${escapeHtml(meta?.name || "")}»</b>\n\nنام تازه را بفرستید (حداکثر ۶۴ نویسه).`;
  return `<b>✏️ Rename “${escapeHtml(meta?.name || "")}”</b>\n\nSend the new name (up to 64 characters).`;
}

function byokNameLooksValid(raw) {
  const value = String(raw || "").trim();
  return value.length > 0 && value.length <= 64 && !/[\r\n]/.test(value);
}

// A first-pass check only — the connection test is authoritative. The key
// itself is never logged or echoed back.
function byokKeyLooksValid(presetId, key) {
  const preset = byokPreset(presetId);
  return Boolean(preset?.keyPattern?.test(String(key || "").trim()));
}

// Custom endpoints must be https, ≤200 chars, with an optional path. A
// trailing slash or /chat/completions suffix is stripped; the runner appends
// the path itself.
function normalizeByokEndpoint(raw) {
  const value = String(raw || "").trim();
  if (!value || value.length > 200) return null;
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/.*)?$/.test(value)) return null;
  return value.replace(/\/+$/, "").replace(/\/chat\/completions$/i, "");
}

function byokModelIdLooksValid(raw) {
  const value = String(raw || "").trim();
  return value.length > 0 && value.length <= 200 && !/\s/.test(value);
}

async function getByokPending(userId, env) {
  try {
    const raw = await env.IVAI_KV?.get(byokPendingKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setByokPending(userId, pending, env) {
  await env.IVAI_KV?.put(byokPendingKey(userId), JSON.stringify(pending), { expirationTtl: BYOK_PENDING_TTL_SECONDS });
}

async function clearByokPending(userId, env) {
  await env.IVAI_KV?.delete(byokPendingKey(userId)).catch(() => {});
}

// A tiny probe (max_tokens 16) against the preset's active model. Success is
// HTTP 200 with non-empty content — reasoning_content counts for thinking
// models. The key never appears in the result or the log.
async function testByokConnection(config, env) {
  try {
    await runCustomApi({
      messages: [{ role: "user", content: "Hi" }],
      profile: responseProfile(MODES.FAST),
      byokConfig: config,
      maxTokens: 16
    }, env);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || "unknown") };
  }
}

// The pending-input state machine. Intercepted in handleUpdate BEFORE
// processText so a pasted key never reaches the AI or the session. Returns
// true when the message was consumed by the setup flow.
async function handleByokPendingMessage(message, env) {
  const userId = message.from?.id;
  const chatId = message.chat?.id;
  if (!userId || !chatId || message.chat?.type !== "private") return false;
  const pending = await getByokPending(userId, env);
  if (!pending?.step) return false;
  const text = String(message.text || "").trim();
  const language = (await getUserSettings(userId, env)).language || "en";
  // Any command clears the pending state (design): /cancel with no argument
  // cancels the setup itself; anything else (e.g. /cancel <task-id>) runs as
  // its own command.
  if (text.startsWith("/")) {
    await clearByokPending(userId, env);
    if (commandParts(text).command === "/cancel" && commandParts(text).args.length === 0) {
      await sendMessage(env, { chatId, text: byokCancelledText(language) });
      return true;
    }
    return false;
  }
  if (pending.step === "name") {
    if (!pending.configId || !byokNameLooksValid(text)) {
      const meta = pending.configId ? await getUserApiConfigMeta(userId, env, pending.configId).catch(() => null) : null;
      await sendMessage(env, { chatId, text: byokRenameText(language, meta), keyboard: byokCancelKeyboard(language) });
      return true;
    }
    await renameUserApiConfig(userId, pending.configId, text.trim(), env);
    await clearByokPending(userId, env);
    const view = await byokManageView(language, userId, env, pending.configId);
    const lead = language === "fa" ? `✓ نام به «${escapeHtml(text.trim())}» تغییر کرد.` : `✓ Renamed to “${escapeHtml(text.trim())}”.`;
    await sendEntryMessage(env, message, { html: `${lead}\n\n${view.text}`, keyboard: view.keyboard, language });
    // Phase 2: the indicator shows the config name — refresh it when the
    // active config is renamed, so it never shows a stale name.
    if ((await getActiveUserApiConfigId(userId, env).catch(() => null)) === pending.configId) {
      const meta = await getUserApiConfigMeta(userId, env, pending.configId).catch(() => null);
      if (meta) await refreshByokIndicator(env, { userId, chatId, language, name: meta.name, model: meta.model });
    }
    return true;
  }
  if (pending.step === "endpoint") {
    const baseUrl = normalizeByokEndpoint(text);
    if (!baseUrl) {
      await sendMessage(env, { chatId, text: byokEndpointText(language), keyboard: byokCancelKeyboard(language) });
      return true;
    }
    await setByokPending(userId, { step: "key", preset: "custom", baseUrl }, env);
    await sendMessage(env, { chatId, text: byokPresetText(language, BYOK_PRESETS.custom), keyboard: byokCancelKeyboard(language) });
    return true;
  }
  if (pending.step === "key") {
    const preset = byokPreset(pending.preset);
    const baseUrl = pending.preset === "custom" ? pending.baseUrl : preset?.baseUrl;
    if (!preset || !baseUrl) {
      await clearByokPending(userId, env);
      return false;
    }
    if (!byokKeyLooksValid(pending.preset, text)) {
      await sendMessage(env, { chatId, text: byokKeyFormatText(language, preset), keyboard: byokCancelKeyboard(language) });
      return true;
    }
    try {
      // Custom endpoints have no model list: save with an empty model and
      // collect it next; presets start from their first chat model. A re-key
      // keeps the config's existing model and name instead of resetting them.
      const existing = pending.rekeyConfigId ? await getUserApiConfigMeta(userId, env, pending.rekeyConfigId).catch(() => null) : null;
      const configId = await saveUserApiConfig({
        userId,
        configId: pending.rekeyConfigId || null,
        name: existing?.name || null,
        preset: pending.preset,
        baseUrl,
        apiKey: text,
        model: (existing?.model ?? preset.chatModels[0]) || "",
        visionModel: existing?.visionModel ?? preset.visionModel,
        transcriptionModel: existing?.transcriptionModel ?? preset.transcriptionModel
      }, env);
      pending.configId = configId;
    } catch {
      await sendMessage(env, { chatId, text: responseText(language, "temporary") });
      return true;
    }
    // The key message is deleted right after a successful save, so the key
    // never stays visible in the chat history.
    try { await deleteMessage(env, { chatId, messageId: message.message_id }); } catch { /* Best-effort. */ }
    if (pending.preset === "custom" && !pending.rekeyConfigId) {
      await setByokPending(userId, { step: "model", preset: "custom", configId: pending.configId }, env);
      await sendMessage(env, { chatId, text: `${byokKeySavedText(language, preset)}\n\n${byokAskModelText(language)}`, keyboard: byokCancelKeyboard(language) });
      return true;
    }
    await clearByokPending(userId, env);
    await sendMessage(env, { chatId, text: byokKeySavedText(language, preset), keyboard: byokManageKeyboard(language, "saved", pending.configId) });
    return true;
  }
  if (pending.step === "model") {
    const preset = byokPreset(pending.preset);
    if (!preset || !pending.configId || !byokModelIdLooksValid(text)) {
      await sendMessage(env, { chatId, text: byokAskModelText(language), keyboard: byokCancelKeyboard(language) });
      return true;
    }
    await updateUserApiConfigModel(userId, { model: text, visionModel: preset.visionModel, transcriptionModel: preset.transcriptionModel }, env, pending.configId);
    // A typed model is added to this config's list, so the model menu can
    // offer it again next time.
    await addCustomByokModel(userId, text, env, pending.configId);
    await clearByokPending(userId, env);
    // Setting the model is the last step: activate right away, with no
    // connection test — a test call would burn the user's own API tokens
    // for nothing (owner decision 2026-11-14, superseding the v3.9.1
    // test-then-activate flow). The manual "Test connection" button stays
    // for anyone who wants it; a stale key is caught by the first real
    // chat, which falls back to IVAI models with a one-line notice.
    await setUserApiConfigEnabled(userId, true, env, pending.configId);
    await setActiveUserApiConfig(userId, pending.configId, env);
    const view = await byokManageView(language, userId, env, pending.configId);
    const meta = await getUserApiConfigMeta(userId, env, pending.configId).catch(() => null);
    await sendByokActivated(env, { chatId, userId, language, preset, model: text, name: meta?.name, keyboard: view.keyboard });
    return true;
  }
  return false;
}

function helpText(language) {
  if (language === "fa") {
    return `<b>📖 راهنمای IVAI</b>\nهر پیامی بفرستید — <b>Auto</b> مسیر رایگان مناسب را انتخاب می‌کند.\n\n<b>حالت‌ها</b>\n<code>Auto</code> خودکار · <code>Fast</code> سریع · <code>Deep</code> دقیق · <code>Code</code> برنامه‌نویسی\n\n<b>ابزارها</b>\n<code>/new</code> گفتگوی تازه · <code>/models</code> مدل‌های رایگان · <code>/memory on|off</code> حافظه\n<code>/terminal</code> محیط گفتگو · <code>/task عنوان</code> یادآور · <code>/guard</code> بررسی ایمنی\n\n<details><summary>دربارهٔ Sessionها بیشتر</summary>هر Session حافظهٔ کوتاه و جداگانه‌ای دارد. همه‌چیز اینجا رایگان است.</details>`;
  }
  return `<b>📖 IVAI Help</b>\nSend any message — <b>Auto</b> picks a suitable free route.\n\n<b>Modes</b>\n<code>Auto</code> automatic · <code>Fast</code> quick · <code>Deep</code> thorough · <code>Code</code> programming\n\n<b>Tools</b>\n<code>/new</code> fresh chat · <code>/models</code> free models · <code>/memory on|off</code> memory\n<code>/terminal</code> chat workspace · <code>/task title</code> reminder · <code>/guard</code> safety check\n\n<details><summary>More about sessions</summary>Each session keeps a short, separate memory. Everything here is free.</details>`;
}

function newConversationText(language) {
  if (language === "fa") return "<b>🪐 گفتگوی تازه آماده است!</b>\ncontext قبلی پاک شد. حالت Auto است، مسیر مدل خودکار است و حافظه خاموش است. اول چه کاری انجام بدهیم؟";
  if (language === "ar") return "<b>🪐 محادثة جديدة جاهزة!</b>\nتم مسح السياق السابق. الوضع Auto، ومسار النموذج تلقائي، والذاكرة متوقفة. بماذا نبدأ أولاً؟";
  return "<b>🪐 Fresh chat, ready to go!</b>\nPrevious context is cleared. Mode is Auto, the model route is automatic, and memory is off. What shall we do first?";
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
  const title = language === "fa" ? "<b>🗂 taskهای شما</b>" : "<b>🗂 Your tasks</b>";
  if (!tasks.length) return `${title}\n\n${language === "fa" ? "task بازی ندارید. برای اضافه کردن، <code>/task عنوان</code> را بفرستید." : "You have no open tasks. Send <code>/task title</code> to add one."}`;
  return `${title}\n\n${tasks.map((task, index) => {
    const due = task.dueAt ? `\n${language === "fa" ? "مهلت" : "Due"}: <code>${escapeHtml(task.dueAt.replace(".000Z", "Z"))}</code>` : "";
    return `${index + 1}. ${escapeHtml(task.title)}${due}\n<code>${task.id.slice(0, 8)}</code>`;
  }).join("\n\n")}`;
}

function reengagementText(language, enabled) {
  if (language === "fa") return enabled ? "<b>🔔 یادآوری‌های IVAI روشن است</b>\nاگر ۱۵ روز نیایید، حداکثر یک پیام دوستانه می‌گیرید — نه بیشتر." : "<b>🔕 یادآوری‌های IVAI متوقف است</b>\nفعلاً پیامی نمی‌آید. هر وقت خواستید با <code>/notify on</code> دوباره روشنش کنید.";
  if (language === "ar") return enabled ? "<b>🔔 تذكيرات IVAI مفعّلة</b>\nإذا غبت 15 يومًا، ستصلك رسالة ودية واحدة على الأكثر — ليس أكثر." : "<b>🔕 تم إيقاف تذكيرات IVAI</b>\nلا توجد رسائل تحقق الآن. أعد تفعيلها في أي وقت عبر <code>/notify on</code>.";
  return enabled ? "<b>🔔 IVAI reminders are on</b>\nIf you're away for 15 days, you'll get at most one friendly hello — never more." : "<b>🔕 IVAI reminders are paused</b>\nNo check-ins for now. Turn them back on anytime with <code>/notify on</code>.";
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
    await sendEntryMessage(env, message, { html: await menuTextForUser(language, settings, userId, env), keyboard: mainKeyboard(language, message), language });
    return true;
  }
  if (command === "/help") {
    await sendEntryMessage(env, message, { html: helpText(language), keyboard: mainKeyboard(language, message), language });
    return true;
  }
  if (command === "/terminal") {
    if (message.chat?.type !== "private") {
      await sendMessage(env, { chatId, text: language === "fa" ? "IVAI Terminal فقط در چت خصوصی با من باز می‌شود — در چت‌هایتان من را باز کنید و آنجا <code>/terminal</code> را بفرستید." : "IVAI Terminal opens only in a private chat with me — tap me in your chats and send <code>/terminal</code> there.", replyTo: message.message_id });
      return true;
    }
    const text = language === "fa" ? "<b>⌘ IVAI Terminal</b>\nمحیط گفتگوی سبک شما آماده است — با مدل‌های IVAI یا API خودتان گفتگو کنید و حالت، مدل، حافظه و زبان را از وب تنظیم کنید." : "<b>⌘ IVAI Terminal</b>\nYour lightweight chat workspace is ready — chat with IVAI models or your own API, and tune mode, model, memory and language from the web.";
    await sendEntryMessage(env, message, { html: text, keyboard: terminalKeyboard(language), language });
    return true;
  }
  if (COMMAND_MODE[command]) {
    const mode = COMMAND_MODE[command];
    await setUserMode(userId, mode, env);
    const autoRoute = mode === MODES.AUTO
      ? (language === "fa" ? "، مسیر مدل: خودکار" : language === "ar" ? "، مسار النموذج: تلقائي" : ", model route: Auto")
      : "";
    const text = language === "fa"
      ? `✓ حالت روی <b>${escapeHtml(modeLabel(mode, language))}</b> تنظیم شد${autoRoute}.`
      : language === "ar"
        ? `✓ تم ضبط الوضع على <b>${escapeHtml(modeLabel(mode, language))}</b>${autoRoute}.`
        : `✓ Mode set to <b>${escapeHtml(modeLabel(mode, language))}</b>${autoRoute}.`;
    await sendMessage(env, { chatId, text, replyTo: message.message_id });
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
      ? `✓ مسیر مدل خودکار شد. حالت پاسخ همان <b>${mode}</b> می‌ماند.`
      : language === "ar"
        ? `✓ أصبح مسار النموذج تلقائيًا الآن. يبقى وضع الرد <b>${mode}</b>.`
        : `✓ Model route is Auto now. Response mode stays <b>${mode}</b>.`;
    await sendMessage(env, { chatId, text, replyTo: message.message_id });
    return true;
  }
  if (command === "/pick") {
    const model = await selectCatalogModel(args[0], env);
    if (!model) {
      await sendMessage(env, { chatId, text: language === "fa" ? "چنین شمارهٔ مدلی نیست. <code>/models</code> را باز کنید و یکی را از فهرست انتخاب کنید." : "That model number doesn't match anything. Open <code>/models</code> and pick one from the list.", replyTo: message.message_id });
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
        ? (language === "fa" ? `✓ <b>${refreshed.models.length}</b> مدل رایگان به‌روزرسانی شد.` : `✓ Refreshed <b>${refreshed.models.length}</b> free models.`)
        : escapeHtml(refreshed.reason);
      await sendMessage(env, { chatId, text, replyTo: message.message_id });
    } catch (error) {
      console.error(JSON.stringify({ event: "model_catalog_refresh_failure", error: String(error?.message || "unknown") }));
      await sendMessage(env, { chatId, text: responseText(language, "refreshFailed"), replyTo: message.message_id });
    }
    return true;
  }
  if (command === "/task") {
    const parsed = parseTaskInput(argumentText);
    if (parsed.error) {
      const usage = language === "fa" ? "برای یادآوری بفرستید:\n<code>/task عنوان</code> — یا با زمان — <code>/task in 30m | عنوان</code>" : "To add a reminder, send:\n<code>/task title</code> — or with a time — <code>/task in 30m | title</code>";
      await sendMessage(env, { chatId, text: usage, replyTo: message.message_id });
      return true;
    }
    try {
      const task = await createSecretaryTask({ userId, chatId, title: parsed.title, dueAt: parsed.dueAt }, env);
      const due = task.dueAt ? `\n${language === "fa" ? "زمان یادآوری" : "Remind me"}: <code>${escapeHtml(task.dueAt.replace(".000Z", "Z"))}</code>` : "";
      await sendMessage(env, { chatId, text: `${language === "fa" ? "✓ یادآوری تنظیم شد" : "✓ Reminder set"}: <b>${escapeHtml(task.title)}</b>${due}`, replyTo: message.message_id });
    } catch {
      await sendMessage(env, { chatId, text: responseText(language, "temporary"), replyTo: message.message_id });
    }
    return true;
  }
  if (command === "/tasks") {
    const tasks = await listSecretaryTasks(userId, env);
    await sendEntryMessage(env, message, { html: secretaryTaskText(tasks, language), keyboard: secretaryTaskKeyboard(tasks, language), language });
    return true;
  }
  if (command === "/done" || command === "/cancel") {
    const token = String(args[0] || "").toLowerCase();
    const tasks = await listSecretaryTasks(userId, env, { limit: 50 });
    const matches = tasks.filter((task) => task.id.toLowerCase().startsWith(token));
    const ok = token.length >= 4 && matches.length === 1 && await updateSecretaryTaskStatus({ id: matches[0].id, userId, status: command === "/done" ? "done" : "cancelled" }, env);
    const target = ok ? matches[0] : null;
    const text = target
      ? (command === "/done"
        ? (language === "fa" ? `✓ انجام شد — <b>${escapeHtml(target.title)}</b> بسته شد.` : `✓ Done — <b>${escapeHtml(target.title)}</b> is closed.`)
        : (language === "fa" ? `✓ لغو شد — <b>${escapeHtml(target.title)}</b> دیگر یادآوری نمی‌کند.` : `✓ Cancelled — <b>${escapeHtml(target.title)}</b> won't remind you.`))
      : (language === "fa" ? "این task دیگر باز نیست. فهرست را در <code>/tasks</code> ببینید." : "That task isn't open anymore. Open <code>/tasks</code> to see your list.");
    await sendMessage(env, { chatId, text, replyTo: message.message_id });
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
        ? (language === "fa" ? "✓ حافظه <b>روشن</b> شد — context این گفتگو در Session نگه داشته می‌شود." : "✓ Memory is <b>on</b> — this chat's context is kept for the session.")
        : (language === "fa" ? "✓ حافظه <b>خاموش</b> شد — context چت و ترمینال پاک شد. پیام‌های جدید فقط در Session کوتاه به‌هم متصل می‌مانند." : "✓ Memory is <b>off</b> — chat and Terminal context were cleared. New messages stay connected only within the short session.");
      await sendMessage(env, { chatId, text, replyTo: message.message_id });
      return true;
    }
    if (action === "clear") {
      await clearUserMemory(message, env);
      await sendMessage(env, { chatId, text: language === "fa" ? "✓ حافظهٔ این گفتگو و IVAI Terminal پاک شد." : "✓ Memory cleared for this chat and IVAI Terminal.", replyTo: message.message_id });
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
    await sendMessage(env, { chatId, text: language === "fa" ? "IVAI همهٔ مدل‌ها را ping نمی‌کند — سهمیهٔ رایگان هدر می‌رود. مسیرها با درخواست واقعی و fallback ترتیبی بررسی می‌شوند." : "IVAI doesn't ping every model — that would burn the free quota. Routes are checked on real requests, with the free fallback in order.", replyTo: message.message_id });
    return true;
  }
  if (command === "/reset") {
    await resetUserAgentPreferences(userId, env);
    await clearUserMemory(message, env);
    await sendMessage(env, { chatId, text: language === "fa" ? "✓ تنظیمات IVAI و حافظهٔ ترمینال به حالت پیش‌فرض برگشت." : "✓ IVAI settings and Terminal memory are reset to defaults.", replyTo: message.message_id });
    return true;
  }
  if (command === "/admin") {
    const role = await getRole(userId, env);
    if (!canManage(role)) {
      await sendMessage(env, { chatId, text: responseText(language, "noAccess"), replyTo: message.message_id });
      return true;
    }
    await sendEntryMessage(env, message, { html: language === "fa" ? "<b>🛠 مدیریت IVAI</b>\nیک کار را پایین انتخاب کنید." : "<b>🛠 IVAI Admin</b>\nPick an action below.", keyboard: adminKeyboard(), language });
    return true;
  }
  if (command === "/broadcast") {
    const role = await getRole(userId, env);
    if (!canBroadcast(role)) {
      await sendMessage(env, { chatId, text: responseText(language, "noAccess"), replyTo: message.message_id });
      return true;
    }
    if (!argumentText) {
      await sendMessage(env, { chatId, text: language === "fa" ? "برای شروع broadcast بفرستید:\n<code>/broadcast پیام شما</code>" : "To start a broadcast, send:\n<code>/broadcast your message</code>", replyTo: message.message_id });
      return true;
    }
    const campaignId = await createBroadcastDraft({ authorId: userId, content: argumentText }, env);
    await writeAdminAudit({ actorId: userId, action: "broadcast_draft_created", targetType: "broadcast", targetId: campaignId }, env);
    // M26 is the full draft message (its first line differs from the short
    // responseText "draftCreated" key, which stays the canonical short string).
    const draftText = language === "fa"
      ? `<b>✓ پیش‌نویس broadcast آماده است</b>\nهنوز چیزی ارسال نشده — اول بررسی کنید.\n\n<b>پیش‌نمایش</b>\n${escapeHtml(argumentText)}`
      : `<b>✓ Broadcast draft ready</b>\nNothing is sent yet — review it first.\n\n<b>Preview</b>\n${escapeHtml(argumentText)}`;
    await sendMessage(env, {
      chatId,
      text: draftText,
      keyboard: { inline_keyboard: [[{ text: "✓ Confirm", callback_data: `broadcast:confirm:${campaignId}` }, { text: "✕ Cancel", callback_data: `broadcast:cancel:${campaignId}` }]] }
    });
    return true;
  }
  if (command.startsWith("/")) {
    await sendMessage(env, { chatId, text: language === "fa" ? "این فرمان را نمی‌شناسم. برای دیدن کارهایی که می‌توانم بکنم <code>/help</code> را بزنید." : "I don't know that command. Try <code>/help</code> to see what I can do.", replyTo: message.message_id });
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
  // Cheap group rejections (v3.7.5): a non-command group turn runs the tier +
  // anti-spam limit check before any settings/membership/upsert/session work,
  // so a turn the cooldown or hourly cap rejects costs nothing beyond the
  // check itself. Command turns keep the legacy order further down — they are
  // handled before limits there and never consume group reply quota.
  let tier = null;
  let groupLimitsPassed = false;
  if (isGroup && !text.startsWith("/")) {
    tier = await groupTier(message, env, trigger);
    if (!await passGroupLimits(message, env, tier, trigger)) return;
    groupLimitsPassed = true;
  }
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
      // The prompt is a side effect, not the turn's result: if Telegram
      // rejects the send itself, end the turn gracefully instead of
      // throwing into the webhook 500/retry path.
      try {
        await sendMembershipRequired(message, uiLanguage, membership, env);
      } catch (error) {
        console.error(JSON.stringify({ event: "membership_prompt_failed", error: String(error?.message || "unknown") }));
      }
      return;
    }
  }
  // The upsert only refreshes profile metadata; the settings already loaded
  // in memory stay authoritative for this turn, so a D1 write failure must
  // not fail the turn.
  try {
    await upsertUser({ user: message.from, chat: message.chat, language: uiLanguage }, env);
  } catch (error) {
    console.error(JSON.stringify({ event: "user_upsert_failed", error: String(error?.message || "unknown") }));
  }
  if (message.chat?.type === "private") await ensureTerminalMenuButton(env);
  if (text.startsWith("/") && await handleCommand(message, env, uiLanguage)) return;

  // handleCommand only mutates settings when it handles the message (and returns),
  // so the already-loaded settings are still authoritative here.
  const settings = knownSettings;
  const key = contextKey(message);
  const session = await ensureConversationSession(key, env, { language: responseLanguage });
  responseLanguage = isGroup ? scriptLanguageFromMessage(message) || settings.language || "en" : activeConversationLanguage(message, settings, session);
  // Command turns (and only they) reach the group limits here, in the legacy
  // position after the session load; non-command turns already passed above.
  if (isGroup && !groupLimitsPassed) {
    tier = await groupTier(message, env, trigger);
    if (!await passGroupLimits(message, env, tier, trigger)) return;
  }
  const modelInput = richDetailsRequested
    ? `${text}\n\nFor this opt-in expandable answer, provide the normal answer first. Only if a short user-visible supplement adds value, wrap that supplement exactly as:\n:::details Optional details\nvisible supporting explanation\n:::enddetails\nNever include hidden reasoning, chain-of-thought, private analysis, policies, or instructions inside the details block.`
    : text;
  const usage = anonGroupAdmin ? { allowed: true } : await allowUsage({ scope: "text", id: userId, limit: APP.userHourlyTextLimit }, env);
  if (!usage.allowed) {
    await sendMessage(env, { chatId, text: busyText(uiLanguage, usage.resetInSeconds), replyTo: message.message_id, ...delivery });
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
        html: `<tg-thinking>${uiLanguage === "fa" ? "⚡ IVAI در حال فکر کردن" : "⚡ IVAI is thinking"}</tg-thinking>`,
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

  // BYOK (v3.8.0, private chats only): load the decrypted config once per
  // turn. Group turns never load it — the config is never decrypted for a
  // group, and Guard mode never uses it (see ai.js).
  let byokConfig = null;
  if (!isGroup) {
    try { byokConfig = await getUserApiConfig(userId, env); } catch { byokConfig = null; }
  }
  let byokFailedForTurn = false;
  try {
    const result = await generateReply({
      text: modelInput,
      selectedMode: isGroup ? MODES.FAST : settings.mode,
      selectedModel: isGroup ? GROUP_MODEL : settings.selectedModel,
      language: responseLanguage,
      context,
      byokConfig
    }, env).catch((error) => { byokFailedForTurn = Boolean(byokConfig); throw error; });
    // BYOK bookkeeping: a success through the user's API clears the auth
    // failure counter; a 401 counts toward invalidating a dead key.
    if (result.provider === "byok" && byokConfig?.authFailures > 0) resetUserApiAuthFailures(userId, env, byokConfig.configId).catch(() => {});
    if (result.byokAuthFailed) markUserApiConfigInvalid(userId, env, {}, byokConfig?.configId).catch(() => {});
    if (isGroup) await setGroupCooldown(message, env, tier);
    await thinking?.stop();
    await typing?.stop();
    await saveConversationSession(key, [...context, { role: "user", content: text }, { role: "assistant", content: result.text }], env, { session, language: responseLanguage });
      // Groups never carry the model/mode footer (v3.5.0); private chats do.
      // The footer follows the ANSWER's direction, not the UI language: an
      // English footer inside a Persian answer otherwise renders
      // left-aligned with its sequence possibly reversed (v3.11.3).
      const answerRtl = ["fa", "ar"].includes(responseLanguage);
      const footer = isGroup ? "" : `\n\n${responseMeta({ model: result.model, mode: result.mode, language: uiLanguage, rtl: answerRtl })}`;
      const byokNotice = result.fellBackFromByok ? `\n\n${answerRtl ? "\u200f" : ""}${responseText(uiLanguage, "byokFallback")}` : "";
      const finalText = `${renderStandardAiText(result.text)}${byokNotice}${footer}`;
      // Keep the existing metadata block as-is: nesting a blockquote inside a Rich HTML
      // footer is not needed and can reduce parser compatibility across Telegram clients.
      const richFinalText = `${renderRichAiText(result.text, { allowDetails: richDetailsRequested, allowMath: [MODES.DEEP, MODES.CODE].includes(result.mode) })}${byokNotice}\n${responseMeta({ model: result.model, mode: result.mode, language: uiLanguage, rtl: answerRtl })}`;
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
        text: uiLanguage === "fa" ? "<i>پاسخ طولانی است — در پیام‌های زیر بخش‌بخش می‌فرستمش.</i>" : "<i>Your answer is long — I'm sending it in parts below.</i>",
        businessConnectionId: delivery.businessConnectionId
      });
    }
    // Split raw model output first, then render every part independently. This preserves the
    // safe HTML/blockquote layer for long replies without risking broken tags across boundaries.
    const rawParts = splitText(result.text, APP.maxTelegramText - 600);
    for (let index = 0; index < rawParts.length; index += 1) {
      const last = index === rawParts.length - 1;
      const formattedPart = renderStandardAiText(rawParts[index]);
      const textPart = last ? `${formattedPart}${byokNotice}${footer}` : formattedPart;
      await sendMessage(env, { chatId, text: textPart, replyTo: isGroup || index === 0 ? message.message_id : undefined, ...delivery });
    }
  } catch (error) {
    await thinking?.stop();
    await typing?.stop();
    const code = safeError(error);
    const failureText = byokFailedForTurn
      ? `${responseText(uiLanguage, "byokFailure")}\n\n${responseText(uiLanguage, code === "RATE_LIMIT" ? "busy" : "temporary")}`
      : responseText(uiLanguage, code === "RATE_LIMIT" ? "busy" : "temporary");
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
  // Cheap group rejections (v3.7.5): the shared per-chat limits/cooldown run
  // before the settings/membership load, mirroring processText — a media turn
  // they reject pays nothing beyond the check itself.
  let tier = null;
  if (isGroup) {
    // Group media counts against the same per-chat limits/cooldown as group
    // text; without this it would bypass the group anti-spam policy entirely.
    tier = await groupTier(message, env, groupTriggerType);
    if (!await passGroupLimits(message, env, tier, groupTriggerType)) return;
  }
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
  if (isGroup) {
    // Dedicated per-chat media cap on top of the shared group limits; a
    // blocked media is dropped silently like every other group limit.
    const mediaCap = await allowUsage({ scope: "groupmedia", id: chatId, limit: tier === "primary" ? GROUP_POLICY.primaryMediaHourlyLimit : GROUP_POLICY.otherMediaHourlyLimit }, env);
    if (!mediaCap.allowed) return;
  }
  // The UI language is a stored preference (default English, changed only
  // via /lang): persist storedLanguage exactly as processText does, never
  // the caption-script-derived answer language above, or a first-contact
  // Persian caption would silently become a Persian UI preference.
  await upsertUser({ user: message.from, chat: message.chat, language: storedLanguage }, env);
  const usage = anonGroupAdmin ? { allowed: true } : await allowUsage({ scope: "media", id: userId, limit: APP.userDailyMediaLimit, windowSeconds: 24 * 60 * 60 }, env);
  if (!usage.allowed) {
    await sendMessage(env, { chatId, text: busyText(language, usage.resetInSeconds), replyTo: message.message_id, ...delivery });
    return;
  }
  if (isGroup) await sendTyping(env, chatId, delivery).catch(() => {});
  const typing = isGroup ? startTypingRefresher(env, { chatId, ...delivery }) : null;
  // BYOK (v3.8.0, private chats only): same once-per-turn config load as
  // processText; group media never loads it.
  let byokConfig = null;
  if (!isGroup) {
    try { byokConfig = await getUserApiConfig(userId, env); } catch { byokConfig = null; }
  }
  let byokFailedForTurn = false;
  try {
    let result;
    let prefix = "";
    if (message.voice) {
      result = await transcribeVoice({ fileId: message.voice.file_id, languageHint: language, byokConfig }, env).catch((error) => { byokFailedForTurn = Boolean(byokConfig); throw error; });
      prefix = language === "fa" ? "<b>متن صوت:</b>\n" : "<b>Voice transcription:</b>\n";
    } else if (message.photo?.length) {
      result = await analyzePhoto({ fileId: message.photo.at(-1).file_id, caption: message.caption || "", language, byokConfig }, env).catch((error) => { byokFailedForTurn = Boolean(byokConfig); throw error; });
    } else {
      await typing?.stop();
      await sendMessage(env, { chatId, text: responseText(language, "unsupportedMedia"), replyTo: message.message_id, ...delivery });
      return;
    }
    if (result.provider === "byok" && byokConfig?.authFailures > 0) resetUserApiAuthFailures(userId, env, byokConfig.configId).catch(() => {});
    if (result.byokAuthFailed) markUserApiConfigInvalid(userId, env, {}, byokConfig?.configId).catch(() => {});
    const byokNotice = result.fellBackFromByok ? `\n\n${["fa", "ar"].includes(language) ? "\u200f" : ""}${responseText(language, "byokFallback")}` : "";
    await typing?.stop();
    await sendMessage(env, {
      chatId,
      // Groups never carry the model/mode footer (v3.5.0); private chats do.
      text: `${prefix}${renderStandardAiText(result.text)}${byokNotice}${isGroup ? "" : `\n\n${responseMeta({ model: result.model, language, rtl: ["fa", "ar"].includes(language) })}`}`,
      replyTo: message.message_id,
      ...delivery
    });
    if (isGroup) await setGroupCooldown(message, env, tier);
  } catch (error) {
    await typing?.stop();
    const code = safeError(error);
    const failureText = byokFailedForTurn
      ? `${responseText(language, "byokFailure")}\n\n${responseText(language, code === "RATE_LIMIT" ? "busy" : "temporary")}`
      : responseText(language, code === "RATE_LIMIT" ? "busy" : "temporary");
    await sendMessage(env, { chatId, text: failureText, replyTo: message.message_id, ...delivery });
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
      results: [{ type: "article", id: "ivai-help", title: language === "fa" ? "از IVAI بپرسید" : "Ask IVAI", description: language === "fa" ? "سؤال را بعد از @IVAI_Llm_bot بنویسید تا همین‌جا جواب بدهم." : "Type a question after @IVAI_Llm_bot, and I'll answer right here.", input_message_content: { message_text: language === "fa" ? "<b>از IVAI بپرسید</b> — سؤال را بعد از @IVAI_Llm_bot بنویسید تا همین‌جا جواب بدهم." : "<b>Ask IVAI</b> — Type a question after @IVAI_Llm_bot, and I'll answer right here.", parse_mode: "HTML" } }]
    });
    return;
  }
  const usage = await allowUsage({ scope: "inline", id: userId, limit: Math.max(8, Math.floor(APP.userHourlyTextLimit / 2)) }, env);
  if (!usage.allowed) {
    await telegram(env, "answerInlineQuery", {
      inline_query_id: query.id, cache_time: 3, is_personal: true,
      results: [{ type: "article", id: "ivai-busy", title: language === "fa" ? "IVAI فعلاً شلوغ است" : "IVAI is busy for a moment", description: language === "fa" ? "کمی بعد دوباره تلاش کنید." : "Please try again shortly.", input_message_content: { message_text: language === "fa" ? "<b>IVAI فعلاً شلوغ است</b> — کمی بعد دوباره تلاش کنید." : "<b>IVAI is busy for a moment</b> — please try again shortly." } }]
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
        input_message_content: { message_text: `${renderStandardAiText(result.text)}\n\n${responseMeta({ model: result.model, mode: result.mode, language, rtl: ["fa", "ar"].includes(language) })}`, parse_mode: "HTML", disable_web_page_preview: true }
      }]
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "inline_failure", code: safeError(error), userId: String(userId) }));
    await telegram(env, "answerInlineQuery", {
      inline_query_id: query.id, cache_time: 3, is_personal: true,
      results: [{ type: "article", id: "ivai-error", title: language === "fa" ? "IVAI فعلاً در دسترس نیست" : "IVAI is unavailable right now", description: language === "fa" ? "کمی بعد دوباره تلاش کنید." : "Please try again shortly.", input_message_content: { message_text: language === "fa" ? "<b>IVAI فعلاً در دسترس نیست</b> — کمی بعد دوباره تلاش کنید." : "<b>IVAI is unavailable right now</b> — please try again shortly." } }]
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

function adminStatsText(stats, language = "en") {
  const value = (item) => item ?? "n/a";
  if (language === "fa") return `<b>📊 عملیات IVAI</b>\n\n<b>افراد</b>\nهمهٔ کاربران: <code>${value(stats.totalUsers)}</code>\nفعال (۷ روز): <code>${value(stats.activeUsers7d)}</code>\nفعال (۳۰ روز): <code>${value(stats.activeUsers30d)}</code>\nچت‌های فعال (۳۰ روز): <code>${value(stats.activeChats30d)}</code>\n\n<b>در حال اجرا</b>\nبازخورد (۷ روز): <code>${value(stats.feedback7d)}</code>\nبرادکست‌های در انتظار: <code>${value(stats.pendingBroadcasts)}</code>\nبودجهٔ امروز Workers AI: <code>${value(stats.workersAiBudgetRemaining)}</code>`;
  return `<b>📊 IVAI Operations</b>\n\n<b>People</b>\nTotal users: <code>${value(stats.totalUsers)}</code>\nActive (7 days): <code>${value(stats.activeUsers7d)}</code>\nActive (30 days): <code>${value(stats.activeUsers30d)}</code>\nActive chats (30 days): <code>${value(stats.activeChats30d)}</code>\n\n<b>Running</b>\nFeedback (7 days): <code>${value(stats.feedback7d)}</code>\nBroadcasts waiting: <code>${value(stats.pendingBroadcasts)}</code>\nWorkers AI budget left today: <code>${value(stats.workersAiBudgetRemaining)}</code>`;
}

// The Rich rendering of the admin stats: the same numbers as adminStatsText
// as one small table with section headers. The plain line format stays the
// fallback — a <table> is not valid plain-HTML parse_mode.
function adminStatsRichText(stats, language = "en") {
  const value = (item) => `<code>${item ?? "n/a"}</code>`;
  const rows = language === "fa" ? [
    ["افراد", [["همهٔ کاربران", stats.totalUsers], ["فعال (۷ روز)", stats.activeUsers7d], ["فعال (۳۰ روز)", stats.activeUsers30d], ["چت‌های فعال (۳۰ روز)", stats.activeChats30d]]],
    ["در حال اجرا", [["بازخورد (۷ روز)", stats.feedback7d], ["برادکست‌های در انتظار", stats.pendingBroadcasts], ["بودجهٔ امروز Workers AI", stats.workersAiBudgetRemaining]]]
  ] : [
    ["People", [["Total users", stats.totalUsers], ["Active (7 days)", stats.activeUsers7d], ["Active (30 days)", stats.activeUsers30d], ["Active chats (30 days)", stats.activeChats30d]]],
    ["Running", [["Feedback (7 days)", stats.feedback7d], ["Broadcasts waiting", stats.pendingBroadcasts], ["Workers AI budget left today", stats.workersAiBudgetRemaining]]]
  ];
  const header = language === "fa" ? "📊 عملیات IVAI" : "📊 IVAI Operations";
  const body = rows.map(([section, items]) => `<tr><th colspan="2">${section}</th></tr>${items.map(([label, item]) => `<tr><td>${label}</td><td>${value(item)}</td></tr>`).join("")}`).join("");
  return `<b>${header}</b>\n<table><tbody>${body}</tbody></table>`;
}

function modeChangedText(mode, language) {
  const label = escapeHtml(modeLabel(mode, language));
  const autoRoute = mode === MODES.AUTO;
  if (language === "fa") {
    return `✓ حالت پاسخ حالا <b>${label}</b> است${autoRoute ? " — مسیر مدل: خودکار" : ""}.`;
  }
  if (language === "ar") {
    return `✓ وضع الرد الآن <b>${label}</b>${autoRoute ? " — مسار النموذج: تلقائي" : ""}.`;
  }
  return `✓ Response mode is now <b>${label}</b>${autoRoute ? " — model route: Auto" : ""}.`;
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
    await editRichScreen(env, query.message, { html: membershipConfirmedText(language), keyboard: welcomeKeyboard(language, query.message), language });
    return;
  }

  await answerCallback(env, query.id).catch(() => {});
  const membership = await isRequiredChannelMember(userId, env);
  if (!membership.allowed) {
    await editRichScreen(env, query.message, { html: requiredMembershipText(language, { checkFailed: membership.reason === "CHECK_FAILED" }), keyboard: requiredMembershipKeyboard(language), language });
    return;
  }
  await upsertUser({ user: query.from, chat: query.message.chat, language }, env);
  if (query.message.chat?.type === "private") await ensureTerminalMenuButton(env);

  if (data === "notify:on" || data === "notify:off") {
    const enabled = data === "notify:on";
    await setReengagementPreference(userId, enabled, env);
    await editRichScreen(env, query.message, { html: reengagementText(language, enabled), keyboard: reengagementKeyboard(language, enabled), language });
    return;
  }
  if (data.startsWith("task:")) {
    const [, action, taskId] = data.split(":");
    if (!["done", "cancel"].includes(action) || !taskId) return;
    const open = await listSecretaryTasks(userId, env);
    const target = open.find((task) => task.id === taskId || task.id.toLowerCase().startsWith(taskId.toLowerCase()));
    const changed = target ? await updateSecretaryTaskStatus({ id: target.id, userId, status: action === "done" ? "done" : "cancelled" }, env) : false;
    const tasks = await listSecretaryTasks(userId, env);
    const prefix = changed && target
      ? (action === "done"
        ? (language === "fa" ? `✓ انجام شد — <b>${escapeHtml(target.title)}</b> بسته شد.` : `✓ Done — <b>${escapeHtml(target.title)}</b> is closed.`)
        : (language === "fa" ? `✓ لغو شد — <b>${escapeHtml(target.title)}</b> دیگر یادآوری نمی‌کند.` : `✓ Cancelled — <b>${escapeHtml(target.title)}</b> won't remind you.`))
      : (language === "fa" ? "این task دیگر باز نیست." : "This task is no longer open.");
    await editRichScreen(env, query.message, { html: `${prefix}\n\n${secretaryTaskText(tasks, language)}`, keyboard: secretaryTaskKeyboard(tasks, language), language });
    return;
  }
  if (data === "menu:main" || data === "modes:back") {
    const settings = await getUserSettings(userId, env);
    await editRichScreen(env, query.message, { html: await menuTextForUser(language, settings, userId, env), keyboard: mainKeyboard(language, query.message), language });
    return;
  }
  if (data === "menu:help") {
    await editRichScreen(env, query.message, { html: helpText(language), keyboard: mainKeyboard(language, query.message), language });
    return;
  }
  if (data === "menu:models") {
    const settings = await getUserSettings(userId, env);
    const view = await modelPickerView(language, settings.selectedModel, env);
    await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
    return;
  }
  if (data.startsWith("model:view:")) {
    const scope = pickerScope(data.slice("model:view:".length));
    const settings = await getUserSettings(userId, env);
    const view = await modelPickerView(language, settings.selectedModel, env, 0, scope);
    await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
    return;
  }
  if (data.startsWith("model:page:")) {
    const [requestedScope, requestedPage] = data.slice("model:page:".length).split(":");
    const legacyPage = requestedPage === undefined ? Number(requestedScope) : NaN;
    const scope = requestedPage === undefined ? "all" : pickerScope(requestedScope);
    const page = requestedPage === undefined ? legacyPage : Number(requestedPage);
    const settings = await getUserSettings(userId, env);
    const view = await modelPickerView(language, settings.selectedModel, env, Number.isFinite(page) ? page : 0, scope);
    await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
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
        ? "فهرست مدل‌ها از وقتی بازش کردید عوض شده است. لطفاً دوباره مدل را انتخاب کنید."
        : language === "ar"
          ? "تغيّرت قائمة النماذج منذ فتحها. يرجى اختيار النموذج مرة أخرى."
          : "The model list changed since you opened it. Please pick a model again.";
      await editRichScreen(env, query.message, { html: `${notice}\n\n${view.text}`, keyboard: view.keyboard, language });
      return;
    }
    const settings = await getUserSettings(userId, env);
    await setSelectedModel(userId, model.id, env);
    const view = await modelPickerView(language, model.id, env, Number.isFinite(Number(requestedPage)) ? Number(requestedPage) : 0, scope);
    await editRichScreen(env, query.message, { html: modelSelectionText(model, language, settings.mode), keyboard: view.keyboard, language });
    return;
  }
  if (data === "model:auto" || data.startsWith("model:auto:")) {
    const scope = pickerScope(data.split(":")[2] || "all");
    await setSelectedModel(userId, null, env);
    const view = await modelPickerView(language, null, env, 0, scope);
    const confirmation = language === "fa" ? "✓ مسیر خودکار روشن است — IVAI خودش یک مدل رایگان برای شما انتخاب می‌کند." : language === "ar" ? "✓ المسار التلقائي مفعّل — يختار IVAI نموذجًا مجانيًا لك." : "✓ Auto route is on — IVAI picks a free model for you.";
    await editRichScreen(env, query.message, { html: `${confirmation}\n\n${view.text}`, keyboard: view.keyboard, language });
    return;
  }
  if (data === "model:refresh" || data.startsWith("model:refresh:")) {
    const scope = pickerScope(data.split(":")[2] || "all");
    try { await refreshFreeModelCatalog(env); } catch { /* The picker keeps the last safe catalog. */ }
    const settings = await getUserSettings(userId, env);
    const view = await modelPickerView(language, settings.selectedModel, env, 0, scope);
    await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
    return;
  }
  if (data === "model:noop") return;
  // --- BYOK ("My API", v3.8.0; multi-config since v3.9.0) -------------------
  // Private chats only: the main menu is shared, so a group tap on the My API
  // button must not open the user's configs.
  if (data.startsWith("byok:") && query.message?.chat?.type !== "private") {
    await sendMessage(env, { chatId, text: language === "fa" ? "🔑 «API من» فقط در چت خصوصی با من است — من را آنجا باز کنید و در منو روی <b>My API</b> بزنید." : "🔑 My API lives in a private chat with me — open me there and tap <b>My API</b> in the menu." });
    return;
  }
  if (data === "byok:open" || data === "byok:list") {
    const view = await byokListView(language, userId, env);
    await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
    return;
  }
  if (data.startsWith("byok:config:")) {
    const configId = data.slice("byok:config:".length);
    const view = await byokManageView(language, userId, env, configId);
    await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
    return;
  }
  if (data === "byok:presets") {
    const text = language === "fa"
      ? `<b>🔑 API من</b>\nپروایدر را پایین انتخاب کنید.\n\n${byokTrustLine(language)}`
      : `<b>🔑 My API</b>\nChoose your provider below.\n\n${byokTrustLine(language)}`;
    await editRichScreen(env, query.message, { html: text, keyboard: byokPresetKeyboard(language, byokPresetIds()), language });
    return;
  }
  if (data === "byok:back") {
    const settings = await getUserSettings(userId, env);
    await editRichScreen(env, query.message, { html: await menuTextForUser(language, settings, userId, env), keyboard: mainKeyboard(language, query.message), language });
    return;
  }
  if (data === "byok:cancel") {
    await clearByokPending(userId, env);
    const view = await byokListView(language, userId, env);
    await editRichScreen(env, query.message, { html: `${byokCancelledText(language)}\n\n${view.text}`, keyboard: view.keyboard, language });
    return;
  }
  if (data.startsWith("byok:preset:")) {
    const presetId = data.slice("byok:preset:".length);
    const preset = byokPreset(presetId);
    if (!preset) return;
    if (presetId === "custom") {
      await setByokPending(userId, { step: "endpoint", preset: "custom" }, env);
      await editMessage(env, { chatId, messageId, text: byokEndpointText(language), keyboard: byokCancelKeyboard(language) });
      return;
    }
    await setByokPending(userId, { step: "key", preset: presetId }, env);
    await editMessage(env, { chatId, messageId, text: byokPresetText(language, preset), keyboard: byokCancelKeyboard(language) });
    return;
  }
  if (data.startsWith("byok:rekey:")) {
    const configId = data.slice("byok:rekey:".length);
    const meta = await getUserApiConfigMeta(userId, env, configId);
    if (!meta) {
      const view = await byokListView(language, userId, env);
      await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
      return;
    }
    await setByokPending(userId, { step: "key", preset: meta.preset, rekeyConfigId: configId }, env);
    await editMessage(env, { chatId, messageId, text: byokPresetText(language, byokPreset(meta.preset)), keyboard: byokCancelKeyboard(language) });
    return;
  }
  if (data.startsWith("byok:test:")) {
    const configId = data.slice("byok:test:".length);
    const config = await getUserApiConfig(userId, env, { includeDisabled: true, configId }).catch(() => null);
    if (!config) {
      const view = await byokListView(language, userId, env);
      await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
      return;
    }
    if (!config.model) {
      await setByokPending(userId, { step: "model", preset: config.preset, configId }, env);
      await editMessage(env, { chatId, messageId, text: byokAskModelText(language), keyboard: byokCancelKeyboard(language) });
      return;
    }
    const test = await testByokConnection(config, env);
    if (!test.ok) {
      await editMessage(env, { chatId, messageId, text: byokTestFailedText(language, test.error), keyboard: byokTestFailedKeyboard(language, configId) });
      return;
    }
    const meta = await getUserApiConfigMeta(userId, env, configId);
    // A custom endpoint has no model list — its model was already typed, so
    // a working test activates it directly instead of showing an empty list.
    if (!(byokPreset(meta?.preset)?.chatModels?.length)) {
      await setUserApiConfigEnabled(userId, true, env, configId);
      await setActiveUserApiConfig(userId, configId, env);
      const view = await byokManageView(language, userId, env, configId);
      await sendByokActivated(env, { chatId, messageId, userId, language, preset: byokPreset(meta.preset), model: meta.model, name: meta.name, keyboard: view.keyboard });
      return;
    }
    const view = byokModelView(language, meta);
    const lead = language === "fa"
      ? `<b>✓ اتصال برقرار است</b>\nکلید ${escapeHtml(byokPresetLabel(meta.preset))} شما جواب می‌دهد. حالا مدل را پایین انتخاب کنید — بعد آمادهٔ چت هستید.`
      : `<b>✓ Connection works</b>\nYour ${escapeHtml(byokPresetLabel(meta.preset))} key answers. Now pick a model below — then you're ready to chat.`;
    await editRichScreen(env, query.message, { html: `${lead}\n\n${view.text}`, keyboard: view.keyboard, language });
    return;
  }
  if (data.startsWith("byok:models:")) {
    const configId = data.slice("byok:models:".length);
    const meta = await getUserApiConfigMeta(userId, env, configId);
    const view = byokModelView(language, meta);
    await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
    return;
  }
  if (data.startsWith("byok:model:")) {
    const rest = data.slice("byok:model:".length);
    const sep = rest.indexOf(":");
    const configId = sep === -1 ? "" : rest.slice(0, sep);
    const token = sep === -1 ? rest : rest.slice(sep + 1);
    if (token === "other") {
      const meta = await getUserApiConfigMeta(userId, env, configId);
      await setByokPending(userId, { step: "model", preset: meta?.preset || "custom", configId }, env);
      await editMessage(env, { chatId, messageId, text: byokAskModelText(language), keyboard: byokCancelKeyboard(language) });
      return;
    }
    const meta = await getUserApiConfigMeta(userId, env, configId);
    const preset = byokPreset(meta?.preset);
    const allModels = [...(preset?.chatModels || []), ...(meta?.customModels || [])];
    const model = allModels[Number(token)];
    if (!meta || !model) {
      const view = byokModelView(language, meta);
      await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
      return;
    }
    await updateUserApiConfigModel(userId, { model, visionModel: preset.visionModel, transcriptionModel: preset.transcriptionModel }, env, configId);
    await setUserApiConfigEnabled(userId, true, env, configId);
    await setActiveUserApiConfig(userId, configId, env);
    const view = await byokManageView(language, userId, env, configId);
    await sendByokActivated(env, { chatId, messageId, userId, language, preset, model, name: meta.name, keyboard: view.keyboard });
    return;
  }
  if (data.startsWith("byok:enable:")) {
    const configId = data.slice("byok:enable:".length);
    const meta = await getUserApiConfigMeta(userId, env, configId);
    if (!meta || meta.status !== "valid") {
      const view = await byokListView(language, userId, env);
      await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
      return;
    }
    // Activation does NOT test the connection: a test call would burn the
    // user's own API tokens for nothing (owner decision 2026-11-14). The
    // manual "Test connection" button stays for anyone who wants it; a
    // stale key is caught by the first real chat, which falls back to
    // IVAI models with a one-line notice.
    await setUserApiConfigEnabled(userId, true, env, configId);
    await setActiveUserApiConfig(userId, configId, env);
    const view = await byokManageView(language, userId, env, configId);
    await sendByokActivated(env, { chatId, messageId, userId, language, preset: byokPreset(meta.preset), model: meta.model, name: meta.name, keyboard: view.keyboard });
    return;
  }
  if (data === "byok:stop") {
    // Phase 2: Stop deactivates BYOK, deletes the indicator, and ends with
    // a Ready message — IVAI is ready, chat with IVAI models now (v3.13.1).
    // No pin/self-heal/edit anywhere in this flow.
    await setActiveUserApiConfig(userId, null, env);
    await clearByokIndicator(env, { userId, chatId });
    const text = language === "fa" ? "✅ IVAI آماده‌ست! 🚀\nپیام بفرستید — حالا با مدل‌های IVAI چت می‌کنید." : "✅ IVAI is ready! 🚀\nSend a message — you're chatting with IVAI models now.";
    await sendMessage(env, { chatId, text });
    return;
  }
  if (data === "byok:disable") {
    await setActiveUserApiConfig(userId, null, env);
    await clearByokIndicator(env, { userId, chatId });
    const view = await byokListView(language, userId, env);
    const lead = language === "fa" ? "✓ برگشتیم به مدل‌های IVAI — چت خصوصی دوباره با مدل‌های IVAI جواب می‌دهد." : "✓ Back to IVAI models — private chats answer with IVAI models again.";
    await editRichScreen(env, query.message, { html: `${lead}\n\n${view.text}`, keyboard: view.keyboard, language });
    return;
  }
  if (data.startsWith("byok:remove:yes:")) {
    const configId = data.slice("byok:remove:yes:".length);
    const wasActive = (await getActiveUserApiConfigId(userId, env).catch(() => null)) === configId;
    await deleteUserApiConfig(userId, env, configId);
    if (wasActive) await clearByokIndicator(env, { userId, chatId });
    await clearByokPending(userId, env);
    const view = await byokListView(language, userId, env);
    const lead = language === "fa" ? "✓ API من حذف شد. چت خصوصی دوباره با مدل‌های IVAI جواب می‌دهد." : "✓ My API removed. Private chats answer with IVAI models again.";
    await editRichScreen(env, query.message, { html: `${lead}\n\n${view.text}`, keyboard: view.keyboard, language });
    return;
  }
  if (data.startsWith("byok:remove:")) {
    const configId = data.slice("byok:remove:".length);
    const meta = await getUserApiConfigMeta(userId, env, configId);
    if (!meta) {
      const view = await byokListView(language, userId, env);
      await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
      return;
    }
    await editMessage(env, { chatId, messageId, text: byokRemoveText(language, meta), keyboard: byokRemoveConfirmKeyboard(language, configId) });
    return;
  }
  if (data.startsWith("byok:rename:")) {
    const configId = data.slice("byok:rename:".length);
    const meta = await getUserApiConfigMeta(userId, env, configId);
    if (!meta) {
      const view = await byokListView(language, userId, env);
      await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
      return;
    }
    await setByokPending(userId, { step: "name", configId }, env);
    await editMessage(env, { chatId, messageId, text: byokRenameText(language, meta), keyboard: byokCancelKeyboard(language) });
    return;
  }
  if (data === "menu:settings" || data === "settings:open") {
    const settings = await getUserSettings(userId, env);
    const view = await settingsView(language, settings, env, userId);
    await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
    return;
  }
  if (data === "settings:memory" || data === "settings:memory:on" || data === "settings:memory:off") {
    const settings = await getUserSettings(userId, env);
    // Explicit targets (settings:memory:on/off) apply idempotently; the
    // legacy bare value on already-sent keyboards keeps its toggle meaning.
    const target = data === "settings:memory" ? !settings.memoryEnabled : data === "settings:memory:on";
    await setMemoryEnabled(userId, target, env);
    // The full settings view re-renders (not just the Memory line) so a
    // redelivered toggle cannot leave a half-updated screen behind.
    const view = await settingsView(language, { ...settings, memoryEnabled: target }, env, userId);
    await editRichScreen(env, query.message, { html: view.text, keyboard: view.keyboard, language });
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
    await editRichScreen(env, query.message, { html: languageMenuText(language), keyboard: languageKeyboard(language), language });
    return;
  }

  if (data === "modes:more") {
    await editRichScreen(env, query.message, { html: helpText(language), keyboard: mainKeyboard(language, query.message), language });
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
    await editRichScreen(env, query.message, { html: await menuTextForUser(language, settings, userId, env), keyboard: mainKeyboard(language, query.message), language });
    return;
  }
  if (data.startsWith("lang:page:")) {
    const page = Number(data.slice("lang:page:".length));
    await editRichScreen(env, query.message, { html: languageMenuText(language), keyboard: languageKeyboard(language, Number.isFinite(page) ? page : 0), language });
    return;
  }
  if (data.startsWith("lang:set:") || data === "lang:en" || data === "lang:fa") {
    const selected = data.startsWith("lang:set:") ? data.slice("lang:set:".length) : data.slice(5);
    if (!SUPPORTED_LANGUAGE_CODES.has(selected)) return;
    await setUserLanguage(userId, selected, env);
    const settings = await getUserSettings(userId, env);
    await editRichScreen(env, query.message, { html: await menuTextForUser(selected, { ...settings, language: selected }, userId, env), keyboard: mainKeyboard(selected, query.message), language: selected });
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
    await sendMessage(env, { chatId, text: canBroadcast(role) ? (language === "fa" ? "برای شروع broadcast بفرستید:\n<code>/broadcast پیام شما</code>" : "To start a broadcast, send:\n<code>/broadcast your message</code>") : responseText(language, "noAccess") });
    return;
  }
  if (data === "admin:stats") {
    const role = await getRole(userId, env);
    if (!canManage(role)) {
      await sendMessage(env, { chatId, text: responseText(language, "noAccess") });
      return;
    }
    const stats = await getAdminOperationalStats(env);
    await sendRichScreen(env, {
      chatId,
      html: adminStatsRichText(stats, language),
      plainText: adminStatsText(stats, language),
      rich: query.message.chat?.type === "private"
    });
    return;
  }
  if (data === "admin:guard") {
    const role = await getRole(userId, env);
    if (!canManage(role)) {
      await sendMessage(env, { chatId, text: responseText(language, "noAccess") });
      return;
    }
    await sendMessage(env, { chatId, text: language === "fa" ? "<b>🛡 Guard</b>\nGuard یک بررسی ایمنی اختیاری است که با <code>/guard</code> اجرا می‌شود. یک تماس Llama Guard می‌گیرد و فقط یک حکم برمی‌گرداند — همین. بررسی خودکار در چت‌های معمولی خاموش می‌ماند." : "<b>🛡 Guard</b>\nGuard is an opt-in safety check you run with <code>/guard</code>. It uses one Llama Guard call and returns a verdict — nothing more. Automatic checks stay off in normal chats." });
    return;
  }
  if (data === "admin:policy") {
    const role = await getRole(userId, env);
    if (!canManage(role)) {
      await sendMessage(env, { chatId, text: responseText(language, "noAccess") });
      return;
    }
    await sendRichScreen(env, {
      chatId,
      html: language === "fa" ? "<b>سیاست رایگان IVAI</b>\n\nفقط مدل‌های رایگان — Workers AI، OpenRouter <code>:free</code>، Groq، Google AI Studio.\nهر درخواست = یک تماس مدل. پروایدرها به‌ترتیب جایگزین می‌شوند — هرگز موازی.\nWorkers AI سقف بودجهٔ روزانه دارد.\nBroadcast قبل از ارسال نیازمند پیش‌نویس + تأیید است." : "<b>IVAI Free Policy</b>\n\nFree models only — Workers AI, OpenRouter <code>:free</code>, Groq, Google AI Studio.\nOne request = one model call. Providers fall back in order — never in parallel.\nWorkers AI has a daily budget guard.\nBroadcasts need a draft + confirmation before anything is sent.",
      rich: query.message.chat?.type === "private"
    });
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
  // Edited messages are ignored entirely, in groups and private chats alike
  // (owner decision, v3.7.8): an edit is never a new turn. This also keeps
  // edited channel posts dropped before the comment path below.
  if (update.edited_message) return;
  // Channel posts in the linked group go straight to the comment path
  // regardless of media type.
  if (isGroupChat(message) && isChannelPost(message)) return handleChannelPost(message, env);
  // BYOK setup input is intercepted before processText so a pasted key never
  // reaches the AI or the session.
  if (message.text && message.chat?.type === "private" && await handleByokPendingMessage(message, env)) return;
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

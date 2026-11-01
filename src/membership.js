import { APP, GROUP_POLICY } from "./config.js";
import { telegram } from "./telegram.js";

function isActiveMember(member) {
  if (!member) return false;
  if (["creator", "owner", "administrator", "member"].includes(member.status)) return true;
  return member.status === "restricted" && member.is_member === true;
}

function requiredChannelReferences() {
  const references = [APP.requiredChannelId, `@${APP.requiredChannelUsername}`];
  return [...new Set(references.filter(Boolean))];
}

async function checkRequiredChannelMembershipLive(userId, env) {
  let lastError;
  for (const chatId of requiredChannelReferences()) {
    try {
      const member = await telegram(env, "getChatMember", { chat_id: chatId, user_id: userId });
      // A successful Telegram response is authoritative. Do not fall back after `left` or
      // `kicked`, otherwise a stale or unrelated username could accidentally grant access.
      return {
        allowed: isActiveMember(member),
        status: member?.status || "unknown",
        reason: "CHECKED",
        checkedChannel: String(chatId)
      };
    } catch (error) {
      lastError = error;
    }
  }

  // Access remains fail-closed when neither the canonical numeric ID nor the public username
  // can be verified. This is normally an operational signal that the bot lacks channel admin
  // access or the channel configuration is incorrect; it never grants access on uncertainty.
  console.warn(JSON.stringify({ event: "required_channel_check_failed", userId: String(userId), error: String(lastError?.message || "unknown") }));
  return { allowed: false, reason: "CHECK_FAILED" };
}

export async function getRequiredChannelMembership(userId, env, { fresh = false } = {}) {
  // Local tests intentionally opt out through an explicit environment flag. Production has no
  // such flag and therefore always performs the Telegram membership check.
  if (env.REQUIRED_CHANNEL_ENFORCED === "false") return { allowed: true, reason: "TEST_BYPASS" };
  if (!userId) return { allowed: false, reason: "INVALID_USER" };

  // KV cache keeps group triggers cheap: one live check per user per TTL window.
  // `fresh` skips the cache read (used before any membership prompt is shown, so a
  // member is never warned because of a stale entry) but still refreshes the cache.
  const cacheKey = `member:${userId}`;
  if (!fresh) {
    try {
      const cached = await env.IVAI_KV?.get(cacheKey);
      const parsed = cached ? JSON.parse(cached) : null;
      // A cached CHECK_FAILED is not a definitive result; ignore it and check live.
      if (parsed && parsed.reason !== "CHECK_FAILED") return { ...parsed, fromCache: true };
    } catch { /* Fail open to the live check when the cache is unavailable. */ }
  }

  const result = await checkRequiredChannelMembershipLive(userId, env);
  // CHECK_FAILED is never cached: it is an operational error, not a membership fact.
  if (result.reason !== "CHECK_FAILED") {
    try {
      await env.IVAI_KV?.put(cacheKey, JSON.stringify(result), {
        expirationTtl: result.allowed ? GROUP_POLICY.membershipCacheTtlSeconds : GROUP_POLICY.membershipDeniedCacheTtlSeconds
      });
    } catch { /* Caching is best-effort and never blocks the authoritative result. */ }
  }
  return result;
}

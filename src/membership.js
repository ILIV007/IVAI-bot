import { APP } from "./config.js";
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

export async function getRequiredChannelMembership(userId, env) {
  // Local tests intentionally opt out through an explicit environment flag. Production has no
  // such flag and therefore always performs the Telegram membership check.
  if (env.REQUIRED_CHANNEL_ENFORCED === "false") return { allowed: true, reason: "TEST_BYPASS" };
  if (!userId) return { allowed: false, reason: "INVALID_USER" };

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

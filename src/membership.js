import { APP } from "./config.js";
import { telegram } from "./telegram.js";

function isActiveMember(member) {
  if (!member) return false;
  if (["creator", "owner", "administrator", "member"].includes(member.status)) return true;
  return member.status === "restricted" && member.is_member === true;
}

export async function getRequiredChannelMembership(userId, env) {
  // Local tests intentionally opt out through an explicit environment flag. Production has no
  // such flag and therefore always performs the Telegram membership check.
  if (env.REQUIRED_CHANNEL_ENFORCED === "false") return { allowed: true, reason: "TEST_BYPASS" };
  if (!userId) return { allowed: false, reason: "INVALID_USER" };
  try {
    const member = await telegram(env, "getChatMember", {
      chat_id: APP.requiredChannelId,
      user_id: userId
    });
    return { allowed: isActiveMember(member), status: member?.status || "unknown", reason: "CHECKED" };
  } catch (error) {
    // Access is denied when Telegram cannot reliably confirm membership. The log intentionally
    // excludes user-supplied Telegram data and signed Mini App initData.
    console.warn(JSON.stringify({ event: "required_channel_check_failed", userId: String(userId), error: String(error?.message || "unknown") }));
    return { allowed: false, reason: "CHECK_FAILED" };
  }
}

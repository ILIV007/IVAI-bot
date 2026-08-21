const encoder = new TextEncoder();

function equalHex(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return value === 0;
}

async function hmac(key, data) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data)));
}

function toHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

/**
 * Validates Telegram WebApp initData on the server. Never authorize with
 * initDataUnsafe because it is controlled by the browser environment.
 */
export async function verifyTelegramInitData(initData, botToken, { maxAgeSeconds = 60 * 60, maxFutureSkewSeconds = 60 } = {}) {
  if (!initData || !botToken) return null;
  const values = new URLSearchParams(initData);
  const actualHash = values.get("hash");
  if (!actualHash) return null;
  values.delete("hash");

  const authDate = Number(values.get("auth_date") || 0);
  const nowSeconds = Date.now() / 1000;
  // A valid signature is not sufficient if its auth_date is excessively future-dated.
  // Permit only a short clock-skew window, then enforce the normal one-hour expiry.
  if (!authDate || authDate > nowSeconds + maxFutureSkewSeconds || nowSeconds - authDate > maxAgeSeconds) return null;

  const dataCheckString = [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = await hmac(encoder.encode("WebAppData"), botToken);
  const calculatedHash = toHex(await hmac(secret, dataCheckString));
  if (!equalHex(calculatedHash, actualHash)) return null;

  try {
    const user = JSON.parse(values.get("user") || "null");
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

export async function getVerifiedWebAppUser(request, env) {
  return verifyTelegramInitData(request.headers.get("x-telegram-init-data") || "", env.TELEGRAM_BOT_TOKEN);
}

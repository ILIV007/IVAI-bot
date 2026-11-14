// BYOK ("My API", v3.8.0): user API keys are stored AES-256-GCM encrypted.
// WebCrypto appends the 16-byte auth tag to the ciphertext, so the stored
// value is `iv_hex:ciphertext_hex` with the tag included. The encryption key
// comes only from the BYOK_ENCRYPTION_KEY Worker secret (base64, 32 bytes);
// it is never committed, logged, or returned by any route. When the secret
// is unset or a stored value cannot be decrypted, callers fail soft to the
// free chain instead of failing the turn.

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error("Stored API key is malformed");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

async function importEncryptionKey(env) {
  const raw = String(env?.BYOK_ENCRYPTION_KEY || "").trim();
  if (!raw) throw new Error("BYOK encryption is not configured");
  let bytes;
  try {
    bytes = Uint8Array.from(atob(raw), (char) => char.charCodeAt(0));
  } catch {
    throw new Error("BYOK encryption key is invalid");
  }
  if (bytes.length !== 32) throw new Error("BYOK encryption key must be 32 bytes");
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptApiKey(plaintext, env) {
  const key = await importEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(String(plaintext))
  ));
  return `${bytesToHex(iv)}:${bytesToHex(cipher)}`;
}

export async function decryptApiKey(stored, env) {
  const [ivHex, cipherHex] = String(stored || "").split(":");
  if (!ivHex || !cipherHex) throw new Error("Stored API key is malformed");
  const key = await importEncryptionKey(env);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBytes(ivHex) },
    key,
    hexToBytes(cipherHex)
  );
  return new TextDecoder().decode(plain);
}

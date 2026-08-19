import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { MODES, modeOutputLimit } from "../src/config.js";
import { hasValidWebhookSecret, parseAdminIds } from "../src/security.js";
import { feedbackKeyboard, responseMeta, shortModelLabel, splitText } from "../src/telegram.js";

class KV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async put(key, value) { this.values.set(key, value); }
}

function baseEnv() {
  return {
    TELEGRAM_WEBHOOK_SECRET: "valid-secret",
    TELEGRAM_BOT_TOKEN: "test-token",
    ADMIN_TELEGRAM_IDS: "126679582, 99",
    IVAI_KV: new KV()
  };
}

test("rejects a webhook request without the secret header", async () => {
  const response = await worker.fetch(new Request("https://worker.test/", { method: "POST", body: "{}" }), baseEnv());
  assert.equal(response.status, 401);
});

test("accepts an exact webhook secret and rejects length variants", () => {
  const env = baseEnv();
  assert.equal(hasValidWebhookSecret(new Request("https://worker.test/", { headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" } }), env), true);
  assert.equal(hasValidWebhookSecret(new Request("https://worker.test/", { headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret-x" } }), env), false);
});

test("parses only numeric owner identifiers", () => {
  assert.deepEqual([...parseAdminIds(baseEnv())], ["126679582", "99"]);
});

test("splits long Telegram output without dropping content", () => {
  const source = "A ".repeat(5000);
  const parts = splitText(source, 1000);
  assert.ok(parts.length > 1);
  assert.equal(parts.join(" ").replaceAll(/\s+/g, " ").trim(), source.trim());
  assert.ok(parts.every((part) => part.length <= 1000));
});

test("keeps bounded free-tier output limits", () => {
  assert.ok(modeOutputLimit(MODES.FAST) < modeOutputLimit(MODES.DEEP));
  assert.ok(modeOutputLimit(MODES.CODE) <= 1800);
});

test("renders concise linked response metadata without per-message action buttons", () => {
  assert.equal(feedbackKeyboard(), undefined);
  assert.equal(shortModelLabel("@cf/meta/llama-4-scout-17b-16e-instruct"), "Llama 4 Scout");
  assert.equal(shortModelLabel("openai/gpt-oss-20b:free"), "GPT-OSS 20B");
  const meta = responseMeta({ model: "@cf/zai-org/glm-4.7-flash", mode: "deep" });
  assert.match(meta, /https:\/\/t\.me\/IVAI_Llm_bot/);
  assert.match(meta, /GLM 4\.7 Flash/);
  assert.doesNotMatch(meta, /@cf\/zai-org/);
});

test("handles a valid start update and sends Telegram output", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), { status: 200 });
  };
  try {
    const update = {
      update_id: 1,
      message: {
        message_id: 11,
        chat: { id: 42, type: "private" },
        from: { id: 126679582, first_name: "Owner" },
        text: "/start"
      }
    };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), baseEnv());
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /sendMessage$/);
    assert.match(calls[0].body.text, /IVAI/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("serves an English-first responsive admin page", async () => {
  const response = await worker.fetch(new Request("https://worker.test/admin"), baseEnv());
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /lang="en"/);
  assert.match(html, /Secure, free-tier operations/);
});

test("rejects an admin API request without validated Telegram Mini App data", async () => {
  const response = await worker.fetch(new Request("https://worker.test/admin/session", { method: "POST", body: "{}" }), baseEnv());
  assert.equal(response.status, 401);
});

test("answers an empty inline query without invoking an AI provider", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  try {
    const update = { update_id: 901, inline_query: { id: "inline-1", from: { id: 126679582, language_code: "en" }, query: "" } };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), baseEnv());
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /answerInlineQuery$/);
    assert.equal(calls[0].body.results[0].id, "ivai-help");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses one Workers AI call and edits a progress message into the final answer", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    const method = String(url).split("/").at(-1);
    const result = method === "sendMessage" ? { message_id: 222 } : method === "editMessageText" ? { message_id: 222 } : true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  };
  try {
    const env = { ...baseEnv(), AI: { async run() { return { response: "A concise answer." }; } } };
    const update = {
      update_id: 902,
      message: { message_id: 12, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "Explain this briefly" }
    };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), env);
    assert.equal(response.status, 200);
    assert.equal(calls.filter((call) => /sendChatAction$/.test(call.url)).length, 1);
    assert.equal(calls.filter((call) => /sendMessage$/.test(call.url)).length, 1);
    assert.equal(calls.filter((call) => /editMessageText$/.test(call.url)).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

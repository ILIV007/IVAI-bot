import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { generateReply } from "../src/ai.js";
import { APP, MODES, modeOutputLimit } from "../src/config.js";
import { allowUsage, claimUpdate, hasValidWebhookSecret, parseAdminIds, reserveWorkersAiBudget } from "../src/security.js";
import { extendedModeKeyboard, feedbackKeyboard, modeKeyboard, modeLabel, responseMeta, shortModelLabel, splitText } from "../src/telegram.js";

class KV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async put(key, value) { this.values.set(key, value); }
}

class GuardD1 {
  constructor() {
    this.updates = new Set();
    this.counters = new Map();
  }

  prepare(sql) {
    return {
      bind: (...params) => ({
        run: async () => {
          if (!sql.includes("processed_updates")) return { meta: { changes: 0 } };
          const id = String(params[0]);
          if (this.updates.has(id)) return { meta: { changes: 0 } };
          this.updates.add(id);
          return { meta: { changes: 1 } };
        },
        first: async () => {
          if (!sql.includes("runtime_counters")) return null;
          const [scope, id, bucket, units, _expiresAt, limit] = params;
          const key = `${scope}:${id}:${bucket}`;
          const next = Number(this.counters.get(key) || 0) + Number(units);
          if (next > Number(limit)) return null;
          this.counters.set(key, next);
          return { value: next };
        }
      })
    };
  }
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

test("uses D1 atomic guards for dedupe and quotas when available", async () => {
  const env = { ...baseEnv(), IVAI_DB: new GuardD1() };
  assert.equal(await claimUpdate(1001, env), true);
  assert.equal(await claimUpdate(1001, env), false);
  assert.equal((await allowUsage({ scope: "text", id: 42, limit: 2 }, env)).allowed, true);
  assert.equal((await allowUsage({ scope: "text", id: 42, limit: 2 }, env)).remaining, 0);
  assert.equal((await allowUsage({ scope: "text", id: 42, limit: 2 }, env)).allowed, false);
  assert.equal((await reserveWorkersAiBudget(9000, env)).allowed, true);
  assert.equal((await reserveWorkersAiBudget(1, env)).allowed, false);
});

test("runs Guard Mode through Llama Guard with exactly one classifier call", async () => {
  const calls = [];
  const env = {
    ...baseEnv(),
    AI: {
      async run(model, input) {
        calls.push({ model, input });
        return { response: "unsafe\nS1" };
      }
    }
  };
  const result = await generateReply({ text: "Classify this message", selectedMode: MODES.GUARD, language: "en", context: [] }, env);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "@cf/meta/llama-guard-3-8b");
  assert.equal(result.mode, MODES.GUARD);
  assert.match(result.text, /caution required/i);
  assert.doesNotMatch(result.text, /Llama 4 Scout|GLM/i);
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

test("declares the official v3.3 release version", () => {
  assert.equal(APP.version, "3.3.0");
});

test("keeps bounded free-tier output limits", () => {
  assert.ok(modeOutputLimit(MODES.FAST) < modeOutputLimit(MODES.DEEP));
  assert.ok(modeOutputLimit(MODES.CODE) <= 1800);
  assert.ok(modeOutputLimit(MODES.THREAD) <= 900);
});

test("exposes focused modes through a compact secondary menu", () => {
  const core = modeKeyboard("en").inline_keyboard.flat();
  const focused = extendedModeKeyboard("en").inline_keyboard.flat();
  assert.ok(core.some((button) => button.callback_data === "modes:more"));
  assert.ok(focused.some((button) => button.callback_data === "mode:thread"));
  assert.equal(modeLabel(MODES.THREAD, "en"), "Thread");
  assert.equal(modeLabel(MODES.SECRETARY, "fa"), "منشی");
});

test("renders concise linked response metadata without per-message action buttons", () => {
  assert.equal(feedbackKeyboard(), undefined);
  assert.equal(shortModelLabel("@cf/meta/llama-4-scout-17b-16e-instruct"), "Llama 4 Scout");
  assert.equal(shortModelLabel("openai/gpt-oss-20b:free"), "GPT-OSS 20B");
  const meta = responseMeta({ model: "@cf/zai-org/glm-4.7-flash", mode: "deep" });
  assert.match(meta, /https:\/\/t\.me\/IVAI_Llm_bot/);
  assert.match(meta, />IVAI<\/a>/);
  assert.doesNotMatch(meta, />@IVAI_Llm_bot<\/a>/);
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

test("shows a read-only operations summary to an authorized admin", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 89 } }), { status: 200 });
  };
  try {
    const update = {
      update_id: 700,
      callback_query: {
        id: "stats-callback",
        from: { id: 126679582, first_name: "Owner" },
        data: "admin:stats",
        message: { message_id: 10, chat: { id: 42, type: "private" } }
      }
    };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), baseEnv());
    assert.equal(response.status, 200);
    const summary = calls.find((call) => /sendMessage$/.test(call.url));
    assert.match(summary.body.text, /IVAI Operations/);
    assert.match(summary.body.text, /Workers AI daily budget remaining/);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("delivers a long AI response in complete follow-up messages instead of truncating the progress edit", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    const method = String(url).split("/").at(-1);
    const result = method === "sendMessage" ? { message_id: 300 + calls.length } : method === "editMessageText" ? { message_id: 300 } : true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  };
  try {
    const env = { ...baseEnv(), AI: { async run() { return { response: "L".repeat(4_300) }; } } };
    const update = {
      update_id: 903,
      message: { message_id: 13, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "Give me a very long answer" }
    };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), env);
    assert.equal(response.status, 200);
    const edit = calls.find((call) => /editMessageText$/.test(call.url));
    assert.match(edit.body.text, /full response is sent below/i);
    const delivered = calls.filter((call) => /sendMessage$/.test(call.url) && !/thinking/.test(call.body.text));
    assert.ok(delivered.length >= 2);
    assert.ok(delivered.some((call) => !Object.hasOwn(call.body, "parse_mode")));
    assert.ok(delivered.every((call) => call.body.text.length <= 4096));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects unsupported admin API methods instead of returning the public health response", async () => {
  const response = await worker.fetch(new Request("https://worker.test/admin/session"), baseEnv());
  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { ok: false, error: "method_not_allowed" });
});

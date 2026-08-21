import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import worker from "../src/index.js";
import { generateReply } from "../src/ai.js";
import { processSecretaryReminderBatch } from "../src/secretary.js";
import { processReengagementBatch } from "../src/reengagement.js";
import { analyzePhoto, downloadTelegramFile, transcribeVoice } from "../src/media.js";
import { APP, defaultFreeModelFor, FREE_MODEL_POLICY, LANGUAGE_OPTIONS, MODES, modeOutputLimit } from "../src/config.js";
import { defaultFreeModels, refreshFreeModelCatalog } from "../src/catalog.js";
import { ensureConversationSession, getAdminOperationalStats, getConversationSession, getUserSettings, saveConversationSession, setMemoryEnabled, setSelectedModel, setUserLanguage, setUserMode, startNewConversationSession, upsertUser } from "../src/storage.js";
import { getRequiredChannelMembership } from "../src/membership.js";
import { allowUsage, claimUpdate, hasValidWebhookSecret, parseAdminIds, reserveWorkersAiBudget } from "../src/security.js";
import { feedbackKeyboard, languageKeyboard, languageMenuText, menuText, modeKeyboard, modeLabel, modelPickerKeyboard, modelPickerText, modelSelectionText, requiredMembershipKeyboard, responseMeta, shortModelLabel, splitText, startKeyboard, terminalKeyboard, thinkingText, welcomeText } from "../src/telegram.js";

class KV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async put(key, value) { this.values.set(key, value); }
  async delete(key) { this.values.delete(key); }
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

class ReminderD1 {
  constructor() {
    this.tasks = [{ id: "task-1", userId: "7", chatId: "42", title: "Review the launch", dueAt: "2026-08-20T00:00:00.000Z", attempts: 0, status: "open", reminderStatus: "pending", lease: null }];
  }

  prepare(sql) {
    return {
      bind: (...params) => ({
        all: async () => {
          if (!sql.includes("FROM tasks")) return { results: [] };
          return { results: this.tasks.filter((task) => task.status === "open" && ["pending", "retry", "sending"].includes(task.reminderStatus)).map((task) => ({ id: task.id, userId: task.userId, chatId: task.chatId, title: task.title, dueAt: task.dueAt, attempts: task.attempts })) };
        },
        run: async () => {
          const task = this.tasks.find((entry) => entry.id === params.at(-1) || entry.id === params.at(-2));
          if (sql.includes("reminder_status='sending'")) {
            const id = params[1];
            const row = this.tasks.find((entry) => entry.id === id);
            if (!row || row.reminderStatus !== "pending") return { meta: { changes: 0 } };
            row.reminderStatus = "sending"; row.attempts += 1; row.lease = params[0];
            return { meta: { changes: 1 } };
          }
          if (sql.includes("reminder_status='sent'")) {
            const row = this.tasks.find((entry) => entry.id === params[1]);
            if (row) { row.reminderStatus = "sent"; row.lease = null; }
            return { meta: { changes: row ? 1 : 0 } };
          }
          if (sql.includes("reminder_status=?")) {
            const row = this.tasks.find((entry) => entry.id === params[2]);
            if (row) { row.reminderStatus = params[0]; row.lease = null; }
            return { meta: { changes: row ? 1 : 0 } };
          }
          return { meta: { changes: task ? 1 : 0 } };
        }
      })
    };
  }
}

class ReengagementD1 {
  constructor() {
    this.rows = [{ userId: "501", language: "es", state: "idle", leaseUntil: null }];
  }

  prepare(sql) {
    return {
      bind: (...params) => ({
        all: async () => sql.includes("LEFT JOIN user_reengagement")
          ? { results: this.rows.filter((row) => row.state === "idle").map((row) => ({ userId: row.userId, language: row.language })) }
          : { results: [] },
        run: async () => {
          if (sql.includes("INSERT INTO user_reengagement")) {
            const row = this.rows.find((entry) => entry.userId === String(params[0]));
            if (!row || row.state !== "idle") return { meta: { changes: 0 } };
            row.state = "sending"; row.leaseUntil = params[2];
            return { meta: { changes: 1 } };
          }
          if (sql.includes("delivery_state='sent'")) {
            const row = this.rows.find((entry) => entry.userId === String(params[0]));
            if (row) { row.state = "sent"; row.leaseUntil = null; }
            return { meta: { changes: row ? 1 : 0 } };
          }
          return { meta: { changes: 0 } };
        },
        first: async () => {
          if (!sql.includes("SELECT delivery_state")) return null;
          const row = this.rows.find((entry) => entry.userId === String(params[0]));
          return row ? { state: row.state, leaseUntil: row.leaseUntil } : null;
        }
      })
    };
  }
}

function baseEnv() {
  return {
    TELEGRAM_WEBHOOK_SECRET: "valid-secret",
    TELEGRAM_BOT_TOKEN: "test-token",
    REQUIRED_CHANNEL_ENFORCED: "false",
    ADMIN_TELEGRAM_IDS: "126679582, 99",
    IVAI_KV: new KV()
  };
}

function signedWebAppInitData(user = { id: 126679582, first_name: "Owner", language_code: "en" }) {
  const values = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user) });
  const dataCheckString = [...values.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update("test-token").digest();
  values.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));
  return values.toString();
}

test("rejects a webhook request without the secret header", async () => {
  const response = await worker.fetch(new Request("https://worker.test/", { method: "POST", body: "{}" }), baseEnv());
  assert.equal(response.status, 401);
});

test("returns a retryable status and releases an update claim after webhook processing fails", async () => {
  const originalFetch = globalThis.fetch;
  const kv = new KV();
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, description: "temporary Telegram failure" }), { status: 502 });
  try {
    const update = {
      update_id: 4,
      message: { message_id: 14, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "/start" }
    };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), { ...baseEnv(), IVAI_KV: kv });
    assert.equal(response.status, 500);
    assert.equal(await kv.get("dedupe:update:4"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses D1 atomic guards for dedupe and quotas when available", async () => {
  const env = { ...baseEnv(), IVAI_DB: new GuardD1() };
  assert.equal(await claimUpdate(1001, env), true);
  assert.equal(await claimUpdate(1001, env), false);
  assert.equal((await allowUsage({ scope: "text", id: 42, limit: 2 }, env)).allowed, true);
  assert.equal((await allowUsage({ scope: "text", id: 42, limit: 2 }, env)).remaining, 0);
  assert.equal((await allowUsage({ scope: "text", id: 42, limit: 2 }, env)).allowed, false);
  assert.equal((await reserveWorkersAiBudget(APP.systemDailyWorkersAiBudget, env)).allowed, true);
  assert.equal((await reserveWorkersAiBudget(1, env)).allowed, false);
});

test("keeps Worker AI below the published free allocation and excludes paid-only models", () => {
  assert.equal(APP.systemDailyWorkersAiBudget, 8000);
  assert.ok(APP.systemDailyWorkersAiBudget < 10_000);
  assert.ok(!FREE_MODEL_POLICY.workersAi.text.includes("@cf/zai-org/glm-5.2"));
  assert.ok(!FREE_MODEL_POLICY.groq.includes("llama-3.1-8b-instant"));
  assert.equal(defaultFreeModelFor("workers-ai", MODES.FAST), "@cf/zai-org/glm-4.7-flash");
  assert.equal(defaultFreeModelFor("groq", MODES.DEEP), "openai/gpt-oss-120b");
  assert.equal(defaultFreeModelFor("google", MODES.FAST), "gemini-3.5-flash");
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

test("declares the official v3.3.20 release version", () => {
  assert.equal(APP.version, "3.3.20");
});

test("upserts a language choice even when no user row exists yet", async () => {
  let call;
  const env = {
    IVAI_DB: {
      prepare(sql) {
        return {
          bind(...params) {
            call = { sql, params };
            return { run: async () => ({ meta: { changes: 1 } }) };
          }
        };
      }
    }
  };
  await setUserLanguage(77, "fa", env);
  assert.match(call.sql, /INSERT INTO users/);
  assert.match(call.sql, /ON CONFLICT\(telegram_user_id\) DO UPDATE SET language/);
  assert.deepEqual(call.params, ["77", "fa"]);
});

test("keeps bounded free-tier output limits", () => {
  assert.ok(modeOutputLimit(MODES.FAST) < modeOutputLimit(MODES.DEEP));
  assert.ok(modeOutputLimit(MODES.CODE) <= 1800);
  assert.ok(modeOutputLimit(MODES.THREAD) <= 900);
});

test("presents the requested Start controls and five-row Menu hierarchy", () => {
  const menu = modeKeyboard("en", { includeTerminal: true }).inline_keyboard;
  assert.deepEqual(menu[0].map((button) => button.callback_data), ["mode:auto"]);
  assert.equal(menu[0][0].style, "primary");
  assert.deepEqual(menu[1].map((button) => button.callback_data), ["mode:fast", "mode:deep", "mode:code"]);
  assert.ok(menu[1].every((button) => button.style === "primary"));
  assert.equal(menu[2][0].web_app.url, APP.terminalAppUrl);
  assert.equal(menu[2][0].style, "success");
  assert.equal(menu[3][0].callback_data, "menu:models");
  assert.equal(menu[3][0].style, "danger");
  assert.deepEqual(menu[4].map((button) => button.callback_data), ["menu:help", "menu:settings", "menu:language"]);

  const start = startKeyboard("en", { includeTerminal: true }).inline_keyboard;
  assert.equal(start.length, 1);
  assert.equal(start[0][0].callback_data, "menu:main");
  assert.equal(start[0][0].style, "primary");
  assert.equal(start[0][1].web_app.url, APP.terminalAppUrl);
  assert.equal(start[0][1].style, "success");
  assert.equal(start[0][2].callback_data, "menu:language");
  assert.equal(start[0][2].style, "danger");

  const pickerModels = [
    { id: "@cf/zai-org/glm-4.7-flash", name: "GLM 4.7 Flash", provider: "workers-ai", category: "fast", contextLength: 131072 },
    { id: "google/gemma:free", name: "Gemma Free", provider: "openrouter", category: "deep" },
    { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", provider: "groq", category: "code" },
    { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash", provider: "google", category: "deep" }
  ];
  const picker = modelPickerKeyboard(pickerModels, { selectedModel: "@cf/zai-org/glm-4.7-flash" }).inline_keyboard.flat();
  assert.ok(picker.some((button) => button.callback_data === "model:view:workers-ai" && button.text.startsWith("🟣") && button.style === "primary"));
  assert.ok(picker.some((button) => button.callback_data === "model:view:openrouter" && button.text.startsWith("🔵") && button.style === "primary"));
  assert.ok(picker.some((button) => button.callback_data === "model:view:groq" && button.text.startsWith("🟠") && button.style === "primary"));
  assert.ok(picker.some((button) => button.callback_data === "model:view:google" && button.text.startsWith("🟢") && button.style === "primary"));
  for (const scope of ["all", "fast", "deep", "code"]) {
    assert.ok(picker.some((button) => button.callback_data === `model:view:${scope}` && button.style === "danger"));
  }
  assert.ok(picker.some((button) => button.callback_data === "model:pick:0:all:0" && button.style === "success"));
  assert.ok(picker.some((button) => button.callback_data === "model:auto:all" && button.style === "primary"));
  const providerFiltered = modelPickerKeyboard(pickerModels, { scope: "google" }).inline_keyboard.flat();
  assert.ok(providerFiltered.some((button) => button.callback_data === "model:pick:0:google:0" && /Gemini/.test(button.text)));
  assert.match(modelPickerText(pickerModels, { selectedModel: "@cf/zai-org/glm-4.7-flash", language: "en" }), /Cloudflare/);
  assert.match(modelSelectionText(pickerModels[0], "en"), /Provider:/);
  assert.equal(thinkingText("en", 0), "<i>IVAI is thinking.</i>");
  assert.equal(thinkingText("en", 2), "<i>IVAI is thinking...</i>");
  assert.equal(modeLabel(MODES.DEEP, "en"), "Deep");
  assert.equal(terminalKeyboard("en").inline_keyboard[0][0].web_app.url, APP.terminalAppUrl);
  assert.equal(requiredMembershipKeyboard("en").inline_keyboard[0][0].url, "https://t.me/ILIVIR3");
  assert.equal(requiredMembershipKeyboard("en").inline_keyboard[0][1].callback_data, "membership:check");
});

test("renders focused Start copy and a descriptive Menu with live settings and language flags", () => {
  assert.match(welcomeText("en"), /Auto, Fast, Deep and Code replies/);
  assert.doesNotMatch(welcomeText("en"), /Free-only routes|one AI call per request|Send a message to begin/);
  const menu = menuText("en", { mode: MODES.DEEP, selectedModel: "@cf/zai-org/glm-4.7-flash", memoryEnabled: true });
  assert.match(menu, /Response mode:<\/b> <code>Deep<\/code>/);
  assert.match(menu, /Model:<\/b> <code>GLM 4\.7 Flash<\/code>/);
  assert.match(menu, /Memory:<\/b> <code>On<\/code>/);
  assert.match(menu, /Control guide/);
  assert.match(menu, /Code<\/b> for programming work/);
  assert.doesNotMatch(menu, /Color guide/);
  const languages = languageKeyboard("en").inline_keyboard.flat().map((button) => button.text).join(" ");
  assert.match(languages, /🇬🇧 English/);
  assert.match(languages, /🇮🇷 فارسی/);
  assert.match(languageMenuText("fa"), /🇮🇷 فارسی/);
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
    const menuButton = calls.find((call) => /setChatMenuButton$/.test(call.url));
    assert.deepEqual(menuButton.body.menu_button, { type: "web_app", text: "IVAI", web_app: { url: APP.terminalAppUrl } });
    const reply = calls.find((call) => /sendMessage$/.test(call.url));
    assert.match(reply.body.text, /a free AI assistant for chat, analysis, writing and code/);
    const startRow = reply.body.reply_markup.inline_keyboard[0];
    assert.equal(startRow[0].callback_data, "menu:main");
    assert.equal(startRow[1].web_app.url, APP.terminalAppUrl);
    assert.equal(startRow[2].callback_data, "menu:language");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falls back to the canonical channel username only when numeric membership lookup fails", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.chat_id === APP.requiredChannelId) return new Response(JSON.stringify({ ok: false, description: "Bad Request: chat not found" }), { status: 400 });
    return new Response(JSON.stringify({ ok: true, result: { status: "member" } }), { status: 200 });
  };
  try {
    const membership = await getRequiredChannelMembership(77, { ...baseEnv(), REQUIRED_CHANNEL_ENFORCED: "true" });
    assert.equal(membership.allowed, true);
    assert.equal(membership.checkedChannel, "@ILIVIR3");
    assert.deepEqual(calls.map((call) => call.chat_id), [APP.requiredChannelId, "@ILIVIR3"]);
  } finally { globalThis.fetch = originalFetch; }
});

test("blocks a non-member before bot commands and presents the correct join flow", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    if (String(url).endsWith("/getChatMember")) return new Response(JSON.stringify({ ok: true, result: { status: "left" } }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 78 } }), { status: 200 });
  };
  try {
    const update = { update_id: 210, message: { message_id: 21, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "/start" } };
    const response = await worker.fetch(new Request("https://worker.test/", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" }, body: JSON.stringify(update) }), { ...baseEnv(), REQUIRED_CHANNEL_ENFORCED: "true" });
    assert.equal(response.status, 200);
    assert.match(calls[0].url, /getChatMember$/);
    assert.equal(calls[0].body.chat_id, APP.requiredChannelId);
    assert.match(calls[1].body.text, /Membership in @ILIVIR3 is required/);
    assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].url, APP.requiredChannelUrl);
  } finally { globalThis.fetch = originalFetch; }
});

test("keeps the join prompt intact and shows a useful alert when Telegram cannot verify membership", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const call = { url: String(url), body: JSON.parse(init.body) };
    calls.push(call);
    if (/getChatMember$/.test(call.url)) return new Response(JSON.stringify({ ok: false, description: "Bad Request: bot is not an administrator" }), { status: 400 });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  try {
    const update = { update_id: 212, callback_query: { id: "membership-failed", from: { id: 126679582, first_name: "Member" }, data: "membership:check", message: { message_id: 23, chat: { id: 44, type: "private" }, from: { id: 8285612628, is_bot: true } } } };
    const response = await worker.fetch(new Request("https://worker.test/", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" }, body: JSON.stringify(update) }), { ...baseEnv(), REQUIRED_CHANNEL_ENFORCED: "true" });
    assert.equal(response.status, 200);
    assert.equal(calls.filter((call) => /getChatMember$/.test(call.url)).length, 2);
    const alert = calls.find((call) => /answerCallbackQuery$/.test(call.url));
    assert.equal(alert.body.show_alert, true);
    assert.match(alert.body.text, /administrator of @ILIVIR3/);
    assert.equal(calls.some((call) => /editMessageText$/.test(call.url)), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("confirms membership after a verified callback without showing the join prompt again", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const call = { url: String(url), body: JSON.parse(init.body) };
    calls.push(call);
    if (/getChatMember$/.test(call.url)) return new Response(JSON.stringify({ ok: true, result: { status: "member" } }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  try {
    const update = { update_id: 213, callback_query: { id: "membership-ok", from: { id: 126679582, first_name: "Member" }, data: "membership:check", message: { message_id: 24, chat: { id: 45, type: "private" }, from: { id: 8285612628, is_bot: true } } } };
    const response = await worker.fetch(new Request("https://worker.test/", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" }, body: JSON.stringify(update) }), { ...baseEnv(), REQUIRED_CHANNEL_ENFORCED: "true" });
    assert.equal(response.status, 200);
    const edit = calls.find((call) => /editMessageText$/.test(call.url));
    assert.match(edit.body.text, /Membership confirmed/);
    assert.doesNotMatch(edit.body.text, /Join @ILIVIR3/);
  } finally { globalThis.fetch = originalFetch; }
});

test("lets a confirmed channel member enter without any join prompt", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    if (String(url).endsWith("/getChatMember")) return new Response(JSON.stringify({ ok: true, result: { status: "member" } }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 79 } }), { status: 200 });
  };
  try {
    const update = { update_id: 211, message: { message_id: 22, chat: { id: 43, type: "private" }, from: { id: 126679582, first_name: "Member" }, text: "/start" } };
    const response = await worker.fetch(new Request("https://worker.test/", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" }, body: JSON.stringify(update) }), { ...baseEnv(), REQUIRED_CHANNEL_ENFORCED: "true" });
    assert.equal(response.status, 200);
    assert.match(calls[0].url, /getChatMember$/);
    const reply = calls.find((call) => /sendMessage$/.test(call.url));
    assert.match(reply.body.text, /a free AI assistant for chat, analysis, writing and code/);
    assert.doesNotMatch(reply.body.text, /Membership in @ILIVIR3 is required/);
    assert.equal(reply.body.reply_markup.inline_keyboard[0][0].callback_data, "menu:main");
    assert.equal(reply.body.reply_markup.inline_keyboard[0][1].web_app.url, APP.terminalAppUrl);
    assert.equal(reply.body.reply_markup.inline_keyboard[0][2].callback_data, "menu:language");
  } finally { globalThis.fetch = originalFetch; }
});

test("keeps /menu separate from the welcome flow", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 78 } }), { status: 200 });
  };
  try {
    const update = {
      update_id: 22,
      message: { message_id: 22, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "/menu" }
    };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), baseEnv());
    assert.equal(response.status, 200);
    const reply = calls.find((call) => /sendMessage$/.test(call.url));
    assert.match(reply.body.text, /IVAI menu/);
    assert.equal(reply.body.reply_markup.inline_keyboard[0][0].callback_data, "mode:auto");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("clears Terminal memory together with the current conversation", async () => {
  const originalFetch = globalThis.fetch;
  const kv = new KV();
  await kv.put("guest:42:126679582:main:root", JSON.stringify([{ role: "user", content: "private chat" }]));
  await kv.put("guest:126679582:126679582:terminal:root", JSON.stringify([{ role: "user", content: "terminal" }]));
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { message_id: 79 } }), { status: 200 });
  try {
    const update = {
      update_id: 3,
      message: { message_id: 13, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "/memory clear" }
    };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), { ...baseEnv(), IVAI_KV: kv });
    assert.equal(response.status, 200);
    assert.equal(await kv.get("guest:42:126679582:main:root"), null);
    assert.equal(await kv.get("guest:126679582:126679582:terminal:root"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports the same conservative Workers AI budget enforced at runtime", async () => {
  const first = async () => ({ count: 0 });
  const env = {
    IVAI_DB: {
      prepare(sql) {
        const counter = async () => sql.includes("runtime_counters") ? { value: APP.systemDailyWorkersAiBudget - 1 } : { count: 0 };
        return { first: counter, bind: () => ({ first: counter }) };
      }
    }
  };
  const stats = await getAdminOperationalStats(env);
  assert.equal(stats.workersAiBudgetRemaining, 1);
});

test("opens IVAI Terminal through a private-chat Web App button without invoking AI", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 78 } }), { status: 200 });
  };
  try {
    const update = {
      update_id: 2,
      message: { message_id: 12, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "/terminal" }
    };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), baseEnv());
    assert.equal(response.status, 200);
    assert.ok(calls.some((call) => /setChatMenuButton$/.test(call.url)));
    const reply = calls.find((call) => /sendMessage$/.test(call.url));
    assert.equal(reply.body.reply_markup.inline_keyboard[0][0].web_app.url, APP.terminalAppUrl);
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

test("serves a lightweight IVAI Terminal shell with strict same-origin security headers", async () => {
  const response = await worker.fetch(new Request("https://worker.test/app"), baseEnv());
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /IVAI \/\/ TERMINAL/);
  assert.match(html, /--navy:#07192f/);
  assert.match(html, /--jade:#16b89b/);
  assert.match(html, /function renderRich\(target,value\)/);
  assert.match(html, /languageChip/);
  assert.match(html, /document\.createElement\('blockquote'\)/);
  assert.match(html, /RECONNECT/);
  assert.match(html, /AbortController/);
  assert.match(html, /Open IVAI Terminal from inside Telegram/);
  assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("emits parseable Terminal bootstrap JavaScript after template rendering", async () => {
  const response = await worker.fetch(new Request("https://worker.test/app"), baseEnv());
  const html = await response.text();
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  const bootstrap = scripts.at(-1);
  assert.ok(bootstrap);
  assert.doesNotThrow(() => new Function(bootstrap));
  assert.match(bootstrap, /function shortModel\(value\)/);
  assert.match(bootstrap, /function renderRich\(target,value\)/);
});

test("rejects unauthenticated Terminal API requests", async () => {
  const response = await worker.fetch(new Request("https://worker.test/app/session", { method: "POST", body: "{}" }), baseEnv());
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "UNAUTHORIZED");
});

test("denies an authenticated Terminal session to a user outside the required channel", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /getChatMember$/);
    assert.equal(JSON.parse(init.body).chat_id, APP.requiredChannelId);
    return new Response(JSON.stringify({ ok: true, result: { status: "left" } }), { status: 200 });
  };
  try {
    const response = await worker.fetch(new Request("https://worker.test/app/session", { method: "POST", headers: { "x-telegram-init-data": signedWebAppInitData() }, body: "{}" }), { ...baseEnv(), REQUIRED_CHANNEL_ENFORCED: "true" });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "CHANNEL_REQUIRED");
  } finally { globalThis.fetch = originalFetch; }
});

test("runs exactly one free AI path for an authenticated Terminal chat turn", async () => {
  const calls = [];
  const env = { ...baseEnv(), AI: { async run(model, payload) { calls.push({ model, payload }); return { response: "Terminal reply." }; } } };
  const response = await worker.fetch(new Request("https://worker.test/app/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": signedWebAppInitData() },
    body: JSON.stringify({ text: "Explain KV briefly" })
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.text, "Terminal reply.");
  assert.equal(body.mode, "deep");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "@cf/google/gemma-4-26b-a4b-it");
});

test("rejects invalid Terminal prompts before calling an AI provider", async () => {
  let calls = 0;
  const env = { ...baseEnv(), AI: { async run() { calls += 1; return { response: "unused" }; } } };
  const response = await worker.fetch(new Request("https://worker.test/app/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": signedWebAppInitData() },
    body: JSON.stringify({ text: "   " })
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "INVALID_INPUT");
  assert.equal(calls, 0);
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

test("uses one Workers AI call and completes a Rich Draft with a final rich message", async () => {
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
    assert.equal(calls.filter((call) => /sendRichMessageDraft$/.test(call.url)).length, 1);
    assert.equal(calls.filter((call) => /sendRichMessage$/.test(call.url)).length, 1);
    assert.equal(calls.filter((call) => /sendMessage$/.test(call.url)).length, 0);
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
    assert.equal(calls.filter((call) => /sendRichMessageDraft$/.test(call.url)).length, 1);
    assert.equal(calls.filter((call) => /editMessageText$/.test(call.url)).length, 0);
    const delivered = calls.filter((call) => /sendMessage$/.test(call.url) && !/thinking/.test(call.body.text));
    assert.ok(delivered.length >= 2);
    assert.ok(delivered.every((call) => call.body.parse_mode === "HTML"));
    assert.ok(delivered.at(-1).body.text.includes('<blockquote>🪐 <a href="https://t.me/IVAI_Llm_bot">IVAI</a>'));
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

test("accepts only verified zero-price OpenRouter models in a refreshed catalog", async () => {
  const originalFetch = globalThis.fetch;
  const env = baseEnv();
  globalThis.fetch = async (url) => {
    assert.match(String(url), /max_price=0/);
    return new Response(JSON.stringify({ data: [
      { id: "qwen/qwen3.5-foo:free", name: "Verified free", pricing: { prompt: "0", completion: "0", request: "0" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] } },
      { id: "paid/bait:free", name: "Non-zero completion", pricing: { prompt: "0", completion: "0.000001", request: "0" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] } },
      { id: "image/only:free", name: "Image only", pricing: { prompt: "0", completion: "0", request: "0" }, architecture: { input_modalities: ["image"], output_modalities: ["image"] } }
    ] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const refreshed = await refreshFreeModelCatalog(env);
    assert.equal(refreshed.refreshed, true);
    assert.ok(refreshed.models.some((model) => model.id === "qwen/qwen3.5-foo:free"));
    assert.ok(!refreshed.models.some((model) => model.id === "paid/bait:free"));
    assert.ok(!refreshed.models.some((model) => model.id === "image/only:free"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the official OpenRouter Free Router and expanded verified static routes", () => {
  const models = defaultFreeModels();
  assert.ok(models.some((model) => model.id === "openrouter/free"));
  assert.ok(models.some((model) => model.id === "@cf/meta/llama-3.2-1b-instruct"));
  assert.ok(models.some((model) => model.id === "@cf/openai/gpt-oss-120b"));
  assert.ok(models.some((model) => model.id === "gemini-3.5-flash"));
});

test("prefers the selected free Workers AI model before fallback", async () => {
  const calls = [];
  const env = {
    ...baseEnv(),
    AI: { async run(model) { calls.push(model); return { response: "Selected model reply" }; } }
  };
  const result = await generateReply({ text: "Hello", selectedMode: MODES.FAST, selectedModel: "@cf/google/gemma-4-26b-a4b-it", language: "en", context: [] }, env);
  assert.deepEqual(calls, ["@cf/google/gemma-4-26b-a4b-it"]);
  assert.equal(result.model, "@cf/google/gemma-4-26b-a4b-it");
});

test("opens a callback-driven model picker and selects a displayed free model", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 91 } }), { status: 200 });
  };
  try {
    const update = {
      update_id: 904,
      callback_query: {
        id: "picker-1", from: { id: 7, first_name: "Picker" }, data: "model:pick:0:all:0",
        message: { message_id: 20, chat: { id: 42, type: "private" }, from: { id: 8285612628, is_bot: true } }
      }
    };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" }, body: JSON.stringify(update)
    }), baseEnv());
    assert.equal(response.status, 200);
    const edit = calls.find((call) => /editMessageText$/.test(call.url));
    assert.match(edit.body.text, /Model selected/);
    assert.match(edit.body.text, /Provider:/);
    assert.equal(edit.body.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === "model:auto:all"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("delivers each due Secretary reminder once after an atomic claim", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 404 } }), { status: 200 });
  };
  try {
    const env = { ...baseEnv(), IVAI_DB: new ReminderD1() };
    const first = await processSecretaryReminderBatch(env, { now: "2026-08-20T00:10:00.000Z" });
    const second = await processSecretaryReminderBatch(env, { now: "2026-08-20T00:20:00.000Z" });
    assert.deepEqual(first, { claimed: 1, sent: 1, retried: 0, failed: 0 });
    assert.deepEqual(second, { claimed: 0, sent: 0, retried: 0, failed: 0 });
    assert.equal(calls.filter((call) => /sendMessage$/.test(call.url)).length, 1);
    assert.match(calls[0].body.text, /Review the launch/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("answers a guest AI query with one model call and the Guest Query API", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  try {
    let modelCalls = 0;
    const env = { ...baseEnv(), AI: { async run() { modelCalls += 1; return { response: "Guest answer." }; } } };
    const update = { update_id: 1101, guest_message: { message_id: 41, chat: { id: -1001, type: "supergroup" }, from: { id: 7 }, guest_bot_caller_user: { id: 7 }, guest_query_id: "guest-query-1", text: "Explain this" } };
    const response = await worker.fetch(new Request("https://worker.test/", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" }, body: JSON.stringify(update) }), env);
    assert.equal(response.status, 200);
    assert.equal(modelCalls, 1);
    const guest = calls.find((call) => /answerGuestQuery$/.test(call.url));
    assert.equal(guest.body.guest_query_id, "guest-query-1");
    assert.equal(guest.body.result.type, "article");
    assert.match(guest.body.result.input_message_content.message_text, /Guest answer/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("preserves business and topic context for an AI reply", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    const method = String(url).split("/").at(-1);
    return new Response(JSON.stringify({ ok: true, result: method === "sendMessage" ? { message_id: 901 } : true }), { status: 200 });
  };
  try {
    const env = { ...baseEnv(), AI: { async run() { return { response: "Connected answer." }; } } };
    const update = { update_id: 1102, business_message: { message_id: 52, chat: { id: 42, type: "private" }, from: { id: 7 }, business_connection_id: "business-connection-1", message_thread_id: 88, text: "Reply here" } };
    await worker.fetch(new Request("https://worker.test/", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" }, body: JSON.stringify(update) }), env);
    const action = calls.find((call) => /sendChatAction$/.test(call.url));
    const progress = calls.find((call) => /sendMessage$/.test(call.url));
    const final = calls.find((call) => /editMessageText$/.test(call.url));
    assert.equal(action.body.business_connection_id, "business-connection-1");
    assert.equal(action.body.message_thread_id, 88);
    assert.equal(progress.body.business_connection_id, "business-connection-1");
    assert.equal(progress.body.message_thread_id, 88);
    assert.equal(final.body.business_connection_id, "business-connection-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falls back to standard progress and final text if Rich Draft is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    const method = String(url).split("/").at(-1);
    if (method === "sendRichMessageDraft") return new Response(JSON.stringify({ ok: false, description: "Rich messages unavailable" }), { status: 400 });
    const result = method === "sendMessage" ? { message_id: 909 } : true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  };
  try {
    const env = { ...baseEnv(), AI: { async run() { return { response: "Fallback answer." }; } } };
    const update = { update_id: 1103, message: { message_id: 63, chat: { id: 42, type: "private" }, from: { id: 7 }, text: "Use fallback" } };
    await worker.fetch(new Request("https://worker.test/", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" }, body: JSON.stringify(update) }), env);
    assert.equal(calls.filter((call) => /sendRichMessageDraft$/.test(call.url)).length, 1);
    assert.equal(calls.filter((call) => /sendRichMessage$/.test(call.url)).length, 0);
    assert.equal(calls.filter((call) => /sendMessage$/.test(call.url)).length, 1);
    assert.equal(calls.filter((call) => /editMessageText$/.test(call.url)).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("offers the selected practical language set through a paginated language picker", () => {
  assert.ok(LANGUAGE_OPTIONS.some((language) => language.code === "ar"));
  assert.ok(LANGUAGE_OPTIONS.some((language) => language.code === "pt-BR"));
  assert.ok(LANGUAGE_OPTIONS.some((language) => language.code === "hi"));
  const picker = languageKeyboard("es", 0).inline_keyboard.flat();
  assert.ok(picker.some((button) => button.callback_data === "lang:set:es" && button.style === "success"));
  assert.ok(picker.some((button) => button.callback_data === "lang:page:1"));
});

test("sends one localized re-engagement message after an atomic claim", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 771 } }), { status: 200 });
  };
  try {
    const env = { ...baseEnv(), IVAI_DB: new ReengagementD1() };
    const first = await processReengagementBatch(env, { now: "2026-08-20T12:00:00.000Z" });
    const second = await processReengagementBatch(env, { now: "2026-08-20T12:10:00.000Z" });
    assert.deepEqual(first, { claimed: 1, sent: 1, failed: 0, blocked: 0 });
    assert.deepEqual(second, { claimed: 0, sent: 0, failed: 0, blocked: 0 });
    assert.equal(calls.length, 1);
    assert.match(calls[0].body.text, /IVAI sigue aquí/);
    assert.equal(calls[0].body.reply_markup.inline_keyboard[0][1].callback_data, "notify:off");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not duplicate a re-engagement delivery when cron runs overlap", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 772 } }), { status: 200 });
  };
  try {
    const env = { ...baseEnv(), IVAI_DB: new ReengagementD1() };
    const now = "2026-08-20T12:00:00.000Z";
    const [first, second] = await Promise.all([
      processReengagementBatch(env, { now }),
      processReengagementBatch(env, { now })
    ]);
    assert.equal(first.claimed + second.claimed, 1);
    assert.equal(first.sent + second.sent, 1);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects oversized Telegram media before downloading bytes", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { file_path: "voice.ogg", file_size: 8 * 1024 * 1024 + 1 } }), { status: 200 });
  };
  try {
    await assert.rejects(downloadTelegramFile("oversized", baseEnv()), /Media is too large/);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /getFile$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runs one guarded Workers AI call for voice and photo media", async () => {
  const originalFetch = globalThis.fetch;
  const aiCalls = [];
  const binary = new Uint8Array([1, 2, 3, 4]);
  globalThis.fetch = async (url) => {
    if (String(url).includes("getFile")) return new Response(JSON.stringify({ ok: true, result: { file_path: "asset.bin", file_size: binary.byteLength } }), { status: 200 });
    return new Response(binary, { status: 200, headers: { "content-type": "image/jpeg" } });
  };
  try {
    const env = {
      ...baseEnv(),
      AI: {
        async run(model, input) {
          aiCalls.push({ model, input });
          return input.audio ? { text: "voice transcript" } : { response: "photo description" };
        }
      }
    };
    const voice = await transcribeVoice({ fileId: "voice", languageHint: "fa" }, env);
    const photo = await analyzePhoto({ fileId: "photo", caption: "Describe", language: "en" }, env);
    assert.equal(voice.text, "voice transcript");
    assert.equal(photo.text, "photo description");
    assert.equal(aiCalls.length, 2);
    assert.equal(aiCalls[0].model, "@cf/openai/whisper-large-v3-turbo");
    assert.equal(aiCalls[0].input.task, "transcribe");
    assert.ok(Array.isArray(aiCalls[0].input.audio));
    assert.equal(aiCalls[0].input.language, "fa");
    assert.equal(aiCalls[1].model, "@cf/meta/llama-4-scout-17b-16e-instruct");
    assert.match(aiCalls[1].input.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a reasoning-only vision result instead of returning an empty photo reply", async () => {
  const originalFetch = globalThis.fetch;
  const binary = new Uint8Array([1, 2, 3, 4]);
  globalThis.fetch = async (url) => {
    if (String(url).includes("getFile")) return new Response(JSON.stringify({ ok: true, result: { file_path: "photo.png", file_size: binary.byteLength } }), { status: 200 });
    return new Response(binary, { status: 200, headers: { "content-type": "image/png" } });
  };
  try {
    const env = {
      ...baseEnv(),
      AI: { async run() { return { choices: [{ message: { content: "", reasoning_content: "internal reasoning only" } }] }; } }
    };
    await assert.rejects(analyzePhoto({ fileId: "reasoning-only", language: "en" }, env), /Vision model returned an empty result/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("accepts an OpenAI-compatible vision content reply and keeps photo output bounded", async () => {
  const originalFetch = globalThis.fetch;
  const aiCalls = [];
  const binary = new Uint8Array([1, 2, 3, 4]);
  globalThis.fetch = async (url) => {
    if (String(url).includes("getFile")) return new Response(JSON.stringify({ ok: true, result: { file_path: "photo.png", file_size: binary.byteLength } }), { status: 200 });
    return new Response(binary, { status: 200, headers: { "content-type": "image/png" } });
  };
  try {
    const env = {
      ...baseEnv(),
      AI: {
        async run(model, input) {
          aiCalls.push({ model, input });
          return { choices: [{ message: { content: "A compact valid photo description." } }] };
        }
      }
    };
    const photo = await analyzePhoto({ fileId: "openai-content", language: "en" }, env);
    assert.equal(photo.text, "A compact valid photo description.");
    assert.equal(aiCalls.length, 1);
    assert.equal(aiCalls[0].model, "@cf/meta/llama-4-scout-17b-16e-instruct");
    assert.equal(aiCalls[0].input.max_tokens, 320);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

class PreferenceD1 {
  constructor() {
    this.users = new Map();
    this.preferences = new Map();
    this.processedUpdates = new Set();
  }

  prepare(sql) {
    return {
      bind: (...params) => ({
        first: async () => {
          if (!sql.includes("FROM users u LEFT JOIN user_preferences")) return null;
          const user = this.users.get(String(params[0]));
          if (!user) return null;
          const preference = this.preferences.get(String(params[0])) || {};
          return {
            language: user.language,
            mode: preference.mode,
            selectedModel: preference.selectedModel,
            memoryEnabled: preference.memoryEnabled
          };
        },
        run: async () => this.#run(sql, params)
      })
    };
  }

  #ensurePreference(userId) {
    const id = String(userId);
    if (!this.preferences.has(id)) this.preferences.set(id, { mode: MODES.AUTO, selectedModel: null, memoryEnabled: 0 });
    return this.preferences.get(id);
  }

  async #run(sql, params) {
    sql = sql.replace(/\s+/g, " ");
    if (sql.includes("INTO processed_updates")) {
      const updateId = String(params[0]);
      if (this.processedUpdates.has(updateId)) return { meta: { changes: 0 } };
      this.processedUpdates.add(updateId);
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO users (telegram_user_id, username, first_name, language")) {
      const [userId, username, firstName, language] = params;
      const id = String(userId);
      const existing = this.users.get(id);
      this.users.set(id, {
        username,
        firstName,
        language: existing?.language ?? language
      });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO users (telegram_user_id, language")) {
      const [userId, language] = params;
      const id = String(userId);
      this.users.set(id, { ...(this.users.get(id) || {}), language });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO chats")) return { meta: { changes: 1 } };

    if (sql.includes("INSERT OR IGNORE INTO user_preferences")) {
      const id = String(params[0]);
      const existed = this.preferences.has(id);
      this.#ensurePreference(id);
      return { meta: { changes: existed ? 0 : 1 } };
    }
    if (sql.includes("UPDATE user_preferences SET selected_model")) {
      const preference = this.#ensurePreference(params[1]);
      preference.selectedModel = params[0] || null;
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE user_preferences SET memory_enabled")) {
      const preference = this.#ensurePreference(params[1]);
      preference.memoryEnabled = params[0];
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE user_preferences SET mode")) {
      const preference = this.#ensurePreference(params[1]);
      preference.mode = params[0];
      return { meta: { changes: 1 } };
    }

    if (sql.includes("INSERT INTO user_preferences") && sql.includes("selected_model")) {
      const [userId, selectedModel] = params;
      const id = String(userId);
      const existing = this.preferences.get(id);
      this.preferences.set(id, existing ? { ...existing, selectedModel: selectedModel || null } : { mode: MODES.AUTO, selectedModel: selectedModel || null, memoryEnabled: 0 });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO user_preferences") && sql.includes("memory_enabled")) {
      const [userId, value] = params;
      const id = String(userId);
      const existing = this.preferences.get(id);
      if (sql.includes("mode, memory_enabled")) {
        this.preferences.set(id, existing ? { ...existing, memoryEnabled: value } : { mode: MODES.AUTO, selectedModel: null, memoryEnabled: value });
      }
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO user_preferences") && sql.includes("mode")) {
      const [userId, mode] = params;
      const id = String(userId);
      const existing = this.preferences.get(id);
      this.preferences.set(id, existing ? { ...existing, mode } : { mode, selectedModel: null, memoryEnabled: 0 });
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }
}

test("keeps an explicit Persian language and selected settings across sequential preference writes", async () => {
  const env = { IVAI_DB: new PreferenceD1() };
  const user = { id: 77, username: "persian_user", first_name: "Persian user" };
  const chat = { id: 770, type: "private" };

  await setUserLanguage(user.id, "fa", env);
  await upsertUser({ user, chat, language: "en" }, env);
  await setUserMode(user.id, MODES.CODE, env);
  await setSelectedModel(user.id, "@cf/meta/llama-3.3-70b-instruct-fp8-fast", env);
  await setMemoryEnabled(user.id, true, env);

  let settings = await getUserSettings(user.id, env);
  assert.deepEqual(settings, {
    language: "fa",
    mode: MODES.CODE,
    selectedModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    memoryEnabled: true
  });

  // A later message may arrive with Telegram language_code=en. It must not replace an explicit fa choice.
  await upsertUser({ user, chat, language: "en" }, env);
  await setMemoryEnabled(user.id, false, env);
  await setSelectedModel(user.id, null, env);

  settings = await getUserSettings(user.id, env);
  assert.deepEqual(settings, {
    language: "fa",
    mode: MODES.CODE,
    selectedModel: null,
    memoryEnabled: false
  });
});


test("preserves mode and model when the first preference writes arrive in a different order", async () => {
  const env = { IVAI_DB: new PreferenceD1() };
  await setUserLanguage(88, "fa", env);
  await setMemoryEnabled(88, true, env);
  await setSelectedModel(88, "@cf/meta/llama-3.3-70b-instruct-fp8-fast", env);
  await setUserMode(88, MODES.DEEP, env);

  assert.deepEqual(await getUserSettings(88, env), {
    language: "fa",
    mode: MODES.DEEP,
    selectedModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    memoryEnabled: true
  });
});

test("bounds conversation Sessions by idle and absolute lifetime without a background job", async () => {
  const kv = new KV();
  const env = { IVAI_KV: kv };
  const scope = "42:7:main:root";
  const t0 = 1_000_000;
  const firstMessages = [{ role: "user", content: "Remember this" }, { role: "assistant", content: "Stored" }];

  let session = await saveConversationSession(scope, firstMessages, env, { now: t0 });
  assert.equal(session.messages.length, 2);
  assert.equal(session.idleExpiresAt, t0 + APP.conversationSessionIdleSeconds * 1000);
  assert.equal(session.expiresAt, t0 + APP.conversationSessionAbsoluteSeconds * 1000);
  assert.equal((await kv.get(`session:${scope}`)) !== null, true);

  assert.deepEqual((await getConversationSession(scope, env, { now: t0 + 29 * 60 * 1000 })).messages, firstMessages);
  assert.equal(await getConversationSession(scope, env, { now: t0 + 30 * 60 * 1000 }), null);
  assert.equal(await kv.get(`session:${scope}`), null);

  session = await saveConversationSession(scope, firstMessages, env, { now: t0 });
  for (const minutes of [20, 40, 60, 80, 100]) {
    session = await saveConversationSession(scope, firstMessages, env, { session, now: t0 + minutes * 60 * 1000 });
  }
  assert.equal((await getConversationSession(scope, env, { now: t0 + 119 * 60 * 1000 }))?.id, session.id);
  assert.equal(await getConversationSession(scope, env, { now: t0 + 120 * 60 * 1000 }), null);
});

test("resets only the requested conversation Session and leaves a separate Terminal Session intact", async () => {
  const kv = new KV();
  const env = { IVAI_KV: kv };
  const chatScope = "42:7:main:root";
  const terminalScope = "7:7:terminal:root";
  const now = 2_000_000;
  await saveConversationSession(chatScope, [{ role: "user", content: "Telegram context" }], env, { now });
  await saveConversationSession(terminalScope, [{ role: "user", content: "Terminal context" }], env, { now });

  await startNewConversationSession(chatScope, env);

  assert.equal(await getConversationSession(chatScope, env, { now: now + 1 }), null);
  assert.equal((await getConversationSession(terminalScope, env, { now: now + 1 }))?.messages[0].content, "Terminal context");
});

test("starts a new Telegram Session with /new without AI work or preference resets", async () => {
  const originalFetch = globalThis.fetch;
  const kv = new KV();
  const env = { ...baseEnv(), IVAI_KV: kv, AI: { async run() { throw new Error("/new must not call AI"); } } };
  const scope = "42:126679582:main:root";
  await saveConversationSession(scope, [{ role: "user", content: "Old context" }], env, { now: Date.now() });
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { message_id: 777 } }), { status: 200 });
  try {
    const update = { update_id: 1301, message: { message_id: 51, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "/new" } };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), env);
    assert.equal(response.status, 200);
    assert.equal(await getConversationSession(scope, env), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("starts a new Telegram Session with /start without an AI call", async () => {
  const originalFetch = globalThis.fetch;
  const kv = new KV();
  const env = { ...baseEnv(), IVAI_KV: kv, AI: { async run() { throw new Error("/start must not call AI"); } } };
  const scope = "42:126679582:main:root";
  await saveConversationSession(scope, [{ role: "user", content: "Old context" }], env, { now: Date.now() });
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { message_id: 778 } }), { status: 200 });
  try {
    const update = { update_id: 1302, message: { message_id: 52, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "/start" } };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), env);
    assert.equal(response.status, 200);
    assert.equal(await getConversationSession(scope, env), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resets the authenticated Terminal Session through /app/new without an AI call", async () => {
  const kv = new KV();
  const env = { ...baseEnv(), IVAI_KV: kv, AI: { async run() { throw new Error("/app/new must not call AI"); } } };
  const scope = "126679582:126679582:terminal:root";
  await saveConversationSession(scope, [{ role: "user", content: "Terminal old context" }], env, { now: Date.now() });
  const response = await worker.fetch(new Request("https://worker.test/app/new", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": signedWebAppInitData() },
    body: "{}"
  }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.equal(await getConversationSession(scope, env), null);
});

test("does not resurrect a reset Session when an older AI turn finishes later", async () => {
  const kv = new KV();
  const env = { IVAI_KV: kv };
  const scope = "42:7:main:root";
  const now = 3_000_000;
  const active = await ensureConversationSession(scope, env, { now });

  await startNewConversationSession(scope, env);
  const saved = await saveConversationSession(scope, [{ role: "user", content: "Late old response" }], env, { session: active, now: now + 1 });

  assert.equal(saved, null);
  assert.equal(await getConversationSession(scope, env, { now: now + 1 }), null);
});

test("preserves persistent preferences when /new resets only the conversation Session", async () => {
  const originalFetch = globalThis.fetch;
  const kv = new KV();
  const env = { ...baseEnv(), IVAI_DB: new PreferenceD1(), IVAI_KV: kv };
  const user = { id: 333, username: "session_owner", first_name: "Session owner" };
  const chat = { id: 444, type: "private" };
  const scope = "444:333:main:root";
  await setUserLanguage(user.id, "fa", env);
  await upsertUser({ user, chat, language: "en" }, env);
  await setUserMode(user.id, MODES.CODE, env);
  await setSelectedModel(user.id, "@cf/meta/llama-3.3-70b-instruct-fp8-fast", env);
  await setMemoryEnabled(user.id, true, env);
  await saveConversationSession(scope, [{ role: "user", content: "Context to discard" }], env, { now: Date.now() });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 779 } }), { status: 200 });
  };
  try {
    const update = { update_id: 1303, message: { message_id: 53, chat, from: user, text: "/new" } };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), env);
    assert.equal(response.status, 200);
    const reply = calls.find((call) => /sendMessage$/.test(call.url));
    assert.match(reply.body.text, /گفتگوی جدید آماده است/);
    assert.equal(await getConversationSession(scope, env), null);
    assert.deepEqual(await getUserSettings(user.id, env), {
      language: "fa",
      mode: MODES.CODE,
      selectedModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      memoryEnabled: true
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

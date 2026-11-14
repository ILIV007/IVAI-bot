import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import worker from "../src/index.js";
import { generateReply, getDetectedMode } from "../src/ai.js";
import { processSecretaryReminderBatch } from "../src/secretary.js";
import { processReengagementBatch } from "../src/reengagement.js";
import { analyzePhoto, downloadTelegramFile, transcribeVoice } from "../src/media.js";
import { APP, BYOK_PRESETS, defaultFreeModelFor, FREE_MODEL_POLICY, GROUP_POLICY, LANGUAGE_OPTIONS, MODES, modeOutputLimit } from "../src/config.js";
import { assignChannelCommentMode, channelPostSampled, completeChannelComment, messagePlainText, richBlockToPlain, richTextToPlain } from "../src/router.js";
import { defaultFreeModels, refreshFreeModelCatalog } from "../src/catalog.js";
import { addCustomByokModel, conversationKey, deleteUserApiConfig, ensureConversationSession, getActiveUserApiConfigId, getAdminOperationalStats, getConversationSession, getUserApiConfig, getUserApiConfigMeta, getUserSettings, listUserApiConfigs, markUserApiConfigInvalid, renameUserApiConfig, resetUserApiAuthFailures, saveConversationSession, saveUserApiConfig, setActiveUserApiConfig, setMemoryEnabled, setSelectedModel, setUserApiConfigEnabled, setUserLanguage, setUserMode, startNewConversationSession, updateUserApiConfigModel, upsertUser } from "../src/storage.js";
import { decryptApiKey, encryptApiKey } from "../src/byok-crypto.js";
import { getRequiredChannelMembership } from "../src/membership.js";
import { renderRichAiText, renderStandardAiText } from "../src/rich-renderer.js";
import { renderAppPage } from "../src/app-page.js";
import { allowUsage, claimUpdate, cleanupRuntimeGuards, hasValidWebhookSecret, parseAdminIds, releaseUpdateClaim, reserveWorkersAiBudget } from "../src/security.js";
import { feedbackKeyboard, languageKeyboard, languageMenuText, menuText, modeKeyboard, modeLabel, modelPickerKeyboard, modelPickerText, modelPickToken, modelSelectionText, pickWelcomeSticker, secureRandomIndex, requiredMembershipKeyboard, responseMeta, richLineBreaks, settingsKeyboard, shortModelLabel, splitText, stabilizeRtlText, startKeyboard, startThinkingAnimation, startTypingRefresher, telegram, terminalKeyboard, thinkingText, welcomeText } from "../src/telegram.js";

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

function signedWebAppInitData(user = { id: 126679582, first_name: "Owner", language_code: "en" }, { authDate = Math.floor(Date.now() / 1000) } = {}) {
  const values = new URLSearchParams({ auth_date: String(authDate), user: JSON.stringify(user) });
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

test("allowUsage reports the wall-clock reset window for busy messages (v3.11.0 S2)", async () => {
  const env = { ...baseEnv(), IVAI_DB: new GuardD1() };
  const first = await allowUsage({ scope: "text", id: 42, limit: 2 }, env);
  assert.equal(first.allowed, true);
  assert.equal(typeof first.resetInSeconds, "number");
  assert.ok(first.resetInSeconds > 0 && first.resetInSeconds <= 3600);
  await allowUsage({ scope: "text", id: 42, limit: 2 }, env);
  const denied = await allowUsage({ scope: "text", id: 42, limit: 2 }, env);
  assert.equal(denied.allowed, false);
  assert.equal(denied.remaining, 0);
  assert.ok(denied.resetInSeconds > 0 && denied.resetInSeconds <= 3600);
});

test("keeps Worker AI below the published free allocation and keeps automatic routes independent from Response Mode", () => {
  assert.equal(APP.systemDailyWorkersAiBudget, 8000);
  assert.ok(APP.systemDailyWorkersAiBudget < 10_000);
  assert.ok(!FREE_MODEL_POLICY.workersAi.text.includes("@cf/zai-org/glm-5.2"));
  assert.ok(!FREE_MODEL_POLICY.groq.includes("llama-3.1-8b-instant"));

  const automaticRoutes = {
    "workers-ai": "@cf/zai-org/glm-4.7-flash",
    groq: "openai/gpt-oss-20b",
    google: "gemini-3.6-flash",
    openrouter: "openrouter/free"
  };
  for (const [provider, model] of Object.entries(automaticRoutes)) {
    assert.equal(defaultFreeModelFor(provider), model);
    for (const mode of [MODES.AUTO, MODES.FAST, MODES.DEEP, MODES.CODE]) {
      assert.equal(defaultFreeModelFor(provider, mode), model);
    }
  }
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

test("declares the official v3.11.3 release version", () => {
  assert.equal(APP.version, "3.11.3");});

test("richLineBreaks converts newlines to <br> for Rich sends (v3.11.1)", () => {
  assert.equal(richLineBreaks("<b>🎛 IVAI menu</b>\n\n<b>Your setup</b>\nResponse mode: <code>Auto</code>"), "<b>🎛 IVAI menu</b><br><br><b>Your setup</b><br>Response mode: <code>Auto</code>");
  assert.equal(richLineBreaks("<b>📊 IVAI Operations</b>\n<table><tbody></tbody></table>"), "<b>📊 IVAI Operations</b><br><table><tbody></tbody></table>");
  assert.equal(richLineBreaks(""), "");
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

test("keeps bounded free-tier output limits while allowing complete Auto and Fast replies", () => {
  assert.equal(modeOutputLimit(MODES.FAST), 900);
  assert.equal(modeOutputLimit(MODES.AUTO), 1000);
  assert.ok(modeOutputLimit(MODES.FAST) < modeOutputLimit(MODES.DEEP));
  assert.ok(modeOutputLimit(MODES.CODE) <= 1800);
  assert.ok(modeOutputLimit(MODES.THREAD) <= 900);
});

test("keeps Auto distinct from Fast and gives both modes a complete one-call contract", async () => {
  const calls = [];
  const env = {
    ...baseEnv(),
    AI: {
      async run(model, input) {
        calls.push({ model, input });
        return { response: "A complete answer." };
      }
    }
  };

  assert.equal(getDetectedMode("A short ordinary question", MODES.AUTO), MODES.AUTO);
  assert.equal(getDetectedMode("Explain this trade-off", MODES.AUTO), MODES.AUTO);
  assert.equal(getDetectedMode("Write a Python function", MODES.AUTO), MODES.AUTO);
  assert.equal(getDetectedMode("A short ordinary question", MODES.FAST), MODES.FAST);

  const auto = await generateReply({ text: "A short ordinary question", selectedMode: MODES.AUTO, selectedModel: null, language: "en", context: [] }, env);
  const fast = await generateReply({ text: "A short ordinary question", selectedMode: MODES.FAST, selectedModel: null, language: "en", context: [] }, env);

  assert.equal(auto.mode, MODES.AUTO);
  assert.equal(fast.mode, MODES.FAST);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].input.max_tokens, modeOutputLimit(MODES.AUTO));
  assert.equal(calls[1].input.max_tokens, modeOutputLimit(MODES.FAST));
  assert.match(calls[0].input.messages[0].content, /never stop mid-sentence/i);
  assert.match(calls[1].input.messages[0].content, /self-contained answer/i);
  assert.match(calls[1].input.messages[0].content, /summarize instead of leaving an answer unfinished/i);
  assert.match(responseMeta({ model: auto.model, mode: auto.mode, language: "en" }), / · Auto<\/blockquote>/);
});

test("presents the requested Start controls and six-row Menu hierarchy", () => {
  const menu = modeKeyboard("en", { includeTerminal: true }).inline_keyboard;
  assert.deepEqual(menu[0].map((button) => button.callback_data), ["mode:auto"]);
  assert.equal(menu[0][0].style, "primary");
  assert.deepEqual(menu[1].map((button) => button.callback_data), ["mode:fast", "mode:deep", "mode:code"]);
  assert.ok(menu[1].every((button) => button.style === "primary"));
  assert.equal(menu[2][0].web_app.url, APP.terminalAppUrl);
  assert.equal(menu[2][0].style, "success");
  assert.equal(menu[3][0].callback_data, "menu:models");
  assert.equal(menu[3][0].style, undefined);
  // v3.9.0: My API has its own menu row between Pick model and Help.
  // v3.9.1: My API is the red button now (owner decision); Pick model is plain.
  assert.equal(menu[4][0].callback_data, "byok:open");
  assert.equal(menu[4][0].style, "danger");
  assert.deepEqual(menu[5].map((button) => button.callback_data), ["menu:help", "menu:settings", "menu:language"]);

  const start = startKeyboard("en", { includeTerminal: true }).inline_keyboard;
  assert.equal(start.length, 1);
  assert.equal(start[0][0].callback_data, "menu:main");
  assert.equal(start[0][0].style, "primary");
  assert.equal(start[0][1].web_app.url, APP.terminalAppUrl);
  assert.equal(start[0][1].style, "success");
  assert.equal(start[0][2].callback_data, "menu:language");
  assert.equal(start[0][2].style, "danger");
  assert.deepEqual(start[0].map((button) => button.text), ["📋 Open menu", "⌘ Open IVAI", "🌐 Language"]);
  const persianStart = startKeyboard("fa", { includeTerminal: true }).inline_keyboard[0];
  assert.deepEqual(persianStart.map((button) => button.text), ["📋 بازکردن منو", "⌘ بازکردن IVAI", "🌐 تغییر زبان"]);

  const pickerModels = [
    { id: "@cf/zai-org/glm-4.7-flash", name: "GLM 4.7 Flash", provider: "workers-ai", category: "fast", contextLength: 131072 },
    { id: "google/gemma:free", name: "Gemma Free", provider: "openrouter", category: "deep" },
    { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", provider: "groq", category: "code" },
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "google", category: "deep" }
  ];
  const picker = modelPickerKeyboard(pickerModels, { selectedModel: "@cf/zai-org/glm-4.7-flash" }).inline_keyboard.flat();
  assert.ok(picker.some((button) => button.callback_data === "model:view:workers-ai" && button.text.startsWith("🟣") && button.style === "primary"));
  assert.ok(picker.some((button) => button.callback_data === "model:view:openrouter" && button.text.startsWith("🔵") && button.style === "primary"));
  assert.ok(picker.some((button) => button.callback_data === "model:view:groq" && button.text.startsWith("🟠") && button.style === "primary"));
  assert.ok(picker.some((button) => button.callback_data === "model:view:google" && button.text.startsWith("🟢") && button.style === "primary"));
  for (const scope of ["all", "fast", "deep", "code"]) {
    assert.ok(picker.some((button) => button.callback_data === `model:view:${scope}` && button.style === "danger"));
  }
  assert.ok(picker.some((button) => button.callback_data === `model:pick:${modelPickToken(pickerModels[0].id)}:all:0` && button.style === "success"));
  assert.ok(picker.some((button) => button.callback_data === "model:auto:all" && button.style === "primary"));
  const providerFiltered = modelPickerKeyboard(pickerModels, { scope: "google" }).inline_keyboard.flat();
  assert.ok(providerFiltered.some((button) => button.callback_data === `model:pick:${modelPickToken(pickerModels[3].id)}:google:0` && /Gemini/.test(button.text)));
  const pinnedPicker = modelPickerText(pickerModels, { selectedModel: "@cf/zai-org/glm-4.7-flash", language: "en" });
  assert.match(pinnedPicker, /Cloudflare/);
  assert.match(pinnedPicker, /Model route/);
  assert.match(pinnedPicker, /your response mode stays the same/);
  const selectedCopy = modelSelectionText(pickerModels[0], "en", MODES.AUTO);
  assert.match(selectedCopy, /Provider:/);
  assert.match(selectedCopy, /Model route pinned/);
  assert.match(selectedCopy, /Response mode: <code>Auto<\/code> \(unchanged\)/);
  assert.equal(thinkingText("en", 0), "<i>⚡ IVAI is thinking.</i>");
  assert.equal(thinkingText("en", 2), "<i>⚡ IVAI is thinking...</i>");
  assert.equal(modeLabel(MODES.DEEP, "en"), "Deep");
  assert.equal(terminalKeyboard("en").inline_keyboard[0][0].web_app.url, APP.terminalAppUrl);
  assert.equal(requiredMembershipKeyboard("en").inline_keyboard[0][0].url, "https://t.me/ILIVIR3");
  assert.equal(requiredMembershipKeyboard("en").inline_keyboard[0][1].callback_data, "membership:check");
});

test("renders focused Start copy and a descriptive Menu with live settings and language flags", () => {
  assert.match(welcomeText("en"), /Auto, Fast, Deep, and Code replies/);
  assert.doesNotMatch(welcomeText("en"), /Free-only routes|one AI call per request|Send a message to begin/);
  const menu = menuText("en", { mode: MODES.DEEP, selectedModel: "@cf/zai-org/glm-4.7-flash", memoryEnabled: true });
  assert.match(menu, /Response mode: <code>Deep<\/code>/);
  assert.match(menu, /Model route: <code>Pinned · GLM 4\.7 Flash<\/code>/);
  assert.match(menu, /Memory: <code>On<\/code>/);
  // v3.11.0: the menu names the answering engine (S1) and explains itself
  // in a short "How it works" section instead of the old control guide.
  assert.match(menu, /Engine: <code>IVAI models<\/code>/);
  assert.match(menu, /How it works/);
  assert.match(menu, /Code<\/b> is for programming/);
  assert.match(menu, /Choose a section below\./);
  assert.doesNotMatch(menu, /<code>\/new<\/code>|Color guide|Control guide/);
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
  const persianMeta = responseMeta({ model: "@cf/zai-org/glm-4.7-flash", mode: "fast", language: "fa" });
  const arabicMeta = responseMeta({ model: "@cf/zai-org/glm-4.7-flash", mode: "fast", language: "ar" });
  assert.match(persianMeta, /<blockquote>\u200f\u2066🪐 <a href="https:\/\/t\.me\/IVAI_Llm_bot">IVAI<\/a> · GLM 4\.7 Flash · سریع\u2069<\/blockquote>/);
  assert.match(arabicMeta, /<blockquote>\u200f\u2066🪐 <a href="https:\/\/t\.me\/IVAI_Llm_bot">IVAI<\/a> · GLM 4\.7 Flash · Fast\u2069<\/blockquote>/);
  // v3.11.3: the footer follows the ANSWER's direction, not the UI language —
  // an English footer in a Persian answer is pinned RTL (RLM + LRI) so it
  // stays right-aligned with its sequence intact; an explicit rtl:false wins.
  const englishRtlMeta = responseMeta({ model: "@cf/zai-org/glm-4.7-flash", mode: "fast", language: "en", rtl: true });
  assert.match(englishRtlMeta, /<blockquote>\u200f\u2066🪐 <a href="https:\/\/t\.me\/IVAI_Llm_bot">IVAI<\/a> · GLM 4\.7 Flash · Fast\u2069<\/blockquote>/);
  assert.equal(responseMeta({ model: "@cf/zai-org/glm-4.7-flash", mode: "fast", language: "fa", rtl: false }), "<blockquote>🪐 <a href=\"https://t.me/IVAI_Llm_bot\">IVAI</a> · GLM 4.7 Flash · سریع</blockquote>");
  assert.equal(stabilizeRtlText("<b>🌐 تنظیمات IVAI</b>\n<b>مدل:</b> GPT-OSS\nپیام فارسی"), "<b>\u200f🌐 تنظیمات IVAI</b>\n<b>\u200fمدل:</b> GPT-OSS\n\u200fپیام فارسی");
  assert.equal(stabilizeRtlText("<b>English</b>\nPlain text"), "<b>English</b>\nPlain text");
  assert.equal(stabilizeRtlText("\u200fمتن فارسی"), "\u200fمتن فارسی");
  const fill = (number) => (target) => { target[0] = number; return target; };
  assert.equal(secureRandomIndex(2, fill(0)), 0);
  assert.equal(secureRandomIndex(2, fill(0xffff_ffff)), 1);
  let draws = 0;
  assert.equal(secureRandomIndex(3, (target) => {
    target[0] = draws++ === 0 ? 0xffff_ffff : 4;
    return target;
  }), 1);
  assert.equal(draws, 2);
  assert.equal(pickWelcomeSticker(() => 0), APP.welcomeStickerFileIds[0]);
  assert.equal(pickWelcomeSticker((length) => length - 1), APP.welcomeStickerFileIds.at(-1));
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
    const stickerIndex = calls.findIndex((call) => /sendSticker$/.test(call.url));
    const replyIndex = calls.findIndex((call) => /sendRichMessage$/.test(call.url));
    const sticker = calls[stickerIndex];
    const reply = calls[replyIndex];
    assert.ok(stickerIndex >= 0);
    assert.ok(stickerIndex < replyIndex);
    assert.ok(APP.welcomeStickerFileIds.includes(sticker.body.sticker));
    assert.deepEqual(sticker.body.reply_parameters, { message_id: 11 });
    assert.equal(calls.some((call) => /sendMessage$/.test(call.url)), false);
    assert.match(reply.body.rich_message.html, /your free AI assistant/);
    const startRow = reply.body.reply_markup.inline_keyboard[0];
    assert.equal(startRow[0].callback_data, "menu:main");
    assert.equal(startRow[1].web_app.url, APP.terminalAppUrl);
    assert.equal(startRow[2].callback_data, "menu:language");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("delivers the start welcome when the optional sticker send fails", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const call = { url: String(url), body: JSON.parse(init.body) };
    calls.push(call);
    if (/sendSticker$/.test(call.url)) {
      return new Response(JSON.stringify({ ok: false, description: "sticker temporarily unavailable" }), { status: 400 });
    }
    return new Response(JSON.stringify({ ok: true, result: { message_id: 78 } }), { status: 200 });
  };
  try {
    const update = { update_id: 1201, message: { message_id: 12, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "/start" } };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), baseEnv());
    assert.equal(response.status, 200);
    assert.ok(calls.some((call) => /sendSticker$/.test(call.url)));
    const reply = calls.find((call) => /sendRichMessage$/.test(call.url));
    assert.match(reply.body.rich_message.html, /your free AI assistant/);
    assert.ok(reply.body.reply_markup.inline_keyboard);
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
    // A non-owner id: owners are exempt from the membership gate (v3.7.7),
    // so a gate test must act as a regular user.
    const update = { update_id: 210, message: { message_id: 21, chat: { id: 42, type: "private" }, from: { id: 555001, first_name: "Member" }, text: "/start" } };
    const response = await worker.fetch(new Request("https://worker.test/", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" }, body: JSON.stringify(update) }), { ...baseEnv(), REQUIRED_CHANNEL_ENFORCED: "true" });
    assert.equal(response.status, 200);
    assert.match(calls[0].url, /getChatMember$/);
    assert.equal(calls[0].body.chat_id, APP.requiredChannelId);
    assert.match(calls[1].url, /sendRichMessage$/);
    assert.match(calls[1].body.rich_message.html, /Join @ILIVIR3 to use IVAI/);
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
    assert.match(alert.body.text, /an admin of @ILIVIR3/);
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
    assert.match(edit.body.rich_message.html, /Membership confirmed/);
    assert.doesNotMatch(edit.body.rich_message.html, /Join @ILIVIR3/);
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
    // Non-owner id (owners skip the membership check entirely, v3.7.7).
    const update = { update_id: 211, message: { message_id: 22, chat: { id: 43, type: "private" }, from: { id: 555001, first_name: "Member" }, text: "/start" } };
    const response = await worker.fetch(new Request("https://worker.test/", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" }, body: JSON.stringify(update) }), { ...baseEnv(), REQUIRED_CHANNEL_ENFORCED: "true" });
    assert.equal(response.status, 200);
    assert.match(calls[0].url, /getChatMember$/);
    const reply = calls.find((call) => /sendRichMessage$/.test(call.url));
    assert.match(reply.body.rich_message.html, /your free AI assistant/);
    assert.doesNotMatch(reply.body.rich_message.html, /Join @ILIVIR3 to use IVAI/);
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
    const reply = calls.find((call) => /sendRichMessage$/.test(call.url));
    assert.match(reply.body.rich_message.html, /IVAI menu/);
    assert.equal(reply.body.reply_markup.inline_keyboard[0][0].callback_data, "mode:auto");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends Help as a Rich Message with a collapsible sessions section (v3.11.0)", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 78 } }), { status: 200 });
  };
  try {
    const update = {
      update_id: 23,
      message: { message_id: 23, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "/help" }
    };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), baseEnv());
    assert.equal(response.status, 200);
    const reply = calls.find((call) => /sendRichMessage$/.test(call.url));
    assert.match(reply.body.rich_message.html, /IVAI Help/);
    assert.match(reply.body.rich_message.html, /<details><summary>More about sessions<\/summary>/);
    assert.match(reply.body.rich_message.html, /\/models/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Rich screens keep their line breaks as <br> (v3.11.1)", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 79 } }), { status: 200 });
  };
  try {
    const update = {
      update_id: 24,
      message: { message_id: 24, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "/help" }
    };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), baseEnv());
    assert.equal(response.status, 200);
    const reply = calls.find((call) => /sendRichMessage$/.test(call.url));
    assert.match(reply.body.rich_message.html, /<br><br>/);
    assert.equal(reply.body.rich_message.html.includes("\n"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falls back to a plain message when the Rich send fails (v3.11.0)", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    if (/sendRichMessage$/.test(String(url))) return new Response(JSON.stringify({ ok: false, description: "Bad Request: rich messages unavailable" }), { status: 400 });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 78 } }), { status: 200 });
  };
  try {
    const update = {
      update_id: 24,
      message: { message_id: 24, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "/menu" }
    };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), baseEnv());
    assert.equal(response.status, 200);
    assert.ok(calls.some((call) => /sendRichMessage$/.test(call.url)));
    const plain = calls.find((call) => /sendMessage$/.test(call.url));
    assert.match(plain.body.text, /IVAI menu/);
    assert.match(plain.body.text, /Engine: <code>IVAI models<\/code>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("shows the empty task list as a Rich screen with one next action (v3.11.0)", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env, calls, fetchMock } = byokWorkerEnv();
  // byokWorkerEnv applies only the BYOK migrations; the tasks table needs
  // the secretary migration for the reminder_status column listSecretaryTasks
  // selects.
  db.exec(readFileSync(new URL("../db/0003_secretary_reminders.sql", import.meta.url), "utf8"));
  globalThis.fetch = fetchMock;
  try {
    assert.equal((await postGroupUpdate(env, privateTextUpdate(5801, 20, "/tasks"))).status, 200);
    const reply = calls.find((call) => /sendRichMessage$/.test(call.url));
    assert.match(reply.body.rich_message.html, /Your tasks/);
    assert.match(reply.body.rich_message.html, /You have no open tasks\. Send <code>\/task title<\/code> to add one\./);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
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
    const reply = calls.find((call) => /sendRichMessage$/.test(call.url));
    assert.equal(reply.body.reply_markup.inline_keyboard[0][0].web_app.url, APP.terminalAppUrl);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("serves an English-first responsive admin page with strict Mini App headers", async () => {
  const response = await worker.fetch(new Request("https://worker.test/admin"), baseEnv());
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /lang="en"/);
  assert.match(html, /Secure, free-tier operations/);
  assert.match(html, /<script nonce="[a-f0-9]{32}"/);
  assert.match(html, /<style nonce="[a-f0-9]{32}"/);
  assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
  assert.equal(response.headers.get("cache-control"), "no-store");
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
  assert.match(bootstrap, /settings=result\.data\.settings\|\|Object\.assign/);
  assert.match(bootstrap, /settings=result\.data\.settings\|\|settings\|\|\{\};localize\(settings\);feed\.innerHTML/);
});

test("rejects unauthenticated Terminal API requests", async () => {
  const response = await worker.fetch(new Request("https://worker.test/app/session", { method: "POST", body: "{}" }), baseEnv());
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "UNAUTHORIZED");
});

test("rejects a correctly signed Mini App initData value that is future-dated beyond clock skew", async () => {
  const initData = signedWebAppInitData(undefined, { authDate: Math.floor(Date.now() / 1000) + 120 });
  const response = await worker.fetch(new Request("https://worker.test/app/session", {
    method: "POST",
    headers: { "x-telegram-init-data": initData },
    body: "{}"
  }), baseEnv());
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
    // Non-owner id: owners are exempt from the Terminal membership gate too (v3.7.7).
    const response = await worker.fetch(new Request("https://worker.test/app/session", { method: "POST", headers: { "x-telegram-init-data": signedWebAppInitData({ id: 555001, first_name: "Member", language_code: "en" }) }, body: "{}" }), { ...baseEnv(), REQUIRED_CHANNEL_ENFORCED: "true" });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "CHANNEL_REQUIRED");
  } finally { globalThis.fetch = originalFetch; }
});

test("renders Terminal Route independently from Response Mode", () => {
  const page = renderAppPage("test-nonce");
  assert.match(page, /ROUTE · AUTO/);
  assert.match(page, /route:'ROUTE'/);
  assert.match(page, /PINNED ·/);
  assert.doesNotMatch(page, /MODEL · AUTO/);
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
  assert.equal(body.mode, MODES.AUTO);
  assert.deepEqual(body.settings, { language: "en", mode: MODES.AUTO, modelRoute: "auto", selectedModel: null, memoryEnabled: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "@cf/zai-org/glm-4.7-flash");
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
    const summary = calls.find((call) => /sendRichMessage$/.test(call.url));
    assert.match(summary.body.rich_message.html, /IVAI Operations/);
    assert.match(summary.body.rich_message.html, /Workers AI budget left today/);
    // v3.11.0: the stats arrive as one small table, not a plain line list.
    assert.match(summary.body.rich_message.html, /<table>/);
    assert.match(summary.body.rich_message.html, /<th colspan="2">People<\/th>/);
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
  assert.ok(models.some((model) => model.id === "gemini-3.8-flash"));
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

test("applies one Auto Response Profile consistently to OpenRouter, Groq, and Google", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const endpoint = String(url);
    const body = JSON.parse(init.body);
    calls.push({ endpoint, body });
    if (endpoint.includes("openrouter.ai")) return new Response(JSON.stringify({ choices: [{ message: { content: "OpenRouter complete." } }] }), { status: 200 });
    if (endpoint.includes("api.groq.com")) return new Response(JSON.stringify({ choices: [{ message: { content: "Groq complete." } }] }), { status: 200 });
    if (endpoint.includes("generativelanguage.googleapis.com")) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Google complete." }] } }] }), { status: 200 });
    throw new Error(`Unexpected provider endpoint: ${endpoint}`);
  };
  try {
    const base = { ...baseEnv(), OPENROUTER_API_KEY: "configured", GROQ_API_KEY: "configured", GOOGLE_API_KEY: "configured" };
    const openRouter = await generateReply({ text: "Explain this briefly", selectedMode: MODES.AUTO, selectedModel: "openrouter/free", language: "en", context: [] }, base);
    const groq = await generateReply({ text: "Explain this briefly", selectedMode: MODES.AUTO, selectedModel: "openai/gpt-oss-20b", language: "en", context: [] }, base);
    const google = await generateReply({ text: "Explain this briefly", selectedMode: MODES.AUTO, selectedModel: "gemini-3.8-flash", language: "en", context: [] }, base);

    assert.equal(openRouter.mode, MODES.AUTO);
    assert.equal(groq.mode, MODES.AUTO);
    assert.equal(google.mode, MODES.AUTO);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].body.max_tokens, modeOutputLimit(MODES.AUTO));
    assert.equal(calls[1].body.max_tokens, modeOutputLimit(MODES.AUTO));
    assert.equal(calls[2].body.generationConfig.maxOutputTokens, modeOutputLimit(MODES.AUTO));
    assert.match(calls[0].body.messages[0].content, /complete, appropriately sized answer/i);
    assert.match(calls[1].body.messages[0].content, /complete, appropriately sized answer/i);
    assert.match(calls[2].body.systemInstruction.parts[0].text, /complete, appropriately sized answer/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- Hotfix v3.5.2: provider/Telegram timeouts + per-attempt failure logs ---
// Advance fake time (flushing microtasks between ticks) until the promise
// settles, so 15–25s timeout races resolve deterministically with no real wait.
async function driveUntilSettled(t, promise) {
  let outcome = null;
  promise.then(
    (value) => { outcome = { ok: true, value }; },
    (error) => { outcome = { ok: false, error }; }
  );
  for (let index = 0; index < 40 && !outcome; index += 1) {
    t.mock.timers.tick(5000);
    for (let inner = 0; inner < 100; inner += 1) await Promise.resolve();
  }
  assert.ok(outcome, "expected the promise to settle under fake time");
  return outcome;
}

function captureProviderFailures() {
  const originalError = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.join(" "));
  return {
    failures: () => lines.map((line) => JSON.parse(line)).filter((entry) => entry.event === "provider_attempt_failed"),
    restore: () => { console.error = originalError; }
  };
}

// A fetch that hangs forever and, like a real fetch, rejects when aborted.
function hangingFetch(onCall) {
  return (url, init) => {
    onCall?.(String(url), init);
    return new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("The operation was aborted")));
    });
  };
}

test("a stuck Workers AI call times out and the chain falls through to the next provider", async (t) => {
  const originalFetch = globalThis.fetch;
  const logs = captureProviderFailures();
  globalThis.fetch = async (url) => {
    if (String(url).includes("openrouter.ai")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "OpenRouter rescued the reply." } }] }), { status: 200 });
    }
    throw new Error(`Unexpected provider endpoint: ${url}`);
  };
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const env = {
      ...baseEnv(),
      OPENROUTER_API_KEY: "configured",
      AI: { run: () => new Promise(() => {}) }
    };
    const outcome = await driveUntilSettled(t, generateReply({ text: "Hello", selectedMode: MODES.AUTO, selectedModel: null, language: "en", context: [] }, env));
    assert.equal(outcome.ok, true);
    assert.equal(outcome.value.provider, "openrouter");
    assert.equal(outcome.value.text, "OpenRouter rescued the reply.");
    const failed = logs.failures();
    assert.equal(failed.length, 1);
    assert.equal(failed[0].provider, "workers-ai");
    assert.ok(failed[0].ms >= 25_000);
    assert.match(failed[0].error, /timed out/);
  } finally {
    t.mock.timers.reset();
    logs.restore();
    globalThis.fetch = originalFetch;
  }
});

test("a stuck fetch provider is aborted and the chain moves on", async (t) => {
  const originalFetch = globalThis.fetch;
  const logs = captureProviderFailures();
  let groqSignal;
  globalThis.fetch = (url, init) => {
    const endpoint = String(url);
    if (endpoint.includes("api.groq.com")) {
      groqSignal = init.signal;
      return hangingFetch()(url, init);
    }
    if (endpoint.includes("openrouter.ai")) {
      return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "OpenRouter after Groq." } }] }), { status: 200 }));
    }
    throw new Error(`Unexpected provider endpoint: ${endpoint}`);
  };
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const env = { ...baseEnv(), GROQ_API_KEY: "configured", OPENROUTER_API_KEY: "configured" };
    const outcome = await driveUntilSettled(t, generateReply({ text: "Hello", selectedMode: MODES.AUTO, selectedModel: "openai/gpt-oss-20b", language: "en", context: [] }, env));
    assert.equal(outcome.ok, true);
    assert.equal(outcome.value.provider, "openrouter");
    assert.equal(groqSignal.aborted, true);
    const failed = logs.failures();
    assert.equal(failed[0].provider, "groq");
    assert.ok(failed[0].ms >= 15_000);
  } finally {
    t.mock.timers.reset();
    logs.restore();
    globalThis.fetch = originalFetch;
  }
});

test("the generation chain stops starting attempts after the overall deadline", async (t) => {
  const originalFetch = globalThis.fetch;
  const logs = captureProviderFailures();
  const fetched = [];
  globalThis.fetch = hangingFetch((url) => fetched.push(url));
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const env = {
      ...baseEnv(),
      OPENROUTER_API_KEY: "configured", GROQ_API_KEY: "configured", GOOGLE_API_KEY: "configured",
      AI: { run: () => new Promise(() => {}) }
    };
    // Workers AI burns 25s, OpenRouter 15s, Groq 15s: past the 45s deadline,
    // so Google must never be attempted and the aggregated error is thrown.
    const outcome = await driveUntilSettled(t, generateReply({ text: "Hello", selectedMode: MODES.AUTO, selectedModel: null, language: "en", context: [] }, env));
    assert.equal(outcome.ok, false);
    assert.match(outcome.error.message, /No free AI provider is currently available/);
    assert.ok(fetched.some((url) => url.includes("openrouter.ai")));
    assert.ok(fetched.some((url) => url.includes("api.groq.com")));
    assert.ok(!fetched.some((url) => url.includes("generativelanguage.googleapis.com")));
  } finally {
    t.mock.timers.reset();
    logs.restore();
    globalThis.fetch = originalFetch;
  }
});

test("when every provider fails, generateReply throws and logs each failed attempt", async () => {
  const originalFetch = globalThis.fetch;
  const logs = captureProviderFailures();
  globalThis.fetch = async () => new Response("nope", { status: 500 });
  try {
    const env = {
      ...baseEnv(),
      OPENROUTER_API_KEY: "configured", GROQ_API_KEY: "configured", GOOGLE_API_KEY: "configured",
      AI: { async run() { throw new Error("Workers AI exploded"); } }
    };
    await assert.rejects(
      generateReply({ text: "Hello", selectedMode: MODES.AUTO, selectedModel: null, language: "en", context: [] }, env),
      /No free AI provider is currently available/
    );
    const failed = logs.failures();
    assert.deepEqual(failed.map((entry) => entry.provider), ["workers-ai", "openrouter", "groq", "google"]);
    for (const entry of failed) {
      assert.equal(typeof entry.ms, "number");
      assert.ok(entry.error.length > 0 && entry.error.length <= 120);
    }
  } finally {
    logs.restore();
    globalThis.fetch = originalFetch;
  }
});

test("telegram API calls time out instead of hanging the handler", async (t) => {
  const originalFetch = globalThis.fetch;
  let seenSignal;
  globalThis.fetch = hangingFetch((url, init) => { seenSignal = init.signal; });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const outcome = await driveUntilSettled(t, telegram(baseEnv(), "sendMessage", { chat_id: 1, text: "hi" }));
    assert.equal(outcome.ok, false);
    assert.equal(seenSignal.aborted, true);
  } finally {
    t.mock.timers.reset();
    globalThis.fetch = originalFetch;
  }
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
        id: "picker-1", from: { id: 7, first_name: "Picker" }, data: `model:pick:${modelPickToken("@cf/zai-org/glm-4.7-flash")}:all:0`,
        message: { message_id: 20, chat: { id: 42, type: "private" }, from: { id: 8285612628, is_bot: true } }
      }
    };
    const selectedWrites = [];
    const env = {
      ...baseEnv(),
      IVAI_DB: {
        prepare(sql) {
          return {
            bind(...params) {
              return {
                first: async () => null,
                run: async () => {
                  if (/UPDATE\s+user_preferences\s+SET\s+selected_model/i.test(sql)) selectedWrites.push(params);
                  return { meta: { changes: 1 } };
                }
              };
            }
          };
        }
      }
    };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" }, body: JSON.stringify(update)
    }), env);
    assert.equal(response.status, 200);
    const edit = calls.find((call) => /editMessageText$/.test(call.url));
    assert.match(edit.body.rich_message.html, /Model route pinned/);
    assert.match(edit.body.rich_message.html, /Provider:/);
    assert.match(edit.body.rich_message.html, /Response mode: <code>Auto<\/code> \(unchanged\)/);
    assert.equal(edit.body.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === "model:auto:all"), true);
    assert.deepEqual(selectedWrites, [["@cf/zai-org/glm-4.7-flash", "7"]]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("recovers the model picker when a stale model token is clicked", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 92 } }), { status: 200 });
  };
  try {
    const update = {
      update_id: 905,
      callback_query: {
        id: "picker-stale", from: { id: 8, first_name: "Picker" }, data: "model:pick:mstale:all:0",
        message: { message_id: 21, chat: { id: 42, type: "private" }, from: { id: 8285612628, is_bot: true } }
      }
    };
    const env = baseEnv();
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" }, body: JSON.stringify(update)
    }), env);
    assert.equal(response.status, 200);
    const edit = calls.find((call) => /editMessageText$/.test(call.url));
    assert.match(edit.body.rich_message.html, /model list changed/i);
    assert.ok(edit.body.reply_markup.inline_keyboard.flat().some((button) => String(button.callback_data || "").startsWith("model:pick:m")));
    assert.equal((await getUserSettings(8, env)).selectedModel, null);
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
    assert.equal(calls.filter((call) => /sendRichMessage$/.test(call.url)).length, 1);
    assert.match(calls[0].body.rich_message.html, /Review the launch/);
    // v3.11.0 (K01): the reminder is a Rich Message with the new copy —
    // short heading, the title, and one next action.
    assert.match(calls[0].body.rich_message.html, /⏰ Reminder/);
    assert.match(calls[0].body.rich_message.html, /Done with it\? Open <code>\/tasks<\/code> to close it\./);
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

test("continues bounded cron work when the broadcast lookup fails", async () => {
  const prepared = [];
  const env = {
    ...baseEnv(),
    IVAI_DB: {
      prepare(sql) {
        prepared.push(sql);
        const statement = {
          bind() { return statement; },
          run: async () => ({ meta: { changes: 0 } }),
          first: async () => null,
          all: async () => {
            if (sql.includes("broadcast_campaigns")) throw new Error("broadcast lookup unavailable");
            return { results: [] };
          }
        };
        return statement;
      }
    }
  };
  const waits = [];
  const originalError = console.error;
  console.error = () => {};
  try {
    worker.scheduled({}, env, { waitUntil(promise) { waits.push(promise); } });
    assert.equal(waits.length, 1);
    await waits[0];
    assert.ok(prepared.some((sql) => sql.includes("broadcast_campaigns")));
    assert.ok(prepared.some((sql) => sql.includes("FROM tasks")));
    assert.ok(prepared.some((sql) => sql.includes("user_reengagement")));
  } finally {
    console.error = originalError;
  }
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
    // v3.11.0 (K02): the re-engagement message is a Rich Message with the
    // new heading ("Still here, whenever you need me").
    assert.match(calls[0].body.rich_message.html, /Sigo aquí, cuando me necesites/);
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

test("rejects a voice message over the 2 MB voice cap before downloading it; photos keep the 8 MB cap", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const binary = new Uint8Array([1, 2, 3, 4]);
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes("getFile")) {
      const { file_id: fileId } = JSON.parse(init.body);
      const fileSize = fileId === "big-voice" ? 2 * 1024 * 1024 + 1 : 3 * 1024 * 1024;
      return new Response(JSON.stringify({ ok: true, result: { file_path: "asset.bin", file_size: fileSize } }), { status: 200 });
    }
    return new Response(binary, { status: 200, headers: { "content-type": "image/jpeg" } });
  };
  try {
    const env = {
      ...baseEnv(),
      AI: { async run(model, input) { return input.audio ? { text: "voice transcript" } : { response: "photo description" }; } }
    };
    // Voice is capped at 2 MB from the getFile metadata alone (v3.7.5): the
    // rejection must land with no file download ever attempted, so the audio
    // bytes are never spread into the transcription number array.
    await assert.rejects(transcribeVoice({ fileId: "big-voice", languageHint: "en" }, env), /Media is too large/);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /getFile$/);
    // A 3 MB photo is over the voice cap but well under the general 8 MB
    // media cap, and still goes through.
    const photo = await analyzePhoto({ fileId: "photo-3mb", caption: "Describe", language: "en" }, env);
    assert.equal(photo.text, "photo description");
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
          if (sql.includes("INTO runtime_counters")) return { value: Number(params[3] || 0) };
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
    if (sql.includes("UPDATE user_preferences SET mode") && sql.includes("selected_model=NULL") && sql.includes("memory_enabled=0")) {
      const preference = this.#ensurePreference(params[1]);
      preference.mode = params[0];
      preference.selectedModel = null;
      preference.memoryEnabled = 0;
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE user_preferences SET mode")) {
      const preference = this.#ensurePreference(params[2]);
      preference.mode = params[0];
      if (params[1]) preference.selectedModel = null;
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

test("sends each Menu mode confirmation as a separate message before redrawing the Menu", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = new PreferenceD1();
  const calls = [];
  const env = { ...baseEnv(), IVAI_DB: d1 };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 505 } }), { status: 200 });
  };
  try {
    for (const [offset, mode, label] of [[0, "auto", "Auto"], [1, "fast", "Fast"], [2, "deep", "Deep"], [3, "code", "Code"]]) {
      calls.length = 0;
      d1.preferences.set("885", { mode: MODES.DEEP, selectedModel: "@cf/meta/llama-3.2-1b-instruct", memoryEnabled: 0 });
      const response = await worker.fetch(new Request("https://worker.test/", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
        body: JSON.stringify({
          update_id: 1610 + offset,
          callback_query: {
            id: `mode-${mode}`,
            from: { id: 885, first_name: "Mode tester", language_code: "en" },
            data: `mode:${mode}`,
            message: { message_id: 70 + offset, chat: { id: 885, type: "private" }, from: { id: 8285612628, is_bot: true } }
          }
        })
      }), env);
      assert.equal(response.status, 200);
      const confirmation = calls.find((call) => /sendMessage$/.test(call.url));
      const edit = calls.find((call) => /editMessageText$/.test(call.url));
      assert.match(confirmation.body.text, /Response mode is now/);
      assert.match(confirmation.body.text, new RegExp(`Response mode is now <b>${label}<\\/b>`));
      assert.equal(confirmation.body.reply_parameters.message_id, 70 + offset);
      assert.ok(calls.indexOf(confirmation) < calls.indexOf(edit));
      assert.doesNotMatch(edit.body.rich_message.html, /Response mode is now/);
      const settings = await getUserSettings(885, env);
      assert.equal(settings.mode, mode);
      assert.equal(settings.selectedModel, mode === MODES.AUTO ? null : "@cf/meta/llama-3.2-1b-instruct");
      if (mode === MODES.AUTO) assert.match(confirmation.body.text, /model route: Auto/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("clears a selected provider model when the /auto command enables Auto mode", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = new PreferenceD1();
  const env = { ...baseEnv(), IVAI_DB: d1 };
  d1.preferences.set("887", { mode: MODES.CODE, selectedModel: "@cf/meta/llama-3.2-1b-instruct", memoryEnabled: 0 });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 507 } }), { status: 200 });
  };
  try {
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify({
        update_id: 1615,
        message: { message_id: 75, chat: { id: 887, type: "private" }, from: { id: 887, first_name: "Command tester", language_code: "en" }, text: "/auto" }
      })
    }), env);
    assert.equal(response.status, 200);
    const settings = await getUserSettings(887, env);
    assert.equal(settings.mode, MODES.AUTO);
    assert.equal(settings.selectedModel, null);
    const confirmation = calls.find((call) => /sendMessage$/.test(call.url));
    assert.match(confirmation.body.text, /Mode set to <b>Auto<\/b>, model route: Auto\./);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("switches only the model route to Auto when /model off is used", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = new PreferenceD1();
  const env = { ...baseEnv(), IVAI_DB: d1 };
  d1.preferences.set("888", { mode: MODES.DEEP, selectedModel: "@cf/meta/llama-3.2-1b-instruct", memoryEnabled: 0 });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 508 } }), { status: 200 });
  };
  try {
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify({ update_id: 1616, message: { message_id: 76, chat: { id: 888, type: "private" }, from: { id: 888, first_name: "Route tester", language_code: "en" }, text: "/model off" } })
    }), env);
    assert.equal(response.status, 200);
    const settings = await getUserSettings(888, env);
    assert.equal(settings.mode, MODES.DEEP);
    assert.equal(settings.selectedModel, null);
    const confirmation = calls.find((call) => /sendMessage$/.test(call.url));
    assert.match(confirmation.body.text, /Model route is Auto now/);
    assert.match(confirmation.body.text, /Response mode stays <b>Deep<\/b>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps an idempotent Menu callback webhook successful when Telegram reports an unchanged edit", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = new PreferenceD1();
  const calls = [];
  const env = { ...baseEnv(), IVAI_DB: d1 };
  globalThis.fetch = async (url, init) => {
    const method = String(url).split("/").at(-1);
    calls.push({ method, body: JSON.parse(init.body) });
    if (method === "editMessageText") {
      return new Response(JSON.stringify({
        ok: false,
        description: "Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message"
      }), { status: 400 });
    }
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  try {
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify({
        update_id: 1614,
        callback_query: {
          id: "mode-auto-noop",
          from: { id: 886, first_name: "No-op tester", language_code: "en" },
          data: "mode:auto",
          message: { message_id: 74, chat: { id: 886, type: "private" }, from: { id: 8285612628, is_bot: true } }
        }
      })
    }), env);
    assert.equal(response.status, 200);
    assert.ok(calls.some((call) => call.method === "answerCallbackQuery"));
    assert.ok(calls.some((call) => call.method === "editMessageText"));
    assert.equal((await getUserSettings(886, env)).mode, MODES.AUTO);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps active Persian Session context when Memory is Off", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = new PreferenceD1();
  const user = { id: 881, first_name: "Ilya", language_code: "en" };
  const chat = { id: 882, type: "private" };
  // Reproduce a user whose persisted UI preference is English but who starts
  // this active conversation in Persian with Memory Off.
  d1.users.set(String(user.id), { language: "en" });
  d1.preferences.set(String(user.id), { mode: MODES.AUTO, selectedModel: null, memoryEnabled: 0 });
  const aiCalls = [];
  const env = {
    ...baseEnv(),
    IVAI_DB: d1,
    AI: {
      async run(model, payload) {
        aiCalls.push({ model, payload });
        return { response: aiCalls.length === 1 ? "خوشحالم ایلیا." : "اسم شما ایلیا است." };
      }
    }
  };
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { message_id: 501 } }), { status: 200 });
  try {
    for (const [updateId, messageId, text] of [
      [1601, 61, "اسم من ایلیا هست"],
      [1602, 62, "اسم من چیه؟"]
    ]) {
      const response = await worker.fetch(new Request("https://worker.test/", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
        body: JSON.stringify({ update_id: updateId, message: { message_id: messageId, chat, from: user, text } })
      }), env);
      assert.equal(response.status, 200);
    }
    assert.equal(aiCalls.length, 2);
    assert.match(aiCalls[0].payload.messages[0].content, /Respond in Persian/);
    assert.match(aiCalls[1].payload.messages[0].content, /Respond in Persian/);
    assert.ok(aiCalls[1].payload.messages.some((entry) => entry.role === "user" && entry.content === "اسم من ایلیا هست"));
    assert.ok(aiCalls[1].payload.messages.some((entry) => entry.role === "assistant" && entry.content === "خوشحالم ایلیا."));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("treats a plain Persian greeting as Persian despite a stale English preference", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = new PreferenceD1();
  const user = { id: 880, first_name: "Persian user", language_code: "en" };
  d1.users.set(String(user.id), { language: "en" });
  d1.preferences.set(String(user.id), { mode: MODES.AUTO, selectedModel: null, memoryEnabled: 0 });
  const aiCalls = [];
  const env = { ...baseEnv(), IVAI_DB: d1, AI: { async run(model, payload) { aiCalls.push({ model, payload }); return { response: "سلام!" }; } } };
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { message_id: 500 } }), { status: 200 });
  try {
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify({ update_id: 1600, message: { message_id: 60, chat: { id: 880, type: "private" }, from: user, text: "سلام" } })
    }), env);
    assert.equal(response.status, 200);
    assert.match(aiCalls[0].payload.messages[0].content, /Respond in Persian/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps an English footer for a Persian prompt when the UI preference is English", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = new PreferenceD1();
  const user = { id: 884, first_name: "English UI user", language_code: "en" };
  d1.users.set(String(user.id), { language: "en" });
  d1.preferences.set(String(user.id), { mode: MODES.FAST, selectedModel: null, memoryEnabled: 0 });
  const calls = [];
  const aiCalls = [];
  const env = {
    ...baseEnv(),
    IVAI_DB: d1,
    AI: {
      async run(model, payload) {
        aiCalls.push({ model, payload });
        return { response: "پاسخ فارسی" };
      }
    }
  };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 501 } }), { status: 200 });
  };
  try {
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify({ update_id: 1603, message: { message_id: 63, chat: { id: 884, type: "private" }, from: user, text: "سلام" } })
    }), env);
    assert.equal(response.status, 200);
    assert.match(aiCalls[0].payload.messages[0].content, /Respond in Persian/);
    const final = calls.find((call) => /sendRichMessage$/.test(call.url));
    assert.match(final.body.rich_message.html, /GLM 4\.7 Flash · Fast\u2069<\/blockquote>/);
    assert.match(final.body.rich_message.html, /<blockquote>\u200f\u2066🪐/);
    assert.doesNotMatch(final.body.rich_message.html, /سریع/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps active Persian Terminal context when Memory is Off", async () => {
  const d1 = new PreferenceD1();
  const user = { id: 883, first_name: "Ilya", language_code: "en" };
  d1.users.set(String(user.id), { language: "en" });
  d1.preferences.set(String(user.id), { mode: MODES.AUTO, selectedModel: null, memoryEnabled: 0 });
  const aiCalls = [];
  const env = {
    ...baseEnv(),
    IVAI_DB: d1,
    AI: {
      async run(model, payload) {
        aiCalls.push({ model, payload });
        return { response: aiCalls.length === 1 ? "خوشحالم ایلیا." : "اسم شما ایلیا است." };
      }
    }
  };
  const initData = signedWebAppInitData(user);
  for (const text of ["اسم من ایلیا هست", "اسم من چیه؟"]) {
    const response = await worker.fetch(new Request("https://worker.test/app/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-init-data": initData },
      body: JSON.stringify({ text })
    }), env);
    assert.equal(response.status, 200);
  }
  assert.equal(aiCalls.length, 2);
  assert.match(aiCalls[1].payload.messages[0].content, /Respond in Persian/);
  assert.ok(aiCalls[1].payload.messages.some((entry) => entry.role === "user" && entry.content === "اسم من ایلیا هست"));
  assert.ok(aiCalls[1].payload.messages.some((entry) => entry.role === "assistant" && entry.content === "خوشحالم ایلیا."));
});

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

test("starts a new Telegram Session with /new without AI work and restores Agent defaults", async () => {
  const originalFetch = globalThis.fetch;
  const kv = new KV();
  const d1 = new PreferenceD1();
  d1.preferences.set("126679582", { mode: MODES.CODE, selectedModel: "@cf/meta/llama-3.2-1b-instruct", memoryEnabled: 1 });
  const env = { ...baseEnv(), IVAI_DB: d1, IVAI_KV: kv, AI: { async run() { throw new Error("/new must not call AI"); } } };
  const scope = "42:126679582:main:root";
  const calls = [];
  await saveConversationSession(scope, [{ role: "user", content: "Old context" }], env, { now: Date.now() });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 777 } }), { status: 200 });
  };
  try {
    const update = { update_id: 1301, message: { message_id: 51, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "/new" } };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), env);
    assert.equal(response.status, 200);
    assert.equal(await getConversationSession(scope, env), null);
    const reply = calls.find((call) => /sendMessage$/.test(call.url));
    assert.match(reply.body.text, /^<b>🪐 Fresh chat, ready to go!<\/b>\nPrevious context is cleared\./);
    assert.match(reply.body.text, /Mode is Auto, the model route is automatic, and memory is off/);
    assert.match(reply.body.text, /What shall we do first\?$/);
    assert.deepEqual(await getUserSettings(126679582, env), {
      language: "en",
      mode: MODES.AUTO,
      selectedModel: null,
      memoryEnabled: false
    });
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

test("resets the authenticated Terminal Session and Agent defaults through /app/new without an AI call", async () => {
  const kv = new KV();
  const d1 = new PreferenceD1();
  d1.users.set("126679582", { language: "en" });
  d1.preferences.set("126679582", { mode: MODES.CODE, selectedModel: "@cf/meta/llama-3.2-1b-instruct", memoryEnabled: 1 });
  const env = { ...baseEnv(), IVAI_DB: d1, IVAI_KV: kv, AI: { async run() { throw new Error("/app/new must not call AI"); } } };
  const scope = "126679582:126679582:terminal:root";
  await saveConversationSession(scope, [{ role: "user", content: "Terminal old context" }], env, { now: Date.now() });
  const response = await worker.fetch(new Request("https://worker.test/app/new", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-init-data": signedWebAppInitData() },
    body: "{}"
  }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.settings, { language: "en", mode: MODES.AUTO, modelRoute: "auto", selectedModel: null, memoryEnabled: false });
  assert.equal(await getConversationSession(scope, env), null);
  assert.deepEqual(await getUserSettings(126679582, env), { language: "en", mode: MODES.AUTO, selectedModel: null, memoryEnabled: false });
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

test("resets Agent settings but preserves the interface language when /new starts a fresh chat", async () => {
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
    assert.match(reply.body.text, /گفتگوی تازه آماده است/);
    assert.match(reply.body.text, /حافظه خاموش است/);
    assert.equal(await getConversationSession(scope, env), null);
    assert.deepEqual(await getUserSettings(user.id, env), {
      language: "fa",
      mode: MODES.AUTO,
      selectedModel: null,
      memoryEnabled: false
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("turning memory off clears Telegram and Terminal Sessions without resetting other preferences", async () => {
  const originalFetch = globalThis.fetch;
  const kv = new KV();
  const db = new PreferenceD1();
  const user = { id: 4444, username: "memory_owner", first_name: "Memory owner" };
  const chat = { id: 5555, type: "private" };
  const env = { ...baseEnv(), IVAI_DB: db, IVAI_KV: kv };
  const chatScope = "5555:4444:main:root";
  const terminalScope = "4444:4444:terminal:root";
  await setUserLanguage(user.id, "fa", env);
  await setUserMode(user.id, MODES.CODE, env);
  await setSelectedModel(user.id, "@cf/zai-org/glm-4.7-flash", env);
  await setMemoryEnabled(user.id, true, env);
  await saveConversationSession(chatScope, [{ role: "user", content: "Telegram context" }], env);
  await saveConversationSession(terminalScope, [{ role: "user", content: "Terminal context" }], env);
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 888 } }), { status: 200 });
  };
  try {
    const update = { update_id: 1401, message: { message_id: 71, chat, from: user, text: "/memory off" } };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), env);
    assert.equal(response.status, 200);
    assert.equal(await getConversationSession(chatScope, env), null);
    assert.equal(await getConversationSession(terminalScope, env), null);
    assert.deepEqual(await getUserSettings(user.id, env), {
      language: "fa",
      mode: MODES.CODE,
      selectedModel: "@cf/zai-org/glm-4.7-flash",
      memoryEnabled: false
    });
    const reply = calls.find((call) => /sendMessage$/.test(call.url));
    assert.match(reply.body.text, /حافظه <b>خاموش<\/b> شد/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("renders an allow-listed Rich Markdown subset without trusting model HTML", () => {
  const source = [
    "# Build plan",
    "",
    "```js",
    "const unsafe = '<script>alert(1)</script>';",
    "```",
    "",
    "- first item",
    "- [x] done item",
    "- [ ] pending item",
    "",
    "1. ordered item",
    "",
    "---",
    "",
    "> quoted **note**",
    "",
    "<img src=x onerror=alert(1)>"
  ].join("\n");
  const rich = renderRichAiText(source);
  assert.match(rich, /<h1>Build plan<\/h1>/);
  assert.match(rich, /<pre><code class="language-js">const unsafe = &#39;&lt;script&gt;alert\(1\)&lt;\/script&gt;&#39;;<\/code><\/pre>/);
  assert.match(rich, /<ul><li>first item<\/li><li><input type="checkbox" checked> done item<\/li><li><input type="checkbox"> pending item<\/li><\/ul>/);
  assert.match(rich, /<ol><li>ordered item<\/li><\/ol>/);
  assert.match(rich, /<hr\/>/);
  assert.match(rich, /<blockquote>quoted <b>note<\/b><\/blockquote>/);
  assert.match(rich, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(rich, /<script|<img src=x/);
  const standard = renderStandardAiText(source);
  assert.match(standard, /&lt;script&gt;/);
  assert.doesNotMatch(standard, /<pre>|<ul>|<hr\/>/);
});

test("uses RTL rich drafts and final messages for Arabic responses", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  try {
    const env = { ...baseEnv(), AI: { async run() { return { response: "إجابة منظمة" }; } } };
    const update = {
      update_id: 2301,
      message: { message_id: 201, chat: { id: 42, type: "private" }, from: { id: 99, first_name: "Arabic", language_code: "ar" }, text: "مرحبا" }
    };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), env);
    assert.equal(response.status, 200);
    const draft = calls.find((call) => /sendRichMessageDraft$/.test(call.url));
    const final = calls.find((call) => /sendRichMessage$/.test(call.url));
    assert.equal(draft.body.rich_message.is_rtl, true);
    assert.equal(final.body.rich_message.is_rtl, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends structured safe Rich HTML for code and lists after a Rich Draft", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  try {
    const answer = ["## Steps", "", "```python", "print('<script>')", "```", "", "- [x] ready", "- [ ] next", "", "---"].join("\n");
    const env = { ...baseEnv(), AI: { async run() { return { response: answer }; } } };
    const update = { update_id: 2302, message: { message_id: 202, chat: { id: 42, type: "private" }, from: { id: 8 }, text: "Format the steps" } };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), env);
    assert.equal(response.status, 200);
    const final = calls.find((call) => /sendRichMessage$/.test(call.url));
    assert.match(final.body.rich_message.html, /<h2>Steps<\/h2>/);
    assert.match(final.body.rich_message.html, /<pre><code class="language-python">print\(&#39;&lt;script&gt;&#39;\)<\/code><\/pre>/);
    assert.match(final.body.rich_message.html, /<ul><li><input type="checkbox" checked> ready<\/li><li><input type="checkbox"> next<\/li><\/ul>/);
    assert.match(final.body.rich_message.html, /<hr\/>/);
    assert.doesNotMatch(final.body.rich_message.html, /<script>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps the standard HTML fallback free of Rich-only structural tags", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    const method = String(url).split("/").at(-1);
    if (method === "sendRichMessageDraft") return new Response(JSON.stringify({ ok: false, description: "Rich unavailable" }), { status: 400 });
    return new Response(JSON.stringify({ ok: true, result: method === "sendMessage" ? { message_id: 333 } : true }), { status: 200 });
  };
  try {
    const env = { ...baseEnv(), AI: { async run() { return { response: "```js\nconst x = 1;\n```\n- item\n---" }; } } };
    const update = { update_id: 2303, message: { message_id: 203, chat: { id: 42, type: "private" }, from: { id: 9 }, text: "Fallback format" } };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), env);
    assert.equal(response.status, 200);
    const final = calls.find((call) => /editMessageText$/.test(call.url) && /const x = 1/.test(call.body.text));
    assert.ok(final);
    assert.doesNotMatch(final.body.text, /<pre>|<ul>|<hr\/>/);
    assert.equal(final.body.parse_mode, "HTML");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("renders only small well-formed tables and opt-in visible details in Rich HTML", () => {
  const source = [
    "| Metric | Value |",
    "| --- | ---: |",
    "| Safe | **42** |",
    "| HTML | <script>alert(1)</script> |",
    "",
    ":::details Supporting notes",
    "Visible **context** only.",
    ":::enddetails"
  ].join("\n");
  const rich = renderRichAiText(source, { allowDetails: true });
  assert.match(rich, /<table><thead><tr><th>Metric<\/th><th>Value<\/th><\/tr><\/thead><tbody><tr><td>Safe<\/td><td><b>42<\/b><\/td><\/tr>/);
  assert.match(rich, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(rich, /<details><summary>Supporting notes<\/summary><p>Visible <b>context<\/b> only\.<\/p><\/details>/);
  assert.doesNotMatch(rich, /<script>/);
  const noDetails = renderRichAiText(source);
  assert.doesNotMatch(noDetails, /<details>/);
  assert.match(renderStandardAiText(source), /<b>Supporting notes<\/b>/);

  const oversized = ["| A | B |", "| --- | --- |", ...Array.from({ length: 13 }, (_, index) => `| ${index} | ${index} |`)].join("\n");
  assert.doesNotMatch(renderRichAiText(oversized), /<table>/);
});

test("renders bounded footnotes and allow-listed LaTeX only when Rich Math is enabled", () => {
  const source = [
    "Area is $\\pi r^2$[^units].",
    "",
    "$$",
    "E = mc^2",
    "$$",
    "",
    "```math",
    "\\frac{a}{b} = c",
    "```",
    "",
    "[^units]: Values use SI units."
  ].join("\n");
  const defaultRich = renderRichAiText(source);
  assert.doesNotMatch(defaultRich, /<tg-math/);
  assert.match(defaultRich, /<a href="#ivai-fn-units">\[units\]<\/a>/);
  assert.match(defaultRich, /<tg-reference name="ivai-fn-units">\[units\] Values use SI units\.<\/tg-reference>/);

  const rich = renderRichAiText(source, { allowMath: true });
  assert.match(rich, /<tg-math>\\pi r\^2<\/tg-math>/);
  assert.match(rich, /<tg-math-block>E = mc\^2<\/tg-math-block>/);
  assert.match(rich, /<tg-math-block>\\frac\{a\}\{b\} = c<\/tg-math-block>/);
  assert.doesNotMatch(rich, /\[\^units\]:/);

  const unsafe = renderRichAiText("Unsafe $\\href{https://evil.example}{x}$ and $<script>$", { allowMath: true });
  assert.doesNotMatch(unsafe, /<tg-math>/);
  assert.doesNotMatch(unsafe, /<script>/);
  assert.match(unsafe, /&lt;script&gt;/);

  const oversized = renderRichAiText(`$$${"x".repeat(1201)}$$`, { allowMath: true });
  assert.doesNotMatch(oversized, /<tg-math-block>/);
  assert.match(renderStandardAiText(source), /Area is \$\\pi r\^2\$\[units\]\./);
});

test("sends native math in a Rich final response only after Deep mode is selected", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let aiCalls = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  try {
    const env = { ...baseEnv(), IVAI_DB: new PreferenceD1(), AI: { async run(_model, payload) { aiCalls += 1; assert.match(payload.messages[0].content, /fenced `math` block/); return { response: "The area is $\\pi r^2$.\n\n```math\nA = \\pi r^2\n```" }; } } };
    const headers = { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" };
    const deepUpdate = { update_id: 2402, message: { message_id: 205, chat: { id: 42, type: "private" }, from: { id: 11 }, text: "/deep" } };
    const promptUpdate = { update_id: 2403, message: { message_id: 206, chat: { id: 42, type: "private" }, from: { id: 11 }, text: "Explain a circle area formula" } };
    assert.equal((await worker.fetch(new Request("https://worker.test/", { method: "POST", headers, body: JSON.stringify(deepUpdate) }), env)).status, 200);
    assert.equal((await worker.fetch(new Request("https://worker.test/", { method: "POST", headers, body: JSON.stringify(promptUpdate) }), env)).status, 200);
    assert.equal(aiCalls, 1);
    const final = calls.filter((call) => /sendRichMessage$/.test(call.url)).at(-1);
    assert.match(final.body.rich_message.html, /<tg-math>\\pi r\^2<\/tg-math>/);
    assert.match(final.body.rich_message.html, /<tg-math-block>A = \\pi r\^2<\/tg-math-block>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("renders an opt-in /details response as a visible details block in the final Rich Message", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  try {
    const answer = "Main answer.\n\n:::details Extra context\nVisible clarification only.\n:::enddetails";
    const env = { ...baseEnv(), AI: { async run(_model, payload) { return { response: answer, seenPrompt: payload }; } } };
    const update = { update_id: 2401, message: { message_id: 204, chat: { id: 42, type: "private" }, from: { id: 10 }, text: "/details explain the answer" } };
    const response = await worker.fetch(new Request("https://worker.test/", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
      body: JSON.stringify(update)
    }), env);
    assert.equal(response.status, 200);
    const final = calls.find((call) => /sendRichMessage$/.test(call.url));
    assert.match(final.body.rich_message.html, /<details><summary>Extra context<\/summary><p>Visible clarification only\.<\/p><\/details>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- Group gate (v3.4.0) -------------------------------------------------------

function groupTestEnv(calls, aiCalls, { enforced = "false", memberStatus = "member" } = {}) {
  return {
    ...baseEnv(),
    TELEGRAM_BOT_TOKEN: "424242:test-token",
    REQUIRED_CHANNEL_ENFORCED: enforced,
    IVAI_DB: new PreferenceD1(),
    // The stub answer ends with a period so channel-post comments pass the
    // v3.7.1 completeness guard (a bare "Group answer" would be skipped as
    // an unfinished fragment).
    AI: { async run(model, payload) { aiCalls.push({ model, payload }); return { response: "Group answer." }; } }
  };
}

function mockGroupFetch(calls, { memberStatus = "member" } = {}) {
  return async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : {} });
    if (/getChatMember$/.test(String(url))) return new Response(JSON.stringify({ ok: true, result: { status: memberStatus } }), { status: 200 });
    if (/getChat$/.test(String(url))) return new Response(JSON.stringify({ ok: true, result: { id: APP.requiredChannelId, type: "channel" } }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 900 } }), { status: 200 });
  };
}

// mockGroupFetch plus the file endpoints analyzePhoto/transcribeVoice need:
// getFile metadata and the raw file download behind it.
function mockGroupMediaFetch(calls, options) {
  const base = mockGroupFetch(calls, options);
  return async (url, init) => {
    const target = String(url);
    if (/getFile$/.test(target)) {
      calls.push({ url: target, body: init?.body ? JSON.parse(init.body) : {} });
      return new Response(JSON.stringify({ ok: true, result: { file_path: "photo.png", file_size: 4 } }), { status: 200 });
    }
    if (target.includes("/file/bot")) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/png" } });
    return base(url, init);
  };
}

function postGroupUpdate(env, update) {
  return worker.fetch(new Request("https://worker.test/", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" },
    body: JSON.stringify(update)
  }), env);
}

test("ignores a plain group message completely", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    const response = await postGroupUpdate(env, { update_id: 3001, message: { message_id: 1, chat: { id: -100111, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "hello everyone" } });
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("answers a group mention and strips the mention from the prompt", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    const response = await postGroupUpdate(env, { update_id: 3002, message: { message_id: 2, chat: { id: -100112, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "@IVAI_Llm_bot explain recursion", entities: [{ type: "mention", offset: 0, length: 13 }] } });
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    assert.equal(aiCalls[0].payload.messages.at(-1).content, "explain recursion");
    // Phase 6: groups get no thinking/progress message and no edit — exactly one
    // sendMessage that replies to the trigger message.
    assert.equal(calls.some((call) => /editMessageText$/.test(call.url)), false);
    const sends = calls.filter((call) => /sendMessage$/.test(call.url));
    assert.equal(sends.length, 1);
    assert.doesNotMatch(sends[0].body.text, /thinking/);
    assert.equal(sends[0].body.reply_parameters.message_id, 2);
    assert.match(sends[0].body.text, /Group answer/);
    // Group reply/mention turns show a typing indicator (restored in v3.6.1).
    assert.ok(calls.some((call) => /sendChatAction$/.test(call.url)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("answers a group reply to the bot's own message", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    const response = await postGroupUpdate(env, { update_id: 3003, message: { message_id: 3, chat: { id: -100113, type: "group" }, from: { id: 42, first_name: "A" }, text: "tell me more", reply_to_message: { message_id: 50, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" }, text: "Earlier answer" } } });
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    assert.equal(calls.some((call) => /editMessageText$/.test(call.url)), false);
    const sends = calls.filter((call) => /sendMessage$/.test(call.url));
    assert.equal(sends.length, 1);
    assert.equal(sends[0].body.reply_parameters.message_id, 3);
    assert.match(sends[0].body.text, /Group answer/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("answers a discussion-group thread reply to the bot's message", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    // Realistic linked-discussion-group shape: supergroup + comment thread id,
    // replying to a message the bot itself sent (matched by token bot ID).
    const update = { update_id: 3024, message: { message_id: 80, chat: { id: -100126, type: "supergroup" }, message_thread_id: 77, from: { id: 42, first_name: "A" }, text: "tell me more", reply_to_message: { message_id: 50, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" }, text: "Earlier answer" } } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    const sends = calls.filter((call) => /sendMessage$/.test(call.url));
    assert.equal(sends.length, 1);
    assert.equal(sends[0].body.reply_parameters.message_id, 80);
    assert.match(sends[0].body.text, /Group answer/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ignores a reply made directly on the channel post in the discussion group (owner decision, v3.7.9)", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    // The user comments on the post itself: the replied-to message is the
    // automatic forward (from 777000, sender_chat/forward_from_chat = channel).
    // The v3.7.9 owner decision removed the post_reply trigger (superseding
    // 2026-11-01): commenting on a post is not addressing the bot, so this is
    // ignored entirely — no AI call, no send, no Telegram call at all.
    const update = { update_id: 3025, message: { message_id: 81, chat: { id: -100115, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "I agree — what is your take?", reply_to_message: { message_id: 77, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, forward_from_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, text: "We released a new open-source tool for developers today." } } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.filter((call) => /sendMessage$/.test(call.url)).length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("answers an anonymous group admin replying to the bot, with no membership check", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    // GroupAnonymousBot: from.id 1087968824 and sender_chat is the group itself.
    const update = { update_id: 3026, message: { message_id: 82, chat: { id: -100127, type: "supergroup" }, from: { id: 1087968824, is_bot: true, first_name: "Group", username: "GroupAnonymousBot" }, sender_chat: { id: -100127, type: "supergroup", title: "Discussion" }, text: "tell me more", reply_to_message: { message_id: 50, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" }, text: "Earlier answer" } } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    // There is no user to check: getChatMember must never be called.
    assert.equal(calls.some((call) => /getChatMember$/.test(call.url)), false);
    const sends = calls.filter((call) => /sendMessage$/.test(call.url));
    assert.equal(sends.length, 1);
    assert.match(sends[0].body.text, /Group answer/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ignores a group command addressed to another bot", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    const response = await postGroupUpdate(env, { update_id: 3004, message: { message_id: 4, chat: { id: -100114, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "/start@OtherBot" } });
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("replies to a mother-channel post in the linked group with a short comment and no membership check", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    const response = await postGroupUpdate(env, { update_id: 3005, message: { message_id: 77, chat: { id: -100115, type: "supergroup" }, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, text: "We released a new open-source tool for developers today.\nIt turns plain Markdown notes into a fast static site in seconds.\nThe build finishes almost instantly for most projects.\nPlugins are written in JavaScript with a tiny, stable API.\nDocs and examples are live now — tell us what you build with it!" } });
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    // The prompt asks for ONE Mira-style comment, not a summary/opinion essay.
    assert.match(aiCalls[0].payload.messages.at(-1).content, /ONE comment/);
    assert.match(aiCalls[0].payload.messages.at(-1).content, /SAME language as the post/);
    assert.equal(calls.some((call) => /getChatMember$/.test(call.url)), false);
    const reply = calls.find((call) => /sendMessage$/.test(call.url));
    assert.equal(reply.body.reply_parameters.message_id, 77);
    assert.match(reply.body.text, /Group answer/);
    // Channel-post comments carry no model/mode footer in the group.
    assert.doesNotMatch(reply.body.text, /🪐|IVAI ·|GLM/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("comments on a Persian channel post in Persian, not English", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    const update = { update_id: 3022, message: { message_id: 78, chat: { id: -100115, type: "supergroup" }, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, text: "نسخه جدید بازی منتشر شد و خیلی‌ها منتظرش بودن!\nاین نسخه کلی مرحله، شخصیت و آیتم تازه به بازی اضافه می‌کنه.\nگرافیک و نورپردازی نسبت به نسخه قبلی خیلی بهتر شده.\nحجم دانلودش حدود بیست گیگابایته و از امشب در دسترسه.\nنظرتون رو درباره نسخه جدید با ما توی کامنت‌ها به اشتراک بذارید!" } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    // generateReply receives the post's own language (fa), so the system
    // instruction asks for Persian and the post text reaches the model.
    assert.match(aiCalls[0].payload.messages[0].content, /Respond in Persian/);
    assert.match(aiCalls[0].payload.messages.at(-1).content, /نسخه جدید بازی/);
    const reply = calls.find((call) => /sendMessage$/.test(call.url));
    assert.equal(reply.body.reply_parameters.message_id, 78);
    assert.doesNotMatch(reply.body.text, /🪐|IVAI ·|GLM/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("trims a channel-post comment longer than 5 lines down to 5", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = {
      ...groupTestEnv(calls, []),
      // Each line is a complete segment (terminal period) so the v3.7.1
      // completeness guard passes the trimmed comment through.
      AI: { async run() { return { response: "one.\ntwo.\nthree.\nfour.\nfive.\nsix.\nseven.\neight." }; } }
    };
    const update = { update_id: 3023, message: { message_id: 79, chat: { id: -100115, type: "supergroup" }, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, text: "Our community just passed ten thousand members this week.\nThank you to everyone who shares, comments, and helps newcomers.\nWe are planning a small celebration stream for Friday night.\nThere will be giveaways, a Q&A, and a look at the roadmap.\nBring your questions — the whole team will be there live." } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    const reply = calls.find((call) => /sendMessage$/.test(call.url));
    assert.match(reply.body.text, /five/);
    assert.doesNotMatch(reply.body.text, /six|seven|eight/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("comment completeness guard keeps complete comments and cuts or skips broken ones", () => {
  // v3.7.1: live truncated comments (reasoning ate the token budget) —
  // trimming the Binance one back leaves only a bare question, which is
  // not a take, so the whole comment is dropped.
  assert.equal(completeChannelComment("۶.۳ میلیارد دلار در ۲۰ دقیقه؟ اگر این یه جریان باشه، حتم"), "");
  // The carousel one trims back to its emoji-terminated first segment.
  assert.equal(
    completeChannelComment("از فردا دیگه توی هر اپلیکیشنی که باز کنی این افکت شیشه‌ای رو می‌بینی، چه ربطی داشته باشه چه نه 😄 ظاهرش فوق‌العاده‌ست، فقط خدا به داد"),
    "از فردا دیگه توی هر اپلیکیشنی که باز کنی این افکت شیشه‌ای رو می‌بینی، چه ربطی داشته باشه چه نه 😄"
  );
  // Complete comments pass through byte-identical, including a ZWJ emoji
  // cluster ending and a multi-segment comment that ends on a question.
  assert.equal(completeChannelComment("The verdict is simple: it works."), "The verdict is simple: it works.");
  assert.equal(completeChannelComment("زامبی‌ها برگشتن و شهر دیگه مال آدم‌ها نیست 🧟‍♂️"), "زامبی‌ها برگشتن و شهر دیگه مال آدم‌ها نیست 🧟‍♂️");
  assert.equal(completeChannelComment("قیمتش نصف شده! واقعاً کی فکرشو می‌کرد؟"), "قیمتش نصف شده! واقعاً کی فکرشو می‌کرد؟");
  // An English comment truncated after one complete sentence keeps it.
  assert.equal(
    completeChannelComment("The update ships today. It also fixes the crash on older phones and makes sync noticeably"),
    "The update ships today."
  );
  // One unfinished fragment, and a lone bare question, earn no comment.
  assert.equal(completeChannelComment("this changes everything about how the"), "");
  assert.equal(completeChannelComment("واقعاً قراره این اتفاق بیفته؟"), "");
  assert.equal(completeChannelComment(""), "");
});

test("skips a channel-post comment that generation truncated to a bare question", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = {
      ...groupTestEnv(calls, []),
      AI: { async run() { return { response: "۶.۳ میلیارد دلار در ۲۰ دقیقه؟ اگر این یه جریان باشه، حتم" }; } }
    };
    const update = { update_id: 3027, message: { message_id: 77, chat: { id: -100115, type: "supergroup" }, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, text: LONG_CHANNEL_POST } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    // The guard dropped the broken comment: nothing is sent at all.
    assert.equal(calls.some((call) => /sendMessage$/.test(call.url)), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("trims a truncated channel-post comment to its last complete segment before sending", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = {
      ...groupTestEnv(calls, []),
      AI: { async run() { return { response: "از فردا دیگه توی هر اپلیکیشنی که باز کنی این افکت شیشه‌ای رو می‌بینی، چه ربطی داشته باشه چه نه 😄 ظاهرش فوق‌العاده‌ست، فقط خدا به داد" }; } }
    };
    const update = { update_id: 3028, message: { message_id: 77, chat: { id: -100115, type: "supergroup" }, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, text: LONG_CHANNEL_POST } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    const reply = calls.find((call) => /sendMessage$/.test(call.url));
    assert.ok(reply);
    assert.match(reply.body.text, /چه ربطی داشته باشه چه نه/);
    assert.doesNotMatch(reply.body.text, /فقط خدا به داد/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("assigns channel-post comment modes in code: 60/40 draw, streak cap of 2–3 forces switches", () => {
  // v3.7.6: model self-selection skewed heavily to ANALYSIS, so the mode
  // is assigned deterministically in code. Drive a long synthetic
  // sequence through the real assignment + state transitions.
  let state = null;
  let fun = 0;
  let currentRun = 0;
  let previousMode = null;
  const total = 1000;
  for (let messageId = 1; messageId <= total; messageId += 1) {
    const before = state;
    const next = assignChannelCommentMode(state, { chat: { id: -100115 }, message_id: messageId });
    // A run that reached its cap forces the next comment to switch modes,
    // and the new run restarts with a freshly drawn cap.
    if (before && before.run >= before.cap) {
      assert.notEqual(next.mode, before.mode);
      assert.equal(next.run, 1);
    }
    if (next.mode === "fun") fun += 1;
    currentRun = next.mode === previousMode ? currentRun + 1 : 1;
    previousMode = next.mode;
    // No run ever exceeds the maximum cap, whatever the draws.
    assert.ok(currentRun <= 3, `run of ${next.mode} reached ${currentRun}`);
    state = next;
  }
  // The streak mechanics temper the raw 60/40 draw — runs of the majority
  // mode are cut at the cap more often — so the realized share over this
  // fixed sequence lands near 55%, inside this honest band around 60%.
  const share = fun / total;
  assert.ok(share >= 0.5 && share <= 0.62, `FUN share ${share} outside the expected band`);
});

test("mode assignment restarts the run on a switch and extends it on a repeat draw", () => {
  const message = { chat: { id: -100115 }, message_id: 500 };
  // No state: a fresh run of length 1 with a cap drawn from the range.
  const fresh = assignChannelCommentMode(null, message);
  assert.equal(fresh.run, 1);
  assert.ok(fresh.cap === 2 || fresh.cap === 3);
  // At the cap, the switch is forced regardless of the draw.
  const forced = assignChannelCommentMode({ mode: "analysis", run: 2, cap: 2 }, message);
  assert.equal(forced.mode, "fun");
  assert.equal(forced.run, 1);
  assert.ok(forced.cap === 2 || forced.cap === 3);
  // Below the cap: a same-mode draw extends the run and keeps the cap,
  // an opposite draw restarts the run with a fresh cap.
  const extended = assignChannelCommentMode({ mode: "fun", run: 1, cap: 3 }, message);
  if (extended.mode === "fun") {
    assert.equal(extended.run, 2);
    assert.equal(extended.cap, 3);
  } else {
    assert.equal(extended.run, 1);
    assert.ok(extended.cap === 2 || extended.cap === 3);
  }
});

test("code-assigned comment mode reaches the prompt and persists only after a send", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    const channelPost = (updateId, messageId) => ({ update_id: updateId, message: { message_id: messageId, chat: { id: -100115, type: "supergroup" }, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, text: LONG_CHANNEL_POST } });
    // Seed the streak at its cap in ANALYSIS: the next comment is forced
    // to FUN no matter what the per-post draw says.
    await env.IVAI_KV.put("comment_mode:-100115", JSON.stringify({ mode: "analysis", run: 2, cap: 2 }));
    // A sampled-out post never reaches generation, so it must leave the
    // streak state byte-identical.
    assert.equal((await postGroupUpdate(env, channelPost(3040, 80))).status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(await env.IVAI_KV.get("comment_mode:-100115"), JSON.stringify({ mode: "analysis", run: 2, cap: 2 }));

    assert.equal((await postGroupUpdate(env, channelPost(3041, 77))).status, 200);
    assert.equal(aiCalls.length, 1);
    const funPrompt = aiCalls[0].payload.messages.at(-1).content;
    assert.match(funPrompt, /This comment's mode is FUN/);
    assert.doesNotMatch(funPrompt, /This comment's mode is ANALYSIS/);
    assert.doesNotMatch(funPrompt, /Pick the mode/);
    // The comment was sent, and only then did the streak state advance.
    assert.ok(calls.some((call) => /sendMessage$/.test(call.url)));
    const afterFun = JSON.parse(await env.IVAI_KV.get("comment_mode:-100115"));
    assert.equal(afterFun.mode, "fun");
    assert.equal(afterFun.run, 1);
    assert.ok(afterFun.cap === 2 || afterFun.cap === 3);

    // The mirror image: a capped FUN streak forces the ANALYSIS line,
    // smart-friend definition included.
    await env.IVAI_KV.put("comment_mode:-100115", JSON.stringify({ mode: "fun", run: 3, cap: 3 }));
    assert.equal((await postGroupUpdate(env, channelPost(3042, 78))).status, 200);
    assert.equal(aiCalls.length, 2);
    const analysisPrompt = aiCalls[1].payload.messages.at(-1).content;
    assert.match(analysisPrompt, /This comment's mode is ANALYSIS/);
    assert.match(analysisPrompt, /the very smart friend/);
    const afterAnalysis = JSON.parse(await env.IVAI_KV.get("comment_mode:-100115"));
    assert.equal(afterAnalysis.mode, "analysis");
    assert.equal(afterAnalysis.run, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("flattens Rich Message blocks to plain text without throwing on malformed input", () => {
  // Nested formatting wrappers resolve to their innermost text.
  assert.equal(richTextToPlain({ type: "bold", text: { type: "italic", text: "hello" } }), "hello");
  assert.equal(richTextToPlain(["Price: ", { type: "bold", text: ["$5", { type: "code", text: "0" }] }]), "Price: $50");
  assert.equal(richTextToPlain("plain"), "plain");
  // Lists join items line by line; tables join cells with " | ", whether
  // rows are bare cell arrays or objects carrying a cells array.
  assert.equal(richBlockToPlain({ type: "list", items: [{ text: "one" }, { text: "two" }] }), "one\ntwo");
  assert.equal(
    richBlockToPlain({ type: "table", rows: [[{ text: "Name" }, { text: "Price" }], [{ text: "Apple" }, { text: "3" }]] }),
    "Name | Price\nApple | 3"
  );
  assert.equal(richBlockToPlain({ type: "table", rows: [{ cells: [{ text: "A" }, { text: "B" }] }] }), "A | B");
  // Nested containers and media collections recurse.
  assert.equal(
    richBlockToPlain({ type: "details", title: "More", blocks: [{ type: "paragraph", text: "inside" }] }),
    "More\ninside"
  );
  assert.equal(
    richBlockToPlain({ type: "collage", media: [{ type: "photo", caption: { text: "first" } }, { type: "photo", caption: { text: "second" } }] }),
    "first\nsecond"
  );
  // Media captions count as text, whether a caption object or a bare RichText.
  assert.equal(richBlockToPlain({ type: "photo", caption: { text: "a cat" } }), "a cat");
  assert.equal(richBlockToPlain({ type: "photo", caption: ["cap", { text: "tion" }] }), "caption");
  // Direct text/caption win over rich blocks; rich blocks are the fallback.
  assert.equal(messagePlainText({ text: "hello", rich_message: { blocks: [{ text: "rich" }] } }), "hello");
  assert.equal(messagePlainText({ caption: "cap" }), "cap");
  assert.equal(messagePlainText({ rich_message: { blocks: [{ type: "paragraph", text: "rich body" }] } }), "rich body");
  // Malformed input degrades to "" and never throws.
  assert.equal(richTextToPlain(null), "");
  assert.equal(richTextToPlain(42), "");
  assert.equal(richTextToPlain({}), "");
  assert.equal(richTextToPlain({ text: 42 }), "");
  assert.equal(richBlockToPlain(null), "");
  assert.equal(richBlockToPlain({ text: 42 }), "");
  assert.equal(messagePlainText(null), "");
  assert.equal(messagePlainText({}), "");
  assert.equal(messagePlainText({ rich_message: { blocks: "nope" } }), "");
  assert.equal(messagePlainText({ rich_message: { blocks: [null, 42, { text: "ok" }] } }), "ok");
  let deep = "bottom";
  for (let index = 0; index < 200; index += 1) deep = { text: deep };
  assert.equal(richTextToPlain(deep), "");
});

test("comments on a Persian Rich Message channel post, flattened from its blocks", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    // A Rich Message post (Bot API 10.1) carries no text/caption at all —
    // its content lives in rich_message.blocks (v3.7.3).
    const update = { update_id: 3030, message: { message_id: 77, chat: { id: -100115, type: "supergroup" }, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, rich_message: { is_rtl: true, blocks: [
      { type: "heading", text: "نسخه جدید ویرایشگر عکس ما منتشر شد" },
      { type: "paragraph", text: ["این نسخه با موتور پردازش تازه، ", { type: "bold", text: "خروجی گرفتن از عکس‌های حجیم را چند برابر سریع‌تر کرده" }, " و حالا از فرمت‌های حرفه‌ای هم پشتیبانی می‌کند تا عکاس‌ها بدون افت کیفیت کارشان را تحویل بدهند و پروژه‌ها را سریع‌تر از همیشه ببندند."] },
      { type: "list", items: [
        { text: "پشتیبانی کامل از فایل‌های خام دوربین‌های جدید بازار امروز" },
        { text: "حالت شب تازه برای عکس‌های کم‌نور با نویز بسیار کمتر از قبل" },
        { text: "همگام‌سازی ابری اختیاری برای ادامه کار روی چند دستگاه مختلف" }
      ] },
      { type: "table", rows: [
        [{ text: "قابلیت" }, { text: "نسخه قبلی" }, { text: "نسخه جدید" }],
        [{ text: "سرعت خروجی" }, { text: "معمولی" }, { text: "سه برابر سریع‌تر" }],
        [{ text: "حجم نصب" }, { text: "۴۰۰ مگابایت" }, { text: "۲۵۰ مگابایت" }]
      ] }
    ] } } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    const prompt = aiCalls[0].payload.messages.at(-1).content;
    // The model sees the flattened blocks: heading, paragraph, and table.
    assert.match(prompt, /ویرایشگر عکس/);
    assert.match(prompt, /سه برابر سریع‌تر/);
    // Language detection reads the same flattened text: the post is Persian.
    assert.match(aiCalls[0].payload.messages[0].content, /Respond in Persian/);
    const reply = calls.find((call) => /sendMessage$/.test(call.url));
    assert.equal(reply.body.reply_parameters.message_id, 77);
    assert.doesNotMatch(reply.body.text, /🪐|IVAI ·|GLM/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gives no comment to a Rich Message channel post whose blocks carry no text", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    // A lone photo block without a caption flattens to no text at all, so
    // the post is media-only — exactly like a photo post with no caption.
    const update = { update_id: 3031, message: { message_id: 77, chat: { id: -100115, type: "supergroup" }, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, rich_message: { blocks: [{ type: "photo", photo: { file_id: "ph1", width: 100, height: 100 } }] } } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.some((call) => /sendMessage$/.test(call.url)), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stores English for a brand-new user whose Telegram client is Persian", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    const response = await postGroupUpdate(env, { update_id: 3006, message: { message_id: 6, chat: { id: 555, type: "private" }, from: { id: 555, first_name: "New", language_code: "fa" }, text: "Hello, what can you do?" } });
    assert.equal(response.status, 200);
    assert.equal(env.IVAI_DB.users.get("555").language, "en");
    assert.match(aiCalls[0].payload.messages[0].content, /Respond in English/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends a Rich membership prompt with join buttons to a non-member who mentions the bot in a group", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls, { memberStatus: "left" });
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true", memberStatus: "left" });
    const response = await postGroupUpdate(env, { update_id: 3007, message: { message_id: 7, chat: { id: -100116, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "@IVAI_Llm_bot hi", entities: [{ type: "mention", offset: 0, length: 13 }] } });
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 0);
    const prompt = calls.find((call) => /sendRichMessage$/.test(call.url));
    assert.ok(prompt);
    const buttons = prompt.body.reply_markup.inline_keyboard.flat();
    assert.ok(buttons.some((button) => button.url === APP.requiredChannelUrl));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("skips a second immediate group mention in a non-primary chat (other-tier cooldown)", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    const mention = (updateId, messageId) => ({ update_id: updateId, message: { message_id: messageId, chat: { id: -100117, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "@IVAI_Llm_bot one question", entities: [{ type: "mention", offset: 0, length: 13 }] } });
    assert.equal((await postGroupUpdate(env, mention(3008, 8))).status, 200);
    assert.equal((await postGroupUpdate(env, mention(3009, 9))).status, 200);
    assert.equal(aiCalls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a rate-limited group mention before any user upsert or session write", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    const chatId = -100140;
    // Pre-seed the per-chat cooldown so passGroupLimits rejects immediately.
    await env.IVAI_KV.put(`groupcd:${chatId}`, "1");
    const statements = [];
    const originalPrepare = env.IVAI_DB.prepare.bind(env.IVAI_DB);
    env.IVAI_DB.prepare = (sql) => { statements.push(sql); return originalPrepare(sql); };
    const kvPuts = [];
    const originalPut = env.IVAI_KV.put.bind(env.IVAI_KV);
    env.IVAI_KV.put = async (key, value, options) => { kvPuts.push(key); return originalPut(key, value, options); };
    const mention = (updateId, messageId) => ({ update_id: updateId, message: { message_id: messageId, chat: { id: chatId, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "@IVAI_Llm_bot one question", entities: [{ type: "mention", offset: 0, length: 13 }] } });
    assert.equal((await postGroupUpdate(env, mention(3211, 41))).status, 200);
    // Rejected silently — no AI call, no message — and the rejection landed
    // before any settings/upsert/session work (v3.7.5): no user/chat upsert
    // statement ran and no Session key was written.
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.filter((call) => /sendMessage$/.test(call.url)).length, 0);
    assert.equal(statements.some((sql) => /INSERT INTO users|INSERT INTO chats/.test(sql)), false);
    assert.equal(kvPuts.some((key) => key.startsWith("session:")), false);
    // Admitted turns behave exactly as before: with the cooldown lifted, the
    // same mention is answered and does write the user and the Session.
    await env.IVAI_KV.delete(`groupcd:${chatId}`);
    statements.length = 0;
    kvPuts.length = 0;
    assert.equal((await postGroupUpdate(env, mention(3212, 42))).status, 200);
    assert.equal(aiCalls.length, 1);
    assert.equal(calls.filter((call) => /sendMessage$/.test(call.url)).length, 1);
    assert.ok(statements.some((sql) => sql.includes("INSERT INTO users")));
    assert.ok(kvPuts.some((key) => key.startsWith("session:")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends no standalone mode confirmation for a group callback, only the menu edit", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    const update = { update_id: 3010, callback_query: { id: "cb-group-mode", from: { id: 42, first_name: "A" }, data: "mode:fast", message: { message_id: 60, chat: { id: -100118, type: "supergroup" }, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" } } } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(calls.filter((call) => /sendMessage$/.test(call.url)).length, 0);
    const edit = calls.find((call) => /editMessageText$/.test(call.url));
    assert.ok(edit);
    assert.match(edit.body.text, /IVAI menu/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("threads every part of a long group answer to the trigger message", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = {
      ...groupTestEnv(calls, []),
      AI: { async run() { return { response: "lorem ".repeat(900) }; } }
    };
    const response = await postGroupUpdate(env, { update_id: 3011, message: { message_id: 21, chat: { id: -100119, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "@IVAI_Llm_bot long please", entities: [{ type: "mention", offset: 0, length: 13 }] } });
    assert.equal(response.status, 200);
    assert.equal(calls.some((call) => /editMessageText$/.test(call.url)), false);
    const sends = calls.filter((call) => /sendMessage$/.test(call.url));
    assert.ok(sends.length >= 2);
    for (const send of sends) assert.equal(send.body.reply_parameters.message_id, 21);
    // v3.5.0: no part of a group answer carries the model/mode footer,
    // including the last part (private chats still append it there).
    for (const send of sends) assert.doesNotMatch(send.body.text, /🪐/);
    assert.equal(sends.some((send) => /sent below/.test(send.body.text)), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("detects a mention after an emoji prefix using Telegram UTF-16 entity offsets", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    // "🔥" is one code point but two UTF-16 code units, so the mention starts at 3.
    const response = await postGroupUpdate(env, { update_id: 3012, message: { message_id: 22, chat: { id: -100120, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "🔥 @IVAI_Llm_bot explain fire", entities: [{ type: "mention", offset: 3, length: 13 }] } });
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    assert.equal(aiCalls[0].payload.messages.at(-1).content, "🔥 explain fire");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("blocks group media with the same per-chat cooldown as group text", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    const mention = { update_id: 3013, message: { message_id: 31, chat: { id: -100121, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "@IVAI_Llm_bot hi", entities: [{ type: "mention", offset: 0, length: 13 }] } };
    assert.equal((await postGroupUpdate(env, mention)).status, 200);
    assert.equal(aiCalls.length, 1);
    const callsBefore = calls.length;
    const photo = { update_id: 3014, message: { message_id: 32, chat: { id: -100121, type: "supergroup" }, from: { id: 42, first_name: "A" }, photo: [{ file_id: "ph1" }], reply_to_message: { message_id: 50, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" } } } };
    assert.equal((await postGroupUpdate(env, photo)).status, 200);
    const newCalls = calls.slice(callsBefore);
    assert.equal(newCalls.some((call) => /getFile$/.test(call.url)), false);
    assert.equal(aiCalls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- Membership fresh check (Phase 7a) -----------------------------------------

test("never caches a CHECK_FAILED membership result", async () => {
  const originalFetch = globalThis.fetch;
  let liveCalls = 0;
  globalThis.fetch = async () => {
    liveCalls += 1;
    return new Response(JSON.stringify({ ok: false, description: "Bad Request: bot is not an administrator" }), { status: 400 });
  };
  try {
    const env = { ...baseEnv(), REQUIRED_CHANNEL_ENFORCED: "true" };
    const first = await getRequiredChannelMembership(88, env);
    assert.equal(first.reason, "CHECK_FAILED");
    assert.equal(await env.IVAI_KV.get("member:88"), null);
    const second = await getRequiredChannelMembership(88, env);
    assert.equal(second.reason, "CHECK_FAILED");
    assert.equal(liveCalls, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("re-verifies a stale cached denial live before prompting, so a member gets a normal reply", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls, { memberStatus: "member" });
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    await env.IVAI_KV.put("member:42", JSON.stringify({ allowed: false, reason: "CHECKED", status: "left" }));
    const response = await postGroupUpdate(env, { update_id: 3015, message: { message_id: 41, chat: { id: 42, type: "private" }, from: { id: 42, first_name: "Member" }, text: "Hello IVAI" } });
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    assert.ok(calls.some((call) => /getChatMember$/.test(call.url)));
    const prompted = calls.some((call) =>
      /Join @ILIVIR3 to use IVAI/.test(call.body?.rich_message?.html || call.body?.text || ""));
    assert.equal(prompted, false);
    // The fresh definitive result replaced the stale cache entry.
    assert.equal(JSON.parse(await env.IVAI_KV.get("member:42")).allowed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("membership:check callback always checks live, ignoring a stale cached denial", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls, { memberStatus: "member" });
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    await env.IVAI_KV.put("member:42", JSON.stringify({ allowed: false, reason: "CHECKED", status: "left" }));
    const update = { update_id: 3016, callback_query: { id: "cb-fresh", from: { id: 42, first_name: "Member" }, data: "membership:check", message: { message_id: 43, chat: { id: 42, type: "private" }, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" } } } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    const alert = calls.find((call) => /answerCallbackQuery$/.test(call.url) && call.body.show_alert);
    assert.equal(alert, undefined);
    const edit = calls.find((call) => /editMessageText$/.test(call.url));
    assert.match(edit.body.rich_message.html, /Membership confirmed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ignores a manual forward of a channel post into another group", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    // A manual forward carries forward_from_chat but NOT sender_chat; only the
    // channel's own automatic forward into its linked group may trigger.
    const update = { update_id: 3017, message: { message_id: 51, chat: { id: -100122, type: "supergroup" }, from: { id: 42, first_name: "A" }, forward_from_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, text: "We released a new open-source tool for developers today." } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("skips a video channel post silently", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    const update = { update_id: 3018, message: { message_id: 52, chat: { id: -100115, type: "supergroup" }, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, video: { file_id: "vid9", mime_type: "video/mp4" } } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ignores a photo-only channel post — media-only posts get no comment", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupMediaFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    const update = { update_id: 3019, message: { message_id: 54, chat: { id: -100115, type: "supergroup" }, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, photo: [{ file_id: "small" }, { file_id: "large" }] } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    // v3.5.4 (owner decision superseding the Phase 8 vision reply): a
    // media-only post — photo included — earns no comment at all, even
    // though message 54 is sampled in. No AI call (analyzePhoto never runs:
    // no getFile, no vision call) and no send of any kind.
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ignores video and audio messages from group members with no membership check", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    const video = { update_id: 3020, message: { message_id: 61, chat: { id: -100124, type: "supergroup" }, from: { id: 42, first_name: "A" }, video: { file_id: "vid1", mime_type: "video/mp4" } } };
    const audio = { update_id: 3021, message: { message_id: 62, chat: { id: -100124, type: "supergroup" }, from: { id: 42, first_name: "A" }, audio: { file_id: "aud1", mime_type: "audio/mpeg" } } };
    assert.equal((await postGroupUpdate(env, video)).status, 200);
    assert.equal((await postGroupUpdate(env, audio)).status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ignores group media replied directly on the channel post (owner decision, v3.7.9)", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupMediaFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    // A photo attached to a comment on the post itself: the replied-to message
    // is the channel post's automatic forward, not a bot message, so the media
    // path must ignore it too — no file fetch, no AI call, no send.
    const update = { update_id: 3034, message: { message_id: 83, chat: { id: -100115, type: "supergroup" }, from: { id: 42, first_name: "A" }, photo: [{ file_id: "ph1" }], reply_to_message: { message_id: 77, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, forward_from_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, text: "We released a new open-source tool for developers today." } } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.some((call) => /getFile$/.test(call.url)), false);
    assert.equal(calls.filter((call) => /sendMessage$/.test(call.url)).length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("caps group media per chat in other-tier groups at 3 per hour", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupMediaFetch(calls);
  try {
    // No D1: allowUsage counters fall back to KV, which accumulates across
    // updates (PreferenceD1's counter stub does not). Cooldown is cleared
    // between sends so only the dedicated media cap can block the 4th photo.
    const env = { ...groupTestEnv(calls, aiCalls), IVAI_DB: undefined };
    const chatId = -100125;
    const photo = (updateId, messageId) => ({ update_id: updateId, message: { message_id: messageId, chat: { id: chatId, type: "supergroup" }, from: { id: 42, first_name: "A" }, photo: [{ file_id: "ph1" }], reply_to_message: { message_id: 50, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" } } } });
    for (let index = 0; index < 3; index += 1) {
      await env.IVAI_KV.delete(`groupcd:${chatId}`);
      assert.equal((await postGroupUpdate(env, photo(3030 + index, 71 + index))).status, 200);
    }
    assert.equal(calls.filter((call) => /getFile$/.test(call.url)).length, 3);
    assert.equal(calls.filter((call) => /sendMessage$/.test(call.url)).length, 3);
    await env.IVAI_KV.delete(`groupcd:${chatId}`);
    const callsBefore = calls.length;
    assert.equal((await postGroupUpdate(env, photo(3033, 74))).status, 200);
    const newCalls = calls.slice(callsBefore);
    assert.equal(newCalls.some((call) => /getFile$/.test(call.url)), false);
    assert.equal(newCalls.some((call) => /sendMessage$/.test(call.url)), false);
    assert.equal(aiCalls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- Phase 9 (v3.5.0): fast/light group turns, real-take comments, no group
// footer, message-language answers, reply-chain memory -------------------------

test("channel-post comment prompt is a persona with worked examples and hard rules", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    const update = { update_id: 3040, message: { message_id: 77, chat: { id: -100115, type: "supergroup" }, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, text: "France just passed a new per-gigabyte internet tax.\nHeavy downloads like games and 4K streams will cost the most.\nCritics are calling it a tax on modern life itself.\nSupporters say the biggest platforms should pay for bandwidth.\nThe first bills under the new law arrive next month." } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    const prompt = aiCalls[0].payload.messages.at(-1).content;
    // v3.7.0 rewrote the comment prompt from scratch: the accreted rule
    // list of v3.4.1–v3.6.4 (specific detail, silent who-did-what step,
    // catch-first anchor, comparison-as-exception, …) is replaced by a
    // short persona, worked examples that teach the voice, and a short
    // hard-rules block — the model still runs on Qwen3 30B.
    // v3.7.2: the prompt now teaches TWO modes chosen per post — FUN
    // (the three v3.7.0 examples, unchanged) and ANALYSIS (two new
    // examples: the smart friend naming what is good AND what else
    // matters — balanced, not a roast, not a verdict).
    // v3.7.6: the model no longer picks the mode — the code assigns it
    // (60/40 draw + streak cap) and the prompt states the assignment.
    // This post draws FUN under the deterministic assignment; the
    // ANALYSIS assignment line (and its smart-friend definition) is
    // asserted in the v3.7.6 mode-balance integration test below.
    assert.match(prompt, /witty regular of this group/);
    assert.match(prompt, /embarrassing, funny, revealing, or absurd beat/);
    assert.match(prompt, /This comment's mode is FUN/);
    assert.match(prompt, /Never mix the two modes in one comment/);
    assert.match(prompt, /FUN examples:/);
    assert.match(prompt, /ANALYSIS examples:/);
    assert.equal((prompt.match(/→ Comment:/g) || []).length, 5);
    assert.match(prompt, /انباره‌شون داره پر می‌شه/);
    assert.match(prompt, /همون کارت ۱۶ هزار دلاری انویدیا/);
    assert.match(prompt, /butt in every five seconds/);
    assert.match(prompt, /وزن سرویس‌های مایکروسافته تا خود ویندوز/);
    assert.match(prompt, /بیشتر یه نمایشه تا سیستمی برای استفاده‌ی روزمره/);
    assert.match(prompt, /PDFهات از دستگاهت بیرون نمی‌رن/);
    assert.match(prompt, /ذخیره‌سازی مرورگر برای یه آرشیو بزرگ مقاله‌ها زود سقف می‌خوره/);
    assert.match(prompt, /typically 1–3 short lines/);
    assert.match(prompt, /Always land something real/);
    assert.match(prompt, /in FUN mode a take — a prediction, or one line of cause-and-effect/);
    assert.match(prompt, /in ANALYSIS mode a balanced point/);
    assert.match(prompt, /One mode per comment — do not blend a joke into an analysis/);
    assert.match(prompt, /bare question/);
    assert.match(prompt, /No summaries, no report-speak/);
    assert.match(prompt, /could fit any post/);
    assert.match(prompt, /First person is opinions only/);
    assert.match(prompt, /never invent memories, possessions/);
    assert.match(prompt, /comparison only when it maps exactly/);
    assert.match(prompt, /most comments need none/);
    // 9A/9B: the comment call itself is Fast — but since v3.6.3 it is the
    // one group exception to the GLM pin, running on Qwen3 30B for
    // stronger multilingual quality (group replies keep the GLM pin,
    // asserted in the next test).
    assert.equal(aiCalls[0].model, "@cf/qwen/qwen3-30b-a3b-fp8");
    // v3.7.1: the prompt opens with Qwen3's /no_think soft switch so the
    // reasoning model spends no budget thinking, and the comment call
    // carries its own 1600-token budget instead of the Fast profile's 900.
    assert.match(prompt, /^\/no_think\n/);
    assert.equal(aiCalls[0].payload.max_tokens, 1600);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("group turns run Fast on the pinned GLM model, overriding stored mode and model", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    // The user's stored Deep mode and pinned heavy model must not leak into a
    // group turn; the group override is Fast + GLM 4.7 Flash (9A/9B).
    await setUserMode(42, MODES.DEEP, env);
    await setSelectedModel(42, "@cf/meta/llama-3.1-8b-instruct-fp8-fast", env);
    const update = { update_id: 3041, message: { message_id: 2, chat: { id: -100131, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "@IVAI_Llm_bot explain recursion", entities: [{ type: "mention", offset: 0, length: 13 }] } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    assert.equal(aiCalls[0].model, "@cf/zai-org/glm-4.7-flash");
    // Group replies keep the Fast profile's 900-token budget — the 1600
    // override is for channel-post comments only (v3.7.1).
    assert.equal(aiCalls[0].payload.max_tokens, 900);
    assert.equal(aiCalls[0].payload.max_tokens, modeOutputLimit(MODES.FAST));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("answers a Persian group trigger in Persian even with no stored language", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    // User 42 has no stored language; the trigger message itself is Persian,
    // so the group ANSWER is Persian (9E) while the UI default stays English.
    const update = { update_id: 3042, message: { message_id: 3, chat: { id: -100132, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "@IVAI_Llm_bot سلام، چطوری؟", entities: [{ type: "mention", offset: 0, length: 13 }] } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    assert.match(aiCalls[0].payload.messages[0].content, /Respond in Persian/);
    assert.equal(aiCalls[0].payload.messages.at(-1).content, "سلام، چطوری؟");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("group answers carry no footer while private answers still do", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    const mention = { update_id: 3043, message: { message_id: 4, chat: { id: -100133, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "@IVAI_Llm_bot hi there", entities: [{ type: "mention", offset: 0, length: 13 }] } };
    assert.equal((await postGroupUpdate(env, mention)).status, 200);
    const groupSend = calls.filter((call) => /sendMessage$/.test(call.url)).at(-1);
    assert.match(groupSend.body.text, /Group answer/);
    assert.doesNotMatch(groupSend.body.text, /🪐|IVAI ·/);
    const priv = { update_id: 3044, message: { message_id: 5, chat: { id: 43, type: "private" }, from: { id: 43, first_name: "B" }, text: "hello" } };
    assert.equal((await postGroupUpdate(env, priv)).status, 200);
    const rich = calls.filter((call) => /sendRichMessage$/.test(call.url)).at(-1);
    assert.ok(rich);
    assert.match(rich.body.rich_message.html, /🪐/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("injects the replied-to bot message into context and saves it with the turn", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    const update = { update_id: 3045, message: { message_id: 6, chat: { id: -100134, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "tell me more", reply_to_message: { message_id: 50, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" }, text: "Earlier answer about Mars" } } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    // The model sees the bot's earlier message as an assistant context turn.
    const context = aiCalls[0].payload.messages.slice(1, -1);
    assert.deepEqual(context, [{ role: "assistant", content: "Earlier answer about Mars" }]);
    // ...and it is persisted in the Session so later follow-ups keep it.
    const saved = await getConversationSession(conversationKey({ chatId: -100134, userId: 42, threadId: null }), env);
    assert.ok(saved.messages.some((entry) => entry.role === "assistant" && entry.content === "Earlier answer about Mars"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a follow-up replying to the bot's channel comment sees the post and the comment", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    const postText = "France just passed a new per-gigabyte internet tax that hits big downloads hardest.\nGamers say one major release could cost several euros in tax alone.\nInternet providers warn that bills will get more confusing.\nThe government says heavy users should pay their fair share.\nThe law takes effect at the start of next year.";
    const post = { update_id: 3046, message: { message_id: 77, chat: { id: -100115, type: "supergroup" }, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, text: postText } };
    assert.equal((await postGroupUpdate(env, post)).status, 200);
    assert.equal(aiCalls.length, 1);
    // The user replies to the bot's comment (the mock AI's "Group answer")
    // inside the post's comment thread and asks about the same topic.
    const followUp = { update_id: 3047, message: { message_id: 90, chat: { id: -100115, type: "supergroup" }, message_thread_id: 77, from: { id: 42, first_name: "A" }, text: "what's your take on the France thing?", reply_to_message: { message_id: 900, message_thread_id: 77, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" }, text: "Group answer" } } };
    assert.equal((await postGroupUpdate(env, followUp)).status, 200);
    assert.equal(aiCalls.length, 2);
    const context = aiCalls[1].payload.messages.slice(1, -1);
    // Both the original post and the bot's comment (which is also the replied
    // message) reach the model, so the follow-up cannot lose its topic.
    assert.ok(context.some((entry) => entry.role === "user" && entry.content.includes("France just passed")));
    assert.ok(context.some((entry) => entry.role === "assistant" && entry.content === "Group answer"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a follow-up outside the thread view still loads the thread seed via the reply target", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    const post = { update_id: 3048, message: { message_id: 77, chat: { id: -100115, type: "supergroup" }, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, text: "City council approves the new night-train line to the coast.\nTrains will run every night from Friday through Sunday.\nThe full trip takes about seven hours end to end.\nTickets start at twenty euros for a reclining seat.\nCoastal hotels expect a much busier summer season." } };
    assert.equal((await postGroupUpdate(env, post)).status, 200);
    assert.equal(aiCalls.length, 1);
    // Same follow-up, but sent from the main group view: the message itself
    // has no message_thread_id — only its reply target carries the thread id.
    const followUp = { update_id: 3049, message: { message_id: 91, chat: { id: -100115, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "and why does that matter?", reply_to_message: { message_id: 900, message_thread_id: 77, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" }, text: "Group answer" } } };
    assert.equal((await postGroupUpdate(env, followUp)).status, 200);
    assert.equal(aiCalls.length, 2);
    const context = aiCalls[1].payload.messages.slice(1, -1);
    assert.ok(context.some((entry) => entry.content.includes("night-train")));
    assert.ok(context.some((entry) => entry.role === "assistant" && entry.content === "Group answer"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("caps group model context at the last 5 chain messages", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    const scope = conversationKey({ chatId: -100135, userId: 42, threadId: null });
    await saveConversationSession(scope, [
      { role: "user", content: "ctx-1" },
      { role: "assistant", content: "ctx-2" },
      { role: "user", content: "ctx-3" },
      { role: "assistant", content: "ctx-4" },
      { role: "user", content: "ctx-5" },
      { role: "assistant", content: "ctx-6" }
    ], env);
    const update = { update_id: 3050, message: { message_id: 7, chat: { id: -100135, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "@IVAI_Llm_bot continue please", entities: [{ type: "mention", offset: 0, length: 13 }] } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    // System + exactly the last 5 context messages + the current user turn.
    const context = aiCalls[0].payload.messages.slice(1, -1);
    assert.deepEqual(context.map((entry) => entry.content), ["ctx-2", "ctx-3", "ctx-4", "ctx-5", "ctx-6"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- Phase 10 (v3.5.1): channel-post comment sampling/skips, typing --------
// (v3.6.1: typing is back for group reply/mention turns — the ordering tests
// at the end of this section assert it there — while channel-post comments
// stay typing-free, as they have been since v3.6.0.)

const LONG_CHANNEL_POST = "We released a new open-source tool for developers today.\nIt turns plain Markdown notes into a fast static site in seconds.\nThe build finishes almost instantly for most projects.\nPlugins are written in JavaScript with a tiny, stable API.\nDocs and examples are live now — tell us what you build with it!";

function channelPostUpdate(updateId, messageId, extra) {
  return { update_id: updateId, message: { message_id: messageId, chat: { id: -100115, type: "supergroup" }, from: { id: 777000, first_name: "Telegram" }, sender_chat: { id: APP.requiredChannelId, type: "channel", title: "ILIVIR3" }, ...extra } };
}

test("channel-post sampling is stable per post and keeps about 75% of posts", () => {
  const message = (messageId) => ({ chat: { id: -100115 }, message_id: messageId });
  assert.equal(GROUP_POLICY.channelPostReplyRate, 0.75);
  // Exact verdicts for chat -100115 that the fixtures in this suite rely on.
  assert.equal(channelPostSampled(message(77)), true);
  assert.equal(channelPostSampled(message(78)), true);
  assert.equal(channelPostSampled(message(54)), true);
  assert.equal(channelPostSampled(message(43)), false);
  assert.equal(channelPostSampled(message(58)), false);
  // Stable: the same post always gets the same verdict.
  assert.equal(channelPostSampled(message(123)), channelPostSampled(message(123)));
  let kept = 0;
  for (let id = 1; id <= 1000; id += 1) if (channelPostSampled(message(id))) kept += 1;
  assert.ok(kept >= 700 && kept <= 800, `kept ${kept} of 1000 posts`);
});

test("skips short channel posts silently — by character count and by word count", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    // Plenty of words, but under 200 characters in total: short by length.
    const manyWords = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty";
    assert.ok(manyWords.length < 200);
    assert.ok(manyWords.split(/\s+/).filter(Boolean).length >= 20);
    assert.equal((await postGroupUpdate(env, channelPostUpdate(3100, 100, { text: manyWords }))).status, 200);
    // Well over 200 characters, but fewer than 20 words: short by word count.
    const fewWords = Array(12).fill("a".repeat(30)).join(" ");
    assert.ok(fewWords.length >= 200);
    assert.ok(fewWords.split(/\s+/).filter(Boolean).length < 20);
    assert.equal((await postGroupUpdate(env, channelPostUpdate(3101, 101, { text: fewWords }))).status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("comments on a paragraph-style channel post with few lines but enough content", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    // Regression (v3.5.5): only 3 non-empty lines, but 277 characters and
    // 50 words — a substantial post that the old line-count rule wrongly
    // skipped as short. Message 100 in chat -100115 is sampled in.
    const paragraphPost = "A very long opening line that goes on and on about the announcement and why it matters to everyone here.\nA second long line with even more detail about the features, the roadmap, and all the people involved.\nA third long line wrapping things up with links, credits, and thanks.";
    assert.equal(paragraphPost.split("\n").filter((line) => line.trim()).length, 3);
    assert.ok(paragraphPost.length >= 200);
    assert.ok(paragraphPost.split(/\s+/).filter(Boolean).length >= 20);
    const response = await postGroupUpdate(env, channelPostUpdate(3115, 100, { text: paragraphPost }));
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    const sends = calls.filter((call) => /sendMessage$/.test(call.url));
    assert.equal(sends.length, 1);
    assert.equal(sends[0].body.reply_parameters.message_id, 100);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("skips a long channel post that is sampled out, silently", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    // Message 43 in chat -100115 hashes above the 75% keep rate (see the
    // sampling test), so even a fully eligible long post gets no comment.
    assert.equal((await postGroupUpdate(env, channelPostUpdate(3102, 43, { text: LONG_CHANNEL_POST }))).status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("never comments on media-only sticker or animation channel posts", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    assert.equal((await postGroupUpdate(env, channelPostUpdate(3103, 102, { sticker: { file_id: "stk1" } }))).status, 200);
    assert.equal((await postGroupUpdate(env, channelPostUpdate(3104, 103, { animation: { file_id: "gif1" } }))).status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("comments on a video channel post from its long Persian caption", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    // v3.5.4: the caption IS the post text — a media post with a long
    // caption is commented from the caption, whatever media it carries.
    // Message 120 in chat -100115 is sampled in (see the sampling test).
    const caption = "ترایلر رسمی بازی جدید منتشر شد و طرفدارها حسابی ذوق کردن!\nتوی این ویدیو چند مرحله و شخصیت تازه رو برای اولین بار می‌بینیم.\nگرافیک و نورپردازی نسبت به نسخه قبلی خیلی بهتر شده و جزئیات محیط فوق‌العاده‌ست.\nحجم دانلودش حدود بیست گیگابایته و از امشب برای همه در دسترسه.\nنظرتون رو درباره این ترایلر با ما توی کامنت‌ها به اشتراک بذارید!";
    const response = await postGroupUpdate(env, channelPostUpdate(3113, 120, { video: { file_id: "vid7", mime_type: "video/mp4" }, caption }));
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    // generateReply received the caption as the post text, in Persian.
    assert.match(aiCalls[0].payload.messages[0].content, /Respond in Persian/);
    assert.match(aiCalls[0].payload.messages.at(-1).content, /ترایلر رسمی بازی جدید/);
    const sends = calls.filter((call) => /sendMessage$/.test(call.url));
    assert.equal(sends.length, 1);
    assert.equal(sends[0].body.reply_parameters.message_id, 120);
    assert.match(sends[0].body.text, /Group answer/);
    // Channel-post comments carry no model/mode footer in the group.
    assert.doesNotMatch(sends[0].body.text, /🪐|IVAI ·|GLM/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("skips a video channel post whose caption is short, as a short post", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    // Message 123 is sampled in, so only the short-caption rule can block
    // it: a caption counts as post text, and this one is genuinely small
    // by the amount metric (33 characters, 7 words).
    const caption = "یه کلیپ کوتاه!\nببینید و لذت ببرید";
    assert.equal((await postGroupUpdate(env, channelPostUpdate(3114, 123, { video: { file_id: "vid8", mime_type: "video/mp4" }, caption }))).status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("skips a photo-only channel post silently — no vision call", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupMediaFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    // Photo-only posts are media-only: skipped before sampling is even
    // consulted, so not even a getFile call may happen.
    assert.equal((await postGroupUpdate(env, channelPostUpdate(3106, 58, { photo: [{ file_id: "small" }, { file_id: "large" }] }))).status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("skipped channel posts do not consume the hourly comment bucket", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    // No D1: allowUsage falls back to KV counters, which accumulate across
    // updates (the same trick as the group media cap test).
    const env = { ...groupTestEnv(calls, aiCalls, { enforced: "true" }), IVAI_DB: undefined };
    await postGroupUpdate(env, channelPostUpdate(3110, 95, { text: "Short one." }));
    await postGroupUpdate(env, channelPostUpdate(3111, 92, { text: LONG_CHANNEL_POST }));
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 0);
    // The full 10-per-hour bucket is still there for real comments: if the
    // two skips above had burned quota, only 8 of these would be answered.
    const keptIds = [100, 101, 102, 103, 104, 106, 107, 109, 110, 111];
    for (const [index, id] of keptIds.entries()) {
      assert.equal((await postGroupUpdate(env, channelPostUpdate(3120 + index, id, { text: LONG_CHANNEL_POST }))).status, 200);
    }
    assert.equal(aiCalls.length, 10);
    assert.equal(calls.filter((call) => /sendMessage$/.test(call.url)).length, 10);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("typing refresher re-sends every ~4 seconds until stopped; stop is idempotent", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : {} });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const typing = startTypingRefresher(baseEnv(), { chatId: -100115, threadId: 77 });
    const actions = () => calls.filter((call) => /sendChatAction$/.test(call.url));
    const flush = async () => { for (let index = 0; index < 50; index += 1) await Promise.resolve(); };
    // The refresher fires nothing on its own at t=0: each group call site
    // sends the first typing action itself before starting the refresher.
    await flush();
    assert.equal(actions().length, 0);
    t.mock.timers.tick(4000);
    await flush();
    assert.equal(actions().length, 1);
    assert.equal(actions()[0].body.action, "typing");
    // The delivery context is threaded into the comment thread.
    assert.equal(actions()[0].body.message_thread_id, 77);
    t.mock.timers.tick(4000);
    await flush();
    assert.equal(actions().length, 2);
    await typing.stop();
    // No leak: the interval cannot outlive stop().
    t.mock.timers.tick(20000);
    await flush();
    assert.equal(actions().length, 2);
    // A second stop is harmless.
    await typing.stop();
  } finally {
    t.mock.timers.reset();
    globalThis.fetch = originalFetch;
  }
});

test("thinking animation edits every 2 seconds and never sends typing actions", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : {} });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 });
  };
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const animation = startThinkingAnimation(baseEnv(), { chatId: 42, messageId: 7 });
    const edits = () => calls.filter((call) => /editMessageText$/.test(call.url));
    const actions = () => calls.filter((call) => /sendChatAction$/.test(call.url));
    const flush = async () => { for (let index = 0; index < 50; index += 1) await Promise.resolve(); };
    await flush();
    assert.equal(edits().length, 0);
    // The old 900 ms cadence would already have ticked by now (v3.7.5).
    t.mock.timers.tick(900);
    await flush();
    assert.equal(edits().length, 0);
    t.mock.timers.tick(1100);
    await flush();
    assert.equal(edits().length, 1);
    assert.match(edits()[0].body.text, /is thinking\.\./);
    t.mock.timers.tick(2000);
    await flush();
    assert.equal(edits().length, 2);
    // The animated progress message is the indicator: no typing calls at all.
    assert.equal(actions().length, 0);
    await animation.stop();
    // No leak: the interval cannot outlive stop().
    t.mock.timers.tick(20000);
    await flush();
    assert.equal(edits().length, 2);
    // A second stop is harmless.
    await animation.stop();
  } finally {
    t.mock.timers.reset();
    globalThis.fetch = originalFetch;
  }
});

// An env whose AI calls join the same ordered log as the Telegram calls, so
// tests can assert that typing starts before generation in each group path.
function markerAiEnv(calls, aiCalls) {
  return {
    ...groupTestEnv(calls, aiCalls),
    AI: { async run(model, payload) { calls.push({ url: "ai:run", body: {} }); aiCalls.push({ model, payload }); return { response: "Group answer." }; } }
  };
}

test("group text turns send typing before the AI call, threaded to the comment thread", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = markerAiEnv(calls, aiCalls);
    const update = { update_id: 3130, message: { message_id: 80, chat: { id: -100126, type: "supergroup" }, message_thread_id: 77, from: { id: 42, first_name: "A" }, text: "tell me more", reply_to_message: { message_id: 50, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" }, text: "Earlier answer" } } };
    assert.equal((await postGroupUpdate(env, update)).status, 200);
    const typingIndex = calls.findIndex((call) => /sendChatAction$/.test(call.url));
    const aiIndex = calls.findIndex((call) => call.url === "ai:run");
    const sendIndex = calls.findIndex((call) => /sendMessage$/.test(call.url));
    assert.ok(typingIndex !== -1 && aiIndex !== -1 && sendIndex !== -1);
    assert.ok(typingIndex < aiIndex && aiIndex < sendIndex);
    assert.equal(calls[typingIndex].body.message_thread_id, 77);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("group media turns send typing before the AI call", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupMediaFetch(calls);
  try {
    const env = markerAiEnv(calls, aiCalls);
    const update = { update_id: 3131, message: { message_id: 66, chat: { id: -100128, type: "supergroup" }, from: { id: 42, first_name: "A" }, photo: [{ file_id: "ph1" }], reply_to_message: { message_id: 50, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" } } } };
    assert.equal((await postGroupUpdate(env, update)).status, 200);
    const typingIndex = calls.findIndex((call) => /sendChatAction$/.test(call.url));
    const aiIndex = calls.findIndex((call) => call.url === "ai:run");
    const sendIndex = calls.findIndex((call) => /sendMessage$/.test(call.url));
    assert.ok(typingIndex !== -1 && aiIndex !== -1 && sendIndex !== -1);
    assert.ok(typingIndex < aiIndex && aiIndex < sendIndex);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("channel-post comments send no typing indicator, just the comment", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = { ...markerAiEnv(calls, aiCalls), REQUIRED_CHANNEL_ENFORCED: "true" };
    assert.equal((await postGroupUpdate(env, channelPostUpdate(3132, 77, { text: LONG_CHANNEL_POST }))).status, 200);
    // Channel-post comments stay typing-free (v3.6.0, kept in v3.6.1): no
    // sendChatAction anywhere in this path, unlike reply/mention turns.
    assert.equal(calls.some((call) => /sendChatAction$/.test(call.url)), false);
    const aiIndex = calls.findIndex((call) => call.url === "ai:run");
    const sendIndex = calls.findIndex((call) => /sendMessage$/.test(call.url));
    assert.ok(aiIndex !== -1 && sendIndex !== -1);
    assert.ok(aiIndex < sendIndex);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// v3.7.7 surgery pins: fail-soft storage, webhook logging, owner exemption,
// media timeouts, claim/release symmetry, cleanup formats, memory-button
// idempotency, the media language contract, and the audited coverage gaps.
// ---------------------------------------------------------------------------

class UnreliableKV extends KV {
  async put() { throw new Error("KV write failed: namespace unavailable (10042)"); }
  async delete() { throw new Error("KV delete failed: namespace unavailable (10042)"); }
}

test("completes a private text turn even when every session KV write fails", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    // Group helpers give a working D1 + AI stub; only KV is broken, so the
    // session put inside ensureConversationSession throws — the turn must
    // still complete with the in-memory session instead of a 500.
    const env = { ...groupTestEnv(calls, aiCalls), IVAI_KV: new UnreliableKV() };
    const update = { update_id: 4001, message: { message_id: 1, chat: { id: 42, type: "private" }, from: { id: 42, first_name: "A" }, text: "Hello IVAI" } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 1);
    assert.ok(calls.some((call) => JSON.stringify(call.body).includes("Group answer")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("completes /start even when the session KV deletes fail", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = { ...groupTestEnv(calls, aiCalls), IVAI_KV: new UnreliableKV() };
    const update = { update_id: 4002, message: { message_id: 2, chat: { id: 42, type: "private" }, from: { id: 42, first_name: "A" }, text: "/start" } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.ok(calls.some((call) => /sendRichMessage$/.test(call.url) && /your free AI assistant/.test(call.body.rich_message.html)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("logs a structured webhook_unauthorized event with the rejection reason", async () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const mismatch = await worker.fetch(new Request("https://worker.test/", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong-secret" }, body: "{}" }), baseEnv());
    assert.equal(mismatch.status, 401);
    const mismatchEvent = warnings.map((line) => { try { return JSON.parse(line); } catch { return null; } }).find((entry) => entry?.event === "webhook_unauthorized");
    assert.equal(mismatchEvent?.reason, "secret_mismatch");

    warnings.length = 0;
    const { TELEGRAM_WEBHOOK_SECRET: _unset, ...envWithoutSecret } = baseEnv();
    const unset = await worker.fetch(new Request("https://worker.test/", { method: "POST", body: "{}" }), envWithoutSecret);
    assert.equal(unset.status, 401);
    const unsetEvent = warnings.map((line) => { try { return JSON.parse(line); } catch { return null; } }).find((entry) => entry?.event === "webhook_unauthorized");
    assert.equal(unsetEvent?.reason, "secret_unset");
    // No secret material anywhere in the log lines.
    assert.ok(!warnings.join(" ").includes("valid-secret"));
  } finally {
    console.warn = originalWarn;
  }
});

test("exempts the owner from the membership gate when the check itself fails, but not a regular user", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  // getChatMember errors for every reference (CHECK_FAILED): before v3.7.7
  // this locked out everyone, owner included.
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : {} });
    if (/getChatMember$/.test(String(url))) return new Response(JSON.stringify({ ok: false, description: "Bad Request: bot is not an administrator in the channel" }), { status: 400 });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 900 } }), { status: 200 });
  };
  try {
    const env = groupTestEnv(calls, aiCalls, { enforced: "true" });
    const ownerUpdate = { update_id: 4003, message: { message_id: 3, chat: { id: 42, type: "private" }, from: { id: 126679582, first_name: "Owner" }, text: "Hello IVAI" } };
    assert.equal((await postGroupUpdate(env, ownerUpdate)).status, 200);
    assert.equal(aiCalls.length, 1);
    assert.equal(calls.filter((call) => /getChatMember$/.test(call.url)).length, 0);
    assert.ok(!calls.some((call) => JSON.stringify(call.body).includes("Join @ILIVIR3 to use IVAI")));

    const memberUpdate = { update_id: 4004, message: { message_id: 4, chat: { id: 42, type: "private" }, from: { id: 555001, first_name: "Member" }, text: "Hello IVAI" } };
    assert.equal((await postGroupUpdate(env, memberUpdate)).status, 200);
    assert.equal(aiCalls.length, 1);
    assert.ok(calls.some((call) => /getChatMember$/.test(call.url)));
    assert.ok(calls.some((call) => JSON.stringify(call.body).includes("Join @ILIVIR3 to use IVAI")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("exempts the owner from the Terminal membership gate too", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : {} });
    // Even with the membership check hard-failing, the owner gets a session.
    return new Response(JSON.stringify({ ok: false, description: "Bad Request" }), { status: 400 });
  };
  try {
    const response = await worker.fetch(new Request("https://worker.test/app/session", { method: "POST", headers: { "x-telegram-init-data": signedWebAppInitData() }, body: "{}" }), { ...baseEnv(), REQUIRED_CHANNEL_ENFORCED: "true" });
    assert.equal(response.status, 200);
    assert.equal(calls.filter((call) => /getChatMember$/.test(call.url)).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("voice and photo AI calls time out instead of hanging on a stuck binding call", async (t) => {
  const originalFetch = globalThis.fetch;
  const binary = new Uint8Array([1, 2, 3, 4]);
  globalThis.fetch = async (url) => {
    if (String(url).includes("getFile")) return new Response(JSON.stringify({ ok: true, result: { file_path: "asset.bin", file_size: binary.byteLength } }), { status: 200 });
    return new Response(binary, { status: 200, headers: { "content-type": "image/jpeg" } });
  };
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const env = { ...baseEnv(), AI: { run: () => new Promise(() => {}) } };
    const voice = await driveUntilSettled(t, transcribeVoice({ fileId: "voice", languageHint: "en" }, env));
    assert.equal(voice.ok, false);
    assert.match(voice.error.message, /timed out after 25000ms/);
    const photo = await driveUntilSettled(t, analyzePhoto({ fileId: "photo", caption: "Describe", language: "en" }, env));
    assert.equal(photo.ok, false);
    assert.match(photo.error.message, /timed out after 25000ms/);
  } finally {
    t.mock.timers.reset();
    globalThis.fetch = originalFetch;
  }
});

test("releases a KV-fallback update claim even when the D1 delete changes nothing", async () => {
  const kv = new KV();
  let d1Down = true;
  const d1 = {
    prepare(sql) {
      return {
        bind: () => ({
          run: async () => {
            if (d1Down) throw new Error("D1 unavailable");
            return { meta: { changes: sql.includes("INSERT") ? 1 : 0 } };
          }
        })
      };
    }
  };
  const env = { ...baseEnv(), IVAI_DB: d1, IVAI_KV: kv };
  // Claim while D1 errors: the claim lands in KV only.
  assert.equal(await claimUpdate(777, env), true);
  assert.equal(await kv.get("dedupe:update:777"), "1");
  assert.equal(await claimUpdate(777, env), false);
  // D1 recovers before release: its DELETE succeeds but matches no row, so
  // only an unconditional KV delete actually releases the claim.
  d1Down = false;
  await releaseUpdateClaim(777, env);
  assert.equal(await kv.get("dedupe:update:777"), null);
  assert.equal(await claimUpdate(777, env), true);
});

function sqliteD1(db) {
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      const bound = (...params) => ({
        run: async () => ({ meta: { changes: Number(statement.run(...params).changes) } }),
        first: async () => statement.get(...params) ?? null,
        all: async () => ({ results: statement.all(...params) })
      });
      return { bind: bound, ...bound() };
    }
  };
}

test("runtime-guard cleanup deletes rows whose ISO expiry is earlier the same UTC day", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("../db/0002_runtime_guards.sql", import.meta.url), "utf8"));
    const now = Date.now();
    const startOfDay = new Date(now).setUTCHours(0, 0, 0, 0);
    // An expiry between UTC midnight and now: 'T'-format ISO, so the old
    // CURRENT_TIMESTAMP (space separator) comparison never matched it.
    const expiredToday = new Date(startOfDay + Math.max(1, Math.floor((now - startOfDay) / 2))).toISOString();
    const future = new Date(now + 60 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO processed_updates (telegram_update_id, expires_at) VALUES (?, ?)").run("expired", expiredToday);
    db.prepare("INSERT INTO processed_updates (telegram_update_id, expires_at) VALUES (?, ?)").run("future", future);
    db.prepare("INSERT INTO runtime_counters (scope, subject_id, bucket, value, expires_at) VALUES (?, ?, ?, ?, ?)").run("text", "1", "b", 1, expiredToday);
    db.prepare("INSERT INTO runtime_counters (scope, subject_id, bucket, value, expires_at) VALUES (?, ?, ?, ?, ?)").run("text", "2", "b", 1, future);
    await cleanupRuntimeGuards({ IVAI_DB: sqliteD1(db) });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM processed_updates WHERE telegram_update_id = 'expired'").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM processed_updates WHERE telegram_update_id = 'future'").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM runtime_counters WHERE expires_at = ?").get(expiredToday).count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM runtime_counters WHERE expires_at = ?").get(future).count, 1);
  } finally {
    db.close();
  }
});

test("stores language with real SQL semantics: an explicit choice survives later upserts", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of ["0001_initial_schema.sql", "0002_runtime_guards.sql", "0003_secretary_reminders.sql", "0004_reengagement.sql", "0005_broadcast_claims.sql", "0006_reset_language_to_english.sql", "0007_user_api_configs.sql"]) {
      db.exec(readFileSync(new URL(`../db/${file}`, import.meta.url), "utf8"));
    }
    const env = { IVAI_DB: sqliteD1(db) };
    const message = (id) => ({ user: { id, username: "a", first_name: "A" }, chat: { id, type: "private" } });
    // First contact stores what the router passes (English by default).
    await upsertUser({ ...message(42), language: "en" }, env);
    assert.equal((await getUserSettings(42, env)).language, "en");
    // An explicit /lang choice overwrites it.
    await setUserLanguage(42, "fa", env);
    assert.equal((await getUserSettings(42, env)).language, "fa");
    // A later routine upsert must not clobber the choice: the SQL COALESCE
    // keeps the stored value (this is what the SQL ships, not a stub).
    await upsertUser({ ...message(42), language: "en" }, env);
    assert.equal((await getUserSettings(42, env)).language, "fa");
    // The mirror image holds too: a stored 'fa' from first contact survives.
    await upsertUser({ ...message(43), language: "fa" }, env);
    await upsertUser({ ...message(43), language: "en" }, env);
    assert.equal((await getUserSettings(43, env)).language, "fa");
  } finally {
    db.close();
  }
});

test("the Memory settings button applies its named target idempotently; the legacy value still toggles", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : {} });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 505 } }), { status: 200 });
  };
  try {
    // The keyboard names the state it switches TO. The memory button is
    // found by its callback, not its row — v3.9.0 moves My API out of
    // Settings and into the main menu (owner-approved BYOK v2 Phase 1).
    const memoryButton = (keyboard) => keyboard.inline_keyboard.flat().find((button) => button.callback_data?.startsWith("settings:memory:"));
    assert.equal(memoryButton(settingsKeyboard("en", true)).callback_data, "settings:memory:off");
    assert.equal(memoryButton(settingsKeyboard("en", false)).callback_data, "settings:memory:on");
    assert.equal(settingsKeyboard("en", true).inline_keyboard.flat().some((button) => button.callback_data?.startsWith("byok:")), false);
    assert.equal(modeKeyboard("en").inline_keyboard.flat().some((button) => button.callback_data === "byok:open"), true);

    const env = { ...baseEnv(), IVAI_DB: new PreferenceD1() };
    await setMemoryEnabled(42, true, env);
    const sendCallback = async (data, updateId) => {
      const update = { update_id: updateId, callback_query: { id: `cb${updateId}`, from: { id: 42, first_name: "A" }, data, message: { message_id: 31, chat: { id: 42, type: "private" }, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" } } } };
      const response = await worker.fetch(new Request("https://worker.test/", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "valid-secret" }, body: JSON.stringify(update) }), env);
      assert.equal(response.status, 200);
    };
    // Off, applied twice (redelivery / double tap): stays off, no toggle.
    await sendCallback("settings:memory:off", 4101);
    assert.equal(env.IVAI_DB.preferences.get("42").memoryEnabled, 0);
    await sendCallback("settings:memory:off", 4102);
    assert.equal(env.IVAI_DB.preferences.get("42").memoryEnabled, 0);
    // The edited keyboard now offers the on-target.
    const edit = calls.filter((call) => /editMessageText$/.test(call.url)).at(-1);
    assert.equal(edit.body.reply_markup.inline_keyboard.flat().find((button) => button.callback_data?.startsWith("settings:memory:")).callback_data, "settings:memory:on");
    // Legacy button on an already-sent message still toggles.
    await sendCallback("settings:memory", 4103);
    assert.equal(env.IVAI_DB.preferences.get("42").memoryEnabled, 1);
    // On, applied twice: stays on.
    await sendCallback("settings:memory:on", 4104);
    await sendCallback("settings:memory:on", 4105);
    assert.equal(env.IVAI_DB.preferences.get("42").memoryEnabled, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a first-contact group voice message with a Persian caption answers in Persian but stores English as the UI language", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupMediaFetch(calls);
  try {
    const env = {
      ...groupTestEnv(calls, aiCalls),
      AI: { async run(model, input) { aiCalls.push({ model, input }); return { text: "این متن پیاده‌سازی‌شده است." }; } }
    };
    const update = { update_id: 4200, message: { message_id: 90, chat: { id: -100129, type: "supergroup" }, from: { id: 42, first_name: "A" }, voice: { file_id: "v1", duration: 3 }, caption: "اینو گوش کن", reply_to_message: { message_id: 50, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" } } } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    // The transcription — and therefore the answer — follows the caption.
    assert.equal(aiCalls.length, 1);
    assert.equal(aiCalls[0].input.language, "fa");
    const send = calls.find((call) => /sendMessage$/.test(call.url));
    assert.match(send.body.text, /متن صوت/);
    // But the brand-new user's stored UI language stays English: the caption
    // language is an answer language, never a UI preference.
    assert.equal(env.IVAI_DB.users.get("42").language, "en");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function linkedGroupFetch(calls, linkedChatId) {
  return async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : {} });
    if (/getChat$/.test(String(url))) return new Response(JSON.stringify({ ok: true, result: { id: APP.requiredChannelId, type: "channel", linked_chat_id: linkedChatId } }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 900 } }), { status: 200 });
  };
}

test("a mention in the channel's linked group resolves to the primary tier, not the other tier", async () => {
  const originalFetch = globalThis.fetch;
  const mentionUpdate = (chatId) => (updateId, messageId) => ({ update_id: updateId, message: { message_id: messageId, chat: { id: chatId, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "@IVAI_Llm_bot one question", entities: [{ type: "mention", offset: 0, length: 13 }] } });
  try {
    // Linked group: the primary hourly cap (30) applies, so a sixth mention
    // inside the hour is still answered. Counters live in KV (no D1); the
    // per-turn cooldown key is cleared between turns so only the hourly
    // bucket can block.
    const linkedCalls = [];
    const linkedAi = [];
    globalThis.fetch = linkedGroupFetch(linkedCalls, -100222);
    const linkedEnv = { ...groupTestEnv(linkedCalls, linkedAi), IVAI_DB: undefined };
    const linkedMention = mentionUpdate(-100222);
    for (let index = 0; index < 6; index += 1) {
      await linkedEnv.IVAI_KV.delete("groupcd:-100222");
      assert.equal((await postGroupUpdate(linkedEnv, linkedMention(4300 + index, 10 + index))).status, 200);
    }
    assert.equal(linkedAi.length, 6);
    // The tier really was resolved through the channel's linked_chat_id.
    assert.ok(linkedCalls.some((call) => /getChat$/.test(call.url)));

    // Control: an unlinked group is the other tier — the sixth mention in
    // the hour hits the stricter cap of 5 and stays silent.
    const otherCalls = [];
    const otherAi = [];
    globalThis.fetch = linkedGroupFetch(otherCalls, -100222);
    const otherEnv = { ...groupTestEnv(otherCalls, otherAi), IVAI_DB: undefined };
    const otherMention = mentionUpdate(-100223);
    for (let index = 0; index < 6; index += 1) {
      await otherEnv.IVAI_KV.delete("groupcd:-100223");
      assert.equal((await postGroupUpdate(otherEnv, otherMention(4310 + index, 20 + index))).status, 200);
    }
    assert.equal(otherAi.length, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stops at the hourly comment cap: the 11th eligible channel post gets no comment", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    // Counters in KV (no D1): the per-chat comment bucket is what stops the
    // 11th post — every post below is sampler-kept and long enough.
    const env = { ...groupTestEnv(calls, aiCalls, { enforced: "true" }), IVAI_DB: undefined };
    for (const [index, messageId] of [90, 100, 101, 102, 103, 104, 106, 107, 109, 110, 111].entries()) {
      const response = await postGroupUpdate(env, channelPostUpdate(4400 + index, messageId, { text: LONG_CHANNEL_POST }));
      assert.equal(response.status, 200);
    }
    assert.equal(aiCalls.length, GROUP_POLICY.channelPostHourlyLimit);
    assert.equal(calls.filter((call) => /sendMessage$/.test(call.url)).length, GROUP_POLICY.channelPostHourlyLimit);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pins the locked group policy numbers so a config typo fails CI", () => {
  assert.equal(GROUP_POLICY.primaryCooldownSeconds, 20);
  assert.equal(GROUP_POLICY.otherCooldownSeconds, 120);
  assert.equal(GROUP_POLICY.primaryHourlyLimit, 30);
  assert.equal(GROUP_POLICY.otherHourlyLimit, 5);
  assert.equal(GROUP_POLICY.otherDailyLimit, 30);
  assert.equal(GROUP_POLICY.channelPostHourlyLimit, 10);
  assert.equal(GROUP_POLICY.primaryMediaHourlyLimit, 10);
  assert.equal(GROUP_POLICY.otherMediaHourlyLimit, 3);
  assert.equal(GROUP_POLICY.channelPostReplyRate, 0.75);
  assert.equal(GROUP_POLICY.channelCommentFunShare, 0.6);
  assert.equal(GROUP_POLICY.channelCommentStreakCapMin, 2);
  assert.equal(GROUP_POLICY.channelCommentStreakCapMax, 3);
});

test("ignores an edited group message entirely (pinned current behavior)", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    const update = { update_id: 4500, edited_message: { message_id: 5, chat: { id: -100130, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "@IVAI_Llm_bot edited question", entities: [{ type: "mention", offset: 0, length: 13 }], edit_date: 1700000000 } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ignores an edited private message entirely (owner decision, v3.7.8)", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    const env = groupTestEnv(calls, aiCalls);
    const update = { update_id: 4501, edited_message: { message_id: 6, chat: { id: 42, type: "private" }, from: { id: 42, first_name: "A" }, text: "Hello again, edited", edit_date: 1700000000 } };
    const response = await postGroupUpdate(env, update);
    assert.equal(response.status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- BYOK ("My API", v3.8.0) -------------------------------------------------
// Phase 1: AES-256-GCM key storage + D1 helpers. The encryption secret is a
// deterministic 32-byte test value; production uses a random Worker secret.

function byokTestKey(seed = 1) {
  return Buffer.from(Array.from({ length: 32 }, (_, index) => (seed + index) % 256)).toString("base64");
}

function byokSqliteEnv({ encryptionKey = byokTestKey(1) } = {}) {
  const db = new DatabaseSync(":memory:");
  for (const file of ["0001_initial_schema.sql", "0002_runtime_guards.sql", "0007_user_api_configs.sql", "0008_byok_multi_config.sql", "0009_byok_custom_models.sql"]) {
    db.exec(readFileSync(new URL(`../db/${file}`, import.meta.url), "utf8"));
  }
  // user_api_configs references users: the production flow upserts the user
  // before any BYOK save, so the test DB seeds the same row.
  db.exec("INSERT INTO users (telegram_user_id) VALUES ('42')");
  return { db, env: { ...baseEnv(), IVAI_DB: sqliteD1(db), BYOK_ENCRYPTION_KEY: encryptionKey } };
}

test("migration 0007 creates the user_api_configs table with the BYOK columns", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("../db/0001_initial_schema.sql", import.meta.url), "utf8"));
    db.exec(readFileSync(new URL("../db/0007_user_api_configs.sql", import.meta.url), "utf8"));
    const columns = db.prepare("SELECT name FROM pragma_table_info('user_api_configs')").all().map((row) => row.name);
    for (const column of ["telegram_user_id", "preset", "base_url", "api_key_encrypted", "active_model", "vision_model", "transcription_model", "enabled", "status", "auth_failures", "updated_at"]) {
      assert.ok(columns.includes(column), `missing column ${column}`);
    }
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE name='user_api_configs'").get();
    assert.match(row.sql, /enabled INTEGER NOT NULL DEFAULT 0/);
  } finally {
    db.close();
  }
});

test("migration 0008 migrates the single v3.8.0 config to multi-config without re-asking for the key", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("../db/0001_initial_schema.sql", import.meta.url), "utf8"));
    db.exec(readFileSync(new URL("../db/0007_user_api_configs.sql", import.meta.url), "utf8"));
    db.exec("INSERT INTO users (telegram_user_id) VALUES ('42'), ('43')");
    const env = { ...baseEnv(), IVAI_DB: sqliteD1(db), BYOK_ENCRYPTION_KEY: byokTestKey(1) };
    // Two v3.8.0 rows: one enabled (stays active), one disabled (stays inactive).
    await saveUserApiConfigV380({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_kept-key-abc", model: "openai/gpt-oss-20b" }, env);
    await saveUserApiConfigV380({ userId: 43, preset: "deepseek", baseUrl: "https://api.deepseek.com/v1", apiKey: "sk_other-key-xyz", model: "deepseek-flash" }, env);
    await env.IVAI_DB.prepare("UPDATE user_api_configs SET enabled=1 WHERE telegram_user_id='42'").run();
    const before = db.prepare("SELECT api_key_encrypted FROM user_api_configs WHERE telegram_user_id='42'").get().api_key_encrypted;

    db.exec(readFileSync(new URL("../db/0008_byok_multi_config.sql", import.meta.url), "utf8"));

    const columns = db.prepare("SELECT name FROM pragma_table_info('user_api_configs')").all().map((row) => row.name);
    for (const column of ["telegram_user_id", "config_id", "name", "preset", "base_url", "api_key_encrypted", "active_model", "enabled", "status", "auth_failures"]) {
      assert.ok(columns.includes(column), `missing column ${column}`);
    }
    const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='user_api_configs'").get().sql;
    assert.match(tableSql, /PRIMARY KEY \(telegram_user_id, config_id\)/);
    // The key ciphertext is untouched, so the stored key still decrypts.
    const migrated = db.prepare("SELECT * FROM user_api_configs WHERE telegram_user_id='42'").get();
    assert.equal(migrated.config_id, "default");
    assert.equal(migrated.name, "My API 1");
    assert.equal(migrated.api_key_encrypted, before);
    assert.equal(await decryptApiKey(migrated.api_key_encrypted, env), "gsk_kept-key-abc");
    // Only the enabled config becomes active.
    assert.equal(db.prepare("SELECT active_api_config_id FROM user_preferences WHERE telegram_user_id='42'").get().active_api_config_id, "default");
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM user_preferences WHERE telegram_user_id='43'").get().c, 0);
    const other = db.prepare("SELECT * FROM user_api_configs WHERE telegram_user_id='43'").get();
    assert.equal(other.config_id, "default");
    assert.equal(other.enabled, 0);
  } finally {
    db.close();
  }
});

test("migration 0009 adds the custom_models column for per-config added models", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("../db/0001_initial_schema.sql", import.meta.url), "utf8"));
    db.exec(readFileSync(new URL("../db/0007_user_api_configs.sql", import.meta.url), "utf8"));
    db.exec(readFileSync(new URL("../db/0008_byok_multi_config.sql", import.meta.url), "utf8"));
    db.exec(readFileSync(new URL("../db/0009_byok_custom_models.sql", import.meta.url), "utf8"));
    const columns = db.prepare("SELECT name, dflt_value FROM pragma_table_info('user_api_configs')").all();
    const customModels = columns.find((column) => column.name === "custom_models");
    assert.ok(customModels, "missing column custom_models");
    assert.equal(customModels.dflt_value, "'[]'");
  } finally {
    db.close();
  }
});

// The v3.8.0 single-row shape, for the migration test only: the current
// saveUserApiConfig already writes the v3.9.0 shape.
async function saveUserApiConfigV380({ userId, preset, baseUrl, apiKey, model }, env) {
  const apiKeyEncrypted = await encryptApiKey(apiKey, env);
  await env.IVAI_DB.prepare(`INSERT INTO user_api_configs
      (telegram_user_id, preset, base_url, api_key_encrypted, active_model, enabled, status, auth_failures, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'valid', 0, CURRENT_TIMESTAMP)`)
    .bind(String(userId), preset, baseUrl, apiKeyEncrypted, model).run();
}

test("encrypts a BYOK key with AES-256-GCM and decrypts it back, never storing plaintext", async () => {
  const env = { BYOK_ENCRYPTION_KEY: byokTestKey(1) };
  const stored = await encryptApiKey("gsk_test-secret-key-123", env);
  assert.match(stored, /^[0-9a-f]{24}:[0-9a-f]{32,}$/);
  assert.doesNotMatch(stored, /gsk_test-secret-key-123/);
  assert.equal(await decryptApiKey(stored, env), "gsk_test-secret-key-123");
  // A fresh IV per encryption: the same key encrypts differently twice.
  assert.notEqual(await encryptApiKey("gsk_test-secret-key-123", env), stored);
});

test("refuses to decrypt a BYOK key with the wrong encryption secret or a malformed value", async () => {
  const stored = await encryptApiKey("sk-test-key", { BYOK_ENCRYPTION_KEY: byokTestKey(1) });
  await assert.rejects(decryptApiKey(stored, { BYOK_ENCRYPTION_KEY: byokTestKey(2) }));
  await assert.rejects(decryptApiKey("not-a-stored-value", { BYOK_ENCRYPTION_KEY: byokTestKey(1) }));
  await assert.rejects(decryptApiKey("", { BYOK_ENCRYPTION_KEY: byokTestKey(1) }));
  await assert.rejects(encryptApiKey("sk-test-key", {}), /not configured/);
  await assert.rejects(decryptApiKey(stored, {}), /not configured/);
});

test("BYOK storage (v3.9.0 multi-config): save lists two configs, activation switches, deleting the active one falls back to IVAI", async () => {
  const { db, env } = byokSqliteEnv();
  try {
    const groqId = await saveUserApiConfig({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test-key-abc", model: "openai/gpt-oss-20b", visionModel: "qwen/qwen3.8-27b", transcriptionModel: "whisper-large-v3-turbo" }, env);
    assert.match(groqId, /^[0-9a-f]{12}$/);
    // Saved disabled and not active: the turn-time getter returns nothing.
    assert.equal(await getUserApiConfig(42, env), null);
    assert.equal(await getActiveUserApiConfigId(42, env), null);
    let listed = await listUserApiConfigs(42, env);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, "My API 1");
    assert.equal(listed[0].preset, "groq");
    assert.equal(listed[0].enabled, false);
    // The stored column holds ciphertext, never the key.
    const stored = db.prepare("SELECT api_key_encrypted FROM user_api_configs WHERE telegram_user_id='42'").get().api_key_encrypted;
    assert.doesNotMatch(stored, /gsk_test-key-abc/);

    const deepseekId = await saveUserApiConfig({ userId: 42, preset: "deepseek", baseUrl: "https://api.deepseek.com/v1", apiKey: "sk_test-key-def", model: "deepseek-flash", visionModel: "deepseek-flash", transcriptionModel: null }, env);
    assert.notEqual(deepseekId, groqId);
    listed = await listUserApiConfigs(42, env);
    assert.equal(listed.length, 2);
    assert.equal(listed[1].name, "My API 2");

    // Activate Groq: turns use its key.
    await setUserApiConfigEnabled(42, true, env, groqId);
    await setActiveUserApiConfig(42, groqId, env);
    assert.equal((await getUserApiConfig(42, env)).apiKey, "gsk_test-key-abc");
    assert.equal((await getUserApiConfigMeta(42, env)).preset, "groq");

    // Switch to DeepSeek: one tap, no key re-asked; Groq stays saved.
    await setUserApiConfigEnabled(42, true, env, deepseekId);
    await setActiveUserApiConfig(42, deepseekId, env);
    assert.equal((await getUserApiConfig(42, env)).apiKey, "sk_test-key-def");
    assert.equal((await getUserApiConfig(42, env)).preset, "deepseek");
    assert.equal((await getUserApiConfigMeta(42, env, groqId)).preset, "groq");

    // Per-config model and rename: only the targeted config changes.
    await updateUserApiConfigModel(42, { model: "qwen/qwen3.8-27b", visionModel: "qwen/qwen3.8-27b", transcriptionModel: "whisper-large-v3-turbo" }, env, groqId);
    assert.equal((await getUserApiConfigMeta(42, env, groqId)).model, "qwen/qwen3.8-27b");
    assert.equal((await getUserApiConfigMeta(42, env, deepseekId)).model, "deepseek-flash");
    await renameUserApiConfig(42, deepseekId, "Work", env);
    assert.equal((await listUserApiConfigs(42, env))[1].name, "Work");

    // 401s are per-config: three on Groq invalidate only Groq.
    await markUserApiConfigInvalid(42, env, {}, groqId);
    await markUserApiConfigInvalid(42, env, {}, groqId);
    assert.equal((await getUserApiConfigMeta(42, env, groqId)).status, "valid");
    await markUserApiConfigInvalid(42, env, {}, groqId);
    assert.equal((await getUserApiConfigMeta(42, env, groqId)).status, "invalid");
    assert.equal((await getUserApiConfig(42, env)).apiKey, "sk_test-key-def");
    await resetUserApiAuthFailures(42, env, groqId);
    assert.equal((await getUserApiConfigMeta(42, env, groqId)).status, "valid");

    // Deleting the active config falls back to IVAI models; the other stays.
    await deleteUserApiConfig(42, env, deepseekId);
    assert.equal(await getUserApiConfig(42, env), null);
    assert.equal(await getActiveUserApiConfigId(42, env), null);
    assert.equal((await listUserApiConfigs(42, env)).length, 1);
    await deleteUserApiConfig(42, env, groqId);
    assert.deepEqual(await listUserApiConfigs(42, env), []);
    assert.equal(await getUserApiConfigMeta(42, env), null);
  } finally {
    db.close();
  }
});

test("a BYOK decrypt failure marks the config invalid and never logs the key", async () => {
  const { db, env } = byokSqliteEnv({ encryptionKey: byokTestKey(1) });
  const originalError = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.join(" "));
  try {
    await saveUserApiConfig({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_never-log-this-key", model: "openai/gpt-oss-20b" }, env);
    const configId = (await listUserApiConfigs(42, env))[0].configId;
    await setUserApiConfigEnabled(42, true, env, configId);
    await setActiveUserApiConfig(42, configId, env);
    // Same row, rotated encryption secret: decryption fails.
    const rotated = { ...env, BYOK_ENCRYPTION_KEY: byokTestKey(9) };
    assert.equal(await getUserApiConfig(42, rotated), null);
    assert.equal((await getUserApiConfigMeta(42, env)).status, "invalid");
    assert.ok(lines.some((line) => line.includes("byok_decrypt_failed")));
    assert.equal(lines.some((line) => line.includes("gsk_never-log-this-key")), false);
  } finally {
    console.error = originalError;
    db.close();
  }
});

test("BYOK presets pin only currently available models (re-verified 2026-11-14)", () => {
  assert.equal(BYOK_PRESETS.groq.baseUrl, "https://api.groq.com/openai/v1");
  assert.equal(BYOK_PRESETS.together.baseUrl, "https://api.together.ai/v1");
  assert.equal(BYOK_PRESETS.gemini.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai/");
  // Retired IDs must never appear: Groq's llama-3.3-70b-versatile (retired
  // 2026-08-16) and DeepSeek's legacy chat/reasoner aliases (retired 2026-07-24).
  for (const preset of Object.values(BYOK_PRESETS)) {
    assert.equal(preset.chatModels.includes("llama-3.3-70b-versatile"), false);
    assert.equal(preset.chatModels.includes("deepseek-chat"), false);
    assert.equal(preset.chatModels.includes("deepseek-reasoner"), false);
    assert.equal(preset.chatModels.includes("grok-4"), false);
  }
  assert.deepEqual(BYOK_PRESETS.deepseek.chatModels, ["deepseek-flash", "deepseek-v4-pro"]);
  assert.deepEqual(BYOK_PRESETS.xai.chatModels, ["grok-4.7", "grok-4.3"]);
  assert.equal(BYOK_PRESETS.deepseek.transcriptionModel, null);
  assert.equal(BYOK_PRESETS.xai.transcriptionModel, null);
  assert.equal(BYOK_PRESETS.gemini.transcriptionModel, null);
  assert.ok(BYOK_PRESETS.groq.keyPattern.test("gsk_abc12345"));
  assert.ok(BYOK_PRESETS.openrouter.keyPattern.test("sk-or-v1-abc12345"));
  assert.equal(BYOK_PRESETS.groq.keyPattern.test("sk-abc12345"), false);
});

// Phase 2: BYOK runner + fallback inside generateReply.

const BYOK_CONFIG = Object.freeze({ userId: "42", preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test-byok-key", model: "openai/gpt-oss-20b", visionModel: "qwen/qwen3.8-27b", transcriptionModel: "whisper-large-v3-turbo", enabled: true, status: "valid", authFailures: 0 });

function byokFetchMock({ status = 200, content = "BYOK answer.", reasoning = null } = {}) {
  const calls = [];
  const fetchMock = async (url, init) => {
    calls.push({ url: String(url), init });
    const message = reasoning ? { reasoning_content: reasoning } : { content };
    return new Response(JSON.stringify({ choices: [{ message }], model: "openai/gpt-oss-20b" }), { status });
  };
  return { calls, fetchMock };
}

test("BYOK answers through the user's API first and never touches the free chain", async () => {
  const originalFetch = globalThis.fetch;
  const { calls, fetchMock } = byokFetchMock();
  const aiCalls = [];
  globalThis.fetch = fetchMock;
  try {
    const env = { ...baseEnv(), AI: { async run() { aiCalls.push(1); return { response: "Free answer." }; } } };
    const result = await generateReply({ text: "Hello", selectedMode: MODES.AUTO, selectedModel: null, language: "en", context: [], byokConfig: BYOK_CONFIG }, env);
    assert.equal(result.text, "BYOK answer.");
    assert.equal(result.provider, "byok");
    assert.equal(result.fellBackFromByok, false);
    assert.equal(result.byokAuthFailed, false);
    assert.equal(aiCalls.length, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(calls[0].init.headers.authorization, "Bearer gsk_test-byok-key");
    assert.equal(JSON.parse(calls[0].init.body).model, "openai/gpt-oss-20b");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a BYOK 401 falls back to the free chain and is flagged for invalidation", async () => {
  const originalFetch = globalThis.fetch;
  const { fetchMock } = byokFetchMock({ status: 401 });
  globalThis.fetch = fetchMock;
  try {
    const env = { ...baseEnv(), AI: { async run() { return { response: "Free answer." }; } } };
    const result = await generateReply({ text: "Hello", selectedMode: MODES.AUTO, selectedModel: null, language: "en", context: [], byokConfig: BYOK_CONFIG }, env);
    assert.equal(result.text, "Free answer.");
    assert.equal(result.provider, "workers-ai");
    assert.equal(result.fellBackFromByok, true);
    assert.equal(result.byokAuthFailed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a BYOK 500 falls back to the free chain without the auth-failure flag", async () => {
  const originalFetch = globalThis.fetch;
  const { fetchMock } = byokFetchMock({ status: 500 });
  globalThis.fetch = fetchMock;
  try {
    const env = { ...baseEnv(), AI: { async run() { return { response: "Free answer." }; } } };
    const result = await generateReply({ text: "Hello", selectedMode: MODES.AUTO, selectedModel: null, language: "en", context: [], byokConfig: BYOK_CONFIG }, env);
    assert.equal(result.fellBackFromByok, true);
    assert.equal(result.byokAuthFailed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a thinking BYOK model may answer in reasoning_content", async () => {
  const originalFetch = globalThis.fetch;
  const { fetchMock } = byokFetchMock({ content: null, reasoning: "Reasoned answer." });
  globalThis.fetch = fetchMock;
  try {
    const env = { ...baseEnv(), AI: { async run() { return { response: "Free answer." }; } } };
    const result = await generateReply({ text: "Hello", selectedMode: MODES.AUTO, selectedModel: null, language: "en", context: [], byokConfig: BYOK_CONFIG }, env);
    assert.equal(result.text, "Reasoned answer.");
    assert.equal(result.provider, "byok");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Guard mode never uses BYOK, even with an active config", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); throw new Error("must not call BYOK"); };
  try {
    const env = { ...baseEnv(), AI: { async run() { return { response: "safe" }; } } };
    const result = await generateReply({ text: "Classify this message", selectedMode: MODES.GUARD, language: "en", context: [], byokConfig: BYOK_CONFIG }, env);
    assert.equal(result.provider, "workers-ai");
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a disabled or invalid BYOK config is ignored by the text chain", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); throw new Error("must not call BYOK"); };
  try {
    const env = { ...baseEnv(), AI: { async run() { return { response: "Free answer." }; } } };
    for (const config of [{ ...BYOK_CONFIG, enabled: false }, { ...BYOK_CONFIG, status: "invalid" }, { ...BYOK_CONFIG, apiKey: "" }]) {
      const result = await generateReply({ text: "Hello", selectedMode: MODES.AUTO, selectedModel: null, language: "en", context: [], byokConfig: config }, env);
      assert.equal(result.provider, "workers-ai");
      assert.equal(result.fellBackFromByok, false);
    }
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Phase 3: BYOK media — vision + transcription with fallback.

const BYOK_GROQ = Object.freeze({ ...BYOK_CONFIG, preset: "groq" });
const BYOK_DEEPSEEK = Object.freeze({ ...BYOK_CONFIG, preset: "deepseek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-flash", visionModel: "deepseek-flash", transcriptionModel: null });

function byokMediaFetch({ visionStatus = 200, visionText = "BYOK photo description.", transcriptionStatus = 200, transcriptionText = "BYOK transcript." } = {}) {
  const binary = new Uint8Array([1, 2, 3, 4]);
  const calls = [];
  const fetchMock = async (url, init) => {
    const endpoint = String(url);
    calls.push(endpoint);
    if (endpoint.includes("getFile")) return new Response(JSON.stringify({ ok: true, result: { file_path: "asset.bin", file_size: binary.byteLength } }), { status: 200 });
    if (endpoint.includes("/chat/completions")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: visionText } }] }), { status: visionStatus });
    }
    if (endpoint.includes("/audio/transcriptions")) {
      return new Response(JSON.stringify({ text: transcriptionText }), { status: transcriptionStatus });
    }
    return new Response(binary, { status: 200, headers: { "content-type": "image/jpeg" } });
  };
  return { calls, fetchMock };
}

test("BYOK vision answers through the user's API and never calls Workers AI", async () => {
  const originalFetch = globalThis.fetch;
  const { calls, fetchMock } = byokMediaFetch();
  const aiCalls = [];
  globalThis.fetch = fetchMock;
  try {
    const env = { ...baseEnv(), AI: { async run() { aiCalls.push(1); return { response: "Free description." }; } } };
    const photo = await analyzePhoto({ fileId: "photo", caption: "Describe", language: "en", byokConfig: BYOK_GROQ }, env);
    assert.equal(photo.text, "BYOK photo description.");
    assert.equal(photo.provider, "byok");
    assert.equal(photo.fellBackFromByok, false);
    assert.equal(aiCalls.length, 0);
    assert.ok(calls.some((url) => url === "https://api.groq.com/openai/v1/chat/completions"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a BYOK vision failure or refusal falls back to Workers AI vision with the notice flag", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const { visionStatus, visionText } of [
      { visionStatus: 400, visionText: "ignored" },
      { visionStatus: 200, visionText: "I can't see images, sorry." }
    ]) {
      const { fetchMock } = byokMediaFetch({ visionStatus, visionText });
      globalThis.fetch = fetchMock;
      const env = { ...baseEnv(), AI: { async run() { return { response: "Free description." }; } } };
      const photo = await analyzePhoto({ fileId: "photo", caption: "Describe", language: "en", byokConfig: BYOK_GROQ }, env);
      assert.equal(photo.text, "Free description.");
      assert.equal(photo.provider, "workers-ai");
      assert.equal(photo.fellBackFromByok, true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("BYOK transcription answers through the user's API and never calls Whisper", async () => {
  const originalFetch = globalThis.fetch;
  const { calls, fetchMock } = byokMediaFetch();
  const aiCalls = [];
  globalThis.fetch = fetchMock;
  try {
    const env = { ...baseEnv(), AI: { async run() { aiCalls.push(1); return { text: "Whisper transcript." }; } } };
    const voice = await transcribeVoice({ fileId: "voice", languageHint: "en", byokConfig: BYOK_GROQ }, env);
    assert.equal(voice.text, "BYOK transcript.");
    assert.equal(voice.provider, "byok");
    assert.equal(voice.fellBackFromByok, false);
    assert.equal(aiCalls.length, 0);
    assert.ok(calls.some((url) => url === "https://api.groq.com/openai/v1/audio/transcriptions"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a preset without a transcription endpoint always uses Whisper and flags the fallback", async () => {
  const originalFetch = globalThis.fetch;
  const { fetchMock } = byokMediaFetch();
  globalThis.fetch = fetchMock;
  try {
    const env = { ...baseEnv(), AI: { async run() { return { text: "Whisper transcript." }; } } };
    const voice = await transcribeVoice({ fileId: "voice", languageHint: "en", byokConfig: BYOK_DEEPSEEK }, env);
    assert.equal(voice.text, "Whisper transcript.");
    assert.equal(voice.provider, "workers-ai");
    assert.equal(voice.fellBackFromByok, true);
    assert.equal(voice.byokAuthFailed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a BYOK transcription 401 falls back to Whisper and flags the auth failure", async () => {
  const originalFetch = globalThis.fetch;
  const { fetchMock } = byokMediaFetch({ transcriptionStatus: 401 });
  globalThis.fetch = fetchMock;
  try {
    const env = { ...baseEnv(), AI: { async run() { return { text: "Whisper transcript." }; } } };
    const voice = await transcribeVoice({ fileId: "voice", languageHint: "en", byokConfig: BYOK_GROQ }, env);
    assert.equal(voice.text, "Whisper transcript.");
    assert.equal(voice.fellBackFromByok, true);
    assert.equal(voice.byokAuthFailed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Phase 4: full BYOK setup flow through the worker (pending state machine,
// key-message deletion, fallback notice, group isolation, settings view).

function byokWorkerEnv({ groqStatus = 200, groqText = "BYOK answer." } = {}) {
  const { db, env } = byokSqliteEnv();
  const calls = [];
  const aiCalls = [];
  const fetchMock = async (url, init) => {
    const endpoint = String(url);
    calls.push({ url: endpoint, body: init?.body ? JSON.parse(init.body) : null });
    if (endpoint.includes("api.groq.com")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: groqText } }] }), { status: groqStatus });
    }
    if (endpoint.includes("api.example.com")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "Custom answer." } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true, result: { message_id: 900 } }), { status: 200 });
  };
  const workerEnv = { ...env, IVAI_KV: new KV(), AI: { async run() { aiCalls.push(1); return { response: "Free answer." }; } } };
  return { db, env: workerEnv, calls, aiCalls, fetchMock };
}

function privateTextUpdate(updateId, messageId, text, userId = 42) {
  return { update_id: updateId, message: { message_id: messageId, chat: { id: userId, type: "private" }, from: { id: userId, first_name: "A" }, text } };
}

function privateCallbackUpdate(updateId, data, userId = 42) {
  return { update_id: updateId, callback_query: { id: `cb${updateId}`, from: { id: userId, first_name: "A" }, data, message: { message_id: 31, chat: { id: userId, type: "private" }, from: { id: 424242, is_bot: true, username: "IVAI_Llm_bot" } } } };
}

test("BYOK setup flow: preset → key → test → model → active, key message deleted, then answers via BYOK", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env, calls, aiCalls, fetchMock } = byokWorkerEnv();
  globalThis.fetch = fetchMock;
  try {
    // Open My API: preset list.
    assert.equal((await postGroupUpdate(env, privateCallbackUpdate(5001, "byok:open"))).status, 200);
    let edit = calls.filter((call) => /editMessageText$/.test(call.url)).at(-1);
    assert.match(edit.body.rich_message.html, /Choose your provider below/);
    assert.ok(edit.body.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === "byok:preset:groq"));

    // Pick Groq: ask for the key; pending state recorded with a TTL.
    assert.equal((await postGroupUpdate(env, privateCallbackUpdate(5002, "byok:preset:groq"))).status, 200);
    edit = calls.filter((call) => /editMessageText$/.test(call.url)).at(-1);
    assert.match(edit.body.text, /Send your API key/);
    const pending = JSON.parse(await env.IVAI_KV.get("byok:pending:42"));
    assert.deepEqual(pending, { step: "key", preset: "groq" });

    // Paste the key: no AI call, row saved disabled, key message deleted,
    // confirmation carries the trust line.
    assert.equal((await postGroupUpdate(env, privateTextUpdate(5003, 3, "gsk_test-key-abc"))).status, 200);
    assert.equal(aiCalls.length, 0);
    const [meta] = await listUserApiConfigs(42, env);
    const configId = meta.configId;
    assert.equal(meta.enabled, false);
    assert.equal(meta.preset, "groq");
    assert.ok(calls.some((call) => /deleteMessage$/.test(call.url) && call.body.message_id === 3));
    const saved = calls.filter((call) => /sendMessage$/.test(call.url)).at(-1);
    assert.match(saved.body.text, /key saved/);
    assert.match(saved.body.text, /stored encrypted \(AES-256-GCM\)/);
    assert.equal(await env.IVAI_KV.get("byok:pending:42"), null);

    // Test the connection: the probe hits Groq, then the model picker opens.
    assert.equal((await postGroupUpdate(env, privateCallbackUpdate(5004, `byok:test:${configId}`))).status, 200);
    assert.ok(calls.some((call) => call.url === "https://api.groq.com/openai/v1/chat/completions"));
    edit = calls.filter((call) => /editMessageText$/.test(call.url)).at(-1);
    assert.match(edit.body.rich_message.html, /Connection works/);
    assert.ok(edit.body.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === `byok:model:${configId}:0`));

    // Pick a model: enabled, active screen shown.
    assert.equal((await postGroupUpdate(env, privateCallbackUpdate(5005, `byok:model:${configId}:1`))).status, 200);
    const active = await getUserApiConfigMeta(42, env);
    assert.equal(active.enabled, true);
    assert.equal(active.model, "openai/gpt-oss-20b");
    edit = calls.filter((call) => /editMessageText$/.test(call.url)).at(-1);
    assert.match(edit.body.text, /My API is active/);

    // A text turn now answers through BYOK with no fallback notice.
    assert.equal((await postGroupUpdate(env, privateTextUpdate(5006, 4, "Hello"))).status, 200);
    const rich = calls.filter((call) => /sendRichMessage$/.test(call.url)).at(-1);
    assert.match(rich.body.rich_message.html, /BYOK answer\./);
    assert.doesNotMatch(rich.body.rich_message.html, /didn't respond/);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("a pasted key with no pending setup never reaches the AI turn or storage", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env, calls, aiCalls, fetchMock } = byokWorkerEnv();
  globalThis.fetch = fetchMock;
  try {
    assert.equal((await postGroupUpdate(env, privateTextUpdate(5101, 5, "gsk_test-key-abc"))).status, 200);
    assert.equal(aiCalls.length, 1);
    assert.equal(await getUserApiConfigMeta(42, env), null);
    assert.equal(calls.some((call) => call.url.includes("api.groq.com")), false);
    assert.equal(calls.some((call) => /deleteMessage$/.test(call.url)), false);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("a BYOK 401 in a text turn falls back with the notice before the footer and counts the failure", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env, calls, aiCalls, fetchMock } = byokWorkerEnv({ groqStatus: 401 });
  globalThis.fetch = fetchMock;
  try {
    await saveUserApiConfig({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test-key-abc", model: "openai/gpt-oss-20b", visionModel: "qwen/qwen3.8-27b", transcriptionModel: "whisper-large-v3-turbo" }, env);
    const configId = (await listUserApiConfigs(42, env))[0].configId;
    await setUserApiConfigEnabled(42, true, env, configId);
    await setActiveUserApiConfig(42, configId, env);
    assert.equal((await postGroupUpdate(env, privateTextUpdate(5201, 6, "Hello"))).status, 200);
    assert.equal(aiCalls.length, 1);
    const rich = calls.filter((call) => /sendRichMessage$/.test(call.url)).at(-1);
    assert.match(rich.body.rich_message.html, /Free answer\./);
    assert.match(rich.body.rich_message.html, /Your API didn't answer, so I replied with IVAI models instead\./);
    assert.ok(rich.body.rich_message.html.indexOf("didn't respond") < rich.body.rich_message.html.lastIndexOf("IVAI"));
    assert.equal((await getUserApiConfigMeta(42, env)).authFailures, 1);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("a group turn never loads or decrypts the BYOK config", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env } = byokSqliteEnv();
  const sqlLog = [];
  const inner = sqliteD1(db);
  const recordingEnv = { ...env, IVAI_DB: { prepare: (sql) => { sqlLog.push(sql); return inner.prepare(sql); } } };
  const calls = [];
  const aiCalls = [];
  globalThis.fetch = mockGroupFetch(calls);
  try {
    await saveUserApiConfig({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test-key-abc", model: "openai/gpt-oss-20b" }, env);
    const configId = (await listUserApiConfigs(42, env))[0].configId;
    await setUserApiConfigEnabled(42, true, env, configId);
    await setActiveUserApiConfig(42, configId, env);
    sqlLog.length = 0;
    const groupEnv = { ...groupTestEnv(calls, aiCalls), IVAI_DB: recordingEnv.IVAI_DB, BYOK_ENCRYPTION_KEY: env.BYOK_ENCRYPTION_KEY };
    const mention = { update_id: 5301, message: { message_id: 10, chat: { id: -100130, type: "supergroup" }, from: { id: 42, first_name: "A" }, text: "@IVAI_Llm_bot one question", entities: [{ type: "mention", offset: 0, length: 13 }] } };
    assert.equal((await postGroupUpdate(groupEnv, mention)).status, 200);
    assert.equal(aiCalls.length, 1);
    assert.equal(sqlLog.some((sql) => sql.includes("user_api_configs")), false);
    assert.equal(calls.some((call) => String(call.url).includes("api.groq.com")), false);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("pending setup: a wrong-format key is rejected, /cancel cancels, another command clears the state", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env, calls, fetchMock } = byokWorkerEnv();
  globalThis.fetch = fetchMock;
  try {
    await postGroupUpdate(env, privateCallbackUpdate(5401, "byok:preset:groq"));
    // Wrong format: guidance, pending kept, nothing saved.
    assert.equal((await postGroupUpdate(env, privateTextUpdate(5402, 7, "not-a-key"))).status, 200);
    assert.match(calls.filter((call) => /sendMessage$/.test(call.url)).at(-1).body.text, /doesn't look like a .* key/);
    assert.equal(JSON.parse(await env.IVAI_KV.get("byok:pending:42")).step, "key");
    assert.equal(await getUserApiConfigMeta(42, env), null);

    // Bare /cancel: setup cancelled, pending cleared.
    assert.equal((await postGroupUpdate(env, privateTextUpdate(5403, 8, "/cancel"))).status, 200);
    assert.match(calls.filter((call) => /sendMessage$/.test(call.url)).at(-1).body.text, /Cancelled — nothing was saved/);
    assert.equal(await env.IVAI_KV.get("byok:pending:42"), null);

    // Another command clears the state and runs as its own command.
    await postGroupUpdate(env, privateCallbackUpdate(5404, "byok:preset:groq"));
    assert.equal((await postGroupUpdate(env, privateTextUpdate(5405, 9, "/start"))).status, 200);
    assert.equal(await env.IVAI_KV.get("byok:pending:42"), null);
    assert.ok(calls.some((call) => /sendRichMessage$/.test(call.url) && /your free AI assistant/.test(call.body.rich_message.html)));
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("settings no longer carries My API; the main menu does, and the My API list carries the single Active marker", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env, calls, fetchMock } = byokWorkerEnv();
  globalThis.fetch = fetchMock;
  try {
    // Settings has no My API section at all since v3.9.0 (owner decision:
    // My API moved to the main menu, superseding the v3.8.0 settings
    // section this test used to assert).
    await postGroupUpdate(env, privateCallbackUpdate(5501, "menu:settings"));
    let edit = calls.filter((call) => /editMessageText$/.test(call.url)).at(-1);
    assert.match(edit.body.rich_message.html, /IVAI models/);
    // v3.11.0 (C09): Settings still carries no My API section or ● marker —
    // it only points at the main menu ("Your own APIs live under 🔑 My API
    // in the main menu."), and its keyboard carries no My API button.
    assert.match(edit.body.rich_message.html, /Your own APIs live under <b>🔑 My API<\/b> in the main menu\./);
    assert.equal(edit.body.reply_markup.inline_keyboard.flat().some((button) => String(button.callback_data || "").startsWith("byok:")), false);
    assert.equal((edit.body.rich_message.html.match(/●/g) || []).length, 0);

    // The My API list is the one place with the ● Active marker.
    const configId = await saveUserApiConfig({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test-key-abc", model: "openai/gpt-oss-20b" }, env);
    await setUserApiConfigEnabled(42, true, env, configId);
    await setActiveUserApiConfig(42, configId, env);
    await postGroupUpdate(env, privateCallbackUpdate(5502, "byok:open"));
    edit = calls.filter((call) => /editMessageText$/.test(call.url)).at(-1);
    assert.equal((edit.body.rich_message.html.match(/●/g) || []).length, 1);
    assert.match(edit.body.rich_message.html, /● <b>My API 1<\/b> — Groq · <code>openai\/gpt-oss-20b<\/code>/);
    assert.match(edit.body.rich_message.html, /stored encrypted \(AES-256-GCM\)/);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("custom endpoint flow normalizes the URL, collects the model, and activates on a working test", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env, calls, fetchMock } = byokWorkerEnv();
  globalThis.fetch = fetchMock;
  try {
    await postGroupUpdate(env, privateCallbackUpdate(5601, "byok:preset:custom"));
    assert.match(calls.filter((call) => /editMessageText$/.test(call.url)).at(-1).body.text, /Custom endpoint/);

    // Endpoint with a path suffix and trailing slash is normalized.
    await postGroupUpdate(env, privateTextUpdate(5602, 10, "https://api.example.com/v1/chat/completions/"));
    let pending = JSON.parse(await env.IVAI_KV.get("byok:pending:42"));
    assert.deepEqual(pending, { step: "key", preset: "custom", baseUrl: "https://api.example.com/v1" });

    // Key saved (model empty until typed), then the model is collected.
    await postGroupUpdate(env, privateTextUpdate(5603, 11, "sk-custom-key-123456"));
    let [customMeta] = await listUserApiConfigs(42, env);
    const customId = customMeta.configId;
    assert.equal(customMeta.baseUrl, "https://api.example.com/v1");
    assert.equal(customMeta.model, "");
    pending = JSON.parse(await env.IVAI_KV.get("byok:pending:42"));
    assert.deepEqual(pending, { step: "model", preset: "custom", configId: customId });

    await postGroupUpdate(env, privateTextUpdate(5604, 12, "my-custom-model-1"));
    [customMeta] = await listUserApiConfigs(42, env);
    assert.equal(customMeta.model, "my-custom-model-1");
    assert.equal(await env.IVAI_KV.get("byok:pending:42"), null);
    // Typing the model is the last step now (owner decision 2026-11-14,
    // superseding the v3.9.0 tap-Test-then-activate flow and the v3.9.1
    // test-then-activate flow): the config activates right away with NO
    // test call, so none of the user's own API tokens are burned — with
    // the typed model remembered on the config for the model menu.
    assert.equal((await getUserApiConfigMeta(42, env)).enabled, true);
    assert.equal(await getActiveUserApiConfigId(42, env), customId);
    assert.deepEqual((await getUserApiConfigMeta(42, env)).customModels, ["my-custom-model-1"]);
    assert.equal(calls.some((call) => String(call.url).includes("api.example.com")), false);
    // The confirmation is one short message with a green tick — the manage
    // screen is no longer concatenated into it — followed by a separate
    // "Ready!" message below it (owner feedback 2026-11-14).
    const sends = calls.filter((call) => /sendMessage$/.test(call.url));
    const confirmation = sends.find((call) => /My API is active/.test(call.body.text));
    assert.match(confirmation.body.text, /My API is active/);
    assert.doesNotMatch(confirmation.body.text, /start chatting/);
    assert.doesNotMatch(confirmation.body.text, /My API 1/);
    assert.equal(sends.at(-1).body.text, "Ready! 🚀");
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("activating a config makes no test call: a failing endpoint still activates, and only a real chat can fall back", async () => {
  const originalFetch = globalThis.fetch;
  // The provider would fail every call — activation must not care, because
  // no test is run (owner decision 2026-11-14: tests burn the user's tokens).
  const { db, env, calls, fetchMock } = byokWorkerEnv({ groqStatus: 500 });
  globalThis.fetch = fetchMock;
  try {
    const configId = await saveUserApiConfig({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test-key-abc", model: "openai/gpt-oss-20b" }, env);
    await postGroupUpdate(env, privateCallbackUpdate(5611, `byok:enable:${configId}`));
    assert.equal((await getUserApiConfigMeta(42, env)).enabled, true);
    assert.equal(await getActiveUserApiConfigId(42, env), configId);
    assert.equal(calls.some((call) => String(call.url).includes("api.groq.com")), false);
    const edit = calls.filter((call) => /editMessageText$/.test(call.url)).at(-1);
    assert.match(edit.body.text, /My API is active/);
    assert.doesNotMatch(edit.body.text, /start chatting/);
    const ready = calls.filter((call) => /sendMessage$/.test(call.url)).at(-1);
    assert.equal(ready.body.text, "Ready! 🚀");
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("activating a config sends the persistent BYOK indicator with a Stop button and stores its message id (v3.11.2)", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env, calls, fetchMock } = byokWorkerEnv();
  globalThis.fetch = fetchMock;
  try {
    const configId = await saveUserApiConfig({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test-key-abc", model: "openai/gpt-oss-20b" }, env);
    assert.equal((await postGroupUpdate(env, privateCallbackUpdate(5701, `byok:enable:${configId}`))).status, 200);
    assert.equal(await getActiveUserApiConfigId(42, env), configId);
    const indicators = calls.filter((call) => /sendRichMessage$/.test(call.url) && /Using your API/.test(call.body.rich_message.html));
    assert.equal(indicators.length, 1);
    assert.equal(indicators[0].body.rich_message.html, "🔑 Using your API — My API 1 · openai/gpt-oss-20b");
    const buttons = indicators[0].body.reply_markup.inline_keyboard.flat();
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].text, "⏹ Stop BYOK");
    assert.equal(buttons[0].callback_data, "byok:stop");
    assert.equal(await env.IVAI_KV.get("byok:indicator:42"), "900");
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("Stop BYOK deactivates, deletes the indicator, and confirms in one short line (v3.11.2)", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env, calls, fetchMock } = byokWorkerEnv();
  globalThis.fetch = fetchMock;
  try {
    const configId = await saveUserApiConfig({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test-key-abc", model: "openai/gpt-oss-20b" }, env);
    await postGroupUpdate(env, privateCallbackUpdate(5711, `byok:enable:${configId}`));
    assert.equal(await env.IVAI_KV.get("byok:indicator:42"), "900");
    assert.equal((await postGroupUpdate(env, privateCallbackUpdate(5712, "byok:stop"))).status, 200);
    assert.equal(await getActiveUserApiConfigId(42, env), null);
    assert.ok(calls.some((call) => /deleteMessage$/.test(call.url) && call.body.message_id === 900));
    assert.equal(await env.IVAI_KV.get("byok:indicator:42"), null);
    const confirmation = calls.filter((call) => /sendMessage$/.test(call.url)).at(-1);
    assert.equal(confirmation.body.text, "Back to IVAI models.");
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("Stop BYOK confirms in Persian when the stored language is fa (v3.11.2)", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env, calls, fetchMock } = byokWorkerEnv();
  globalThis.fetch = fetchMock;
  try {
    const configId = await saveUserApiConfig({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test-key-abc", model: "openai/gpt-oss-20b" }, env);
    await postGroupUpdate(env, privateCallbackUpdate(5721, `byok:enable:${configId}`));
    await setUserLanguage(42, "fa", env);
    assert.equal((await postGroupUpdate(env, privateCallbackUpdate(5722, "byok:stop"))).status, 200);
    assert.equal(await getActiveUserApiConfigId(42, env), null);
    const confirmation = calls.filter((call) => /sendMessage$/.test(call.url)).at(-1);
    assert.match(confirmation.body.text, /برگشتیم به مدل‌های IVAI\./);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("switching the active config replaces the indicator instead of stacking a second one (v3.11.2)", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env, calls, fetchMock } = byokWorkerEnv();
  globalThis.fetch = fetchMock;
  try {
    const configA = await saveUserApiConfig({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test-key-abc", model: "openai/gpt-oss-20b" }, env);
    const configB = await saveUserApiConfig({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test-key-def", model: "llama-3.3-70b-versatile" }, env);
    await postGroupUpdate(env, privateCallbackUpdate(5731, `byok:enable:${configA}`));
    await postGroupUpdate(env, privateCallbackUpdate(5732, `byok:enable:${configB}`));
    const indicators = calls.filter((call) => /sendRichMessage$/.test(call.url) && /Using your API/.test(call.body.rich_message.html));
    assert.equal(indicators.length, 2);
    assert.match(indicators[0].body.rich_message.html, /My API 1 · openai\/gpt-oss-20b/);
    assert.match(indicators[1].body.rich_message.html, /My API 2 · llama-3.3-70b-versatile/);
    assert.equal(calls.filter((call) => /deleteMessage$/.test(call.url) && call.body.message_id === 900).length, 1);
    assert.equal(await env.IVAI_KV.get("byok:indicator:42"), "900");
    assert.equal(await getActiveUserApiConfigId(42, env), configB);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("a manually deleted indicator is not re-sent by an ordinary chat turn (v3.11.2)", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env, calls, fetchMock } = byokWorkerEnv();
  globalThis.fetch = fetchMock;
  try {
    const configId = await saveUserApiConfig({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test-key-abc", model: "openai/gpt-oss-20b" }, env);
    await postGroupUpdate(env, privateCallbackUpdate(5741, `byok:enable:${configId}`));
    const countIndicators = () => calls.filter((call) => /sendRichMessage$/.test(call.url) && /Using your API/.test(call.body.rich_message.html)).length;
    assert.equal(countIndicators(), 1);
    // The user deletes the indicator message by hand; the bot cannot know,
    // and an ordinary text turn must not send a fresh one (no self-heal).
    assert.equal((await postGroupUpdate(env, privateTextUpdate(5742, 5, "Hello"))).status, 200);
    assert.equal(countIndicators(), 1);
    assert.equal(await env.IVAI_KV.get("byok:indicator:42"), "900");
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("model menu lists the preset catalog plus added models, marks the active one, and picking one activates with a green tick and a separate Ready message", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env, calls, fetchMock } = byokWorkerEnv();
  globalThis.fetch = fetchMock;
  try {
    const configId = await saveUserApiConfig({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test-key-abc", model: "openai/gpt-oss-20b" }, env);
    await addCustomByokModel(42, "my-groq-extra-1", env, configId);
    await setUserApiConfigEnabled(42, true, env, configId);
    await setActiveUserApiConfig(42, configId, env);

    // The menu shows the catalog, the added model, and the Add button.
    await postGroupUpdate(env, privateCallbackUpdate(5621, `byok:models:${configId}`));
    let edit = calls.filter((call) => /editMessageText$/.test(call.url)).at(-1);
    assert.match(edit.body.rich_message.html, /Which model should answer\?/);
    const buttons = edit.body.reply_markup.inline_keyboard.flat();
    assert.ok(buttons.some((button) => button.text === "my-groq-extra-1" && button.callback_data === `byok:model:${configId}:3`));
    assert.ok(buttons.some((button) => button.callback_data === `byok:model:${configId}:other`));

    // Picking the added model activates it: a short green-tick confirmation
    // plus a separate "Ready!" message below it.
    await postGroupUpdate(env, privateCallbackUpdate(5622, `byok:model:${configId}:3`));
    assert.equal((await getUserApiConfigMeta(42, env)).model, "my-groq-extra-1");
    edit = calls.filter((call) => /editMessageText$/.test(call.url)).at(-1);
    assert.match(edit.body.text, /My API is active/);
    assert.doesNotMatch(edit.body.text, /start chatting/);
    assert.match(edit.body.text, /● <b>Groq<\/b> · <code>my-groq-extra-1<\/code>/);
    const ready = calls.filter((call) => /sendMessage$/.test(call.url)).at(-1);
    assert.equal(ready.body.text, "Ready! 🚀");

    // Reopening the menu marks the active model.
    await postGroupUpdate(env, privateCallbackUpdate(5623, `byok:models:${configId}`));
    edit = calls.filter((call) => /editMessageText$/.test(call.url)).at(-1);
    assert.ok(edit.body.reply_markup.inline_keyboard.flat().some((button) => button.text === "● my-groq-extra-1"));
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("main menu: My API is red and Pick model is plain", () => {
  const buttons = modeKeyboard("en").inline_keyboard.flat();
  assert.equal(buttons.find((button) => button.callback_data === "byok:open").style, "danger");
  assert.equal(buttons.find((button) => button.callback_data === "menu:models").style, undefined);
});

test("removing My API deletes the config and private chats answer with IVAI models again", async () => {
  const originalFetch = globalThis.fetch;
  const { db, env, calls, aiCalls, fetchMock } = byokWorkerEnv();
  globalThis.fetch = fetchMock;
  try {
    const configId = await saveUserApiConfig({ userId: 42, preset: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test-key-abc", model: "openai/gpt-oss-20b" }, env);
    await setUserApiConfigEnabled(42, true, env, configId);
    await setActiveUserApiConfig(42, configId, env);
    await postGroupUpdate(env, privateCallbackUpdate(5701, "byok:open"));
    await postGroupUpdate(env, privateCallbackUpdate(5702, `byok:remove:${configId}`));
    let edit = calls.filter((call) => /editMessageText$/.test(call.url)).at(-1);
    assert.match(edit.body.text, /Remove “My API 1”\?/);
    assert.ok(edit.body.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === `byok:remove:yes:${configId}`));
    await postGroupUpdate(env, privateCallbackUpdate(5703, `byok:remove:yes:${configId}`));
    assert.equal(await getUserApiConfigMeta(42, env), null);
    edit = calls.filter((call) => /editMessageText$/.test(call.url)).at(-1);
    assert.match(edit.body.rich_message.html, /My API removed/);

    // Next text turn: no BYOK call at all.
    assert.equal((await postGroupUpdate(env, privateTextUpdate(5704, 13, "Hello"))).status, 200);
    assert.equal(aiCalls.length, 1);
    assert.equal(calls.some((call) => call.url.includes("api.groq.com")), false);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

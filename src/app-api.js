import { generateReply } from "./ai.js";
import { APP, BYOK_PRESETS, LANGUAGE_OPTIONS, MODES, SUPPORTED_LANGUAGE_CODES, byokPreset } from "./config.js";
import { getFreeModelCatalog, isSelectableFreeModel } from "./catalog.js";
import { allowUsage, parseAdminIds, safeError } from "./security.js";
import { addCustomByokModel, conversationKey, ensureConversationSession, getActiveUserApiConfigId, getConversationSession, getUserApiConfig, getUserApiConfigMeta, getUserSettings, listUserApiConfigs, markUserApiConfigInvalid, resetUserAgentPreferences, saveConversationSession, saveUserApiConfig, setActiveUserApiConfig, setMemoryEnabled, setSelectedModel, setUserApiConfigEnabled, setUserLanguage, setUserMode, startNewConversationSession, updateUserApiConfigModel, upsertUser } from "./storage.js";
import { getVerifiedWebAppUser } from "./webapp-auth.js";
import { getRequiredChannelMembership } from "./membership.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    }
  });
}

function isValidPrompt(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= APP.maxInputCharacters;
}

function terminalConversationKey(userId) {
  // Keep terminal history separate from the private Telegram chat while reusing
  // the same short-lived, TTL-bounded active Session store.
  return conversationKey({ chatId: userId, userId, threadId: "terminal" });
}

function scriptLanguageFromText(value, telegramLanguageCode = "") {
  const text = String(value || "");
  if (/[\u0600-\u06ff]/.test(text)) {
    const telegramLanguage = String(telegramLanguageCode || "").replace("_", "-").toLowerCase();
    const persianSpecific = /[\u067e\u0686\u0698\u06af\u06a9\u06cc]/.test(text);
    const arabicSpecific = /[\u0621\u0623\u0625\u0626\u0629\u0649\u0624]/.test(text);
    return !persianSpecific && (telegramLanguage === "ar" || telegramLanguage.startsWith("ar-") || arabicSpecific) ? "ar" : "fa";
  }
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[\u0900-\u097f]/.test(text)) return "hi";
  return null;
}

function activeTerminalLanguage(prompt, settings, session, telegramLanguageCode) {
  return scriptLanguageFromText(prompt, telegramLanguageCode) || session?.language || settings.language || "en";
}

function responseText(language, key) {
  const fa = language === "fa";
  const values = {
    busy: fa ? "مسیر رایگان فعلاً مشغول است. کمی بعد دوباره تلاش کنید." : "This free route is busy right now. Please try again shortly.",
    temporary: fa ? "مشکلی موقت رخ داد. لطفاً دوباره تلاش کنید." : "A temporary problem occurred. Please try again.",
    invalid: fa ? "متن پیام معتبر نیست." : "Enter a valid message to continue."
  };
  return values[key] || values.temporary;
}

// Same wording as the bot's busyText (router.js): only an approximate
// window, never the quota numbers.
function busyMessage(language, resetInSeconds) {
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

function byokFallbackNotice(language) {
  return language === "fa" ? "⚠️ API شما جواب نداد، پس با مدل‌های IVAI جواب دادم." : "⚠️ Your API didn't answer, so I replied with IVAI models instead.";
}

// The engine answering on the web: the active BYOK config (valid + enabled)
// wins, anything else reads as IVAI models — same rule as the bot menu's
// Engine line (v3.11.0).
async function activeByokEngine(userId, env) {
  try {
    const meta = await getUserApiConfigMeta(userId, env);
    if (!meta || !meta.enabled || meta.status !== "valid" || !meta.model) return null;
    return { configId: meta.configId, name: meta.name, model: meta.model };
  } catch {
    return null;
  }
}

// BYOK validators mirror the bot flow (router.js): the preset's keyPattern
// is only a first-pass format check; custom endpoints must be https.
function byokKeyLooksValid(preset, key) {
  return Boolean(preset?.keyPattern?.test(String(key || "").trim()));
}

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

function publicByokConfigs(configs, activeConfigId) {
  return configs.map((config) => ({
    configId: config.configId,
    name: config.name,
    preset: config.preset,
    presetLabel: byokPreset(config.preset)?.label || config.preset,
    model: config.model,
    enabled: config.enabled,
    status: config.status,
    active: config.configId === activeConfigId
  }));
}

function byokPresetsForClient() {
  return Object.entries(BYOK_PRESETS).map(([id, preset]) => ({
    id,
    label: preset.label,
    chatModels: [...preset.chatModels],
    needsBaseUrl: !preset.baseUrl
  }));
}

async function terminalUser(request, env) {
  const initData = String(request.headers.get("x-telegram-init-data") || "");
  const telegramUser = await getVerifiedWebAppUser(request, env);
  if (!telegramUser?.id) {
    console.warn(JSON.stringify({ event: "terminal_auth_rejected", initDataPresent: Boolean(initData), initDataLength: initData.length }));
    return null;
  }
  // Same owner exemption as the chat flows: a membership-check outage must
  // never lock the owner out of their own Terminal.
  let membership = parseAdminIds(env).has(String(telegramUser.id))
    ? { allowed: true, reason: "OWNER" }
    : await getRequiredChannelMembership(telegramUser.id, env);
  // Same fresh-check rule as the chat flows: a cached denial is re-verified
  // live before it blocks a (possibly just-joined) member.
  if (!membership.allowed && membership.fromCache) {
    membership = await getRequiredChannelMembership(telegramUser.id, env, { fresh: true });
  }
  if (!membership.allowed) return { blocked: true, telegramUser, membership };
  const settings = await getUserSettings(telegramUser.id, env);
  // English is the default; only a stored explicit /lang choice overrides it.
  // Deriving (and persisting) the Telegram client's language_code is the exact
  // bug the chat flows removed in v3.4.0.
  const requestedLanguage = String(settings.language || "en").replace("_", "-");
  const language = SUPPORTED_LANGUAGE_CODES.has(requestedLanguage) ? requestedLanguage : "en";
  await upsertUser({ user: telegramUser, chat: { id: telegramUser.id, type: "private" }, language }, env);
  return { telegramUser, settings: { ...settings, language }, engine: await activeByokEngine(telegramUser.id, env) };
}

function publicSettings(settings) {
  return {
    language: settings.language,
    mode: settings.mode,
    modelRoute: settings.selectedModel ? "pinned" : "auto",
    selectedModel: settings.selectedModel || null,
    memoryEnabled: Boolean(settings.memoryEnabled)
  };
}

// The modes the web settings sheet offers — the same four the bot's mode
// picker offers (auto/fast/deep/code).
const WEB_SETTINGS_MODES = [MODES.AUTO, MODES.FAST, MODES.DEEP, MODES.CODE];

export async function handleAppRequest(request, env) {
  const url = new URL(request.url);
  const actor = await terminalUser(request, env);
  if (!actor) return json({ ok: false, code: "UNAUTHORIZED", message: "Open IVAI Terminal from Telegram." }, 401);
  if (actor.blocked) return json({ ok: false, code: "CHANNEL_REQUIRED", message: "Join @ILIVIR3 before using IVAI Terminal.", membershipReason: actor.membership.reason }, 403);

  const userId = actor.telegramUser.id;
  const key = terminalConversationKey(userId);

  if (url.pathname === "/app/session") {
    const session = await getConversationSession(key, env).catch(() => null);
    const history = (session?.messages || []).slice(-30).map((entry) => ({ role: entry.role, content: entry.content }));
    return json({ ok: true, settings: publicSettings(actor.settings), engine: actor.engine, history });
  }

  // All /app/* reads and writes are POST (index.js routes /app/* POST only);
  // the client posts an empty body for reads, like /app/session already does.
  if (url.pathname === "/app/byok") {
    const configs = await listUserApiConfigs(userId, env).catch(() => []);
    const activeConfigId = await getActiveUserApiConfigId(userId, env).catch(() => null);
    return json({ ok: true, configs: publicByokConfigs(configs, activeConfigId), presets: byokPresetsForClient() });
  }

  if (url.pathname === "/app/byok/add") {
    const body = await request.json().catch(() => null);
    const language = actor.settings.language;
    const preset = byokPreset(body?.preset);
    const apiKey = String(body?.apiKey || "").trim();
    const model = String(body?.model || "").trim();
    const name = String(body?.name || "").trim();
    if (!preset) return json({ ok: false, code: "INVALID_PRESET", message: language === "fa" ? "پروایدر معتبر نیست." : "Choose a valid provider." }, 400);
    if (!byokKeyLooksValid(preset, apiKey)) return json({ ok: false, code: "INVALID_KEY", message: language === "fa" ? "کلید API معتبر نیست." : "That API key doesn't look right." }, 400);
    if (!byokModelIdLooksValid(model)) return json({ ok: false, code: "INVALID_MODEL", message: language === "fa" ? "مدل معتبر نیست." : "Enter a valid model ID." }, 400);
    let baseUrl = preset.baseUrl;
    if (!baseUrl) {
      baseUrl = normalizeByokEndpoint(body?.baseUrl);
      if (!baseUrl) return json({ ok: false, code: "INVALID_ENDPOINT", message: language === "fa" ? "نقطهٔ پایانی باید https باشد." : "Enter a valid https endpoint." }, 400);
    }
    try {
      const configId = await saveUserApiConfig({ userId, preset: body.preset, baseUrl, apiKey, model, name: name || null }, env);
      // A typed model that is not in the preset catalog is remembered on the
      // config, like the bot's "Add a model" flow.
      if (!preset.chatModels.includes(model)) await addCustomByokModel(userId, model, env, configId).catch(() => {});
      const configs = await listUserApiConfigs(userId, env);
      const activeConfigId = await getActiveUserApiConfigId(userId, env);
      return json({ ok: true, configId, configs: publicByokConfigs(configs, activeConfigId) });
    } catch {
      return json({ ok: false, code: "UNAVAILABLE", message: responseText(language, "temporary") }, 503);
    }
  }

  if (url.pathname === "/app/byok/activate") {
    const body = await request.json().catch(() => null);
    const configId = String(body?.configId || "");
    const meta = await getUserApiConfigMeta(userId, env, configId).catch(() => null);
    if (!meta || meta.status !== "valid") return json({ ok: false, code: "NOT_FOUND", message: actor.settings.language === "fa" ? "این API پیدا نشد یا کلیدش نامعتبر است." : "That API was not found, or its key is invalid." }, 404);
    // Activation does NOT test the connection: a test call would burn the
    // user's own API tokens for nothing (owner decision v3.9.2). A stale key
    // is caught by the first real chat, which falls back with a notice.
    try {
      await setUserApiConfigEnabled(userId, true, env, configId);
      await setActiveUserApiConfig(userId, configId, env);
      const configs = await listUserApiConfigs(userId, env);
      return json({ ok: true, configs: publicByokConfigs(configs, configId), engine: { configId, name: meta.name, model: meta.model } });
    } catch {
      return json({ ok: false, code: "UNAVAILABLE", message: responseText(actor.settings.language, "temporary") }, 503);
    }
  }

  if (url.pathname === "/app/byok/stop") {
    try {
      await setActiveUserApiConfig(userId, null, env);
      const configs = await listUserApiConfigs(userId, env);
      return json({ ok: true, configs: publicByokConfigs(configs, null), engine: null });
    } catch {
      return json({ ok: false, code: "UNAVAILABLE", message: responseText(actor.settings.language, "temporary") }, 503);
    }
  }

  if (url.pathname === "/app/settings") {
    const body = await request.json().catch(() => null);
    if (!body || Object.keys(body).length === 0) {
      const catalog = await getFreeModelCatalog(env);
      let byokModels = [];
      if (actor.engine) {
        const meta = await getUserApiConfigMeta(userId, env).catch(() => null);
        const preset = byokPreset(meta?.preset);
        byokModels = [...(preset?.chatModels || []), ...(meta?.customModels || [])].filter((model, index, all) => all.indexOf(model) === index);
      }
      return json({
        ok: true,
        settings: publicSettings(actor.settings),
        engine: actor.engine,
        freeModels: catalog.map((model) => ({ id: model.id, name: model.name })),
        byokModels,
        languages: LANGUAGE_OPTIONS.map((option) => ({ code: option.code, label: option.label, native: option.native, flag: option.flag })),
        modes: [...WEB_SETTINGS_MODES]
      });
    }
    // Validate everything first; a bad field rejects the whole save.
    const language = actor.settings.language;
    if (body.mode !== undefined && !WEB_SETTINGS_MODES.includes(body.mode)) {
      return json({ ok: false, code: "INVALID_MODE", message: language === "fa" ? "حالت معتبر نیست." : "Choose a valid mode." }, 400);
    }
    if (body.language !== undefined && !SUPPORTED_LANGUAGE_CODES.has(String(body.language).replace("_", "-"))) {
      return json({ ok: false, code: "INVALID_LANGUAGE", message: language === "fa" ? "زبان معتبر نیست." : "Choose a valid language." }, 400);
    }
    if (body.memoryEnabled !== undefined && typeof body.memoryEnabled !== "boolean") {
      return json({ ok: false, code: "INVALID_MEMORY", message: language === "fa" ? "مقدار حافظه معتبر نیست." : "Memory must be on or off." }, 400);
    }
    // One model field, two destinations — exactly like the bot's two
    // pickers. With an active BYOK config the model belongs to that config
    // (preset catalog, a remembered custom model, or a newly typed one);
    // otherwise it must be a free-catalog model, or null for Auto.
    let modelAction = null;
    if (body.selectedModel !== undefined) {
      if (body.selectedModel === null) {
        modelAction = { free: null };
      } else if (typeof body.selectedModel === "string" && body.selectedModel) {
        if (actor.engine && byokModelIdLooksValid(body.selectedModel)) {
          modelAction = { byok: body.selectedModel.trim() };
        } else if (isSelectableFreeModel(body.selectedModel, await getFreeModelCatalog(env))) {
          modelAction = { free: body.selectedModel };
        } else {
          return json({ ok: false, code: "INVALID_MODEL", message: language === "fa" ? "مدل معتبر نیست." : "Choose a valid model." }, 400);
        }
      } else {
        return json({ ok: false, code: "INVALID_MODEL", message: language === "fa" ? "مدل معتبر نیست." : "Choose a valid model." }, 400);
      }
    }
    try {
      if (body.mode !== undefined) await setUserMode(userId, body.mode, env);
      // Auto clears any pinned model in the bot too; a model sent together
      // with Auto is dropped rather than re-pinning behind Auto's back.
      if (modelAction?.free !== undefined && body.mode !== MODES.AUTO) await setSelectedModel(userId, modelAction.free, env);
      if (modelAction?.byok && actor.engine) {
        const preset = byokPreset((await getUserApiConfigMeta(userId, env).catch(() => null))?.preset);
        await updateUserApiConfigModel(userId, { model: modelAction.byok, visionModel: preset?.visionModel ?? null, transcriptionModel: preset?.transcriptionModel ?? null }, env, actor.engine.configId);
        // Catalog models already come from the preset; only a newly typed
        // model is remembered on the config.
        if (!preset?.chatModels?.includes(modelAction.byok)) await addCustomByokModel(userId, modelAction.byok, env, actor.engine.configId).catch(() => {});
      }
      if (body.memoryEnabled !== undefined) await setMemoryEnabled(userId, body.memoryEnabled, env);
      if (body.language !== undefined) await setUserLanguage(userId, String(body.language).replace("_", "-"), env);
      const settings = await getUserSettings(userId, env);
      const engine = await activeByokEngine(userId, env);
      return json({ ok: true, settings: publicSettings({ ...settings, language: settings.language || "en" }), engine });
    } catch {
      return json({ ok: false, code: "UNAVAILABLE", message: responseText(language, "temporary") }, 503);
    }
  }

  if (url.pathname === "/app/new") {
    await Promise.all([
      resetUserAgentPreferences(actor.telegramUser.id, env),
      startNewConversationSession(key, env)
    ]);
    const settings = { ...(await getUserSettings(actor.telegramUser.id, env)), language: actor.settings.language };
    return json({ ok: true, settings: publicSettings(settings), engine: actor.engine });
  }

  if (url.pathname !== "/app/chat") return json({ ok: false, code: "NOT_FOUND" }, 404);

  const body = await request.json().catch(() => null);
  const text = body?.text;
  if (!isValidPrompt(text)) return json({ ok: false, code: "INVALID_INPUT", message: responseText(actor.settings.language, "invalid") }, 400);

  const usage = await allowUsage({ scope: "text", id: actor.telegramUser.id, limit: APP.userHourlyTextLimit }, env);
  if (!usage.allowed) return json({ ok: false, code: "RATE_LIMIT", message: busyMessage(actor.settings.language, usage.resetInSeconds), remaining: 0, resetInSeconds: usage.resetInSeconds }, 429);

  const prompt = text.trim();
  const initialLanguage = scriptLanguageFromText(prompt, actor.telegramUser.language_code) || actor.settings.language;
  const session = await ensureConversationSession(key, env, { language: initialLanguage });
  const language = activeTerminalLanguage(prompt, actor.settings, session, actor.telegramUser.language_code);
  const context = session?.messages || [];
  // The active BYOK config answers first when one is set; generateReply
  // falls back to the free chain on any failure, exactly like the bot.
  const byokConfig = await getUserApiConfig(actor.telegramUser.id, env).catch(() => null);
  try {
    const result = await generateReply({
      text: prompt,
      selectedMode: actor.settings.mode,
      selectedModel: actor.settings.selectedModel,
      language,
      context,
      byokConfig
    }, env);
    // A 401 counts toward invalidating a dead key, like the bot's 3×401 rule.
    if (result.byokAuthFailed && byokConfig) markUserApiConfigInvalid(actor.telegramUser.id, env, {}, byokConfig.configId).catch(() => {});
    await saveConversationSession(key, [...context, { role: "user", content: prompt }, { role: "assistant", content: result.text }], env, { session, language });
    // The chat response carries the ANSWER language in `language`, but the
    // returned settings keep the stored UI language: a Persian prompt must
    // answer in Persian without flipping the whole Terminal UI to Persian.
    const activeSettings = { ...actor.settings };
    return json({
      ok: true,
      text: result.text,
      model: result.model,
      mode: result.mode,
      language,
      settings: publicSettings(activeSettings),
      engine: actor.engine,
      notice: result.fellBackFromByok ? byokFallbackNotice(language) : null,
      remaining: usage.remaining
    });
  } catch (error) {
    const code = safeError(error);
    console.error(JSON.stringify({ event: "terminal_ai_failure", code, userId: String(actor.telegramUser.id) }));
    return json({
      ok: false,
      code,
      message: responseText(scriptLanguageFromText(text, actor.telegramUser.language_code) || actor.settings.language, code === "RATE_LIMIT" ? "busy" : "temporary"),
      remaining: usage.remaining
    }, code === "RATE_LIMIT" ? 429 : 503);
  }
}

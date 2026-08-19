import { FREE_MODEL_POLICY } from "./config.js";

const CATALOG_KEY = "catalog:openrouter:free:v1";
const CATALOG_TTL_SECONDS = 6 * 60 * 60;
const REFRESH_COOLDOWN_SECONDS = 15 * 60;
const MAX_MODELS = 48;

function categoryFor(model) {
  const value = `${model.id} ${model.name || ""}`.toLowerCase();
  if (/coder|code|devstral|qwen.*coder/.test(value)) return "code";
  if (/reason|thinking|70b|80b|32b|deep/.test(value)) return "deep";
  return "fast";
}

function normalize(model) {
  return {
    id: String(model.id),
    name: String(model.name || model.id),
    category: categoryFor(model),
    contextLength: Number(model.context_length || 0)
  };
}

export function defaultFreeModels() {
  return FREE_MODEL_POLICY.openRouter.map((id) => normalize({ id, name: id }));
}

export async function getFreeModelCatalog(env) {
  if (!env.IVAI_KV) return defaultFreeModels();
  try {
    const parsed = JSON.parse((await env.IVAI_KV.get(CATALOG_KEY)) || "null");
    if (Array.isArray(parsed?.models) && parsed.models.length) return parsed.models;
  } catch {
    // A corrupt cache must never block the fallback catalog.
  }
  return defaultFreeModels();
}

export async function refreshFreeModelCatalog(env) {
  if (!env.IVAI_KV) return { refreshed: false, reason: "KV is not configured", models: defaultFreeModels() };
  const cooldownKey = "cooldown:refreshmodels";
  if (await env.IVAI_KV.get(cooldownKey)) return { refreshed: false, reason: "Please wait before refreshing again.", models: await getFreeModelCatalog(env) };

  const headers = { accept: "application/json" };
  if (env.OPENROUTER_API_KEY) headers.authorization = `Bearer ${env.OPENROUTER_API_KEY}`;
  const response = await fetch("https://openrouter.ai/api/v1/models", { headers });
  if (!response.ok) throw new Error(`OpenRouter catalog request failed: ${response.status}`);
  const payload = await response.json();
  const models = (payload?.data || [])
    .filter((model) => typeof model?.id === "string" && model.id.endsWith(":free"))
    .map(normalize)
    .filter((model, index, all) => all.findIndex((entry) => entry.id === model.id) === index)
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, MAX_MODELS);

  if (!models.length) throw new Error("OpenRouter did not return an eligible free model.");
  await env.IVAI_KV.put(CATALOG_KEY, JSON.stringify({ models, refreshedAt: new Date().toISOString() }), { expirationTtl: CATALOG_TTL_SECONDS });
  await env.IVAI_KV.put(cooldownKey, "1", { expirationTtl: REFRESH_COOLDOWN_SECONDS });
  return { refreshed: true, models };
}

export async function selectCatalogModel(index, env) {
  const catalog = await getFreeModelCatalog(env);
  const model = catalog[Number(index) - 1];
  return model?.id?.endsWith(":free") ? model : null;
}

export function renderModelList(models, language = "en", page = 0, size = 8) {
  const start = Math.max(0, page) * size;
  const list = models.slice(start, start + size);
  if (language === "fa") {
    return list.map((model, index) => `${start + index + 1}. <code>${model.id}</code> — ${model.category}`).join("\n");
  }
  return list.map((model, index) => `${start + index + 1}. <code>${model.id}</code> — ${model.category}`).join("\n");
}

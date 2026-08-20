# Provider Research — 2026-08-20

This note records the source-backed provider decision for the IVAI v3.3 free-only model refresh. It is not a promise that a third-party free tier is unlimited; all providers can enforce rate limits or change availability. IVAI therefore uses an explicit allowlist, one request at a time, bounded outputs, and sequential fallback.

## Decision summary

| Provider | Verified current position | Policy consequence |
|---|---|---|
| Cloudflare Workers AI | The Workers Free plan provides 10,000 Neurons per day at no charge. Some frontier models, including GLM 5.2, require paid access and are excluded. | Retain only models that are not marked paid-only and maintain the Worker-side daily guard below the free allocation. |
| OpenRouter | `openrouter/free` routes to a currently available free model; individual `:free` availability changes frequently. The Models API exposes current model metadata. | Use the free router as automatic fallback and admit cached individual models only after price metadata verifies zero prompt, completion, image, request, and internal-reasoning cost. |
| Groq | The active production text models are GPT-OSS 20B and GPT-OSS 120B; the former Llama 3.1 8B instant model was deprecated on 2026-08-16. Free-tier rate limits apply. | Replace the retired Llama model with GPT-OSS 20B; use GPT-OSS 120B only as an explicit deep-mode fallback, and never invoke Compound because it can use tools. |
| Google Gemini API | The pricing page shows free access for selected Gemini 3 Flash and Flash-Lite models, subject to per-model free-tier limits. Search grounding is excluded because it can become chargeable. | Use text-only `generateContent` against Flash/Flash-Lite models, with no Google Search, Maps, media-generation, paid model, or billing-dependent tool configuration. |

## Sources

1. [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), updated 2026-08-18.
2. [Cloudflare Workers AI models](https://developers.cloudflare.com/workers-ai/models/), updated 2026-08-12.
3. [OpenRouter Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-router).
4. [OpenRouter Models API](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties).
5. [Groq supported models](https://console.groq.com/docs/models).
6. [Groq deprecations](https://console.groq.com/docs/deprecations).
7. [Groq rate limits](https://console.groq.com/docs/rate-limits).
8. [Gemini API models](https://ai.google.dev/gemini-api/docs/models), updated 2026-08-14.
9. [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing), accessed 2026-08-20.
10. [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), updated 2026-08-18.

## Approved model matrix for IVAI v3.3.1

| Provider | Approved model or route | IVAI role | Free-tier safeguard |
|---|---|---|---|
| Workers AI | `@cf/zai-org/glm-4.7-flash` | Default automatic and quick text path. | Conservative daily Worker reservation guard. |
| Workers AI | `@cf/google/gemma-4-26b-a4b-it` | Deep text path and first image-understanding model. | Excluded when the bounded Worker AI budget is exhausted. |
| Workers AI | `@cf/openai/gpt-oss-20b` | Alternative text/reasoning path. | Excluded when the bounded Worker AI budget is exhausted. |
| Workers AI | `@cf/ibm-granite/granite-4.0-h-micro` | Small, efficient text fallback. | Excluded when the bounded Worker AI budget is exhausted. |
| Workers AI | `@cf/meta/llama-4-scout-17b-16e-instruct` | Secondary image-understanding fallback. | Excluded when the bounded Worker AI budget is exhausted. |
| Workers AI | `@cf/openai/whisper-large-v3-turbo`, then `@cf/openai/whisper` | Voice transcription. | File-size limit, per-user media cap, and bounded reservation. |
| Workers AI | `@cf/meta/llama-guard-3-8b` | One-call Guard Mode classification. | A dedicated small budget reservation. |
| OpenRouter | `openrouter/free` | Automatic free-model routing if Workers AI is unavailable. | Official free router; no paid auto-router is used. |
| OpenRouter | Cached `:free` models | User-selectable models from the live catalog. | Requires zero price for prompt, completion, request, and relevant metered fields; must support text chat. |
| Groq | `openai/gpt-oss-20b` | First Groq text fallback. | Free-plan quota failures become a sequential fallback, never a paid request. |
| Groq | `openai/gpt-oss-120b` | Deep/code Groq fallback. | Free-plan quota failures become a sequential fallback, never a paid request. |
| Groq | `qwen/qwen3.6-27b` | Multimodal-capable Groq fallback for future compatible paths. | No Groq Compound route or built-in tool execution is enabled. |
| Google AI Studio | `gemini-3.7-flash`, `gemini-3.6-flash` | Higher-capability text fallback. | Plain `generateContent` only; no grounding or billable tool. |
| Google AI Studio | `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-flash-lite` | Fast and low-consumption text fallback. | Plain `generateContent` only; no grounding or billable tool. |

> **Free does not mean unlimited.** A free-tier provider can return a quota or capacity error. IVAI handles that error by continuing sequentially to the next approved free provider or returning a short retry message; it does not activate a paid fallback.

## Explicit exclusions

| Excluded category | Reason |
|---|---|
| Workers AI `@cf/zai-org/glm-5.2`, Kimi K2.6/K2.7 Code, and DeepSeek V4 Flash/Pro | Cloudflare marks these models as requiring a paid plan or prepaid credits. |
| OpenRouter Auto Router and all non-zero-price model entries | They can route to or charge for paid inference. |
| Groq Compound / Compound Mini | These systems may invoke integrated external tools; IVAI’s low-consumption one-model request contract does not permit them. |
| Groq preview models | Groq documents preview models as non-production and subject to short-notice discontinuation. |
| Gemini Pro, image/video/music generation, Google Search grounding, Google Maps grounding, and Computer Use | These either lack Free Tier access, can create paid use, or exceed the bot’s bounded text-first scope. |

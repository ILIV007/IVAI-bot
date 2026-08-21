# Model Picker Provider Research — 2026-08-21

## Scope

This note supports a free-only expansion of IVAI Bot's model picker. The bot must not expose an option that can incur paid usage, and it must preserve a single successful provider invocation per user request.

## Findings

| Provider | Official evidence | Picker decision |
|---|---|---|
| Cloudflare Workers AI | The official catalog lists current text-generation options including GLM 4.7 Flash, Gemma 4 26B A4B, GPT-OSS 20B/120B, Granite 4.0 H Micro, Kimi K2.6/K2.7 Code, Llama 4 Scout and other models. The platform's free allocation remains budget-limited, so IVAI keeps its conservative 8,000-Neuron guard. | Present only the existing conservative, verified static allowlist in the initial picker. Do not infer free eligibility from catalog presence alone. |
| OpenRouter | The existing runtime catalog queries the official model endpoint and requires a `:free` suffix plus zero prompt, completion, request and applicable add-on pricing before exposing a model. | Retain dynamic discovery as the broadest safe source of variety; group and label verified `:free` models by provider family and use case. |
| Groq | The official model page lists GPT-OSS 20B and 120B as production models but publishes paid per-token pricing. Its model endpoint can enumerate active IDs, but it does not prove zero cost for this bot's account. | Keep Groq as a fallback only when the user-configured account is free-tier eligible; do not add paid-priced models merely for variety. |
| Gemini Developer API | Official model and pricing pages show free input/output availability for certain stable Flash and Flash-Lite models, while models such as Gemini 3.1 Pro Preview have no free tier. | Keep stable models whose pricing table explicitly shows Free Tier text access; do not add Pro, search-grounded, media-generation or preview-only options. |

## UX implications

The picker should show each model with a consistent colored provider marker, a short human-readable name, a compact use-case tag, and the selected state. A secondary information view should explain provider, intended workload, context capacity when known, and the free-only fallback behavior. Provider-specific browse controls should filter the same verified catalog rather than creating new provider calls.

## Sources

1. Cloudflare Workers AI Models: https://developers.cloudflare.com/workers-ai/models/
2. Groq Supported Models: https://console.groq.com/docs/models
3. Gemini API Models: https://ai.google.dev/gemini-api/docs/models
4. Gemini Developer API Pricing: https://ai.google.dev/gemini-api/docs/pricing
5. OpenRouter Models API used in runtime: https://openrouter.ai/api/v1/models

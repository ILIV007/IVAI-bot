# IVAI Bot v3.3 — Free-Tier, Secure Telegram AI Assistant

> **IVAI** is an English-first Telegram AI assistant built for Cloudflare Workers. Persian is an optional second language. The v3.3 foundation keeps the familiar v3.2 workflow—modes, free-model catalog, model lock, memory controls, provider fallback, and space-themed interaction—while adding webhook security, a free-only model policy, D1 data, admin controls, responsive Mini App groundwork, multimodal adapters, and inline feedback.

## Product principles

| Principle | Implementation |
|---|---|
| **Free-only operation** | Every model must pass the `FREE_MODEL_POLICY`; no paid fallback, Telegram Stars, or paid broadcast route exists. |
| **Low resource consumption** | One model call by default, sequential fallback only after a failure, compact context, strict media limits, cache/TTL storage, and per-user quotas. |
| **English-first** | English is the default for all new users and admin UX. Persian is available through `/lang` or Persian-language detection. |
| **Privacy-aware memory** | Memory is disabled by default, stored with TTL in KV when enabled, and can be inspected or cleared. |
| **Safe administration** | Admin IDs belong in a Worker Secret; broadcast uses draft → preview → confirmation → queued batches with audit logging. |

## Current foundation

| Area | Included in v3.3 foundation |
|---|---|
| Core commands | `/start`, `/menu`, `/help`, `/auto`, `/fast`, `/deep`, `/code`, `/prompt`, `/guest`, `/guard`, `/secretary`, `/management`, `/lang`, `/debug`, `/reset` |
| Model controls | `/models`, `/refreshmodels`, `/pick <number>`, `/model off` with a cached free-only OpenRouter catalog |
| Memory controls | `/memory on`, `/memory off`, `/memory show`, `/memory clear` |
| Providers | Workers AI first, then OpenRouter `:free`, Groq, and Google AI Studio as sequential configured fallbacks |
| Telegram UX | Mobile-friendly inline keyboards, message chunking, feedback buttons, callback handling, Inline Mode, and `chosen_inline_result` tracking |
| Multimodal | Voice transcription and image understanding adapters through Workers AI, guarded by file and quota limits |
| Admin | Owner/admin roles, Telegram-native admin controls, reviewable broadcast drafts, audit logging, responsive `/admin` Mini App shell, and server-side `initData` validation |
| Security | Telegram webhook secret validation, update deduplication, no Secret in source control, user-level rate limits, and daily Workers AI budget guard |

## Project layout

```text
src/
├── index.js          # Worker entry point, webhook routing, scheduled broadcast processing
├── router.js         # Commands, callbacks, Inline Mode, text and media routing
├── ai.js             # Free-only provider policy and sequential fallback
├── catalog.js        # Cached OpenRouter free-model catalog and model picking
├── media.js          # Telegram download, Whisper transcription, image analysis
├── security.js       # Webhook check, owner role, dedupe, quotas
├── storage.js        # D1/KV persistence
├── broadcast.js      # Draft/confirm/queue/batch delivery flow
├── admin.js          # Validated Mini App admin API
├── admin-page.js     # Responsive English-first Mini App UI
└── telegram.js       # Telegram API, keyboards, safe rendering

db/0001_initial_schema.sql  # D1 schema
test/foundation.test.js      # Node test suite
wrangler.jsonc               # Binding-only Worker configuration
```

## Required Worker bindings

The repository deliberately includes binding IDs but **no secret values**.

| Binding | Resource |
|---|---|
| `IVAI_KV` | Cloudflare Workers KV namespace `IVAI_KV` |
| `IVAI_DB` | Cloudflare D1 database `ivai_db` |
| `AI` | Cloudflare Workers AI binding |

## Required Worker Secrets

Set the following values only as Cloudflare Worker Secrets. Do not put them in `wrangler.jsonc`, commit them, or paste them into a repository issue.

| Secret | Required | Purpose |
|---|---:|---|
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram Bot API access |
| `TELEGRAM_WEBHOOK_SECRET` | Yes | Validates the Telegram webhook header |
| `ADMIN_TELEGRAM_IDS` | Yes | Comma-separated bootstrap owner IDs |
| `OPENROUTER_API_KEY` | Optional | Free-model catalog and `:free` fallback |
| `GROQ_API_KEY` | Optional | Configured free-tier fallback |
| `GOOGLE_API_KEY` | Optional | Configured free-tier fallback |

Copy `.dev.vars.example` to `.dev.vars` for local-only development and never commit that file.

## Local checks

```bash
npm run check
npm test
```

## Deployment sequence

1. Apply `db/0001_initial_schema.sql` to the empty D1 production database.
2. Attach `IVAI_KV`, `IVAI_DB`, and `AI` bindings to `ivai-bot`.
3. Register actual values as Worker Secrets.
4. Deploy the Worker.
5. Set the Telegram webhook with a random `secret_token` that matches `TELEGRAM_WEBHOOK_SECRET`; subscribe only to needed update types.
6. Enable Inline Mode in BotFather and point the Mini App button at `/admin` only after deployment.
7. Validate `/start`, `/help`, text, inline query, feedback, role checks, and the broadcast preview on a staging chat before production use.

> The Worker must remain on the free-only policy. If a provider changes access terms or a model is no longer eligible, remove it from the allowlist rather than silently moving to a paid model.

## Reference implementation review

The supplied `multi-bot` archive was reviewed as an implementation reference. Its safe file-size checks, mode routing, worker error boundary, and Workers AI response normalization informed v3.3. Its missing webhook validation, unrestricted KV-only architecture, and direct hard-coded model selection were not adopted. See `../ivai_analysis/Multi_Bot_Reference_Assessment_FA.md` in the task deliverables for the full comparison.

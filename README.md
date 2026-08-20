# IVAI Bot v3.3.2 — Free-Tier, Secure Telegram AI Assistant

[![Continuous Integration](https://github.com/ILIV007/IVAI-bot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ILIV007/IVAI-bot/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **IVAI** is an English-first Telegram AI assistant built for Cloudflare Workers. Persian is an optional second language. The v3.3.2 release preserves the familiar v3.2 workflow—modes, free-model catalog, model lock, memory controls, provider fallback, and space-themed interaction—while adding webhook security, a source-verified free-only model policy, D1 data, admin controls, a responsive user-facing IVAI Terminal Mini App, multimodal adapters, and inline feedback.

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
| Core commands | `/start`, `/menu`, `/help`, `/auto`, `/fast`, `/deep`, `/guard`, `/lang`, `/notify on|off`, `/debug`, `/reset` |
| Secretary | `/task title`, `/task in 30m | title`, `/task <ISO-8601-with-offset> | title`, `/tasks`, `/done <id>`, `/cancel <id>`; reminders are delivered in a small free cron batch |
| Model controls | `/models`, `/refreshmodels`, `/pick <number>`, `/model off` with a unified free-only picker across configured providers |
| Memory controls | `/memory on`, `/memory off`, `/memory show`, `/memory clear` |
| Providers | Workers AI first, then the official OpenRouter Free Router and verified zero-price `:free` catalog entries, active Groq GPT-OSS/Qwen models, and Gemini Flash/Flash-Lite free-tier models as sequential fallbacks |
| Telegram UX | Rich Draft + Rich Message fallback, colored inline buttons, message chunking, callback handling, Inline Mode, Guest AI replies, and reaction-based group feedback |
| Multimodal | Voice transcription and image understanding adapters through Workers AI, guarded by file and quota limits |
| Admin | Owner/admin roles, Telegram-native admin controls, reviewable broadcast drafts, audit logging, responsive `/admin` Mini App shell, and server-side `initData` validation |
| IVAI Terminal | A lightweight, navy/blue/jade user Mini App at `/app`; server-validated Telegram identity, same-origin JSON API, one shared free AI path per turn, no polling or permanent transcript by default |
| Context routing | Thread/topic, direct-message topic, and business-connection context are preserved for typing, draft, text and media replies |
| Re-engagement | A consent-controlled, at-most-once-per-15-days check-in for inactive users; five sequential deliveries per scheduled run, no AI call and `/notify on|off` control |
| Languages | English-first, Persian-second, plus Arabic, Spanish, Turkish, Russian, Portuguese (Brazil), Indonesian, Hindi, French and German via `/lang` |
| Security | Telegram webhook secret validation, update deduplication, no Secret in source control, user-level rate limits, strict zero-price catalog admission, and a conservative 8,000-Neuron daily Workers AI budget guard |

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
├── secretary.js      # Task reminder claim and delivery flow
├── reengagement.js   # Consent-controlled inactive-user check-ins
├── admin.js          # Validated Mini App admin API
├── admin-page.js     # Responsive English-first admin Mini App UI
├── webapp-auth.js    # Shared server-side Telegram initData validation
├── app-api.js        # Public IVAI Terminal session and chat API
├── app-page.js       # Lightweight navy/blue/jade terminal Mini App UI
└── telegram.js       # Telegram API, rich drafts, keyboards, context-aware safe rendering

db/0001_initial_schema.sql  # D1 base schema
db/0002_runtime_guards.sql  # Atomic dedupe and quota guards
db/0003_secretary_reminders.sql # Task reminder delivery state and indexes
db/0004_reengagement.sql # Consent and delivery state for inactivity check-ins
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
pnpm install
npm run check
npm test
```

## Deployment sequence

1. Apply `db/0001_initial_schema.sql`, `db/0002_runtime_guards.sql`, `db/0003_secretary_reminders.sql`, and then `db/0004_reengagement.sql` to the production D1 database.
2. Attach `IVAI_KV`, `IVAI_DB`, and `AI` bindings to `ivai-bot`.
3. Register actual values as Worker Secrets.
4. Deploy the Worker.
5. Set the Telegram webhook with a random `secret_token` that matches `TELEGRAM_WEBHOOK_SECRET`; subscribe only to needed update types.
6. Enable Inline Mode in BotFather. Configure the **Main Mini App** and the bot menu button to `https://ivai-bot.ivai-bot.workers.dev/app`; keep `/admin` as the separate role-protected operations panel.
7. Validate `/start`, `/help`, language picker, model picker, private Rich Draft/fallback, text, inline query, Guest reply, reaction feedback, Business/Thread context, role checks, broadcast preview, `/task in 30m | reminder test`, and `/notify off` on a staging chat before production use. Cron reminders and inactive-user check-ins are batch-delivered within roughly ten minutes of eligibility.
8. After the code is live, refresh the Telegram webhook with `guest_message` and `message_reaction` in `allowed_updates`; enable Guest Mode and Inline Mode in BotFather. See `docs/TELEGRAM_FEATURE_MATRIX_FA.md`.

> The Worker must remain on the free-only policy. If a provider changes access terms or a model is no longer eligible, remove it from the allowlist rather than silently moving to a paid model.

## Documentation and contribution

| Resource | Purpose |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Module boundaries, request lifecycle, scheduled lifecycle, and data ownership. |
| [Deployment checklist](docs/DEPLOYMENT_CHECKLIST.md) | Required D1 migrations, secrets, webhook updates, and acceptance checks. |
| [Telegram feature matrix (FA)](docs/TELEGRAM_FEATURE_MATRIX_FA.md) | Telegram capability coverage and remaining BotFather actions. |
| [Re-engagement and language decision](docs/REENGAGEMENT_AND_LANGUAGE_DECISION.md) | Consent, delivery limits, and language-selection rationale. |
| [Provider research](docs/PROVIDER_RESEARCH_2026-08-20.md) | Source-backed model eligibility, deprecation review, provider limits, and safe fallback policy. |
| [IVAI Terminal proposal (FA)](docs/USER_TERMINAL_MINI_APP_PROPOSAL_FA.md) | Security boundary, low-cost architecture, UI design, and rollout plan for the public terminal Mini App. |
| [Changelog](CHANGELOG.md) | Release-level changes for v3.3.2. |
| [Contributing](CONTRIBUTING.md) | Free-only, privacy, testing, and migration rules for contributors. |
| [Security policy](SECURITY.md) | Private reporting process for vulnerabilities and exposed credentials. |

> The supplied `multi-bot` archive was reviewed as a private implementation reference. Its safe file-size checks, mode routing, Worker error boundary, and Workers AI response normalization informed v3.3. Its missing webhook validation, unrestricted KV-only architecture, and direct hard-coded model selection were not adopted.

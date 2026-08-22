# IVAI Bot v3.3.36 — Free-Tier, Secure Telegram AI Assistant

[![Continuous Integration](https://github.com/ILIV007/IVAI-bot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ILIV007/IVAI-bot/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **IVAI** is an English-first Telegram AI assistant built for Cloudflare Workers. Persian is an optional second language. The v3.3.36 release preserves the familiar v3.2 workflow—modes, free-model catalog, model lock, memory controls, provider fallback, and space-themed interaction—while keeping `/start` stickers uniformly selected, model-picker callbacks bound to stable model-ID tokens, UI metadata independent from the language of a user prompt, and every Auto/Fast/Deep/Code mode selection visibly confirmed in the Menu. These controls remain free-only, make no extra AI call, and retain graceful Telegram fallbacks.
>
> **Use IVAI on Telegram:** [@IVAI_Llm_bot](https://t.me/IVAI_Llm_bot)
> **Channel on Telegram:** [@ILIVIR3](https://t.me/ILIVIR3)

## Learn with IVAI on Telegram

[**@ILIVIR3**](https://t.me/ILIVIR3) is the public learning and discovery channel for this project. Its curated posts cover **software development, IT, technology, AI, open-source projects, practical programming resources, and hardware exploration**. IVAI Bot is the free Telegram companion that helps turn those topics into an active learning workflow.

| Learn in the channel | Continue with IVAI Bot |
|---|---|
| Discover a project, tool, lesson, video, repository, or technical idea. | Ask for a clear explanation, a beginner-friendly breakdown, a comparison, a study plan, code help, or a next practical exercise. |
| Follow Persian-language and international resources across AI, development, IT, open source, and maker hardware. | Use **Fast** for quick questions, **Deep** for analysis, **Code** for implementation work, and **Terminal** for a focused chat workspace. |
| Keep track of topics worth revisiting. | Use `/task` for a reminder, `/new` for a clean topic, `/lang` to change the interface language, and `/models` to select an available free route. |

> **A practical learning loop:** open a post in [@ILIVIR3](https://t.me/ILIVIR3), paste a harmless excerpt or describe the topic to [@IVAI_Llm_bot](https://t.me/IVAI_Llm_bot), ask one focused question, then request a small project or exercise. IVAI does not claim direct access to channel-history; share the context you want it to discuss.

For Persian-speaking learners, the detailed [Telegram learning guide (FA)](docs/TELEGRAM_LEARNING_GUIDE_FA.md) provides ready-to-use prompts, a seven-step study loop, and safe usage notes.

## Product principles

| Principle | Implementation |
|---|---|
| **Free-only operation** | Every model must pass the `FREE_MODEL_POLICY`; no paid fallback, Telegram Stars, or paid broadcast route exists. |
| **Low resource consumption** | One model call by default, sequential fallback only after a failure, compact context, strict media limits, cache/TTL storage, and per-user quotas. |
| **English-first** | English is the default for all new users and admin UX. Persian is available through `/lang` or Persian-language detection; fallback messages seed each Persian paragraph with a safe RTL mark while Rich Messages use Telegram-native `is_rtl`. |
| **Privacy-aware memory** | Every active conversation keeps a bounded, TTL-limited context for natural multi-turn chat. The optional Memory preference never disables that active Session; `/new`, `/start`, `/memory off`, and `/memory clear` reset it explicitly. |
| **Safe administration** | Admin IDs belong in a Worker Secret; broadcast uses draft → preview → confirmation → queued batches with audit logging. |

## Debug assurance

The current [full debug map](docs/DEBUG_PLAN_2026-08-21.md) records the scope, evidence and outcome for ingress, membership, Telegram UX, AI, media, D1/KV, Mini App, admin, scheduled jobs and production checks. Its rendered [system map](docs/debug-map-2026-08-21.png) provides the corresponding execution flow. The separate [multimodal model audit](docs/MULTIMODAL_MODEL_AUDIT_2026-08-21.md) records the official pricing, free-tier guardrails and live compatibility checks for voice and image handling.

## Current foundation

| Area | Included in v3.3 foundation |
|---|---|
| Core commands | `/start`, `/new`, `/menu`, `/help`, `/terminal`, `/auto`, `/fast`, `/deep`, `/code`, `/guard`, `/lang`, `/notify on|off`, `/debug`, `/reset` |
| Secretary | `/task title`, `/task in 30m | title`, `/task <ISO-8601-with-offset> | title`, `/tasks`, `/done <id>`, `/cancel <id>`; reminders are delivered in a small free cron batch |
| Model controls | `/models`, `/refreshmodels`, `/pick <number>`, `/model off` with a unified free-only picker. It offers 🟣 Cloudflare, 🔵 OpenRouter, 🟠 Groq and 🟢 Gemini filters, use-case filters for Fast/Deep/Code, preserved pagination, selected-state highlighting and provider/use-case details after selection. |
| Memory controls | `/memory on`, `/memory off`, `/memory show`, `/memory clear`; every active Session retains at most three complete turns, expires after 30 minutes of inactivity and cannot outlive two hours. Memory Off resets existing context but never breaks continuity of new turns inside the active Session. `/new` and `/start` begin a new Session without changing user settings. |
| Providers | A conservative Workers AI allowlist spanning GLM, Gemma, GPT-OSS, Granite, Llama and Qwen; the official OpenRouter Free Router plus dynamically verified zero-price `:free` entries; active Groq GPT-OSS/Qwen routes; and free-tier eligible Gemini Flash/Flash-Lite models. Every selected route still retains a sequential free fallback. |
| Telegram UX | Rich Draft + Rich Message fallback, safe tables and opt-in details, bounded visible footnotes, Deep/Code-only allow-listed LaTeX math, colored inline buttons, a focused Start surface, a descriptive five-row Menu, message chunking, callback handling, Inline Mode, Guest AI replies, and reaction-based group feedback |
| Multimodal | Voice transcription uses `@cf/openai/whisper-large-v3-turbo`; photo understanding uses live-validated `@cf/meta/llama-4-scout-17b-16e-instruct`, with Gemma 4 fallback. Downloads are capped at 8 MiB, networked for at most 15 seconds, capped at four requests per user/day, and use one guarded Workers AI call. Photo output is limited to 320 tokens. |
| Admin | Owner/admin roles, Telegram-native admin controls, reviewable broadcast drafts, audit logging, responsive `/admin` Mini App shell, and server-side `initData` validation |
| IVAI Terminal | A polished navy/blue/jade user Mini App at `/app` with explicit secure-session, reconnect, timeout and New Chat states; localized English/Persian/Arabic copy, a language-flag chip, compact selected-model state and safe DOM-based blockquote/bold/code rendering stay synchronized after each turn. A cached `setChatMenuButton` configuration exposes it persistently beside the private-chat composer. It uses server-validated Telegram identity, a same-origin JSON API, a separate short-lived Terminal Session, one shared free AI path per turn, no polling and no permanent transcript by default. |
| Context routing | Thread/topic, direct-message topic, and business-connection context are preserved for typing, draft, text and media replies |
| Re-engagement | A consent-controlled, at-most-once-per-15-days check-in for inactive users; five sequential deliveries per scheduled run, no AI call and `/notify on|off` control. Each delivery is protected by a D1 affected-row claim, so overlapping cron executions cannot send the same user twice. |
| Languages | English-first, Persian-second, plus Arabic, Spanish, Turkish, Russian, Portuguese (Brazil), Indonesian, Hindi, French and German via `/lang`; selection uses an atomic D1 upsert so it remains available after the required-channel Join callback. |
| Access control | Required membership in [@ILIVIR3](https://t.me/ILIVIR3) is verified with Telegram `getChatMember` before bot, inline, guest, media, callback and IVAI Terminal AI access; non-members receive only Join and Check membership actions |
| Security | Telegram webhook secret validation, retry-safe update deduplication, no Secret in source control, user-level rate limits, strict zero-price catalog admission, and a conservative 8,000-Neuron daily Workers AI budget guard that is reported consistently in admin metrics |

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
db/0005_broadcast_claims.sql # Atomic delivery lease and claim index for broadcast
test/                       # Node regression suites for Worker, broadcast and scheduled delivery
legacy/TeleLLMBot.v3.2.reference.js # Archived v3.2 reference; not the production entrypoint
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

1. Apply `db/0001_initial_schema.sql`, `db/0002_runtime_guards.sql`, `db/0003_secretary_reminders.sql`, `db/0004_reengagement.sql`, and then `db/0005_broadcast_claims.sql` to the production D1 database.
2. Attach `IVAI_KV`, `IVAI_DB`, and `AI` bindings to `ivai-bot`.
3. Register actual values as Worker Secrets.
4. Deploy the Worker.
5. Set the Telegram webhook with a random `secret_token` that matches `TELEGRAM_WEBHOOK_SECRET`; subscribe only to needed update types.
6. Enable Inline Mode in BotFather. Configure the **Main Mini App** and the bot menu button with the deployed value of `APP.terminalAppUrl`; keep `/admin` as the separate role-protected operations panel. The public entry point for users is [@IVAI_Llm_bot](https://t.me/IVAI_Llm_bot).
7. Validate `/start`, `/help`, language picker, model picker, private Rich Draft/fallback, text, inline query, Guest reply, reaction feedback, Business/Thread context, role checks, broadcast preview, `/task in 30m | reminder test`, and `/notify off` on a staging chat before production use. Cron reminders and inactive-user check-ins are batch-delivered within roughly ten minutes of eligibility.
8. After the code is live, refresh the Telegram webhook with `guest_message` and `message_reaction` in `allowed_updates`; enable Guest Mode and Inline Mode in BotFather. See `docs/TELEGRAM_FEATURE_MATRIX_FA.md`.

> The Worker must remain on the free-only policy. If a provider changes access terms or a model is no longer eligible, remove it from the allowlist rather than silently moving to a paid model.

## Documentation and contribution

| Resource | Purpose |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Module boundaries, request lifecycle, scheduled lifecycle, and data ownership. |
| [Deployment checklist](docs/DEPLOYMENT_CHECKLIST.md) | Required D1 migrations, secrets, webhook updates, and acceptance checks. |
| [Telegram feature matrix (FA)](docs/TELEGRAM_FEATURE_MATRIX_FA.md) | Telegram capability coverage and remaining BotFather actions. |
| [Production configuration status (FA)](docs/PRODUCTION_CONFIGURATION_STATUS_2026-08-22_FA.md) | Verified webhook, Worker binding, Mini App access and remaining client-side configuration status. |
| [Re-engagement and language decision](docs/REENGAGEMENT_AND_LANGUAGE_DECISION.md) | Consent, delivery limits, and language-selection rationale. |
| [Provider research](docs/PROVIDER_RESEARCH_2026-08-20.md) | Source-backed model eligibility, deprecation review, provider limits, and safe fallback policy. |
| [IVAI Terminal proposal (FA)](docs/USER_TERMINAL_MINI_APP_PROPOSAL_FA.md) | Security boundary, low-cost architecture, UI design, and rollout plan for the public terminal Mini App. |
| [Telegram real-world test plan (FA)](docs/TELEGRAM_REAL_WORLD_TEST_PLAN_FA.md) | Executed checks, Telegram acceptance scenarios, recovery behavior and safe failure reporting. |
| [Public launch readiness (FA)](docs/PUBLIC_LAUNCH_READINESS_2026-08-22_FA.md) | Current launch gates, synchronized public commands and owner-only final checks. |
| [Telegram learning guide (FA)](docs/TELEGRAM_LEARNING_GUIDE_FA.md) | Channel-to-bot learning loop, ready-to-use prompts, study flow, and safe usage notes. |
| [Required channel access](docs/REQUIRED_CHANNEL_ACCESS_FA.md) | Required channel policy, bot administrator prerequisite, join/recheck flow and acceptance checks. |
| [Terminal engineering review (FA)](docs/TERMINAL_ENGINEERING_REVIEW_2026-08-21_FA.md) | Root cause, v3.3.8 hotfix, security review, quality checks and final Telegram acceptance scenario. |
| [Full project engineering review (FA)](docs/PROJECT_ENGINEERING_REVIEW_2026-08-21_FA.md) | v3.3.9 code, queue, security, test, CI and GitHub review with remaining real-world acceptance checks. |
| [Production check notes (FA)](docs/PRODUCTION_CHECK_NOTES_2026-08-21.md) | Read-only production endpoint, Terminal recovery and API-surface verification for v3.3.10. |
| [Repository automation sources](docs/REPOSITORY_AUTOMATION_SOURCES_2026-08-21.md) | Official sources behind pnpm CI and Dependabot hygiene. |
| [Telegram rich formatting research](docs/TELEGRAM_RICH_FORMATTING_RESEARCH_2026-08-21.md) | Official rich-message, HTML and quote-formatting research behind v3.3.11. |
| [Changelog](CHANGELOG.md) | Release-level changes through v3.3.36. |
| [Contributing](CONTRIBUTING.md) | Free-only, privacy, testing, and migration rules for contributors. |
| [Security policy](SECURITY.md) | Private reporting process for vulnerabilities and exposed credentials. |

> The supplied `multi-bot` archive was reviewed as a private implementation reference. Its safe file-size checks, mode routing, Worker error boundary, and Workers AI response normalization informed v3.3. Its missing webhook validation, unrestricted KV-only architecture, and direct hard-coded model selection were not adopted.

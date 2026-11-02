# AGENTS.md — IVAI Bot

Guidance for AI agents (and humans) working on this repository. Read this before changing code; the behaviors below are product contracts set by the owner, not implementation details.

## What this is

IVAI is a privacy-aware, **free-tier only** Telegram AI assistant running as a **single Cloudflare Worker** (D1 `ivai_db`, KV `IVAI_KV`, Workers AI, a 10-minute cron). Bot: `@IVAI_Llm_bot`. Required (mother) channel: `@ILIVIR3`. There is no server, no paid AI API, and no build step beyond Wrangler.

## Commands

- `pnpm validate` — syntax check (`node --check src/*.js`) + full test suite (`node --test`). **Both must pass before any PR.**
- `pnpm dev` / `pnpm deploy` — Wrangler local dev / manual deploy (production normally deploys via Workers Builds on merge to `main`).

## Non-negotiable product rules

1. **Free models only.** Every model in `FREE_MODEL_POLICY` (`src/config.js`) must be a currently available zero-cost model. Verify IDs against the provider's official catalog before adding one — a plausible-looking ID may not exist. Fallback order matters: strongest first.
2. **English is the UI default.** UI language is an explicit, persistent user preference (default `en`, changed only via `/lang`). Never derive or persist UI language from the Telegram client's `language_code`. (Narrow exceptions: private-chat *answer* language may fall back to message script; group *answer* language follows the triggering message — see rule 4.)
3. **Groups: silence by default.** The bot speaks in groups only on three triggers: a post from the mother channel landing in its linked discussion group, a reply to the bot's own message (or directly on the channel post), or a mention/command addressed to the bot. Ignored group messages must cost zero extra API calls — no membership check, no settings load, no session write before the gate.
4. **Group answers are fast, light, and footer-less.** Group turns run the Fast profile pinned to `@cf/zai-org/glm-4.7-flash`, carry **no** model/mode footer, follow the triggering message's language, and use at most the last 5 reply-chain messages as context. Private chats keep the user's mode/model and the footer.
5. **Channel-post comments are takes, not summaries.** One comment in the post's own language in the Mira style: anchored in at least one specific detail from the post, with a short observation or mini-analysis and a clear personal take — never a summary or restatement, and never a generic one-liner that could fit any post on the topic. Typically 2–4 lines, ≤5 enforced in code. A comment is generated from the post's text or, for media posts, its caption (the caption IS the post text, whatever media it carries). Comments are sampled (~75%) and skipped for short posts (under 200 characters or under 20 words); media-only posts with no text/caption (photo, video, sticker, GIF, file, audio...) never get a comment.
6. **Membership is checked live before any prompt.** Never show a "join the channel" prompt from a cached or failed check: `CHECK_FAILED` is never cached and never justifies a prompt on its own; the Check button always re-verifies live. Cache only definitive results.
7. **Anti-spam limits are part of the feature.** Per-chat group limits, cooldowns, and per-user quotas (see `GROUP_POLICY` and `APP` in `src/config.js`) must not be bypassed by new code paths — route every AI call through the existing limit checks, and consume quota only for work actually performed.
8. **No secrets in the repo.** Tokens and API keys live in Worker secrets / GitHub secrets only.

## Architecture map

- `src/index.js` — Worker entry (fetch webhook + cron).
- `src/router.js` — update routing, group gate, message/media handlers, conversation sessions.
- `src/ai.js` / `src/media.js` — provider fallback chains and media (vision/voice) calls.
- `src/config.js` — `APP`, `GROUP_POLICY`, `FREE_MODEL_POLICY`, mode limits. Single source of truth for constants — don't duplicate them elsewhere.
- `src/telegram.js` — Telegram API wrappers, Rich Message sending, keyboards.
- `src/response-profile.js` — per-mode instructions and output budgets.
- `db/` — D1 migrations, numbered sequentially (`0006_...sql` etc.). Never edit an applied migration; add a new one.
- `test/foundation.test.js` — the whole suite. New behavior ships with tests; adapt a test only when an owner decision supersedes the behavior it asserts, and say so in the PR.

## Release flow

1. Work on a feature branch; keep `main` untouched until merge.
2. Bump the version in **all** of: `package.json`, `APP.version` in `src/config.js`, `README.md`, plus a `CHANGELOG.md` entry (Keep a Changelog format) — a test enforces the version match.
3. Open a PR; CI must be fully green, including the `pnpm audit` step (a wrangler bump is the usual fix for audit failures).
4. Squash-merge; Workers Builds deploys from `main`. Verify the health endpoint (`GET /` → "IVAI Worker is ready.") after deploy.
5. Telegram-side settings (BotFather Privacy Mode, bot admin in the channel and linked group, webhook `allowed_updates`) are manual owner steps — code changes cannot set them.

## Style

Smallest complete diff. Reuse existing helpers before adding new ones. No new dependencies without a strong reason. Keep the Persian plan/history documents in the owner's workspace (not this repo) as the record of product decisions.

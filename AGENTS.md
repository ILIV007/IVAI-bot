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
3. **Groups: silence by default.** The bot speaks in groups only on three triggers: a post from the mother channel landing in its linked discussion group, a reply to the bot's own message, or a mention/command addressed to the bot. Ignored group messages must cost zero extra API calls — no membership check, no settings load, no session write before the gate.
4. **Group answers are fast, light, and footer-less.** Group reply/mention turns run the Fast profile pinned to `@cf/zai-org/glm-4.7-flash`, carry **no** model/mode footer, follow the triggering message's language, and use at most the last 5 reply-chain messages as context. Channel-post comments are the one model exception: they also run Fast, but pinned to `@cf/qwen/qwen3.8-27b` for stronger multilingual quality (comments are capped at 10/hour, so the heavier free model stays affordable there). Reply/mention group turns show a typing indicator while generating (initial `sendTyping` plus the `startTypingRefresher` in `telegram.js`); channel-post comments never do — they simply arrive. Private chats keep the user's mode/model and the footer.
5. **Channel-post comments are takes with a soul, not summaries.** One comment in the post's own language, typically 1–3 lines, ≤5 enforced in code. Since v3.7.0 the prompt is a compact persona plus worked examples — a sharp, witty group regular with real taste who spots the one moment everyone will talk about (the embarrassing, funny, revealing, or absurd beat) and says what a smart friend would say. Since v3.7.2 the comment runs in ONE of two modes, chosen per post and taught by grouped examples (three FUN, two ANALYSIS): FUN is the witty comedy reaction; ANALYSIS is the very smart friend — what is genuinely good or interesting about the topic AND what else matters (the catch, the trade-off, the limit), balanced and concrete, not a roast and not a verdict. The two modes never mix in one comment. Then hard rules only: always land something real (a take — a prediction or one line of cause-and-effect — or a balanced analysis point; never a bare question, "how interesting!", or empty amazement); one mode per comment — no joke blended into an analysis; no summaries, no report-speak ("this shows that…"), no generic lines that could fit any post; first person is opinions only — invented memories, possessions, and deeds are banned; a comparison only when it maps exactly and exposes the point (most comments need none). Do not re-accrete per-incident rules into this prompt — the v3.4.1–v3.6.4 rule list failed by whack-a-mole; teach the voice through the examples instead. A comment is generated from the post's text or, for media posts, its caption (the caption IS the post text, whatever media it carries); since v3.7.3 a post sent as a Telegram Rich Message — which has neither text nor caption — is read by flattening its `rich_message` blocks to plain text (`messagePlainText` in `router.js`, which also feeds language detection and reply-chain context). Comments are sampled (~75%) and skipped for short posts (under 200 characters or under 20 words); media-only posts with no text/caption — including rich posts whose blocks carry no text — (photo, video, sticker, GIF, file, audio...) never get a comment. Since v3.7.1 every generated comment also passes a completeness guard in code (`completeChannelComment`): the comment model is a reasoning model, so comments generate with reasoning disabled (the prompt's `/no_think` switch) under their own 1600-token budget, and a comment that still stops mid-sentence is trimmed to its last complete sentence — or skipped entirely when nothing complete remains or only a lone bare question survives. Never send a comment that ends mid-fragment.
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

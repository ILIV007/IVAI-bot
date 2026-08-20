# Changelog

All notable changes to IVAI Bot are documented in this file. The project follows [Semantic Versioning](https://semver.org/).

## [3.3.2] - 2026-08-20

### Added

- Added **IVAI Terminal**, a lightweight user-facing Telegram Mini App at `/app` with a navy, deep-blue, and jade terminal interface.
- Added same-origin `/app/session` and `/app/chat` endpoints that use server-validated Telegram `initData`, existing user settings, shared text quota, and the established free-only sequential AI pipeline.
- Added a shared `webapp-auth.js` module so admin and public Mini App requests use one server-side HMAC validation implementation.
- Added a repeatable local Worker development toolchain with Wrangler 4, a committed pnpm lockfile, and a narrow pnpm build allowlist for `esbuild` and `workerd`.
- Added Terminal security/API/UI tests; the foundation suite now covers 33 passing tests.

### Security

- Added strict no-store, same-origin connect, content-type, referrer, permissions, and nonce-based CSP headers to the public Terminal shell.
- The public terminal never trusts a browser-supplied user identifier, never renders user/model text through `innerHTML`, and keeps transcripts local unless the existing opt-in memory setting is enabled.

## [3.3.1] - 2026-08-20

### Changed

- Refreshed the provider policy against current official provider documentation while preserving the free-only contract.
- Replaced Groq's retired `llama-3.1-8b-instant` with active GPT-OSS 20B, GPT-OSS 120B, and Qwen 3.6 27B production-model routes.
- Added current Workers AI text, vision, and Whisper Turbo options; explicitly excluded paid-only Workers AI frontier models such as GLM 5.2.
- Added current Gemini Flash and Flash-Lite free-tier options without Google Search grounding, Maps, media generation, or paid-only models.
- Replaced OpenRouter's fragile fixed model IDs with the official `openrouter/free` router for automatic fallback. The refreshed picker admits dynamic `:free` entries only after zero-price metadata and text-chat capability checks.
- Converted the Worker AI quota guard to a conservative 8,000-Neuron daily reservation budget, leaving a 20% buffer below Cloudflare's 10,000-Neuron free allocation.

### Security

- A model selected from an OpenRouter cache must now exist in the verified catalog; the old suffix-only selectability rule was removed.

## [3.3.0] - 2026-08-20

### Added

- Secure Telegram webhook validation, atomic update deduplication, user rate controls, and a daily Workers AI budget guard.
- A free-only provider policy with Workers AI as the primary provider and sequential OpenRouter `:free`, Groq, and Google AI Studio fallbacks.
- Three practical chat modes: **Auto**, **Fast**, and **Deep**, together with a paginated free-model picker and selected-model lock.
- Rich Draft and Rich Message delivery with standard Telegram message fallback, context-safe handling of Business and thread replies, and compact linked IVAI response metadata.
- Inline Mode, Guest AI replies, reaction feedback, voice transcription, and image understanding guards.
- D1-backed administration, draft/preview/confirm broadcast workflow, audit logging, and a responsive Telegram Mini App administration shell.
- Secretary tasks with `/task`, `/tasks`, `/done`, and `/cancel`, delivered through a small cron batch.
- Consent-controlled inactive-user check-ins. A user can pause or re-enable check-ins using `/notify off` and `/notify on`.
- English-first language selection with Persian as the second language and Arabic, Spanish, Turkish, Russian, Portuguese (Brazil), Indonesian, Hindi, French, and German as optional choices.
- Production migrations for core storage, runtime guards, Secretary reminders, and re-engagement state.

### Changed

- Modernized menus with semantic Telegram button colors, responsive pagination, and clearer mode/model navigation.
- Preserved the original v3.2 interaction approach while separating routing, providers, Telegram rendering, storage, security, broadcast, Secretary, and re-engagement responsibilities into dedicated modules.

### Security

- Credentials are loaded exclusively from Cloudflare Worker Secrets and are excluded from the repository.
- Administration endpoints validate Telegram Mini App `initData` server-side and reject unsupported methods.

## [3.2.0]

- Baseline IVAI bot experience on which the v3.3 modular modernization is built.

[3.3.2]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.1...v3.3.2
[3.3.1]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.0...v3.3.1
[3.3.0]: https://github.com/ILIV007/IVAI-bot/compare/12936cb...593ea80
[3.2.0]: https://github.com/ILIV007/IVAI-bot

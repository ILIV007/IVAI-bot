# Changelog

All notable changes to IVAI Bot are documented in this file. The project follows [Semantic Versioning](https://semver.org/).

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

[3.3.0]: https://github.com/ILIV007/IVAI-bot/compare/12936cb...593ea80
[3.2.0]: https://github.com/ILIV007/IVAI-bot

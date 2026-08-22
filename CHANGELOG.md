# Changelog

All notable changes to IVAI Bot are documented in this file. The project follows [Semantic Versioning](https://semver.org/).

## [3.3.29] - 2026-08-22

### Fixed

- Restored bounded short-term context for every active Telegram and IVAI Terminal Session, including when the optional Memory preference is off. A second turn now receives the immediately preceding user and assistant turns, so facts such as a name remain available during the active Session.
- Corrected language precedence so a Persian-script prompt overrides a stale English preference for the active conversation. The detected language is retained inside the bounded Session, keeping neutral follow-up prompts in the same conversation coherent.
- Corrected Persian-script detection for the common Persian `ی` and `ک` characters, which could previously classify an otherwise Persian message as Arabic.

### Privacy and safety

- Sessions remain isolated by Telegram chat/topic and by Terminal, retain no more than three complete turns, expire after 30 minutes of inactivity, and cannot outlive two hours. `/new`, `/start`, `/memory off`, and `/memory clear` explicitly discard their current Session scope.
- The optional Memory preference no longer suppresses the active Session; it only controls the user preference while the current short-lived conversational context remains available for natural multi-turn use.

### Tests

- Added end-to-end two-turn Persian regression scenarios for both Telegram and IVAI Terminal with Memory Off. They assert the second model call receives the earlier name turn and the Persian language instruction. The validation suite contains 78 passing tests.

## [3.3.28] - 2026-08-22

### Changed

- Simplified the `/new` note at the end of the Menu to one plain-text line. It no longer uses code-style formatting or repeats persistent-setting details.
- Kept the lively bold `/new` confirmation headline and moved its explanatory body into a Telegram blockquote for a cleaner visual hierarchy.

### Tests

- Added regression assertions for the plain Menu note and the bold-headline-plus-quote `/new` Telegram payload. The validation suite remains at 76 passing tests.

## [3.3.27] - 2026-08-22

### Production

- Rotated the Telegram webhook secret in the Worker and refreshed the production webhook without pending updates. The webhook now receives only supported update types, including `guest_message` and `message_reaction`.
- Verified Telegram production capability flags for Inline queries, Guest queries and Business connections. Verified the default IVAI Terminal Menu Button targets the public `/app` URL.
- Recorded the remaining BotFather-only Main Mini App profile setting and a safe client acceptance checklist in `docs/PRODUCTION_CONFIGURATION_STATUS_2026-08-22_FA.md`.

### Fixed

- Synchronized the package metadata version with the application release version, eliminating the stale `3.3.17` package declaration.
- Updated the Telegram feature matrix and README to reflect actual production readiness, the broadcast-claim migration and the current free-only capability boundary.

## [3.3.26] - 2026-08-21

### Fixed

- Hardened broadcast delivery against overlapping scheduled Worker invocations. Each recipient is now conditionally claimed in D1 with a short lease before Telegram delivery, so concurrent jobs cannot select and send the same pending row twice.
- Added `db/0005_broadcast_claims.sql`, which introduces claim-token and lease columns plus a claim index for the broadcast queue. A terminated invocation can recover after the lease expires without duplicating a still-owned send.
- Rejected correctly signed but excessively future-dated Telegram Mini App `initData`. A short 60-second clock-skew allowance remains, while normal one-hour expiry handling is preserved.

### Tests

- Added an overlapping-broadcast regression simulation and signed future-timestamp Mini App rejection coverage. The validation suite contains 76 passing tests.

## [3.3.25] - 2026-08-21

### Added

- Added deterministic Rich Message footnotes for up to eight short, visible `[^id]: note` definitions. Accepted markers link only to IVAI-generated in-message references; missing or invalid definitions remain safe ordinary text.
- Added native Telegram LaTeX rendering for valid inline `$...$`, `$$...$$` and fenced `math` blocks only in Deep and Code responses. Formula processing is deterministic and does not create another AI request.

### Safety

- Math accepts bounded ASCII-LaTeX syntax and a small command allow-list only. Unsafe markup, unsupported commands, excessive input and malformed expressions remain escaped visible text.
- Standard Telegram HTML fallback keeps formulas and footnotes visible without Rich-only tags. No hidden reasoning, source fabrication, arbitrary links or model-supplied HTML is introduced.

### Tests

- Added unit coverage for reference binding, native math, LaTeX injection/command rejection, size limits and standard fallback, plus an end-to-end Deep-mode Rich Message test. The validation suite contains 74 passing tests.

## [3.3.24] - 2026-08-21

### Added

- Added native Rich Message tables for only small, well-formed Markdown tables: at most six columns and twelve body rows. Oversized or malformed table candidates remain ordinary safe text instead of becoming partial Rich tables.
- Added the explicit `/details <prompt>` command. It permits a response to include a visibly user-facing, collapsible `<details>` supplement while retaining the normal answer first.

### Safety

- `/details` never requests or renders hidden reasoning, chain-of-thought, private analysis, policies or instructions. Only a short, visible supplement wrapped in the documented marker pair can become a collapsible block.
- The normal HTML fallback strips details markers into an ordinary bold heading and visible body, preventing a Rich API failure from hiding response content.

### Tests

- Added table dimensions, malformed/oversized fallback, visible-details opt-in, injection and end-to-end `/details` coverage. The validation suite contains 72 passing tests.

## [3.3.23] - 2026-08-21

### Added

- Added a deterministic, allow-listed Rich Markdown renderer for private-chat Rich Messages. It supports headings, fenced code blocks with safe language classes, ordered and unordered lists, visual task lists, horizontal dividers, block quotes, bold text and inline code.
- Added a structured Rich HTML final-message path while preserving the existing ordinary Telegram HTML fallback for draft failures, rich-send failures and long replies.

### Fixed

- Arabic now receives the same `is_rtl` Rich Message treatment as Persian for the draft and final response.
- Rich rendering escapes model output before adding trusted Telegram markup, so model-provided tags and attributes cannot become executable or native Rich HTML.

### Tests

- Added Rich Markdown injection, code/list/divider, Arabic RTL, end-to-end rich-payload and normal-fallback regression coverage. The validation suite contains 70 passing tests.

## [3.3.22] - 2026-08-21

### Fixed

- Terminal chat responses now return the authoritative persisted settings snapshot alongside the generated reply. The UI updates its language, mode, selected model and Memory chip from that snapshot, so a fallback model used for one answer can never be displayed as the user’s selected model.
- Terminal New Chat refreshes the same authoritative settings snapshot before redrawing the workspace, keeping it consistent with preferences changed in Telegram.
- `/memory off` now clears both independent Telegram and IVAI Terminal Sessions as a privacy boundary. Re-enabling Memory starts with fresh context and preserves only language, model and response-mode preferences.

### Tests

- Added regression coverage for Terminal authoritative settings and end-to-end `/memory off` clearing of both scopes. The validation suite contains 66 passing tests.

## [3.3.21] - 2026-08-21

### Changed

- Preserved both official Telegram links in the README introduction: [@IVAI_Llm_bot](https://t.me/IVAI_Llm_bot) and [@ILIVIR3](https://t.me/ILIVIR3).
- Added one concise `/new` explanation at the end of `/menu` in English, Persian and Arabic. The command’s confirmation is now more inviting while explicitly confirming that language, model, response mode and Memory settings remain unchanged.
- Kept the linked `IVAI` word in response metadata exactly as before; Telegram client controls its inline-link decoration and the Bot API provides no styling control to remove underline without removing the link.
- Isolated the compact IVAI/model/mode footer in Persian and Arabic with Unicode bidi controls, preventing right-to-left message layout from reversing the metadata sequence.

### Security

- Hardened the `/admin` Mini App with a fresh CSP nonce for its Telegram bridge script, style and inline bootstrap. It now receives the same strict no-store, same-origin connection and Telegram frame-ancestor protections as IVAI Terminal.

### Tests

- Added coverage for Admin CSP nonce and strict Mini App headers. The validation suite contains 65 passing tests.

## [3.3.20] - 2026-08-21

### Added

- Introduced short-lived, independent conversation Sessions in KV. Opt-in context retains at most three complete turns, expires after 30 minutes of inactivity, and has a hard two-hour lifetime even during continuous conversation.
- Added `/new` for a clean Telegram conversation Session. `/start` now begins the same clean Session after the required membership gate, while preserving language, model, response mode and the Memory preference.
- Added a localized **New Chat** control to IVAI Terminal, backed by an authenticated `/app/new` endpoint. Terminal memory remains a separate per-user scope from the Telegram chat.

### Changed

- Replaced reply-based memory segmentation with topic-only Session segmentation, so replying to a private-chat message no longer fragments a user’s context.
- Kept one successful AI path per prompt, with no AI call for `/new`, `/start`, Session expiry or Session reset. KV TTL and request-time validation handle cleanup without a polling job or Cron.
- Guarded Session saves with the active Session ID, so a delayed response that began before `/new` or `/start` cannot resurrect discarded context after the reset.

### Tests

- Added deterministic coverage for 30-minute idle expiry, two-hour absolute expiry, Terminal/Telegram Session isolation, `/new` reset and `/start` reset. The suite contains 65 passing tests.

## [3.3.19] - 2026-08-21

### Changed

- Made every provider control in the inline AI model picker blue and every All/Fast/Deep/Code filter red. The active scope retains an explicit ✓ indicator, so its selection remains clear without relying on a third color.
- Made [@IVAI_Llm_bot](https://t.me/IVAI_Llm_bot) the prominent public entry point in the repository README. The technical Mini App deployment value now refers to `APP.terminalAppUrl` rather than displaying the Worker URL.

### Tests

- Added assertions that all provider controls are blue and all model-scope filters are red. The existing selected-model assertion remains in place.

## [3.3.18] - 2026-08-21

### Fixed

- Isolated D1 preference setters for response mode, selected model and memory. Each setter now creates a default preference row only when absent, then updates only its own column; an independent preference write can no longer reset the other stored settings.
- Preserved the existing explicit-language behavior: an explicitly chosen language remains authoritative when later Telegram updates expose a different account locale.

### Tests

- Added two stateful D1 regression scenarios covering sequential preference writes, opposite first-write ordering, a Persian language selection, later English Telegram metadata, selected-model changes and memory toggles. The suite contains 58 passing tests.

## [3.3.17] - 2026-08-21

### Fixed

- Replaced Gemma 4 with Llama 4 Scout as the primary Workers AI vision route. A live account test showed that Gemma 4 can consume its bounded completion on reasoning-only output without returning user-visible text, while Llama 4 Scout returned a completed visible image description with IVAI's existing OpenAI-compatible image data-URL request shape.
- Retained Gemma 4 only as a free-tier vision fallback, reduced photo output from 900 to 320 tokens, and preserved the 1,000-unit conservative image reservation.

### Verified

- Confirmed live compatibility of Llama 4 Scout, Gemma 4 and Whisper Large V3 Turbo request routes without accessing any user media. The Whisper test used a synthetic short WAV and correctly reached the model, which rejected it as no speech.
- Recorded official Workers AI capabilities, pricing, 10,000-Neuron daily free allocation and selection rationale in `docs/MULTIMODAL_MODEL_AUDIT_2026-08-21.md`.

### Tests

- Added regressions for reasoning-only vision responses, OpenAI-compatible visible vision content, image output bounds, voice payload shape and the selected free model. The suite contains 56 passing tests.

## [3.3.16] - 2026-08-21

### Verified

- Completed a mapped, end-to-end debug review of the Worker, webhook security, required-channel gate, Telegram UX, free-model policy, media, D1/KV state, Mini App, admin API, background jobs and production deployment.
- Confirmed the deployed Worker health route, public IVAI Terminal shell, production `*/10 * * * *` schedule, D1 `ivai_db` binding, KV `IVAI_KV` binding and aggregate operational state through read-only Cloudflare checks.

### Tests

- Added regression coverage for oversized Telegram media and the guarded Workers AI voice/photo paths. Oversized metadata is rejected before a binary download and each supported medium uses exactly one guarded Workers AI call.
- Added `docs/DEBUG_PLAN_2026-08-21.md` and its rendered debug map, recording the scope, evidence and result for every review area. The suite contains 54 passing tests.

## [3.3.15] - 2026-08-21

### Fixed

- Hardened the 15-day re-engagement cron claim against overlapping Scheduled Event executions. The code now trusts D1's atomic affected-row result instead of reading the lease back after the write, preventing a second concurrent execution from mistaking an identical lease for its own claim.
- Preserved the existing free, no-AI-message behavior: a batch claims at most five eligible inactive users, sends localized Telegram text only, respects `/notify off`, and waits at least 15 days between successful check-ins.

### Tests

- Added a concurrent-cron simulation at the same timestamp. It proves exactly one re-engagement delivery is sent when two overlapping jobs see the same eligible user. The suite contains 52 passing tests.

## [3.3.14] - 2026-08-21

### Changed

- Rebuilt the free-model picker into a provider-aware control surface. Every model now carries its provider marker: 🟣 Cloudflare Workers AI, 🔵 OpenRouter Free, 🟠 Groq or 🟢 Google Gemini, plus a Fast, Deep or Code use-case marker.
- Added first-class provider filters and Fast/Deep/Code filters. Pagination, selected-state highlighting and the active filter remain intact while users browse and select models.
- Added a provider-and-use-case selection summary after every choice, including known context length where the catalog exposes it. The selected model is explicitly described as preferred rather than guaranteed; ordered free fallback remains active.
- Expanded the conservative static allowlist with verified non-paid-only Workers AI options across GPT-OSS, Llama and Qwen families, plus Gemini 3.5 Flash. The existing dynamic OpenRouter admission rule continues to require zero pricing metadata for every exposed `:free` model.

### Safety

- Excluded Cloudflare models documented as paid-only, including GLM 5.2 and Kimi K2.6/K2.7 Code. The Worker continues to reserve below the published 10,000-Neuron daily free allocation and makes one successful provider call per request.

### Tests

- Added regression coverage for colored provider controls, provider filtering, advanced callback data, selected-model detail text and the expanded allowlist. The suite contains 51 passing tests.

## [3.3.13] - 2026-08-21

### Changed

- Simplified `/start` by removing the free-route and invitation footer. Its three controls are now Menu, IVAI Terminal and Language, with the Terminal button centered.
- Expanded `/menu` from a status-only surface into a concise operating guide. It retains live mode, model and memory state while explaining Auto, Fast, Deep, Code, Terminal, model priority, memory and language controls.
- Restored the Code response mode to the primary Menu. Auto now occupies its own first blue row; Fast, Deep and Code appear together in the following blue row; Terminal remains green, model selection remains red, and supporting controls remain neutral.
- Configured Telegram's default private-chat Menu Button as the IVAI Terminal Mini App using a KV-cached `setChatMenuButton` call. Inline Terminal buttons remain available as an additional launch path.

### Fixed

- Replaced the language-only `UPDATE` with an atomic D1 upsert, so a selected language persists even when the user first arrives through the required-channel Join callback and has no existing user row.
- Created the durable user record after a verified membership callback before subsequent menu actions are handled.

### Tests

- Added regression coverage for language upsert, Menu Button configuration, the centered Terminal Start button, the five-row response-mode hierarchy and the descriptive Menu. The suite contains 51 passing tests.

## [3.3.12] - 2026-08-21

### Changed

- Synchronized the public IVAI Terminal Mini App with the v3.3.11 control language: localized English, Persian and Arabic copy; a current-language flag chip; compact selected-model display; and live mode, model, language and memory updates after every successful turn.
- Replaced plain Mini App message insertion with a safe DOM renderer for escaped blockquotes, bold text and inline code; it never inserts untrusted model output through `innerHTML`.
- Localized required-channel membership, reconnect and retry states in the Terminal while retaining the existing server-side Telegram `initData` validation and same-origin API boundary.
- Preserved safe Telegram HTML formatting for long bot replies by splitting raw model output before rendering each chunk, then appending the linked IVAI response metadata only to the final chunk.

### Tests

- Updated Terminal shell and bootstrap regression checks for the DOM renderer, language state and compact-model helpers.
- Updated long-response regression coverage to require safe Telegram HTML delivery, bounded message chunks and exactly one final metadata block. The suite contains 50 passing tests.

## [3.3.11] - 2026-08-21

### Changed

- Redesigned `/start` as a concise capability overview with only three inline controls: Auto, Language and IVAI Terminal.
- Rebuilt `/menu` into a status-first control surface. It now displays active response mode, selected model and memory state without a color legend.
- Reordered the main keyboard: Auto/Fast/Deep in the first blue row; Terminal alone in green; Pick model alone in red; Help, Settings and Language in the final neutral row.
- Added country flags to the language picker and current-language header.
- Simplified Help copy into a short practical guide instead of a dense command catalog.

### Rich formatting

- Retained native Rich Message/Rich Draft delivery when Telegram supports it and the existing safe HTML fallback otherwise.
- Added safe conversion of AI lines beginning with `>` into Telegram HTML blockquotes after escaping all untrusted model output.
- Used native Telegram HTML headings, code and blockquotes for concise Start, Help and response metadata presentation.

### Tests

- Added UI regression coverage for the three-button Start screen, four-row Menu hierarchy, live Menu status, language flags and rich introductory copy. The suite now contains 50 passing tests.

## [3.3.10] - 2026-08-21

### Fixed

- Reworked the `Check membership` callback so a failed Telegram verification no longer attempts to edit the same Join message, which Telegram rejects as `message is not modified` and made the button appear non-functional.
- The callback now keeps the Join prompt unchanged and shows a localized Telegram alert explaining whether the user is not yet confirmed or the bot cannot verify the channel.
- A successful verified member callback still changes the prompt exactly once to the normal IVAI welcome controls, without showing Join/Recheck again.

### Tests

- Added callback regression coverage for verified membership and verification failure; the suite now contains 49 passing tests.

### Operational requirement

- The canonical channel remains `-1003162460662` / `@ILIVIR3`. `@IVAI_Llm_bot` must be an administrator of that same channel so Telegram can verify ordinary members.

## [3.3.9] - 2026-08-21

### Fixed

- Fixed the broadcast queue so an active campaign continues seeding eligible recipients after entering `sending`, rather than being limited to its first 250 recipients.
- Added a stable campaign snapshot boundary: users created after confirmation are excluded from that in-flight campaign, while repeated cron runs idempotently seed the remaining confirmed audience.
- Added bounded retry behavior for transient broadcast delivery failures: blocked chats are final immediately; other failures retry up to three total delivery attempts before becoming terminal failures.
- Hardened legacy feedback callbacks against malformed KV content, invalid scores, cross-user or cross-chat replay, and replay of an already-consumed token.
- Added a fail-closed fallback from the canonical numeric channel ID to `@ILIVIR3` only when Telegram rejects the numeric lookup. A verified `member` response now always proceeds directly without Join/Recheck UI.
- Removed duplicate unreachable callback branches and unused feedback-token writer code from the Telegram router.

### Changed

- Modernized CI around the pinned pnpm version, a frozen lockfile install, pnpm-store cache, full regression validation and high-severity dependency audit. CI now installs pnpm before resolving the pnpm cache.
- Enabled Dependabot alerts and automated security fixes, added npm/pnpm dependency updates alongside GitHub Actions updates, and strengthened `main` protection with required checks, code-owner review, stale-review dismissal, linear history and resolved conversations.
- Moved the preserved v3.2 single-file reference into `legacy/` so the modular `src/index.js` production entrypoint is unambiguous.

### Tests

- Added broadcast regression coverage for recipient pagination, confirmation-time snapshot boundaries, transient retry recovery and terminal failure after three attempts.
- Added Secretary retry-boundary coverage, member/no-join and numeric-ID/username membership fallback coverage, and expanded the suite to 47 passing tests.

## [3.3.8] - 2026-08-21

### Fixed

- Fixed a production-blocking syntax error in IVAI Terminal's generated inline bootstrap. The defect held the Mini App in `CONNECTING` and prevented all session, join/reconnect, and chat UI behavior from starting.
- Added a regression test that compiles the fully rendered Terminal bootstrap, catching template-literal escaping errors that a source-only JavaScript syntax check cannot detect.

### Verified

- Reviewed public Terminal security headers, unauthenticated API rejection, method controls, recovery UX, and dependency audit status.

## [3.3.7] - 2026-08-21

### Added

- Added mandatory membership enforcement for `@ILIVIR3` (`-1003162460662`) before text, media, inline, guest, callback and IVAI Terminal AI access.
- Added a fail-closed `getChatMember` guard, Join channel / Check membership controls, explicit Terminal `JOIN REQUIRED` state and no-AI rejection path for non-members.
- Added regression coverage for non-member bot and authenticated Terminal requests, plus a Persian operational guide for required channel access.

### Operational requirement

- `@IVAI_Llm_bot` must be an administrator in `@ILIVIR3` so Telegram membership checks are reliable.

## [3.3.6] - 2026-08-21

### Fixed

- Reworked IVAI Terminal session states so missing, rejected, timed-out and temporarily unavailable connections show a clear recovery message and a user-controlled reconnect action instead of an indefinite connecting state.
- Added a bounded 45-second client request timeout and kept retries explicit; no polling, background model call or paid route was added.
- Added minimal safe runtime diagnostics for rejected Mini App authentication without logging the signed `initData` itself.

### Changed

- Rebuilt the Terminal as a polished navy/deep-blue/jade AI workspace with connection status, welcome guidance, suggestion chips, message bubbles, accessible composer and responsive mobile layout.
- Separated `/start` from `/menu`: `/start` is now the onboarding and quick-launch surface, while `/menu` is the dedicated controls dashboard.
- Reordered and colored inline controls consistently: blue for main routing, green for active/quick actions and red only for destructive actions.
- Added regression coverage for the separate start/menu flows and Terminal reconnect affordances; the suite now contains 38 passing tests.

## [3.3.5] - 2026-08-20

### Fixed

- Released the update-deduplication claim and returned a retryable response when webhook processing fails, preventing a transient downstream failure from being silently acknowledged and permanently suppressing that update.
- Made `/memory clear`, `/reset`, and settings reset clear the separate opt-in IVAI Terminal memory as well as the current chat memory.
- Corrected the admin Workers AI remaining-budget metric to use the same enforced 8,000-Neuron guard as runtime quota control.
- Added regression coverage for webhook retry release, Terminal-memory deletion, and the consistent budget metric; the suite now contains 37 passing tests.

## [3.3.4] - 2026-08-20

### Changed

- Added the private-chat IVAI Terminal Web App button directly to `/start`, `/menu`, and `/help`, while keeping group menus free of private-only Web App controls.
- Updated the help copy and callback return paths so the Terminal entry point remains visible after normal private-chat navigation.
- Added regression coverage for private versus default menu behavior; the suite remains at 34 passing tests.

## [3.3.3] - 2026-08-20

### Added

- Added `/terminal`, a private-chat command that sends a Telegram Web App button for opening IVAI Terminal directly from the conversation.
- Kept the terminal launch flow free-only and AI-free: opening the button does not invoke a provider, consume a text quota, or create a transcript record.
- Added regression coverage for the private-chat Web App button; the suite now contains 34 passing tests.

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

[3.3.17]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.16...v3.3.17
[3.3.16]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.15...v3.3.16
[3.3.15]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.14...v3.3.15
[3.3.14]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.13...v3.3.14
[3.3.13]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.12...v3.3.13
[3.3.12]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.11...v3.3.12
[3.3.11]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.10...v3.3.11
[3.3.10]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.9...v3.3.10
[3.3.9]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.8...v3.3.9
[3.3.8]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.7...v3.3.8
[3.3.7]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.6...v3.3.7
[3.3.6]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.5...v3.3.6
[3.3.5]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.4...v3.3.5
[3.3.4]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.3...v3.3.4
[3.3.3]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.2...v3.3.3
[3.3.2]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.1...v3.3.2
[3.3.1]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.0...v3.3.1
[3.3.0]: https://github.com/ILIV007/IVAI-bot/compare/12936cb...593ea80
[3.2.0]: https://github.com/ILIV007/IVAI-bot

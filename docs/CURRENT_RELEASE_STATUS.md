# Current release status — IVAI Bot v3.3.36

**Last documentation review:** 22 August 2026  
**Source of truth:** the `main` branch, [`CHANGELOG.md`](../CHANGELOG.md), the CI result for the current commit, and the production Workers Build connected to `main`.

This document is the concise operational companion to the project’s historical research, audit, debugging, and launch-readiness notes. Release v3.3.41 defines Auto as a first-class response Mode: selecting Auto keeps the visible result mode and footer at `Auto`; it no longer silently transforms into Fast, Deep, or Code. The automatic part is confined to selecting an eligible free model/provider after pins are cleared. Auto and Fast use complete-answer instructions and bounded output budgets so Fast is concise rather than incomplete. It retains the v3.3.40 fresh-Agent `/new` reset, v3.3.39 separate Mode confirmation, and v3.3.37 idempotent handling for Telegram no-op message edits. Historical documents remain useful evidence for why a control exists; they do not supersede the current code or this release summary.

## Release posture

| Area | Current behavior |
|---|---|
| Product policy | English-first, free-only Telegram AI assistant. No paid model fallback, Telegram Stars route, Premium dependency, or paid broadcast flag is used. |
| Public entry points | [@IVAI_Llm_bot](https://t.me/IVAI_Llm_bot) is the bot; [@ILIVIR3](https://t.me/ILIVIR3) is the required discovery and learning channel. |
| Model picker | Provider and use-case filters present a free-only catalog. New callback buttons use stable model-ID-derived tokens, so a catalog refresh cannot redirect a visible selection. Stale pickers recover by reopening the current picker with an explanation. |
| Response modes | Selecting Auto, Fast, Deep, or Code in the Menu persists the mode, sends a standalone localized confirmation reply to the current Menu, and only then redraws the Menu. **Auto is independent:** it remains `Auto` in the final response metadata and footer, while only a free model/provider route is automatically selected after `selected_model` is cleared. Fast, Deep and Code appear only after an explicit choice. Auto and Fast retain enough bounded output budget to finish a complete, appropriately sized answer; Fast summarizes rather than stopping unfinished. |
| Language contract | A prompt may set the answer and active-Session language. Persistent interface preference controls the Menu, progress text, errors, notices, and the `🪐 IVAI · Model · Mode` footer. An English UI therefore retains `Fast`, even when a prompt and answer are Persian. |
| Conversation privacy | Active Sessions are short-lived and bounded to three complete turns, a 30-minute idle TTL, and a two-hour absolute lifetime. Memory Off clears existing context but preserves continuity for the new active Session. `/new` clears the requested Telegram Session and restores the Agent defaults: Auto mode, no model pin, and Memory off; persistent UI language remains unchanged. |
| `/start` experience | A uniformly selected sticker from the bot-owned `IVAILlmBot` pack is sent before the normal welcome. It is non-fatal and adds no AI request or runtime sticker-set lookup. |
| Telegram edit resilience | Telegram's `message is not modified` response from an unchanged `editMessageText` call is treated as a successful idempotent no-op. It does not enter the generic webhook-failure path or trigger a needless retry; every other edit error is still re-thrown. |
| Mini App | The Terminal at `/app` validates Telegram `initData` server-side, uses a separate short-lived Session, and shares the same free AI path without polling. Its Mode chip is driven by persisted settings, so Auto remains visibly `AUTO` while the server independently chooses an eligible free model/provider. The normal private-chat menu button is the primary entry point; a BotFather Main Mini App remains optional. |
| Scheduled work | A bounded ten-minute cron handles cleanup, Secretary reminders, broadcasts, and consent-controlled re-engagement. Each delivery uses a D1 claim/lease to avoid duplication. |

## Release validation

| Check | Required result before a public announcement |
|---|---|
| Repository | `main` is clean, the current commit is pushed, and no unreviewed local change remains. |
| Code quality | `pnpm run validate`, `pnpm audit --prod`, and `git diff --check` complete successfully. |
| GitHub | The current `Validate Node 22 Worker` check succeeds. |
| Cloudflare | The `Workers Builds: ivai-bot` check for the same commit succeeds and the public health endpoint returns `IVAI Worker is ready.` |
| Manual smoke test | Follow [`PUBLIC_LAUNCH_SMOKE_TEST_FA.md`](PUBLIC_LAUNCH_SMOKE_TEST_FA.md) with a non-admin Telegram account. Recheck `/start`, required channel membership, a Persian prompt with English UI, a mode change, a model choice, and a Terminal turn. |

## Documentation map

| Reader | Start here | Then consult |
|---|---|---|
| New user or learner | [`README.md`](../README.md) and [Telegram learning guide (FA)](TELEGRAM_LEARNING_GUIDE_FA.md) | [Telegram real-world test plan (FA)](TELEGRAM_REAL_WORLD_TEST_PLAN_FA.md) for expected behavior |
| Operator | [Deployment checklist](DEPLOYMENT_CHECKLIST.md) | [Production configuration status (FA)](PRODUCTION_CONFIGURATION_STATUS_2026-08-22_FA.md), [Security policy](../SECURITY.md), and the security rotation checklist kept outside source control |
| Community owner | [Public launch marketing checklist (FA)](TELEGRAM_PUBLIC_LAUNCH_MARKETING_CHECKLIST_FA.md) | [Public launch smoke test (FA)](PUBLIC_LAUNCH_SMOKE_TEST_FA.md), current health/build evidence, and the destination's explicit posting rules |
| Contributor | [`CONTRIBUTING.md`](../CONTRIBUTING.md) and [Architecture](ARCHITECTURE.md) | [`CHANGELOG.md`](../CHANGELOG.md), [Provider research](PROVIDER_RESEARCH_2026-08-20.md), and [Telegram API review notes](TELEGRAM_API_REVIEW_NOTES.md) |
| Historical reviewer | [Public launch readiness (FA)](PUBLIC_LAUNCH_READINESS_2026-08-22_FA.md) | [Project engineering review (FA)](PROJECT_ENGINEERING_REVIEW_2026-08-21_FA.md) and [Terminal engineering review (FA)](TERMINAL_ENGINEERING_REVIEW_2026-08-21_FA.md) |

> **Historical-document rule:** files named with an earlier release or dated audit are preserved as evidence. Use this page, the latest changelog entry, and the current source tree for present-tense operational decisions.

## Non-blocking owner hygiene

Rotate any Telegram token or provider key that was ever exposed outside the Worker secret manager. Keep secret values out of commits, issues, screenshots, and chat logs. The optional BotFather Main Mini App can be configured with the existing Terminal URL when a profile-level entry point is desired; it is not required for the private-chat menu button or the Terminal itself.

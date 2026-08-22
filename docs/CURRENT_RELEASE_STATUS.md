# Current release status — IVAI Bot v3.3.36

**Last documentation review:** 22 August 2026  
**Source of truth:** the `main` branch, [`CHANGELOG.md`](../CHANGELOG.md), the CI result for the current commit, and the production Workers Build connected to `main`.

This document is the concise operational companion to the project’s historical research, audit, debugging, and launch-readiness notes. Release v3.3.46 completes the Mode/Route separation through the provider-execution layer: **Response mode** and **Model route** are distinct state concepts in Telegram and Terminal. Mode controls only the response profile, answer style and footer; route is either `Auto` (IVAI selects an eligible free model/provider independently of Mode) or `Pinned` (a selected free model is preferred). Selecting a model cannot silently change Mode, while `/auto` resets both to defaults and `/model off` changes only the route. It retains failure-isolated Worker cron steps and provider-parity hardening. Historical documents remain useful evidence for why a control exists; they do not supersede the current code or this release summary.

## Release posture

| Area | Current behavior |
|---|---|
| Product policy | English-first, free-only Telegram AI assistant. No paid model fallback, Telegram Stars route, Premium dependency, or paid broadcast flag is used. |
| Public entry points | [@IVAI_Llm_bot](https://t.me/IVAI_Llm_bot) is the bot; [@ILIVIR3](https://t.me/ILIVIR3) is the required discovery and learning channel. |
| Model picker | Provider and use-case filters present a free-only catalog. New callback buttons use stable model-ID-derived tokens, so a catalog refresh cannot redirect a visible selection. Stale pickers recover by reopening the current picker with an explanation. |
| Response modes | `response-profile.js` resolves one immutable profile per turn: visible Mode, instruction, bounded output budget, temperature, Workers AI reservation and Rich Math eligibility. Selecting Auto, Fast, Deep, or Code in the Menu persists the mode, sends a standalone localized confirmation reply to the current Menu, and only then redraws the Menu. **Auto is independent:** it remains `Auto` in final metadata and the footer. Model route is separately `Auto` (an eligible free model/provider chosen by IVAI independently of Response Mode) or `Pinned` (selected free model preferred), so selecting a model never alters Mode. `/auto` resets Mode and route; `/model off` resets only the route. |
| Language contract | A prompt may set the answer and active-Session language. Persistent interface preference controls the Menu, progress text, errors, notices, and the `🪐 IVAI · Model · Mode` footer. An English UI therefore retains `Fast`, even when a prompt and answer are Persian. |
| Conversation privacy | Active Sessions are short-lived and bounded to three complete turns, a 30-minute idle TTL, and a two-hour absolute lifetime. Memory Off clears existing context but preserves continuity for the new active Session. `/new` clears the requested Telegram Session and restores the Agent defaults: Auto mode, no model pin, and Memory off; persistent UI language remains unchanged. |
| `/start` experience | A uniformly selected sticker from the bot-owned `IVAILlmBot` pack is sent before the normal welcome. It is non-fatal and adds no AI request or runtime sticker-set lookup. |
| Telegram edit resilience | Telegram's `message is not modified` response from an unchanged `editMessageText` call is treated as a successful idempotent no-op. It does not enter the generic webhook-failure path or trigger a needless retry; every other edit error is still re-thrown. |
| Mini App | The Terminal at `/app` validates Telegram `initData` server-side, uses a separate short-lived Session, and shares the same free AI path and Response Profile contract without polling. Its chips now show Mode and Model route independently: `AUTO` or `PINNED · model`. Terminal New Chat and Telegram `/new` both reset the Agent to Auto, Auto route and Memory off while retaining UI language. |
| Scheduled work | A bounded ten-minute cron handles cleanup, broadcasts, Secretary reminders, and consent-controlled re-engagement. Each step is failure-isolated, so a temporary failure is compactly logged as `cron_step_failure` without skipping later bounded work. Each delivery still uses a D1 claim/lease to avoid duplication. |

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

# Telegram feature audit notes — 2026-08-20

## Official sources reviewed

- Bot API changelog: <https://core.telegram.org/bots/api-changelog>
- Bot API: <https://core.telegram.org/bots/api>
- Telegram product update: <https://telegram.org/blog/ai-bot-revolution-11-new-features>

## Candidate features for IVAI

| Feature | User value | Constraint | Initial decision |
|---|---|---|---|
| Guest AI messages | Lets a user mention IVAI in a chat where IVAI is not a member | Requires BotFather enablement; bot sees only tagged message/reply context | Add code path; document setup action |
| Rich Messages / `sendRichMessageDraft` | Native structured replies and real streaming | New API surface; needs a deterministic structured-content fallback | Add an opt-in safe rich-message adapter after a standard fallback is retained |
| Rich `Thinking` block | Better live status | Same Rich Message support condition | Use when supported; retain animated text fallback |
| Inline button style | Primary/success/danger keyboard semantics | Already implemented | Complete |
| Reactions | Lightweight group feedback | Bot must be admin and explicitly subscribe to reaction updates | Add optional handling and allowlist subscription; no AI call |
| Private-chat topics | Keeps AI conversations separate | Message and reply methods need `message_thread_id` propagation | Add propagation to outgoing messages and typing state |
| Business / Chat Automation | Lets a user connect IVAI to profile chat automation | Requires user opt-in and BotFather feature configuration | Complete backend connection-aware routing; document setup |
| Bot-to-bot | Optional automation workflows | Requires BotFather enablement; not a default user experience | Keep compatibility, do not prioritize active behavior |
| Communities, subscriptions, paid media, Stars, gifts | Not relevant to free-only AI assistant or can require paid flows | Conflicts with product policy or lacks direct user value | Exclude |
| Custom emoji icons | Decorative only | Requires bot eligibility / Premium-related condition | Exclude |

## Guardrails

- Never introduce paid media, Stars payments, or a Premium dependency.
- New Telegram events must not introduce a hidden AI call.
- Keep traditional `sendMessage`/`editMessageText` routes as fallback because not every Telegram client or context supports newer rich-message behavior.
- Before enabling Guest Mode, Bot-to-Bot, or Chat Automation in BotFather, the corresponding code path must be deployed and tested.

# Re-engagement and language decision — IVAI v3.3

## Architecture decision

IVAI will reuse its existing Cloudflare Worker scheduled handler. The handler already runs every ten minutes for cleanup, broadcasts and Secretary reminders. A small D1 query will select only a bounded batch of users who have all of the following properties:

1. They have opened or used IVAI before.
2. Their latest activity is at least 15 days old.
3. They have not received an IVAI re-engagement notice in the preceding 15 days.
4. They have not disabled re-engagement notices.

This is deterministic, uses no model call, no additional service, no paid broadcast route and no new always-on process. Each delivery is claimed atomically in D1 before sending; failed or blocked deliveries are recorded and do not create an endless retry stream. The batch stays far below Telegram's free broadcast limit and sends no more than one message per chat per run.

| Option | Trade-off | Cost | Setup complexity |
|---|---|---:|---|
| Existing Worker schedule + D1 (selected) | Delivery window is approximately 10 minutes rather than a precise timestamp; no new infrastructure | Free | Low |
| Separate durable timer per user | More precise scheduling, but adds a new stateful runtime and operational surface | Free tier may apply, but more limits and complexity | Medium |
| External scheduler | Could provide a management UI, but duplicates the Worker and introduces a persistent external dependency | Potentially paid | High |

Telegram states that free bot broadcasts are limited to roughly 30 messages per second; IVAI deliberately sends tiny sequential batches and never enables paid broadcasts. See <https://core.telegram.org/bots/faq>.

## Language decision

English remains the default and Persian remains the promoted second language. The added set is intentionally compact: **Arabic, Spanish, Turkish, Russian, Portuguese (Brazil), Indonesian, Hindi, French and German**. These languages cover major Telegram and AI-assistant audiences while keeping the navigation, help, preferences and re-engagement copy maintainable.

The bot will use an explicit `/lang` selection as the authoritative setting. A first-message fallback recognizes the supported scripts/language markers only to choose a sensible initial interface. AI output is prompted in the selected language; model/provider routing remains unchanged.

## User controls

- `/notify on` and `/notify off` control re-engagement notices.
- A notice contains a single `Open IVAI` button plus a `Pause reminders` button.
- Replying to any message updates `last_seen_at`, so active users are never targeted.

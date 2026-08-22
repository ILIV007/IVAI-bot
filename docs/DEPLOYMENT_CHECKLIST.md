# IVAI v3.3 Deployment Checklist

This checklist intentionally contains no secret values. Register every credential as a Cloudflare Worker Secret and do not commit `.dev.vars`.

## 1. Confirm Cloudflare resources

| Check | Required state |
|---|---|
| Worker | The target Worker is `ivai-bot`. |
| KV binding | Binding name is `IVAI_KV`. |
| D1 binding | Binding name is `IVAI_DB`; the target database is `ivai_db`. |
| Workers AI | Binding name is `AI`. |
| Observability | Worker observability is enabled with a conservative sampling rate. |
| Schedule | Cron expression is `*/10 * * * *`; the handler delivers only bounded batches. |

## 2. Apply D1 migrations in order

Run every migration exactly once and in the listed order. Never edit an applied migration; add the next sequential migration instead.

| Order | Migration | Purpose |
|---:|---|---|
| 1 | `db/0001_initial_schema.sql` | Core relational schema for users, settings, conversations, feedback, administration and broadcasts. |
| 2 | `db/0002_runtime_guards.sql` | Atomic update deduplication and quota counters. |
| 3 | `db/0003_secretary_reminders.sql` | Task reminder delivery state and indexes. |
| 4 | `db/0004_reengagement.sql` | Re-engagement consent and delivery state. |
| 5 | `db/0005_broadcast_claims.sql` | Atomic broadcast delivery lease and claim index. |

## 3. Register Worker Secrets

Create the following names with real values only in the Cloudflare Worker secret manager. Never use deployment placeholders as production values.

| Name | Required | Purpose |
|---|---:|---|
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram Bot API access. |
| `TELEGRAM_WEBHOOK_SECRET` | Yes | Validates the Telegram webhook header. Use a random high-entropy value. |
| `ADMIN_TELEGRAM_IDS` | Yes | Comma-separated numeric bootstrap owner IDs. |
| `OPENROUTER_API_KEY` | Optional | Enables the free-model catalog and `:free` fallback. |
| `GROQ_API_KEY` | Optional | Enables a configured free-tier fallback. |
| `GOOGLE_API_KEY` | Optional | Enables a configured free-tier fallback. |

## 4. Deploy and configure Telegram

Deploy only after the D1 migrations and secrets are in place. Configure Telegram’s webhook using the Worker URL and a `secret_token` equal to `TELEGRAM_WEBHOOK_SECRET`. Restrict `allowed_updates` to the update types IVAI currently handles:

```text
message
edited_message
callback_query
inline_query
chosen_inline_result
business_message
guest_message
message_reaction
```

Enable Guest Mode and Inline Mode in BotFather after the deployment is live. The Worker uses normal, rate-limited delivery batches and does **not** send the paid `allow_paid_broadcast` flag.

## 5. Acceptance checks

| Test | Expected result |
|---|---|
| Unauthenticated webhook POST | Returns `401`; no update is processed. |
| `/start` in a new private chat | One non-fatal random pack sticker arrives before the English-first welcome and main mode keyboard. |
| Menu mode buttons | Auto, Fast, Deep, and Code persist the choice and visibly confirm the active mode before redrawing the Menu. |
| `/lang` | Displays the paginated language picker and persists a selected option. A Persian prompt may receive a Persian answer without localizing an English interface footer. |
| `/notify off` then `/notify on` | Updates re-engagement consent without an AI call. |
| `/models`, `/pick 1`, `/model off` | Lists only allowed free models, locks a valid selection, then returns to automatic selection. A stale picker safely reloads instead of silently losing a model choice. |
| `/memory on`, `/memory show`, `/memory clear` | Uses short-lived context and permits user-controlled clearing. |
| Voice or photo | Enforces file and quota limits before Workers AI processing. |
| Inline query | Returns an inline result; an empty query does not invoke a provider. |
| Guest message | Returns a Guest AI answer with no additional provider fan-out. |
| Reaction update | Captures feedback without invoking an AI provider. |
| Business or topic message | Preserves connection and thread context in replies. |
| `/admin` | Blocks non-admins; a verified owner gets the draft-only broadcast flow. |
| Broadcast | Requires draft → preview → confirmation and is tested with a staging audience first. |
| Secretary task | `/task in 30m | reminder test` is claimed and delivered once by the scheduled handler. |

## 6. Free-tier and privacy guardrails

The bot must refuse or defer a request rather than calling a paid model when its own Workers AI budget or a provider free limit is exhausted. Verify that every production model stays within `FREE_MODEL_POLICY`, and remove any model whose access terms change. Memory stays opt-in and should be cleared on request.

## 7. Credential hygiene and incident response

Rotate any token, provider key, or webhook secret that was ever shared outside the secret manager. If a credential is suspected exposed, revoke it in the provider dashboard, update the Cloudflare Worker Secret, redeploy if needed, and reconfigure the Telegram webhook when the webhook secret changes. See [SECURITY.md](../SECURITY.md) for responsible vulnerability reporting.

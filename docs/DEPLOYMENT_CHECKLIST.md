# IVAI v3.3 Deployment Checklist

This checklist is intentionally value-free. Use Cloudflare Worker Secrets for every credential and do not commit `.dev.vars`.

## 1. Prepare Cloudflare resources

| Check | Required state |
|---|---|
| Worker | `ivai-bot` is selected as the deployment target. |
| KV binding | Binding name is `IVAI_KV`. |
| D1 binding | Binding name is `IVAI_DB`; the database is `ivai_db`. |
| Workers AI | Binding name is `AI`. |
| D1 schema | Apply `db/0001_initial_schema.sql` and then `db/0002_runtime_guards.sql` before allowing the bot to receive user traffic. |
| Schedule | Add a conservative cron only after broadcast delivery is validated; the scheduled handler processes a small batch. |

## 2. Register Worker Secrets

Create the following names with **real values** in the Cloudflare Worker secret manager. Never use placeholders as deployed values.

| Name | Value format | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Required for Telegram API calls. |
| `TELEGRAM_WEBHOOK_SECRET` | Random 32+ byte secret | Must match Telegram webhook `secret_token`. |
| `ADMIN_TELEGRAM_IDS` | Comma-separated numeric IDs | Bootstrap owner list. |
| `OPENROUTER_API_KEY` | Optional provider key | Enables model catalog refresh and `:free` fallback. |
| `GROQ_API_KEY` | Optional provider key | Enables configured free-tier fallback. |
| `GOOGLE_API_KEY` | Optional provider key | Enables configured free-tier fallback. |

## 3. Deploy and set webhook

After a successful deployment, configure Telegram’s webhook with the deployed Worker URL and the same generated `TELEGRAM_WEBHOOK_SECRET`. Restrict `allowed_updates` to only the update types IVAI needs:

```text
message
edited_message
callback_query
inline_query
chosen_inline_result
business_message
```

Do not enable a paid broadcast option. The source does not send `allow_paid_broadcast` and broadcast must operate through normal rate-limited batches.

## 4. Acceptance checks

| Test | Expected result |
|---|---|
| Unauthenticated POST | Returns `401`; no update is processed. |
| `/start` in a new chat | English-first welcome and mode keyboard. |
| `/lang` | Lets the user explicitly switch to Persian. |
| `/models`, `/pick 1`, `/model off` | Lists only allowed free models, locks a valid selection, and returns to auto policy. |
| `/memory on`, `/memory show`, `/memory clear` | Uses short-lived context and permits clearing it. |
| Voice/photo | Enforces size and daily quota before Workers AI processing. |
| Inline query | Produces an inline result with feedback controls; an empty query does not call an AI provider. |
| `/admin` | Non-admins are blocked; a verified owner gets a draft-only broadcast flow. |
| Broadcast | Requires draft → preview → confirm; test with a dedicated staging audience first. |

## 5. Free-tier guardrails

The bot must gracefully refuse or defer a request rather than calling a paid model when its own daily Workers AI budget or a provider’s free limit is exhausted. Verify that all production model IDs remain in `FREE_MODEL_POLICY`, and remove any model whose free access changes.

## 6. Credential hygiene

The provider keys and bot token that were shared in the conversation should be rotated after the secrets are registered. This is a routine precaution because credentials are safer when generated and stored only in the provider dashboard and Worker Secrets manager.

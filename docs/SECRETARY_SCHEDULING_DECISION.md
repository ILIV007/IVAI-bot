# Secretary scheduling decision — IVAI v3.3

## Decision

IVAI will use the existing **Cloudflare Workers scheduled handler** with a single source-controlled Cron Trigger (`*/10 * * * *`) and indexed D1 task rows. This is the best fit for the bot's free-only, low-consumption contract.

The scheduled invocation selects only due, unsent tasks in a small bounded batch, atomically claims each task, then sends one Telegram reminder per claimed task. D1 remains the durable source of truth; KV is not used for delivery correctness. The architecture is intentionally **at-least-once safe**: a task changes to `sending` before delivery and moves to `sent` only after Telegram accepts the message. A short lease lets the next cron retry an interrupted send without sending an unbounded duplicate stream.

## Why this option

| Option | Evaluation | Decision |
|---|---|---|
| Worker Cron + D1 | Uses current Worker, D1 and existing scheduled handler; has no added dependency; fixed, indexable bounded query; 10-minute delivery window | **Selected** |
| Durable Object alarms | Supports precise at-least-once alarms, but would introduce a new stateful runtime, migration surface and per-task alarm management | Not needed for a low-cost bot with 10-minute service window |
| Workflows | Has durable sleep/retry capability but introduces per-task workflow state and step accounting | Not needed for a single deterministic notification step |

## Constraints

- Cloudflare Cron Triggers run in UTC. User input is stored as an ISO timestamp with an explicit timezone offset.
- The Worker Free plan has a 10ms CPU-time limit per Cron invocation, so delivery uses small batches and no AI/model call.
- The free account supports five Cron Triggers. IVAI uses one trigger for maintenance, broadcasts and reminders.
- A Cron configuration change can take up to 15 minutes to propagate; the configuration must stay in `wrangler.jsonc` because GitHub builds deploy the Worker.
- Reminder delivery is best effort within approximately ten minutes of `due_at`; exact-to-the-second delivery is intentionally not claimed.

## Sources

1. Cloudflare, [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
2. Cloudflare, [Scheduled Handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/).
3. Cloudflare, [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
4. Cloudflare, [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
5. Cloudflare, [Durable Objects Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/).
6. Cloudflare, [Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/).

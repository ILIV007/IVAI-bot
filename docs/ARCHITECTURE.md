# IVAI v3.3 Architecture

IVAI is a single Cloudflare Worker that receives Telegram updates over a secret-protected webhook, processes each user request through a small set of focused ES modules, and persists state in Workers KV and D1. The architecture prioritizes predictable free-tier consumption: the normal response path makes one model request, and only tries the next configured free provider after a failure.

## Runtime components

| Component | Responsibility | State or boundary |
|---|---|---|
| `index.js` | Worker fetch entry point and scheduled handler | Rejects invalid webhook calls before routing; runs bounded background batches. |
| `security.js` | Webhook validation, update deduplication, rate/quota checks, roles | D1-backed atomic runtime guards. |
| `router.js` | Commands, callbacks, text/media updates, inline, Guest, reactions | Selects the minimum path necessary for each update. |
| `response-profile.js` | Authoritative response-mode contract | Resolves the visible Mode, instruction, bounded output budget, temperature, Workers AI reservation and Rich Math eligibility. Auto remains Auto and never silently becomes Fast/Deep/Code. |
| `ai.js` | Provider execution, prompt assembly, sequential fallback | Consumes one Response Profile per turn; Workers AI primary; allowlisted free providers only. |
| `catalog.js` | Free-model catalog and picker | KV cache; selected model validation. |
| `telegram.js` | Telegram API calls, Rich Draft/Message fallback, UI and context forwarding | Preserves business and topic identifiers. |
| `storage.js` | User preferences, conversations, tasks, delivery state, audit data | D1 for relational state, KV for bounded memory/cache. |
| `media.js` | Telegram file retrieval, transcription, image analysis | Enforces size and quota limits before AI processing. |
| `broadcast.js` | Draft, preview, confirmation, queue and sequential deliveries | D1 audit trail; no paid broadcast flag. |
| `secretary.js` | Due-task claiming and reminder delivery | Atomic D1 claim prevents duplicate reminders. |
| `reengagement.js` | Consent-aware inactive-user check-ins | At-most-once-per-15-days eligibility and delivery tracking. |
| `admin.js` / `admin-page.js` | Validated Telegram Mini App administration | Server-side `initData` validation and role check. |

## Request lifecycle

```mermaid
sequenceDiagram
    participant T as Telegram
    participant W as IVAI Worker
    participant S as Security + D1
    participant R as Router
    participant A as Free AI Provider
    participant K as KV / D1

    T->>W: HTTPS webhook update + secret header
    W->>S: Validate secret, deduplicate, rate/quota check
    S-->>W: Allow or reject
    W->>R: Route update type and context
    R->>K: Read preferences, selected model, bounded memory
    R->>R: Resolve Response Profile (visible Mode + budget)
    R->>A: One allowlisted model request
    A-->>R: Response or provider failure
    R->>K: Persist permitted state and audit outcome
    R->>T: Rich response or standard fallback
```

## Response-profile contract

A turn has two intentionally separate choices. **Response Mode** is the user-facing behavior (`Auto`, `Fast`, `Deep`, `Code`, and supported specialist modes); it determines the system instruction, bounded output budget, temperature, Workers AI reservation, and the footer label. **Model/provider routing** determines only which eligible free endpoint receives that one request. The route is `Auto` when no selected model exists, or `Pinned` when a user-selected free model is preferred. Crucially, an Auto route resolves the same provider-specific default model regardless of Response Mode; Mode cannot indirectly alter the automatic model choice. Selecting a model never alters Response Mode. Selecting Mode Auto via Menu or `/auto` resets both Mode and route defaults; `/model off` resets only the route and leaves Mode unchanged. Telegram Menu, Settings and picker—and the Terminal chips—expose both pieces of state independently so an Auto footer is never mistaken for a hidden Fast/Deep/Code choice.

`response-profile.js` is the sole owner of this contract. This avoids mode-specific output limits, instructions, temperature, and rich-math rules drifting across providers. Provider fallback remains sequential and occurs only after a failure; the normal path still makes one AI call.

## Session and reset contract

Telegram `/new` and Terminal `/app/new` now share the same Agent-default reset: clear the scoped Session, set `mode=auto`, clear `selected_model` (Auto route), and set `memory_enabled=0` in one D1 preference update. The interface language remains a display preference. Telegram and Terminal Sessions remain separate so each surface retains only its own bounded conversation context.

## Scheduled lifecycle

The Worker runs every ten minutes. A single scheduled invocation performs only small bounded work: expired-state cleanup, a safe broadcast batch, due Secretary reminders, and a maximum of five re-engagement check-ins. Each bounded step has an independent failure boundary, so a temporary failure in one workflow is logged as `cron_step_failure` without skipping later work. Each delivery workflow claims work atomically in D1 before sending it, so concurrent Worker executions cannot deliberately send a duplicate delivery.

## Data ownership and retention

| Store | Use | Retention approach |
|---|---|---|
| D1 | Users, preferences, roles, task/reminder state, broadcast delivery/audit records, re-engagement consent | Structured operational state; migration-managed. |
| KV | Opt-in short-term conversation memory and catalog/cache values | TTL-bounded; users can inspect or clear memory. |
| Cloudflare Worker Secrets | Telegram token, webhook secret, admin IDs, optional provider keys | Never committed or returned by application routes. |

## Extension rules

New features should enter through the narrowest suitable module and keep failure behavior explicit. For example, a new command belongs in `router.js`, not in the fetch entry point; a D1 schema change is an ordered new migration; and a Telegram API enhancement must retain standard-message fallback. Any new provider must be reviewed against the free-only policy before it appears in the catalog or fallback chain.

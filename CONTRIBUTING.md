# Contributing to IVAI Bot

Thank you for improving IVAI. This repository is deliberately focused on a **free-tier, low-consumption, English-first Telegram AI assistant**. Every contribution must preserve that product boundary.

## Contribution contract

| Area | Required standard |
|---|---|
| Cost | Do not add paid models, Telegram Stars, paid broadcast, or an undisclosed metered fallback. A provider may be added only when it is explicitly constrained by the free-only policy. |
| Privacy | Never commit bot tokens, provider keys, webhook secrets, chat content, D1 exports, or `.dev.vars`. Use Cloudflare Worker Secrets for credentials. |
| Consumption | Keep the normal path to one model call per request. Fall back sequentially only after a provider failure; do not fan out a user request across models. |
| Language | English remains the default. Persian stays the second language; optional languages must remain selected explicitly through `/lang`. |
| Telegram safety | Preserve webhook authentication, update deduplication, rate controls, context forwarding, and graceful API fallbacks. |
| Data compatibility | Add D1 changes as ordered migrations in `db/`; never edit an already-applied migration. |

## Development workflow

Fork the repository or create a focused branch from `main`. Copy `.dev.vars.example` to `.dev.vars` only on your local machine and use placeholder values unless you are testing against a dedicated non-production bot. Do not point local experiments at the production database or webhook.

Before opening a pull request, run the repository checks:

```bash
npm run check
npm test
```

A change that affects a command, callback, provider policy, scheduled handler, persistence function, or Telegram transport should include or update a foundation test. A database change must include an ordered SQL migration and a note in the deployment documentation when an operator action is required.

## Pull request expectations

Use one focused change per pull request. Explain the user-visible outcome, security implications, cost impact, migrations, and verification steps in the pull request template. Keep implementation details modular: routing belongs in `router.js`, Telegram transport in `telegram.js`, persistence in `storage.js`, provider behavior in `ai.js`, and scheduled delivery in its dedicated module.

> If a proposed feature requires a paid model, paid Telegram capability, or removal of a guardrail, open an issue first. It is outside the project’s default acceptance criteria.

## Reporting security issues

Do not disclose secrets or exploitable webhook/authentication details in a public issue. Follow [SECURITY.md](SECURITY.md) for private reporting guidance.

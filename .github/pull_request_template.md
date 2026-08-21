## Summary

Describe the user-visible outcome and the reason for this change.

## Change classification

| Area | Answer |
|---|---|
| User-facing behavior | |
| Security or privacy impact | None / describe |
| Free-tier or quota impact | None / describe |
| D1 migration required | No / migration file |
| Telegram or Cloudflare configuration required | No / describe |

## Verification

- [ ] `pnpm run validate` passes locally.
- [ ] `pnpm audit --audit-level=high` was run when dependencies changed.
- [ ] Tests were added or updated for behavior changes.
- [ ] No secret, `.dev.vars`, user content, or database export is included.
- [ ] The normal request path still makes at most one model call.
- [ ] New provider/model paths are explicitly free-only and allowlisted.
- [ ] Deployment and rollback steps are documented when relevant.

## Release note

Write one concise release-note sentence, or state `No user-facing release note`.

# Terminal runtime debug notes — 2026-08-21

- Production `GET /app` renders the Terminal shell but the browser snapshot remained at `CONNECTING` and the transcript stayed empty after a second view.
- This behavior is reproducible in the sandbox browser outside a Telegram session. It cannot by itself prove a Telegram-client failure because the required signed `initData` is absent outside Telegram.
- The browser-saved DOM displayed empty `nonce` attributes. Browser DOM serialization intentionally hides CSP nonces; the separate production header smoke test previously showed a populated matching CSP nonce. This is not treated as evidence of a nonce-generation defect.
- The client currently reports all boot errors with one generic message and disables the composer, so `UNAUTHORIZED`, empty `initData`, timeout, non-JSON response and provider availability cannot be distinguished by users. The redesign/fix must expose a clear reconnect state and retry action without exposing security internals.
- Cloudflare MCP log inspection could not be used because the configured `cloudflare` server returned `403 Forbidden` while listing tools. Runtime evidence must therefore be collected through deterministic endpoint probes, client diagnostics, and user Telegram test scenarios.
- Official Telegram documentation confirms that Mini App `initData` must be sent to and validated by the backend. The existing HMAC construction matches the documented `WebAppData` derivation; the likely user-visible issue is session visibility/error handling or a configured launch context, not an intentional client trust bypass.

## Visual validation after redesign

The local Worker rendered the new navy/deep-blue/jade workspace shell at mobile width. The visual hierarchy now includes a distinct product bar, secure-status badge, settings chips, generous conversation surface, professional composer and responsive send control. The shell retains `CONNECTING` in the sandbox browser because that browser has no signed Telegram session and does not provide a valid `initData`; the new client explicitly recovers from this state with a clear secure-session message and reconnect control instead of leaving the user in an ambiguous permanent loading state.

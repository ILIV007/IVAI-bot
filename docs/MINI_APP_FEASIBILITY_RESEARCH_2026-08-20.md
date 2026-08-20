# IVAI Mini App feasibility research — 2026-08-20

## Official Telegram findings

| Topic | Verified finding | Design consequence for IVAI |
|---|---|---|
| UI capability | Telegram Mini Apps support arbitrary JavaScript interfaces inside Telegram and can act as a full website replacement. | A terminal-style chat UI is fully feasible. No Telegram Premium feature is required. |
| Main Mini App | A Main Mini App can be configured in BotFather, adds a Launch app profile button, and can be opened through `https://t.me/<bot>?startapp`. | Use Main Mini App as the primary user entry point and keep the bot chat as the fallback entry point. |
| Menu button | A customized bot menu button can launch a Mini App for all users. | Add a single `Open IVAI` or `Terminal` menu button after the web UI is ready. |
| Authorization | `Telegram.WebApp.initData` must be validated on the server; `initDataUnsafe` must not be trusted. | Reuse and generalize IVAI's existing HMAC initData validation from the admin Mini App for every user chat API request. |
| Theme and viewport | Telegram provides theme data, viewport/safe-area values, user/device information, event APIs, and a JavaScript bridge. | The UI can feel native while remaining a small static HTML/CSS/JS document. Use safe-area/theme variables and avoid external UI frameworks. |
| `sendData` | Keyboard-button Mini Apps can return a small string as a service message to the bot. | This is unsuitable as the primary chat transport because it returns through the webhook and does not provide a persistent browser conversation or streaming response. |
| Inline/direct-link limitations | Direct-link and inline Mini Apps do not have general read/send access to the host chat. | Do not build group chat forwarding into v1. The terminal should be a private IVAI conversation handled by a verified Worker API. |
| Origin hardening | Telegram tightened Mini App origin protection in Bot API 10.2. | Host the app and API on the same trusted `ivai-bot.workers.dev` origin; do not opt out of BotFather protection or embed untrusted content. |

## Sources

1. [Telegram Mini Apps](https://core.telegram.org/bots/webapps), accessed 2026-08-20.
2. [Telegram Bot API](https://core.telegram.org/bots/api), accessed 2026-08-20.
3. [Telegram Bot Features — Mini Apps](https://core.telegram.org/bots/features#mini-apps), accessed 2026-08-20.

## Preliminary conclusion

A lightweight terminal chat Mini App is technically feasible on the existing Cloudflare Worker with no paid infrastructure. It should be a static route such as `/app`, use verified `initData` as the only authentication input, call a new same-origin JSON endpoint such as `POST /app/chat`, and reuse the existing free-only `generateReply` pipeline. It must not call the Bot API for each browser message and should not use WebSockets, Durable Objects, external databases, hosted fonts, analytics, or AI streaming in the first version.

The low-cost v1 model is request/response: one user action equals one HTTP request and exactly one existing sequential AI path. The terminal transcript is local to the device/session by default; IVAI's existing short-term memory is only used when the user enables memory. D1 is used only for identity/settings/rate guard already present in the bot.

## Cloudflare free-tier capacity relevant to a terminal Mini App

| Resource | Current free-plan limit | v1 terminal implication |
|---|---:|---|
| Worker HTTP requests | 100,000 per day | A static shell plus one chat request per turn fits early adoption. The UI must not poll, prefetch aggressively, or make a request for each typed character. |
| Worker CPU | 10 ms per HTTP invocation | The terminal shell must be plain HTML/CSS/JS with no framework hydration, syntax highlighting library, markdown parser, animation loop, or large client bundle. Network waiting for AI/D1/KV does not count as CPU time. |
| Worker subrequests | 50 per request | A chat turn can remain below 10 subrequests: authenticate, read settings/memory, rate guard, one provider call, and optional save. |
| KV reads | 100,000 per day | Avoid reading/writing a transcript per rendered message. Keep the terminal transcript locally in the webview and read KV only when opt-in memory is enabled. |
| KV writes | 1,000 per day | This is the tightest relevant limit. A v1 terminal must not persist every turn to KV by default. Use existing short-memory KV writes only for opted-in memory and cap that feature. |
| D1 reads/writes | 5,000,000 reads and 100,000 writes per day | Existing user/settings/rate-counter operations are compatible with a low-traffic Mini App when queries remain indexed and bounded. |
| Workers AI | IVAI internal protective budget: 8,000 reserved Neurons/day | The existing one-model sequential fallback path remains the dominant capacity limit, not the terminal interface itself. |

A useful planning formula is: **one terminal chat turn = one dynamic Worker request + one rate guard + a small number of D1/KV operations + one existing AI request path**. Opening the terminal shell should be a single GET that performs no D1/KV/AI operation after the static file is cached by the Telegram webview.

## Additional sources

4. [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), accessed 2026-08-20.
5. [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), accessed 2026-08-20.
6. [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), accessed 2026-08-20.
7. [Cloudflare Workers KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), accessed 2026-08-20.

## Local visual check — 2026-08-20

The locally served `/app` shell rendered successfully at desktop width. The terminal card uses the intended navy background, deep-blue panel gradients and jade status/send accents. The mobile-width layout rules, sticky composer, small metadata chips and monospace transcript hierarchy are present. A locally inserted three-line sample transcript confirmed distinct `SYSTEM`, `YOU` and `IVAI` labels with readable contrast. The authenticated boot flow cannot be completed outside Telegram because the route intentionally rejects absent Mini App `initData`; this is expected and will be tested in Telegram after BotFather configuration.

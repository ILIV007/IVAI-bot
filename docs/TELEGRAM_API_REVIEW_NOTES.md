# Telegram API review notes — 2026-08-20

## Official sources

- Telegram Bot API: <https://core.telegram.org/bots/api>
- Telegram bot buttons: <https://core.telegram.org/api/bots/buttons>

## Findings relevant to IVAI

Telegram documents three predefined button background styles: `bg_primary` (dark blue/main action), `bg_success` (green/positive action), and `bg_danger` (red/destructive action). The MTProto schema presents these under `keyboardButtonStyle`; the Bot API surface exposes the corresponding button `style` field in Bot API versions that support styled buttons. Only one background style should be set for a button. The official documentation notes that colors are adapted to the user’s Telegram theme.

The Bot API 10.1 release notes describe Rich Messages and `sendRichMessageDraft` for streamed partial rich responses. IVAI’s current JSON wrapper should preserve a safe fallback path because clients and deployment tooling may not yet support every rich-message field uniformly.

For the current low-cost UI update, use the three semantic styles only on primary menus: `primary` for entering chat or confirming a safe selection, `success` for enabling/locking a model, and `danger` only for destructive actions such as reset or clearing memory. Ordinary informational buttons should remain neutral.

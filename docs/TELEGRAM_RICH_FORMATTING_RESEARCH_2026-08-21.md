# Telegram Rich Formatting Research — 2026-08-21

## Official findings

Telegram Bot API 10.1 introduced **Rich Messages**, including `sendRichMessage`, `sendRichMessageDraft`, structured rich blocks, headings, lists, tables, block quotations, pull quotations, details and thinking blocks. The Bot API supports streaming partial AI output through `sendRichMessageDraft` and a final rich message through `sendRichMessage`.[^bot-api]

For ordinary Bot API `sendMessage` and `editMessageText`, Telegram supports `HTML` and `MarkdownV2` formatting. The project already uses `parse_mode: HTML`, which is the safest incremental choice for its existing escaped-output flow. HTML supports bold, italic, code and links, while Telegram text entities include **block quotes**. Since output from AI is untrusted, the implementation must escape model output before selectively rendering a narrow safe subset of formatting markers.[^entities]

## Design decision

IVAI will retain `HTML` for normal menu and bot messages, because templates already use escaped interpolations and the existing model-output renderer safely escapes all output before applying limited presentation. Rich Draft remains the preferred optional delivery path for streamed AI output; the existing plain `sendMessage` fallback guarantees compatibility if Telegram Rich Messages are unavailable.

For user-facing copy, semantic rich formatting will be limited to concise headings, bold labels, code-form commands and one short blockquote/pull quote only where it provides an actual summary. Decorative “color guidance” must not be printed in message text. Button styles communicate hierarchy through placement and color only.

[^bot-api]: [Telegram Bot API — Rich Messages, Bot API 10.1](https://core.telegram.org/bots/api)
[^entities]: [Telegram — Styled text with message entities](https://core.telegram.org/api/entities)

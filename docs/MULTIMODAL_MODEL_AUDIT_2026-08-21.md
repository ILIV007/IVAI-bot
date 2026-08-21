# IVAI Multimodal Model Audit

**Scope:** Voice transcription and photo understanding on Cloudflare Workers AI while preserving IVAI's free-only and low-consumption policy.

## Official findings

| Capability | Current IVAI primary | Official capability | Free-tier implication | Assessment |
|---|---|---|---|---|
| Voice to text | `@cf/openai/whisper-large-v3-turbo` | Automatic speech recognition and speech translation; accepts a language hint and returns text, segments and VTT. | 46.63 Neurons per audio minute; Workers Free includes 10,000 Neurons/day. | Appropriate quality-first primary. The current 600-Neuron reservation is deliberately conservative. |
| Voice fallback | `@cf/openai/whisper` | Multilingual speech recognition, translation and language identification. | 41.14 Neurons per audio minute. | Valid fallback. The adapter needs an explicit fallback only if IVAI's one-successful-call policy permits a retry after a failure. |
| Photo understanding, current primary | `@cf/google/gemma-4-26b-a4b-it` | Cloudflare-hosted vision, reasoning and function calling. | 9,091 input and 27,273 output Neurons per million tokens; not listed among models requiring paid billing. | Capable, but expensive for an 8 MB Telegram photo and its documented multimodal request shape should be checked against the binding. |
| Candidate: Llama 4 Scout | `@cf/meta/llama-4-scout-17b-16e-instruct` | Native image understanding and vision. | 24,545 input and 77,273 output Neurons per million tokens. | Valid vision fallback but materially less economical for concise photo descriptions. |
| Candidate: Llama 3.2 11B Vision | `@cf/meta/llama-3.2-11b-vision-instruct` | Visual recognition, image reasoning, captioning and image Q&A. Official guide uses `messages` plus an `image` data URL. | 4,410 input and 61,493 output Neurons per million tokens; requires a one-time Meta license acceptance request. | Lowest documented input price and most explicit image schema; not selected until account-level license acceptance and live compatibility are confirmed. |

## Live validation and remediation

A live 16×16 PNG request against the current account verified that both Gemma 4 and Llama 4 Scout accept IVAI's OpenAI-compatible `messages` plus `image_url` data-URL shape. Gemma 4 returned reasoning-only content repeatedly under 12-, 48-, 96- and 320-token limits, leaving the user-visible `content` empty. This is incompatible with the adapter's safe empty-output rejection and was therefore treated as a production defect rather than exposed to users.

Llama 4 Scout returned a finished visible image description with the same request shape at an 80-token ceiling. The observed test used 5.31 Neurons for 166 prompt tokens and 16 completion tokens. IVAI now selects Llama 4 Scout as the vision primary, keeps Gemma 4 as a free-tier fallback, and caps photo output at 320 tokens. The adapter preserves its 1,000-unit application reservation for conservative daily budgeting.

Whisper Large V3 Turbo was also sent a valid short PCM WAV payload. Cloudflare reached the model and rejected the synthetic tone as no speech (`4006`), confirming the standard `audio`/`task` request route was reached. No production user audio was accessed or retained for the check.

## Free-tier boundaries

Cloudflare provides 10,000 free Neurons per day, reset at 00:00 UTC. IVAI reserves only 8,000 Neurons per day to retain a 20% metering buffer. The media adapter limits each Telegram download to 8 MiB, enforces 15-second network timeouts and permits at most four media requests per user per 24 hours. Voice reserves 600 units and photo analysis reserves 1,000 units before inference. These reservations are conservative application guards, not Cloudflare metering estimates.

## Source-backed recommendation

Keep Whisper Large V3 Turbo as the voice primary because it is current, multilingual and designed for ASR. Use Llama 4 Scout as the vision primary: it was live-verified on the account with IVAI's current data-URL schema and returned a finished visible response. Keep Gemma 4 only as a fallback because it is capable but its reasoning-first output can exhaust a bounded completion without returning user-visible text. Do not switch to Llama 3.2 11B Vision until the account owner explicitly completes its one-time Meta license acceptance; its lower input price does not justify silently accepting a separate license.

## Sources

[1] [Cloudflare — Whisper Large V3 Turbo](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)

[2] [Cloudflare — Whisper](https://developers.cloudflare.com/workers-ai/models/whisper/)

[3] [Cloudflare — Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

[4] [Cloudflare — Gemma 4 26B A4B](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)

[5] [Cloudflare — Llama 4 Scout](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/)

[6] [Cloudflare — Llama 3.2 11B Vision](https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/)

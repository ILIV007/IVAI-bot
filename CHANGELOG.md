# Changelog

All notable changes to IVAI Bot are documented in this file. The project follows [Semantic Versioning](https://semver.org/).

## [3.14.0] - 2026-11-14

### Changed

- **Free model catalog refresh (verified against the providers' official catalogs):** Gemini 2.5 Flash is removed (Google deprecated it; requests auto-route to Gemini 3.5 Flash-Lite from 2026-12-01). Workers AI gains Nemotron 3 120B and Qwen3.8 27B (text; Qwen3.8 also joins vision). Google gains Gemini 4 Hydrogen — the only Gemini 4 model with a Free Tier — and Gemini 3.1 Flash-Lite; the Google automatic default moves to Gemini 3.8 Flash.
- **Channel-post comments move to Qwen3.8 27B** (was Qwen3 30B, owner pick): same Qwen family, so the `/no_think` switch and the tuned comment voice carry over unchanged. Group reply/mention turns keep the GLM 4.7 Flash pin (owner pick). The Gemini BYOK preset also gains Gemini 4 Hydrogen.

## [3.13.2] - 2026-11-14

### Changed

- **Terminal goes Neon Console:** the near-black palette leans navy (`#0a0f1e`, owner request), a faint dot-grid texture sits behind the workspace, the composer glows jade on focus with a blinking block cursor after the `❯` prompt (hidden while typing), suggestion chips read as command chips, statusline chips carry a jade underline, and the Send button keeps its label on mobile instead of collapsing to an icon.

## [3.13.1] - 2026-11-14

### Changed

- **Stop BYOK ends with a Ready message:** tapping Stop now says «✅ IVAI is ready! 🚀» and invites the user to send a message — the old one-liner («Back to IVAI models.») only stated the switch. The indicator is still deleted on Stop, exactly as before.

## [3.13.0] - 2026-11-14

### Added

- **Terminal button on the Admin panel:** the topbar gains a «⌘ Terminal» button next to the status pill that opens the Terminal web chat (`/app`) in the same WebView, so the admin jumps straight from the panel to the chat. It sits outside the verified dashboard, so it is visible as soon as the page loads.
- **Terminal redesign (modern, Warp-like):** IVAI Terminal drops the gradient bubble look for a flat terminal — near-black surfaces, one jade accent, mono-first chrome (statusline segments, `❯` command blocks, mono composer and sheets), and full-width message blocks separated by hairlines instead of bubbles.

### Fixed

- **Terminal UI language lock:** a Persian prompt in IVAI Terminal answers in Persian but no longer flips the whole page to Persian — `/app/chat` returns the stored UI language in its settings (the answer language stays in the top-level `language` field), and the page no longer falls back to the answer language when rebuilding its settings.
- **Admin panel language lock:** the Admin page no longer reads the Telegram client's `language_code` — it opens in English by default and switches to Persian only through the new topbar toggle, stored on the device.

## [3.12.0] - 2026-11-14

### Added

- **IVAI Terminal catches up with the bot (Website Phase A):** My API works on the web — add a provider/key/model (stored AES-256-GCM encrypted, never tested on add), activate, and Stop; the active config answers web chats first, with the free chain as fallback and the same one-line notice. Settings are editable from the web (mode, model, memory, language) and the Engine chip shows the active BYOK config or IVAI models. Answers render fully (headings, lists, small tables, fenced code blocks) with the same safe DOM-based rendering, the session history loads on open, the pending bubble says "IVAI is thinking…", and the busy message names the reset window.

## [3.11.4] - 2026-11-14

### Changed

- **"Ready!" rides inside the indicator:** activation used to send three messages — the green-tick confirmation, a separate «Ready! 🚀», and the persistent BYOK indicator. The separate Ready message is gone: its line is now the first line of the indicator itself («Ready! 🚀» / «آماده! 🚀», then «🔑 Using your API — {name} · {model}» with the ⏹ Stop BYOK button), so activation ends with exactly two messages and the one that stays in the chat says it all. Re-sends on config/model change and the rename refresh carry the same combined text.

## [3.11.3] - 2026-11-14

### Fixed

- **Footers follow the answer's direction:** the footer (and the BYOK fallback notice) followed the stored UI language, so an English footer inside a Persian answer rendered left-aligned with its IVAI/model/mode sequence possibly reversed. `responseMeta` now takes the answer's direction: an RTL answer pins the footer with RLM + LRI isolate (right-aligned, sequence intact), and the fallback notice gets the same RLM. Applies to text, media, guest, and inline answers; the plain fallback benefits too.
## [3.11.2] - 2026-11-14

### Added

- **Persistent BYOK indicator (Phase 2):** while My API is active, a notification message stays in the private chat — «🔑 Using your API — {name} · {model}» with a ⏹ Stop BYOK button. Switching the active config or model deletes the old indicator and sends a fresh one (exactly one at a time); Stop deactivates BYOK, deletes the indicator, and confirms with one short line («Back to IVAI models.»). No pin, no self-heal, no in-place edit — if the user deletes the message by hand, nothing re-sends it. Disabling or removing the active config clears the indicator too.
## [3.11.1] - 2026-11-14

### Fixed

- **Rich screens keep their line breaks:** Rich Messages parse HTML as real HTML, so a raw newline is collapsible whitespace — the v3.11.0 screens (menu, settings, My API, Help, reminders, admin) rendered as one flowing paragraph with no blank lines. Screen copy is now converted (`\n` → `<br>`) for the Rich send only; the plain fallback keeps the raw text, and AI answers are untouched (they already emit real blocks).

## [3.11.0] - 2026-11-14

### Changed

- **Messages refresh (Phase 3):** every bot message was rewritten with fresh English-first copy (Persian when the stored language is `fa`), per the owner's approved draft — welcome, menu, help, model picker, membership, settings, My API screens, task reminders, admin screens, and error/busy texts. One-line confirmations keep a single "✓ …" template and every empty state now names one next action.
- **Rich Messages:** 13 screens are now Telegram Rich Messages with a plain-HTML fallback — membership confirmation, settings, My API list and manage (all three states), model menu, provider picker, task list, cron reminder, admin panel, admin stats (as a small table), and the free-policy page — plus a collapsible "More about sessions" section in Help. Callback-edited screens use `editMessageText` with `rich_message`; a Rich failure always falls back to plain, never to an error.
- **Menu engine line:** the main menu shows which engine answers — the active My API config ("🔑 {name} · {model}") or "IVAI models".
- **Quota transparency:** busy messages name the approximate reset window ("about 20 minutes", "about 1 hour") instead of a bare "busy" — the limiter now reports the wall-clock bucket reset; no quota numbers are ever shown.

## [3.9.3] - 2026-11-14

### Fixed

- The key-saved message no longer tells the user to test the connection to activate it — activation runs no test (v3.9.2), so the message now says to pick a model instead ("Pick a model and you're ready — no test needed."). This was the last live copy contradicting the owner's no-test decision.
- The activation confirmation is one short message with a green tick ("✅ My API is active" + config line + fallback line) followed by a separate "Ready! 🚀" message below it. The manage screen is no longer concatenated into the confirmation — it repeated the config line and the ready line and turned the message into a wall of text. The manage keyboard stays attached, so Test / Change model / Rename / Remove remain one tap away.

## [3.9.2] - 2026-11-14

### Changed

- No more forced connection tests: activating a config (typing a model, or "Use my API") no longer runs a test call — a test would burn the user's own API tokens for nothing (owner decision). The manual "Test connection" button stays for anyone who wants it; a stale key is caught by the first real chat, which falls back to IVAI models with a one-line notice.

## [3.9.1] - 2026-11-14

### Fixed

- Setting a model is the last step now: for a new custom endpoint the connection test runs right away and a working test activates the config directly, so the user no longer lands on an "(inactive)" screen wondering what is left to do. The activation confirmation and the manage screen of an active config now say the API and model are ready and to start chatting; an inactive config names its next action ("Tap Use my API to activate").
- In the main menu, the "My API" button is red and "Pick model" is plain (owner decision).

### Added

- Model menu per API: after selecting an API, the model menu lists that API's models plus the models the user added to it, with the active one marked; "Add a model" types a new model, remembers it on that API, and activates it with the ready message. Migration 0009 adds the `custom_models` column (applied directly via the D1 query API; 0006 never runs).

## [3.9.0] - 2026-11-14

### Added

- **BYOK multi-config — \"My API\" moves to the main menu (owner decision, BYOK v2 Phase 1):** the main menu gains its own `🔑 My API` row and Settings no longer carries one, so there is exactly one entry point. A user can now save several APIs (each with its own name, key, preset, and chat/vision/transcription models), see them in one list with a single ● Active marker, and switch between them with one tap; keys are never re-asked. The migrated v3.8.0 single config becomes the first entry (\"My API 1\") with its key untouched, and stays active if it was enabled (migration `db/0008_byok_multi_config.sql`, applied directly with the D1 query API as a batch; 0006 still never runs).
- **Per-config management:** each config has its own manage screen — change model, rename, re-enter a fresh key, test the connection, remove. Activation re-tests the key first so a stale key cannot become the active config. Deleting the active config falls back to IVAI models. BYOK callbacks in groups get a short \"private chat only\" notice, since the shared main menu now carries the entry button.

### Changed

- **Storage:** `user_api_configs` goes from a single row per user to a composite primary key (`telegram_user_id`, `config_id`); the active config is a pointer in `user_preferences.active_api_config_id` (NULL = IVAI models). Storage helpers take an optional config id and default to the active config, so turn-time code (`getUserApiConfig`) is unchanged. The Settings screen no longer shows a My API section or a ● Active marker — that marker lives only on the My API list screen.

## [3.8.0] - 2026-11-14

### Added

- **BYOK — "My API" (owner decision, design approved 2026-11-14):** in private chats, a user can add their own API key + models and the bot answers through their own OpenAI-compatible provider — text, photo vision, and voice transcription. Groups keep the free models; Guard mode never uses BYOK.
- **Presets (Approach A — one OpenAI-compatible runner for all):** OpenRouter, Groq, DeepSeek, Together, Mistral, xAI, Gemini + Custom endpoint, with per-preset chat/vision/transcription models in `BYOK_PRESETS` (`src/config.js`). Model IDs were re-verified against the providers' own catalogs on 2026-11-14: Groq's retired `llama-3.3-70b-versatile` and `llama-4-scout` are replaced by `qwen/qwen3.8-27b`; Together's removed Llama 3.3 70B Turbo by `meta-models/Muse-Glimmer-30B` and its vision model by `moonshotai/Kimi-K3.1-Pro`; xAI's retired `grok-4` by `grok-4.3`. Presets without a compatible transcription endpoint (DeepSeek, xAI, Gemini) always fall back to our Whisper.
- **Encrypted key storage:** keys are stored AES-256-GCM encrypted (`iv_hex:ciphertext_hex`, tag appended) in the new `user_api_configs` table (migration `db/0007_user_api_configs.sql`), with the encryption key from the new `BYOK_ENCRYPTION_KEY` Worker secret. If the secret is unset or a stored value cannot decrypt, the turn fails soft to the free chain. The key message is auto-deleted right after a successful save.
- **Setup flow:** preset → key → connection test (16-token probe) → model pick → active. A config is created disabled (`enabled=0`) and flips on only after a successful test. A pending-input state machine in KV (`byok:pending:<userId>`, 10-minute TTL) is intercepted before `processText`, so a pasted key never reaches the AI or the session; `/cancel` cancels it. The Settings screen shows IVAI models and My API as separate sections with a single ● Active marker, English copy first, one job per screen.
- **Fallback:** a BYOK failure falls back to the free chain with a one-line notice before the footer (standard and Rich paths, text and media); if the free chain fails too, the failure message notes that the user's API also didn't respond. Three consecutive 401s mark the config invalid; a BYOK success resets the counter. A vision refusal ("I can't see images") falls back to our vision.

### Changed

- The Memory settings toggle now re-renders the full settings view (instead of only the Memory line) so the My API section does not vanish when the toggle is tapped.
- The Memory settings test now finds the memory button by its callback instead of its row, because v3.8.0 adds a My API button above it.

### Deployment notes

- Set the `BYOK_ENCRYPTION_KEY` Worker secret (32 random bytes, base64) before deploying; rotating it invalidates saved keys.
- **Migration 0006 must never run (owner decision 2026-11-03).** The live database has no `d1_migrations` table (verified 2026-11-14), so there is no runner row to record — apply 0007 directly with the D1 query API and never execute the 0006 language reset. See `docs/DEPLOYMENT_CHECKLIST.md`.

## [3.7.9] - 2026-11-03

### Changed

- **The `post_reply` group trigger is removed (owner decision, superseding 2026-11-01):** a reply made directly on a channel post in the linked discussion group no longer triggers the bot — live behaviour showed it answering users who merely commented on a post and never addressed the bot. The bot now speaks in groups only on a mother-channel post (whose automatic comment is unchanged), a reply to the bot's own message, or a mention/command addressed to the bot; a reply on the post itself falls through to the `reply_target_unmatched` near-miss log and is ignored.

## [3.7.8] - 2026-11-03

### Changed

- **Edited messages are ignored in private chats too:** an `edited_message` update is now dropped in `handleUpdate` for every chat type, not just groups — previously a private-chat edit re-ran a full AI turn, sending a second reply and consuming quota. Edited channel posts stay dropped before the comment path, exactly as before (owner decision).

## [3.7.7] - 2026-11-03

### Fixed

- **Session KV writes are fail-soft:** a failing session `put` (or the deletes behind /start and /new) no longer throws into the webhook 500/retry path — the turn completes with the in-memory session, matching every neighboring KV access.
- **Webhook-secret rejections are logged:** a 401 now records a structured `webhook_unauthorized` event with the reason (`secret_unset` vs `secret_mismatch`, never any secret material), so a missing or drifted `TELEGRAM_WEBHOOK_SECRET` is diagnosable from logs alone.
- **Owners are exempt from the membership gate:** a membership-check outage (CHECK_FAILED) no longer locks the owner out of text, media, callbacks, inline, guest, or the Terminal — owner ids bypass the gate entirely; everyone else keeps the fail-closed behavior.
- **Voice and photo AI calls are time-bounded:** transcription and vision now race `env.AI.run` against the same 25 s timeout as the text path instead of hanging a media turn on a stuck binding call.
- **Pre-AI side effects in a text turn are fail-soft:** a failing profile upsert is logged and the turn continues with the settings already loaded, and a membership prompt that Telegram rejects ends the turn gracefully instead of throwing.
- **The Memory settings button is idempotent:** the keyboard now names the explicit target state (`settings:memory:on` / `settings:memory:off`), so a redelivered callback or double tap re-applies the same state instead of toggling twice; keyboards on already-sent messages keep working — the legacy bare value still toggles.
- **Update-claim release clears both stores:** `releaseUpdateClaim` always attempts the KV delete as well as the D1 delete, so a claim that fell back to KV during a D1 error is actually released and Telegram's redelivery is not dropped as a duplicate.
- **Runtime-guard cleanup actually expires same-day rows:** the periodic DELETEs compared ISO `expires_at` values (with a `T` separator) against `CURRENT_TIMESTAMP` (space separator), which never matched rows expiring the same UTC day; the comparison now uses a like-format ISO timestamp.
- **The OpenRouter catalog fetch is time-bounded:** the refresh call uses the same 15 s bounded-fetch pattern as the other provider calls instead of an unbounded `fetch`.
- **Group media turns no longer persist a derived UI language:** the profile upsert in the media path now stores the user's UI language (stored preference or English), exactly like text turns — a first-contact user's Persian photo caption still gets a Persian answer, but no longer silently turns their menus Persian.

## [3.7.6] - 2026-11-03

### Added

- **Code-assigned channel-post comment modes (60% FUN / 40% ANALYSIS, random 2–3 streak cap):** since v3.7.2 the comment prompt let the model pick FUN or ANALYSIS per post, and live it over-picked ANALYSIS, so the balance the two modes exist for was lost. The mode is now assigned in code before generation: a deterministic per-post hash draw weighted 60% FUN / 40% ANALYSIS (independent of the sampling draw), tempered by a per-chat streak state in KV — when a run of one mode reaches its cap, drawn fresh per run from 2–3, the next comment is forced to the other mode. The prompt no longer asks the model to choose; it states the assigned mode and that mode's definition, with both worked-example groups and all hard rules unchanged. The streak state is written only after a comment is actually sent (skipped, incomplete, and failed comments never touch it), and every KV access is fail-soft, degrading to the plain weighted draw.

## [3.7.5] - 2026-11-03

### Fixed

- Rejected group triggers are now nearly free — the anti-spam limit check runs before settings/membership/upsert/session work; voice transcription is capped at 2 MB before download; the classic thinking animation ticks at 2 s without a per-tick typing call.

## [3.7.4] - 2026-11-03

### Changed

- The private-chat thinking label now leads with a lightning bolt (⚡) instead of the hourglass (⏳), in both the rich draft thinking block and the classic fallback label.

## [3.7.3] - 2026-11-03

### Added

- **Channel posts sent as Telegram Rich Messages are now read and commented on:** a rich post (Bot API 10.1) carries no `text`/`caption` — its content lives in `message.rich_message.blocks` — so IVAI silently skipped every rich post as if it were media-only. A defensive recursive extractor (`messagePlainText` / `richBlockToPlain` / `richTextToPlain` in `router.js`) now flattens rich blocks — paragraphs, headings, preformatted text, footers, lists, tables (cells joined with ` | `), quotations, details, and media captions — to plain text, and rich posts flow through the existing channel-post path unchanged: same eligibility (≥200 characters, ≥20 words), ~75% sampling, limits, two-mode comment prompt, and completeness guard. Script-language detection and reply-chain context read the same flattened text, so a Persian rich post is answered in Persian and a reply on a rich post carries its content as context. A rich post whose blocks carry no text (e.g. a lone photo block without a caption) still earns no comment, exactly like today's media-only rule, and malformed rich payloads degrade to no text instead of throwing.

## [3.7.2] - 2026-11-02

### Changed

- **Channel-post comments now work in two modes, chosen per post:** the v3.7.0 persona prompt always reached for the joke, so comments kept trying to be funny and rarely offered a useful opinion. The prompt now frames two explicit modes and teaches both by example, under separate `FUN examples:` and `ANALYSIS examples:` headings. FUN is the existing comedy behavior — unchanged, its three worked examples (Xbox trade-in, RTX 5090 mod, StreamVibe) kept verbatim. ANALYSIS is new: the bot as a very smart friend — what is genuinely good or interesting about the topic AND what else matters (the catch, the trade-off, the limit), balanced and concrete, not a roast and not a verdict — taught by two new worked examples (Pico11 booting Windows 11 on 128 MB of RAM: the official 4 GB "minimum" is mostly the weight of Microsoft's services, but what was removed to get there makes it a demo, not a daily system; Nota, the offline Ollama PDF reader: your files never leave your device, set against the quality gap of small local models and browser storage ceilings on a large archive). The model picks the mode the post honestly deserves — tool/project announcements with real trade-offs usually get ANALYSIS, absurd or gossipy posts get FUN — and never mixes the two in one comment (a new hard rule); the "land a real take" rule now reads as a take OR a balanced analysis point. Comment model (Qwen3 30B), `/no_think`, the 1600-token budget, completeness guard, ~75% sampling, eligibility, and limits are unchanged.

## [3.7.1] - 2026-11-02

### Fixed

- **Channel-post comments could arrive truncated mid-sentence** — live comments were cut off mid-word ("…اگه این یه جریان باشه، حتم", "…فقط خدا به داد"). The Fast profile's 900-token cap is ample for 1–3 lines, but the pinned comment model (`@cf/qwen/qwen3-30b-a3b-fp8`) is a reasoning model whose internal reasoning shares that budget and on some generations left too little room for the comment itself. Three-part fix: the comment prompt now opens with Qwen3's `/no_think` soft switch so reasoning is disabled for comment generation; the comment call carries its own larger output budget (1600 tokens via a new optional `maxTokens` override plumbed through `generateReply` to Workers AI — group replies keep the Fast profile's 900); and a completeness guard (`completeChannelComment`) now post-processes every comment — one that still stops mid-sentence is trimmed back to its last complete sentence (a segment ending at terminal punctuation or an emoji cluster), and if nothing complete remains, or only a lone bare question, the post is skipped (logged as `channel_comment_skip` with reason `incomplete_comment`) instead of receiving a broken comment.

## [3.7.0] - 2026-11-02

### Changed

- **Channel-post comment prompt rewritten from scratch:** the accreted rule list built up over v3.4.1–v3.6.4 (specific-detail anchor, silent who-did-what step, honest first person, catch-first anchor, comparison-as-exception, numbers-relationship anchor, …) kept producing whack-a-mole failures, so it is replaced wholesale by a compact persona-plus-few-shot prompt: a sharp, witty group regular with real taste who spots the one moment everyone will talk about, three worked examples (two Persian, one English) that teach the voice, and a short hard-rules block — write in the post's language, typically 1–3 short lines; always land a real take (a verdict, a prediction, or one line of cause-and-effect — never a bare question or empty amazement); no summaries, no report-speak, no generic lines that could fit any post; first person is opinions only, never invented memories or possessions; a comparison only when it maps exactly and exposes the point. The comment model stays pinned to Qwen3 30B (`@cf/qwen/qwen3-30b-a3b-fp8`); eligibility, ~75% sampling, limits, the ≤5-line code trim, and the no-footer rule are unchanged.

## [3.6.4] - 2026-11-02

### Fixed

- **Channel-post comments:** comparisons are now the exception rather than the default shape. The prompt's earlier wording ("turn it into a vivid picture", "a comparison is welcome ONLY when…") still read as an instruction to produce one, so comments kept forcing decorative metaphors — a 5090 memory-mod post got "replacing 2GB chips with 3GB chips is like changing a bag for a new phone" — while missing the real anchor. The prompt now states the default plainly: a sharp observation or a clear verdict with NO comparison at all (most good comments have none); a comparison survives only when its mapping is exact and it genuinely exposes the point, and if in doubt it is left out. And when a post contains numbers or prices, the sharpest angle is usually the RELATIONSHIP between them — a ratio, a gap, a before/after (that same post: ~$3,200 in chips versus Nvidia's own $16,000 for the same 96 GB) — so the take anchors there when the relationship is striking. All other voice rules (silent who-did-what and most-human-moment step, specific detail, honest first person, earned-anchor catch, short simple sentences, no summary or report-speak, 1–3 lines) are unchanged.

## [3.6.3] - 2026-11-02

### Changed

- **Channel-post comments now run on Qwen3 30B:** the comment call is pinned to `@cf/qwen/qwen3-30b-a3b-fp8` instead of GLM 4.7 Flash, whose Persian output turned to word salad on nuanced, gossip-style posts. Comments are capped at 10/hour in the linked group, so the stronger free model stays affordable there; group reply/mention turns keep the Fast GLM 4.7 Flash pin. The daily Workers AI budget is untouched: the reserve is a flat per-call amount keyed to the Fast response profile, not to the model. The comment prompt also gains a silent comprehension step — first work out who did what to whom and anchor the comment on the post's most human moment (the most embarrassing, funny, or revealing beat); that working-out is never printed, and every existing voice rule (specific detail, honest first person, earned comparisons only, catch-first, short simple sentences, no summary or report-speak, 1–3 lines) still applies.

## [3.6.2] - 2026-11-02

### Fixed

- **Channel-post comments:** the first-person voice is now kept honest and grounded. Fabricated memories and possessions are banned — first person covers opinions and reactions only, never a claim of having owned, bought, used, played, done, or remembered anything. Decorative comparisons that illuminate nothing are banned: a comparison is allowed only when it makes the post's number or point feel real, and a short honest reaction beats a forced metaphor. Sentences must stay short and simple, one idea each. And when a post hides a hedge or catch ("up to" pricing, conditions, "selected users only"), that catch is the preferred anchor for the take.

## [3.6.1] - 2026-11-02

### Changed

- **Channel-post comment voice:** the comment prompt now demands a comment with a soul — written as a smart, witty friend in the group rather than an analyst: first-person voice with feelings and taste allowed, one specific detail from the post turned where possible into a vivid everyday picture or comparison, and one clear personal take. Report-speak is banned outright ("this shows that", "this indicates", "could be improved by", implication lists, neutral explainer tone). Comments are shorter: typically 1–3 lines, with a single emoji allowed when it genuinely fits.

### Restored

- **Typing indicator for group reply/mention turns:** group text and media turns triggered by a reply, mention, or post reply once again send a typing action plus the ~4-second refresher while the answer is generated (the `startTypingRefresher` helper returns with its original contract). Channel-post comments remain typing-free, as they have been since v3.6.0.

## [3.6.0] - 2026-11-02

### Changed

- **Channel-post comments now follow the Mira style:** the comment prompt requires anchoring the comment in at least one specific detail from the post (a number, a name, a concrete fact or consequence), building a short observation or mini-analysis around it, and landing a clear personal take. Generic one-liners and jokes that could fit any post on the topic are explicitly banned, as are summaries. Shape is typically 2–4 lines (5-line cap still enforced in code), in the post's own language, with no footer.

### Removed

- **Typing indicator in groups:** group turns (text, media, and channel-post comments) no longer send any `sendChatAction` — the answer simply arrives. The now-unused `startTypingRefresher` helper is deleted. Private chats keep their existing typing and thinking flow.

## [3.5.5] - 2026-11-02

### Fixed

- **Short-post detection for channel comments:** now measures content amount — characters and words — instead of line count, so long paragraph-style posts are no longer wrongly skipped. A post is short when it has under 200 characters or under 20 words.

## [3.5.4] - 2026-11-02

### Fixed

- **Channel-post comments:** media posts with captions are now commented from their caption; media-only posts without a caption, including photo-only posts, no longer receive comments, superseding the v3.4.0 photo-vision comment.

## [3.5.3] - 2026-11-02

### Fixed

- **Thinking label:** the private-chat thinking text (progress message and Rich draft) now starts with ⏳, so Telegram's animated thinking shimmer can no longer visually swallow the first letter of "IVAI" (it rendered as "VAI thinking..."). The code text was already correct; this is a display-side guard.

## [3.5.2] - 2026-11-02

### Fixed

- **Hard timeouts on AI provider and Telegram API calls:** a stuck provider can no longer stall group replies indefinitely (previously the bot could show "typing" for a long time and never send any message, not even the failure notice). HTTP providers (OpenRouter, Groq, Google) now abort after 15s, Workers AI binding calls time out after 25s, the provider fallback chain stops starting new attempts after an overall 45s deadline and throws so the caller's failure path still runs, and Telegram API calls abort after 15s. Every failed provider attempt is logged immediately as a structured `provider_attempt_failed` event (provider, elapsed ms, truncated error), giving production the diagnostic trail it was missing.

## [3.5.1] - 2026-11-01

### Changed

- **Channel-post comments are sampled and skipped:** only about 75% of eligible channel posts now earn a comment (`GROUP_POLICY.channelPostReplyRate`, decided by a stable hash of the chat and message ids, so the same post always gets the same verdict). Posts with fewer than 5 non-empty lines or under 200 characters of text are skipped, and sticker, GIF/animation, document, video, audio, and voice posts never receive a comment — a caption does not change that. Eligibility and sampling run before the hourly comment bucket, so a skipped post consumes no quota; every skip is logged as a structured `channel_comment_skip` event with its reason (`short_post`, `sampled_out`, or `media_type`). Photo-only posts remain eligible for one vision reply, subject to the same sampling rate.

### Fixed

- **Group typing indicator audited (no behavior change needed):** the v3.5.0 wiring was verified line-by-line in all three group paths (text turns, media turns, channel-post comments): the first typing action is sent immediately when generation starts, the refresher re-sends it every ~4 seconds for the whole generation, `stop()` runs on every exit path (success, AI error, early and unsupported-media returns) and is idempotent with no interval leak, and the action carries the correct comment-thread context. Regression tests now lock this in, including a fake-timer test of the refresher's cadence and stop behavior.

## [3.5.0] - 2026-11-01

### Added

- **Reply-chain memory:** the text/caption of a replied-to message is injected into the model's context for that turn (as an assistant turn for the bot's own messages) and saved with the turn, so follow-ups keep their topic. A channel post and the bot's comment on it seed a shared per-thread Session, and a follow-up sent outside the thread view still continues the thread's Session (the conversation key falls back to the reply target's thread id). Group model context is capped at the last 5 chain messages.

### Changed

- **Group turns are fast and light:** every group AI turn (text, media, and channel-post comments) runs the Fast response profile on the pinned free model `@cf/zai-org/glm-4.7-flash`, overriding the user's stored mode/model for group turns only; private chats are unchanged and provider fallback still applies when the pinned model fails. A typing refresher re-sends the typing action every ~4 seconds while a group answer is generated, since Telegram chat actions expire after ~5 seconds.
- **Channel-post comments must be a real take:** the comment prompt now explicitly forbids summarizing, restating, paraphrasing, or quoting the post and requires a new angle — a witty joke or jab, a critical point, an unmentioned consequence, a comparison, or a prediction — typically 1–3 lines (5-line cap still enforced in code).
- **Group answers follow the triggering message's language:** when the trigger message's script is detectable (e.g. a Persian greeting), the group answer is written in that language, falling back to the user's stored language and then English. UI language and menus are unchanged.
- **No footer anywhere in groups:** the model/mode footer is removed from all group sends — mention/reply answers and media (photo/vision/voice) answers, in addition to channel-post replies. Private chats keep the footer.

### Fixed

- **Model catalog refresh (audited against official provider catalogs on 2026-11-01):** Workers AI `llama-3.1-8b-instruct-fp8-fast` corrected to the real ID `llama-3.1-8b-instruct-fp8` (the old ID does not exist); Groq's retired `qwen/qwen3.6-27b` (shut down 2026-09-14) replaced with `qwen/qwen3.8-27b`; Gemini's superseded `gemini-3.7-flash` replaced with the current flagship `gemini-3.8-flash`, and the superseded `gemini-3.5-flash` and shutdown-announced `gemini-3.1-flash-lite` removed.

## [3.4.1] - 2026-11-01

### Fixed

- **Channel-post replies are now short single comments:** one witty or critical comment of at most 5 short lines (the cap is enforced in code, not only in the prompt) instead of a long Summary/Opinion essay, written in the post's own language (detected from the post text) rather than always English, and sent without the model/mode footer — the footer is also removed from photo-post vision replies. Group mention/reply answers keep their footer.
- **Reply triggers in discussion groups hardened:** the gate now evaluates reply/mention triggers before rejecting bot or anonymous senders, replies made directly on the channel post itself (`post_reply`) trigger the bot at the primary tier, and anonymous group admins posting as the group can trigger by reply/mention (skipping the membership check and per-user quota, which have no user to bind to). Trigger near-misses are logged as structured `group_gate` events for production diagnosis.

## [3.4.0] - 2026-11-01

### Added

- **Group trigger gate:** in groups and supergroups the bot now stays completely silent except for three triggers — a post from the required channel (@ILIVIR3) in its linked discussion group, a reply to one of the bot's messages, or a mention/command addressed to @IVAI_Llm_bot. Ordinary group messages, messages from other bots or anonymous senders, commands addressed to other bots, and edited group messages are ignored with no membership check, session, or quota cost.
- **Channel-post AI summary replies:** each mother-channel post landing in the linked group receives one AI-generated short summary and opinion as a reply to the post (never a fixed template), capped per chat and deduplicated by update.
- **Group media policy:** group media has a dedicated per-chat hourly cap on top of the shared group limits (primary group: 10 media/hour; other groups: 3 media/hour), a photo-only channel post (no text or caption) receives one vision analysis replied to the post under the channel-post cap, and video, video notes, audio/music, documents and other non-text media are ignored completely in groups — no "unsupported" message, no membership check (private-chat behavior unchanged).
- **Two-tier group rate limits:** the linked (primary) group gets a 20-second cooldown and 30 AI replies/hour; other groups get a 120-second cooldown, 5 replies/hour and 30/day, so group traffic cannot burn the free quota.

### Changed

- **English is the true default language:** UI/response language is no longer derived from the Telegram client's `language_code`. New users are stored as English; only an explicit `/lang` choice changes a user's language. Migration `db/0006_reset_language_to_english.sql` performs the one-time reset of all stored languages to English.
- **Group membership prompt is a Rich Message:** a non-member who triggers the bot in a group receives the membership prompt as a Rich Message with the Join/Check buttons inside the message itself (standard message fallback retained). Membership checks are now cached in KV (10 minutes when allowed, 1 minute when denied).
- **Single-message group delivery:** group text replies no longer use a separate "thinking" progress message or edits. A triggered group message gets one typing action and one reply to the trigger message (every part of a long answer stays threaded to the trigger, footer on the last part only); group mode changes only edit the Menu (no standalone confirmation message); group media and channel-post summaries send one typing action before processing.
- **In-message buttons for private entry points:** the membership prompt in every chat, plus the private `/start`, `/menu`, `/help`, `/lang`, `/notify`, `/terminal` and `/models` messages, are sent Rich-first with their keyboards inside the message itself, falling back to the plain message when Rich is unavailable. Group media now counts against the same per-chat group limits/cooldown as group text.

### Fixed

- **Wrangler updated from 4.124.0 to 4.156.0** (lockfile regenerated), clearing the high-severity transitive dependency vulnerabilities (undici, sharp via miniflare) that failed the CI `pnpm audit --audit-level=high` step.
- **Members no longer see stale membership prompts:** a `CHECK_FAILED` membership result is never cached, and any denial served from the KV cache is re-verified with a live `getChatMember` check before a membership prompt is shown (the Check membership button always checks live, as does the IVAI Terminal gate). The Terminal no longer derives or persists a language from the Telegram client's `language_code`.

## [3.3.46] - 2026-08-22

### Fixed

- Completed the Mode/Route separation inside provider execution. Previously, an Auto model route could still choose a provider-specific default model based on the active Response Mode. Automatic model selection is now mode-independent across Workers AI, OpenRouter, Groq and Google; Response Mode affects only the immutable response profile.
- Preserved the free-only, one-call normal path and sequential-on-failure fallback contract. A pinned free model remains preferred exactly as before.

### Tests

- Added a regression that verifies every automatic provider route resolves to the same default model for Auto, Fast, Deep and Code. The validation suite contains 90 passing tests.

### Documentation

- Updated the release and architecture contracts to state that an automatic route is independent of Response Mode at both UI and provider-execution layers.

## [3.3.45] - 2026-08-22

### Changed

- Completed the compatibility follow-up for the Auto architecture across Telegram and Terminal. **Response mode** and **Model route** now appear as independent state: Mode controls answer style/footer; route is `Auto` or `Pinned`.
- Updated Menu, Settings, model picker, model-selection confirmation, `/pick`, `/model off`, and `/debug` so a selected model is explicitly described as a pinned route that does not change Response Mode.
- Added `modelRoute` to the authenticated Terminal settings response and changed the Terminal status chip from ambiguous `MODEL` to explicit `ROUTE`, with `AUTO` or `PINNED · model` state.
- Clarified catalog Fast/Deep/Code controls as model-list filters, not implicit response-mode switches.

### Tests

- Added regressions for Terminal Route chips and `/model off` preserving the active response Mode while returning routing to Auto. The validation suite contains 90 passing tests.

### Documentation

- Updated README, current release status and architecture contract with the Mode/Route invariant and its reset rules.

## [3.3.44] - 2026-08-22

### Fixed

- Isolated every bounded Worker cron step behind a narrow error boundary. Runtime-guard cleanup, broadcast lookup/batches, Secretary reminders and re-engagement now continue independently when another step has a temporary failure.
- Added a compact `cron_step_failure` log with the failing step and sanitized error text, rather than allowing one exception to reject the entire scheduled invocation and skip later work.

### Tests

- Added a scheduled-runtime regression that forces the broadcast lookup to fail and verifies the Worker still runs the Secretary and re-engagement queries. The validation suite contains 88 passing tests.

### Documentation

- Updated README and current release status with the failure-isolated cron contract.

## [3.3.43] - 2026-08-22

### Tests

- Added provider-parity regression coverage for the centralized Auto Response Profile. OpenRouter, Groq, and Google are now verified to receive the same visible Auto Mode, complete-answer instruction, and bounded Auto output limit already enforced for Workers AI.
- Retained the one-call contract in every assertion: each selected provider receives exactly one normal-path request, with no paid route or speculative retry.
- Completed a repository-wide syntax, dependency, free-only, Session/reset, membership, UI/Terminal, footer, model-picker and Telegram fallback check. The validation suite contains 87 passing tests.

### Documentation

- Updated README and current release status with the provider-parity hardening outcome.

## [3.3.42] - 2026-08-22

### Changed

- Added `response-profile.js` as the single source of truth for the response contract. It resolves the visible Mode, mode instruction, bounded output budget, temperature, Workers AI reservation, and Rich Math eligibility once per turn before provider routing begins.
- Refactored every text provider to consume the same immutable Response Profile, preventing Auto/Fast/Deep/Code rules from drifting between Workers AI, OpenRouter, Groq, and Google.
- Preserved the strict v3.3.41 distinction: Auto stays visibly `Auto`; only free model/provider routing is automatic. The normal path remains one AI call, and fallback remains sequential only after a provider failure.
- Aligned Terminal `/app/new` with Telegram `/new`. Both clear their own scoped Session and restore Agent defaults atomically: Auto, no selected model pin, and Memory off. The interface language is retained.
- Updated Terminal localized New Chat messages to accurately describe the shared Agent-default reset.

### Tests

- Added an end-to-end authenticated Terminal reset regression that seeds Code mode, a selected model, enabled Memory, and an old Terminal Session; it verifies no AI call, Auto/no-model/Memory-off settings in the response and D1, and an empty scoped Session.
- Existing Auto/Fast, explicit Deep, provider-fallback, footer, Telegram `/new`, and Terminal tests retain coverage of the centralized contract. The validation suite contains 86 passing tests.

### Documentation

- Updated README, `docs/ARCHITECTURE.md`, and `docs/CURRENT_RELEASE_STATUS.md` with the Response Profile and shared reset contracts.

## [3.3.41] - 2026-08-22

### Changed

- Promoted **Auto** to a strict first-class response Mode. Auto no longer uses content heuristics to silently report Fast, Deep, or Code; a response generated after selecting Auto now remains `Auto` in the result metadata and Telegram footer.
- Kept the automatic part where it belongs: Auto clears any model pin and selects only an eligible free model/provider route. Fast, Deep, and Code are applied only when the user explicitly selects them.
- Increased the bounded one-call output budget to 1,000 tokens for Auto and 900 for Fast. Fast now explicitly asks for a concise, self-contained answer that summarizes rather than stopping unfinished; Auto explicitly asks for a complete, appropriately sized answer.
- Adjusted Workers AI free-budget reservations to remain conservative for the higher bounded Auto/Fast outputs. No paid model, second normal-path AI call, or Premium dependency was added.

### Tests

- Added direct regression coverage proving Auto stays Auto for ordinary, analysis, and code-shaped prompts; Fast stays Fast only after explicit selection; the Auto footer renders `Auto`; and each mode makes exactly one bounded provider call with its own complete-answer instruction. The validation suite contains 86 passing tests.

### Documentation

- Updated README and `docs/CURRENT_RELEASE_STATUS.md` with the first-class Auto architecture and the distinction between response Mode and automatic model/provider routing.

## [3.3.40] - 2026-08-22

### Changed

- Made `/new` a complete fresh-Agent action. It now clears the requested Telegram conversation Session and atomically restores the Agent defaults: `mode=auto`, no selected provider/model, and `memory_enabled=0`.
- Preserved the user’s interface language across `/new`, so a chosen Persian, English, Arabic, or other supported display language is not unexpectedly changed while the AI route returns to the automatic free-only default.
- Updated the localized `/new` message to state the real outcome: context reset, Auto mode, automatic model routing, and Memory off.
- Reused the same reset helper for `/reset` and Settings reset, replacing multiple preference writes with one D1 update.

### Tests

- Replaced the previous `/new` preservation expectation with end-to-end regressions proving a prior Code mode, pinned model, enabled Memory, and old Session become Auto, no model pin, Memory off, and an empty Session without any AI call.
- Added coverage proving `/new` retains the interface language while resetting the Agent settings. The validation suite contains 85 passing tests.

### Documentation

- Updated README and `docs/CURRENT_RELEASE_STATUS.md` with the new `/new` contract and the explicit distinction between Agent defaults and interface language.

## [3.3.39] - 2026-08-22

### Fixed

- Changed Menu mode feedback from an in-place Menu edit to a separate visible Telegram message. After selecting Auto, Fast, Deep, or Code, IVAI now sends the localized confirmation as a reply to the current Menu and then redraws that Menu without burying the result in the edited text.
- Preserved the v3.3.38 Auto-route reset: the standalone Auto confirmation includes `Model route: Auto` after it atomically clears a pinned model.

### Tests

- Updated the Menu mode regression to require a distinct `sendMessage` confirmation, verify its reply target and call order before `editMessageText`, and ensure the refreshed Menu contains no duplicated confirmation. The validation suite contains 85 passing tests.

### Documentation

- Updated README and `docs/CURRENT_RELEASE_STATUS.md` to state the standalone confirmation behavior.

## [3.3.38] - 2026-08-22

### Fixed

- Corrected the ambiguous Mode Auto behavior: `setUserMode(..., "auto")` now atomically clears `selected_model` in the same D1 preference update. A provider/model selected from the picker can no longer silently remain preferred after the user selects Menu Auto or runs `/auto`.
- Kept intentional model choices when selecting Fast, Deep, or Code. The Model Picker's own **Auto route** control continues to clear only the model pin, preserving the separately chosen response mode.
- Added an explicit localized `Model route: Auto` confirmation to Menu Auto and `/auto`; reset flows now rely on the same atomic invariant instead of issuing a duplicate model-clear write.

### Tests

- Extended the Menu mode callback regression to seed a selected provider model, prove Auto clears it, prove Fast/Deep/Code preserve it, and verify the visible Auto-route confirmation.
- Added an end-to-end `/auto` webhook regression that proves the persisted mode becomes Auto, the selected provider model becomes null, and the confirmation is delivered. The validation suite contains 85 passing tests.

### Documentation

- Updated README and `docs/CURRENT_RELEASE_STATUS.md` with the explicit distinction between response Mode Auto and the model picker Auto route.

## [3.3.37] - 2026-08-22

### Fixed

- Treated Telegram's `message is not modified` response from an unchanged `editMessageText` call as an explicit idempotent no-op. Replayed Menu/callback refreshes no longer enter the generic webhook failure path, return HTTP 500, or provoke an unnecessary Telegram retry.
- Kept the handling deliberately narrow: all other Telegram edit failures are re-thrown and retain normal retry/error behavior.

### Tests

- Added a transport regression that simulates Telegram's HTTP 400 no-op response and proves that the edit resolves safely. The focused Start, sticker fallback, model-picker, stale-picker, mode-confirmation and English-footer suite passes 7/7; the full validation suite contains 84 passing tests.

### Documentation

- Added `docs/TELEGRAM_PUBLIC_LAUNCH_MARKETING_CHECKLIST_FA.md`, a manual, permission-first public-introduction checklist for the official channel and third-party Telegram communities. It includes approved factual claims, membership disclosure, anti-spam controls, Go/No-Go gates, 24-hour monitoring and short Persian/English templates; it performs no automatic outreach or posting.
- Updated README and the canonical current-release status with the v3.3.37 operational behavior and marketing-checklist link.

## [3.3.36] - 2026-08-22

### Added

- Every successful Telegram Menu choice of `Auto`, `Fast`, `Deep`, or `Code` now edits the menu with a concise localized confirmation and the active mode before presenting the refreshed controls.

### Tests

- Added an integration regression covering all four user-facing mode callbacks, their confirmation message, and persisted mode preference. The validation suite contains 83 passing tests.

### Documentation

- Added `docs/CURRENT_RELEASE_STATUS.md` as the canonical live-release snapshot and aligned the README, deployment checklist, and historical launch snapshot with current sticker, model-picker, language-footer, mode-confirmation, migration, and optional Main Mini App behavior.

## [3.3.35] - 2026-08-22

### Fixed

- Separated the persistent UI language from the detected response language in Telegram text conversations. A Persian or Arabic prompt may receive a matching-language response and retain active Session continuity, while status text, thinking UI, errors, long-response notices, and the `🪐 IVAI · Model · Mode` footer follow the saved interface language.
- Fixed the English-interface regression where a Persian prompt could localize the `Fast` footer label to `سریع`.

### Tests

- Added a Telegram regression scenario that proves a Persian prompt produces a Persian answer while an English UI keeps the footer label `Fast`. The validation suite contains 82 passing tests.

## [3.3.34] - 2026-08-22

### Fixed

- Replaced fragile catalog-index callback payloads in the Telegram model picker with compact, deterministic tokens derived from each displayed free model ID. A model choice now remains tied to the displayed model even if the free catalog changes while the picker is open.
- Retained compatibility with numeric callbacks already sent by earlier picker messages. If an old or expired picker cannot resolve a model, IVAI now reopens the current picker with a localized explanation instead of silently doing nothing.

### Tests

- Extended the callback regression test to prove that a picker selection persists to `user_preferences`; added stale-token recovery coverage. The validation suite contains 81 passing tests.

## [3.3.33] - 2026-08-22

### Fixed

- Replaced the isolate-level `Math.random()` choice for `/start` stickers with Web Crypto `getRandomValues()` and rejection sampling. Every configured sticker now receives an equal selection probability, including packs whose size does not divide the 32-bit random range.
- Kept the static bot-owned file-ID allow-list and the non-fatal welcome fallback; this correction adds no AI call and no runtime `getStickerSet` request.

### Tests

- Added deterministic boundary and rejection-sampling regression coverage for the random-index selector, while retaining sticker-before-welcome and fallback coverage. The validation suite contains 80 passing tests.

### Documentation

- Added a public Telegram learning section to the README and a Persian learning guide linking the `@ILIVIR3` discovery channel to free, practical IVAI Bot workflows for study, analysis, code practice, and reminders.

## [3.3.32] - 2026-08-22

### Added

- Every `/start` now sends one randomly selected animated sticker from the bot-owned [`IVAILlmBot`](https://t.me/addstickers/IVAILlmBot) pack before the existing welcome message and focused Start keyboard.
- Stored the two current pack `file_id` values in an immutable allow-list, so normal `/start` traffic makes no `getStickerSet` request and no additional AI call.

### Resilience and tests

- Added a context-aware `sendSticker` transport wrapper. Its failure is non-fatal: IVAI logs a compact fallback event and always continues to send the standard `/start` welcome.
- Added regression coverage for allow-listed random selection, sticker-before-welcome ordering, reply context, and welcome delivery after a Telegram sticker failure. The validation suite now contains 80 passing tests.

## [3.3.31] - 2026-08-22

### Fixed

- Seeded every Persian and Arabic paragraph sent through standard `sendMessage` and `editMessageText` with a safe Unicode right-to-left mark after its opening HTML tags. This stabilizes Menu, settings, and fallback messages that begin with an emoji or Latin term such as `IVAI`, while native Rich Messages continue to use Telegram's `is_rtl` field.
- Preserved the existing LTR isolate around the compact `IVAI · Model · Mode` footer, preventing English model metadata from reversing inside RTL replies.
- Rebalanced the three Start-row labels to comparable practical lengths: open menu, open IVAI, and language.

### Tests and documentation

- Added assertions for Start labels and RLM placement in rich HTML paragraphs, including mixed Persian/Latin lines. The validation suite remains at 79 passing tests.
- Added `docs/RTL_BIDI_IMPLEMENTATION_NOTES_2026-08-22.md`, grounded in the Telegram Bot API and Unicode UAX #9.

## [3.3.30] - 2026-08-22

### Fixed

- Hardened Persian-versus-Arabic script detection for short messages. A Persian greeting such as `سلام`, even for a user with a stale English UI preference, now selects Persian instead of being misclassified as Arabic.
- Applied the same language rule in both Telegram chat routing and IVAI Terminal so the two surfaces cannot diverge.

### Tests

- Added a regression scenario for the Persian greeting `سلام` with an English persisted preference. The complete validation suite contains 79 passing tests.

## [3.3.29] - 2026-08-22

### Fixed

- Restored bounded short-term context for every active Telegram and IVAI Terminal Session, including when the optional Memory preference is off. A second turn now receives the immediately preceding user and assistant turns, so facts such as a name remain available during the active Session.
- Corrected language precedence so a Persian-script prompt overrides a stale English preference for the active conversation. The detected language is retained inside the bounded Session, keeping neutral follow-up prompts in the same conversation coherent.
- Corrected Persian-script detection for the common Persian `ی` and `ک` characters, which could previously classify an otherwise Persian message as Arabic.

### Privacy and safety

- Sessions remain isolated by Telegram chat/topic and by Terminal, retain no more than three complete turns, expire after 30 minutes of inactivity, and cannot outlive two hours. `/new`, `/start`, `/memory off`, and `/memory clear` explicitly discard their current Session scope.
- The optional Memory preference no longer suppresses the active Session; it only controls the user preference while the current short-lived conversational context remains available for natural multi-turn use.

### Tests

- Added end-to-end two-turn Persian regression scenarios for both Telegram and IVAI Terminal with Memory Off. They assert the second model call receives the earlier name turn and the Persian language instruction. The validation suite contains 78 passing tests.

## [3.3.28] - 2026-08-22

### Changed

- Simplified the `/new` note at the end of the Menu to one plain-text line. It no longer uses code-style formatting or repeats persistent-setting details.
- Kept the lively bold `/new` confirmation headline and moved its explanatory body into a Telegram blockquote for a cleaner visual hierarchy.

### Tests

- Added regression assertions for the plain Menu note and the bold-headline-plus-quote `/new` Telegram payload. The validation suite remains at 76 passing tests.

## [3.3.27] - 2026-08-22

### Production

- Rotated the Telegram webhook secret in the Worker and refreshed the production webhook without pending updates. The webhook now receives only supported update types, including `guest_message` and `message_reaction`.
- Verified Telegram production capability flags for Inline queries, Guest queries and Business connections. Verified the default IVAI Terminal Menu Button targets the public `/app` URL.
- Recorded the remaining BotFather-only Main Mini App profile setting and a safe client acceptance checklist in `docs/PRODUCTION_CONFIGURATION_STATUS_2026-08-22_FA.md`.

### Fixed

- Synchronized the package metadata version with the application release version, eliminating the stale `3.3.17` package declaration.
- Updated the Telegram feature matrix and README to reflect actual production readiness, the broadcast-claim migration and the current free-only capability boundary.

## [3.3.26] - 2026-08-21

### Fixed

- Hardened broadcast delivery against overlapping scheduled Worker invocations. Each recipient is now conditionally claimed in D1 with a short lease before Telegram delivery, so concurrent jobs cannot select and send the same pending row twice.
- Added `db/0005_broadcast_claims.sql`, which introduces claim-token and lease columns plus a claim index for the broadcast queue. A terminated invocation can recover after the lease expires without duplicating a still-owned send.
- Rejected correctly signed but excessively future-dated Telegram Mini App `initData`. A short 60-second clock-skew allowance remains, while normal one-hour expiry handling is preserved.

### Tests

- Added an overlapping-broadcast regression simulation and signed future-timestamp Mini App rejection coverage. The validation suite contains 76 passing tests.

## [3.3.25] - 2026-08-21

### Added

- Added deterministic Rich Message footnotes for up to eight short, visible `[^id]: note` definitions. Accepted markers link only to IVAI-generated in-message references; missing or invalid definitions remain safe ordinary text.
- Added native Telegram LaTeX rendering for valid inline `$...$`, `$$...$$` and fenced `math` blocks only in Deep and Code responses. Formula processing is deterministic and does not create another AI request.

### Safety

- Math accepts bounded ASCII-LaTeX syntax and a small command allow-list only. Unsafe markup, unsupported commands, excessive input and malformed expressions remain escaped visible text.
- Standard Telegram HTML fallback keeps formulas and footnotes visible without Rich-only tags. No hidden reasoning, source fabrication, arbitrary links or model-supplied HTML is introduced.

### Tests

- Added unit coverage for reference binding, native math, LaTeX injection/command rejection, size limits and standard fallback, plus an end-to-end Deep-mode Rich Message test. The validation suite contains 74 passing tests.

## [3.3.24] - 2026-08-21

### Added

- Added native Rich Message tables for only small, well-formed Markdown tables: at most six columns and twelve body rows. Oversized or malformed table candidates remain ordinary safe text instead of becoming partial Rich tables.
- Added the explicit `/details <prompt>` command. It permits a response to include a visibly user-facing, collapsible `<details>` supplement while retaining the normal answer first.

### Safety

- `/details` never requests or renders hidden reasoning, chain-of-thought, private analysis, policies or instructions. Only a short, visible supplement wrapped in the documented marker pair can become a collapsible block.
- The normal HTML fallback strips details markers into an ordinary bold heading and visible body, preventing a Rich API failure from hiding response content.

### Tests

- Added table dimensions, malformed/oversized fallback, visible-details opt-in, injection and end-to-end `/details` coverage. The validation suite contains 72 passing tests.

## [3.3.23] - 2026-08-21

### Added

- Added a deterministic, allow-listed Rich Markdown renderer for private-chat Rich Messages. It supports headings, fenced code blocks with safe language classes, ordered and unordered lists, visual task lists, horizontal dividers, block quotes, bold text and inline code.
- Added a structured Rich HTML final-message path while preserving the existing ordinary Telegram HTML fallback for draft failures, rich-send failures and long replies.

### Fixed

- Arabic now receives the same `is_rtl` Rich Message treatment as Persian for the draft and final response.
- Rich rendering escapes model output before adding trusted Telegram markup, so model-provided tags and attributes cannot become executable or native Rich HTML.

### Tests

- Added Rich Markdown injection, code/list/divider, Arabic RTL, end-to-end rich-payload and normal-fallback regression coverage. The validation suite contains 70 passing tests.

## [3.3.22] - 2026-08-21

### Fixed

- Terminal chat responses now return the authoritative persisted settings snapshot alongside the generated reply. The UI updates its language, mode, selected model and Memory chip from that snapshot, so a fallback model used for one answer can never be displayed as the user’s selected model.
- Terminal New Chat refreshes the same authoritative settings snapshot before redrawing the workspace, keeping it consistent with preferences changed in Telegram.
- `/memory off` now clears both independent Telegram and IVAI Terminal Sessions as a privacy boundary. Re-enabling Memory starts with fresh context and preserves only language, model and response-mode preferences.

### Tests

- Added regression coverage for Terminal authoritative settings and end-to-end `/memory off` clearing of both scopes. The validation suite contains 66 passing tests.

## [3.3.21] - 2026-08-21

### Changed

- Preserved both official Telegram links in the README introduction: [@IVAI_Llm_bot](https://t.me/IVAI_Llm_bot) and [@ILIVIR3](https://t.me/ILIVIR3).
- Added one concise `/new` explanation at the end of `/menu` in English, Persian and Arabic. The command’s confirmation is now more inviting while explicitly confirming that language, model, response mode and Memory settings remain unchanged.
- Kept the linked `IVAI` word in response metadata exactly as before; Telegram client controls its inline-link decoration and the Bot API provides no styling control to remove underline without removing the link.
- Isolated the compact IVAI/model/mode footer in Persian and Arabic with Unicode bidi controls, preventing right-to-left message layout from reversing the metadata sequence.

### Security

- Hardened the `/admin` Mini App with a fresh CSP nonce for its Telegram bridge script, style and inline bootstrap. It now receives the same strict no-store, same-origin connection and Telegram frame-ancestor protections as IVAI Terminal.

### Tests

- Added coverage for Admin CSP nonce and strict Mini App headers. The validation suite contains 65 passing tests.

## [3.3.20] - 2026-08-21

### Added

- Introduced short-lived, independent conversation Sessions in KV. Opt-in context retains at most three complete turns, expires after 30 minutes of inactivity, and has a hard two-hour lifetime even during continuous conversation.
- Added `/new` for a clean Telegram conversation Session. `/start` now begins the same clean Session after the required membership gate, while preserving language, model, response mode and the Memory preference.
- Added a localized **New Chat** control to IVAI Terminal, backed by an authenticated `/app/new` endpoint. Terminal memory remains a separate per-user scope from the Telegram chat.

### Changed

- Replaced reply-based memory segmentation with topic-only Session segmentation, so replying to a private-chat message no longer fragments a user’s context.
- Kept one successful AI path per prompt, with no AI call for `/new`, `/start`, Session expiry or Session reset. KV TTL and request-time validation handle cleanup without a polling job or Cron.
- Guarded Session saves with the active Session ID, so a delayed response that began before `/new` or `/start` cannot resurrect discarded context after the reset.

### Tests

- Added deterministic coverage for 30-minute idle expiry, two-hour absolute expiry, Terminal/Telegram Session isolation, `/new` reset and `/start` reset. The suite contains 65 passing tests.

## [3.3.19] - 2026-08-21

### Changed

- Made every provider control in the inline AI model picker blue and every All/Fast/Deep/Code filter red. The active scope retains an explicit ✓ indicator, so its selection remains clear without relying on a third color.
- Made [@IVAI_Llm_bot](https://t.me/IVAI_Llm_bot) the prominent public entry point in the repository README. The technical Mini App deployment value now refers to `APP.terminalAppUrl` rather than displaying the Worker URL.

### Tests

- Added assertions that all provider controls are blue and all model-scope filters are red. The existing selected-model assertion remains in place.

## [3.3.18] - 2026-08-21

### Fixed

- Isolated D1 preference setters for response mode, selected model and memory. Each setter now creates a default preference row only when absent, then updates only its own column; an independent preference write can no longer reset the other stored settings.
- Preserved the existing explicit-language behavior: an explicitly chosen language remains authoritative when later Telegram updates expose a different account locale.

### Tests

- Added two stateful D1 regression scenarios covering sequential preference writes, opposite first-write ordering, a Persian language selection, later English Telegram metadata, selected-model changes and memory toggles. The suite contains 58 passing tests.

## [3.3.17] - 2026-08-21

### Fixed

- Replaced Gemma 4 with Llama 4 Scout as the primary Workers AI vision route. A live account test showed that Gemma 4 can consume its bounded completion on reasoning-only output without returning user-visible text, while Llama 4 Scout returned a completed visible image description with IVAI's existing OpenAI-compatible image data-URL request shape.
- Retained Gemma 4 only as a free-tier vision fallback, reduced photo output from 900 to 320 tokens, and preserved the 1,000-unit conservative image reservation.

### Verified

- Confirmed live compatibility of Llama 4 Scout, Gemma 4 and Whisper Large V3 Turbo request routes without accessing any user media. The Whisper test used a synthetic short WAV and correctly reached the model, which rejected it as no speech.
- Recorded official Workers AI capabilities, pricing, 10,000-Neuron daily free allocation and selection rationale in `docs/MULTIMODAL_MODEL_AUDIT_2026-08-21.md`.

### Tests

- Added regressions for reasoning-only vision responses, OpenAI-compatible visible vision content, image output bounds, voice payload shape and the selected free model. The suite contains 56 passing tests.

## [3.3.16] - 2026-08-21

### Verified

- Completed a mapped, end-to-end debug review of the Worker, webhook security, required-channel gate, Telegram UX, free-model policy, media, D1/KV state, Mini App, admin API, background jobs and production deployment.
- Confirmed the deployed Worker health route, public IVAI Terminal shell, production `*/10 * * * *` schedule, D1 `ivai_db` binding, KV `IVAI_KV` binding and aggregate operational state through read-only Cloudflare checks.

### Tests

- Added regression coverage for oversized Telegram media and the guarded Workers AI voice/photo paths. Oversized metadata is rejected before a binary download and each supported medium uses exactly one guarded Workers AI call.
- Added `docs/DEBUG_PLAN_2026-08-21.md` and its rendered debug map, recording the scope, evidence and result for every review area. The suite contains 54 passing tests.

## [3.3.15] - 2026-08-21

### Fixed

- Hardened the 15-day re-engagement cron claim against overlapping Scheduled Event executions. The code now trusts D1's atomic affected-row result instead of reading the lease back after the write, preventing a second concurrent execution from mistaking an identical lease for its own claim.
- Preserved the existing free, no-AI-message behavior: a batch claims at most five eligible inactive users, sends localized Telegram text only, respects `/notify off`, and waits at least 15 days between successful check-ins.

### Tests

- Added a concurrent-cron simulation at the same timestamp. It proves exactly one re-engagement delivery is sent when two overlapping jobs see the same eligible user. The suite contains 52 passing tests.

## [3.3.14] - 2026-08-21

### Changed

- Rebuilt the free-model picker into a provider-aware control surface. Every model now carries its provider marker: 🟣 Cloudflare Workers AI, 🔵 OpenRouter Free, 🟠 Groq or 🟢 Google Gemini, plus a Fast, Deep or Code use-case marker.
- Added first-class provider filters and Fast/Deep/Code filters. Pagination, selected-state highlighting and the active filter remain intact while users browse and select models.
- Added a provider-and-use-case selection summary after every choice, including known context length where the catalog exposes it. The selected model is explicitly described as preferred rather than guaranteed; ordered free fallback remains active.
- Expanded the conservative static allowlist with verified non-paid-only Workers AI options across GPT-OSS, Llama and Qwen families, plus Gemini 3.5 Flash. The existing dynamic OpenRouter admission rule continues to require zero pricing metadata for every exposed `:free` model.

### Safety

- Excluded Cloudflare models documented as paid-only, including GLM 5.2 and Kimi K2.6/K2.7 Code. The Worker continues to reserve below the published 10,000-Neuron daily free allocation and makes one successful provider call per request.

### Tests

- Added regression coverage for colored provider controls, provider filtering, advanced callback data, selected-model detail text and the expanded allowlist. The suite contains 51 passing tests.

## [3.3.13] - 2026-08-21

### Changed

- Simplified `/start` by removing the free-route and invitation footer. Its three controls are now Menu, IVAI Terminal and Language, with the Terminal button centered.
- Expanded `/menu` from a status-only surface into a concise operating guide. It retains live mode, model and memory state while explaining Auto, Fast, Deep, Code, Terminal, model priority, memory and language controls.
- Restored the Code response mode to the primary Menu. Auto now occupies its own first blue row; Fast, Deep and Code appear together in the following blue row; Terminal remains green, model selection remains red, and supporting controls remain neutral.
- Configured Telegram's default private-chat Menu Button as the IVAI Terminal Mini App using a KV-cached `setChatMenuButton` call. Inline Terminal buttons remain available as an additional launch path.

### Fixed

- Replaced the language-only `UPDATE` with an atomic D1 upsert, so a selected language persists even when the user first arrives through the required-channel Join callback and has no existing user row.
- Created the durable user record after a verified membership callback before subsequent menu actions are handled.

### Tests

- Added regression coverage for language upsert, Menu Button configuration, the centered Terminal Start button, the five-row response-mode hierarchy and the descriptive Menu. The suite contains 51 passing tests.

## [3.3.12] - 2026-08-21

### Changed

- Synchronized the public IVAI Terminal Mini App with the v3.3.11 control language: localized English, Persian and Arabic copy; a current-language flag chip; compact selected-model display; and live mode, model, language and memory updates after every successful turn.
- Replaced plain Mini App message insertion with a safe DOM renderer for escaped blockquotes, bold text and inline code; it never inserts untrusted model output through `innerHTML`.
- Localized required-channel membership, reconnect and retry states in the Terminal while retaining the existing server-side Telegram `initData` validation and same-origin API boundary.
- Preserved safe Telegram HTML formatting for long bot replies by splitting raw model output before rendering each chunk, then appending the linked IVAI response metadata only to the final chunk.

### Tests

- Updated Terminal shell and bootstrap regression checks for the DOM renderer, language state and compact-model helpers.
- Updated long-response regression coverage to require safe Telegram HTML delivery, bounded message chunks and exactly one final metadata block. The suite contains 50 passing tests.

## [3.3.11] - 2026-08-21

### Changed

- Redesigned `/start` as a concise capability overview with only three inline controls: Auto, Language and IVAI Terminal.
- Rebuilt `/menu` into a status-first control surface. It now displays active response mode, selected model and memory state without a color legend.
- Reordered the main keyboard: Auto/Fast/Deep in the first blue row; Terminal alone in green; Pick model alone in red; Help, Settings and Language in the final neutral row.
- Added country flags to the language picker and current-language header.
- Simplified Help copy into a short practical guide instead of a dense command catalog.

### Rich formatting

- Retained native Rich Message/Rich Draft delivery when Telegram supports it and the existing safe HTML fallback otherwise.
- Added safe conversion of AI lines beginning with `>` into Telegram HTML blockquotes after escaping all untrusted model output.
- Used native Telegram HTML headings, code and blockquotes for concise Start, Help and response metadata presentation.

### Tests

- Added UI regression coverage for the three-button Start screen, four-row Menu hierarchy, live Menu status, language flags and rich introductory copy. The suite now contains 50 passing tests.

## [3.3.10] - 2026-08-21

### Fixed

- Reworked the `Check membership` callback so a failed Telegram verification no longer attempts to edit the same Join message, which Telegram rejects as `message is not modified` and made the button appear non-functional.
- The callback now keeps the Join prompt unchanged and shows a localized Telegram alert explaining whether the user is not yet confirmed or the bot cannot verify the channel.
- A successful verified member callback still changes the prompt exactly once to the normal IVAI welcome controls, without showing Join/Recheck again.

### Tests

- Added callback regression coverage for verified membership and verification failure; the suite now contains 49 passing tests.

### Operational requirement

- The canonical channel remains `-1003162460662` / `@ILIVIR3`. `@IVAI_Llm_bot` must be an administrator of that same channel so Telegram can verify ordinary members.

## [3.3.9] - 2026-08-21

### Fixed

- Fixed the broadcast queue so an active campaign continues seeding eligible recipients after entering `sending`, rather than being limited to its first 250 recipients.
- Added a stable campaign snapshot boundary: users created after confirmation are excluded from that in-flight campaign, while repeated cron runs idempotently seed the remaining confirmed audience.
- Added bounded retry behavior for transient broadcast delivery failures: blocked chats are final immediately; other failures retry up to three total delivery attempts before becoming terminal failures.
- Hardened legacy feedback callbacks against malformed KV content, invalid scores, cross-user or cross-chat replay, and replay of an already-consumed token.
- Added a fail-closed fallback from the canonical numeric channel ID to `@ILIVIR3` only when Telegram rejects the numeric lookup. A verified `member` response now always proceeds directly without Join/Recheck UI.
- Removed duplicate unreachable callback branches and unused feedback-token writer code from the Telegram router.

### Changed

- Modernized CI around the pinned pnpm version, a frozen lockfile install, pnpm-store cache, full regression validation and high-severity dependency audit. CI now installs pnpm before resolving the pnpm cache.
- Enabled Dependabot alerts and automated security fixes, added npm/pnpm dependency updates alongside GitHub Actions updates, and strengthened `main` protection with required checks, code-owner review, stale-review dismissal, linear history and resolved conversations.
- Moved the preserved v3.2 single-file reference into `legacy/` so the modular `src/index.js` production entrypoint is unambiguous.

### Tests

- Added broadcast regression coverage for recipient pagination, confirmation-time snapshot boundaries, transient retry recovery and terminal failure after three attempts.
- Added Secretary retry-boundary coverage, member/no-join and numeric-ID/username membership fallback coverage, and expanded the suite to 47 passing tests.

## [3.3.8] - 2026-08-21

### Fixed

- Fixed a production-blocking syntax error in IVAI Terminal's generated inline bootstrap. The defect held the Mini App in `CONNECTING` and prevented all session, join/reconnect, and chat UI behavior from starting.
- Added a regression test that compiles the fully rendered Terminal bootstrap, catching template-literal escaping errors that a source-only JavaScript syntax check cannot detect.

### Verified

- Reviewed public Terminal security headers, unauthenticated API rejection, method controls, recovery UX, and dependency audit status.

## [3.3.7] - 2026-08-21

### Added

- Added mandatory membership enforcement for `@ILIVIR3` (`-1003162460662`) before text, media, inline, guest, callback and IVAI Terminal AI access.
- Added a fail-closed `getChatMember` guard, Join channel / Check membership controls, explicit Terminal `JOIN REQUIRED` state and no-AI rejection path for non-members.
- Added regression coverage for non-member bot and authenticated Terminal requests, plus a Persian operational guide for required channel access.

### Operational requirement

- `@IVAI_Llm_bot` must be an administrator in `@ILIVIR3` so Telegram membership checks are reliable.

## [3.3.6] - 2026-08-21

### Fixed

- Reworked IVAI Terminal session states so missing, rejected, timed-out and temporarily unavailable connections show a clear recovery message and a user-controlled reconnect action instead of an indefinite connecting state.
- Added a bounded 45-second client request timeout and kept retries explicit; no polling, background model call or paid route was added.
- Added minimal safe runtime diagnostics for rejected Mini App authentication without logging the signed `initData` itself.

### Changed

- Rebuilt the Terminal as a polished navy/deep-blue/jade AI workspace with connection status, welcome guidance, suggestion chips, message bubbles, accessible composer and responsive mobile layout.
- Separated `/start` from `/menu`: `/start` is now the onboarding and quick-launch surface, while `/menu` is the dedicated controls dashboard.
- Reordered and colored inline controls consistently: blue for main routing, green for active/quick actions and red only for destructive actions.
- Added regression coverage for the separate start/menu flows and Terminal reconnect affordances; the suite now contains 38 passing tests.

## [3.3.5] - 2026-08-20

### Fixed

- Released the update-deduplication claim and returned a retryable response when webhook processing fails, preventing a transient downstream failure from being silently acknowledged and permanently suppressing that update.
- Made `/memory clear`, `/reset`, and settings reset clear the separate opt-in IVAI Terminal memory as well as the current chat memory.
- Corrected the admin Workers AI remaining-budget metric to use the same enforced 8,000-Neuron guard as runtime quota control.
- Added regression coverage for webhook retry release, Terminal-memory deletion, and the consistent budget metric; the suite now contains 37 passing tests.

## [3.3.4] - 2026-08-20

### Changed

- Added the private-chat IVAI Terminal Web App button directly to `/start`, `/menu`, and `/help`, while keeping group menus free of private-only Web App controls.
- Updated the help copy and callback return paths so the Terminal entry point remains visible after normal private-chat navigation.
- Added regression coverage for private versus default menu behavior; the suite remains at 34 passing tests.

## [3.3.3] - 2026-08-20

### Added

- Added `/terminal`, a private-chat command that sends a Telegram Web App button for opening IVAI Terminal directly from the conversation.
- Kept the terminal launch flow free-only and AI-free: opening the button does not invoke a provider, consume a text quota, or create a transcript record.
- Added regression coverage for the private-chat Web App button; the suite now contains 34 passing tests.

## [3.3.2] - 2026-08-20

### Added

- Added **IVAI Terminal**, a lightweight user-facing Telegram Mini App at `/app` with a navy, deep-blue, and jade terminal interface.
- Added same-origin `/app/session` and `/app/chat` endpoints that use server-validated Telegram `initData`, existing user settings, shared text quota, and the established free-only sequential AI pipeline.
- Added a shared `webapp-auth.js` module so admin and public Mini App requests use one server-side HMAC validation implementation.
- Added a repeatable local Worker development toolchain with Wrangler 4, a committed pnpm lockfile, and a narrow pnpm build allowlist for `esbuild` and `workerd`.
- Added Terminal security/API/UI tests; the foundation suite now covers 33 passing tests.

### Security

- Added strict no-store, same-origin connect, content-type, referrer, permissions, and nonce-based CSP headers to the public Terminal shell.
- The public terminal never trusts a browser-supplied user identifier, never renders user/model text through `innerHTML`, and keeps transcripts local unless the existing opt-in memory setting is enabled.

## [3.3.1] - 2026-08-20

### Changed

- Refreshed the provider policy against current official provider documentation while preserving the free-only contract.
- Replaced Groq's retired `llama-3.1-8b-instant` with active GPT-OSS 20B, GPT-OSS 120B, and Qwen 3.6 27B production-model routes.
- Added current Workers AI text, vision, and Whisper Turbo options; explicitly excluded paid-only Workers AI frontier models such as GLM 5.2.
- Added current Gemini Flash and Flash-Lite free-tier options without Google Search grounding, Maps, media generation, or paid-only models.
- Replaced OpenRouter's fragile fixed model IDs with the official `openrouter/free` router for automatic fallback. The refreshed picker admits dynamic `:free` entries only after zero-price metadata and text-chat capability checks.
- Converted the Worker AI quota guard to a conservative 8,000-Neuron daily reservation budget, leaving a 20% buffer below Cloudflare's 10,000-Neuron free allocation.

### Security

- A model selected from an OpenRouter cache must now exist in the verified catalog; the old suffix-only selectability rule was removed.

## [3.3.0] - 2026-08-20

### Added

- Secure Telegram webhook validation, atomic update deduplication, user rate controls, and a daily Workers AI budget guard.
- A free-only provider policy with Workers AI as the primary provider and sequential OpenRouter `:free`, Groq, and Google AI Studio fallbacks.
- Three practical chat modes: **Auto**, **Fast**, and **Deep**, together with a paginated free-model picker and selected-model lock.
- Rich Draft and Rich Message delivery with standard Telegram message fallback, context-safe handling of Business and thread replies, and compact linked IVAI response metadata.
- Inline Mode, Guest AI replies, reaction feedback, voice transcription, and image understanding guards.
- D1-backed administration, draft/preview/confirm broadcast workflow, audit logging, and a responsive Telegram Mini App administration shell.
- Secretary tasks with `/task`, `/tasks`, `/done`, and `/cancel`, delivered through a small cron batch.
- Consent-controlled inactive-user check-ins. A user can pause or re-enable check-ins using `/notify off` and `/notify on`.
- English-first language selection with Persian as the second language and Arabic, Spanish, Turkish, Russian, Portuguese (Brazil), Indonesian, Hindi, French, and German as optional choices.
- Production migrations for core storage, runtime guards, Secretary reminders, and re-engagement state.

### Changed

- Modernized menus with semantic Telegram button colors, responsive pagination, and clearer mode/model navigation.
- Preserved the original v3.2 interaction approach while separating routing, providers, Telegram rendering, storage, security, broadcast, Secretary, and re-engagement responsibilities into dedicated modules.

### Security

- Credentials are loaded exclusively from Cloudflare Worker Secrets and are excluded from the repository.
- Administration endpoints validate Telegram Mini App `initData` server-side and reject unsupported methods.

## [3.2.0]

- Baseline IVAI bot experience on which the v3.3 modular modernization is built.

[3.3.17]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.16...v3.3.17
[3.3.16]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.15...v3.3.16
[3.3.15]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.14...v3.3.15
[3.3.14]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.13...v3.3.14
[3.3.13]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.12...v3.3.13
[3.3.12]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.11...v3.3.12
[3.3.11]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.10...v3.3.11
[3.3.10]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.9...v3.3.10
[3.3.9]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.8...v3.3.9
[3.3.8]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.7...v3.3.8
[3.3.7]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.6...v3.3.7
[3.3.6]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.5...v3.3.6
[3.3.5]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.4...v3.3.5
[3.3.4]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.3...v3.3.4
[3.3.3]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.2...v3.3.3
[3.3.2]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.1...v3.3.2
[3.3.1]: https://github.com/ILIV007/IVAI-bot/compare/v3.3.0...v3.3.1
[3.3.0]: https://github.com/ILIV007/IVAI-bot/compare/12936cb...593ea80
[3.2.0]: https://github.com/ILIV007/IVAI-bot

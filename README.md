

https://t.me/IVAI_Llm_bot
(https://t.me/ILIVIR3)
# 🤖 IVAI Bot v30.1 — Clean Edition

> **Minimal UI. Maximum power.**  
> A bilingual (EN/FA), triple-provider AI Telegram bot with auto-updating models, intelligent fallback, and polished UX.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat&logo=cloudflare)](https://workers.cloudflare.com)
[![Multi-Provider](https://img.shields.io/badge/Providers-3%20%7C%20OpenRouter%20%2B%20Groq%20%2B%20Google-blueviolet?style=flat)](https://openrouter.ai)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-2CA5E0?style=flat&logo=telegram)](https://core.telegram.org/bots)
[![Languages](https://img.shields.io/badge/Languages-EN%20%7C%20FA-yellow?style=flat)](README.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ What's New in v30.1

### 🧹 Clean, Focused UI
> Less clutter. More clarity.

- **No version numbers** in start screen — just essential info
- **Real blockquote footer**: Telegram-native `<blockquote>` for response metadata
  ```
  Your answer here...

  🤖 Qwen3 Coder | ⏱ 2.3s | 🔄 2 models
  ```
- **Simplified start screen**: 3 sections only — Superpowers, Providers, CTA
- **Consistent HTML formatting**: No more Markdown/HTML conflicts

### 🌍 Bilingual by Design (EN / FA)
> Built for global users, starting with English and Persian.

```javascript
// Automatic language detection + manual override
const lang = await getLang(userId, env); // "en" or "fa"

// All UI strings centralized
STRINGS.fa.start_title = "🤖 IVAI"
STRINGS.en.start_title = "🤖 IVAI"

// Commands work in both languages
/lang → Language picker inline keyboard
```

**Supported languages:**
| Code | Name | Flag |
|------|------|------|
| `en` | English | 🇬🇧 |
| `fa` | فارسی | 🇮🇷 |

### 🔧 Groq API — Finally Fixed
> No more `400 Bad Request` or context overflow errors.

**Key fixes:**
```javascript
// 1. Context truncation for Groq's 12K char limit
function truncateMessagesForGroq(messages) {
  // Keeps most recent messages + system prompt
  // Drops oldest if over CONFIG.GROQ_MAX_CONTEXT_CHARS
}

// 2. Conditional max_tokens (some Groq models don't support it)
if (model.supportsMaxTokens !== false) {
  payload.max_tokens = Math.min(model.tokens, CONFIG.GROQ_MAX_TOKENS);
}

// 3. Better error handling for 400/413/429
if (res.status === 400) throw new Error(`400: ${text.substring(0, 200)}`);
if (res.status === 413) throw new Error("413: Request too large");
```

**Result**: Groq models now work reliably as ultra-fast fallback.

### 🔄 Auto-Update Model List
> Stay current without redeploying.

```
Every 15 days (cron trigger):
1. Fetch https://openrouter.ai/api/v1/models?limit=1000
2. Filter :free models only
3. Auto-categorize by params/context/keywords:
   • "coder"/"laguna" → Code
   • "reason"/"hermes"/params≥30B → Deep  
   • else → Fast
4. Save to KV with 15-day TTL
5. Hot-reload into FAST_MODELS/DEEP_MODELS/CODE_MODELS
```

**Manual refresh**: `/refreshmodels` command for admins.

### 🎯 Proper Footer with Blockquote
> Clean metadata that doesn't interfere with content.

**Before** (Markdown, could break formatting):
```
Your answer...

🏆 Qwen3 Coder ⏱ 2.3s (2 models)
```

**Now** (HTML blockquote, Telegram-native):
```html
Your answer...

<blockquote>🤖 <b>Qwen3 Coder</b> | ⏱ 2.3s | 🔄 2 models</blockquote>
```

✅ Renders as a subtle, non-intrusive footer in Telegram  
✅ Never breaks code blocks or lists  
✅ Works with both Markdown input and HTML output

---

## 🧩 Feature Overview

| Category | Feature | Benefit |
|----------|---------|---------|
| **🌐 Providers** | OpenRouter 🔵 + Groq 🔴 + Google 🟢 | 99.9% uptime via intelligent fallback |
| **🌍 Languages** | English + Persian (FA/EN) | Native UX for two major user bases |
| **🎛 Modes** | `/fast` • `/deep` • `/code` • `/prompt` • `/auto` | Context-aware response optimization |
| **🤖 Models** | 29 verified + auto-updating | Always fresh, zero dead endpoints |
| **🎨 UI** | Clean start screen • Blockquote footer • Color-coded keyboards | Intuitive, scannable, professional |
| **⚡ Reliability** | Groq context fix • Circuit breaker • Retry logic | Works even when APIs hiccup |
| **🔧 Tools** | `/debug` • `/lang` • `/refreshmodels` • Stats | Full control and observability |

---

## 📦 Prerequisites

- ✅ **Cloudflare Account** (Free tier: 100K requests/day)
- ✅ **OpenRouter API Key** ([Get Key](https://openrouter.ai/keys))
- ✅ **Groq API Key** ([Get Key](https://console.groq.com/keys)) — *optional but recommended*
- ✅ **Google AI Studio API Key** ([Get Key](https://aistudio.google.com/app/apikey)) — *optional*
- ✅ **Telegram Bot Token** ([Create via @BotFather](https://t.me/BotFather))
- ✅ **Node.js 18+** & **npm** (for local development)

---

## 🚀 Quick Start

### Step 1: Clone & Install
```bash
git clone https://github.com/yourusername/ivai-bot-v30.git
cd ivai-bot-v30
npm install -g wrangler
```

### Step 2: Configure `wrangler.toml`
```toml
name = "ivai-bot-v30"
main = "index.js"
compatibility_date = "2024-05-01"

[[kv_namespaces]]
binding = "IVAI_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

[triggers]
crons = ["0 0 */15 * *"]  # Every 15 days for auto-update + reminders
```

### Step 3: Set Environment Variables
In **Cloudflare Dashboard** → Workers & Pages → `ivai-bot-v30` → Settings → Environment Variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ Yes | Your Telegram bot token |
| `OPENROUTER_API_KEY` | ✅ Yes | Primary provider API key |
| `GROQ_API_KEY` | ⚠️ Recommended | Ultra-fast fallback provider |
| `GOOGLE_API_KEY` | ⚠️ Recommended | Long-context fallback provider |
| `LOG_LEVEL` | ❌ Optional | `info` or `debug` for logging |

> 💡 **Tip**: Deploy with only OpenRouter first. Add Groq/Google keys later — fallback logic auto-detects availability.

### Step 4: Deploy
```bash
npx wrangler login    # One-time auth
npx wrangler deploy   # Push to Cloudflare
```
> Note your Worker URL: `https://ivai-bot-v30.your-subdomain.workers.dev`

### Step 5: Set Telegram Webhook
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://ivai-bot-v30.your-subdomain.workers.dev"}'
```

✅ **Done!** Open your bot on Telegram and tap `/start`.

---

## 🎮 How to Use

### 🌍 Language Selection
```
/lang → Shows inline keyboard:
🇬🇧 English
🇮🇷 فارسی

Tap to switch. Language persists per user.
```

### 🎚 Mode Selection (Color-Coded)
```
🟢 Fast    → Quick answers (Groq preferred for speed)
🔴 Deep    → Analysis & reasoning (OpenRouter deep models)  
🔵 Code    → Programming tasks (OpenRouter code-specialized)
🎯 Prompt  → Transform ideas into pro prompts (Lyra engine)
🔀 Auto    → IVAI detects best mode automatically
```

### 🎛 Model Control
1. Tap **🎛 Pick Model** or type `/model`
2. Browse models with provider colors:
   ```
   🔵 🚀 Llama 3.2 3B
   🔴 ⚡ Groq Llama 70B  
   🟢 🟢 Gemini 2.5 Pro
   ```
3. Tap to lock, or use `/model off` to return to auto

### 🔄 Auto-Update in Action
- Every 15 days: Worker fetches latest `:free` models from OpenRouter
- New models auto-categorized and added to pools
- No redeploy needed
- Admins can force refresh: `/refreshmodels`

### 📝 Response Footer Format
Every response ends with a clean blockquote footer:
```html
<blockquote>🤖 <b>Model Name</b> | ⏱ 2.3s | 🔄 2 models</blockquote>
```
Renders in Telegram as:
> 🤖 **Model Name** | ⏱ 2.3s | 🔄 2 models

---

## 🗄️ Architecture Overview

```
User Message (EN/FA)
     │
     ▼
[Language Detection] → Load STRINGS[lang]
     │
     ▼
[Provider Router] → OpenRouter → Groq → Google → Emergency
     │
     ▼
[Groq Fix Layer] → truncateMessagesForGroq() + conditional max_tokens
     │
     ▼
[Parallel Race] → 3 models from different groups
     │
     ▼
[First Valid Response] → Return + cache + append blockquote footer
```

### KV Storage Schema (v30.1)
| Key Pattern | Purpose | TTL |
|-------------|---------|-----|
| `mode:{userId}` | Active conversation mode | None |
| `model:{userId}` | Manually selected model ID | None |
| `lang:{userId}` | User's language preference | None |
| `mem:{userId}` | Conversation history (last 5) | 1 hour |
| `cache:{hash}` | Cached API responses | 2 hours |
| `failed:{modelId}` | Circuit breaker per model | 30 seconds |
| `last_active:{userId}` | Last user activity | 15 days |
| `models_data` | Dynamically fetched model list | 15 days |
| `models_updated` | Timestamp of last auto-update | 15 days |

### Groq-Specific Handling
```javascript
// Context limit: 12,000 characters total
CONFIG.GROQ_MAX_CONTEXT_CHARS = 12000

// Token limit: varies by model (4K-8K)
CONFIG.GROQ_MAX_TOKENS = 8192

// Some models don't accept max_tokens parameter
{ supportsMaxTokens: false } // e.g., Llama 4 Scout
```

---

## 💰 Cost Estimate

| Provider | Free Tier | Paid Usage | Best For |
|----------|-----------|------------|----------|
| **🔵 OpenRouter** | 29 `:free` models | ~$0.10-10/million tokens | Primary pool, variety |
| **🔴 Groq** | Limited free tier | ~$0.40/million tokens | Speed-critical fallback |
| **🟢 Google AI Studio** | 60 req/min free | Pay-as-you-go after | Long-context fallback |
| **Cloudflare Workers** | 100K req/day | ~$0.30/million requests | Hosting infrastructure |

> 💡 **Optimization Strategy**:  
> 1. Use `:free` OpenRouter models for 90% of traffic  
> 2. Enable Groq/Google only as fallback (reduces paid usage)  
> 3. Cache identical queries (2-hour TTL)  
> 4. Monitor usage per provider in `/debug`

---

## 🧪 Testing Checklist

Before going live:
- [ ] `/start` displays clean UI without version clutter
- [ ] `/lang` shows EN/FA picker and persists selection
- [ ] Persian users see FA strings; English users see EN strings
- [ ] Groq models respond without `400`/`413` errors
- [ ] Long conversations auto-truncate for Groq context limit
- [ ] Response footer renders as blockquote (not raw HTML)
- [ ] `/refreshmodels` fetches and applies new model list
- [ ] Auto-update cron triggers every 15 days (test with `X-Cron` header)
- [ ] `/debug` shows provider availability and language status

---

## 🔐 Security & Best Practices

1. **Never commit API keys**: Use Cloudflare Environment Variables exclusively
2. **Input sanitization**: All user inputs truncated before API calls
3. **Error isolation**: API errors never expose keys or internal paths
4. **User data isolation**: KV keys are user-scoped (`{userId}`)
5. **Rate limit awareness**: Each provider has separate limits — monitor via `/debug`

### Recommended Monitoring
```bash
# Track provider success rates
npx wrangler tail | grep "provider"

# Alert on Groq context errors (indicates truncation needed)
npx wrangler tail | grep "413\|400.*Groq"
```

---

## 🤝 Contributing

Contributions welcome! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feat/add-language-es`
3. **Commit** changes: `git commit -m 'feat: add Spanish language support'`
4. **Push** and **Open a Pull Request**

### Adding a New Language (Guide)
To add a 3rd language (e.g., Spanish):
```javascript
// 1. Add to STRINGS object
STRINGS.es = {
  start_title: "🤖 IVAI",
  send_anything: "¡Envíame lo que quieras! 👋",
  // ... all other keys
};

// 2. Add to SUPPORTED_LANGS array
const SUPPORTED_LANGS = [
  { code: "en", name: "🇬🇧 English", flag: "🇬🇧" },
  { code: "fa", name: "🇮🇷 فارسی", flag: "🇮🇷" },
  { code: "es", name: "🇪🇸 Español", flag: "🇪🇸" }  // ← New
];

// 3. Update getLang() fallback logic if needed
// 4. Test with /lang command
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Groq returns `400 Bad Request` | Verify `truncateMessagesForGroq()` is active; check `supportsMaxTokens` flag |
| Footer shows raw `<blockquote>` | Ensure `parse_mode: "HTML"` in `sendRaw()`; Telegram client must support blockquotes |
| Language doesn't persist | Check `CONFIG.KV.LANG` key pattern; verify KV namespace binding |
| Auto-update not fetching models | Test `fetchModelsFromOpenRouter()` manually; check network permissions in Cloudflare |
| Persian text displays LTR | Ensure `langNote` is appended to system prompt; verify model supports FA output |

### Debug Mode (`/debug`)
Shows real-time status in user's language:
```
🔧 Debug v30

👤 User | 🎚 Mode: AUTO
📈 Requests: 142 (✅128|❌9|💾23)
⏱ Avg: 3.2s | 🧠 Memory: 5msg

🌐 Models: 29/29 avail
🔌 Circuit (30s):
• Llama 3.2 3B: 1f

⚡ Parallel: 3 groups | 25s timeout | 30s circuit
🔵 OpenRouter | 🔴 Groq | 🟢 Google
```

### Need Help?
1. Check `/logs` for provider-specific errors
2. View Cloudflare logs: `npx wrangler tail`
3. Test providers individually:
   ```bash
   # Groq context test
   curl -H "Authorization: Bearer $GROQ_KEY" \
        -H "Content-Type: application/json" \
        -d '{"model":"llama-3.3-70b-versatile","messages":[{"role":"user","content":"Hi"}]}' \
        https://api.groq.com/openai/v1/chat/completions
   ```
4. Open an [Issue](https://github.com/yourusername/ivai-bot-v30/issues) with:
   - Worker URL
   - `/debug` output
   - Language code (`en`/`fa`)
   - Steps to reproduce

---

## 📜 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

```
MIT License

Copyright (c) 2026 IVAI Bot Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🙏 Acknowledgments

- [Cloudflare Workers](https://workers.cloudflare.com) — Serverless infrastructure + Cron triggers
- [OpenRouter](https://openrouter.ai) — Unified model access, primary provider
- [Groq](https://groq.com) — Ultra-fast LPU inference, speed fallback
- [Google AI Studio](https://aistudio.google.com) — Gemini models, long-context fallback
- **Lyra Prompt Engineering Framework** — Inspiration for Prompt Master
- All open-source model providers for their incredible work

---

> **Made with ❤️ by the IVAI Team**  
> 🌐 [GitHub](https://github.com/yourusername/ivai-bot-v30) • 🤖 [Telegram](https://t.me/YourBotUsername)  
> 🌀 Maintained by [@ILIVIR3](https://t.me/ILIVIR3)

---



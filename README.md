

https://t.me/IVAI_Llm_bot
# 🤖 IVAI Bot v29.0 — Triple Provider Edition

> **The most resilient multi-provider AI Telegram bot.**  
> 29 verified models across **OpenRouter 🔵**, **Groq 🔴**, and **Google AI Studio 🟢** — with intelligent fallback, color-coded UI, and smart re-engagement.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat&logo=cloudflare)](https://workers.cloudflare.com)
[![Multi-Provider](https://img.shields.io/badge/Providers-3%20%7C%20OpenRouter%20%2B%20Groq%20%2B%20Google-blueviolet?style=flat)](https://openrouter.ai)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-2CA5E0?style=flat&logo=telegram)](https://core.telegram.org/bots)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ What's New in v29.0

### 🌐 Triple Provider Architecture
> Never go offline again. If one provider fails, IVAI automatically fails over to the next.

```
User Request
     │
     ▼
[Primary: OpenRouter 🔵] → 22 models
     │
     ▼ (if failed/timeout)
[Fallback 1: Groq 🔴] → 4 ultra-fast LPU models
     │
     ▼ (if failed/timeout)  
[Fallback 2: Google AI Studio 🟢] → 3 Gemini models
     │
     ▼
[Emergency: Llama 3.2 3B] → Guaranteed response
```

| Provider | Models | Key Strength | Best For |
|----------|--------|-------------|----------|
| 🔵 **OpenRouter** | 22 | Largest variety, free tier | General use, experimentation |
| 🔴 **Groq** | 4 | Sub-100ms inference (LPU) | Real-time chat, quick tasks |
| 🟢 **Google AI Studio** | 3 | Massive context (524K tokens) | Long documents, complex reasoning |

### 🎨 Color-Coded Premium UI
- **🔵 Blue** = OpenRouter models
- **🔴 Red** = Groq models  
- **🟢 Green** = Google AI Studio models
- Inline keyboards display provider colors for instant recognition
- Model selection shows provider badge: `✅ Selected: 🏆 Qwen3 Coder (🔵 OpenRouter)`

### 🔔 10-Day Smart Reminder
> Re-engage inactive users automatically — without spam.

```javascript
// Cron trigger (configured in wrangler.toml)
{
  "triggers": {
    "crons": ["0 0 * * *"]  // Daily at midnight UTC
  }
}

// Logic:
// 1. Scan users with last_active > 10 days ago
// 2. Send personalized re-engagement message
// 3. Highlight new features since their last visit
// 4. Include direct link to start chatting
```

**Reminder Message Preview:**
```
👋 Hey! Long time no see!

It's been 10 days since we last chatted. IVAI has new features waiting for you:

• 🟢 Google AI Studio models added
• 🔴 Groq ultra-fast backup  
• 🎯 Prompt Master mode
• 🎛 Inline model picker

Just send me anything or tap /start to explore!

🌀 @ILIVIR3
```

### ⚡ Enhanced Reliability Features
- **Provider Health Monitoring**: Circuit breaker tracks failures per model AND per provider
- **Smart Fallback Priority**: Groq before Google for speed; Google before emergency for quality
- **Unified API Router**: `callAPI()` automatically routes to correct provider endpoint
- **Format Conversion**: Google's `contents[]` format auto-converted from standard `messages[]`

---

## 🧩 Feature Overview

| Category | Feature | Benefit |
|----------|---------|---------|
| **🌐 Providers** | OpenRouter + Groq + Google AI Studio | 99.9% uptime via intelligent fallback |
| **🎛 Modes** | `/fast` • `/deep` • `/code` • `/prompt` • `/auto` | Context-aware response optimization |
| **🤖 Models** | 29 verified models with provider tags | Best quality + reliability, zero dead endpoints |
| **🎨 UI** | Color-coded inline keyboards • HTML formatting | Intuitive, visually scannable experience |
| **🔔 Engagement** | 10-day cron reminders • Last-active tracking | Reduce churn, re-engage dormant users |
| **⚡ Performance** | Parallel execution • Multi-provider fallback • Caching | Fast responses even during regional outages |
| **🔧 Tools** | `/debug` with provider status • `/logs` • Stats | Full observability across all providers |

---

## 📦 Prerequisites

- ✅ **Cloudflare Account** (Free tier: 100K requests/day)
- ✅ **OpenRouter API Key** ([Get Key](https://openrouter.ai/keys))
- ✅ **Groq API Key** ([Get Key](https://console.groq.com/keys))
- ✅ **Google AI Studio API Key** ([Get Key](https://aistudio.google.com/app/apikey))
- ✅ **Telegram Bot Token** ([Create via @BotFather](https://t.me/BotFather))
- ✅ **Node.js 18+** & **npm** (for local development)

---

## 🚀 Quick Start

### Step 1: Clone & Install
```bash
git clone https://github.com/yourusername/ivai-bot-v29.git
cd ivai-bot-v29
npm install -g wrangler
```

### Step 2: Create KV Namespace
```bash
npx wrangler kv namespace create "IVAI_KV"
```
> Copy the returned `id` and update `wrangler.toml`:
```toml
name = "ivai-bot-v29"
main = "index.js"
compatibility_date = "2024-05-01"

[[kv_namespaces]]
binding = "IVAI_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

[triggers]
crons = ["0 0 * * *"]  # Daily cron for reminders
```

### Step 3: Configure Environment Variables
In **Cloudflare Dashboard** → Workers & Pages → `ivai-bot-v29` → Settings → Environment Variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token | ✅ Yes |
| `OPENROUTER_API_KEY` | OpenRouter API key (primary) | ✅ Yes |
| `GROQ_API_KEY` | Groq API key (fallback) | ⚠️ Recommended |
| `GOOGLE_API_KEY` | Google AI Studio key (fallback) | ⚠️ Recommended |
| `LOG_LEVEL` | Logging verbosity (`info`/`debug`) | ❌ Optional |

> 💡 **Pro Tip**: You can deploy with only OpenRouter first, then add Groq/Google keys later — fallback logic auto-detects available providers.

### Step 4: Deploy
```bash
npx wrangler login    # One-time authentication
npx wrangler deploy   # Deploy to Cloudflare
```
> Note your Worker URL: `https://ivai-bot-v29.your-subdomain.workers.dev`

### Step 5: Set Telegram Webhook
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://ivai-bot-v29.your-subdomain.workers.dev"}'
```

✅ **Done!** Open your bot on Telegram and tap `/start` to see the Triple Provider UI.

---

## 🎮 How to Use

### 🎚 Mode Selection (Color-Coded)
```
🟢 Fast    → Quick answers (Groq/Google preferred for speed)
🔴 Deep    → Analysis & reasoning (OpenRouter deep models)  
🔵 Code    → Programming tasks (OpenRouter code-specialized)
🎯 Prompt  → Transform ideas into pro prompts (Lyra engine)
🔀 Auto    → IVAI detects best mode + provider automatically
```

### 🎛 Model Control with Provider Tags
1. Tap **🎛 Pick Model** or type `/model`
2. Browse models — each shows provider color:
   ```
   🔵 🚀 Llama 3.2 3B (OpenRouter)
   🔴 ⚡ Groq Llama 70B (Groq)
   🟢 🟢 Gemini 2.5 Pro (Google)
   ```
3. Tap any model to lock to it
4. Footer shows active provider: `⚡ Parallel: 🔵 OpenRouter active | 🔴 Groq ready | 🟢 Google ready`

### 🌐 Provider Fallback in Action
When you send a message:
1. IVAI tries primary provider (based on mode/model)
2. If timeout/error → auto-tries next available provider
3. Response includes provider badge:
   ```
   Your answer here...
   
   🏆 Qwen3 Coder ⏱ 2.3s (🔴 Served via Groq backup)
   ```

### 🎯 Using Prompt Master (Multi-Provider Optimized)
```
1. Tap 🎯 Prompt Master or type /prompt
2. Type your rough idea:
   "help me write a product description for wireless earbuds"
3. Lyra engine selects best model across all providers
4. Receive polished prompt in copyable code block
```

### 🔔 Reminder System (Admin View)
Reminders run automatically via Cloudflare Cron. To test manually:
```bash
# Trigger cron locally
npx wrangler dev --test-scheduled

# Or simulate via HTTP header
curl -H "X-Cron: true" https://ivai-bot-v29.your-subdomain.workers.dev
```

---

## 🗄️ Architecture Overview

```
User Message
     │
     ▼
[Provider Router] → Select primary provider by mode/model
     │
     ▼
[Parallel Race] → 3 models from different groups (same provider)
     │
     ▼
[First Valid Response] → Return + cache + update stats
     │
     ▼
[Fallback Chain] → Next provider → Emergency model
     │
     ▼
[Response Tagging] → Append provider badge for transparency
```

### KV Storage Schema (v29)
| Key Pattern | Purpose | TTL |
|-------------|---------|-----|
| `mode:{userId}` | Active conversation mode | None |
| `model:{userId}` | Manually selected model ID | None |
| `mem:{userId}` | Conversation history (last 5) | 1 hour |
| `cache:{hash}` | Cached API responses | 2 hours |
| `failed:{modelId}` | Circuit breaker per model | 30 seconds |
| `last_active:{userId}` | Last user activity timestamp | 10 days |
| `stats:{userId}` | Usage analytics (per-provider) | 24 hours |

### Provider API Endpoints
| Provider | Endpoint | Auth Header |
|----------|----------|-------------|
| 🔵 OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | `Authorization: Bearer {key}` |
| 🔴 Groq | `https://api.groq.com/openai/v1/chat/completions` | `Authorization: Bearer {key}` |
| 🟢 Google | `https://generativelanguage.googleapis.com/v1beta/models/{id}:generateContent?key={key}` | API key in URL |

---

## 💰 Cost Estimate

| Provider | Free Tier | Paid Usage | Best For |
|----------|-----------|------------|----------|
| **🔵 OpenRouter** | 22 `:free` models | ~$0.10-10/million tokens | Development, variety |
| **🔴 Groq** | Limited free tier | ~$0.40/million tokens | Speed-critical tasks |
| **🟢 Google AI Studio** | 60 requests/min free | Pay-as-you-go after | Long-context, Gemini features |
| **Cloudflare Workers** | 100K requests/day | ~$0.30/million requests | Hosting infrastructure |

> 💡 **Cost Optimization Strategy**:  
> 1. Use `:free` OpenRouter models for 90% of traffic  
> 2. Enable Groq/Google only as fallback (reduces paid usage)  
> 3. Cache identical queries (2-hour TTL) to avoid repeat API calls  
> 4. Monitor usage per provider in `/debug`

---

## 🧪 Testing Checklist

Before going live:
- [ ] `/start` displays Triple Provider UI with color-coded buttons
- [ ] Tapping a 🔴 Groq model locks selection and shows provider badge
- [ ] Simulate OpenRouter failure → verify Groq fallback activates
- [ ] Simulate Groq failure → verify Google fallback activates
- [ ] Prompt Master returns optimized prompts with correct formatting
- [ ] 10-day reminder triggers for test user (use `last_active` KV manipulation)
- [ ] `/debug` shows provider availability: `🔵 OpenRouter: ✅ | 🔴 Groq: ✅ | 🟢 Google: ✅`
- [ ] Response footer shows correct provider badge: `(🟢 Served via Google AI Studio)`
- [ ] Circuit breaker isolates failing models without affecting other providers

---

## 🔐 Security & Best Practices

1. **Never commit API keys**: Use Cloudflare Environment Variables exclusively
2. **Provider key rotation**: Store keys in a secure vault; update via Cloudflare API
3. **Rate limit awareness**: Each provider has separate limits — monitor via `/debug`
4. **User data isolation**: KV keys are user-scoped (`{userId}`) to prevent cross-user leaks
5. **Error sanitization**: API errors never expose keys or internal paths to end users

### Recommended Monitoring
```bash
# Track provider success rates
npx wrangler tail | grep "provider"

# Alert on fallback activation (indicates primary provider issues)
# Set up Cloudflare Logpush to forward logs to your monitoring system
```

---

## 🤝 Contributing

Contributions welcome! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feat/add-anthropic-provider`
3. **Commit** changes: `git commit -m 'feat: add Anthropic Claude provider fallback'`
4. **Push** and **Open a Pull Request**

### Adding a New Provider (Guide)
To add a 4th provider (e.g., Anthropic):
```javascript
// 1. Define models array
const ANTHROPIC_MODELS = [
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", emoji: "🟣", temp: 0.6, tokens: 200000, group: 2, provider: "anthropic" }
];

// 2. Add to ALL_MODELS
const ALL_MODELS = [..., ...ANTHROPIC_MODELS];

// 3. Implement API handler
async function callAnthropicAPI(messages, model, apiKey) {
  // Format conversion + fetch logic
}

// 4. Update callAPI() router
async function callAPI(messages, model, env) {
  if (model.provider === "anthropic") return callAnthropicAPI(...);
  // ... existing providers
}

// 5. Add to fallback chain in processParallel()
// 6. Update UI helpers: getProviderColor(), getProviderLabel()
// 7. Update README tables and documentation
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Groq/Google fallback not activating | Verify `GROQ_API_KEY`/`GOOGLE_API_KEY` set in Cloudflare env vars |
| Google API returns 400 | Check `contents[]` format conversion; ensure `systemInstruction` handled |
| Reminder cron not triggering | Confirm `triggers.crons` in `wrangler.toml` + Worker has `scheduled` handler |
| Color codes not displaying | Ensure `getProviderColor()` called in keyboard/model rendering functions |
| Provider badge missing in response | Check `processParallel()` fallback branches append `(🔴 Served via...)` |

### Debug Mode (`/debug`)
Shows real-time provider status:
```
🔧 Debug v29

👤 User | 🎚 AUTO
📈 142req (✅128|❌9|💾23)
⏱ Avg: 3.2s | 🧠 5msg

🌐 Models: 29/29 avail
🔌 Circuit (30s):
• Llama 3.2 3B: 1f
• Gemini 2.5 Pro: 0f

⚡ Parallel: 3 groups | 25s timeout | 30s circuit
🔵 OpenRouter: ✅ | 🔴 Groq: ✅ | 🟢 Google: ✅
```

### Need Help?
1. Check `/logs` for provider-specific errors
2. View Cloudflare logs: `npx wrangler tail`
3. Test providers individually:
   ```bash
   # OpenRouter
   curl -H "Authorization: Bearer $OR_KEY" https://openrouter.ai/api/v1/models
   
   # Groq  
   curl -H "Authorization: Bearer $GROQ_KEY" https://api.groq.com/openai/v1/models
   
   # Google
   curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_KEY"
   ```
4. Open an [Issue](https://github.com/yourusername/ivai-bot-v29/issues) with:
   - Worker URL
   - `/debug` output screenshot
   - Provider key status (redact actual keys)

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
> 🌐 [GitHub](https://github.com/yourusername/ivai-bot-v29) • 🤖 [Telegram](https://t.me/YourBotUsername)  
> 🌀 Maintained by [@ILIVIR3](https://t.me/ILIVIR3)


---

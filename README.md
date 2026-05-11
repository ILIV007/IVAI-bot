

https://t.me/IVAI_Llm_bot

# 🤖 IVAI Bot v28.0 — Premium UI Edition

> **The most advanced multi-model AI Telegram bot.**  
> Powered by 22+ verified AI models, inline keyboard navigation, and the revolutionary **Prompt Master™** engine.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat&logo=cloudflare)](https://workers.cloudflare.com)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-API-000000?style=flat)](https://openrouter.ai)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-2CA5E0?style=flat&logo=telegram)](https://core.telegram.org/bots)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ What's New in v28.0

### 🎨 Premium UI Experience
- **Inline Keyboard Menus**: Tap-to-select modes, models, and tools — no more typing commands
- **HTML-Formatted Messages**: Clean, readable responses with proper formatting
- **Interactive Model Browser**: Paginated inline list with one-tap selection
- **Callback Query Handling**: Instant feedback when you tap buttons
- **Polished `/start` Screen**: Beautiful welcome experience with quick-action buttons

### 🎯 Prompt Master™ (Powered by Lyra)
> Turn rough ideas into professional-grade AI prompts — automatically.

```
User: "write a marketing email for a sneaker shop"
↓ Lyra Engine ↓
Optimized Prompt:
"""
You are a senior copywriter specializing in e-commerce fashion brands...
[Full structured prompt with tone, audience, CTA, and format specs]
"""
```

**The 4-D Methodology:**
1. **Deconstruct** — Extract intent, entities, constraints
2. **Diagnose** — Identify clarity gaps and ambiguity  
3. **Develop** — Apply optimal techniques (role-play, few-shot, chain-of-thought)
4. **Deliver** — Output production-ready prompt in a copyable code block

*Perfect for: developers, marketers, content creators, and anyone who wants better AI results.*

### ⚡ Core Enhancements
- **True Multi-Model Parallelism**: Race 3 models simultaneously, get the fastest valid response
- **Smart Mode Detection**: Auto-switches between Fast/Deep/Code/Prompt based on your message
- **Circuit Breaker v2**: Failing models auto-pause for 30s, keeping your bot responsive
- **Response Caching**: Identical queries return instantly (2-hour cache TTL)

---

## 🧩 Feature Overview

| Category | Feature | Benefit |
|----------|---------|---------|
| **🎛 Modes** | `/fast` • `/deep` • `/code` • `/prompt` • `/auto` | Choose speed, depth, coding help, or prompt optimization |
| **🤖 Models** | 22 verified models across 3 tiers | Best quality + reliability, no dead endpoints |
| **🎨 UI** | Inline keyboards • HTML formatting • Interactive menus | Intuitive, tap-based experience |
| **🧠 Memory** | 5-message context • 1-hour TTL | Natural conversations without manual context management |
| **⚡ Performance** | Parallel execution • Smart caching • Circuit breaker | Fast responses even during API hiccups |
| **🔧 Tools** | `/debug` • `/logs` • `/reset` • Stats tracking | Full visibility and control |

---

## 📦 Prerequisites

- ✅ **Cloudflare Account** (Free tier: 100K requests/day)
- ✅ **OpenRouter Account** ([Get API Key](https://openrouter.ai/keys))
- ✅ **Telegram Bot Token** ([Create via @BotFather](https://t.me/BotFather))
- ✅ **Node.js 18+** & **npm** (for local development)

---

## 🚀 Quick Start

### Step 1: Clone & Install
```bash
git clone https://github.com/yourusername/ivai-bot-v28.git
cd ivai-bot-v28
npm install -g wrangler
```

### Step 2: Create KV Namespace
```bash
npx wrangler kv namespace create "IVAI_KV"
```
> Copy the returned `id` and update `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "IVAI_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Step 3: Configure Environment Variables
In **Cloudflare Dashboard** → Workers & Pages → `ivai-bot-v28` → Settings → Environment Variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token | `123456789:AAH...` |
| `OPENROUTER_API_KEY` | Your OpenRouter API key | `sk-or-v1-...` |
| `LOG_LEVEL` *(optional)* | Logging verbosity | `info`, `debug` |

### Step 4: Deploy
```bash
npx wrangler login    # One-time authentication
npx wrangler deploy   # Deploy to Cloudflare
```
> Note your Worker URL: `https://ivai-bot-v28.your-subdomain.workers.dev`

### Step 5: Set Telegram Webhook
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://ivai-bot-v28.your-subdomain.workers.dev"}'
```

✅ **Done!** Open your bot on Telegram and tap `/start` to see the Premium UI.

---

## 🎮 How to Use

### 🎚 Mode Selection (Tap or Type)
```
🚀 Fast    → Quick answers, casual chat
🧠 Deep    → Analysis, explanations, stories  
💻 Code    → Programming, debugging, technical tasks
🎯 Prompt  → Transform ideas into pro AI prompts (Lyra engine)
🔀 Auto    → Let IVAI detect the best mode automatically
```

### 🎛 Model Control
1. Tap **🎛 Pick Model** in the main menu
2. Browse models with ◀️ ▶️ pagination
3. Tap any model to lock to it (e.g., `🏆 Qwen3 Coder 480B`)
4. Tap **❌ Close** or use `/model off` to return to auto-selection

### 🎯 Using Prompt Master
```
1. Tap 🎯 Prompt Master or type /prompt
2. Type your rough idea:
   "help me write a product description for wireless earbuds"
3. Receive a polished, structured prompt ready for any AI:
   ```
   You are a senior e-commerce copywriter...
   [Full optimized prompt]
   ```
4. Copy and use anywhere — ChatGPT, Claude, Midjourney, etc.
```

### 🧠 Memory Management
- View context: Tap **🧠 Memory** → **Show** or type `/memory show`
- Clear history: Tap **🧠 Memory** → **Clear** or type `/memory clear`

### 🔧 Developer Tools
- `/debug` — Real-time system status, circuit breaker state, stats
- `/logs` — Recent error logs for troubleshooting
- `/reset` — Factory reset all user data and settings

---

## 🗄️ Architecture Overview

```
User Message
     │
     ▼
[Mode Detection] → Fast / Deep / Code / Prompt / Auto
     │
     ▼
[Model Selection] → User-picked OR mode-based pool
     │
     ▼
[Parallel Race] → 3 models from different groups execute simultaneously
     │
     ▼
[First Valid Response Wins] → Return to user + cache result
     │
     ▼
[Fallback Chain] → Retry → Circuit Breaker → Emergency Model
```

### KV Storage Schema
| Key Pattern | Purpose | TTL |
|-------------|---------|-----|
| `mode:{userId}` | Active conversation mode | None |
| `model:{userId}` | Manually selected model ID | None |
| `mem:{userId}` | Conversation history (last 5) | 1 hour |
| `cache:{hash}` | Cached API responses | 2 hours |
| `failed:{modelId}` | Circuit breaker state | 30 seconds |
| `stats:{userId}` | Usage analytics | 24 hours |

---

## 💰 Cost Estimate

| Service | Free Tier | Paid Usage |
|---------|-----------|------------|
| **Cloudflare Workers** | 100K requests/day | ~$0.30/million requests |
| **OpenRouter** | All `:free` models | ~$0.10-10/million tokens |
| **Telegram Bot API** | Unlimited | Free |

> 💡 **Pro Tip**: Use `:free` models for development. Monitor usage at [OpenRouter Dashboard](https://openrouter.ai/usage).

---

## 🧪 Testing Checklist

Before going live:
- [ ] `/start` displays Premium UI with inline keyboards
- [ ] Tapping mode buttons changes mode instantly
- [ ] Model browser pagination works (◀️ ▶️)
- [ ] Prompt Master returns optimized prompts in code blocks
- [ ] Parallel execution returns fastest valid response
- [ ] Circuit breaker activates after 2 consecutive failures
- [ ] Emergency fallback works when all models fail
- [ ] Memory persists across messages (5-message limit)
- [ ] `/debug` shows accurate real-time stats

---

## 🤝 Contributing

Contributions welcome! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feat/awesome-enhancement`
3. **Commit** changes: `git commit -m 'feat: add awesome enhancement'`
4. **Push** and **Open a Pull Request**

### Development Guidelines
- Maintain existing code style (2-space indent, JSDoc comments)
- Add inline keyboard support for new user-facing features
- Test parallel execution logic thoroughly
- Update this README for user-visible changes

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Inline buttons not responding | Ensure `callback_query` handler is deployed; check Cloudflare logs |
| Prompt Master returns plain text | Verify `PROMPTS.prompt` system message is active; use Code-tier models |
| Models timing out | Some `:free` models rotate; circuit breaker should auto-skip |
| KV errors in `/debug` | Confirm KV namespace ID matches `wrangler.toml` |
| Webhook not receiving updates | Re-run `setWebhook`; ensure Worker URL is HTTPS |

### Debug Mode
Use `/debug` or tap **🔧 Debug** to see:
- Current mode & selected model
- Request statistics (success/fail/cache rates)
- Circuit breaker status per model
- Last request metadata (duration, tokens, tries)

### Need Help?
1. Check `/logs` for recent errors
2. View Cloudflare logs: `npx wrangler tail`
3. Test API calls: [OpenRouter Playground](https://openrouter.ai/playground)
4. Open an [Issue](https://github.com/yourusername/ivai-bot-v28/issues) with:
   - Worker URL
   - Screenshot of `/debug` output
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

- [Cloudflare Workers](https://workers.cloudflare.com) — Serverless infrastructure
- [OpenRouter](https://openrouter.ai) — Unified AI model access
- [Telegram Bot API](https://core.telegram.org/bots) — Messaging platform
- **Lyra Prompt Engineering Framework** — Inspiration for Prompt Master
- All open-source model providers for their incredible work

---

> **Made with ❤️ by the IVAI Team**  
> 🌐 [GitHub](https://github.com/yourusername/ivai-bot-v28) • 🤖 [Telegram](https://t.me/YourBotUsername)

---

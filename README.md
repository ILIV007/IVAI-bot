# 📄 `README.md` (English Version)

https://t.me/IVAI_Llm_bot

```markdown
# 🤖 IVAI Bot v25.0

> A multi-model AI Telegram bot powered by Cloudflare Workers & OpenRouter. Fast, reliable, and packed with features.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat&logo=cloudflare)](https://workers.cloudflare.com)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-API-000000?style=flat)](https://openrouter.ai)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-2CA5E0?style=flat&logo=telegram)](https://core.telegram.org/bots)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ Features

### 🚀 Performance & Reliability
- **True Parallel Execution**: Race multiple models simultaneously for fastest response
- **Circuit Breaker Pattern**: Automatically skip failing models with 30s cooldown
- **Smart Retry Logic**: Exponential backoff for transient errors (429, 5xx, timeouts)
- **Response Caching**: Reduce latency & API costs with intelligent caching (2h TTL)

### 🧠 Model Management
- **22 Verified Models** across 3 categories:
  - 🚀 **Fast**: Quick responses for simple queries (Llama 3.2 3B, Gemma 4, etc.)
  - 🧠 **Deep**: Comprehensive analysis for complex questions (Hermes 405B, Qwen3 80B, etc.)
  - 💻 **Code**: Specialized coding assistance (Qwen3 Coder, Laguna, Dolphin, etc.)
- **Manual Model Selection**: Use `/model` to browse & `/pick <num>` to select
- **Auto-Mode**: Intelligent mode detection based on query content

### 💬 Conversation & UX
- **Context Memory**: Remembers last 5 messages per user (1h TTL)
- **Smart Typing Indicators**: Real-time "typing..." status in Telegram
- **Markdown Support**: Proper formatting for code blocks, lists, and emphasis
- **Multi-language**: Responds in user's language (English, Persian, etc.)

### 🔧 Developer Tools
- **Debug Mode**: `/debug` shows real-time stats, circuit status, and model availability
- **Logging System**: Internal logs accessible via `/logs`
- **Statistics Tracking**: Success rate, avg. response time, cache hits
- **Emergency Fallback**: Guaranteed response even when all models fail

---

## 📦 Prerequisites

- ✅ **Cloudflare Account** (Free tier supports 100K requests/day)
- ✅ **OpenRouter Account** ([Get API Key](https://openrouter.ai/keys))
- ✅ **Telegram Bot Token** ([Create via @BotFather](https://t.me/BotFather))
- ✅ **Node.js 18+** & **npm** (for local development)

---

## 🚀 Quick Start

### Step 1: Clone & Install
```bash
git clone https://github.com/yourusername/ivai-bot-v25.git
cd ivai-bot-v25
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
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # ← Paste your ID here
```

### Step 3: Configure Environment Variables
In **Cloudflare Dashboard** → Workers & Pages → `ivai-bot-v25` → Settings → Environment Variables:

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
> Note your Worker URL: `https://ivai-bot-v25.your-subdomain.workers.dev`

### Step 5: Set Telegram Webhook
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://ivai-bot-v25.your-subdomain.workers.dev"}'
```

✅ **Done!** Start chatting with your bot on Telegram.

---

## 🎮 Bot Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Show welcome message & features | `/start` |
| `/fast` | Switch to fast-response mode | `/fast` |
| `/deep` | Switch to deep-analysis mode | `/deep` |
| `/code` | Switch to code-specialist mode | `/code` |
| `/auto` | Enable automatic mode detection | `/auto` |
| `/model` | List all available models | `/model` |
| `/pick <num>` | Select a specific model by number | `/pick 5` |
| `/model off` | Return to auto-selection mode | `/model off` |
| `/memory show` | Display conversation history | `/memory show` |
| `/memory clear` | Clear stored conversation | `/memory clear` |
| `/debug` | Show technical diagnostics | `/debug` |
| `/logs` | View recent error logs | `/logs` |
| `/reset` | Reset all user settings & data | `/reset` |

---

## 🛠️ Local Development

### Run Locally with Hot Reload
```bash
npx wrangler dev
```
> Your bot will be available at `http://localhost:8787`

### Set Local Webhook (for testing)
```bash
# Install ngrok for tunneling
npm install -g ngrok

# Start tunnel
ngrok http 8787

# Set webhook to ngrok URL
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
  -d "url=https://xxxx-xxxx.ngrok.io"
```

### View Live Logs
```bash
npx wrangler tail
```

### Environment Variables (Local)
Create a `.dev.vars` file:
```env
TELEGRAM_BOT_TOKEN=your_token_here
OPENROUTER_API_KEY=your_key_here
LOG_LEVEL=debug
```

---

## 🗄️ KV Storage Schema

| Key Pattern | Purpose | TTL |
|-------------|---------|-----|
| `mode:{userId}` | User's selected mode (fast/deep/code/auto) | None |
| `model:{userId}` | User's manually selected model ID | None |
| `mem:{userId}` | Conversation memory (last 5 messages) | 1 hour |
| `cache:{userId}:{hash}` | Cached API responses | 2 hours |
| `failed:{modelId}` | Circuit breaker state for models | 30 seconds |
| `logs:{userId}` | Recent error/debug logs | 1 hour |
| `stats:{userId}` | Usage statistics | 24 hours |
| `last:{userId}` | Last request metadata | 1 hour |

---

## 🔐 Security Best Practices

1. **Never commit secrets**: Use Cloudflare Environment Variables, not hardcoded values
2. **Validate inputs**: All user inputs are sanitized before processing
3. **Rate limiting**: Built-in retry logic prevents API abuse
4. **Minimal permissions**: KV namespace access scoped to this Worker only
5. **Error handling**: Failures never expose internal details to end users

---

## 💰 Cost Estimate

| Service | Free Tier | Paid Usage |
|---------|-----------|------------|
| **Cloudflare Workers** | 100K requests/day | $0.30/million requests |
| **OpenRouter** | All `:free` models | ~$0.10-10/million tokens (model-dependent) |
| **Telegram Bot API** | Unlimited | Free |

> 💡 **Tip**: Use `:free` models for development. Monitor usage in [OpenRouter Dashboard](https://openrouter.ai/usage).

---

## 🧪 Testing Checklist

Before going live, verify:

- [ ] `/start` displays welcome message correctly
- [ ] Auto-mode detects code queries (`/model` shows code models)
- [ ] Manual model selection works (`/pick 3` → confirmed response)
- [ ] Conversation memory persists across messages
- [ ] Circuit breaker activates after 2 consecutive failures
- [ ] Emergency fallback triggers when all models fail
- [ ] Response truncation works for long outputs (>4096 chars)
- [ ] Markdown formatting preserved in code blocks
- [ ] Stats update after successful/failed requests

---

## 🤝 Contributing

Contributions are welcome! Here's how:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-idea`
3. **Commit** changes: `git commit -m 'feat: add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-idea`
5. **Open** a Pull Request

### Development Guidelines
- Follow existing code style (2-space indent, JSDoc comments)
- Add tests for new features (if applicable)
- Update documentation for user-facing changes
- Keep PRs focused and atomic

---

## 🐛 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `401 Unauthorized` from Telegram | Verify `TELEGRAM_BOT_TOKEN` has no extra spaces |
| `403 Forbidden` from OpenRouter | Check API key permissions & billing status |
| Models not responding | Some `:free` models rotate; check [OpenRouter Status](https://status.openrouter.ai) |
| KV errors in logs | Ensure KV namespace ID matches `wrangler.toml` |
| Webhook not receiving updates | Re-run `setWebhook` command; check Worker URL is HTTPS |

### Debug Mode
Use `/debug` to see:
- Current mode & selected model
- Request statistics (success/fail/cache rates)
- Circuit breaker status for each model
- Last request metadata

### Need Help?
1. Check `/logs` for recent errors
2. Review Cloudflare Worker logs: `npx wrangler tail`
3. Test API calls manually: [OpenRouter Playground](https://openrouter.ai/playground)
4. Open an [Issue](https://github.com/yourusername/ivai-bot-v25/issues) with:
   - Worker URL
   - Error message from `/debug`
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

- [Cloudflare Workers](https://workers.cloudflare.com) for serverless infrastructure
- [OpenRouter](https://openrouter.ai) for unified AI model access
- [Telegram Bot API](https://core.telegram.org/bots) for seamless messaging
- All open-source model providers for their incredible work

---

> **Made with ❤️ by the IVAI Team**  
> 🌐 [GitHub](https://github.com/yourusername/ivai-bot-v25) • 🤖 [Telegram Bot](https://t.me/YourBotUsername)
```اضافه کنم، بگو! 😊

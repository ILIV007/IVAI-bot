

https://t.me/IVAI_Llm_bot




# 🪐 IVAI Bot v32 — Space Edition

> **Your intelligent Telegram assistant powered by OpenRouter, Groq & Google AI Studio**

[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-blue?logo=telegram)](https://t.me/IVAIBot)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange?logo=cloudflare)](https://workers.cloudflare.com)
[![Multi-Provider](https://img.shields.io/badge/Providers-3%2B-green)](#providers)

---

## ✨ Overview

**IVAI** is a production-ready Telegram bot that intelligently routes user queries to the best available AI model across multiple providers. Built on **Cloudflare Workers**, it features:

- 🔄 **Parallel model racing** for fastest, highest-quality responses
- 🧠 **Per-user dynamic model lists** synced from OpenRouter API
- 🛡️ **Circuit breaker pattern** to gracefully handle failed models
- 💾 **Smart memory & caching** for context-aware conversations
- 🌍 **Bilingual support** (English & Farsi)
- 🎨 **Space-themed UI** with dynamic emoji generation

---

## 🚀 Key Features

### 🤖 Intelligent Routing
```
User Query → Auto-Detect Intent → Parallel Model Race → Best Answer Wins
```
- **Auto-mode**: Automatically selects `fast` / `deep` / `code` based on query analysis
- **Parallel execution**: Tests 3 models simultaneously (one per tier) and returns the first complete response
- **Fallback chain**: OpenRouter → Groq → Google AI Studio → Emergency models

### 🎛️ Conversation Modes
| Mode | Command | Best For | Example Models |
|------|---------|----------|---------------|
| 🟢 Fast | `/fast` | Quick answers, simple Q&A | Llama 3.2 3B, Gemma 4 26B |
| 🔴 Deep | `/deep` | Analysis, reasoning, long-form | Llama 3.3 70B, Qwen3 80B |
| 🔵 Code | `/code` | Programming, debugging | Qwen3 Coder, Laguna M.1 |
| 🎯 Prompt | `/prompt` | Prompt engineering (Lyra mode) | Code-optimized models |
| 🔀 Auto | `/auto` | Let IVAI decide | Dynamic selection |

### 🌐 Multi-Provider Support
| Provider | Status | Models | Notes |
|----------|--------|--------|-------|
| 🔵 OpenRouter | ✅ Primary | 30+ free models | Main source, auto-synced |
| 🔴 Groq | ✅ Fallback | 4 ultra-fast models | Low-latency backup |
| 🟢 Google AI Studio | ✅ Fallback | Gemini 2.5 series | High-context fallback |

### 🧩 Advanced Capabilities
- **Per-user model sync**: `/refreshmodels` fetches fresh free models from OpenRouter
- **Model locking**: `/pick <number>` to force a specific model
- **Memory management**: `/memory show` & `/memory clear` for context control
- **Health monitoring**: `/active` tests all models in batched parallel requests
- **Debugging**: `/debug` shows user stats, circuit status, last request
- **Factory reset**: `/reset` wipes all user data and restores defaults

---

## ⚙️ Setup & Configuration

### Prerequisites
- Cloudflare account with Workers & KV enabled
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- API keys for desired providers:
  - `OPENROUTER_API_KEY` (https://openrouter.ai)
  - `GROQ_API_KEY` (https://groq.com)
  - `GOOGLE_API_KEY` (https://aistudio.google.com)

### Deployment Steps

1. **Clone & Configure**
```bash
# Create wrangler.toml
name = "ivai-bot"
main = "src/index.js"
compatibility_date = "2024-06-01"

[[kv_namespaces]]
binding = "IVAI_KV"
id = "your-kv-namespace-id"

[vars]
TELEGRAM_BOT_TOKEN = "your-telegram-token"
OPENROUTER_API_KEY = "your-openrouter-key"
# Optional fallbacks:
GROQ_API_KEY = "your-groq-key"
GOOGLE_API_KEY = "your-google-key"
```

2. **Create KV Namespace**
```bash
wrangler kv:namespace create IVAI_KV
# Copy the generated ID into wrangler.toml
```

3. **Deploy**
```bash
npm install -g wrangler
wrangler deploy
```

4. **Set Webhook**
```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://your-worker.your-subdomain.workers.dev"
```

---

## 📚 Command Reference

### Core Commands
| Command | Description |
|---------|-------------|
| `/start` | Welcome message + compact menu |
| `/menu` | Full feature menu |
| `/help` | Detailed usage guide |
| `/lang` | Switch between English/Farsi |

### Mode Selection
| Command | Effect |
|---------|--------|
| `/fast` | Use speed-optimized models |
| `/deep` | Use reasoning-optimized models |
| `/code` | Use programming-specialized models |
| `/prompt` | Activate Lyra prompt-optimizer mode |
| `/auto` | Return to intelligent auto-routing |

### Model Management
| Command | Description |
|---------|-------------|
| `/model` | Browse all available models (paginated) |
| `/pick <n>` | Lock to model #n from the list |
| `/model off` | Unlock — return to auto-selection |
| `/refreshmodels` | Sync fresh models from OpenRouter API |
| `/models` | List all loaded models by category |
| `/active` | Run health check on all models |

### Memory & Debugging
| Command | Description |
|---------|-------------|
| `/memory show` | View current conversation context |
| `/memory clear` | Wipe conversation history |
| `/debug` | Show user stats, circuit status, last request |
| `/logs` | View recent error logs (last 15 entries) |
| `/reset` | Factory reset: clear all user data & settings |

---

## 🏗️ Architecture Overview

```
┌─────────────────┐
│   Telegram API  │
└────────┬────────┘
         │ POST /webhook
         ▼
┌─────────────────┐
│ Cloudflare Worker│
│  • IVAI Bot v32 │
└────────┬────────┘
         │
   ┌─────┴─────┐
   ▼           ▼
┌───────┐ ┌─────────┐
│ KV Store│ │ External│
│ • user settings│ │ AI APIs │
│ • memory/cache│ │ • OpenRouter│
│ • circuit state│ │ • Groq   │
│ • stats/logs │ │ • Google │
└───────┘ └─────────┘
```

### Key Components
- **`processMessage()`**: Entry point for query handling
- **`processParallel()`**: Multi-model racing with fallback logic
- **`trueRaceModels()`**: Promise-based parallel execution with timeout
- **`callWithFastRetry()`**: Exponential backoff for transient errors
- **Circuit Breaker**: Per-model failure tracking with auto-recovery
- **Per-User Model Sync**: Dynamic model lists stored in KV with TTL

---

## 🔐 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Telegram Bot API token |
| `OPENROUTER_API_KEY` | ✅ | Primary AI provider key |
| `GROQ_API_KEY` | ❌ | Fallback provider (ultra-fast) |
| `GOOGLE_API_KEY` | ❌ | Fallback provider (high-context) |

---

## 🧪 Testing & Debugging

### Local Testing with Wrangler
```bash
# Simulate a Telegram update
echo '{"message":{"chat":{"id":123},"from":{"id":123},"text":"/start"}}' | \
  wrangler dev --local
```

### Health Check Endpoint
```bash
curl https://your-worker.workers.dev \
  -H "X-Cron: true"  # Triggers internal cron logic
```

### Log Inspection
- Use `/logs` command in-chat for recent errors
- Check Cloudflare Workers **Logs** tab for real-time output
- KV entries use prefixed keys: `logs:<userId>`, `failed:<userId>`

---

## 🔄 Auto-Update System

IVAI supports **per-user dynamic model lists**:

1. User runs `/refreshmodels`
2. Bot fetches free models from OpenRouter API
3. Models are categorized (`fast`/`deep`/`code`) using heuristics:
   - Parameter count (`70b` → deep)
   - Keywords (`coder`, `reasoning`, `thinking`)
   - Context length (>100k → deep)
4. Cleaned model list stored in KV with 15-day TTL
5. Subsequent requests use user's personalized model pool

> 💡 This ensures each user always has access to the latest free models without global deployment updates.

---

## 🌍 Localization

Built-in support for:
- 🇬🇧 **English** (`en`)
- 🇮🇷 **Farsi/Persian** (`fa`)

Language auto-detects from user's first message or can be set via:
- `/lang` command
- Inline keyboard selection
- KV storage: `lang:<userId>`

All UI strings, prompts, and error messages are localized via the `STRINGS` dictionary.

---

## 🛡️ Reliability Features

| Feature | Implementation |
|---------|---------------|
| **Timeouts** | Per-request (25s), parallel race (20s), active check (10s) |
| **Retries** | Exponential backoff (500ms base, max 2 retries) for 5xx/429 |
| **Circuit Breaker** | Per-model failure tracking; 3 strikes = 60s cooldown |
| **Context Truncation** | Smart message slicing for Groq/Google token limits |
| **Fallback Chain** | Multi-provider escalation with emergency models |
| **Cache Layer** | Hash-based response caching (2-hour TTL) |

---

## 📦 Project Structure

```
src/
├── index.js          # Main worker entry point (this file)
├── config.js         # CONFIG constants & KV prefixes
├── strings.js        # STRINGS dictionary (FA/EN)
├── models.js         # DEFAULT_* model arrays + sync logic
├── prompts.js        # PROMPTS for each mode
├── keyboards.js      # Inline keyboard builders
├── api.js            # Provider API wrappers (OpenRouter/Groq/Google)
├── utils.js          # Helpers: hash, truncate, markdown→HTML
├── memory.js         # KV wrappers for memory/cache/stats
└── handlers/
    ├── commands.js   # /start, /help, etc.
    ├── callbacks.js  # Inline button handlers
    └── process.js    # Core message routing logic
```

> 💡 The current single-file version is production-ready; consider splitting for maintainability in larger teams.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feat/amazing-feature`
5. Open a Pull Request

### Guidelines
- Keep responses concise and user-focused
- Preserve space-themed emoji consistency 🪐
- Test fallback paths thoroughly
- Update `STRINGS` for any new UI text

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.

```
MIT License
Copyright (c) 2024 IVAI Project
Permission is hereby granted, free of charge, to any person obtaining a copy...
```

---

## 🙏 Acknowledgements

- [OpenRouter](https://openrouter.ai) — Unified model API
- [Groq](https://groq.com) — Blazing-fast inference
- [Google AI Studio](https://aistudio.google.com) — Gemini access
- [Cloudflare Workers](https://workers.cloudflare.com) — Edge runtime
- Telegram Bot API — Seamless chat integration

---

> 🪐 *"The best answer isn't always the biggest model — it's the one that arrives first, intact, and on-point."*  
> — IVAI v32 Philosophy

**Made with ❤️ for the Telegram AI community**  
`@ILIVIR3` • `IVAI Bot`

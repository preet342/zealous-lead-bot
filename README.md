# 🚀 Omnichannel AI Lead Generation Bot (Node.js)

Auto-replying, lead-qualifying bot that connects to **WhatsApp**, **Facebook Messenger**, **Instagram DM**, and **Telegram**, captures leads automatically, saves them to a database, and notifies the admin in real-time.

---

## 📁 Project Architecture

```
zealous-mendel/
├── src/
│   ├── server.js               # Main Express Server
│   ├── config/index.js         # Configuration & Environment Variables
│   ├── channels/
│   │   ├── telegram.js         # Telegram Bot Integration (Telegraf)
│   │   ├── whatsapp.js         # Meta WhatsApp Cloud API Integration
│   │   ├── facebook.js         # Facebook Messenger Webhook & Sender
│   │   └── instagram.js        # Instagram DM Webhook & Sender
│   ├── routes/
│   │   ├── webhookRoutes.js    # Unified Meta Webhook (GET verify & POST events)
│   │   └── leadRoutes.js       # Visual Leads Dashboard & REST API
│   └── services/
│       ├── aiService.js        # Conversational Flow & Smart Qualification (Gemini/Rule-based)
│       ├── leadService.js      # Lead Storage & Session Management
│       └── notificationService.js # Instant Admin Alerts
├── data/
│   └── leads.json              # Persistent Captured Leads Store
├── .env.example                # Credentials Template
└── package.json
```

---

## 🛠️ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Credentials (`.env`)
Copy `.env.example` to `.env` and fill in your keys:
- **Telegram:** Get a token from `@BotFather` in 1 minute.
- **WhatsApp / FB / Instagram:** Get your App Tokens from [Meta for Developers](https://developers.facebook.com/).
- **AI (Optional):** Add a `GEMINI_API_KEY` for dynamic FAQ answers.

### 3. Start the Server
```bash
npm start
# or development auto-reload:
npm run dev
```

---

## 🌐 Endpoints & URLs

- **API Status:** `http://localhost:3000/`
- **WhatsApp QR Scan:** `http://localhost:3000/qr`
- **Leads Dashboard:** `http://localhost:3000/leads`
- **Leads JSON API:** `http://localhost:3000/api/leads`
- **Meta Webhook URL:** `http://localhost:3000/webhook`

---

## 📱 WhatsApp Connection Options

You have **both** WhatsApp connection methods enabled simultaneously:

### Option A: WhatsApp QR Scan (Fastest — 10 seconds)
1. Open `http://localhost:3000/qr` in your browser.
2. Open WhatsApp on your phone > **Settings / Menu > Linked Devices > Link a Device**.
3. Scan the QR code.
4. Your bot is immediately connected and ready to reply to all incoming messages!

### Option B: Official Meta WhatsApp Cloud API
1. Follow the Meta for Developers setup below.
2. Messages arrive via `/webhook` and send official Cloud API responses.

---

## 🔌 Connecting The Platforms

### 1. Telegram (Fastest - 2 minutes)
1. Open Telegram and search for `@BotFather`.
2. Send `/newbot`, choose a name and username.
3. Copy the HTTP API token into `TELEGRAM_BOT_TOKEN` in `.env`.
4. (Optional) Get your own Chat ID from `@userinfobot` and add it to `TELEGRAM_ADMIN_CHAT_ID` to receive instant lead notifications.

### 2. Meta (WhatsApp, Facebook, Instagram)
1. Expose your local port 3000 to the internet using **ngrok** or **Cloudflare Tunnel**:
   ```bash
   npx ngrok http 3000
   ```
2. In [Meta for Developers](https://developers.facebook.com/):
   - **Callback URL:** `https://your-ngrok-url.ngrok-free.app/webhook`
   - **Verify Token:** `my_secure_lead_bot_token_123` (matching `.env`)
3. Subscribe to:
   - **WhatsApp:** `messages`
   - **Messenger:** `messages`, `messaging_postbacks`
   - **Instagram:** `messages`

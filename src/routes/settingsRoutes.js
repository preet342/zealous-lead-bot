const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config');
const whatsappQr = require('../channels/whatsappQr');
const { initTelegram } = require('../channels/telegram');
const tunnelService = require('../services/tunnelService');
const { renderSidebarLayout } = require('../views/sidebarLayout');

const ENV_PATH = path.join(__dirname, '../../.env');

// Helper to read raw .env as key-value
function readEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        env[key] = val;
      }
    }
  });
  return env;
}

// Helper to write key-values back to .env
function updateEnvFile(newEntries) {
  const existing = readEnvFile();
  const merged = { ...existing, ...newEntries };
  let lines = [];
  lines.push('# BWB Media Omnichannel Lead Bot Environment');
  lines.push(`PORT=${merged.PORT || 3000}`);
  lines.push('');
  lines.push('# Meta Platform (WhatsApp, Facebook, Instagram)');
  lines.push(`META_VERIFY_TOKEN=${merged.META_VERIFY_TOKEN || 'my_secure_lead_bot_token_123'}`);
  lines.push(`WHATSAPP_PHONE_NUMBER_ID=${merged.WHATSAPP_PHONE_NUMBER_ID || ''}`);
  lines.push(`WHATSAPP_ACCESS_TOKEN=${merged.WHATSAPP_ACCESS_TOKEN || ''}`);
  lines.push(`FB_PAGE_ACCESS_TOKEN=${merged.FB_PAGE_ACCESS_TOKEN || ''}`);
  lines.push(`INSTAGRAM_ACCESS_TOKEN=${merged.INSTAGRAM_ACCESS_TOKEN || ''}`);
  lines.push(`META_API_VERSION=${merged.META_API_VERSION || 'v20.0'}`);
  lines.push('');
  lines.push('# Telegram Configuration');
  lines.push(`TELEGRAM_BOT_TOKEN=${merged.TELEGRAM_BOT_TOKEN || ''}`);
  lines.push(`TELEGRAM_ADMIN_CHAT_ID=${merged.TELEGRAM_ADMIN_CHAT_ID || ''}`);
  lines.push('');
  lines.push('# Google Gemini AI & Business');
  lines.push(`GEMINI_API_KEY=${merged.GEMINI_API_KEY || ''}`);
  lines.push(`OPENROUTER_API_KEY=${merged.OPENROUTER_API_KEY || ''}`);
  lines.push(`BUSINESS_NAME=${merged.BUSINESS_NAME || 'BWB Media'}`);
  lines.push(`BUSINESS_DESCRIPTION=${merged.BUSINESS_DESCRIPTION || 'Digital Marketing, Video Editing, Meta Ads & Automation'}`);
  lines.push(`GOOGLE_SHEET_WEBHOOK_URL=${merged.GOOGLE_SHEET_WEBHOOK_URL || ''}`);

  fs.writeFileSync(ENV_PATH, lines.join('\n'), 'utf8');

  // Update in-memory process.env & config
  for (const [k, v] of Object.entries(merged)) {
    process.env[k] = v;
  }
  config.telegram.botToken = merged.TELEGRAM_BOT_TOKEN || '';
  config.telegram.adminChatId = merged.TELEGRAM_ADMIN_CHAT_ID || '';
  config.whatsapp.phoneNumberId = merged.WHATSAPP_PHONE_NUMBER_ID || '';
  config.whatsapp.accessToken = merged.WHATSAPP_ACCESS_TOKEN || '';
  config.facebook.pageAccessToken = merged.FB_PAGE_ACCESS_TOKEN || '';
  config.instagram.pageAccessToken = merged.INSTAGRAM_ACCESS_TOKEN || merged.FB_PAGE_ACCESS_TOKEN || '';
  config.ai.geminiApiKey = merged.GEMINI_API_KEY || '';
  config.ai.openrouterApiKey = merged.OPENROUTER_API_KEY || '';
  config.ai.businessName = merged.BUSINESS_NAME || 'BWB Media';

  // If Telegram token was provided or updated, re-initialize Telegram
  if (merged.TELEGRAM_BOT_TOKEN) {
    try {
      initTelegram();
    } catch (e) {
      console.error('[Settings] Re-init telegram failed:', e.message);
    }
  }
}

// API: Get Channel Connection Statuses & Config
router.get('/api/settings/channels', (req, res) => {
  const qrStatus = whatsappQr.getQrStatus();
  res.json({
    telegram: {
      isConfigured: !!config.telegram.botToken,
      botToken: config.telegram.botToken ? `${config.telegram.botToken.slice(0, 8)}...${config.telegram.botToken.slice(-4)}` : '',
      adminChatId: config.telegram.adminChatId || ''
    },
    facebook: {
      isConfigured: !!config.facebook.pageAccessToken,
      token: config.facebook.pageAccessToken ? `${config.facebook.pageAccessToken.slice(0, 10)}...` : '',
      verifyToken: config.metaVerifyToken
    },
    instagram: {
      isConfigured: !!config.instagram.pageAccessToken,
      token: config.instagram.pageAccessToken ? `${config.instagram.pageAccessToken.slice(0, 10)}...` : '',
      verifyToken: config.metaVerifyToken
    },
    whatsapp: {
      cloudApiConfigured: !!config.whatsapp.accessToken,
      qrStatus: qrStatus.status,
      qrPhone: qrStatus.phone
    },
    ai: {
      isConfigured: !!config.ai.geminiApiKey,
      businessName: config.ai.businessName
    }
  });
});

// API: Save settings
router.post('/api/settings/save', (req, res) => {
  try {
    const {
      telegramBotToken,
      telegramAdminChatId,
      fbPageAccessToken,
      instagramAccessToken,
      metaVerifyToken,
      whatsappPhoneNumberId,
      whatsappAccessToken,
      geminiApiKey,
      googleSheetWebhookUrl
    } = req.body;

    const updates = {};
    if (telegramBotToken !== undefined) updates.TELEGRAM_BOT_TOKEN = telegramBotToken.trim();
    if (telegramAdminChatId !== undefined) updates.TELEGRAM_ADMIN_CHAT_ID = telegramAdminChatId.trim();
    if (fbPageAccessToken !== undefined) updates.FB_PAGE_ACCESS_TOKEN = fbPageAccessToken.trim();
    if (instagramAccessToken !== undefined) updates.INSTAGRAM_ACCESS_TOKEN = instagramAccessToken.trim();
    if (metaVerifyToken !== undefined) updates.META_VERIFY_TOKEN = metaVerifyToken.trim();
    if (whatsappPhoneNumberId !== undefined) updates.WHATSAPP_PHONE_NUMBER_ID = whatsappPhoneNumberId.trim();
    if (whatsappAccessToken !== undefined) updates.WHATSAPP_ACCESS_TOKEN = whatsappAccessToken.trim();
    if (geminiApiKey !== undefined) updates.GEMINI_API_KEY = geminiApiKey.trim();
    if (googleSheetWebhookUrl !== undefined) updates.GOOGLE_SHEET_WEBHOOK_URL = googleSheetWebhookUrl.trim();

    updateEnvFile(updates);
    res.json({ success: true, message: 'Settings saved and applied successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Test Telegram connection
router.post('/api/settings/test-telegram', async (req, res) => {
  const { botToken, chatId } = req.body;
  const token = botToken || config.telegram.botToken;
  const chat = chatId || config.telegram.adminChatId;

  if (!token || !chat) {
    return res.status(400).json({ success: false, error: 'Telegram Bot Token and Chat ID are required!' });
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const resp = await axios.post(url, {
      chat_id: chat,
      text: `🎉 *BWB Media Bot Connected!* 🚀\n\nYour Telegram integration is working perfectly. You will now receive instant lead alerts here!`,
      parse_mode: 'Markdown'
    });
    res.json({ success: true, message: 'Test message sent successfully to Telegram!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.description || err.message });
  }
});

// API: Test Meta / Facebook / Instagram token
router.post('/api/settings/test-meta', async (req, res) => {
  const { token } = req.body;
  const targetToken = token || config.facebook.pageAccessToken;

  if (!targetToken) {
    return res.status(400).json({ success: false, error: 'Page Access Token is required!' });
  }

  try {
    const url = `https://graph.facebook.com/${config.facebook.apiVersion}/me?access_token=${targetToken}&fields=id,name`;
    const resp = await axios.get(url);
    res.json({ success: true, page: resp.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.error?.message || err.message });
  }
});

// Web UI: Channel Connection Hub Page
router.get(['/channels', '/settings'], (req, res) => {
  const env = readEnvFile();
  const qrStatus = whatsappQr.getQrStatus();
  const publicUrl = tunnelService.getPublicUrl();

  const contentHtml = `
  <style>
    .container { max-width: 1100px; margin: 0 auto; }
    .hero { margin-bottom: 25px; }
    .hero h2 { font-size: 24px; margin: 0 0 8px 0; color: white; }
    .hero p { color: #94a3b8; font-size: 14px; margin: 0; }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 24px; }
    @media(max-width: 768px) { .grid { grid-template-columns: 1fr; } }

    .card { background: #1e293b; border-radius: 14px; border: 1px solid #334155; padding: 24px; display: flex; flex-direction: column; justify-content: space-between; position: relative; }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
    .channel-title { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 600; }
    .badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .badge-connected { background: #064e3b; color: #34d399; border: 1px solid #059669; }
    .badge-disconnected { background: #7f1d1d; color: #f87171; border: 1px solid #dc2626; }
    .badge-warning { background: #78350f; color: #fbbf24; border: 1px solid #d97706; }

    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: 13px; font-weight: 500; color: #cbd5e1; margin-bottom: 6px; }
    .form-group input { width: 100%; padding: 10px 14px; background: #0f172a; border: 1px solid #475569; border-radius: 8px; color: white; font-size: 14px; outline: none; }
    .form-group input:focus { border-color: #38bdf8; }
    .form-help { font-size: 11px; color: #64748b; margin-top: 4px; }

    .card-actions { display: flex; gap: 10px; margin-top: 18px; }
    .btn { padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: background 0.2s; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; }
    .btn-primary { background: #0284c7; color: white; }
    .btn-primary:hover { background: #0369a1; }
    .btn-secondary { background: #334155; color: #e2e8f0; }
    .btn-secondary:hover { background: #475569; }
    .btn-success { background: #16a34a; color: white; }
    .btn-success:hover { background: #15803d; }

    .save-bar { position: sticky; bottom: 20px; background: #1e293b; padding: 16px 24px; border-radius: 12px; border: 1px solid #38bdf8; box-shadow: 0 10px 30px rgba(0,0,0,0.5); display: flex; justify-content: space-between; align-items: center; margin-top: 30px; }
    .save-status { font-size: 14px; font-weight: 500; }
  </style>

  <div class="container">
    <div class="hero">
      <h2>Omnichannel Integration Center</h2>
      <p>Connect Telegram, Instagram, Facebook, and WhatsApp to manage leads seamlessly from one central dashboard.</p>
    </div>

    ${publicUrl ? `
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); border: 2px solid #38bdf8; border-radius: 14px; padding: 18px 24px; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
        <div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:20px;">🌐</span>
            <b style="color:white; font-size:16px;">Live Cloudflare Public HTTPS Link Active</b>
            <span style="background:#064e3b; color:#34d399; border:1px solid #059669; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700;">LIVE INTERNET</span>
          </div>
          <div style="color:#94a3b8; font-size:13px; margin-top:6px;">
            Dashboard: <a href="${publicUrl}/login" target="_blank" style="color:#38bdf8; font-weight:600;">${publicUrl}/login</a>
            <span style="margin: 0 8px; color:#475569;">•</span>
            Meta Webhook: <code style="color:#34d399; background:#0f172a; padding:2px 6px; border-radius:4px;">${publicUrl}/webhook</code>
          </div>
        </div>
        <a href="${publicUrl}/login" target="_blank" class="btn btn-primary" style="font-size:13px;">🔗 Open Live Link</a>
      </div>
    ` : ''}

    <form id="settingsForm" onsubmit="saveAllSettings(event)">
      <div class="grid">
        
        <!-- TELEGRAM CARD -->
        <div class="card">
          <div>
            <div class="card-header">
              <div class="channel-title">
                <span style="font-size:24px;">✈️</span> Telegram Bot
              </div>
              <span class="badge ${env.TELEGRAM_BOT_TOKEN ? 'badge-connected' : 'badge-disconnected'}">
                ${env.TELEGRAM_BOT_TOKEN ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            <p style="color:#94a3b8; font-size:13px; margin-bottom:16px;">
              Receive instant lead cards directly on Telegram and let customers talk to your bot on Telegram.
            </p>
            <div class="form-group">
              <label>Telegram Bot Token (from @BotFather)</label>
              <input type="text" name="telegramBotToken" value="${env.TELEGRAM_BOT_TOKEN || ''}" placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ" />
              <div class="form-help">Create a bot on Telegram via @BotFather and paste the API token here.</div>
            </div>
            <div class="form-group">
              <label>Admin Telegram Chat ID</label>
              <input type="text" name="telegramAdminChatId" value="${env.TELEGRAM_ADMIN_CHAT_ID || ''}" placeholder="e.g. 108928374 or group chat ID" />
              <div class="form-help">Send /start to @userinfobot on Telegram to get your numeric Chat ID.</div>
            </div>
          </div>
          <div class="card-actions">
            <button type="button" class="btn btn-secondary" onclick="testTelegram()">🔔 Test Ping Alert</button>
            <a href="https://t.me/BotFather" target="_blank" class="btn btn-secondary">Get Token</a>
          </div>
        </div>

        <!-- INSTAGRAM & FACEBOOK CARD -->
        <div class="card">
          <div>
            <div class="card-header">
              <div class="channel-title">
                <span style="font-size:24px;">📸</span> Instagram & Facebook
              </div>
              <span class="badge ${env.FB_PAGE_ACCESS_TOKEN ? 'badge-connected' : 'badge-disconnected'}">
                ${env.FB_PAGE_ACCESS_TOKEN ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            <p style="color:#94a3b8; font-size:13px; margin-bottom:16px;">
              Manage Instagram DMs, Story replies, Facebook Messenger, and Post comments automatically.
            </p>
            <div class="form-group">
              <label>Meta Page Access Token</label>
              <input type="password" name="fbPageAccessToken" value="${env.FB_PAGE_ACCESS_TOKEN || ''}" placeholder="EAAgy7UrDibM..." />
              <div class="form-help">From Meta Developer Portal -> Facebook App -> Graph API Explorer.</div>
            </div>
            <div class="form-group">
              <label>Meta Webhook Verify Token</label>
              <input type="text" name="metaVerifyToken" value="${env.META_VERIFY_TOKEN || 'my_secure_lead_bot_token_123'}" />
              <div class="form-help">Paste this exact token in Meta App Webhook Callback Verification.</div>
            </div>
          </div>
          <div class="card-actions">
            <button type="button" class="btn btn-secondary" onclick="testMetaToken()">🔍 Verify Token</button>
            <a href="https://developers.facebook.com/apps" target="_blank" class="btn btn-secondary">Meta Portal</a>
          </div>
        </div>

        <!-- WHATSAPP CARD -->
        <div class="card">
          <div>
            <div class="card-header">
              <div class="channel-title">
                <span style="font-size:24px;">📱</span> WhatsApp (QR & Cloud API)
              </div>
              <span class="badge ${qrStatus.status === 'connected' ? 'badge-connected' : (env.WHATSAPP_ACCESS_TOKEN ? 'badge-connected' : 'badge-warning')}">
                ${qrStatus.status === 'connected' ? 'QR Connected' : (env.WHATSAPP_ACCESS_TOKEN ? 'Cloud API Active' : 'QR Scan Ready')}
              </span>
            </div>
            <p style="color:#94a3b8; font-size:13px; margin-bottom:16px;">
              Supports both your personal/business WhatsApp number via QR scan AND Official Cloud API.
            </p>
            <div class="form-group">
              <label>WhatsApp QR Connection</label>
              <div style="background:#0f172a; padding:12px; border-radius:8px; border:1px solid #475569; font-size:13px;">
                Status: <strong>${qrStatus.status.toUpperCase()}</strong> ${qrStatus.phone ? `(${qrStatus.phone})` : ''}
              </div>
            </div>
            <div class="form-group">
              <label>WhatsApp Cloud API Phone Number ID (Optional)</label>
              <input type="text" name="whatsappPhoneNumberId" value="${env.WHATSAPP_PHONE_NUMBER_ID || ''}" placeholder="e.g. 1435952676264522" />
            </div>
          </div>
          <div class="card-actions">
            <a href="/qr" class="btn btn-primary">📲 Open WhatsApp QR Scanner</a>
          </div>
        </div>

        <!-- AI BRAIN & GOOGLE SHEETS CARD -->
        <div class="card">
          <div>
            <div class="card-header">
              <div class="channel-title">
                <span style="font-size:24px;">🧠</span> AI Brain & Google Sheets
              </div>
              <span class="badge ${env.GEMINI_API_KEY ? 'badge-connected' : 'badge-warning'}">
                ${env.GEMINI_API_KEY ? 'AI Active' : 'Rule-Based Active'}
              </span>
            </div>
            <p style="color:#94a3b8; font-size:13px; margin-bottom:16px;">
              Gemini AI powers natural conversations, human-like voice, budget extraction, and audio transcription.
            </p>
            <div class="form-group">
              <label>Google Gemini API Key</label>
              <input type="password" name="geminiApiKey" value="${env.GEMINI_API_KEY || ''}" placeholder="AIzaSy..." />
              <div class="form-help">Free API Key from Google AI Studio (aistudio.google.com).</div>
            </div>
            <div class="form-group">
              <label>Google Sheets Sync Webhook URL (Optional)</label>
              <input type="text" name="googleSheetWebhookUrl" value="${env.GOOGLE_SHEET_WEBHOOK_URL || ''}" placeholder="https://script.google.com/macros/s/..." />
              <div class="form-help">Syncs new leads directly to your Google Spreadsheet in real time.</div>
            </div>
          </div>
          <div class="card-actions">
            <a href="/download/leads.csv" class="btn btn-secondary">📥 Download Leads CSV</a>
          </div>
        </div>

      </div>

      <div class="save-bar">
        <div class="save-status" id="saveStatus">Changes apply immediately without downtime.</div>
        <button type="submit" class="btn btn-success" style="font-size:15px; padding:12px 28px;">💾 Save & Apply All Settings</button>
      </div>
    </form>
  </div>

  <script>
    async function saveAllSettings(e) {
      e.preventDefault();
      const form = document.getElementById('settingsForm');
      const formData = new FormData(form);
      const data = {};
      formData.forEach((val, key) => data[key] = val);

      const statusEl = document.getElementById('saveStatus');
      statusEl.innerHTML = '⏳ Saving settings and updating runtime config...';

      try {
        const res = await fetch('/api/settings/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
          statusEl.innerHTML = '✅ <span style="color:#34d399;">All settings saved and applied successfully!</span>';
          setTimeout(() => location.reload(), 1500);
        } else {
          statusEl.innerHTML = '❌ Error: ' + result.error;
        }
      } catch (err) {
        statusEl.innerHTML = '❌ Connection failed: ' + err.message;
      }
    }

    async function testTelegram() {
      const token = document.querySelector('input[name="telegramBotToken"]').value;
      const chat = document.querySelector('input[name="telegramAdminChatId"]').value;
      if (!token || !chat) {
        alert('Please enter both Telegram Bot Token and Admin Chat ID first!');
        return;
      }
      const res = await fetch('/api/settings/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: token, chatId: chat })
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 Success! Check your Telegram, test lead alert sent!');
      } else {
        alert('❌ Telegram Test Error: ' + data.error);
      }
    }

    async function testMetaToken() {
      const token = document.querySelector('input[name="fbPageAccessToken"]').value;
      if (!token) {
        alert('Please enter Meta Page Access Token first!');
        return;
      }
      const res = await fetch('/api/settings/test-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Meta Token Valid! Connected Page: ' + data.page.name + ' (ID: ' + data.page.id + ')');
      } else {
        alert('❌ Meta Token Error: ' + data.error);
      }
    }
  </script>
  </div>
  `;

  const html = renderSidebarLayout({
    title: 'Channel Integration Center',
    activeNav: 'channels',
    contentHtml
  });

  res.send(html);
});

module.exports = router;

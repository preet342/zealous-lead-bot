const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Single-Instance Lock: Terminate any old lingering server instance
const LOCK_FILE = path.join(__dirname, '../data/server.pid');
try {
  if (fs.existsSync(LOCK_FILE)) {
    const oldPid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    if (oldPid && !isNaN(Number(oldPid)) && Number(oldPid) !== process.pid) {
      try {
        console.log(`[Server] Terminating lingering server instance PID: ${oldPid}`);
        process.kill(Number(oldPid), 'SIGKILL');
      } catch (e) {}
    }
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
} catch (e) {}

process.on('exit', () => {
  try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch (e) {}
});

// Crash Guards: Keep server alive 24/7 even if unhandled errors occur
process.on('uncaughtException', (err) => {
  console.error('🛡️ [CRASH GUARD] Caught Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('🛡️ [CRASH GUARD] Caught Unhandled Rejection:', reason?.message || reason);
});

const webhookRoutes = require('./routes/webhookRoutes');
const leadRoutes = require('./routes/leadRoutes');
const inboxRoutes = require('./routes/inboxRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const groupRoutes = require('./routes/groupRoutes');
const authRoutes = require('./routes/authRoutes');
const trainingRoutes = require('./routes/trainingRoutes');
const { requireAuth } = require('./services/authService');
const { initTelegram } = require('./channels/telegram');
const { initWhatsAppQr } = require('./channels/whatsappQr');
const { initScheduler } = require('./services/schedulerService');
const whatsapp = require('./channels/whatsapp');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// JSON parsing error handler to prevent HTML 413 or 400 responses
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError || err.type === 'entity.too.large' || err.status === 413) {
    return res.status(err.status || 400).json({ success: false, error: err.message || 'Payload too large or invalid JSON' });
  }
  next(err);
});

// Lightweight ping endpoint for Cron-Job keep-alive (Ultra-small response to avoid "output too large")
app.get('/ping', (req, res) => {
  res.type('text/plain').send('OK');
});

// Health check & root endpoint
app.get('/', (req, res) => {
  // If browser visit, redirect to dashboard (or login)
  const isHtml = req.headers.accept && req.headers.accept.includes('text/html');
  if (isHtml) {
    return res.redirect('/groups');
  }

  res.json({
    status: 'online',
    system: 'Omnichannel AI Lead Generation Bot',
    business: config.ai.businessName,
    channels: {
      telegram: config.telegram.botToken ? 'Configured' : 'Missing Token',
      whatsappCloudApi: config.whatsapp.accessToken ? 'Configured' : 'Missing Token',
      whatsappQrScan: 'Ready to scan at /qr',
      facebook: config.facebook.pageAccessToken ? 'Configured' : 'Missing Token',
      instagram: config.instagram.pageAccessToken ? 'Configured' : 'Missing Token'
    },
    endpoints: {
      login: '/login',
      liveInbox: '/inbox',
      leadsDashboard: '/leads',
      whatsappQrScan: '/qr',
      webhook: '/webhook',
      leadsApi: '/api/leads',
      downloadCsv: '/download/leads.csv'
    }
  });
});

// Public Routes (Webhooks & Login)
app.use('/', webhookRoutes);
app.use('/', authRoutes);

// Protected Dashboard & Marketing Studio Routes (Require Auth)
app.use('/', requireAuth, leadRoutes);
app.use('/', requireAuth, inboxRoutes);
app.use('/', requireAuth, settingsRoutes);
app.use('/', requireAuth, campaignRoutes);
app.use('/', requireAuth, groupRoutes);
app.use('/', requireAuth, trainingRoutes);

// Start server
app.listen(config.port, () => {
  console.log(`=================================================`);
  console.log(`🚀 Omnichannel AI Lead Bot Server is running!`);
  console.log(`🌐 Local URL:         http://localhost:${config.port}`);
  console.log(`📨 Unified Live Inbox: http://localhost:${config.port}/inbox`);
  console.log(`📊 Leads Dashboard:   http://localhost:${config.port}/leads`);
  console.log(`⚙️ Channels Hub:      http://localhost:${config.port}/channels`);
  console.log(`📱 WhatsApp QR Scan:  http://localhost:${config.port}/qr`);
  console.log(`🔗 Webhook URL:       http://localhost:${config.port}/webhook`);
  console.log(`=================================================`);

  // Start Telegram Bot
  initTelegram();

  // Start WhatsApp QR Listener
  initWhatsAppQr();

  // Start Inactivity Follow-up Scheduler
  initScheduler(async (channel, userId, text) => {
    if (channel === 'whatsapp') {
      await whatsapp.sendWhatsAppMessage(userId, text);
    } else if (channel === 'whatsapp_qr') {
      const whatsappQr = require('./channels/whatsappQr');
      await whatsappQr.sendWhatsAppQrMessage(userId, text);
    }
  });
});

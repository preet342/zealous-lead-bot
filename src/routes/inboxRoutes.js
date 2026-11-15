const express = require('express');
const router = express.Router();
const chatManager = require('../services/chatManager');
const googleSheetsService = require('../services/googleSheetsService');
const whatsapp = require('../channels/whatsapp');
const whatsappQr = require('../channels/whatsappQr');
const facebook = require('../channels/facebook');
const instagram = require('../channels/instagram');
const aiService = require('../services/aiService');
const { renderSidebarLayout } = require('../views/sidebarLayout');

// Allow large payloads for sending image & document attachments (up to 25MB)
router.use(express.json({ limit: '25mb' }));
router.use(express.urlencoded({ extended: true, limit: '25mb' }));

// API: Get all active chats (supports ?summary=true for fast lightweight sync)
router.get('/api/chats', (req, res) => {
  const isSummary = req.query.summary === 'true' || req.query.summary === '1';
  res.json(chatManager.getAllConversations({ summary: isSummary }));
});

// API: Get single chat with full messages for active conversation view
router.get('/api/chats/:channel/:userId', (req, res) => {
  const { channel, userId } = req.params;
  res.json(chatManager.getConversation(channel, userId));
});

// API: Toggle Human Takeover
router.post('/api/chats/takeover', (req, res) => {
  const { channel, userId, enabled } = req.body;
  const result = chatManager.toggleHumanTakeover(channel, userId, !!enabled);
  res.json({ success: true, conversation: result });
});

// API: Clear Single Chat Messages (Syncs with Mobile WhatsApp)
router.post('/api/chats/clear', (req, res) => {
  try {
    const { channel, userId } = req.body;
    if (!channel || !userId) {
      return res.status(400).json({ success: false, error: 'channel and userId are required.' });
    }
    const result = chatManager.clearConversationMessages(channel, userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Delete Single Chat (Syncs with Mobile WhatsApp)
router.post('/api/chats/delete', (req, res) => {
  try {
    const { channel, userId } = req.body;
    if (!channel || !userId) {
      return res.status(400).json({ success: false, error: 'channel and userId are required.' });
    }
    const result = chatManager.deleteConversation(channel, userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Bulk Delete Conversations
router.post('/api/chats/bulk-delete', (req, res) => {
  try {
    const { keys, all, channel } = req.body;
    if (!all && (!keys || !Array.isArray(keys) || keys.length === 0)) {
      return res.status(400).json({ success: false, error: 'No conversations selected for deletion.' });
    }
    const result = chatManager.bulkDeleteConversations(keys, { all: !!all, channel });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Bulk Close / Resolve Conversations
router.post('/api/chats/bulk-close', (req, res) => {
  try {
    const { keys, status, all, channel } = req.body;
    if (!all && (!keys || !Array.isArray(keys) || keys.length === 0)) {
      return res.status(400).json({ success: false, error: 'No conversations selected to close.' });
    }
    const result = chatManager.bulkCloseConversations(keys, status || 'resolved', { all: !!all, channel });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Send manual agent text reply to user
router.post('/api/chats/send', async (req, res) => {
  const { channel, userId, text } = req.body;
  if (!text || !userId) return res.status(400).json({ error: 'Text and userId required' });

  try {
    // 1. Log to chat history
    chatManager.logMessage(channel, userId, 'agent', text);

    // 2. Deliver message to platform
    if (channel === 'whatsapp') {
      await whatsapp.sendWhatsAppMessage(userId, text);
    } else if (channel === 'whatsapp_qr') {
      await whatsappQr.sendWhatsAppQrMessage(userId, text);
    } else if (channel === 'facebook') {
      await facebook.sendFacebookMessage(userId, text);
    } else if (channel === 'instagram') {
      await instagram.sendInstagramMessage(userId, text);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Send Attachment (Photo, Document, PDF, Audio)
router.post('/api/chats/send-media', async (req, res) => {
  try {
    const { channel, userId, fileBase64, fileName, fileType, caption } = req.body;
    if (!userId || !fileBase64) {
      return res.status(400).json({ success: false, error: 'userId and fileBase64 required' });
    }

    const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const buffer = Buffer.from(base64Data, 'base64');
    const isImage = fileType ? fileType.startsWith('image/') : false;

    // 1. Log media to chat history
    const mediaLabel = isImage 
      ? (caption ? `📷 Photo: ${caption}` : '📷 Photo') 
      : `📄 ${fileName || 'Document'}${caption ? ' - ' + caption : ''}`;

    chatManager.logMessage(channel, userId, 'agent', mediaLabel, {
      isMedia: true,
      mediaType: isImage ? 'image' : 'document',
      fileName: fileName || (isImage ? 'image.jpg' : 'document.pdf'),
      timestamp: new Date().toISOString()
    });

    // 2. Deliver via active channel
    if (channel === 'whatsapp_qr') {
      if (isImage) {
        await whatsappQr.sendWhatsAppQrImage(userId, buffer, caption || '');
      } else {
        await whatsappQr.sendWhatsAppQrDocument(userId, buffer, fileName || 'document.pdf', caption || '');
      }
    }

    res.json({ success: true, message: 'Attachment delivered successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: AI Assist & Polish
router.post('/api/chats/ai-assist', async (req, res) => {
  try {
    const { channel, userId, currentText } = req.body;
    const conv = chatManager.getConversation(channel, userId);
    const lastMsg = (conv.messages || []).slice(-1)[0]?.text || '';
    const prompt = currentText 
      ? `Polish this customer response politely and naturally in Hindi/Hinglish: "${currentText}"`
      : (lastMsg ? `Draft a polite, helpful reply to this customer message: "${lastMsg}"` : 'Namaste! How can I help you today?');
    
    let reply = await aiService.callLivingHumanGemini(channel, userId, prompt, {});
    if (!reply) {
      reply = currentText 
        ? `Haan bilkul! ${currentText}` 
        : 'Namaste ji! Kaise hain aap? BWB Media me aapka swagat hai. Main aapki kya sahayata kar sakta hoon?';
    }
    res.json({ success: true, suggestion: reply });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Quick Action - Generate & Send Payment Link
router.post('/api/chats/payment-link', async (req, res) => {
  try {
    const { channel, userId, amount, description } = req.body;
    if (!userId || !amount) {
      return res.status(400).json({ success: false, error: 'userId and amount required' });
    }
    const upiLink = `upi://pay?pa=7008872017.wallet@phonepe&pn=BWB%20Media&am=${encodeURIComponent(amount)}&tn=${encodeURIComponent(description || 'Services Payment')}&cu=INR`;
    const webPayLink = `https://rzp.io/l/bwb-pay?amount=${encodeURIComponent(amount)}`;
    const msgText = `💳 Payment Request Generated\n\n📌 Service: ${description || 'Marketing & Media'}\n💵 Amount: ₹${amount}\n\n👉 Click here to pay via PhonePe / UPI:\n${upiLink}\n\n🆔 UPI ID: 7008872017.wallet@phonepe\n\n🌐 Or Web Card / NetBanking:\n${webPayLink}\n\nPlease share screenshot after payment for instant confirmation!`;
    
    chatManager.logMessage(channel, userId, 'agent', msgText);
    if (channel === 'whatsapp_qr') {
      await whatsappQr.sendWhatsAppQrMessage(userId, msgText);
    }
    res.json({ success: true, upiLink, webPayLink, message: 'Payment link generated and sent to customer.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Quick Action - Book Slot
router.post('/api/chats/book-slot', async (req, res) => {
  try {
    const { channel, userId, date, time, title } = req.body;
    if (!userId || !date || !time) {
      return res.status(400).json({ success: false, error: 'userId, date and time required' });
    }
    const result = chatManager.bookAppointment(channel, userId, { date, time, title });
    const msgText = `🗓️ Appointment Confirmed!\n\n📌 Topic: ${title || 'One-on-One Consultation'}\n📅 Date: ${date}\n⏰ Time: ${time}\n👤 Meeting with: Biswajit Ekka (BWB Media)\n\nWe look forward to connecting with you. If you need to reschedule, simply reply here!`;
    
    chatManager.logMessage(channel, userId, 'agent', msgText);
    if (channel === 'whatsapp_qr') {
      await whatsappQr.sendWhatsAppQrMessage(userId, msgText);
    }
    res.json({ success: true, appointment: result.appointment, message: 'Appointment booked and confirmation sent.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Quick Action - Send Quotation
router.post('/api/chats/quotation', async (req, res) => {
  try {
    const { channel, userId, service, amount, discount, notes } = req.body;
    if (!userId || !amount) {
      return res.status(400).json({ success: false, error: 'userId and amount required' });
    }
    const result = chatManager.addQuotation(channel, userId, { service, amount, discount, notes });
    const q = result.quotation;
    const msgText = `📄 Official Quotation • BWB Media\n\n📌 Solution: ${q.service}\n💵 Estimated Total: ₹${q.amount}\n🎁 Special Discount: ₹${q.discount || 0}\n✅ Net Payable: ₹${q.finalAmount}\n\n📝 Notes: ${q.notes || 'Full delivery including revisions & dedicated support.'}\n\n⏰ Valid for 7 Days. Reply 'YES' to confirm and get started!`;

    chatManager.logMessage(channel, userId, 'agent', msgText);
    if (channel === 'whatsapp_qr') {
      await whatsappQr.sendWhatsAppQrMessage(userId, msgText);
    }
    res.json({ success: true, quotation: q, message: 'Quotation created and sent.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Quick Action - Add Note
router.post('/api/chats/notes', (req, res) => {
  try {
    const { channel, userId, text, author } = req.body;
    if (!userId || !text) {
      return res.status(400).json({ success: false, error: 'userId and text required' });
    }
    const result = chatManager.addNote(channel, userId, text, author || 'biswa342');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Quick Action - Assign Chat
router.post('/api/chats/assign', (req, res) => {
  try {
    const { channel, userId, owner } = req.body;
    if (!userId || !owner) {
      return res.status(400).json({ success: false, error: 'userId and owner required' });
    }
    const result = chatManager.updateChatOwner(channel, userId, owner);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Quick Action - Update Stage
router.post('/api/chats/stage', (req, res) => {
  try {
    const { channel, userId, stage } = req.body;
    if (!userId || !stage) {
      return res.status(400).json({ success: false, error: 'userId and stage required' });
    }
    const result = chatManager.updateLeadStage(channel, userId, stage);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Quick Action - AI Call Trigger
router.post('/api/chats/ai-call', async (req, res) => {
  try {
    const { channel, userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }
    const msgText = `📞 [AI Voice Assistant] Namaste ji! Biswajit ji ki team se AI voice assistant ne aapko connect kiya hai. Hum aapse agle 5 minute me call connect kar rahe hain.`;
    chatManager.logMessage(channel, userId, 'agent', msgText);
    if (channel === 'whatsapp_qr') {
      await whatsappQr.sendWhatsAppQrMessage(userId, msgText);
    }
    res.json({ success: true, message: 'AI Voice Call initiated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Download Leads CSV
router.get('/download/leads.csv', (req, res) => {
  const csvPath = googleSheetsService.getCsvPath();
  res.download(csvPath, 'BWB_Panel_Leads.csv');
});

// Full BWB PANEL-Style Live Chat Inbox Web UI
router.get('/inbox', (req, res) => {
  const conversations = chatManager.getAllConversations();

  // Helper to safely escape strings for server-rendered HTML
  const escapeHtmlHelper = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const recentConvos = conversations.filter(c => c.channel === 'whatsapp_qr' && (c.messages && c.messages.length > 0));
  const leadConvos = conversations.filter(c => c.isLead || (!c.messages || c.messages.length === 0));
  const qrTotalCount = recentConvos.length;
  const leadTotalCount = leadConvos.length;
  const allTotalCount = conversations.length;

  // Pre-render initial conversation cards for WhatsApp Recent on the server for instant zero-lag display
  const initialConvosToRender = recentConvos.length > 0 ? recentConvos : conversations;
  const initialConvoHtml = (initialConvosToRender.length === 0)
    ? '<div style="padding:32px 16px; text-align:center; color:#94a3b8; font-size:13px;">No conversations yet. Scan QR or wait for leads!</div>'
    : initialConvosToRender.map((c, index) => {
        const isActive = (index === 0);
        const lastMsgObj = c.messages && c.messages.length ? c.messages[c.messages.length - 1] : null;
        const lastText = lastMsgObj ? lastMsgObj.text : 'New lead connected';
        const displayName = c.displayName || c.userName || ('+' + c.userId);
        const cleanName = displayName.startsWith('+') ? displayName.substring(1) : displayName;
        const initial = cleanName.charAt(0).toUpperCase() || 'U';

        let dateStr = 'Today';
        if (lastMsgObj && lastMsgObj.timestamp) {
          const d = new Date(lastMsgObj.timestamp);
          dateStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const phoneDisplay = c.formattedPhone || (c.purePhone ? ('+' + c.purePhone) : (String(c.userId).endsWith('@lid') ? 'WhatsApp Contact' : ('+' + c.userId)));
        const convoKey = `${escapeHtmlHelper(c.channel)}:${escapeHtmlHelper(c.userId)}`;
        const leadBadge = c.isLead 
          ? `<span style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; font-size:10px; font-weight:700; padding:1px 6px; border-radius:9999px; margin-left:6px;">🎯 Lead</span>` 
          : '';

        return `<div class="convo-card ${isActive ? 'active' : ''}" data-channel="${escapeHtmlHelper(c.channel)}" data-userid="${escapeHtmlHelper(c.userId)}" onclick="selectChatCard(this)">
          <div class="convo-checkbox-wrap" style="display:none;" onclick="event.stopPropagation()">
            <input type="checkbox" class="convo-checkbox" value="${convoKey}" onchange="onConvoCheckboxChanged()">
          </div>
          <div class="convo-avatar-circle">
            ${initial}
            <div class="convo-avatar-dot"></div>
          </div>
          <div class="convo-meta">
            <div class="convo-meta-header">
              <span class="convo-name">${escapeHtmlHelper(displayName)}${leadBadge}</span>
              <span class="convo-date">${dateStr}</span>
            </div>
            <div style="font-size:11px; color:#94a3b8; margin-bottom:2px;">${escapeHtmlHelper(phoneDisplay)}</div>
            <div class="convo-snippet">${c.isHumanTakeover ? '🛑 [Human] ' : ''}${escapeHtmlHelper(lastText)}</div>
          </div>
        </div>`;
      }).join('');

  const contentHtml = `
  <style>
    .content-area { padding: 0 !important; }
    
    /* 3-COLUMN INBOX WRAPPER */
    .inbox-screen {
      height: calc(100vh - 64px);
      display: flex;
      background: #ffffff;
      color: #0f172a;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    /* =========================================
       COLUMN 1: CONVERSATIONS LIST (LEFT)
       ========================================= */
    .col-convos {
      width: 320px;
      min-width: 300px;
      max-width: 340px;
      background: #ffffff;
      border-right: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .convo-search-bar {
      padding: 12px 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid #f1f5f9;
    }
    .convo-search-wrap {
      position: relative;
      flex: 1;
    }
    .convo-search-wrap > svg {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #94a3b8;
    }
    .btn-search-voice {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-search-voice:hover {
      background: #e2e8f0;
      color: #0284c7;
    }
    .btn-search-voice.recording {
      background: #fee2e2;
      color: #ef4444;
      animation: voicePulse 1s infinite alternate;
    }
    @keyframes voicePulse {
      0% { transform: translateY(-50%) scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
      100% { transform: translateY(-50%) scale(1.15); box-shadow: 0 0 0 6px rgba(239,68,68,0); }
    }
    .convo-search-input {
      width: 100%;
      height: 38px;
      border-radius: 9999px;
      background: #f1f5f9;
      border: 1px solid transparent;
      padding: 0 36px 0 34px;
      font-size: 13px;
      color: #0f172a;
      outline: none;
      transition: all 0.2s;
    }
    .convo-search-input:focus {
      background: #ffffff;
      border-color: #0284c7;
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
    }
    .btn-circle-action {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      color: #64748b;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    .btn-circle-action:hover {
      background: #f8fafc;
      color: #0f172a;
      border-color: #cbd5e1;
    }
    .btn-circle-dark {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
      font-size: 18px;
      font-weight: 600;
    }
    .btn-circle-dark:hover {
      background: #1e293b;
      color: #ffffff;
    }

    /* Channel Filter Pills */
    .chan-filter-pills {
      padding: 8px 12px;
      display: flex;
      gap: 6px;
      overflow-x: auto;
      border-bottom: 1px solid #f1f5f9;
    }
    .chan-filter-pills::-webkit-scrollbar { display: none; }
    .chan-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11.5px;
      font-weight: 600;
      background: #f1f5f9;
      color: #475569;
      border: 1px solid transparent;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s;
    }
    .chan-pill:hover {
      background: #e2e8f0;
      color: #0f172a;
    }
    .chan-pill.active {
      background: #0f172a;
      color: #ffffff;
    }
    .chan-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }
    .chan-dot.green { background: #22c55e; }
    .chan-dot.red { background: #ef4444; }

    /* Category Filter Tabs: All Chats vs WhatsApp Recent vs CRM Leads */
    .category-tabs-strip {
      padding: 6px 10px;
      display: flex;
      gap: 6px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      overflow-x: auto;
    }
    .category-tabs-strip::-webkit-scrollbar { display: none; }
    .category-tab-btn {
      padding: 5px 12px;
      font-size: 11.5px;
      font-weight: 600;
      border-radius: 9999px;
      background: #ffffff;
      color: #64748b;
      border: 1px solid #cbd5e1;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease-in-out;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .category-tab-btn:hover {
      background: #f1f5f9;
      color: #0f172a;
      border-color: #94a3b8;
    }
    .category-tab-btn.active {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
      font-weight: 700;
    }

    /* Status Subtabs */
    .status-tabs-strip {
      padding: 6px 12px;
      display: flex;
      gap: 12px;
      overflow-x: auto;
      border-bottom: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
    }
    .status-tabs-strip::-webkit-scrollbar { display: none; }
    .status-tab-btn {
      padding: 4px 2px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      position: relative;
    }
    .status-tab-btn.active {
      color: #0f172a;
      font-weight: 700;
    }
    .status-tab-btn.active::after {
      content: '';
      position: absolute;
      bottom: -7px;
      left: 0;
      right: 0;
      height: 2px;
      background: #0f172a;
      border-radius: 2px;
    }

    /* Bulk Action Bar (Matching Image 1) */
    .btn-bulk-toggle-prominent {
      height: 38px;
      padding: 0 14px;
      border-radius: 9999px;
      border: 1.5px solid #0f172a;
      background: #0f172a;
      color: #ffffff;
      font-size: 12.5px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      transition: all 0.15s;
      flex-shrink: 0;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.15);
    }
    .btn-bulk-toggle-prominent:hover {
      background: #1e293b;
      transform: translateY(-1px);
    }
    .btn-bulk-toggle-prominent.active {
      background: #0284c7;
      border-color: #0284c7;
      color: #ffffff;
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.25);
    }

    /* Maximize & Minimize View Rules */
    .inbox-screen.fullscreen-chat .col-convos {
      display: none !important;
    }
    .inbox-screen.fullscreen-chat .col-info-modal {
      display: none !important;
    }
    .inbox-screen.fullscreen-chat .col-chat {
      flex: 1 1 100% !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    .inbox-screen.hide-sidebar .col-convos {
      display: none !important;
    }
    .inbox-screen.hide-info .col-info-modal {
      display: none !important;
    }
    .header-icon-btn.active {
      background: #0284c7 !important;
      color: #ffffff !important;
    }

    .bulk-action-bar {
      padding: 8px 14px;
      background: #f8fafc;
      border-bottom: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      font-size: 13px;
    }
    .btn-bulk-pill {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #334155;
      padding: 3px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-bulk-pill:hover {
      background: #f1f5f9;
      border-color: #94a3b8;
    }
    .btn-bulk-danger {
      color: #dc2626;
      border-color: #fca5a5;
    }
    .btn-bulk-danger:hover {
      background: #fef2f2;
      border-color: #ef4444;
    }
    .btn-bulk-clear {
      background: none;
      border: none;
      color: #64748b;
      font-weight: 600;
      cursor: pointer;
      font-size: 12.5px;
    }
    .btn-bulk-clear:hover {
      color: #0f172a;
    }
    .convo-checkbox-wrap {
      display: flex;
      align-items: center;
      margin-right: 4px;
    }
    .convo-checkbox {
      width: 17px;
      height: 17px;
      cursor: pointer;
      accent-color: #0f172a;
    }

    /* Convo List Container */
    .convo-list-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 6px 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .convo-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 14px;
      cursor: pointer;
      transition: background 0.15s;
      border: 1px solid transparent;
      background: #ffffff;
    }
    .convo-card:hover {
      background: #f8fafc;
    }
    .convo-card.active {
      background: #f1f5f9;
      border-color: #e2e8f0;
    }
    .convo-avatar-circle {
      width: 42px;
      height: 42px;
      min-width: 42px;
      border-radius: 50%;
      background: #0f172a;
      color: #ffffff;
      font-weight: 700;
      font-size: 15px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .convo-avatar-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #22c55e;
      position: absolute;
      bottom: 0;
      right: 0;
      border: 2px solid #ffffff;
    }
    .convo-meta {
      flex: 1;
      min-width: 0;
    }
    .convo-meta-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 3px;
    }
    .convo-name {
      font-weight: 700;
      font-size: 13.5px;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .convo-date {
      font-size: 11px;
      color: #94a3b8;
      margin-left: 6px;
      white-space: nowrap;
    }
    .convo-snippet {
      font-size: 12px;
      color: #64748b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* =========================================
       COLUMN 2: CHAT CONVERSATION AREA (MIDDLE)
       ========================================= */
    .col-chat {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #f8fafc;
      border-right: 1px solid #e2e8f0;
      min-width: 0;
      height: 100%;
      position: relative;
    }

    /* Top Chat Header */
    .chat-top-header {
      padding: 12px 20px;
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .chat-user-lead {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .chat-lead-avatar {
      width: 44px;
      height: 44px;
      min-width: 44px;
      border-radius: 50%;
      background: #0f172a;
      color: #ffffff;
      font-weight: 800;
      font-size: 17px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .chat-lead-info {
      min-width: 0;
    }
    .chat-lead-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .chat-lead-name {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .badge-active-green {
      background: #dcfce7;
      color: #15803d;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 9999px;
    }
    .chat-lead-phone {
      font-size: 12px;
      color: #64748b;
      margin-top: 1px;
    }

    /* Header Action Icons Row */
    .chat-header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #64748b;
    }
    .header-icon-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .header-icon-btn:hover {
      background: #f1f5f9;
      color: #0f172a;
    }

    /* Sub-header Action Pills Bar */
    .chat-action-pills-bar {
      padding: 8px 18px;
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
    }
    .chat-action-pills-bar::-webkit-scrollbar { display: none; }
    
    .pill-btn-soft {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: 9999px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      font-size: 12px;
      font-weight: 600;
      color: #334155;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s;
    }
    .pill-btn-soft:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .pill-btn-soft.ai-active {
      background: #ecfdf5;
      border-color: #a7f3d0;
      color: #059669;
    }
    .pill-btn-soft.human-active {
      background: #fffbeb;
      border-color: #fde68a;
      color: #d97706;
    }
    .pill-btn-resolve {
      margin-left: auto;
      background: #0f172a;
      color: #ffffff;
      border: none;
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
    }
    .pill-btn-resolve:hover {
      background: #1e293b;
    }

    /* Chat Messages Feed */
    .chat-feed-area {
      flex: 1;
      padding: 20px 24px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
      background: #f8fafc;
    }
    .chat-empty-state {
      margin: auto;
      text-align: center;
      color: #94a3b8;
      max-width: 320px;
    }
    .chat-empty-state svg {
      color: #cbd5e1;
      margin-bottom: 12px;
    }

    .msg-row {
      display: flex;
      flex-direction: column;
      max-width: 70%;
    }
    .msg-row.incoming {
      align-self: flex-start;
    }
    .msg-row.outgoing {
      align-self: flex-end;
    }
    .msg-box {
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 13.5px;
      line-height: 1.45;
      position: relative;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      word-wrap: break-word;
    }
    .msg-row.incoming .msg-box {
      background: #ffffff;
      color: #0f172a;
      border: 1px solid #e2e8f0;
      border-top-left-radius: 4px;
    }
    .msg-row.outgoing .msg-box {
      background: #e2e8f0;
      color: #0f172a;
      border-top-right-radius: 4px;
    }
    .msg-time-stamp {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .msg-row.incoming .msg-time-stamp {
      align-self: flex-start;
    }
    .msg-row.outgoing .msg-time-stamp {
      align-self: flex-end;
    }

    /* Bottom Chat Input Bar & Toolbar (Matching Image 2) */
    .chat-bottom-input-bar {
      padding: 12px 18px 10px 18px;
      background: #ffffff;
      border-top: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .attachment-preview-box {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .attachment-preview-info {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12.5px;
      color: #1e293b;
      font-weight: 600;
      overflow: hidden;
    }
    .attachment-preview-thumb {
      width: 40px;
      height: 40px;
      border-radius: 6px;
      object-fit: cover;
      background: #e2e8f0;
    }
    .btn-remove-attachment {
      background: none;
      border: none;
      color: #dc2626;
      cursor: pointer;
      font-size: 16px;
      padding: 4px 8px;
      font-weight: 700;
    }
    .chat-text-input-area {
      width: 100%;
      min-height: 44px;
      max-height: 120px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 10px 16px;
      font-size: 14px;
      color: #0f172a;
      outline: none;
      resize: none;
      font-family: inherit;
      line-height: 1.4;
      box-sizing: border-box;
      transition: all 0.2s;
    }
    .chat-text-input-area:focus {
      background: #ffffff;
      border-color: #0284c7;
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
    }
    .chat-input-toolbar-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .chat-input-icons-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .chat-icon-btn {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s;
    }
    .chat-icon-btn:hover {
      background: #f1f5f9;
      color: #0f172a;
      border-color: #cbd5e1;
    }
    .chat-icon-btn.recording {
      background: #fee2e2 !important;
      color: #ef4444 !important;
      border-color: #fca5a5 !important;
      animation: micPulse 1s infinite alternate;
    }
    .btn-voice-lang-toggle {
      height: 28px;
      padding: 0 10px;
      border-radius: 9999px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #0369a1;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-voice-lang-toggle:hover {
      background: #e0f2fe;
      border-color: #38bdf8;
      color: #0284c7;
    }
    @keyframes micPulse {
      0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
      100% { transform: scale(1.15); box-shadow: 0 0 0 6px rgba(239,68,68,0); }
    }
    .chat-send-right-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .chat-send-hint {
      font-size: 11.5px;
      color: #94a3b8;
    }
    .btn-send-airplane {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #64748b;
      color: #ffffff;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
    }
    .btn-send-airplane.active, .btn-send-airplane:hover {
      background: #0284c7;
      transform: scale(1.05);
    }

    /* Floating Popups: Emoji & Canned Templates */
    .floating-palette-popup {
      position: absolute;
      bottom: 75px;
      left: 18px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.15);
      z-index: 100;
      width: 290px;
      overflow: hidden;
    }
    .palette-header {
      padding: 10px 14px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      font-size: 13px;
      font-weight: 700;
      color: #334155;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .emoji-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 6px;
      padding: 12px;
      max-height: 200px;
      overflow-y: auto;
    }
    .emoji-item {
      font-size: 20px;
      background: none;
      border: none;
      cursor: pointer;
      border-radius: 8px;
      padding: 4px;
      transition: background 0.1s;
    }
    .emoji-item:hover {
      background: #f1f5f9;
    }
    .canned-popup {
      width: 340px;
    }
    .canned-list {
      max-height: 250px;
      overflow-y: auto;
      padding: 6px;
    }
    .canned-item {
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
      border-bottom: 1px solid #f1f5f9;
    }
    .canned-item:hover {
      background: #f1f5f9;
    }
    .canned-item b {
      display: block;
      font-size: 13px;
      color: #0f172a;
      margin-bottom: 2px;
    }
    .canned-item small {
      display: block;
      font-size: 11.5px;
      color: #64748b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Modal Overlays (Bulk Delete & Bulk Close) */
    .inbox-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(2px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .inbox-modal-card {
      background: #ffffff;
      border-radius: 16px;
      width: 100%;
      max-width: 440px;
      box-shadow: 0 20px 45px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .inbox-modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
    }
    .inbox-modal-header.danger-header {
      background: #fef2f2;
      border-color: #fecaca;
    }
    .inbox-modal-close {
      background: none;
      border: none;
      color: #64748b;
      font-size: 18px;
      cursor: pointer;
    }
    .inbox-modal-body {
      padding: 20px;
    }
    .inbox-modal-footer {
      padding: 14px 20px;
      border-top: 1px solid #e2e8f0;
      background: #f8fafc;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .btn-modal-cancel {
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #475569;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .btn-modal-cancel:hover { background: #f1f5f9; }
    .btn-modal-primary {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      background: #0284c7;
      color: #ffffff;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
    }
    .btn-modal-primary:hover { background: #0369a1; }
    .btn-modal-danger {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      background: #dc2626;
      color: #ffffff;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
    }
    .btn-modal-danger:hover { background: #b91c1c; }

    /* =========================================
       COLUMN 3: CONTACT INFO & ACTIONS MODAL / PANEL (RIGHT)
       ========================================= */
    .col-info-modal {
      width: 310px;
      min-width: 290px;
      max-width: 330px;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
      position: relative;
    }

    /* Info Top Tabs */
    .info-tabs-header {
      padding: 12px 16px 0 16px;
      display: flex;
      gap: 16px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 13px;
    }
    .info-tab-link {
      padding-bottom: 10px;
      color: #64748b;
      font-weight: 600;
      cursor: pointer;
      position: relative;
      white-space: nowrap;
    }
    .info-tab-link.active {
      color: #0f172a;
      font-weight: 700;
    }
    .info-tab-link.active::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 2px;
      background: #0f172a;
      border-radius: 2px;
    }

    /* Big Avatar Profile Card */
    .info-profile-section {
      padding: 24px 16px 18px 16px;
      text-align: center;
      border-bottom: 1px solid #f1f5f9;
    }
    .info-big-avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: #0f172a;
      color: #ffffff;
      font-weight: 800;
      font-size: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 12px auto;
      position: relative;
    }
    .info-online-indicator {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #22c55e;
      position: absolute;
      bottom: 2px;
      right: 2px;
      border: 2px solid #ffffff;
    }
    .info-contact-name {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 3px;
    }
    .info-contact-phone {
      font-size: 12.5px;
      color: #64748b;
    }

    /* Quick Actions Grid */
    .info-quick-actions-box {
      padding: 16px;
      border-bottom: 1px solid #f1f5f9;
    }
    .info-section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: #94a3b8;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    .quick-actions-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .btn-quick-action {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      color: #334155;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-quick-action:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
      color: #0f172a;
    }

    /* Stage & CRM Details Section */
    .info-crm-details-box {
      padding: 16px;
    }
    .crm-row-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .crm-row-label {
      font-size: 12px;
      font-weight: 700;
      color: #334155;
    }
    .crm-row-change-link {
      font-size: 11.5px;
      font-weight: 600;
      color: #0284c7;
      cursor: pointer;
    }
    .crm-detail-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      font-size: 12px;
    }
    .crm-detail-title {
      color: #64748b;
    }
    .crm-detail-val {
      font-weight: 600;
      color: #0f172a;
    }

    /* Floating Help Button */
    .info-help-btn {
      position: absolute;
      bottom: 16px;
      right: 16px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #0f172a;
      color: #ffffff;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
  </style>

  <div class="inbox-screen">
    
    <!-- =========================================
         COLUMN 1: CONVERSATIONS LIST (LEFT)
         ========================================= -->
    <div class="col-convos">
      
      <!-- Top Search & Circle Action Buttons -->
      <div class="convo-search-bar">
        <div class="convo-search-wrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input 
            type="text" 
            id="mainConvoSearchInput"
            class="convo-search-input" 
            placeholder="Search or start new chat" 
            oninput="handleSearchFilter(this.value)"
          />
          <button type="button" class="btn-search-voice" id="btnVoiceSearch" onclick="toggleVoiceSearch()" title="🎙️ Voice Search (Speak Name to open chat)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          </button>
        </div>
        <button type="button" class="btn-bulk-toggle-prominent" id="btnBulkTopToggle" title="Toggle Bulk Actions & Selection" onclick="toggleBulkMode(this)">
          ☑ Bulk
        </button>
        <button class="btn-circle-action btn-circle-dark" title="New Chat" onclick="promptNewChat()">
          +
        </button>
      </div>

      <!-- Channel Filter Pills -->
      <div class="chan-filter-pills">
        <button class="chan-pill active" data-chan="all" onclick="filterChannel('all')">All</button>
        <button class="chan-pill" data-chan="whatsapp_qr" onclick="filterChannel('whatsapp_qr')">
          <span class="chan-dot green"></span> WhatsApp QR <span id="qrCountBadge" style="opacity:0.8;">${qrTotalCount > 0 ? '(' + qrTotalCount + ')' : ''}</span>
        </button>
        <button class="chan-pill" data-chan="instagram" onclick="filterChannel('instagram')">
          <span class="chan-dot red"></span> Instagram
        </button>
        <button class="chan-pill" data-chan="facebook" onclick="filterChannel('facebook')">Facebook</button>
        <button class="chan-pill" data-chan="telegram" onclick="filterChannel('telegram')">Telegram</button>
      </div>

      <!-- Category Filter Tabs: Separating WhatsApp Recent vs Qualified CRM Leads -->
      <div class="category-tabs-strip">
        <button type="button" class="category-tab-btn active" id="catBtnRecent" onclick="filterCategory(this, 'whatsapp_recent')">
          ⚡ WhatsApp Recent <span id="catCountRecent">(${qrTotalCount})</span>
        </button>
        <button type="button" class="category-tab-btn" id="catBtnLeads" onclick="filterCategory(this, 'leads')">
          🎯 CRM Leads <span id="catCountLeads">(${leadTotalCount})</span>
        </button>
        <button type="button" class="category-tab-btn" id="catBtnAll" onclick="filterCategory(this, 'all')">
          💬 All Chats <span id="catCountAll">(${allTotalCount})</span>
        </button>
      </div>

      <!-- Status Subtabs (Clean & Compact so Bulk is NEVER clipped) -->
      <div class="status-tabs-strip">
        <span class="status-tab-btn active" onclick="filterStatus(this, 'all')">All</span>
        <span class="status-tab-btn" onclick="filterStatus(this, 'active')">Active</span>
        <span class="status-tab-btn" onclick="filterStatus(this, 'resolved')">Resolved</span>
        <span class="status-tab-btn" onclick="filterStatus(this, 'unread')">Unread</span>
        <span class="status-tab-btn" id="bulkTabBtn" onclick="toggleBulkMode(this)">☑ Bulk Mode</span>
      </div>

      <!-- Bulk Action Bar (Matching Image 1) -->
      <div id="bulkActionBar" class="bulk-action-bar" style="display:none;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span id="bulkSelectedCountText" style="font-weight:700; font-size:13px; color:#0f172a;">0 selected</span>
          <button type="button" class="btn-bulk-pill" onclick="selectAllConversations()" title="Select all visible conversations">☑ Select all</button>
          <button type="button" class="btn-bulk-pill" onclick="clearBulkSelection()" title="Deselect all conversations">☐ Deselect all</button>
          <button type="button" class="btn-bulk-pill" onclick="openBulkCloseModal()">Close all</button>
          <button type="button" class="btn-bulk-pill btn-bulk-danger" onclick="openBulkDeleteModal()">Delete</button>
        </div>
        <div>
          <button type="button" class="btn-bulk-clear" onclick="clearBulkSelection()">Clear</button>
        </div>
      </div>

      <!-- Conversations Scroll List (Pre-rendered instantly by server) -->
      <div class="convo-list-scroll" id="convoList">
        ${initialConvoHtml}
      </div>

    </div>

    <!-- =========================================
         COLUMN 2: CHAT CONVERSATION AREA (MIDDLE)
         ========================================= -->
    <div class="col-chat" id="colChat">
      
      <!-- Top Chat Header -->
      <div class="chat-top-header">
        <div class="chat-user-lead">
          <div class="chat-lead-avatar" id="paneAvatar">E</div>
          <div class="chat-lead-info">
            <div class="chat-lead-title-row">
              <span class="chat-lead-name" id="paneName">Select a conversation</span>
              <span class="badge-active-green" id="paneActiveBadge">active</span>
            </div>
            <div class="chat-lead-phone" id="panePhone">No conversation selected</div>
          </div>
        </div>

        <!-- Top Right Action Icons -->
        <div class="chat-header-actions">
          <span class="header-icon-btn" id="btnToggleConvos" title="Minimize / Show Conversations List" onclick="toggleConvosPanel()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
          </span>
          <span class="header-icon-btn" id="btnToggleMaximize" title="Maximize Page / Restore (Full Screen)" onclick="toggleChatMaximize()">
            <svg id="iconMaximize" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            <svg id="iconRestore" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="10" y1="14" x2="3" y2="21"></line></svg>
          </span>
          <span class="header-icon-btn" id="btnToggleInfo" title="Toggle Right Details Panel" onclick="toggleInfoPanel()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>
          </span>
          <span class="header-icon-btn" title="Flow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
          </span>
          <span class="header-icon-btn" title="Tags">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
          </span>
          <span class="header-icon-btn" title="Payment (₹)">
            <span style="font-weight:700; font-size:14px;">₹</span>
          </span>
          <span class="header-icon-btn" title="Appointments">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </span>
          <span class="header-icon-btn" title="Files">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          </span>
          <span class="header-icon-btn" title="Contact Details">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          </span>
          <span class="header-icon-btn" title="Search in this Conversation" onclick="promptSearchInChat()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </span>
          <span class="header-icon-btn" title="Download Chat History" onclick="exportActiveChat()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </span>
          <span class="header-icon-btn" title="Clear Messages (Sync with Mobile WhatsApp)" onclick="openClearChatModal()" style="color:#d97706;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>
          </span>
          <span class="header-icon-btn" title="Delete Conversation (Sync with Mobile WhatsApp)" onclick="openDeleteActiveChatModal()" style="color:#ef4444;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </span>
        </div>
      </div>

      <!-- Action Pills Row -->
      <div class="chat-action-pills-bar">
        <button class="pill-btn-soft ai-active" id="btnAiToggle" onclick="toggleTakeover()">
          <span style="font-size:10px;">●</span> 🤖 Chat AI ON
        </button>
        <button class="pill-btn-soft" onclick="alert('Bot flow is fully active and listening.')">
          <span style="color:#8b5cf6;">●</span> 🔀 Bot Flow ON
        </button>
        <button class="pill-btn-soft" onclick="toggleCannedPicker()">
          Presets
        </button>
        <button class="pill-btn-soft" onclick="assignChatAgent()">
          Assign
        </button>
        <button class="pill-btn-soft" onclick="location.href='/leads'">
          Pipeline
        </button>
        <button class="pill-btn-soft" onclick="alert('Quick Invoice creator ready.')">
          🧾 Invoice
        </button>
        <button class="pill-btn-soft" onclick="summarizeChat()">
          ✨ Summary
        </button>
        <button class="pill-btn-resolve" onclick="resolveChat()">
          Resolve
        </button>
      </div>

      <!-- Messages Feed Area -->
      <div class="chat-feed-area" id="messagesArea">
        <div class="chat-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <div style="font-weight:700; color:#334155; margin-bottom:4px;">No Chat Selected</div>
          <div style="font-size:12.5px;">Click any contact on the left to read conversation or chat live as a human agent.</div>
        </div>
      </div>

      <!-- Floating Popups (Emoji & Canned Templates) -->
      <div id="emojiPickerPopup" class="floating-palette-popup" style="display:none;">
        <div class="palette-header">
          <span>Quick Emojis</span>
          <button onclick="toggleEmojiPicker()" style="background:none; border:none; cursor:pointer; color:#64748b;">✕</button>
        </div>
        <div class="emoji-grid">
          <button type="button" class="emoji-item" onclick="insertEmoji('👍')">👍</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('❤️')">❤️</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('😂')">😂</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('🙏')">🙏</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('🔥')">🔥</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('👏')">👏</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('💯')">💯</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('✨')">✨</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('🚀')">🚀</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('😊')">😊</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('🤝')">🤝</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('💡')">💡</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('🎬')">🎬</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('✅')">✅</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('🎉')">🎉</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('📞')">📞</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('⭐')">⭐</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('🙌')">🙌</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('👌')">👌</button>
          <button type="button" class="emoji-item" onclick="insertEmoji('🎯')">🎯</button>
        </div>
      </div>

      <div id="cannedRepliesPopup" class="floating-palette-popup canned-popup" style="display:none;">
        <div class="palette-header">
          <span>⚡ Quick Canned Templates</span>
          <button onclick="toggleCannedPicker()" style="background:none; border:none; cursor:pointer; color:#64748b;">✕</button>
        </div>
        <div class="canned-list">
          <div class="canned-item" onclick="insertCanned('Namaste! Welcome to BWB Media 🌟 How can we help you scale your brand today?')">
            <b>👋 Welcome & Intro</b>
            <small>Namaste! Welcome to BWB Media 🌟 How can we help...</small>
          </div>
          <div class="canned-item" onclick="insertCanned('Humare editing packages:\n• Reels/Shorts: ₹800 - ₹2,500\n• YouTube Long-form: ₹2,500 - ₹10,000\n• Meta Ads: ₹15,000 - ₹35,000/mo')">
            <b>💰 Packages & Rate Card</b>
            <small>Reels ₹800-₹2,500 | YT ₹2,500-₹10,000 | Meta Ads...</small>
          </div>
          <div class="canned-item" onclick="insertCanned('🎬 Check out our latest creative showreel & client results:\n🔗 https://instagram.com/bwbmedia')">
            <b>🎬 Showreel & Portfolio</b>
            <small>Check out our latest creative showreel & portfolio...</small>
          </div>
          <div class="canned-item" onclick="insertCanned('Payment details:\nUPI ID: bwbmedia@upi\nGooglePay/PhonePe: +91 97765 57035\nKripya payment ke baad screenshot share karein! 🙏')">
            <b>💳 Payment & UPI Details</b>
            <small>UPI ID & PhonePe details for quick booking...</small>
          </div>
          <div class="canned-item" onclick="insertCanned('Hi! Just following up to see if you had any questions regarding our package or need a custom trial sample?')">
            <b>🔔 Friendly Follow-up</b>
            <small>Just checking in regarding your video editing plan...</small>
          </div>
        </div>
      </div>

      <!-- Bottom Chat Input Bar & Toolbar (Exact Match to Image 2) -->
      <div class="chat-bottom-input-bar">
        <!-- Attachment Preview Box (Hidden until file selected) -->
        <div id="attachmentPreviewBox" class="attachment-preview-box" style="display:none;">
          <div class="attachment-preview-info">
            <img id="attachmentThumbImg" class="attachment-preview-thumb" src="" style="display:none;">
            <span id="attachmentDocIcon" style="font-size:24px; display:none;">📄</span>
            <div>
              <div id="attachmentFileName" style="font-weight:700; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">file.pdf</div>
              <div id="attachmentFileSize" style="font-size:11px; color:#64748b;">120 KB</div>
            </div>
          </div>
          <button type="button" class="btn-remove-attachment" onclick="removeAttachment()" title="Remove file">✕</button>
        </div>

        <!-- Text Input Area -->
        <textarea 
          id="replyInput" 
          class="chat-text-input-area" 
          placeholder="Type a message..." 
          rows="1"
          onkeydown="handleReplyKey(event)"
          oninput="handleReplyInput(this)"
        ></textarea>

        <!-- Input Toolbar Row (Matching Image 2) -->
        <div class="chat-input-toolbar-row">
          <div class="chat-input-icons-left">
            <button type="button" class="chat-icon-btn" onclick="triggerFileInput()" title="Attach file, photo or document">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
            </button>
            <button type="button" class="chat-icon-btn" onclick="triggerAiAssist()" title="✨ AI Polish & Smart Reply">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>
            </button>
            <button type="button" class="chat-icon-btn" onclick="toggleEmojiPicker()" title="Quick emojis">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
            </button>
            <button type="button" class="chat-icon-btn" onclick="toggleCannedPicker()" title="Preset templates">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </button>
            <button type="button" class="chat-icon-btn" onclick="triggerAudioInput()" title="Upload Audio File">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
            </button>
            <button type="button" class="chat-icon-btn" id="btnLiveVoiceTyping" onclick="toggleVoiceTyping()" title="🎙️ Speak to Type & Auto-Send">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
            </button>
            <button type="button" class="btn-voice-lang-toggle" id="btnVoiceLangToggle" onclick="toggleVoiceLanguage()" title="Click to Switch Voice Language (EN / HI)">
              <span id="voiceLangIcon">🌐</span>
              <span id="voiceLangText">EN</span>
            </button>
          </div>

          <div class="chat-send-right-wrap">
            <span class="chat-send-hint">Enter to send · Shift+Enter for a new line</span>
            <button type="button" class="btn-send-airplane" id="btnSendAirplane" onclick="sendManualReply()" title="Send">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </div>
        </div>

        <!-- Hidden File Inputs -->
        <input type="file" id="chatFileInput" style="display:none;" onchange="handleFileSelected(event)" accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx">
        <input type="file" id="chatAudioInput" style="display:none;" onchange="handleAudioSelected(event)" accept="audio/*">
      </div>

    </div>

    <!-- =========================================
         COLUMN 3: CONTACT INFO & ACTIONS MODAL / PANEL (RIGHT)
         ========================================= -->
    <div class="col-info-modal" id="colInfoModal">
      
      <!-- Top Tabs: Info | Notes | Orders | Appointments -->
      <div class="info-tabs-header">
        <span class="info-tab-link active" onclick="switchInfoTab(this, 'info')">Info</span>
        <span class="info-tab-link" onclick="switchInfoTab(this, 'notes')">Notes</span>
        <span class="info-tab-link" onclick="switchInfoTab(this, 'orders')">Orders</span>
        <span class="info-tab-link" onclick="switchInfoTab(this, 'appointments')">Appointments</span>
      </div>

      <!-- Tab 1: Info Panel -->
      <div id="panelTabInfo">
        <!-- Big Avatar Profile Card -->
        <div class="info-profile-section">
          <div class="info-big-avatar" id="modalBigAvatar">
            E
            <div class="info-online-indicator"></div>
          </div>
          <div class="info-contact-name" id="modalContactName">Select Contact</div>
          <div class="info-contact-phone" id="modalContactPhone">--</div>
        </div>

        <!-- Quick Actions Grid -->
        <div class="info-quick-actions-box">
          <div class="info-section-title">Quick actions</div>
          <div class="quick-actions-grid">
            <button type="button" class="btn-quick-action" onclick="openAiCallModal()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
              AI call
            </button>
            <button type="button" class="btn-quick-action" onclick="openBookSlotModal()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              Book slot
            </button>
            <button type="button" class="btn-quick-action" onclick="openQuotationModal()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              Quotation
            </button>
            <button type="button" class="btn-quick-action" onclick="openPaymentLinkModal()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
              Payment link
            </button>
            <button type="button" class="btn-quick-action" onclick="openNotesModal()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              Notes
            </button>
            <button type="button" class="btn-quick-action" onclick="openAssignModal()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
              Assign
            </button>
            <button type="button" class="btn-quick-action" onclick="openClearChatModal()" style="color:#d97706;" title="Clear messages on Web & Mobile WhatsApp">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"></path></svg>
              Clear Chat
            </button>
            <button type="button" class="btn-quick-action" onclick="openDeleteActiveChatModal()" style="color:#b91c1c;" title="Delete chat on Web & Mobile WhatsApp">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Delete
            </button>
          </div>
        </div>

        <!-- Stage & CRM Details Section -->
        <div class="info-crm-details-box">
          <div class="crm-row-header">
            <span class="crm-row-label">Stage</span>
            <span class="crm-row-change-link" onclick="openStageModal()">Change</span>
          </div>
          <div class="crm-detail-line">
            <span class="crm-detail-title">Current</span>
            <span class="crm-detail-val" id="modalStageVal">New Lead</span>
          </div>
          <div class="crm-detail-line">
            <span class="crm-detail-title">Owner</span>
            <span class="crm-detail-val" id="modalOwnerVal">biswa342</span>
          </div>
        </div>
      </div>

      <!-- Tab 2: Notes Panel -->
      <div id="panelTabNotes" style="display:none; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <b style="font-size:13px; color:#0f172a;">Contact Notes</b>
          <button type="button" class="btn-bulk-pill" onclick="openNotesModal()">+ Add Note</button>
        </div>
        <div id="notesContainerList" style="display:flex; flex-direction:column; gap:8px; max-height:400px; overflow-y:auto;">
          <div style="text-align:center; color:#94a3b8; font-size:12px; padding:20px;">No notes yet. Click "+ Add Note" to save details!</div>
        </div>
      </div>

      <!-- Tab 3: Orders / Quotations Panel -->
      <div id="panelTabOrders" style="display:none; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <b style="font-size:13px; color:#0f172a;">Quotations & Orders</b>
          <button type="button" class="btn-bulk-pill" onclick="openQuotationModal()">+ New Quote</button>
        </div>
        <div id="ordersContainerList" style="display:flex; flex-direction:column; gap:8px; max-height:400px; overflow-y:auto;">
          <div style="text-align:center; color:#94a3b8; font-size:12px; padding:20px;">No quotations sent yet. Click "+ New Quote" to create one!</div>
        </div>
      </div>

      <!-- Tab 4: Appointments Panel -->
      <div id="panelTabAppointments" style="display:none; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <b style="font-size:13px; color:#0f172a;">Booked Slots</b>
          <button type="button" class="btn-bulk-pill" onclick="openBookSlotModal()">+ Book Slot</button>
        </div>
        <div id="appointmentsContainerList" style="display:flex; flex-direction:column; gap:8px; max-height:400px; overflow-y:auto;">
          <div style="text-align:center; color:#94a3b8; font-size:12px; padding:20px;">No appointments booked yet. Click "+ Book Slot" to schedule!</div>
        </div>
      </div>

      <!-- Bottom Floating Help Button -->
      <button class="info-help-btn" title="Need help?" onclick="alert('BWB PANEL Omnichannel CRM v2.0 - Active & Online')">
        ?
      </button>

    </div>

  </div>

  <!-- =========================================
       MODALS: BULK DELETE & BULK CLOSE
       ========================================= -->
  <!-- Modal 1: Bulk Delete Modal -->
  <div id="bulkDeleteModal" class="inbox-modal-overlay" style="display:none;">
    <div class="inbox-modal-card">
      <div class="inbox-modal-header danger-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">🗑️</span>
          <h3 style="margin:0; font-size:17px; color:#b91c1c;">Delete Conversations</h3>
        </div>
        <button class="inbox-modal-close" onclick="closeBulkDeleteModal()">✕</button>
      </div>
      <div class="inbox-modal-body">
        <p style="margin:0 0 10px 0; color:#334155; font-size:14px; line-height:1.5;">
          Are you sure you want to permanently delete <b id="bulkDeleteCountText" style="color:#b91c1c;">0</b> selected conversation(s)?
        </p>
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:10px 14px; font-size:12.5px; color:#991b1b;">
          ⚠️ This action cannot be undone. All message history for the selected contacts will be removed.
        </div>
      </div>
      <div class="inbox-modal-footer">
        <button type="button" class="btn-modal-cancel" onclick="closeBulkDeleteModal()">Cancel</button>
        <button type="button" class="btn-modal-danger" id="btnConfirmBulkDelete" onclick="confirmBulkDelete()">Delete Forever</button>
      </div>
    </div>
  </div>

  <!-- Modal 2: Bulk Close Modal -->
  <div id="bulkCloseModal" class="inbox-modal-overlay" style="display:none;">
    <div class="inbox-modal-card">
      <div class="inbox-modal-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">📁</span>
          <h3 style="margin:0; font-size:17px; color:#0f172a;">Close Conversations</h3>
        </div>
        <button class="inbox-modal-close" onclick="closeBulkCloseModal()">✕</button>
      </div>
      <div class="inbox-modal-body">
        <p style="margin:0 0 10px 0; color:#334155; font-size:14px; line-height:1.5;">
          Mark <b id="bulkCloseCountText" style="color:#0284c7;">0</b> selected conversation(s) as Resolved / Closed?
        </p>
        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:10px 14px; font-size:12.5px; color:#0369a1;">
          💡 You can still find them under the "Resolved" status tab anytime.
        </div>
      </div>
      <div class="inbox-modal-footer">
        <button type="button" class="btn-modal-cancel" onclick="closeBulkCloseModal()">Cancel</button>
        <button type="button" class="btn-modal-primary" id="btnConfirmBulkClose" onclick="confirmBulkClose()">Confirm Close</button>
      </div>
    </div>
  </div>

  <!-- Modal 3: Single Clear Chat Modal (Web + Mobile WhatsApp Sync) -->
  <div id="clearChatModal" class="inbox-modal-overlay" style="display:none;">
    <div class="inbox-modal-card">
      <div class="inbox-modal-header" style="background:#fffbeb; border-bottom:1px solid #fde68a;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">🧹</span>
          <h3 style="margin:0; font-size:17px; color:#b45309;">Clear Chat Messages</h3>
        </div>
        <button class="inbox-modal-close" onclick="closeClearChatModal()">✕</button>
      </div>
      <div class="inbox-modal-body">
        <p style="margin:0 0 10px 0; color:#334155; font-size:14px; line-height:1.5;">
          Clear all message history for <b id="clearChatTargetName" style="color:#0f172a;">this contact</b>?
        </p>
        <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:10px 14px; font-size:12.5px; color:#065f46; margin-bottom:10px;">
          📱 <b>Mobile WhatsApp Sync:</b> If connected via WhatsApp QR, this will automatically clear messages on your mobile WhatsApp phone as well.
        </div>
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px 12px; font-size:12px; color:#991b1b;">
          ⚠️ The contact will remain in your list, but all previous messages will be cleared.
        </div>
      </div>
      <div class="inbox-modal-footer">
        <button type="button" class="btn-modal-cancel" onclick="closeClearChatModal()">Cancel</button>
        <button type="button" class="btn-modal-danger" id="btnConfirmClearChat" onclick="confirmClearChat()" style="background:#d97706; border-color:#d97706;">Clear Messages</button>
      </div>
    </div>
  </div>

  <!-- Modal 4: Delete Active Chat Modal (Web + Mobile WhatsApp Sync) -->
  <div id="deleteActiveChatModal" class="inbox-modal-overlay" style="display:none;">
    <div class="inbox-modal-card">
      <div class="inbox-modal-header danger-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">🗑️</span>
          <h3 style="margin:0; font-size:17px; color:#b91c1c;">Delete Conversation</h3>
        </div>
        <button class="inbox-modal-close" onclick="closeDeleteActiveChatModal()">✕</button>
      </div>
      <div class="inbox-modal-body">
        <p style="margin:0 0 10px 0; color:#334155; font-size:14px; line-height:1.5;">
          Permanently delete the conversation with <b id="deleteActiveChatTargetName" style="color:#b91c1c;">this contact</b>?
        </p>
        <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:10px 14px; font-size:12.5px; color:#065f46; margin-bottom:10px;">
          📱 <b>Mobile WhatsApp Sync:</b> This conversation will also be permanently deleted from your mobile WhatsApp chat list.
        </div>
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px 12px; font-size:12px; color:#991b1b;">
          ⚠️ This action cannot be undone. All message history will be removed.
        </div>
      </div>
      <div class="inbox-modal-footer">
        <button type="button" class="btn-modal-cancel" onclick="closeDeleteActiveChatModal()">Cancel</button>
        <button type="button" class="btn-modal-danger" id="btnConfirmDeleteActiveChat" onclick="confirmDeleteActiveChat()">Delete Forever</button>
      </div>
    </div>
  </div>

  <!-- Modal 5: Payment Link Modal -->
  <div id="paymentLinkModal" class="inbox-modal-overlay" style="display:none;">
    <div class="inbox-modal-card">
      <div class="inbox-modal-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">💳</span>
          <h3 style="margin:0; font-size:17px; color:#0f172a;">Generate Payment Link</h3>
        </div>
        <button class="inbox-modal-close" onclick="closePaymentLinkModal()">✕</button>
      </div>
      <div class="inbox-modal-body">
        <label style="display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:4px;">Amount (₹ INR):</label>
        <input type="number" id="payAmountInput" class="convo-search-input" style="border:1px solid #cbd5e1; margin-bottom:12px; height:38px; border-radius:8px; padding-left:12px;" placeholder="e.g. 2500" value="1500" />
        
        <label style="display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:4px;">Service / Description:</label>
        <input type="text" id="payDescInput" class="convo-search-input" style="border:1px solid #cbd5e1; margin-bottom:12px; height:38px; border-radius:8px; padding-left:12px;" placeholder="e.g. Website Setup / Consultation" value="Consultation & Setup" />

        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 14px; font-size:12px; color:#166534;">
          ⚡ Live UPI QR & Payment link will be generated and sent directly to customer's WhatsApp chat.
        </div>
      </div>
      <div class="inbox-modal-footer">
        <button type="button" class="btn-modal-cancel" onclick="closePaymentLinkModal()">Cancel</button>
        <button type="button" class="btn-modal-primary" onclick="submitPaymentLink()" id="btnSubmitPayment">Generate & Send</button>
      </div>
    </div>
  </div>

  <!-- Modal 6: Book Slot Modal -->
  <div id="bookSlotModal" class="inbox-modal-overlay" style="display:none;">
    <div class="inbox-modal-card">
      <div class="inbox-modal-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">📅</span>
          <h3 style="margin:0; font-size:17px; color:#0f172a;">Schedule Meeting / Slot</h3>
        </div>
        <button class="inbox-modal-close" onclick="closeBookSlotModal()">✕</button>
      </div>
      <div class="inbox-modal-body">
        <label style="display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:4px;">Meeting Date:</label>
        <input type="date" id="slotDateInput" class="convo-search-input" style="border:1px solid #cbd5e1; margin-bottom:12px; height:38px; border-radius:8px; padding-left:12px;" />
        
        <label style="display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:4px;">Meeting Time:</label>
        <input type="time" id="slotTimeInput" class="convo-search-input" style="border:1px solid #cbd5e1; margin-bottom:12px; height:38px; border-radius:8px; padding-left:12px;" value="11:00" />

        <label style="display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:4px;">Discussion Topic:</label>
        <input type="text" id="slotTopicInput" class="convo-search-input" style="border:1px solid #cbd5e1; margin-bottom:12px; height:38px; border-radius:8px; padding-left:12px;" placeholder="e.g. Project Strategy & Quote" value="Discovery & Project Onboarding" />
      </div>
      <div class="inbox-modal-footer">
        <button type="button" class="btn-modal-cancel" onclick="closeBookSlotModal()">Cancel</button>
        <button type="button" class="btn-modal-primary" onclick="submitBookSlot()" id="btnSubmitSlot">Confirm & Send Invite</button>
      </div>
    </div>
  </div>

  <!-- Modal 7: Quotation Modal -->
  <div id="quotationModal" class="inbox-modal-overlay" style="display:none;">
    <div class="inbox-modal-card">
      <div class="inbox-modal-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">📄</span>
          <h3 style="margin:0; font-size:17px; color:#0f172a;">Create Official Quotation</h3>
        </div>
        <button class="inbox-modal-close" onclick="closeQuotationModal()">✕</button>
      </div>
      <div class="inbox-modal-body">
        <label style="display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:4px;">Service Name:</label>
        <input type="text" id="quoteServiceInput" class="convo-search-input" style="border:1px solid #cbd5e1; margin-bottom:12px; height:38px; border-radius:8px; padding-left:12px;" placeholder="e.g. WhatsApp Bot & Meta Ads Package" value="WhatsApp Automation & Meta Ads" />
        
        <label style="display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:4px;">Total Amount (₹):</label>
        <input type="number" id="quoteAmountInput" class="convo-search-input" style="border:1px solid #cbd5e1; margin-bottom:12px; height:38px; border-radius:8px; padding-left:12px;" value="5000" />

        <label style="display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:4px;">Discount (₹):</label>
        <input type="number" id="quoteDiscountInput" class="convo-search-input" style="border:1px solid #cbd5e1; margin-bottom:12px; height:38px; border-radius:8px; padding-left:12px;" value="500" />

        <label style="display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:4px;">Special Terms / Notes:</label>
        <input type="text" id="quoteNotesInput" class="convo-search-input" style="border:1px solid #cbd5e1; margin-bottom:12px; height:38px; border-radius:8px; padding-left:12px;" value="Includes 30 days free support & 1 revision." />
      </div>
      <div class="inbox-modal-footer">
        <button type="button" class="btn-modal-cancel" onclick="closeQuotationModal()">Cancel</button>
        <button type="button" class="btn-modal-primary" onclick="submitQuotation()" id="btnSubmitQuotation">Generate & Send</button>
      </div>
    </div>
  </div>

  <!-- Modal 8: Notes Modal -->
  <div id="notesModal" class="inbox-modal-overlay" style="display:none;">
    <div class="inbox-modal-card">
      <div class="inbox-modal-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">📝</span>
          <h3 style="margin:0; font-size:17px; color:#0f172a;">Add Internal Note</h3>
        </div>
        <button class="inbox-modal-close" onclick="closeNotesModal()">✕</button>
      </div>
      <div class="inbox-modal-body">
        <label style="display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:4px;">Internal Note (Reminder / Follow-up / Client details):</label>
        <textarea id="noteTextInput" rows="4" style="width:100%; border:1px solid #cbd5e1; border-radius:8px; padding:10px; font-size:13px; font-family:inherit; outline:none;" placeholder="e.g. 20 Nov ko follow-up call karni hai, client ko demo pasand aaya..."></textarea>
      </div>
      <div class="inbox-modal-footer">
        <button type="button" class="btn-modal-cancel" onclick="closeNotesModal()">Cancel</button>
        <button type="button" class="btn-modal-primary" onclick="submitNote()" id="btnSubmitNote">Save Note</button>
      </div>
    </div>
  </div>

  <!-- Modal 9: Assign Agent Modal -->
  <div id="assignModal" class="inbox-modal-overlay" style="display:none;">
    <div class="inbox-modal-card">
      <div class="inbox-modal-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">👤</span>
          <h3 style="margin:0; font-size:17px; color:#0f172a;">Assign Chat / Lead</h3>
        </div>
        <button class="inbox-modal-close" onclick="closeAssignModal()">✕</button>
      </div>
      <div class="inbox-modal-body">
        <label style="display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:6px;">Select Operator / Team Member:</label>
        <select id="assigneeSelect" style="width:100%; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px; outline:none; background:#ffffff;">
          <option value="biswa342">Biswajit Ekka (Admin - biswa342)</option>
          <option value="Agent Sarah (Sales)">Agent Sarah (Sales Closer)</option>
          <option value="Agent Raj (Support)">Agent Raj (Customer Support)</option>
          <option value="AI Autonomous Bot">AI Autonomous Bot (Auto-pilot)</option>
        </select>
      </div>
      <div class="inbox-modal-footer">
        <button type="button" class="btn-modal-cancel" onclick="closeAssignModal()">Cancel</button>
        <button type="button" class="btn-modal-primary" onclick="submitAssign()" id="btnSubmitAssign">Assign Operator</button>
      </div>
    </div>
  </div>

  <!-- Modal 10: Change Stage Modal -->
  <div id="stageModal" class="inbox-modal-overlay" style="display:none;">
    <div class="inbox-modal-card">
      <div class="inbox-modal-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">📊</span>
          <h3 style="margin:0; font-size:17px; color:#0f172a;">Update Visual Pipeline Stage</h3>
        </div>
        <button class="inbox-modal-close" onclick="closeStageModal()">✕</button>
      </div>
      <div class="inbox-modal-body">
        <label style="display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:6px;">Select CRM Stage:</label>
        <select id="stageSelect" style="width:100%; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px; outline:none; background:#ffffff;">
          <option value="New Lead">🟢 New Lead (Fresh Inquiry)</option>
          <option value="Interested">🟡 Interested (Warm Prospect)</option>
          <option value="Slot Booked">📅 Slot Booked (Meeting Scheduled)</option>
          <option value="Quotation Sent">📄 Quotation Sent (Awaiting Decision)</option>
          <option value="Deal Closed">🏆 Deal Closed (Payment Confirmed / Won)</option>
          <option value="Lost">🔴 Lost / Unresponsive</option>
        </select>
      </div>
      <div class="inbox-modal-footer">
        <button type="button" class="btn-modal-cancel" onclick="closeStageModal()">Cancel</button>
        <button type="button" class="btn-modal-primary" onclick="submitStage()" id="btnSubmitStage">Update Pipeline</button>
      </div>
    </div>
  </div>

  <!-- Modal 11: AI Call Modal -->
  <div id="aiCallModal" class="inbox-modal-overlay" style="display:none;">
    <div class="inbox-modal-card">
      <div class="inbox-modal-header" style="background:#f0fdf4; border-bottom:1px solid #bbf7d0;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">📞</span>
          <h3 style="margin:0; font-size:17px; color:#166534;">AI Voice Call Assistant</h3>
        </div>
        <button class="inbox-modal-close" onclick="closeAiCallModal()">✕</button>
      </div>
      <div class="inbox-modal-body">
        <p style="margin:0 0 10px 0; color:#334155; font-size:14px; line-height:1.5;">
          Initiate automated AI voice dialer & greeting to <b id="aiCallTargetName" style="color:#0f172a;">this contact</b>?
        </p>
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; font-size:12.5px; color:#475569;">
          🤖 <b>AI Dialer Protocol:</b> System will send a voice call alert and dispatch an audio greeting introducing Biswajit Ekka's BWB Media.
        </div>
      </div>
      <div class="inbox-modal-footer">
        <button type="button" class="btn-modal-cancel" onclick="closeAiCallModal()">Cancel</button>
        <button type="button" class="btn-modal-primary" onclick="submitAiCall()" id="btnSubmitAiCall" style="background:#16a34a; border-color:#16a34a;">Start AI Call</button>
      </div>
    </div>
  </div>

  <script>
    // Injected real initial conversations from server
    window.INITIAL_CHATS = ${JSON.stringify(conversations).replace(/</g, '\\u003c')};
    
    let activeChatKey = null;
    let chatsData = Array.isArray(window.INITIAL_CHATS) ? window.INITIAL_CHATS : [];
    let selectedChannel = 'all';
    let selectedStatus = 'all';
    let selectedCategory = 'whatsapp_recent';
    let searchQuery = '';
    let isBulkMode = false;
    let selectedChatKeys = new Set();
    let currentAttachment = null;

    // Backwards-compatible alias for currentChannel so legacy event callers never throw ReferenceError
    window.currentChannel = 'all';
    try {
      Object.defineProperty(window, 'currentChannel', {
        get() { return selectedChannel; },
        set(v) { selectedChannel = v; },
        configurable: true
      });
    } catch (e) {}

    function filterCategory(el, cat) {
      selectedCategory = cat;
      document.querySelectorAll('.category-tab-btn').forEach(b => b.classList.remove('active'));
      if (el) el.classList.add('active');
      renderSidebar();
    }

    // Helper for safe card click without quote issues
    function selectChatCard(el) {
      if (!el) return;
      const channel = el.getAttribute('data-channel');
      const userId = el.getAttribute('data-userid');
      selectChat(channel, userId);
    }

    // Auto-select first chat immediately on load
    if (chatsData.length > 0) {
      setTimeout(() => {
        selectChat(chatsData[0].channel, chatsData[0].userId, false);
      }, 50);
    }

    let visibleRenderLimit = 80;

    async function loadAllChats() {
      try {
        const res = await fetch('/api/chats?summary=true');
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) {
          chatsData = data;
          renderSidebar(true);

          // Update Category Counts & WhatsApp QR count badge
          const recentList = chatsData.filter(c => c.channel === 'whatsapp_qr' && ((c.messageCount !== undefined ? c.messageCount : (c.messages ? c.messages.length : 0)) > 0));
          const leadList = chatsData.filter(c => c.isLead || ((c.messageCount !== undefined ? c.messageCount : (c.messages ? c.messages.length : 0)) === 0));

          const qrCount = recentList.length;
          const leadCount = leadList.length;
          const allCount = chatsData.length;
          
          const qrBadge = document.getElementById('qrCountBadge');
          if (qrBadge) qrBadge.innerText = qrCount > 0 ? '(' + qrCount + ')' : '';
          const cAll = document.getElementById('catCountAll');
          if (cAll) cAll.innerText = '(' + allCount + ')';
          const cRecent = document.getElementById('catCountRecent');
          if (cRecent) cRecent.innerText = '(' + qrCount + ')';
          const cLeads = document.getElementById('catCountLeads');
          if (cLeads) cLeads.innerText = '(' + leadCount + ')';

          if (activeChatKey) {
            const colonIdx = activeChatKey.indexOf(':');
            const aChan = activeChatKey.substring(0, colonIdx);
            const aUser = activeChatKey.substring(colonIdx + 1);
            const current = chatsData.find(c => c.channel === aChan && c.userId === aUser);
            if (current) selectChat(current.channel, current.userId, false);
          }
        }
      } catch (e) {
        console.warn('Background sync note:', e);
      }
    }

    function renderSidebar(preserveScroll = false) {
      const list = document.getElementById('convoList');
      if (!list || !Array.isArray(chatsData)) return;

      const seenCards = new Set();
      const filtered = chatsData.filter(c => {
        const msgCount = c.messageCount !== undefined ? c.messageCount : (c.messages ? c.messages.length : 0);

        // User rule: "watsup recent me sirf mobile chat synchronize ho" (only chats with real messages)
        if (selectedCategory === 'whatsapp_recent') {
          if (c.channel !== 'whatsapp_qr') return false;
          if (msgCount === 0) return false;
        }

        // User rule: "crm lead me new lead connected or new no sirf dikhe" (leads or new connected numbers with 0 messages)
        if (selectedCategory === 'leads') {
          const isLeadOrNewNo = c.isLead || msgCount === 0;
          if (!isLeadOrNewNo) return false;
        }

        if (selectedChannel !== 'all' && c.channel !== selectedChannel) return false;
        if (selectedStatus === 'resolved' && !c.isResolved) return false;
        if (selectedStatus === 'active' && c.isResolved) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const cleanQ = q.replace(/[^0-9a-z]/gi, '');
          const matchesUser = (c.userId || '').toLowerCase().includes(q);
          const matchesName = (c.displayName || c.userName || '').toLowerCase().includes(q);
          const purePhoneStr = (c.purePhone || '').toLowerCase();
          const formattedPhoneStr = (c.formattedPhone || '').toLowerCase();
          const matchesPhone = purePhoneStr.includes(q) || formattedPhoneStr.includes(q) || (cleanQ && purePhoneStr.includes(cleanQ));
          const lastMsgText = (c.lastMessage?.text || (c.messages && c.messages.length ? c.messages[c.messages.length - 1].text : '') || '').toLowerCase();
          const matchesMsg = lastMsgText.includes(q) || (c.messages || []).some(m => (m.text || '').toLowerCase().includes(q));

          if (!matchesUser && !matchesName && !matchesPhone && !matchesMsg) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        list.innerHTML = '<div style="padding:28px 12px; text-align:center; color:#94a3b8; font-size:12.5px;">No conversations found.</div>';
        return;
      }

      // Fast pagination: Render up to visibleRenderLimit cards for instant 60fps scrolling
      const limit = searchQuery ? Math.min(filtered.length, 120) : Math.min(filtered.length, visibleRenderLimit);
      const itemsToRender = filtered.slice(0, limit);
      const prevScrollTop = preserveScroll ? list.scrollTop : 0;

      list.innerHTML = itemsToRender.map(c => {
        const key = c.channel + ':' + c.userId;
        const isActive = (key === activeChatKey);
        const lastMsgObj = c.lastMessage || (c.messages && c.messages.length ? c.messages[c.messages.length - 1] : null);
        const lastText = lastMsgObj ? lastMsgObj.text : 'New lead connected';
        const displayName = c.displayName || c.userName || ('+' + c.userId);
        const cleanName = displayName.startsWith('+') ? displayName.substring(1) : displayName;
        const initial = cleanName.charAt(0).toUpperCase() || 'U';
        const isChecked = selectedChatKeys.has(key);
        const cbDisplay = isBulkMode ? 'flex' : 'none';

        let dateStr = 'Today';
        if (lastMsgObj && lastMsgObj.timestamp) {
          const d = new Date(lastMsgObj.timestamp);
          dateStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const phoneDisplay = c.formattedPhone || (c.purePhone ? ('+' + c.purePhone) : (String(c.userId).endsWith('@lid') ? 'WhatsApp Contact' : ('+' + c.userId)));
        const leadBadge = c.isLead 
          ? '<span style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; font-size:10px; font-weight:700; padding:1px 6px; border-radius:9999px; margin-left:6px;">🎯 Lead</span>' 
          : '';

        return '<div class="convo-card ' + (isActive ? 'active' : '') + '" data-channel="' + escapeHtml(c.channel) + '" data-userid="' + escapeHtml(c.userId) + '" onclick="selectChatCard(this)">' +
          '<div class="convo-checkbox-wrap" style="display:' + cbDisplay + ';" onclick="event.stopPropagation()">' +
            '<input type="checkbox" class="convo-checkbox" value="' + escapeHtml(key) + '" ' + (isChecked ? 'checked' : '') + ' onchange="onConvoCheckboxChanged()">' +
          '</div>' +
          '<div class="convo-avatar-circle">' +
            initial +
            '<div class="convo-avatar-dot"></div>' +
          '</div>' +
          '<div class="convo-meta">' +
            '<div class="convo-meta-header">' +
              '<span class="convo-name">' + escapeHtml(displayName) + leadBadge + '</span>' +
              '<span class="convo-date">' + dateStr + '</span>' +
            '</div>' +
            '<div style="font-size:11px; color:#94a3b8; margin-bottom:2px;">' + escapeHtml(phoneDisplay) + '</div>' +
            '<div class="convo-snippet">' + (c.isHumanTakeover ? '🛑 [Human] ' : '') + escapeHtml(lastText) + '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      if (filtered.length > itemsToRender.length) {
        list.innerHTML += '<div style="text-align:center; padding:12px; font-size:11.5px; color:#64748b; background:#f8fafc; border-top:1px dashed #e2e8f0;">' +
          'Showing ' + itemsToRender.length + ' of ' + filtered.length + ' chats · Scroll down for more' +
        '</div>';
      }

      if (preserveScroll && prevScrollTop > 0) {
        list.scrollTop = prevScrollTop;
      }
    }

    // Maximize & Minimize Screen Controls
    let isMaximized = false;
    let isConvosHidden = false;
    let isInfoHidden = false;

    function toggleChatMaximize() {
      const screen = document.querySelector('.inbox-screen');
      if (!screen) return;
      isMaximized = !isMaximized;
      screen.classList.toggle('fullscreen-chat', isMaximized);

      const iconMax = document.getElementById('iconMaximize');
      const iconRes = document.getElementById('iconRestore');
      if (iconMax && iconRes) {
        iconMax.style.display = isMaximized ? 'none' : 'block';
        iconRes.style.display = isMaximized ? 'block' : 'none';
      }

      const btnMax = document.getElementById('btnToggleMaximize');
      if (btnMax) {
        btnMax.title = isMaximized ? 'Restore View (3-Column Layout)' : 'Maximize Chat (Full Screen)';
        btnMax.classList.toggle('active', isMaximized);
      }
    }

    function toggleConvosPanel() {
      const screen = document.querySelector('.inbox-screen');
      if (!screen) return;
      isConvosHidden = !isConvosHidden;
      screen.classList.toggle('hide-sidebar', isConvosHidden);
      const btn = document.getElementById('btnToggleConvos');
      if (btn) btn.classList.toggle('active', isConvosHidden);
    }

    function toggleInfoPanel() {
      const screen = document.querySelector('.inbox-screen');
      if (!screen) return;
      isInfoHidden = !isInfoHidden;
      screen.classList.toggle('hide-info', isInfoHidden);
      const btn = document.getElementById('btnToggleInfo');
      if (btn) btn.classList.toggle('active', isInfoHidden);
    }

    // Toggle Bulk Selection Mode (Synced between Top Search Button & Subtabs)
    function toggleBulkMode(btn) {
      isBulkMode = !isBulkMode;
      const bulkBar = document.getElementById('bulkActionBar');
      const topBtn = document.getElementById('btnBulkTopToggle');
      const tabBtn = document.getElementById('bulkTabBtn');

      if (isBulkMode) {
        if (topBtn) topBtn.classList.add('active');
        if (tabBtn) tabBtn.classList.add('active');
        if (bulkBar) bulkBar.style.display = 'flex';
      } else {
        if (topBtn) topBtn.classList.remove('active');
        if (tabBtn) tabBtn.classList.remove('active');
        if (bulkBar) bulkBar.style.display = 'none';
        selectedChatKeys.clear();
      }

      document.querySelectorAll('.convo-checkbox-wrap').forEach(w => {
        w.style.display = isBulkMode ? 'flex' : 'none';
      });

      updateBulkCountText();
    }

    function onConvoCheckboxChanged() {
      selectedChatKeys.clear();
      document.querySelectorAll('.convo-checkbox:checked').forEach(cb => {
        selectedChatKeys.add(cb.value);
      });
      updateBulkCountText();
    }

    function updateBulkCountText() {
      const count = selectedChatKeys.size;
      const countText = document.getElementById('bulkSelectedCountText');
      if (countText) countText.innerText = count + ' selected';
    }

    function selectAllConversations() {
      selectedChatKeys.clear();
      document.querySelectorAll('#convoList .convo-card').forEach(card => {
        if (card.style.display !== 'none') {
          const cb = card.querySelector('.convo-checkbox');
          if (cb) {
            cb.checked = true;
            selectedChatKeys.add(cb.value);
          }
        }
      });
      updateBulkCountText();
    }

    function clearBulkSelection() {
      selectedChatKeys.clear();
      document.querySelectorAll('.convo-checkbox').forEach(cb => cb.checked = false);
      updateBulkCountText();
    }

    // Bulk Delete Modal
    function openBulkDeleteModal() {
      if (selectedChatKeys.size === 0) {
        alert('Please select at least 1 conversation using the checkboxes first!');
        return;
      }
      document.getElementById('bulkDeleteCountText').innerText = selectedChatKeys.size;
      document.getElementById('bulkDeleteModal').style.display = 'flex';
    }

    function closeBulkDeleteModal() {
      document.getElementById('bulkDeleteModal').style.display = 'none';
    }

    async function confirmBulkDelete() {
      const btn = document.getElementById('btnConfirmBulkDelete');
      btn.innerText = 'Deleting...';
      btn.disabled = true;

      try {
        const totalCards = document.querySelectorAll('#convoList .convo-card').length;
        const isAllSelected = (selectedChatKeys.size >= totalCards && totalCards > 0);
        const payload = isAllSelected 
          ? { all: true, channel: selectedChannel }
          : { keys: Array.from(selectedChatKeys) };

        const res = await fetch('/api/chats/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error('Server returned invalid response (Status ' + res.status + '): ' + text.substring(0, 100));
        }

        if (data.success) {
          clearBulkSelection();
          closeBulkDeleteModal();
          await loadAllChats();
        } else {
          alert('Delete failed: ' + (data.error || 'Server error'));
        }
      } catch (err) {
        alert('Network error: ' + err.message);
      } finally {
        btn.innerText = 'Delete Forever';
        btn.disabled = false;
      }
    }

    // Bulk Close Modal
    function openBulkCloseModal() {
      if (selectedChatKeys.size === 0) {
        alert('Please select at least 1 conversation using the checkboxes first!');
        return;
      }
      document.getElementById('bulkCloseCountText').innerText = selectedChatKeys.size;
      document.getElementById('bulkCloseModal').style.display = 'flex';
    }

    function closeBulkCloseModal() {
      document.getElementById('bulkCloseModal').style.display = 'none';
    }

    async function confirmBulkClose() {
      const btn = document.getElementById('btnConfirmBulkClose');
      btn.innerText = 'Closing...';
      btn.disabled = true;

      try {
        const totalCards = document.querySelectorAll('#convoList .convo-card').length;
        const isAllSelected = (selectedChatKeys.size >= totalCards && totalCards > 0);
        const payload = isAllSelected 
          ? { all: true, channel: selectedChannel, status: 'resolved' }
          : { keys: Array.from(selectedChatKeys), status: 'resolved' };

        const res = await fetch('/api/chats/bulk-close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error('Server returned invalid response (Status ' + res.status + '): ' + text.substring(0, 100));
        }

        if (data.success) {
          clearBulkSelection();
          closeBulkCloseModal();
          await loadAllChats();
        } else {
          alert('Close failed: ' + (data.error || 'Server error'));
        }
      } catch (err) {
        alert('Network error: ' + err.message);
      } finally {
        btn.innerText = 'Confirm Close';
        btn.disabled = false;
      }
    }

    // Single Clear Chat Modal (Web + Mobile WhatsApp Sync)
    function openClearChatModal() {
      if (!activeChatKey) {
        alert('Please select a conversation first!');
        return;
      }
      const parts = activeChatKey.split(':');
      const channel = parts[0];
      const userId = activeChatKey.substring(channel.length + 1);
      const chat = (chatsData || []).find(c => c.channel === channel && c.userId === userId);
      const name = chat?.displayName || chat?.userName || chat?.purePhone || ('+' + userId);
      const targetEl = document.getElementById('clearChatTargetName');
      if (targetEl) targetEl.innerText = name;
      document.getElementById('clearChatModal').style.display = 'flex';
    }

    function closeClearChatModal() {
      document.getElementById('clearChatModal').style.display = 'none';
    }

    async function confirmClearChat() {
      if (!activeChatKey) return;
      const parts = activeChatKey.split(':');
      const channel = parts[0];
      const userId = activeChatKey.substring(channel.length + 1);

      const btn = document.getElementById('btnConfirmClearChat');
      btn.innerText = 'Clearing...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/chats/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, userId })
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch (e) { throw new Error(text.substring(0, 100)); }

        if (data.success) {
          closeClearChatModal();
          const area = document.getElementById('messagesArea');
          if (area) {
            area.innerHTML = '<div style="margin:auto; text-align:center; color:#94a3b8; font-size:13px;">Chat history cleared (synced with mobile WhatsApp). Send a message below to restart conversation!</div>';
          }
          await loadAllChats();
        } else {
          alert('Clear failed: ' + (data.error || 'Server error'));
        }
      } catch (err) {
        alert('Network error: ' + err.message);
      } finally {
        btn.innerText = 'Clear Messages';
        btn.disabled = false;
      }
    }

    // Single Delete Active Chat Modal (Web + Mobile WhatsApp Sync)
    function openDeleteActiveChatModal() {
      if (!activeChatKey) {
        alert('Please select a conversation first!');
        return;
      }
      const parts = activeChatKey.split(':');
      const channel = parts[0];
      const userId = activeChatKey.substring(channel.length + 1);
      const chat = (chatsData || []).find(c => c.channel === channel && c.userId === userId);
      const name = chat?.displayName || chat?.userName || chat?.purePhone || ('+' + userId);
      const targetEl = document.getElementById('deleteActiveChatTargetName');
      if (targetEl) targetEl.innerText = name;
      document.getElementById('deleteActiveChatModal').style.display = 'flex';
    }

    function closeDeleteActiveChatModal() {
      document.getElementById('deleteActiveChatModal').style.display = 'none';
    }

    async function confirmDeleteActiveChat() {
      if (!activeChatKey) return;
      const parts = activeChatKey.split(':');
      const channel = parts[0];
      const userId = activeChatKey.substring(channel.length + 1);

      const btn = document.getElementById('btnConfirmDeleteActiveChat');
      btn.innerText = 'Deleting...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/chats/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, userId })
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch (e) { throw new Error(text.substring(0, 100)); }

        if (data.success) {
          closeDeleteActiveChatModal();
          activeChatKey = null;
          const nameEl = document.getElementById('paneName');
          const phoneEl = document.getElementById('panePhone');
          const area = document.getElementById('messagesArea');
          if (nameEl) nameEl.innerText = 'Select a conversation';
          if (phoneEl) phoneEl.innerText = 'No conversation selected';
          if (area) area.innerHTML = '<div style="margin:auto; text-align:center; color:#94a3b8; font-size:13px;">Conversation deleted (synced with mobile WhatsApp).</div>';
          await loadAllChats();
        } else {
          alert('Delete failed: ' + (data.error || 'Server error'));
        }
      } catch (err) {
        alert('Network error: ' + err.message);
      } finally {
        btn.innerText = 'Delete Forever';
        btn.disabled = false;
      }
    }

    // File Attachment Handler (Image, PDF, Document)
    function triggerFileInput() {
      document.getElementById('chatFileInput').click();
    }

    function triggerAudioInput() {
      document.getElementById('chatAudioInput').click();
    }

    // ==========================================
    // VOICE FEATURES: VOICE SEARCH & LIVE VOICE TYPING WITH AUTO-SEND
    // ==========================================
    let currentVoiceLang = 'en-IN'; // Default: English (India)
    function toggleVoiceLanguage() {
      currentVoiceLang = (currentVoiceLang === 'en-IN') ? 'hi-IN' : 'en-IN';
      const txt = document.getElementById('voiceLangText');
      if (txt) txt.innerText = (currentVoiceLang === 'en-IN') ? 'EN' : 'HI';
      
      const btn = document.getElementById('btnVoiceLangToggle');
      if (btn) {
        btn.style.background = (currentVoiceLang === 'hi-IN') ? '#fef3c7' : '#f8fafc';
        btn.style.color = (currentVoiceLang === 'hi-IN') ? '#b45309' : '#0369a1';
        btn.style.borderColor = (currentVoiceLang === 'hi-IN') ? '#fde68a' : '#cbd5e1';
      }

      if (isTypingRecording && typingSpeechRec) {
        typingSpeechRec.stop();
        setTimeout(toggleVoiceTyping, 200);
      }
    }
    let searchSpeechRec = null;
    let isSearchRecording = false;

    function toggleVoiceSearch() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        return alert('Your browser does not support Speech Recognition. Please use Google Chrome or Microsoft Edge.');
      }

      const btn = document.getElementById('btnVoiceSearch');
      const input = document.getElementById('mainConvoSearchInput');

      if (isSearchRecording && searchSpeechRec) {
        searchSpeechRec.stop();
        isSearchRecording = false;
        btn.classList.remove('recording');
        return;
      }

      try {
        searchSpeechRec = new SpeechRecognition();
        searchSpeechRec.lang = currentVoiceLang; // Supports Hindi and English mixed names
        searchSpeechRec.continuous = false;
        searchSpeechRec.interimResults = false;

        searchSpeechRec.onstart = function() {
          isSearchRecording = true;
          btn.classList.add('recording');
          input.placeholder = '🎙️ Listening... Speak name (e.g. Amit)';
        };

        searchSpeechRec.onresult = function(event) {
          const spokenText = event.results[0][0].transcript.trim().replace(/[.,!?;:]/g, '');
          input.value = spokenText;
          handleSearchFilter(spokenText);

          // Find best matching conversation card and auto-open
          setTimeout(() => {
            const cleanQuery = spokenText.toLowerCase();
            const matchedChat = (chatsData || []).find(c => {
              const name = (c.userName || c.contactName || c.pushName || '').toLowerCase();
              const phone = (c.userId || '').replace(/[^0-9]/g, '');
              return name.includes(cleanQuery) || phone.includes(cleanQuery);
            });

            if (matchedChat) {
              selectChat(matchedChat.channel, matchedChat.userId);
            }
          }, 250);
        };

        searchSpeechRec.onerror = function(err) {
          console.warn('Voice Search recognition error:', err);
          isSearchRecording = false;
          btn.classList.remove('recording');
          input.placeholder = 'Search or start new chat';
        };

        searchSpeechRec.onend = function() {
          isSearchRecording = false;
          btn.classList.remove('recording');
          input.placeholder = 'Search or start new chat';
        };

        searchSpeechRec.start();
      } catch (err) {
        console.error('Voice search start error:', err);
      }
    }

    let typingSpeechRec = null;
    let isTypingRecording = false;
    let typingSilenceTimer = null;

    function toggleVoiceTyping() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        return alert('Your browser does not support Speech Recognition. Please use Google Chrome or Microsoft Edge.');
      }

      const btn = document.getElementById('btnLiveVoiceTyping');
      const input = document.getElementById('replyInput');

      if (isTypingRecording && typingSpeechRec) {
        typingSpeechRec.stop();
        if (typingSilenceTimer) clearTimeout(typingSilenceTimer);
        isTypingRecording = false;
        btn.classList.remove('recording');
        input.placeholder = 'Type a message...';
        return;
      }

      try {
        typingSpeechRec = new SpeechRecognition();
        typingSpeechRec.lang = currentVoiceLang; // Real-time Hindi + English dictation
        typingSpeechRec.continuous = true;
        typingSpeechRec.interimResults = true;

        typingSpeechRec.onstart = function() {
          isTypingRecording = true;
          btn.classList.add('recording');
          input.placeholder = '🎙️ Listening... Speak naturally (Say "Send" or pause to auto-send)';
        };

        typingSpeechRec.onresult = function(event) {
          if (typingSilenceTimer) clearTimeout(typingSilenceTimer);

          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          const combinedText = (finalTranscript || interimTranscript).trim();

          // Check for voice command "send", "भेज दो", "भेजो"
          const sendRegex = /\b(send|bhejo|bhej do|send it|send message)\b/i;
          const hindiSendRegex = /(भेज दो|भेजो|सेंड)/;

          if (sendRegex.test(combinedText) || hindiSendRegex.test(combinedText)) {
            // Remove the trigger word from the actual message text
            let cleanedText = combinedText
              .replace(sendRegex, '')
              .replace(hindiSendRegex, '')
              .trim();

            if (cleanedText) {
              input.value = cleanedText;
              handleReplyInput(input);
            }

            if (typingSpeechRec) typingSpeechRec.stop();
            isTypingRecording = false;
            btn.classList.remove('recording');
            input.placeholder = 'Type a message...';

            setTimeout(() => {
              sendManualReply();
            }, 300);
            return;
          }

          // Real-time live typing
          if (combinedText) {
            input.value = combinedText;
            handleReplyInput(input);

            // Auto-send on 3.5s silence pause if user has dictated a message
            typingSilenceTimer = setTimeout(() => {
              if (input.value.trim().length > 0 && isTypingRecording) {
                if (typingSpeechRec) typingSpeechRec.stop();
                isTypingRecording = false;
                btn.classList.remove('recording');
                input.placeholder = 'Type a message...';
                sendManualReply();
              }
            }, 3500);
          }
        };

        typingSpeechRec.onerror = function(err) {
          console.warn('Voice typing error:', err);
          if (typingSilenceTimer) clearTimeout(typingSilenceTimer);
          isTypingRecording = false;
          btn.classList.remove('recording');
          input.placeholder = 'Type a message...';
        };

        typingSpeechRec.onend = function() {
          isTypingRecording = false;
          btn.classList.remove('recording');
          input.placeholder = 'Type a message...';
        };

        typingSpeechRec.start();
      } catch (err) {
        console.error('Voice typing start error:', err);
      }
    }

    function handleFileSelected(e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(event) {
        currentAttachment = {
          fileBase64: event.target.result,
          fileName: file.name,
          fileType: file.type,
          fileSize: (file.size / 1024).toFixed(1) + ' KB'
        };

        const previewBox = document.getElementById('attachmentPreviewBox');
        const thumbImg = document.getElementById('attachmentThumbImg');
        const docIcon = document.getElementById('attachmentDocIcon');
        document.getElementById('attachmentFileName').innerText = currentAttachment.fileName;
        document.getElementById('attachmentFileSize').innerText = currentAttachment.fileSize;

        if (file.type.startsWith('image/')) {
          thumbImg.src = event.target.result;
          thumbImg.style.display = 'block';
          docIcon.style.display = 'none';
        } else {
          thumbImg.style.display = 'none';
          docIcon.style.display = 'block';
        }

        previewBox.style.display = 'flex';
        document.getElementById('btnSendAirplane').classList.add('active');
      };
      reader.readAsDataURL(file);
    }

    function handleAudioSelected(e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(event) {
        currentAttachment = {
          fileBase64: event.target.result,
          fileName: file.name || 'Voice Note.mp3',
          fileType: file.type || 'audio/mp3',
          fileSize: (file.size / 1024).toFixed(1) + ' KB'
        };

        const previewBox = document.getElementById('attachmentPreviewBox');
        document.getElementById('attachmentThumbImg').style.display = 'none';
        const docIcon = document.getElementById('attachmentDocIcon');
        docIcon.innerText = '🎵';
        docIcon.style.display = 'block';
        document.getElementById('attachmentFileName').innerText = currentAttachment.fileName;
        document.getElementById('attachmentFileSize').innerText = currentAttachment.fileSize;
        previewBox.style.display = 'flex';
        document.getElementById('btnSendAirplane').classList.add('active');
      };
      reader.readAsDataURL(file);
    }

    function removeAttachment() {
      currentAttachment = null;
      document.getElementById('chatFileInput').value = '';
      document.getElementById('chatAudioInput').value = '';
      document.getElementById('attachmentPreviewBox').style.display = 'none';
      if (!document.getElementById('replyInput').value.trim()) {
        document.getElementById('btnSendAirplane').classList.remove('active');
      }
    }

    // Quick Emojis & Canned Responses
    function toggleEmojiPicker() {
      const p = document.getElementById('emojiPickerPopup');
      p.style.display = (p.style.display === 'none') ? 'block' : 'none';
      document.getElementById('cannedRepliesPopup').style.display = 'none';
    }

    function insertEmoji(emoji) {
      const input = document.getElementById('replyInput');
      input.value += emoji;
      input.focus();
      document.getElementById('btnSendAirplane').classList.add('active');
      toggleEmojiPicker();
    }

    function toggleCannedPicker() {
      const p = document.getElementById('cannedRepliesPopup');
      p.style.display = (p.style.display === 'none') ? 'block' : 'none';
      document.getElementById('emojiPickerPopup').style.display = 'none';
    }

    function insertCanned(text) {
      const input = document.getElementById('replyInput');
      input.value = text;
      input.focus();
      handleReplyInput(input);
      document.getElementById('btnSendAirplane').classList.add('active');
      toggleCannedPicker();
    }

    async function triggerAiAssist() {
      if (!activeChatKey) return alert('Please select a conversation first.');
      const colonIdx = activeChatKey.indexOf(':');
      const channel = activeChatKey.substring(0, colonIdx);
      const userId = activeChatKey.substring(colonIdx + 1);
      const input = document.getElementById('replyInput');
      const currentText = input.value.trim();

      input.placeholder = '✨ AI is polishing / drafting response...';
      try {
        const res = await fetch('/api/chats/ai-assist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, userId, currentText })
        });
        const data = await res.json();
        if (data.success && data.suggestion) {
          input.value = data.suggestion;
          handleReplyInput(input);
          document.getElementById('btnSendAirplane').classList.add('active');
        }
      } catch (err) {
        console.error('AI Assist error:', err);
      } finally {
        input.placeholder = 'Type a message...';
      }
    }

    function handleReplyKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendManualReply();
      }
    }

    function handleReplyInput(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
      const hasContent = el.value.trim().length > 0 || !!currentAttachment;
      document.getElementById('btnSendAirplane').classList.toggle('active', hasContent);
    }

    function selectChat(channel, userId, scrollBottom = true) {
      if (!channel || !userId) return;
      activeChatKey = channel + ':' + userId;

      document.querySelectorAll('#convoList .convo-card').forEach(card => {
        const cChan = card.getAttribute('data-channel');
        const cId = card.getAttribute('data-userid');
        if (cChan === channel && cId === userId) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });

      const chat = (chatsData || []).find(c => c.channel === channel && c.userId === userId);
      if (!chat) return;

      const displayName = chat.displayName || chat.userName || ('+' + userId);
      const cleanName = displayName.startsWith('+') ? displayName.substring(1) : displayName;
      const initial = cleanName.charAt(0).toUpperCase() || 'U';

      const purePhoneDisplay = chat.formattedPhone || (chat.purePhone ? ('+' + chat.purePhone) : (userId.includes('@') ? userId.split('@')[0] : ('+' + userId)));

      // Middle Pane Elements
      const avatarEl = document.getElementById('paneAvatar');
      const nameEl = document.getElementById('paneName');
      const phoneEl = document.getElementById('panePhone');
      const btnAi = document.getElementById('btnAiToggle');

      if (avatarEl) avatarEl.innerText = initial;
      if (nameEl) nameEl.innerText = displayName;
      if (phoneEl) phoneEl.innerText = purePhoneDisplay + ' • ' + channel.toUpperCase();

      if (btnAi) {
        if (chat.isHumanTakeover) {
          btnAi.className = 'pill-btn-soft human-active';
          btnAi.innerHTML = '<span style="font-size:10px;">●</span> 👤 Chat AI OFF (Human Takeover)';
        } else {
          btnAi.className = 'pill-btn-soft ai-active';
          btnAi.innerHTML = '<span style="font-size:10px;">●</span> 🤖 Chat AI ON (Auto-Reply)';
        }
      }

      // Right Modal / Info Elements
      const modalAvatar = document.getElementById('modalBigAvatar');
      const modalName = document.getElementById('modalContactName');
      const modalPhone = document.getElementById('modalContactPhone');
      if (modalAvatar) modalAvatar.innerHTML = initial + '<div class="info-online-indicator"></div>';
      if (modalName) modalName.innerText = displayName;
      if (modalPhone) modalPhone.innerText = purePhoneDisplay;

      if (document.getElementById('modalStageVal')) {
        document.getElementById('modalStageVal').innerText = chat.leadStage || 'New Lead';
      }
      if (document.getElementById('modalOwnerVal')) {
        document.getElementById('modalOwnerVal').innerText = chat.owner || 'biswa342';
      }
      renderRightPanelData();

      // Messages Feed Render
      function renderMessagesFeed(msgs) {
        const area = document.getElementById('messagesArea');
        if (!area) return;
        if (!Array.isArray(msgs) || msgs.length === 0) {
          area.innerHTML = '<div style="margin:auto; text-align:center; color:#94a3b8; font-size:13px;">No messages yet. Send a message or attach a file below!</div>';
        } else {
          area.innerHTML = msgs.map(m => {
            const isUser = (m.sender === 'user');
            const rowClass = isUser ? 'incoming' : 'outgoing';
            const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

            let mediaHtml = '';
            if (m.mediaUrl) {
              if (m.mediaType === 'image') {
                mediaHtml = '<div style="margin-bottom:6px;"><img src="' + escapeHtml(m.mediaUrl) + '" style="max-width:240px; border-radius:8px;" onclick="window.open(this.src)"/></div>';
              } else if (m.mediaType === 'audio') {
                mediaHtml = '<div style="margin-bottom:6px;"><audio controls src="' + escapeHtml(m.mediaUrl) + '" style="max-width:220px;"></audio></div>';
              } else {
                mediaHtml = '<div style="margin-bottom:6px;"><a href="' + escapeHtml(m.mediaUrl) + '" target="_blank" style="color:#0284c7; text-decoration:underline;">📄 View Attachment</a></div>';
              }
            }

            const sentiment = m.sentiment || (m.text ? (m.text.toLowerCase().includes('urgent') || m.text.toLowerCase().includes('problem') ? 'urgent' : (m.text.toLowerCase().includes('yes') || m.text.toLowerCase().includes('interested') || m.text.toLowerCase().includes('good') ? 'positive' : 'neutral')) : 'neutral');
            const sentimentBadge = (isUser && sentiment !== 'neutral') 
              ? (sentiment === 'positive' 
                  ? '<span style="font-size:9.5px; background:#dcfce7; color:#15803d; border-radius:6px; padding:1px 5px; margin-left:6px; font-weight:700;">🟢 Positive</span>' 
                  : '<span style="font-size:9.5px; background:#fee2e2; color:#b91c1c; border-radius:6px; padding:1px 5px; margin-left:6px; font-weight:700;">🔴 Urgent</span>')
              : '';

            return '<div class="msg-row ' + rowClass + '">' +
              '<div class="msg-box">' +
                mediaHtml +
                escapeHtml(m.text || '') +
              '</div>' +
              '<div class="msg-time-stamp">' +
                time + (!isUser ? ' ✓' : '') + sentimentBadge +
              '</div>' +
            '</div>';
          }).join('');

          if (scrollBottom) {
            area.scrollTop = area.scrollHeight;
          }
        }
      }

      if (!Array.isArray(chat.messages) || chat.messages.length === 0) {
        fetch('/api/chats/' + encodeURIComponent(channel) + '/' + encodeURIComponent(userId))
          .then(r => r.json())
          .then(fullChat => {
            if (fullChat && Array.isArray(fullChat.messages)) {
              chat.messages = fullChat.messages;
              renderMessagesFeed(chat.messages);
            } else {
              renderMessagesFeed([]);
            }
          })
          .catch(() => renderMessagesFeed([]));
      } else {
        renderMessagesFeed(chat.messages);
      }
    }

    function promptSearchInChat() {
      const q = prompt('Search message text in this conversation:');
      if (!q) return;
      const lowerQ = q.toLowerCase();
      let matchedCount = 0;
      document.querySelectorAll('#messagesArea .msg-box').forEach(el => {
        if (el.innerText.toLowerCase().includes(lowerQ)) {
          el.style.outline = '2px solid #f59e0b';
          el.style.backgroundColor = '#fef3c7';
          if (matchedCount === 0) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          matchedCount++;
        } else {
          el.style.outline = 'none';
          el.style.backgroundColor = '';
        }
      });
      if (matchedCount === 0) {
        alert('No messages found matching: ' + q);
      }
    }

    async function toggleTakeover() {
      if (!activeChatKey) return;
      const colonIdx = activeChatKey.indexOf(':');
      const channel = activeChatKey.substring(0, colonIdx);
      const userId = activeChatKey.substring(colonIdx + 1);
      const chat = (chatsData || []).find(c => c.channel === channel && c.userId === userId);
      const newState = chat ? !chat.isHumanTakeover : true;

      await fetch('/api/chats/takeover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, userId, enabled: newState })
      });
      loadAllChats();
    }

    async function sendManualReply() {
      const input = document.getElementById('replyInput');
      const text = input.value.trim();
      if (!text && !currentAttachment) return;
      if (!activeChatKey) return alert('Select a conversation first!');

      const colonIdx = activeChatKey.indexOf(':');
      const channel = activeChatKey.substring(0, colonIdx);
      const userId = activeChatKey.substring(colonIdx + 1);

      input.value = '';
      input.style.height = '44px';
      document.getElementById('btnSendAirplane').classList.remove('active');

      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const area = document.getElementById('messagesArea');

      // Optimistic Bubble
      if (area) {
        const bubble = document.createElement('div');
        bubble.className = 'msg-row outgoing';
        const displayText = currentAttachment 
          ? (currentAttachment.fileType.startsWith('image/') 
              ? (text ? ('📷 Photo: ' + text) : '📷 Photo') 
              : ('📄 ' + currentAttachment.fileName + (text ? (' - ' + text) : '')))
          : text;

        bubble.innerHTML = '<div class="msg-box">' + escapeHtml(displayText) + '</div>' +
                           '<div class="msg-time-stamp">' + time + ' ✓</div>';
        area.appendChild(bubble);
        area.scrollTop = area.scrollHeight;
      }

      // 1. If attachment present, send via send-media
      if (currentAttachment) {
        const attachToSend = { ...currentAttachment };
        removeAttachment();
        try {
          await fetch('/api/chats/send-media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel,
              userId,
              fileBase64: attachToSend.fileBase64,
              fileName: attachToSend.fileName,
              fileType: attachToSend.fileType,
              caption: text
            })
          });
        } catch (err) {
          console.error('Send media error:', err);
        }
      } else {
        // 2. Normal text send
        try {
          await fetch('/api/chats/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, userId, text })
          });
        } catch (err) {
          console.error('Send error:', err);
        }
      }

      loadAllChats();
    }

    let searchDebounceTimer = null;
    function handleSearchFilter(q) {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        searchQuery = (q || '').trim();
        visibleRenderLimit = 80;
        renderSidebar();
      }, 150);
    }

    function filterChannel(chan) {
      selectedChannel = chan;
      document.querySelectorAll('.chan-pill').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-chan') === chan);
      });
      renderSidebar();
    }

    function filterStatus(el, status) {
      selectedStatus = status;
      document.querySelectorAll('.status-tab-btn').forEach(b => b.classList.remove('active'));
      el.classList.add('active');

      if (status !== 'bulk' && isBulkMode) {
        isBulkMode = false;
        document.getElementById('bulkActionBar').style.display = 'none';
        selectedChatKeys.clear();
      }
      renderSidebar();
    }

    function switchInfoTab(el, tab) {
      document.querySelectorAll('.info-tab-link').forEach(t => t.classList.remove('active'));
      if (el) el.classList.add('active');
      const pInfo = document.getElementById('panelTabInfo');
      const pNotes = document.getElementById('panelTabNotes');
      const pOrders = document.getElementById('panelTabOrders');
      const pApts = document.getElementById('panelTabAppointments');
      if (pInfo) pInfo.style.display = (tab === 'info') ? 'block' : 'none';
      if (pNotes) pNotes.style.display = (tab === 'notes') ? 'block' : 'none';
      if (pOrders) pOrders.style.display = (tab === 'orders') ? 'block' : 'none';
      if (pApts) pApts.style.display = (tab === 'appointments') ? 'block' : 'none';
      renderRightPanelData();
    }

    function renderRightPanelData() {
      if (!activeChatKey) return;
      const colonIdx = activeChatKey.indexOf(':');
      const channel = activeChatKey.substring(0, colonIdx);
      const userId = activeChatKey.substring(colonIdx + 1);
      const chat = (chatsData || []).find(c => c.channel === channel && c.userId === userId);
      if (!chat) return;

      // Render Notes
      const notesEl = document.getElementById('notesContainerList');
      if (notesEl) {
        const notes = Array.isArray(chat.notes) ? chat.notes : [];
        if (notes.length === 0) {
          notesEl.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:12px; padding:20px;">No notes yet. Click "+ Add Note" to save details!</div>';
        } else {
          notesEl.innerHTML = notes.map(n => 
            '<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; font-size:12px;">' +
              '<div style="display:flex; justify-content:space-between; color:#64748b; font-size:11px; margin-bottom:4px;">' +
                '<b>' + escapeHtml(n.author || 'biswa342') + '</b>' +
                '<span>' + (n.timestamp ? new Date(n.timestamp).toLocaleDateString() : '') + '</span>' +
              '</div>' +
              '<div style="color:#0f172a; white-space:pre-wrap;">' + escapeHtml(n.text) + '</div>' +
            '</div>'
          ).join('');
        }
      }

      // Render Orders / Quotations
      const ordersEl = document.getElementById('ordersContainerList');
      if (ordersEl) {
        const orders = Array.isArray(chat.orders) ? chat.orders : [];
        if (orders.length === 0) {
          ordersEl.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:12px; padding:20px;">No quotations sent yet. Click "+ New Quote" to create one!</div>';
        } else {
          ordersEl.innerHTML = orders.map(o => 
            '<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 10px; font-size:12px;">' +
              '<div style="display:flex; justify-content:space-between; margin-bottom:2px;">' +
                '<b style="color:#166534;">' + escapeHtml(o.service || 'Service Quote') + '</b>' +
                '<span style="font-weight:700; color:#15803d;">₹' + (o.finalAmount || o.amount) + '</span>' +
              '</div>' +
              '<div style="font-size:11px; color:#64748b;">Status: <span style="font-weight:600; color:#0284c7;">' + escapeHtml(o.status || 'Sent') + '</span> · ' + (o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '') + '</div>' +
              (o.notes ? '<div style="font-size:11px; color:#475569; margin-top:2px;">' + escapeHtml(o.notes) + '</div>' : '') +
            '</div>'
          ).join('');
        }
      }

      // Render Appointments
      const aptsEl = document.getElementById('appointmentsContainerList');
      if (aptsEl) {
        const apts = Array.isArray(chat.appointments) ? chat.appointments : [];
        if (apts.length === 0) {
          aptsEl.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:12px; padding:20px;">No appointments booked yet. Click "+ Book Slot" to schedule!</div>';
        } else {
          aptsEl.innerHTML = apts.map(a => 
            '<div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 10px; font-size:12px;">' +
              '<div style="display:flex; justify-content:space-between; margin-bottom:2px;">' +
                '<b style="color:#0369a1;">' + escapeHtml(a.title || 'Consultation') + '</b>' +
                '<span style="font-weight:700; color:#0284c7;">' + escapeHtml(a.time || '') + '</span>' +
              '</div>' +
              '<div style="font-size:11px; color:#64748b;">📅 Date: <b>' + escapeHtml(a.date || '') + '</b> · <span style="color:#16a34a; font-weight:600;">Confirmed</span></div>' +
            '</div>'
          ).join('');
        }
      }
    }

    // Modal Triggers for Quick Actions
    function openPaymentLinkModal() {
      if (!activeChatKey) return alert('Please select a contact first.');
      document.getElementById('paymentLinkModal').style.display = 'flex';
    }
    function closePaymentLinkModal() {
      document.getElementById('paymentLinkModal').style.display = 'none';
    }
    async function submitPaymentLink() {
      if (!activeChatKey) return;
      const colonIdx = activeChatKey.indexOf(':');
      const channel = activeChatKey.substring(0, colonIdx);
      const userId = activeChatKey.substring(colonIdx + 1);
      const amount = document.getElementById('payAmountInput').value;
      const description = document.getElementById('payDescInput').value;
      const btn = document.getElementById('btnSubmitPayment');
      btn.innerText = 'Sending...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/chats/payment-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, userId, amount, description })
        });
        const data = await res.json();
        if (data.success) {
          closePaymentLinkModal();
          selectChat(channel, userId);
        } else {
          alert('Error: ' + data.error);
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      } finally {
        btn.innerText = 'Generate & Send';
        btn.disabled = false;
      }
    }

    function openBookSlotModal() {
      if (!activeChatKey) return alert('Please select a contact first.');
      const today = new Date().toISOString().split('T')[0];
      const dateInp = document.getElementById('slotDateInput');
      if (dateInp && !dateInp.value) dateInp.value = today;
      document.getElementById('bookSlotModal').style.display = 'flex';
    }
    function closeBookSlotModal() {
      document.getElementById('bookSlotModal').style.display = 'none';
    }
    async function submitBookSlot() {
      if (!activeChatKey) return;
      const colonIdx = activeChatKey.indexOf(':');
      const channel = activeChatKey.substring(0, colonIdx);
      const userId = activeChatKey.substring(colonIdx + 1);
      const date = document.getElementById('slotDateInput').value;
      const time = document.getElementById('slotTimeInput').value;
      const title = document.getElementById('slotTopicInput').value;
      const btn = document.getElementById('btnSubmitSlot');
      btn.innerText = 'Booking...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/chats/book-slot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, userId, date, time, title })
        });
        const data = await res.json();
        if (data.success) {
          closeBookSlotModal();
          const chat = (chatsData || []).find(c => c.channel === channel && c.userId === userId);
          if (chat) {
            if (!Array.isArray(chat.appointments)) chat.appointments = [];
            chat.appointments.unshift(data.appointment);
            chat.leadStage = 'Slot Booked';
            if (document.getElementById('modalStageVal')) document.getElementById('modalStageVal').innerText = 'Slot Booked';
          }
          selectChat(channel, userId);
          renderRightPanelData();
        } else {
          alert('Error: ' + data.error);
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      } finally {
        btn.innerText = 'Confirm & Send Invite';
        btn.disabled = false;
      }
    }

    function openQuotationModal() {
      if (!activeChatKey) return alert('Please select a contact first.');
      document.getElementById('quotationModal').style.display = 'flex';
    }
    function closeQuotationModal() {
      document.getElementById('quotationModal').style.display = 'none';
    }
    async function submitQuotation() {
      if (!activeChatKey) return;
      const colonIdx = activeChatKey.indexOf(':');
      const channel = activeChatKey.substring(0, colonIdx);
      const userId = activeChatKey.substring(colonIdx + 1);
      const service = document.getElementById('quoteServiceInput').value;
      const amount = document.getElementById('quoteAmountInput').value;
      const discount = document.getElementById('quoteDiscountInput').value;
      const notes = document.getElementById('quoteNotesInput').value;
      const btn = document.getElementById('btnSubmitQuotation');
      btn.innerText = 'Sending Quote...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/chats/quotation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, userId, service, amount, discount, notes })
        });
        const data = await res.json();
        if (data.success) {
          closeQuotationModal();
          const chat = (chatsData || []).find(c => c.channel === channel && c.userId === userId);
          if (chat) {
            if (!Array.isArray(chat.orders)) chat.orders = [];
            chat.orders.unshift(data.quotation);
            chat.leadStage = 'Quotation Sent';
            if (document.getElementById('modalStageVal')) document.getElementById('modalStageVal').innerText = 'Quotation Sent';
          }
          selectChat(channel, userId);
          renderRightPanelData();
        } else {
          alert('Error: ' + data.error);
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      } finally {
        btn.innerText = 'Generate & Send';
        btn.disabled = false;
      }
    }

    function openNotesModal() {
      if (!activeChatKey) return alert('Please select a contact first.');
      document.getElementById('noteTextInput').value = '';
      document.getElementById('notesModal').style.display = 'flex';
    }
    function closeNotesModal() {
      document.getElementById('notesModal').style.display = 'none';
    }
    async function submitNote() {
      if (!activeChatKey) return;
      const colonIdx = activeChatKey.indexOf(':');
      const channel = activeChatKey.substring(0, colonIdx);
      const userId = activeChatKey.substring(colonIdx + 1);
      const text = document.getElementById('noteTextInput').value.trim();
      if (!text) return alert('Please enter note text');
      const btn = document.getElementById('btnSubmitNote');
      btn.innerText = 'Saving...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/chats/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, userId, text, author: 'biswa342' })
        });
        const data = await res.json();
        if (data.success) {
          closeNotesModal();
          const chat = (chatsData || []).find(c => c.channel === channel && c.userId === userId);
          if (chat) {
            chat.notes = data.notes;
          }
          renderRightPanelData();
        } else {
          alert('Error: ' + data.error);
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      } finally {
        btn.innerText = 'Save Note';
        btn.disabled = false;
      }
    }

    function openAssignModal() {
      if (!activeChatKey) return alert('Please select a contact first.');
      document.getElementById('assignModal').style.display = 'flex';
    }
    function closeAssignModal() {
      document.getElementById('assignModal').style.display = 'none';
    }
    async function submitAssign() {
      if (!activeChatKey) return;
      const colonIdx = activeChatKey.indexOf(':');
      const channel = activeChatKey.substring(0, colonIdx);
      const userId = activeChatKey.substring(colonIdx + 1);
      const owner = document.getElementById('assigneeSelect').value;
      const btn = document.getElementById('btnSubmitAssign');
      btn.innerText = 'Assigning...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/chats/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, userId, owner })
        });
        const data = await res.json();
        if (data.success) {
          closeAssignModal();
          if (document.getElementById('modalOwnerVal')) document.getElementById('modalOwnerVal').innerText = owner;
          const chat = (chatsData || []).find(c => c.channel === channel && c.userId === userId);
          if (chat) chat.owner = owner;
        } else {
          alert('Error: ' + data.error);
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      } finally {
        btn.innerText = 'Assign Operator';
        btn.disabled = false;
      }
    }

    function openStageModal() {
      if (!activeChatKey) return alert('Please select a contact first.');
      document.getElementById('stageModal').style.display = 'flex';
    }
    function closeStageModal() {
      document.getElementById('stageModal').style.display = 'none';
    }
    async function submitStage() {
      if (!activeChatKey) return;
      const colonIdx = activeChatKey.indexOf(':');
      const channel = activeChatKey.substring(0, colonIdx);
      const userId = activeChatKey.substring(colonIdx + 1);
      const stage = document.getElementById('stageSelect').value;
      const btn = document.getElementById('btnSubmitStage');
      btn.innerText = 'Updating...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/chats/stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, userId, stage })
        });
        const data = await res.json();
        if (data.success) {
          closeStageModal();
          if (document.getElementById('modalStageVal')) document.getElementById('modalStageVal').innerText = stage;
          const chat = (chatsData || []).find(c => c.channel === channel && c.userId === userId);
          if (chat) chat.leadStage = stage;
        } else {
          alert('Error: ' + data.error);
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      } finally {
        btn.innerText = 'Update Pipeline';
        btn.disabled = false;
      }
    }

    function openAiCallModal() {
      if (!activeChatKey) return alert('Please select a contact first.');
      const nameEl = document.getElementById('paneName');
      document.getElementById('aiCallTargetName').innerText = nameEl ? nameEl.innerText : 'this contact';
      document.getElementById('aiCallModal').style.display = 'flex';
    }
    function closeAiCallModal() {
      document.getElementById('aiCallModal').style.display = 'none';
    }
    async function submitAiCall() {
      if (!activeChatKey) return;
      const colonIdx = activeChatKey.indexOf(':');
      const channel = activeChatKey.substring(0, colonIdx);
      const userId = activeChatKey.substring(colonIdx + 1);
      const btn = document.getElementById('btnSubmitAiCall');
      btn.innerText = 'Connecting...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/chats/ai-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, userId })
        });
        const data = await res.json();
        if (data.success) {
          closeAiCallModal();
          selectChat(channel, userId);
        } else {
          alert('Error: ' + data.error);
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      } finally {
        btn.innerText = 'Start AI Call';
        btn.disabled = false;
      }
    }

    function resolveChat() {
      if (confirm('Mark this conversation as Resolved?')) {
        alert('Chat marked as Resolved.');
      }
    }

    function summarizeChat() {
      if (!activeChatKey) return;
      const colonIdx = activeChatKey.indexOf(':');
      const channel = activeChatKey.substring(0, colonIdx);
      const userId = activeChatKey.substring(colonIdx + 1);
      const chat = (chatsData || []).find(c => c.channel === channel && c.userId === userId);
      if (!chat || !chat.messages.length) return alert('No messages to summarize.');
      const count = chat.messages.length;
      alert('Conversation Summary:\\n- Contact: ' + userId + '\\n- Total Messages: ' + count + '\\n- Channel: ' + channel + '\\n- Status: Active Lead');
    }

    function exportActiveChat() {
      location.href = '/download/leads.csv';
    }

    function promptNewChat() {
      const num = prompt('Enter recipient WhatsApp number (with country code, e.g. 919876543210):');
      if (num) {
        selectChat('whatsapp_qr', num.trim());
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Fast Lazy Load on Scroll for Smooth 60fps Scrolling
    const convoListEl = document.getElementById('convoList');
    if (convoListEl) {
      convoListEl.addEventListener('scroll', () => {
        if (convoListEl.scrollTop + convoListEl.clientHeight >= convoListEl.scrollHeight - 300) {
          if (visibleRenderLimit < chatsData.length) {
            visibleRenderLimit += 50;
            renderSidebar(true);
          }
        }
      });
    }

    // Polling every 3s in background
    setInterval(loadAllChats, 3000);
  </script>
  `;

  const html = renderSidebarLayout({
    title: 'Live Unified Inbox',
    activeNav: 'inbox',
    contentHtml
  });

  res.send(html);
});

module.exports = router;

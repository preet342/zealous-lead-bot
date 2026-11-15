const fs = require('fs');
const path = require('path');
const leadService = require('./leadService');
const chatManager = require('./chatManager');
const whatsappQr = require('../channels/whatsappQr');
const telegram = require('../channels/telegram');

const HISTORY_FILE = path.join(__dirname, '../../data/campaignHistory.json');

function getCampaignHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[CampaignService] Error reading history:', e.message);
  }
  return [];
}

function saveCampaignRecord(record) {
  try {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const history = getCampaignHistory();
    history.unshift(record);
    if (history.length > 50) history.pop();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (e) {
    console.error('[CampaignService] Error saving record:', e.message);
  }
}

/**
 * Send a single test campaign message + image/PDF to verify preview
 */
async function sendTestCampaign({ channel = 'whatsapp_qr', to, message, imageUrl, pdfUrl, pdfFileName }) {
  if (!to) throw new Error('Recipient phone number or ID is required for test send.');
  if (!message && !imageUrl && !pdfUrl) throw new Error('Message text, image, or PDF document is required.');

  let success = false;
  let error = null;

  try {
    if (channel === 'whatsapp_qr') {
      if (pdfUrl) {
        success = await whatsappQr.sendWhatsAppQrDocument(to, pdfUrl, pdfFileName || 'document.pdf', message || '');
      } else if (imageUrl) {
        success = await whatsappQr.sendWhatsAppQrImage(to, imageUrl, message || '');
      } else {
        success = await whatsappQr.sendWhatsAppQrMessage(to, message);
      }
    } else if (channel === 'telegram') {
      if (pdfUrl) {
        success = await telegram.sendTelegramDocument(to, pdfUrl, message || '');
      } else if (imageUrl) {
        success = await telegram.sendTelegramPhoto(to, imageUrl, message || '');
      } else {
        success = await telegram.sendTelegramMessage(to, message);
      }
    }
  } catch (err) {
    error = err.message;
    success = false;
  }

  return { success, error, to, channel };
}

/**
 * Broadcast campaign with optional image or PDF document to multiple recipients safely
 */
async function broadcastCampaign({ campaignTitle = 'Broadcast Campaign', channel = 'whatsapp_qr', targetAudience = 'all', message, imageUrl, pdfUrl, pdfFileName }) {
  if (!message && !imageUrl && !pdfUrl) {
    throw new Error('Broadcast must have at least message text, an image, or a PDF document.');
  }

  // 1. Collect target recipients
  const recipients = new Set();
  const leads = leadService.getAllLeads();
  const chats = chatManager.getAllConversations();

  if (channel === 'whatsapp_qr' || channel === 'all') {
    leads.filter(l => l.channel === 'whatsapp_qr' || l.leadData?.phone).forEach(l => {
      if (l.leadData?.phone) recipients.add(l.leadData.phone.replace(/[^0-9]/g, ''));
      else if (l.userId && !l.userId.includes('@g.us')) recipients.add(l.userId.replace(/[^0-9]/g, ''));
    });
    chats.filter(c => c.channel === 'whatsapp_qr').forEach(c => {
      const clean = c.userId.replace(/[^0-9]/g, '');
      if (clean && clean.length >= 10 && !c.userId.includes('@g.us')) recipients.add(clean);
    });
  }

  if (channel === 'telegram' || channel === 'all') {
    leads.filter(l => l.channel === 'telegram').forEach(l => recipients.add(l.userId));
    chats.filter(c => c.channel === 'telegram').forEach(c => recipients.add(c.userId));
  }

  const recipientList = Array.from(recipients);
  console.log(`[CampaignService] Starting broadcast "${campaignTitle}" to ${recipientList.length} recipients...`);

  const results = {
    campaignTitle,
    channel,
    totalTargeted: recipientList.length,
    sentCount: 0,
    failedCount: 0,
    timestamp: new Date().toISOString(),
    message,
    imageUrl: imageUrl || null,
    pdfUrl: pdfUrl || null,
    pdfFileName: pdfFileName || null,
    details: []
  };

  // 2. Loop with safety delay (1200ms) to avoid spam filters
  for (const target of recipientList) {
    try {
      let sent = false;
      if (channel === 'telegram' || (channel === 'all' && !/^\d{10,15}$/.test(target))) {
        if (pdfUrl) {
          sent = await telegram.sendTelegramDocument(target, pdfUrl, message || '');
        } else if (imageUrl) {
          sent = await telegram.sendTelegramPhoto(target, imageUrl, message || '');
        } else {
          sent = await telegram.sendTelegramMessage(target, message);
        }
      } else {
        if (pdfUrl) {
          sent = await whatsappQr.sendWhatsAppQrDocument(target, pdfUrl, pdfFileName || 'document.pdf', message || '');
        } else if (imageUrl) {
          sent = await whatsappQr.sendWhatsAppQrImage(target, imageUrl, message || '');
        } else {
          sent = await whatsappQr.sendWhatsAppQrMessage(target, message);
        }
      }

      if (sent) {
        results.sentCount++;
        results.details.push({ target, status: 'success' });
      } else {
        results.failedCount++;
        results.details.push({ target, status: 'failed', error: 'Delivery returned false' });
      }
    } catch (err) {
      results.failedCount++;
      results.details.push({ target, status: 'failed', error: err.message });
    }

    // Anti-spam spacing delay
    await new Promise(r => setTimeout(r, 1200));
  }

  saveCampaignRecord(results);
  return results;
}

module.exports = {
  broadcastCampaign,
  sendTestCampaign,
  getCampaignHistory
};

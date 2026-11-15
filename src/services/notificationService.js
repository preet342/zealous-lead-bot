const axios = require('axios');
const config = require('../config');

/**
 * Send instant alert to admin when a lead is captured
 */
async function notifyAdmin(lead) {
  if (!lead) return;
  const { channel, userId, leadData = {} } = lead;

  const scoreBadge = leadData.score >= 80 ? '🔥 HOT LEAD' : (leadData.score >= 50 ? '⚡ WARM LEAD' : '🌱 NEW INQUIRY');

  const message = 
`🎯 *${scoreBadge} CAPTURED!* 🚀

📱 *Platform:* ${channel.toUpperCase()}
👤 *Client Name:* ${leadData.name || 'Anonymous'}
📞 *Phone / Contact:* ${leadData.phone || userId || 'N/A'}
💼 *Service Needed:* ${leadData.service || 'General Inquiry'}
💰 *Budget Mentioned:* ${leadData.budget || 'Not specified'}
📝 *Client Notes:* ${leadData.notes || 'None'}
📊 *Lead Score:* ${leadData.score || 70}/100
⏰ *Time:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

🔗 *Open Live Inbox:* http://localhost:${config.port}/inbox
_Please follow up promptly to maximize conversion rate!_`;

  console.log(`[NotificationService] Sending Lead Alert for ${leadData.name || userId} (${channel})...`);

  // 1. Deliver to Telegram Admin Chat if configured
  if (config.telegram.botToken && config.telegram.adminChatId) {
    try {
      const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
      await axios.post(url, {
        chat_id: config.telegram.adminChatId,
        text: message,
        parse_mode: 'Markdown'
      });
      console.log('[NotificationService] ✅ Lead dossier successfully sent to Telegram Admin!');
    } catch (err) {
      console.error('[NotificationService] Telegram alert failed:', err.response?.data?.description || err.message);
    }
  }

  // 2. Deliver to Admin WhatsApp if ADMIN_WHATSAPP_PHONE is configured
  const adminWhatsApp = process.env.ADMIN_WHATSAPP_PHONE;
  if (adminWhatsApp) {
    try {
      const whatsappQr = require('../channels/whatsappQr');
      await whatsappQr.sendWhatsAppQrMessage(adminWhatsApp, message);
      console.log('[NotificationService] ✅ Lead dossier sent to Admin WhatsApp!');
    } catch (e) {
      // Non-blocking
    }
  }
}

module.exports = {
  notifyAdmin
};

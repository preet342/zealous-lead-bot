const axios = require('axios');
const config = require('../config');
const aiService = require('../services/aiService');

/**
 * Send WhatsApp text message via Meta Cloud API
 */
async function sendWhatsAppMessage(toPhoneNumber, messageText) {
  if (!config.whatsapp.accessToken || !config.whatsapp.phoneNumberId) {
    console.warn('[WhatsApp] Credentials missing. Message not sent:', messageText);
    return;
  }

  const url = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;
  try {
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhoneNumber,
        type: 'text',
        text: { body: messageText }
      },
      {
        headers: {
          Authorization: `Bearer ${config.whatsapp.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`[WhatsApp] Sent reply to ${toPhoneNumber}`);
  } catch (err) {
    console.error('[WhatsApp] Send failed:', err.response?.data || err.message);
  }
}

/**
 * Handle incoming webhook payload from Meta WhatsApp Cloud API
 */
async function handleWhatsAppWebhook(body) {
  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message || message.type !== 'text') {
      return; // Ignore read receipts, status updates, or non-text for now
    }

    const fromNumber = message.from; // Sender WhatsApp ID / Phone number
    const text = message.text?.body;

    console.log(`[WhatsApp] Incoming message from ${fromNumber}: "${text}"`);
    const reply = await aiService.processMessage(fromNumber, 'whatsapp', text);
    await sendWhatsAppMessage(fromNumber, reply);
  } catch (err) {
    console.error('[WhatsApp] Webhook handling error:', err.message);
  }
}

module.exports = {
  sendWhatsAppMessage,
  handleWhatsAppWebhook
};

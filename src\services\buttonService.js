const axios = require('axios');
const config = require('../config');

/**
 * Send WhatsApp Interactive Button Message via Cloud API
 */
async function sendWhatsAppButtons(toPhoneNumber, headerText, bodyText, buttons) {
  if (!config.whatsapp.accessToken || !config.whatsapp.phoneNumberId) return;

  const url = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;
  try {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toPhoneNumber,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'text',
          text: headerText || 'BWB Media'
        },
        body: {
          text: bodyText
        },
        action: {
          buttons: buttons.slice(0, 3).map((btn, idx) => ({
            type: 'reply',
            reply: {
              id: btn.id || `btn_${idx}`,
              title: btn.title.slice(0, 20) // WhatsApp limit is 20 chars
            }
          }))
        }
      }
    };

    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`[ButtonService] Sent interactive buttons to ${toPhoneNumber}`);
  } catch (err) {
    console.error('[ButtonService] Button send error:', err.response?.data || err.message);
  }
}

module.exports = {
  sendWhatsAppButtons
};

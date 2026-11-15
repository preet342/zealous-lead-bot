const axios = require('axios');
const config = require('../config');
const aiService = require('../services/aiService');

/**
 * Send Instagram Direct Message reply via Meta Graph API
 */
async function sendInstagramMessage(recipientId, messageText) {
  const token = config.instagram.pageAccessToken || config.facebook.pageAccessToken;
  if (!token) {
    console.warn('[Instagram] INSTAGRAM_ACCESS_TOKEN missing. Cannot send message.');
    return false;
  }

  const url = `https://graph.facebook.com/${config.instagram.apiVersion}/me/messages`;
  try {
    // Show realistic typing bubble on Instagram DM
    try {
      await axios.post(url, { recipient: { id: recipientId }, sender_action: 'typing_on' }, { params: { access_token: token } });
      const delay = Math.min(Math.max((messageText || '').length * 15, 1000), 2500);
      await new Promise(r => setTimeout(r, delay));
    } catch (e) {}

    await axios.post(
      url,
      {
        recipient: { id: recipientId },
        message: { text: messageText }
      },
      {
        params: { access_token: token }
      }
    );
    console.log(`[Instagram] Sent reply to ${recipientId}`);
    return true;
  } catch (err) {
    console.error('[Instagram] Send failed:', err.response?.data || err.message);
    return false;
  }
}

/**
 * Reply publicly to an Instagram Post / Reel comment
 */
async function replyToInstagramComment(commentId, replyText) {
  const token = config.instagram.pageAccessToken || config.facebook.pageAccessToken;
  if (!token) return false;

  const url = `https://graph.facebook.com/${config.instagram.apiVersion}/${commentId}/replies`;
  try {
    await axios.post(
      url,
      { message: replyText },
      { params: { access_token: token } }
    );
    console.log(`[Instagram] Replied publicly to comment ${commentId}`);
    return true;
  } catch (err) {
    console.error('[Instagram] Comment reply failed:', err.response?.data || err.message);
    return false;
  }
}

/**
 * Handle incoming Instagram Messaging webhook event
 */
async function handleInstagramWebhook(messagingEvent) {
  try {
    const senderId = messagingEvent.sender?.id;
    const message = messagingEvent.message;

    // Ignore echoes of bot's own messages
    if (!senderId || !message || !message.text || message.is_echo) {
      return;
    }

    console.log(`[Instagram] Incoming DM from ${senderId}: "${message.text}"`);
    const reply = await aiService.processMessage(senderId, 'instagram', message.text);
    if (reply) {
      await sendInstagramMessage(senderId, reply);
    }
  } catch (err) {
    console.error('[Instagram] Webhook processing error:', err.message);
  }
}

/**
 * Handle incoming Instagram Comments webhook event
 */
async function handleInstagramCommentChange(change) {
  try {
    const value = change.value;
    if (!value) return;

    const commentId = value.id;
    const commentText = value.text || '';
    const fromUser = value.from?.username || 'friend';

    console.log(`[Instagram Comment] @${fromUser}: "${commentText}"`);

    // 1. Public reply on Instagram post
    const publicReply = `Hey @${fromUser}! Check your DMs for complete details & pricing 📩✨`;
    await replyToInstagramComment(commentId, publicReply);

    // 2. If user ID is available, send DM
    if (value.from?.id) {
      const dmIntro = `Hello @${fromUser}! 👋 Thank you for commenting on our Instagram post.\n\n`;
      const aiReply = await aiService.processMessage(value.from.id, 'instagram', commentText || 'Pricing info');
      if (aiReply) {
        await sendInstagramMessage(value.from.id, dmIntro + aiReply);
      }
    }
  } catch (err) {
    console.error('[Instagram] Comment change error:', err.message);
  }
}

module.exports = {
  sendInstagramMessage,
  replyToInstagramComment,
  handleInstagramWebhook,
  handleInstagramCommentChange
};

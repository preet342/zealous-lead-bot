const axios = require('axios');
const config = require('../config');
const aiService = require('../services/aiService');

/**
 * Send Messenger reply via Meta Graph API
 */
async function sendFacebookMessage(recipientId, messageText) {
  if (!config.facebook.pageAccessToken) {
    console.warn('[Facebook] FB_PAGE_ACCESS_TOKEN missing. Cannot send message.');
    return false;
  }

  const url = `https://graph.facebook.com/${config.facebook.apiVersion}/me/messages`;
  try {
    // Show realistic typing bubble on Messenger
    try {
      await axios.post(url, { recipient: { id: recipientId }, sender_action: 'typing_on' }, { params: { access_token: config.facebook.pageAccessToken } });
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
        params: { access_token: config.facebook.pageAccessToken }
      }
    );
    console.log(`[Facebook] Sent reply to ${recipientId}`);
    return true;
  } catch (err) {
    console.error('[Facebook] Send failed:', err.response?.data || err.message);
    return false;
  }
}

/**
 * Reply publicly to a Facebook Post comment
 */
async function replyToFacebookComment(commentId, replyText) {
  if (!config.facebook.pageAccessToken) return false;
  const url = `https://graph.facebook.com/${config.facebook.apiVersion}/${commentId}/comments`;
  try {
    await axios.post(
      url,
      { message: replyText },
      { params: { access_token: config.facebook.pageAccessToken } }
    );
    console.log(`[Facebook] Replied publicly to comment ${commentId}`);
    return true;
  } catch (err) {
    console.error('[Facebook] Comment reply failed:', err.response?.data || err.message);
    return false;
  }
}

/**
 * Send a Private Message (DM) to a Facebook Post commenter
 */
async function sendFacebookPrivateReply(commentId, replyText) {
  if (!config.facebook.pageAccessToken) return false;
  const url = `https://graph.facebook.com/${config.facebook.apiVersion}/me/messages`;
  try {
    await axios.post(
      url,
      {
        recipient: { comment_id: commentId },
        message: { text: replyText }
      },
      { params: { access_token: config.facebook.pageAccessToken } }
    );
    console.log(`[Facebook] Sent private reply to commenter of ${commentId}`);
    return true;
  } catch (err) {
    console.error('[Facebook] Private reply failed:', err.response?.data || err.message);
    return false;
  }
}

/**
 * Handle incoming Facebook Messenger webhook event
 */
async function handleFacebookWebhook(messagingEvent) {
  try {
    const senderId = messagingEvent.sender?.id;
    const message = messagingEvent.message;

    if (!senderId || !message || !message.text) {
      return;
    }

    console.log(`[Facebook] Incoming message from ${senderId}: "${message.text}"`);
    const reply = await aiService.processMessage(senderId, 'facebook', message.text);
    if (reply) {
      await sendFacebookMessage(senderId, reply);
    }
  } catch (err) {
    console.error('[Facebook] Webhook processing error:', err.message);
  }
}

/**
 * Handle incoming Facebook Feed/Comment changes
 */
async function handleFacebookFeedChange(change) {
  try {
    const value = change.value;
    if (!value) return;

    // We only care about new comments
    if (value.item === 'comment' && value.verb === 'add') {
      const commentId = value.comment_id;
      const commenterName = value.from?.name || 'there';
      const commentText = value.message || '';
      const commenterId = value.from?.id;

      console.log(`[Facebook Comment] From ${commenterName} on post: "${commentText}"`);

      // 1. Post public friendly acknowledgement
      const publicReply = `Hey ${commenterName}! Sent you complete details & pricing in your DM 📩 Check your inbox! 😊`;
      await replyToFacebookComment(commentId, publicReply);

      // 2. Send private message to start lead qualification flow
      const introDm = `Hi ${commenterName}! 👋 Thank you for commenting on our post.\n\nHere are the details regarding BWB Media services:\n`;
      const aiReply = await aiService.processMessage(commenterId || commentId, 'facebook', commentText || 'Details please');
      await sendFacebookPrivateReply(commentId, introDm + aiReply);
    }
  } catch (err) {
    console.error('[Facebook] Feed change error:', err.message);
  }
}

module.exports = {
  sendFacebookMessage,
  replyToFacebookComment,
  sendFacebookPrivateReply,
  handleFacebookWebhook,
  handleFacebookFeedChange
};

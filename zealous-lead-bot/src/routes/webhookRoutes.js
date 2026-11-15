const express = require('express');
const router = express.Router();
const config = require('../config');

const whatsapp = require('../channels/whatsapp');
const facebook = require('../channels/facebook');
const instagram = require('../channels/instagram');

/**
 * Meta Webhook Verification (WhatsApp, Facebook, Instagram)
 * Meta calls this with GET to verify your server URL
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === config.metaVerifyToken) {
      console.log('✅ [Meta Webhook] Successfully verified by Meta!');
      return res.status(200).send(challenge);
    } else {
      console.warn('❌ [Meta Webhook] Verification failed: Tokens do not match.');
      return res.sendStatus(403);
    }
  }

  res.status(400).send('Invalid verification request');
});

/**
 * Meta Webhook Event Handler (WhatsApp, Facebook, Instagram)
 * Meta sends all incoming messages & comments via POST
 */
router.post('/webhook', async (req, res) => {
  // Always return 200 OK immediately to satisfy Meta's timeout
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;
  if (!body || !body.object) return;

  try {
    // 1. WhatsApp Cloud API Webhook
    if (body.object === 'whatsapp_business_account') {
      await whatsapp.handleWhatsAppWebhook(body);
      return;
    }

    // 2. Facebook Messenger & Post Comments Webhook
    if (body.object === 'page') {
      const entries = body.entry || [];
      for (const entry of entries) {
        // Direct messages
        const messagingEvents = entry.messaging || [];
        for (const event of messagingEvents) {
          await facebook.handleFacebookWebhook(event);
        }

        // Post / Reel / Feed comments
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field === 'feed') {
            await facebook.handleFacebookFeedChange(change);
          }
        }
      }
      return;
    }

    // 3. Instagram Direct Message & Reel Comments Webhook
    if (body.object === 'instagram') {
      const entries = body.entry || [];
      for (const entry of entries) {
        // Direct messages
        const messagingEvents = entry.messaging || [];
        for (const event of messagingEvents) {
          await instagram.handleInstagramWebhook(event);
        }

        // Reel / Post comments
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field === 'comments') {
            await instagram.handleInstagramCommentChange(change);
          }
        }
      }
      return;
    }
  } catch (err) {
    console.error('[Webhook] Error handling event:', err.message);
  }
});

module.exports = router;

require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  
  // Meta (WhatsApp, Facebook, Instagram) Webhook verification token
  metaVerifyToken: process.env.META_VERIFY_TOKEN || 'my_secure_lead_bot_token_123',
  
  // WhatsApp Cloud API
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    apiVersion: process.env.META_API_VERSION || 'v20.0'
  },

  // Facebook Messenger
  facebook: {
    pageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN || '',
    apiVersion: process.env.META_API_VERSION || 'v20.0'
  },

  // Instagram Graph API
  instagram: {
    pageAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN || '',
    apiVersion: process.env.META_API_VERSION || 'v20.0'
  },

  // Telegram
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || ''
  },

  // AI Configuration (Gemini & OpenRouter Hybrid)
  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    businessName: process.env.BUSINESS_NAME || 'BWB Media',
    businessDescription: process.env.BUSINESS_DESCRIPTION || 'Digital Marketing, Social Media Marketing, Lead Generation & Web Solutions'
  }
};

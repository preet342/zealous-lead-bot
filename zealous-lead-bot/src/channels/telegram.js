const { Telegraf } = require('telegraf');
const config = require('../config');
const aiService = require('../services/aiService');
const leadService = require('../services/leadService');

let bot = null;

function initTelegram() {
  if (!config.telegram.botToken) {
    console.log('[Telegram] No TELEGRAM_BOT_TOKEN provided. Skipping Telegram listener.');
    return;
  }

  try {
    bot = new Telegraf(config.telegram.botToken);

    // Command to check status
    bot.command('start', async (ctx) => {
      const from = ctx.from;
      const reply = await aiService.processMessage(from.id.toString(), 'telegram', 'hi');
      await ctx.replyWithMarkdown(reply);
    });

    // Admin command to view all leads
    bot.command('leads', async (ctx) => {
      // Check if user is admin
      if (config.telegram.adminChatId && ctx.chat.id.toString() !== config.telegram.adminChatId.toString()) {
        return ctx.reply('Unauthorized: Only Admin can access leads.');
      }
      const leads = leadService.getAllLeads();
      if (!leads.length) {
        return ctx.reply('No leads captured yet.');
      }
      let summary = `📋 *Recent Captured Leads (${leads.length}):*\n\n`;
      leads.slice(0, 10).forEach((l, idx) => {
        summary += `${idx + 1}. *${l.leadData.name || 'Anonymous'}* (${l.channel})\n`;
        summary += `   📞 ${l.leadData.phone || 'No phone'}\n`;
        summary += `   🎯 ${l.leadData.service || 'N/A'}\n`;
        summary += `   📅 ${new Date(l.createdAt).toLocaleDateString()}\n\n`;
      });
      await ctx.replyWithMarkdown(summary);
    });

    // Handle normal text messages
    bot.on('text', async (ctx) => {
      try {
        const from = ctx.from;
        const text = ctx.message.text;
        
        // Show human typing status in Telegram
        try { await ctx.sendChatAction('typing'); } catch (e) {}

        const reply = await aiService.processMessage(from.id.toString(), 'telegram', text);
        
        if (reply) {
          const delay = Math.min(Math.max(reply.length * 20, 1000), 2500);
          await new Promise(r => setTimeout(r, delay));
          await ctx.replyWithMarkdown(reply);
        }
      } catch (err) {
        console.error('[Telegram] Error processing message:', err.message);
      }
    });

    bot.launch()
      .then(() => console.log('✅ [Telegram] Bot started and polling successfully!'))
      .catch((err) => console.error('[Telegram] Failed to start bot:', err.message));

    // Graceful stop
    process.once('SIGINT', () => bot && bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot && bot.stop('SIGTERM'));
  } catch (err) {
    console.error('[Telegram] Init error:', err.message);
  }
}

async function sendTelegramMessage(chatId, text) {
  try {
    if (!bot) return false;
    await bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    return true;
  } catch (e) {
    console.error('[Telegram] sendTelegramMessage error:', e.message);
    return false;
  }
}

async function sendTelegramPhoto(chatId, photoUrl, caption = '') {
  try {
    if (!bot) return false;
    await bot.telegram.sendPhoto(chatId, photoUrl, { caption, parse_mode: 'Markdown' });
    return true;
  } catch (e) {
    console.error('[Telegram] sendTelegramPhoto error:', e.message);
    return false;
  }
}

async function sendTelegramDocument(chatId, docUrl, caption = '') {
  try {
    if (!bot) return false;
    await bot.telegram.sendDocument(chatId, docUrl, { caption, parse_mode: 'Markdown' });
    return true;
  } catch (e) {
    console.error('[Telegram] sendTelegramDocument error:', e.message);
    return false;
  }
}

module.exports = {
  initTelegram,
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramDocument
};

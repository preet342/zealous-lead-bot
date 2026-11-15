const leadService = require('./leadService');
const chatManager = require('./chatManager');
const mediaService = require('./mediaService');

let schedulerInterval = null;

/**
 * Start periodic background follow-up scheduler
 */
function initScheduler(sendMessageCallback) {
  if (schedulerInterval) clearInterval(schedulerInterval);

  console.log('⏰ [SchedulerService] Multi-Tier Follow-up Scheduler started (2h / 24h / 48h).');

  // Run check every 15 minutes
  schedulerInterval = setInterval(async () => {
    try {
      await runFollowUpChecks(sendMessageCallback);
    } catch (err) {
      console.error('[SchedulerService] Error in follow-up check:', err.message);
    }
  }, 15 * 60 * 1000);
}

async function runFollowUpChecks(sendMessageCallback) {
  if (!sendMessageCallback) return;

  const conversations = chatManager.getAllConversations();
  const now = Date.now();

  for (const conv of conversations) {
    // If human agent has taken over this conversation, do not send automated bot follow-ups
    if (conv.isHumanTakeover) continue;

    const lastMsg = conv.messages[conv.messages.length - 1];
    // Only follow up if bot sent the last message and is waiting for client reply
    if (!lastMsg || lastMsg.sender !== 'bot') continue;

    const timeDiffHours = (now - new Date(lastMsg.timestamp).getTime()) / (1000 * 60 * 60);

    const touch1Sent = conv.messages.some(m => m.text?.includes('[Follow-Up #1]'));
    const touch2Sent = conv.messages.some(m => m.text?.includes('[Follow-Up #2]'));
    const touch3Sent = conv.messages.some(m => m.text?.includes('[Follow-Up #3]'));

    // Touch 1: After 2 hours
    if (timeDiffHours >= 2 && timeDiffHours < 24 && !touch1Sent) {
      const text = `Hi there! 👋 Just checking in to see if you had any questions regarding BWB Media's video editing or growth packages? [Follow-Up #1]`;
      console.log(`[SchedulerService] Sending Touch #1 follow-up to ${conv.channel}:${conv.userId}`);
      chatManager.logMessage(conv.channel, conv.userId, 'bot', text);
      await sendMessageCallback(conv.channel, conv.userId, text);
    }
    // Touch 2: After 24 hours (Send portfolio link)
    else if (timeDiffHours >= 24 && timeDiffHours < 48 && !touch2Sent) {
      const showreelLink = mediaService.PORTFOLIO_DATA.videoEditing.links[0].url;
      const text = `Hey! 🎬 Sharing our recent creative portfolio & showreel here in case you missed it:\n🔗 ${showreelLink}\n\nLet me know if you would like a custom sample draft for your content! [Follow-Up #2]`;
      console.log(`[SchedulerService] Sending Touch #2 portfolio follow-up to ${conv.channel}:${conv.userId}`);
      chatManager.logMessage(conv.channel, conv.userId, 'bot', text);
      await sendMessageCallback(conv.channel, conv.userId, text);
    }
    // Touch 3: After 48 hours (Free strategy audit call)
    else if (timeDiffHours >= 48 && !touch3Sent) {
      const bookingLink = mediaService.PORTFOLIO_DATA.meetingBooking.links[0].url;
      const text = `Hello! We'd love to help take your content and ad performance to the next level. Would you be open to a quick 15-min free strategy call with our founder?\n🔗 Book here: ${bookingLink}\n\nHave a great day ahead! [Follow-Up #3]`;
      console.log(`[SchedulerService] Sending Touch #3 consultation follow-up to ${conv.channel}:${conv.userId}`);
      chatManager.logMessage(conv.channel, conv.userId, 'bot', text);
      await sendMessageCallback(conv.channel, conv.userId, text);
    }
  }
}

module.exports = {
  initScheduler,
  runFollowUpChecks
};

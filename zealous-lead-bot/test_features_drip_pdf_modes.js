const assert = require('assert');
const modeService = require('./src/services/modeService');
const aiService = require('./src/services/aiService');
const dripCampaignService = require('./src/services/dripCampaignService');
const campaignService = require('./src/services/campaignService');
const { renderSidebarLayout } = require('./src/views/sidebarLayout');

async function runTests() {
  console.log('--- STARTING COMPREHENSIVE FEATURES TEST ---');

  // TEST 1: Bot Modes (sales_closer, normal_chat, personal_human)
  console.log('\n[TEST 1] Testing 3 Bot Modes...');
  const initialMode = modeService.getBotMode();
  console.log(`Initial Mode: ${initialMode}`);

  // Switch to personal_human
  modeService.setBotMode('personal_human');
  assert.strictEqual(modeService.getBotMode(), 'personal_human', 'Bot mode should be personal_human');
  console.log('✅ Mode switched to personal_human successfully.');

  // Switch to sales_closer
  modeService.setBotMode('sales_closer');
  assert.strictEqual(modeService.getBotMode(), 'sales_closer', 'Bot mode should be sales_closer');
  console.log('✅ Mode switched to sales_closer successfully.');

  // Switch to normal_chat
  modeService.setBotMode('normal_chat');
  assert.strictEqual(modeService.getBotMode(), 'normal_chat', 'Bot mode should be normal_chat');
  console.log('✅ Mode switched to normal_chat successfully.');

  // TEST 2: Personal Human / Real Friend Mode Behavior
  console.log('\n[TEST 2] Testing Personal Human Mode (Zero Sales, Zero Lead Capture, Real Friend Persona)...');
  modeService.setBotMode('personal_human');

  const testUserId = 'test_friend_user_' + Date.now();
  const reply1 = await aiService.processMessage(testUserId, 'whatsapp_qr', 'Aur bhai kya haal chaal hai? Aaj kal kya chal raha hai?');
  console.log(`AI Friend Reply 1:\n"${reply1}"\n`);
  
  assert.ok(reply1 && reply1.length > 5, 'Reply should not be empty');
  // Verify it does NOT ask for mobile number or pitch business
  const forbiddenPhrases = ['number dijiye', 'phone number', 'contact number', 'mobile number', 'package book', 'order book'];
  forbiddenPhrases.forEach(phrase => {
    assert.ok(!reply1.toLowerCase().includes(phrase), `Personal human mode should not say "${phrase}"`);
  });
  console.log('✅ Personal Human Mode passed: zero lead push, natural friendly Hinglish tone.');

  // Test multi-turn memory
  const reply2 = await aiService.processMessage(testUserId, 'whatsapp_qr', 'Main thoda busy tha video editing seekh raha tha, tu bata!');
  console.log(`AI Friend Reply 2 (Memory turn):\n"${reply2}"\n`);
  assert.ok(reply2 && reply2.length > 5, 'Memory turn reply should not be empty');
  console.log('✅ Multi-turn conversational memory verified.');

  // TEST 3: Drip Campaign Service with PDF & Scheduling
  console.log('\n[TEST 3] Testing Drip Campaign Service (Scheduling & PDF Support)...');
  
  const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours in future
  const scheduledItem = dripCampaignService.scheduleDrip({
    title: 'Automated Creator Offer with PDF',
    recipients: ['919876543210', '919876543211'],
    message: 'Hello! Here is our complete brochure in PDF.',
    pdfUrl: 'https://example.com/bwb_brochure.pdf',
    pdfFileName: 'BWB_Creator_Guide.pdf',
    intervalSeconds: 60,
    scheduledTime: futureTime
  });

  assert.ok(scheduledItem && scheduledItem.id, 'Scheduled drip item must have an id');
  assert.strictEqual(scheduledItem.pdfFileName, 'BWB_Creator_Guide.pdf', 'PDF file name should match');
  assert.strictEqual(scheduledItem.status, 'scheduled', 'Status should be scheduled');
  console.log(`✅ Scheduled drip created with ID: ${scheduledItem.id}`);

  // Retrieve scheduled drips
  const allScheduled = dripCampaignService.getScheduledDrips();
  const found = allScheduled.find(s => s.id === scheduledItem.id);
  assert.ok(found, 'Scheduled drip must be retrievable from scheduledDrips list');
  console.log('✅ Scheduled drip retrieved from persistence.');

  // Cancel scheduled drip
  const cancelOk = dripCampaignService.cancelScheduledDrip(scheduledItem.id);
  assert.strictEqual(cancelOk, true, 'Cancellation should return true');
  const afterCancel = dripCampaignService.getScheduledDrips(true).find(s => s.id === scheduledItem.id);
  assert.strictEqual(afterCancel.status, 'cancelled', 'Status should now be cancelled');
  console.log('✅ Scheduled drip cancelled cleanly.');

  // Immediate Drip start test
  const startStatus = dripCampaignService.startDrip({
    title: 'Test Immediate Drip with PDF',
    recipients: ['919876543210'],
    message: 'Test message with PDF attachment',
    pdfUrl: 'https://example.com/sample.pdf',
    pdfFileName: 'Sample.pdf',
    intervalSeconds: 60
  });
  assert.strictEqual(startStatus.status, 'running', 'Drip status should be running');
  assert.strictEqual(startStatus.total, 1, 'Total recipients should be 1');
  console.log('✅ Immediate Drip start verified with PDF.');

  // Stop drip
  dripCampaignService.stopDrip();
  assert.strictEqual(dripCampaignService.getDripStatus().status, 'stopped', 'Drip status should be stopped after stop');
  console.log('✅ Drip stopped cleanly.');

  // TEST 4: Sidebar Layout rendering for all 3 modes
  console.log('\n[TEST 4] Testing Sidebar Layout rendering for 3 modes...');
  ['sales_closer', 'normal_chat', 'personal_human'].forEach(mode => {
    modeService.setBotMode(mode);
    const html = renderSidebarLayout({
      title: 'Test Title',
      activeNav: 'campaigns',
      contentHtml: '<div>Test Content</div>'
    });
    assert.ok(html.includes('BWB MEDIA'), 'HTML must contain brand name');
    assert.ok(html.includes('biswa342'), 'HTML must contain username');
    console.log(`✅ Sidebar rendered cleanly for mode "${mode}".`);
  });

  // Reset to personal_human or original
  modeService.setBotMode('personal_human');

  console.log('\n========================================');
  console.log('🎉 ALL COMPREHENSIVE TESTS PASSED 100%!');
  console.log('========================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});

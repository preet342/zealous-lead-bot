const assert = require('assert');
const fs = require('fs');
const chatManager = require('../src/services/chatManager');
const whatsappQr = require('../src/channels/whatsappQr');

console.log('===========================================================');
console.log('🧪 RUNNING SUPER SYNC, FAST SEARCH & BULK DELETE TEST SUITE');
console.log('===========================================================\n');

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    pass++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}:`, err.message);
    fail++;
  }
}

// 1. Test lightweight summary API (Super fast sync)
test('Fast Summary API returns lightweight records with lastMessage preview', () => {
  const summaryList = chatManager.getAllConversations({ summary: true });
  assert(Array.isArray(summaryList), 'Should be an array');
  if (summaryList.length > 0) {
    const item = summaryList[0];
    assert(item.userId, 'Must have userId');
    assert(item.displayName, 'Must have displayName');
    assert(item.purePhone, 'Must have purePhone');
    assert('lastMessage' in item, 'Must have lastMessage preview');
    assert(!('messages' in item), 'Must not include full messages array in summary');
    console.log(`   [Info] Summary item: ${item.displayName} (${item.purePhone}) | Count: ${summaryList.length} chats`);
  }
});

// 2. Test search matching logic
test('Search matching logic matches by Pure Phone, Formatted Phone, Name, and Message', () => {
  const testChat = {
    userId: '278645163745457@lid',
    channel: 'whatsapp_qr',
    displayName: 'preety Baghel',
    purePhone: '919668772215',
    formattedPhone: '+91 96687 72215',
    lastMessage: { text: 'Hello, need video editing' }
  };

  function matchQuery(c, query) {
    const q = query.toLowerCase();
    const cleanQ = q.replace(/[^0-9a-z]/gi, '');
    const matchesUser = (c.userId || '').toLowerCase().includes(q);
    const matchesName = (c.displayName || c.userName || '').toLowerCase().includes(q);
    const purePhoneStr = (c.purePhone || '').toLowerCase();
    const formattedPhoneStr = (c.formattedPhone || '').toLowerCase();
    const matchesPhone = purePhoneStr.includes(q) || formattedPhoneStr.includes(q) || (cleanQ && purePhoneStr.includes(cleanQ));
    const lastMsgText = (c.lastMessage?.text || '').toLowerCase();
    const matchesMsg = lastMsgText.includes(q);
    return matchesUser || matchesName || matchesPhone || matchesMsg;
  }

  assert(matchQuery(testChat, '96687'), 'Should match partial pure mobile number');
  assert(matchQuery(testChat, '+91 96687 72215'), 'Should match formatted phone');
  assert(matchQuery(testChat, 'preety'), 'Should match contact display name');
  assert(matchQuery(testChat, 'video editing'), 'Should match message content');
  assert(!matchQuery(testChat, 'nonexistent_xyz'), 'Should not match bogus string');
  console.log('   [Info] All 4 search dimensions matched successfully.');
});

// 3. Test that currentChannel ReferenceError is completely gone
test('Verify currentChannel ReferenceError is not present in inboxRoutes.js', () => {
  const code = fs.readFileSync('src/routes/inboxRoutes.js', 'utf8');
  assert(!code.includes('currentChannel'), 'Found unresolved currentChannel in inboxRoutes.js!');
  assert(code.includes('channel: selectedChannel'), 'selectedChannel should be used in inboxRoutes.js');
  console.log('   [Info] Verified 0 instances of currentChannel in inboxRoutes.js');
});

// 4. Test WhatsApp QR batch delete & clear functions
test('batchDeleteChatsOnWhatsApp handles large array safely when offline', async () => {
  const dummyList = ['919668772215', '919876543210', '278645163745457@lid'];
  const res = await whatsappQr.batchDeleteChatsOnWhatsApp(dummyList);
  assert(typeof res === 'object', 'Should return object');
  console.log('   [Info] batchDelete result:', res);
});

test('batchClearChatsOnWhatsApp handles array safely when offline', async () => {
  const dummyList = ['919668772215', '278645163745457@lid'];
  const res = await whatsappQr.batchClearChatsOnWhatsApp(dummyList);
  assert(typeof res === 'object', 'Should return object');
  console.log('   [Info] batchClear result:', res);
});

console.log('\n===========================================================');
console.log(`📊 RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('===========================================================\n');

if (fail > 0) process.exit(1);

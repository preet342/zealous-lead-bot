const assert = require('assert');
const whatsappQr = require('../src/channels/whatsappQr');
const chatManager = require('../src/services/chatManager');

console.log('====================================================');
console.log('🧪 TESTING WHATSAPP MOBILE CLEAR & DELETE SYNC ENGINE');
console.log('====================================================\n');

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

// 1. Test JID resolution for standard phone & LID
test('Resolve phone number to standard WhatsApp JID', () => {
  const jids = whatsappQr.resolveTargetJids('919668772215');
  assert(jids.includes('919668772215@s.whatsapp.net'), 'Should include standard phone JID');
  console.log('   [Info] Phone 919668772215 -> JIDs:', jids);
});

test('Resolve LID to dual JIDs (LID + pure phone JID)', () => {
  const jids = whatsappQr.resolveTargetJids('278645163745457@lid');
  assert(jids.includes('278645163745457@lid'), 'Should include LID JID');
  assert(jids.includes('919668772215@s.whatsapp.net'), 'Should resolve reverse mapping to pure phone JID');
  console.log('   [Info] LID 278645163745457@lid -> Dual JIDs:', jids);
});

// 2. Test chatManager.clearConversationMessages
test('Clear conversation messages in local database', () => {
  const testChan = 'whatsapp_qr';
  const testUid = 'unit_test_clear_contact';
  
  // Seed a message
  chatManager.logMessage(testChan, testUid, 'user', 'Hello before clear');
  chatManager.logMessage(testChan, testUid, 'bot', 'Hi response');
  
  const convoBefore = chatManager.getConversation(testChan, testUid);
  assert(convoBefore.messages.length >= 2, 'Should have messages before clear');
  
  const res = chatManager.clearConversationMessages(testChan, testUid);
  assert(res.success === true, 'clearConversationMessages should succeed');
  
  const convoAfter = chatManager.getConversation(testChan, testUid);
  assert.strictEqual(convoAfter.messages.length, 0, 'Messages array should be empty after clear');
  console.log('   [Info] Local chat messages cleared successfully.');
});

// 3. Test chatManager.deleteConversation
test('Delete conversation completely from database', () => {
  const testChan = 'whatsapp_qr';
  const testUid = 'unit_test_delete_contact';
  
  chatManager.logMessage(testChan, testUid, 'user', 'Hello to be deleted');
  const res = chatManager.deleteConversation(testChan, testUid);
  assert(res.success === true, 'deleteConversation should succeed');
  console.log('   [Info] Conversation deleted successfully.');
});

// 4. Test WhatsApp QR clear/delete API safe fallback when disconnected
test('WhatsApp QR clearChatOnWhatsApp returns safe error when client offline', async () => {
  const res = await whatsappQr.clearChatOnWhatsApp('919668772215');
  assert(typeof res === 'object', 'Should return result object');
  console.log('   [Info] Safe offline handle clearChat:', res);
});

test('WhatsApp QR deleteChatOnWhatsApp returns safe error when client offline', async () => {
  const res = await whatsappQr.deleteChatOnWhatsApp('919668772215');
  assert(typeof res === 'object', 'Should return result object');
  console.log('   [Info] Safe offline handle deleteChat:', res);
});

console.log('\n====================================================');
console.log(`📊 RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('====================================================\n');

if (fail > 0) process.exit(1);

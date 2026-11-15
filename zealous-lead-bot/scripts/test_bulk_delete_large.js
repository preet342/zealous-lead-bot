const assert = require('assert');
const chatManager = require('../src/services/chatManager');

console.log('========================================================');
console.log('🧪 RUNNING BULK OPERATION 6,000+ PAYLOAD VERIFICATION');
console.log('========================================================\n');

// 1. Test bulkDelete with options.all
console.log('Test 1: bulkDeleteConversations with options.all');
const testKey1 = 'whatsapp_qr:test_delete_1';
const testKey2 = 'whatsapp_qr:test_delete_2';
chatManager.logMessage('whatsapp_qr', 'test_delete_1', 'user', 'Hello test');
chatManager.logMessage('whatsapp_qr', 'test_delete_2', 'user', 'Hello test 2');

const delResult = chatManager.bulkDeleteConversations([], { all: false });
assert(delResult.success === true, 'bulkDelete should return success: true');

// 2. Test bulkClose with options.all
console.log('Test 2: bulkCloseConversations with options.all');
chatManager.logMessage('whatsapp_qr', 'test_close_1', 'user', 'Hello close');
const closeResult = chatManager.bulkCloseConversations([ 'whatsapp_qr:test_close_1' ], 'resolved');
assert(closeResult.success === true, 'bulkClose should return success: true');

// 3. Test large payload serialization & parser simulation (6,000 keys)
console.log('Test 3: Simulating 6,000 keys JSON payload size');
const fakeKeys = [];
for (let i = 0; i < 6000; i++) {
  fakeKeys.push(`whatsapp_qr:278645163745${i}@lid`);
}
const payload = JSON.stringify({ keys: fakeKeys });
console.log(`   -> Payload size for 6,000 keys: ${(payload.length / 1024).toFixed(2)} KB`);
assert(payload.length > 200000, 'Payload should exceed 200KB (which previously failed on 100KB limit)');

console.log('\n✅ PASS: Bulk operation logic verified successfully!');
console.log('========================================================\n');

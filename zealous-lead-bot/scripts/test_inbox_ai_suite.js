const assert = require('assert');
const chatManager = require('../src/services/chatManager');
const aiService = require('../src/services/aiService');

console.log('====================================================');
console.log('🧪 RUNNING COMPREHENSIVE INBOX & AI ADVANCED TEST SUITE');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.message}`);
    failCount++;
  }
}

// 1. Phone number enrichment & LID synchronization
runTest('LID resolution & pure mobile number enrichment', () => {
  const convs = chatManager.getAllConversations();
  assert(Array.isArray(convs), 'Conversations should be an array');
  
  // Find preety Baghel or check enrichConversation
  const sampleLidConv = convs.find(c => (c.userId && c.userId.includes('278645163745457')) || c.displayName === 'preety Baghel');
  if (sampleLidConv) {
    assert(sampleLidConv.purePhone === '919668772215', `Expected purePhone 919668772215, got ${sampleLidConv.purePhone}`);
    assert(sampleLidConv.formattedPhone === '+91 96687 72215', `Expected +91 96687 72215, got ${sampleLidConv.formattedPhone}`);
    console.log(`   [Info] Contact: "${sampleLidConv.displayName}" -> Pure Phone: "${sampleLidConv.purePhone}" -> Formatted: "${sampleLidConv.formattedPhone}"`);
  } else {
    // Test direct resolution
    const groupExtractor = require('../src/services/groupExtractorService');
    const pure = groupExtractor.resolveLidToPhone('278645163745457');
    const fmt = groupExtractor.formatPhoneDisplay(pure);
    assert.strictEqual(pure, '919668772215');
    assert.strictEqual(fmt, '+91 96687 72215');
  }
});

// 2. Gender & Profile Intelligence
runTest('Gender detection from contact name "preety Baghel"', () => {
  const profile = aiService.detectGenderAndProfile('preety Baghel', []);
  assert.strictEqual(profile.gender, 'female', `Expected female, got ${profile.gender}`);
  assert.strictEqual(profile.firstName, 'Preety');
  assert.strictEqual(profile.respectfulSalutation, 'Preety ji');
  assert.strictEqual(profile.verbGender, 'feminine');
  console.log(`   [Info] Name: "preety Baghel" -> Gender: ${profile.gender}, Salutation: ${profile.respectfulSalutation}`);
});

runTest('Gender detection from contact name "Sonu Singh"', () => {
  const profile = aiService.detectGenderAndProfile('Sonu Singh', []);
  assert.strictEqual(profile.gender, 'male', `Expected male, got ${profile.gender}`);
  assert.strictEqual(profile.firstName, 'Sonu');
  assert.strictEqual(profile.respectfulSalutation, 'Sonu ji');
  assert.strictEqual(profile.verbGender, 'masculine');
  console.log(`   [Info] Name: "Sonu Singh" -> Gender: ${profile.gender}, Salutation: ${profile.respectfulSalutation}`);
});

runTest('Gender detection from user message: "Bhai nhi us ki beti hun me"', () => {
  const msgs = [{ sender: 'user', text: 'Bhai nhi us ki beti hun me' }];
  const profile = aiService.detectGenderAndProfile('', msgs);
  assert.strictEqual(profile.gender, 'female', `Expected female, got ${profile.gender}`);
  assert.strictEqual(profile.genderConfidence, 'high');
  console.log(`   [Info] Text: "Bhai nhi us ki beti hun me" -> Gender: ${profile.gender} (${profile.genderNotes})`);
});

// 3. Output Sanitizer & Banned Slang Removal
runTest('Strict Slang Blacklist Sanitization (Removes "bhai", "dost", "bro")', () => {
  const test1 = aiService.sanitizeAiResponse('Arre bhai, kya hua? Ye ansu wali emoji kyu bhej raha hai?', { gender: 'female' });
  assert(!test1.includes('bhai'), `Output still contains "bhai": ${test1}`);
  assert(!test1.includes('dost'), `Output still contains "dost": ${test1}`);

  const test2 = aiService.sanitizeAiResponse('Haan bilkul bhai! Aur batao, khana-peena ho gaya?', { gender: 'female' });
  assert(!test2.includes('bhai'), `Output still contains "bhai": ${test2}`);

  const test3 = aiService.sanitizeAiResponse('Main yahi hoon dost! Kaise ho aap?', { gender: 'female' });
  assert(!test3.includes('dost'), `Output still contains "dost": ${test3}`);
  assert(test3.includes('kaisi hain aap'), `Expected feminine verb "kaisi hain aap", got: ${test3}`);

  const test4 = aiService.sanitizeAiResponse('Aapki baat bilkul sahi hai dost, market me 300 me milta hai', { gender: 'male' });
  assert(!test4.includes('dost'), `Output still contains "dost": ${test4}`);

  console.log(`   [Info] Cleaned 1: "${test1}"`);
  console.log(`   [Info] Cleaned 2: "${test2}"`);
  console.log(`   [Info] Cleaned 3: "${test3}"`);
  console.log(`   [Info] Cleaned 4: "${test4}"`);
});

// 4. Emotion & Intent Detection
runTest('Emotion detection for crying/sad emojis (😭 😢 ansu)', () => {
  const res = aiService.detectEmotionAndIntent('Ye 😭 wali emoji kyu bhej rahe ho? ansu aa gaye');
  assert.strictEqual(res.emotion, 'sad_or_crying');
  console.log(`   [Info] Text with tears -> Emotion: ${res.emotion}`);
});

// 5. Fallback Responses without Banned Slang
runTest('Fallback response to identity clarification does not say "bhai" or "dost"', () => {
  const femaleProfile = { gender: 'female', respectfulSalutation: 'Preety ji' };
  const reply = aiService.generateEmpatheticHumanFallback('Bhai nhi us ki beti hun me', {}, {}, femaleProfile, { emotion: 'neutral', intent: 'identity_clarification' });
  assert(!reply.includes('bhai'), `Fallback contains bhai: ${reply}`);
  assert(!reply.includes('dost'), `Fallback contains dost: ${reply}`);
  assert(reply.includes('kaisi hain aap'), `Expected feminine verb: ${reply}`);
  console.log(`   [Info] Reply to daughter: "${reply}"`);
});

console.log('\n====================================================');
console.log(`📊 TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('====================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

const fs = require('fs');
const path = require('path');
const groupExtractor = require('../src/services/groupExtractorService');

const CHATS_FILE = path.join(__dirname, '../data/chats.json');
const LEADS_FILE = path.join(__dirname, '../data/leads.json');

console.log('🧹 Starting cleanup of 0-message dummy stubs...');

// 1. Read existing chats
const rawChats = fs.readFileSync(CHATS_FILE, 'utf8');
const chats = JSON.parse(rawChats || '{}');

// 2. Read leads
let leads = [];
try {
  if (fs.existsSync(LEADS_FILE)) {
    leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8') || '[]');
  }
} catch (e) {}

const leadPhones = new Set();
leads.forEach(l => {
  const p = String(l.leadData?.phone || l.userId || '').replace(/[^0-9]/g, '');
  if (p) leadPhones.add(p);
});

const cleanedChats = {};
let keptCount = 0;
let removedCount = 0;

for (const [key, c] of Object.entries(chats)) {
  const hasMessages = c.messages && c.messages.length > 0;
  const rawId = String(c.userId || '').trim();
  const purePhone = groupExtractor.resolveLidToPhone(rawId);
  const cleanId = purePhone || rawId.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  const isLead = leadPhones.has(cleanId) || leadPhones.has(rawId);

  // Keep ONLY chats that have actual messages or are registered CRM leads!
  if (hasMessages || isLead) {
    // Resolve real contact name if missing
    let contactName = c.userName || '';
    if (!contactName || contactName.startsWith('+') || /^\d+$/.test(contactName)) {
      const resolved = groupExtractor.resolveContactName(purePhone, rawId);
      if (resolved) contactName = resolved;
    }

    // Use pure phone as userId if available
    const finalUserId = purePhone || cleanId;
    const finalKey = `${c.channel}:${finalUserId}`;

    // Merge if already exists (e.g. from LID and phone)
    if (cleanedChats[finalKey]) {
      const existingMsgs = cleanedChats[finalKey].messages || [];
      const newMsgs = c.messages || [];
      // Combine messages without exact duplicates
      const seen = new Set();
      const combined = [];
      [...existingMsgs, ...newMsgs].forEach(m => {
        const sig = `${m.sender}:${m.text}:${m.timestamp}`;
        if (!seen.has(sig)) {
          seen.add(sig);
          combined.push(m);
        }
      });
      combined.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
      cleanedChats[finalKey].messages = combined;
      if (contactName) cleanedChats[finalKey].userName = contactName;
      if (new Date(c.lastUpdated || 0) > new Date(cleanedChats[finalKey].lastUpdated || 0)) {
        cleanedChats[finalKey].lastUpdated = c.lastUpdated;
      }
    } else {
      cleanedChats[finalKey] = {
        ...c,
        userId: finalUserId,
        userName: contactName || c.userName,
        messages: c.messages || []
      };
    }
    keptCount++;
  } else {
    removedCount++;
  }
}

// Write back cleaned chats
fs.writeFileSync(CHATS_FILE, JSON.stringify(cleanedChats, null, 2), 'utf8');

console.log(`✅ Cleanup Complete!`);
console.log(`- Kept real active chats with messages/leads: ${Object.keys(cleanedChats).length}`);
console.log(`- Removed dummy empty stubs: ${removedCount}`);

// Inspect top 5 active chats
const top = Object.values(cleanedChats).sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0)).slice(0, 5);
console.log('\nTop 5 Active WhatsApp Chats Now on Top:');
top.forEach(c => {
  const last = c.messages && c.messages.length ? c.messages[c.messages.length - 1].text : '';
  console.log(`- ${c.userName || c.userId} (+${c.userId}): "${last.slice(0, 35)}" (${c.messages.length} msgs)`);
});

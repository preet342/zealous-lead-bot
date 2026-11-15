const fs = require('fs');
const path = require('path');
const groupExtractor = require('./groupExtractorService');

const CHATS_FILE = path.join(__dirname, '../../data/chats.json');
const LEADS_FILE = path.join(__dirname, '../../data/leads.json');

let leadsCache = null;
let lastLeadsCacheTime = 0;

function getLeadsMap() {
  const now = Date.now();
  if (leadsCache && (now - lastLeadsCacheTime < 10000)) {
    return leadsCache;
  }
  leadsCache = new Map();
  lastLeadsCacheTime = now;
  try {
    if (fs.existsSync(LEADS_FILE)) {
      const data = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8') || '[]');
      if (Array.isArray(data)) {
        for (const l of data) {
          const lData = l.leadData || {};
          const phone = String(lData.phone || l.userId || '').replace(/[^0-9]/g, '');
          const uid = String(l.userId || '').trim();
          if (uid) leadsCache.set(uid, l);
          if (phone) {
            leadsCache.set(phone, l);
            if (phone.length === 10) {
              leadsCache.set('91' + phone, l);
            } else if (phone.startsWith('91') && phone.length === 12) {
              leadsCache.set(phone.slice(2), l);
            }
          }
        }
      }
    }
  } catch (e) {}
  return leadsCache;
}

// Ensure chats store exists
function ensureStorage() {
  const dir = path.dirname(CHATS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, JSON.stringify({}, null, 2), 'utf-8');
}

ensureStorage();

function loadChats() {
  try {
    ensureStorage();
    const raw = fs.readFileSync(CHATS_FILE, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

function saveChats(chats) {
  try {
    ensureStorage();
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2), 'utf-8');
  } catch (e) {}
}

function detectSentiment(text) {
  if (!text) return 'neutral';
  const lower = text.toLowerCase();
  const urgentWords = ['urgent', 'emergency', 'problem', 'scam', 'fraud', 'cheat', 'dhoka', 'complaint', 'cancel', 'refund', 'gussa', 'bekar', 'galat', 'jaldi karo', 'call me now'];
  const positiveWords = ['yes', 'haan', 'ha', 'interested', 'done', 'theek', 'achha', 'good', 'super', 'best', 'great', 'order', 'book', 'kharidna', 'bhejo', 'payment', 'khush', 'thanks', 'dhanyawad'];
  for (const w of urgentWords) {
    if (lower.includes(w)) return 'urgent';
  }
  for (const w of positiveWords) {
    if (lower.includes(w)) return 'positive';
  }
  return 'neutral';
}

/**
 * Add a message to chat history with support for Real WhatsApp User Name
 * @param {string} channel - 'whatsapp' | 'whatsapp_qr' | 'telegram' | 'facebook' | 'instagram'
 * @param {string} userId - User identifier (phone or user ID)
 * @param {'user'|'bot'|'agent'} sender - Message author
 * @param {string} text - Message body
 * @param {Object} [meta] - Metadata like { userName, pushName, timestamp }
 */
function logMessage(channel, userId, sender, text, meta = {}) {
  const chats = loadChats();
  const key = `${channel}:${userId}`;

  if (!chats[key]) {
    chats[key] = {
      channel,
      userId,
      userName: meta.userName || meta.pushName || null,
      isHumanTakeover: false,
      lastUpdated: meta.timestamp || new Date().toISOString(),
      messages: []
    };
  }

  // Update real user name if provided and not yet set
  if ((meta.userName || meta.pushName) && (!chats[key].userName || chats[key].userName === userId)) {
    chats[key].userName = meta.userName || meta.pushName;
  }

  // Prevent exact duplicate consecutive messages in history
  const lastMsg = chats[key].messages.slice(-1)[0];
  const isDuplicate = lastMsg && lastMsg.sender === sender && lastMsg.text === text && (Date.now() - new Date(lastMsg.timestamp).getTime() < 3000);
  
  if (!isDuplicate) {
    const sentiment = detectSentiment(text);
    chats[key].messages.push({
      sender,
      text,
      sentiment,
      timestamp: meta.timestamp || new Date().toISOString()
    });
    // Keep max 200 messages per chat to prevent bloat
    if (chats[key].messages.length > 200) {
      chats[key].messages = chats[key].messages.slice(-200);
    }
  }

  chats[key].lastUpdated = meta.timestamp || new Date().toISOString();

  saveChats(chats);
  return chats[key];
}

/**
 * Update real contact profile info (Name, PushName, Phone, etc.)
 */
function updateContact(channel, userId, data = {}) {
  const chats = loadChats();
  const key = `${channel}:${userId}`;

  if (!chats[key]) {
    chats[key] = {
      channel,
      userId,
      userName: data.name || data.pushName || null,
      isHumanTakeover: false,
      lastUpdated: new Date().toISOString(),
      messages: []
    };
  } else {
    if (data.name || data.pushName) {
      chats[key].userName = data.name || data.pushName;
    }
  }

  saveChats(chats);
  return chats[key];
}

function isHumanTakeoverActive(channel, userId) {
  const chats = loadChats();
  const key = `${channel}:${userId}`;
  const chat = chats[key];
  if (!chat || !chat.isHumanTakeover) return false;

  // Smart Auto-Resume: If the human agent hasn't sent a message in 30 minutes, automatically release takeover
  const lastAgentMsg = (chat.messages || []).slice().reverse().find(m => m.sender === 'agent');
  if (lastAgentMsg) {
    const elapsed = Date.now() - new Date(lastAgentMsg.timestamp).getTime();
    if (elapsed > 30 * 60 * 1000) { // 30 minutes
      chat.isHumanTakeover = false;
      saveChats(chats);
      console.log(`[ChatManager] Human takeover expired for ${key} after 30m of human inactivity. Bot auto-resumed.`);
      return false;
    }
  }

  return true;
}

function toggleHumanTakeover(channel, userId, enabled) {
  const chats = loadChats();
  const key = `${channel}:${userId}`;
  if (!chats[key]) {
    chats[key] = {
      channel,
      userId,
      userName: null,
      isHumanTakeover: enabled,
      lastUpdated: new Date().toISOString(),
      messages: []
    };
  } else {
    chats[key].isHumanTakeover = enabled;
  }
  saveChats(chats);
  console.log(`[ChatManager] Human takeover for ${key}: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  return chats[key];
}

function enrichConversation(c) {
  const rawId = String(c.userId || '').trim();
  let purePhone = '';
  try {
    purePhone = groupExtractor.resolveLidToPhone(rawId);
  } catch (e) {
    purePhone = rawId.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  }

  // If purePhone is identical to rawId and rawId is an unresolved LID (length > 13 or ends with @lid), don't treat raw LID as a pure phone!
  const isLid = rawId.endsWith('@lid') || (rawId.length > 13 && !rawId.startsWith('91'));
  if (isLid && purePhone === rawId.split('@')[0]) {
    purePhone = '';
  }

  // Smart Real Contact Name Lookup
  let contactName = c.userName || '';
  if (!contactName) {
    try {
      contactName = groupExtractor.resolveContactName(purePhone, rawId);
    } catch (e) {}
  }

  const formattedPhone = purePhone ? groupExtractor.formatPhoneDisplay(purePhone) : '';
  const displayName = contactName || (formattedPhone ? formattedPhone : (purePhone ? `+${purePhone}` : (rawId.endsWith('@lid') ? `WhatsApp Contact` : (rawId.length >= 10 ? `+${rawId}` : rawId))));

  // Check if this conversation is a qualified CRM Lead
  const leadsMap = getLeadsMap();
  let matchedLead = null;
  if (purePhone && leadsMap.has(purePhone)) {
    matchedLead = leadsMap.get(purePhone);
  } else if (rawId && leadsMap.has(rawId)) {
    matchedLead = leadsMap.get(rawId);
  } else if (contactName && leadsMap.has(contactName)) {
    matchedLead = leadsMap.get(contactName);
  } else if (c.userName && leadsMap.has(c.userName)) {
    matchedLead = leadsMap.get(c.userName);
  }

  const isLead = !!matchedLead;
  const leadStage = c.leadStage || (matchedLead ? (matchedLead.stage || 'Lead') : 'New Lead');
  const leadData = matchedLead ? (matchedLead.leadData || {}) : null;

  return {
    ...c,
    userName: contactName || c.userName,
    purePhone: purePhone || (isLid ? '' : rawId),
    formattedPhone: formattedPhone || (purePhone ? `+${purePhone}` : ''),
    displayName,
    isLead,
    leadStage,
    leadData,
    owner: c.owner || 'biswa342',
    notes: Array.isArray(c.notes) ? c.notes : [],
    appointments: Array.isArray(c.appointments) ? c.appointments : [],
    orders: Array.isArray(c.orders) ? c.orders : []
  };
}

function getAllConversations(options = {}) {
  const chats = loadChats();
  let list = Object.values(chats).map(enrichConversation);

  // Also include standalone CRM leads from leads.json if not already in chats
  try {
    if (fs.existsSync(LEADS_FILE)) {
      const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8') || '[]');
      if (Array.isArray(leads)) {
        const existingKeys = new Set(list.map(c => `${c.channel}:${c.userId}`));
        const existingPhones = new Set(list.map(c => c.purePhone).filter(Boolean));

        for (const l of leads) {
          const lData = l.leadData || {};
          const channel = l.channel || 'whatsapp_qr';
          const userId = String(l.userId || lData.phone || '').trim();
          const cleanPhone = String(lData.phone || userId).replace(/[^0-9]/g, '');
          const key = `${channel}:${userId}`;

          if (!existingKeys.has(key) && (!cleanPhone || !existingPhones.has(cleanPhone))) {
            const displayName = lData.name || (cleanPhone ? `+${cleanPhone}` : userId);
            list.push({
              channel,
              userId,
              userName: lData.name || null,
              displayName,
              purePhone: cleanPhone,
              formattedPhone: cleanPhone ? groupExtractor.formatPhoneDisplay(cleanPhone) : '',
              isHumanTakeover: false,
              status: 'active',
              isResolved: false,
              isLead: true,
              leadStage: l.stage || 'Lead',
              leadData: lData,
              lastUpdated: l.createdAt || new Date().toISOString(),
              messages: []
            });
            existingKeys.add(key);
            if (cleanPhone) existingPhones.add(cleanPhone);
          }
        }
      }
    }
  } catch (e) {}

  list.sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));

  // Category filtering:
  // whatsapp_recent: "watsup recent me sirf mobile chat synchronize ho" (only real conversations with messages)
  // leads: "crm lead me new lead connected or new no sirf dikhe" (leads or new connected numbers with 0 messages)
  if (options && options.category) {
    if (options.category === 'whatsapp_recent') {
      list = list.filter(c => c.channel === 'whatsapp_qr' && (c.messages && c.messages.length > 0));
    } else if (options.category === 'leads') {
      list = list.filter(c => c.isLead || (!c.messages || c.messages.length === 0));
    }
  }

  // Deduplicate entries by pure phone to avoid double LID + phone duplicates
  const seen = new Set();
  list = list.filter(c => {
    const pKey = c.purePhone ? `${c.channel}:${c.purePhone}` : `${c.channel}:${c.userId}`;
    if (seen.has(pKey)) return false;
    seen.add(pKey);
    return true;
  });

  if (options && options.summary) {
    return list.map(c => {
      const msgs = c.messages || [];
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      return {
        channel: c.channel,
        userId: c.userId,
        userName: c.userName,
        displayName: c.displayName,
        purePhone: c.purePhone,
        formattedPhone: c.formattedPhone,
        isHumanTakeover: !!c.isHumanTakeover,
        status: c.status || 'active',
        isResolved: !!c.isResolved,
        isLead: !!c.isLead,
        leadStage: c.leadStage || null,
        leadData: c.leadData || null,
        owner: c.owner || 'biswa342',
        notesCount: (c.notes || []).length,
        appointmentsCount: (c.appointments || []).length,
        ordersCount: (c.orders || []).length,
        lastUpdated: c.lastUpdated,
        lastMessage: lastMsg,
        messageCount: msgs.length
      };
    });
  }

  return list;
}

function addNote(channel, userId, text, author = 'biswa342') {
  const chats = loadChats();
  const key = `${channel}:${userId}`;
  if (!chats[key]) return { success: false, error: 'Chat not found' };
  if (!Array.isArray(chats[key].notes)) chats[key].notes = [];
  const note = {
    id: 'note_' + Date.now(),
    text,
    author,
    timestamp: new Date().toISOString()
  };
  chats[key].notes.unshift(note);
  saveChats(chats);
  return { success: true, note, notes: chats[key].notes };
}

function bookAppointment(channel, userId, appointmentData = {}) {
  const chats = loadChats();
  const key = `${channel}:${userId}`;
  if (!chats[key]) return { success: false, error: 'Chat not found' };
  if (!Array.isArray(chats[key].appointments)) chats[key].appointments = [];
  const apt = {
    id: 'apt_' + Date.now(),
    date: appointmentData.date,
    time: appointmentData.time,
    title: appointmentData.title || 'Consultation Call',
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };
  chats[key].appointments.unshift(apt);
  chats[key].leadStage = 'Slot Booked';
  saveChats(chats);
  return { success: true, appointment: apt, appointments: chats[key].appointments };
}

function addQuotation(channel, userId, quoteData = {}) {
  const chats = loadChats();
  const key = `${channel}:${userId}`;
  if (!chats[key]) return { success: false, error: 'Chat not found' };
  if (!Array.isArray(chats[key].orders)) chats[key].orders = [];
  const quote = {
    id: 'quote_' + Date.now(),
    service: quoteData.service || 'Digital Marketing / Web Development',
    amount: Number(quoteData.amount) || 0,
    discount: Number(quoteData.discount) || 0,
    finalAmount: Math.max(0, (Number(quoteData.amount) || 0) - (Number(quoteData.discount) || 0)),
    notes: quoteData.notes || '',
    status: 'Sent',
    createdAt: new Date().toISOString()
  };
  chats[key].orders.unshift(quote);
  chats[key].leadStage = 'Quotation Sent';
  saveChats(chats);
  return { success: true, quotation: quote, orders: chats[key].orders };
}

function updateLeadStage(channel, userId, stage) {
  const chats = loadChats();
  const key = `${channel}:${userId}`;
  if (!chats[key]) return { success: false, error: 'Chat not found' };
  chats[key].leadStage = stage;
  saveChats(chats);

  // Sync to leads.json
  try {
    if (fs.existsSync(LEADS_FILE)) {
      const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8') || '[]');
      const match = leads.find(l => String(l.userId) === String(userId) || (l.leadData?.phone && String(userId).includes(String(l.leadData.phone).replace(/\D/g, ''))));
      if (match) {
        match.stage = stage;
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
      }
    }
  } catch (e) {}

  return { success: true, stage };
}

function updateChatOwner(channel, userId, owner) {
  const chats = loadChats();
  const key = `${channel}:${userId}`;
  if (!chats[key]) return { success: false, error: 'Chat not found' };
  chats[key].owner = owner;
  saveChats(chats);
  return { success: true, owner };
}

function updateChatTimestamp(channel, userId, timestamp, onlyIfExists = false) {
  const chats = loadChats();
  const key = `${channel}:${userId}`;
  if (!chats[key]) {
    if (onlyIfExists) return;
    chats[key] = {
      channel,
      userId,
      userName: null,
      isHumanTakeover: false,
      status: 'active',
      isResolved: false,
      lastUpdated: timestamp || new Date().toISOString(),
      messages: []
    };
  } else {
    if (!chats[key].lastUpdated || (timestamp && new Date(timestamp) > new Date(chats[key].lastUpdated))) {
      chats[key].lastUpdated = timestamp || new Date().toISOString();
    }
  }
  saveChats(chats);
}

function getConversation(channel, userId) {
  const chats = loadChats();
  const key = `${channel}:${userId}`;
  const c = chats[key] || { channel, userId, userName: null, isHumanTakeover: false, messages: [] };
  return enrichConversation(c);
}

function clearConversationMessages(channel, userId) {
  const chats = loadChats();
  const key = `${channel}:${userId}`;
  if (!chats[key]) {
    return { success: false, error: 'Conversation not found' };
  }

  // Clear messages list
  chats[key].messages = [];
  chats[key].lastUpdated = new Date().toISOString();
  saveChats(chats);

  // If whatsapp_qr, trigger mobile clear sync asynchronously
  if (channel === 'whatsapp_qr') {
    try {
      const whatsappQr = require('../channels/whatsappQr');
      whatsappQr.clearChatOnWhatsApp(userId).catch(e => console.warn('[ChatManager] Mobile clear sync error:', e.message));
    } catch (e) {}
  }

  return { success: true, conversation: enrichConversation(chats[key]) };
}

function deleteConversation(channel, userId) {
  const chats = loadChats();
  const key = `${channel}:${userId}`;
  let deleted = false;
  if (chats[key]) {
    delete chats[key];
    saveChats(chats);
    deleted = true;
  }

  // If whatsapp_qr, trigger mobile delete sync asynchronously
  if (channel === 'whatsapp_qr') {
    try {
      const whatsappQr = require('../channels/whatsappQr');
      whatsappQr.deleteChatOnWhatsApp(userId).catch(e => console.warn('[ChatManager] Mobile delete sync error:', e.message));
    } catch (e) {}
  }

  return { success: true, deleted };
}

function bulkDeleteConversations(keys = [], options = {}) {
  const chats = loadChats();
  let deletedCount = 0;
  const deletedWhatsappQrUserIds = [];

  if (options.all || keys === 'all') {
    const channel = options.channel;
    if (channel && channel !== 'all') {
      for (const k of Object.keys(chats)) {
        if (chats[k].channel === channel) {
          if (channel === 'whatsapp_qr') deletedWhatsappQrUserIds.push(chats[k].userId);
          delete chats[k];
          deletedCount++;
        }
      }
    } else {
      deletedCount = Object.keys(chats).length;
      for (const k of Object.keys(chats)) {
        if (chats[k].channel === 'whatsapp_qr') deletedWhatsappQrUserIds.push(chats[k].userId);
        delete chats[k];
      }
    }
  } else if (Array.isArray(keys)) {
    for (const item of keys) {
      const key = typeof item === 'string' ? item : `${item.channel}:${item.userId}`;
      if (chats[key]) {
        if (chats[key].channel === 'whatsapp_qr') deletedWhatsappQrUserIds.push(chats[key].userId);
        delete chats[key];
        deletedCount++;
      }
    }
  }

  if (deletedCount > 0) {
    saveChats(chats);
  }

  // Trigger mobile WhatsApp delete sync in background for ALL deleted chats
  if (deletedWhatsappQrUserIds.length > 0) {
    try {
      const whatsappQr = require('../channels/whatsappQr');
      whatsappQr.batchDeleteChatsOnWhatsApp(deletedWhatsappQrUserIds).catch(err => {
        console.warn('[ChatManager] Mobile batch delete error:', err.message);
      });
    } catch (e) {}
  }

  return { success: true, count: deletedCount };
}

function bulkCloseConversations(keys = [], status = 'resolved', options = {}) {
  const chats = loadChats();
  let updatedCount = 0;
  const now = new Date().toISOString();

  if (options.all || keys === 'all') {
    const channel = options.channel;
    for (const k of Object.keys(chats)) {
      if (!channel || channel === 'all' || chats[k].channel === channel) {
        chats[k].status = status;
        chats[k].isResolved = (status === 'resolved');
        chats[k].lastUpdated = now;
        updatedCount++;
      }
    }
  } else if (Array.isArray(keys)) {
    for (const item of keys) {
      const key = typeof item === 'string' ? item : `${item.channel}:${item.userId}`;
      if (chats[key]) {
        chats[key].status = status;
        chats[key].isResolved = (status === 'resolved');
        chats[key].lastUpdated = now;
        updatedCount++;
      }
    }
  }

  if (updatedCount > 0) {
    saveChats(chats);
  }
  return { success: true, count: updatedCount };
}

module.exports = {
  logMessage,
  updateContact,
  isHumanTakeoverActive,
  toggleHumanTakeover,
  getAllConversations,
  getConversation,
  clearConversationMessages,
  deleteConversation,
  bulkDeleteConversations,
  bulkCloseConversations,
  updateChatTimestamp,
  addNote,
  bookAppointment,
  addQuotation,
  updateLeadStage,
  updateChatOwner,
  detectSentiment
};

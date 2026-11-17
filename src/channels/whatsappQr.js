const { 
  default: makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const QRCode = require('qrcode');
const fs = require('fs');

const AUTH_FOLDER = path.join(__dirname, '../../data/auth_info_baileys');

let sock = null;
let currentQrDataUrl = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'qr_ready' | 'connected'
let connectedPhone = null;
let presenceInterval = null;
let reconnectTimer = null;
let isInitializing = false;

// Track IDs of messages sent by bot to prevent self-echo & false human takeover
const botSentMessageIds = new Set();

// Silent logger for clean console
const logger = pino({ level: 'silent' });

/**
 * Cleanly destroy and detach existing socket instance from memory
 */
function cleanUpSocket() {
  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sock) {
    try {
      sock.ev?.removeAllListeners();
      sock.ws?.close();
      sock.end?.();
    } catch (e) {}
    sock = null;
  }
}

/**
 * Deep-extract text from any WhatsApp message wrapper
 */
function extractMessageText(msg) {
  if (!msg || !msg.message) return '';
  let m = msg.message;
  // Unwrap ephemeral / view once / document / template wrappers
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
  if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    ''
  ).trim();
}

async function initWhatsAppQr() {
  if (isInitializing) {
    console.log('[WhatsApp QR] Initialization already in progress, skipping duplicate call.');
    return;
  }
  isInitializing = true;

  try {
    // Tear down any previous socket before creating a new one
    cleanUpSocket();

    if (!fs.existsSync(AUTH_FOLDER)) {
      fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: ['BWB Media Bot', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        connectionStatus = 'qr_ready';
        try {
          currentQrDataUrl = await QRCode.toDataURL(qr);
        } catch (e) {
          currentQrDataUrl = null;
        }
        console.log('📲 [WhatsApp QR] Scan the QR code in terminal or open http://localhost:3000/qr to connect!');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isReplaced = statusCode === DisconnectReason.connectionReplaced; // 440

        connectionStatus = 'disconnected';
        currentQrDataUrl = null;
        connectedPhone = null;

        // Clean up socket listeners & socket reference immediately
        cleanUpSocket();

        if (isLoggedOut) {
          console.log('[WhatsApp QR] Device logged out or auth expired. Resetting session & generating fresh QR...');
          try {
            fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
          } catch (e) {}
          reconnectTimer = setTimeout(initWhatsAppQr, 2000);
        } else if (isReplaced) {
          console.warn('[WhatsApp QR] Connection replaced by another session/process (status: 440). Waiting 8s cooldown before reconnecting to prevent clash...');
          reconnectTimer = setTimeout(initWhatsAppQr, 8000);
        } else {
          console.log(`[WhatsApp QR] Connection closed (status: ${statusCode || 'unknown'}). Reconnecting in 3s...`);
          reconnectTimer = setTimeout(initWhatsAppQr, 3000);
        }
      } else if (connection === 'open') {
        connectionStatus = 'connected';
        currentQrDataUrl = null;
        connectedPhone = sock.user?.id ? sock.user.id.split(':')[0] : 'Connected';
        console.log(`✅ [WhatsApp QR] Connected successfully as +${connectedPhone}! Auto-reply is ACTIVE.`);

        // 1. Immediately send 'available' online presence to WhatsApp servers
        try {
          await sock.sendPresenceUpdate('available');
        } catch (e) {}

        // 2. Setup periodic keep-alive presence ping so socket stays permanently active
        if (presenceInterval) clearInterval(presenceInterval);
        presenceInterval = setInterval(async () => {
          if (sock && connectionStatus === 'connected') {
            try { await sock.sendPresenceUpdate('available'); } catch (e) {}
          }
        }, 45000);

        // 3. Auto-sync recent WhatsApp chats on connect
        setTimeout(() => {
          syncRecentWhatsAppChats();
        }, 1500);
      }
    });

    isInitializing = false;

    const chatManager = require('../services/chatManager');

    // 1. Listen to real WhatsApp history synchronization (messaging-history.set)
    sock.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest }) => {
      console.log(`[WhatsApp QR] Syncing history from WhatsApp Web: ${chats?.length || 0} chats, ${contacts?.length || 0} contacts, ${messages?.length || 0} messages`);
      
      // Sync real contact names
      if (contacts && contacts.length) {
        const groupExtractor = require('../services/groupExtractorService');
        for (const c of contacts) {
          if (!c.id || c.id.endsWith('@g.us') || c.id.endsWith('@broadcast')) continue;
          const rawId = c.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
          const purePhone = groupExtractor.resolveLidToPhone(c.id);
          const realName = c.name || c.notify || c.verifiedName;
          if (realName) {
            if (rawId) chatManager.updateContact('whatsapp_qr', rawId, { name: realName });
            if (purePhone && purePhone !== rawId) chatManager.updateContact('whatsapp_qr', purePhone, { name: realName });
          }
        }
      }

      // Sync recent chats list from WhatsApp Web (only update timestamp if chat already exists with messages)
      if (chats && chats.length) {
        const groupExtractor = require('../services/groupExtractorService');
        for (const ch of chats) {
          if (!ch.id || ch.id.endsWith('@g.us') || ch.id.endsWith('@broadcast') || ch.id.endsWith('@newsletter')) continue;
          const purePhone = groupExtractor.resolveLidToPhone(ch.id);
          const rawId = ch.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
          const phone = purePhone || rawId;
          const ts = ch.conversationTimestamp ? new Date(Number(ch.conversationTimestamp) * 1000).toISOString() : null;
          if (ts) {
            chatManager.updateChatTimestamp('whatsapp_qr', phone, ts, true);
          }
          if (ch.name) {
            if (rawId) chatManager.updateContact('whatsapp_qr', rawId, { name: ch.name });
            if (purePhone && purePhone !== rawId) chatManager.updateContact('whatsapp_qr', purePhone, { name: ch.name });
          }
        }
      }

      // Sync recent messages into chat history
      if (messages && messages.length) {
        const groupExtractor = require('../services/groupExtractorService');
        for (const m of messages) {
          if (!m.message || !m.key?.remoteJid || m.key.remoteJid.endsWith('@g.us') || m.key.remoteJid.endsWith('@broadcast')) continue;
          const purePhone = groupExtractor.resolveLidToPhone(m.key.remoteJid);
          const rawId = m.key.remoteJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
          const phone = purePhone || rawId;
          const text = extractMessageText(m);
          if (!text || !phone) continue;

          const sender = m.key.fromMe ? 'agent' : 'user';
          const pushName = m.pushName;
          const ts = m.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000).toISOString() : new Date().toISOString();

          chatManager.logMessage('whatsapp_qr', phone, sender, text, {
            userName: pushName,
            timestamp: ts
          });
        }
      }
    });

    // 2. Listen to real contacts updates
    sock.ev.on('contacts.upsert', (contacts) => {
      const groupExtractor = require('../services/groupExtractorService');
      for (const c of contacts) {
        if (!c.id || c.id.endsWith('@g.us') || c.id.endsWith('@broadcast')) continue;
        const rawId = c.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        const purePhone = groupExtractor.resolveLidToPhone(c.id);
        const realName = c.name || c.notify || c.verifiedName;
        if (realName) {
          if (rawId) chatManager.updateContact('whatsapp_qr', rawId, { name: realName });
          if (purePhone && purePhone !== rawId) chatManager.updateContact('whatsapp_qr', purePhone, { name: realName });
        }
      }
    });

    sock.ev.on('contacts.update', (updates) => {
      const groupExtractor = require('../services/groupExtractorService');
      for (const c of updates) {
        if (!c.id || c.id.endsWith('@g.us') || c.id.endsWith('@broadcast')) continue;
        const rawId = c.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        const purePhone = groupExtractor.resolveLidToPhone(c.id);
        const realName = c.name || c.notify || c.verifiedName;
        if (realName) {
          if (rawId) chatManager.updateContact('whatsapp_qr', rawId, { name: realName });
          if (purePhone && purePhone !== rawId) chatManager.updateContact('whatsapp_qr', purePhone, { name: realName });
        }
      }
    });

    // 3. Listen to incoming messages (both notify and append)
    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        // Ignore status broadcasts and empty messages
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

        const remoteJid = msg.key.remoteJid;
        // Only handle individual chats (not groups, newsletters, or broadcasts)
        if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@newsletter') || remoteJid.endsWith('@broadcast')) continue;

        // Skip messages sent by the bot itself
        if (msg.key.id && botSentMessageIds.has(msg.key.id)) continue;

        const groupExtractor = require('../services/groupExtractorService');
        const purePhone = groupExtractor.resolveLidToPhone(remoteJid);
        const cleanRemoteNumber = remoteJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        const userPhone = purePhone || cleanRemoteNumber;
        const myPhone = (connectedPhone || (sock.user?.id ? sock.user.id.split(':')[0] : '')).replace(/[^0-9]/g, '');
        const isSelfChat = myPhone && (cleanRemoteNumber === myPhone || remoteJid.includes(myPhone) || userPhone.includes(myPhone));

        const text = extractMessageText(msg);
        if (!text) continue;

        const pushName = msg.pushName || null;
        if (pushName && !msg.key.fromMe) {
          chatManager.updateContact('whatsapp_qr', userPhone, { name: pushName });
          if (cleanRemoteNumber && cleanRemoteNumber !== userPhone) {
            chatManager.updateContact('whatsapp_qr', cleanRemoteNumber, { name: pushName });
          }
        }

        const conv = chatManager.getConversation('whatsapp_qr', userPhone);
        const lastMsg = conv?.messages?.slice(-1)[0];

        // Duplicate bot echo check: if this fromMe message has identical text to bot's last reply, skip it!
        if (msg.key.fromMe && lastMsg && lastMsg.sender === 'bot' && lastMsg.text === text) {
          continue;
        }

        const isExplicitBotCommand = /^([!#/]bot|!test|#test)\b/i.test(text);

        // If command sent, force release human takeover
        if (isExplicitBotCommand) {
          chatManager.toggleHumanTakeover('whatsapp_qr', userPhone, false);
        }

        // If the message was truly sent by the human owner from their phone to an EXTERNAL client, enable takeover
        if (msg.key.fromMe && !isSelfChat && !isExplicitBotCommand) {
          chatManager.logMessage('whatsapp_qr', userPhone, 'agent', text, { userName: pushName });
          chatManager.toggleHumanTakeover('whatsapp_qr', userPhone, true);
          console.log(`[WhatsApp QR] Owner sent message to external client +${userPhone} from phone. Bot paused for human conversation.`);
          continue;
        }

        // Log incoming customer message with real WhatsApp Name
        chatManager.logMessage('whatsapp_qr', userPhone, 'user', text, { userName: pushName });

        console.log(`[WhatsApp QR] Incoming message from ${pushName || ('+' + userPhone)} (${isSelfChat ? 'SELF-TEST' : 'CLIENT'}): "${text}"`);

        // Process message through AI state machine (Dynamic require breaks circular dependency)
        const aiService = require('../services/aiService');
        const replyText = await aiService.processMessage(userPhone, 'whatsapp_qr', text);

        if (replyText) {
          // Human-like typing presence indicator
          try {
            await sock.sendPresenceUpdate('composing', remoteJid);
            const typingDelay = Math.min(Math.max(replyText.length * 20, 1200), 3000);
            await new Promise(res => setTimeout(res, typingDelay));
            await sock.sendPresenceUpdate('paused', remoteJid);
          } catch (e) {}

          // Send response back & register message ID
          try {
            const sent = await sock.sendMessage(remoteJid, { text: replyText });
            if (sent?.key?.id) {
              botSentMessageIds.add(sent.key.id);
              if (botSentMessageIds.size > 2000) {
                const it = botSentMessageIds.values();
                for (let i = 0; i < 500; i++) botSentMessageIds.delete(it.next().value);
              }
            }
            console.log(`[WhatsApp QR] Sent reply to +${userPhone}`);
          } catch (sendErr) {
            console.error(`[WhatsApp QR] Failed to deliver reply to ${remoteJid}:`, sendErr.message);
          }
        }
      }
    });

  } catch (err) {
    isInitializing = false;
    cleanUpSocket();
    console.error('[WhatsApp QR] Init failed:', err.message);
    reconnectTimer = setTimeout(initWhatsAppQr, 5000);
  }
}

async function logoutWhatsAppQr() {
  try {
    cleanUpSocket();
    connectionStatus = 'disconnected';
    currentQrDataUrl = null;
    connectedPhone = null;
    if (fs.existsSync(AUTH_FOLDER)) {
      fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    }
    console.log('[WhatsApp QR] Logged out successfully. Re-generating fresh QR code...');
    reconnectTimer = setTimeout(initWhatsAppQr, 1500);
    return true;
  } catch (err) {
    console.error('[WhatsApp QR] Logout error:', err.message);
    return false;
  }
}

async function sendWhatsAppQrMessage(to, text) {
  try {
    if (!sock || connectionStatus !== 'connected') {
      console.warn('[WhatsApp QR] Cannot send message: client is not connected.');
      return false;
    }
    let jid = to;
    if (!jid.includes('@')) {
      jid = `${jid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    }
    const sent = await sock.sendMessage(jid, { text });
    if (sent?.key?.id) {
      botSentMessageIds.add(sent.key.id);
    }
    console.log(`[WhatsApp QR] Sent message to ${jid}: "${text}"`);
    return true;
  } catch (err) {
    console.error(`[WhatsApp QR] Failed to send message to ${to}:`, err.message);
    return false;
  }
}

async function sendWhatsAppQrImage(to, imageSource, caption = '') {
  try {
    if (!sock || connectionStatus !== 'connected') {
      console.warn('[WhatsApp QR] Cannot send image: client is not connected.');
      return false;
    }
    let jid = to;
    if (!jid.includes('@')) {
      jid = `${jid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    }

    let imagePayload;
    if (typeof imageSource === 'string' && (imageSource.startsWith('http://') || imageSource.startsWith('https://'))) {
      imagePayload = { url: imageSource };
    } else if (typeof imageSource === 'string' && fs.existsSync(imageSource)) {
      imagePayload = fs.readFileSync(imageSource);
    } else if (Buffer.isBuffer(imageSource)) {
      imagePayload = imageSource;
    } else {
      throw new Error('Invalid image source provided. Must be a valid HTTP URL, file path, or Buffer.');
    }

    const messageObj = {
      image: imagePayload,
      caption: caption || undefined
    };

    const sent = await sock.sendMessage(jid, messageObj);
    if (sent?.key?.id) {
      botSentMessageIds.add(sent.key.id);
    }
    console.log(`[WhatsApp QR] Sent image with caption to ${jid}`);
    return true;
  } catch (err) {
    console.error(`[WhatsApp QR] Failed to send image to ${to}:`, err.message);
    return false;
  }
}

async function sendWhatsAppQrDocument(to, docSource, fileName = 'document.pdf', caption = '') {
  try {
    if (!sock || connectionStatus !== 'connected') {
      console.warn('[WhatsApp QR] Cannot send document: client is not connected.');
      return false;
    }
    let jid = to;
    if (!jid.includes('@')) {
      jid = `${jid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    }

    let docPayload;
    if (typeof docSource === 'string' && (docSource.startsWith('http://') || docSource.startsWith('https://'))) {
      docPayload = { url: docSource };
    } else if (typeof docSource === 'string' && fs.existsSync(docSource)) {
      docPayload = fs.readFileSync(docSource);
    } else if (Buffer.isBuffer(docSource)) {
      docPayload = docSource;
    } else {
      throw new Error('Invalid document source. Must be a valid HTTP URL, file path, or Buffer.');
    }

    const cleanFileName = fileName || 'Document.pdf';
    let mimetype = 'application/pdf';
    if (cleanFileName.endsWith('.xlsx') || cleanFileName.endsWith('.xls')) {
      mimetype = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (cleanFileName.endsWith('.docx') || cleanFileName.endsWith('.doc')) {
      mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    const messageObj = {
      document: docPayload,
      mimetype,
      fileName: cleanFileName,
      caption: caption || undefined
    };

    const sent = await sock.sendMessage(jid, messageObj);
    if (sent?.key?.id) {
      botSentMessageIds.add(sent.key.id);
    }
    console.log(`[WhatsApp QR] Sent document (${cleanFileName}) to ${jid}`);
    return true;
  } catch (err) {
    console.error(`[WhatsApp QR] Failed to send document to ${to}:`, err.message);
    return false;
  }
}

async function fetchAllGroups() {
  try {
    if (!sock || connectionStatus !== 'connected') {
      console.warn('[WhatsApp QR] Cannot fetch groups: client is not connected.');
      return [];
    }
    const groupsData = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groupsData).map(g => ({
      id: g.id,
      subject: g.subject || 'Unnamed Group',
      desc: g.desc || '',
      owner: g.owner || '',
      creation: g.creation || null,
      size: (g.participants || []).length,
      participants: (g.participants || []).map(p => ({
        id: p.id,
        phone: p.id ? p.id.split('@')[0].split(':')[0] : '',
        isAdmin: !!p.admin
      }))
    }));
    return groupList;
  } catch (err) {
    console.error('[WhatsApp QR] Failed to fetch groups:', err.message);
    return [];
  }
}

async function getLiveGroupMetadata(groupId) {
  try {
    if (!sock || connectionStatus !== 'connected') {
      console.warn('[WhatsApp QR] Cannot fetch group metadata: client is not connected.');
      return null;
    }
    const metadata = await sock.groupMetadata(groupId);
    return {
      id: metadata.id,
      subject: metadata.subject || 'Unnamed Group',
      desc: metadata.desc || '',
      owner: metadata.owner || '',
      creation: metadata.creation || null,
      size: (metadata.participants || []).length,
      participants: (metadata.participants || []).map(p => ({
        id: p.id,
        phone: p.id ? p.id.split('@')[0].split(':')[0] : '',
        isAdmin: !!p.admin,
        isSuperAdmin: p.admin === 'superadmin'
      }))
    };
  } catch (err) {
    console.error(`[WhatsApp QR] Failed to fetch live metadata for ${groupId}:`, err.message);
    return null;
  }
}

async function createWhatsAppGroup(title, participants = []) {
  try {
    if (!sock || connectionStatus !== 'connected') {
      throw new Error('WhatsApp client is not connected.');
    }
    const cleanTitle = (title || 'New WhatsApp Group').trim();
    const jids = participants
      .map(p => {
        const clean = (typeof p === 'string' ? p : (p.phone || p.id || '')).replace(/[^0-9]/g, '');
        return clean.length >= 8 ? `${clean}@s.whatsapp.net` : null;
      })
      .filter(Boolean);

    if (jids.length === 0) {
      throw new Error('At least 1 valid participant phone number is required to create a group.');
    }

    const group = await sock.groupCreate(cleanTitle, jids);
    console.log(`[WhatsApp QR] Successfully created group "${cleanTitle}" (ID: ${group.id}) with ${jids.length} members`);
    return {
      id: group.id,
      subject: group.subject,
      participantsCount: jids.length
    };
  } catch (err) {
    console.error('[WhatsApp QR] Failed to create group:', err.message);
    throw err;
  }
}

async function simulateTyping(to, durationMs = 3000) {
  try {
    if (!sock || connectionStatus !== 'connected') return;
    let jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    await sock.sendPresenceUpdate('composing', jid);
    await new Promise(r => setTimeout(r, durationMs));
    await sock.sendPresenceUpdate('paused', jid);
  } catch (e) {}
}

/**
 * Clear chat messages on linked mobile WhatsApp
 * @param {string} target - Phone number, LID, or full WhatsApp JID
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function clearChatOnWhatsApp(target) {
  try {
    if (!sock || connectionStatus !== 'connected') {
      console.warn('[WhatsApp QR] Cannot clear chat on mobile: WhatsApp client is not connected.');
      return { success: false, error: 'WhatsApp client is not connected' };
    }

    const jids = resolveTargetJids(target);
    const nowTs = Math.floor(Date.now() / 1000);
    for (const jid of jids) {
      try {
        await sock.chatModify({ clear: true, lastMessages: { lastMessageTimestamp: nowTs } }, jid);
        console.log(`[WhatsApp QR] Successfully sent clearChat sync to mobile for: ${jid}`);
      } catch (err) {
        console.warn(`[WhatsApp QR] chatModify clearChat error for ${jid}:`, err.message);
      }
    }
    return { success: true };
  } catch (err) {
    console.error('[WhatsApp QR] Failed to clear chat on WhatsApp:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Delete entire conversation from linked mobile WhatsApp chat list
 * @param {string} target - Phone number, LID, or full WhatsApp JID
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function deleteChatOnWhatsApp(target) {
  try {
    if (!sock || connectionStatus !== 'connected') {
      console.warn('[WhatsApp QR] Cannot delete chat on mobile: WhatsApp client is not connected.');
      return { success: false, error: 'WhatsApp client is not connected' };
    }

    const jids = resolveTargetJids(target);
    const nowTs = Math.floor(Date.now() / 1000);
    for (const jid of jids) {
      try {
        await sock.chatModify({ delete: true, lastMessages: { lastMessageTimestamp: nowTs } }, jid);
        console.log(`[WhatsApp QR] Successfully sent deleteChat sync to mobile for: ${jid}`);
      } catch (err) {
        console.warn(`[WhatsApp QR] chatModify deleteChat error for ${jid}:`, err.message);
      }
    }
    return { success: true };
  } catch (err) {
    console.error('[WhatsApp QR] Failed to delete chat on WhatsApp:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Helper to resolve phone / LID string into set of valid WhatsApp JIDs
 */
function resolveTargetJids(target) {
  if (!target) return [];
  const str = String(target).trim();
  const jidSet = new Set();

  if (str.includes('@')) {
    jidSet.add(str);
    if (str.endsWith('@lid')) {
      const groupExtractor = require('../services/groupExtractorService');
      const rawLid = str.split('@')[0];
      const purePhone = groupExtractor.resolveLidToPhone(rawLid);
      if (purePhone) jidSet.add(`${purePhone}@s.whatsapp.net`);
    }
  } else {
    const cleanDigits = str.replace(/\D/g, '');
    if (cleanDigits) {
      jidSet.add(`${cleanDigits}@s.whatsapp.net`);
    }
  }
  return Array.from(jidSet);
}

/**
 * Batch delete multiple conversations on mobile WhatsApp in rate-limited chunks
 * @param {string[]} targetList - Array of phone numbers, LIDs, or JIDs
 */
async function batchDeleteChatsOnWhatsApp(targetList = []) {
  if (!sock || connectionStatus !== 'connected') {
    console.warn('[WhatsApp QR] Cannot batch delete: client is not connected.');
    return { success: false, error: 'WhatsApp client is not connected' };
  }

  const list = Array.isArray(targetList) ? targetList : [];
  if (list.length === 0) return { success: true, count: 0 };

  console.log(`[WhatsApp QR] Starting mobile batch delete for ${list.length} chats...`);
  const chunkSize = 20;
  let totalDeleted = 0;

  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    await Promise.allSettled(chunk.map(async (target) => {
      const jids = resolveTargetJids(target);
      const nowTs = Math.floor(Date.now() / 1000);
      for (const jid of jids) {
        try {
          await sock.chatModify({ delete: true, lastMessages: { lastMessageTimestamp: nowTs } }, jid);
          totalDeleted++;
        } catch (e) {}
      }
    }));

    if (i + chunkSize < list.length) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  console.log(`[WhatsApp QR] Mobile batch delete completed: ${totalDeleted} WhatsApp chats removed.`);
  return { success: true, count: totalDeleted };
}

/**
 * Batch clear multiple conversations on mobile WhatsApp in rate-limited chunks
 * @param {string[]} targetList - Array of phone numbers, LIDs, or JIDs
 */
async function batchClearChatsOnWhatsApp(targetList = []) {
  if (!sock || connectionStatus !== 'connected') {
    console.warn('[WhatsApp QR] Cannot batch clear: client is not connected.');
    return { success: false, error: 'WhatsApp client is not connected' };
  }

  const list = Array.isArray(targetList) ? targetList : [];
  if (list.length === 0) return { success: true, count: 0 };

  console.log(`[WhatsApp QR] Starting mobile batch clear for ${list.length} chats...`);
  const chunkSize = 20;
  let totalCleared = 0;

  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    await Promise.allSettled(chunk.map(async (target) => {
      const jids = resolveTargetJids(target);
      const nowTs = Math.floor(Date.now() / 1000);
      for (const jid of jids) {
        try {
          await sock.chatModify({ clear: true, lastMessages: { lastMessageTimestamp: nowTs } }, jid);
          totalCleared++;
        } catch (e) {}
      }
    }));

    if (i + chunkSize < list.length) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  console.log(`[WhatsApp QR] Mobile batch clear completed: ${totalCleared} WhatsApp chats cleared.`);
  return { success: true, count: totalCleared };
}

/**
 * Synchronize recent active WhatsApp chats from live connected socket
 */
async function syncRecentWhatsAppChats() {
  try {
    if (!sock || connectionStatus !== 'connected') return;
    console.log('[WhatsApp QR] Auto-syncing recent WhatsApp conversations...');
    const groupExtractor = require('../services/groupExtractorService');
    const chatManager = require('../services/chatManager');
    
    const chats = sock.store?.chats?.all?.() || [];
    if (chats.length > 0) {
      for (const ch of chats) {
        if (!ch.id || ch.id.endsWith('@g.us') || ch.id.endsWith('@broadcast') || ch.id.endsWith('@newsletter')) continue;
        const purePhone = groupExtractor.resolveLidToPhone(ch.id);
        const rawId = ch.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        const phone = purePhone || rawId;
        const ts = ch.conversationTimestamp ? new Date(Number(ch.conversationTimestamp) * 1000).toISOString() : new Date().toISOString();
        chatManager.updateChatTimestamp('whatsapp_qr', phone, ts);
        if (ch.name) {
          if (rawId) chatManager.updateContact('whatsapp_qr', rawId, { name: ch.name });
          if (purePhone && purePhone !== rawId) chatManager.updateContact('whatsapp_qr', purePhone, { name: ch.name });
        }
      }
      console.log(`[WhatsApp QR] Successfully synchronized ${chats.length} recent WhatsApp chats!`);
    }
  } catch (err) {
    console.warn('[WhatsApp QR] syncRecentWhatsAppChats note:', err.message);
  }
}

function getQrStatus() {
  return {
    status: connectionStatus,
    phone: connectedPhone,
    qrDataUrl: currentQrDataUrl
  };
}

module.exports = {
  initWhatsAppQr,
  getQrStatus,
  logoutWhatsAppQr,
  sendWhatsAppQrMessage,
  sendWhatsAppQrImage,
  sendWhatsAppQrDocument,
  fetchAllGroups,
  getLiveGroupMetadata,
  createWhatsAppGroup,
  simulateTyping,
  clearChatOnWhatsApp,
  deleteChatOnWhatsApp,
  batchDeleteChatsOnWhatsApp,
  batchClearChatsOnWhatsApp,
  syncRecentWhatsAppChats,
  resolveTargetJids
};

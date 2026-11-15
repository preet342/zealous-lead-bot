const fs = require('fs');
const path = require('path');
const whatsappQr = require('../channels/whatsappQr');

const AUTH_DIR = path.join(__dirname, '../../data/auth_info_baileys');
const CHATS_FILE = path.join(__dirname, '../../data/chats.json');
const LEADS_FILE = path.join(__dirname, '../../data/leads.json');

let lidCache = null;
let contactNameCache = null;
let lastCacheTime = 0;

/**
 * Load Baileys reverse LID mappings from auth directory
 */
function loadLidMappings() {
  if (lidCache) return lidCache;
  lidCache = new Map();
  try {
    if (fs.existsSync(AUTH_DIR)) {
      const files = fs.readdirSync(AUTH_DIR);
      for (const file of files) {
        if (file.startsWith('lid-mapping-') && file.endsWith('_reverse.json')) {
          const lid = file.replace('lid-mapping-', '').replace('_reverse.json', '');
          try {
            const rawPhone = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, file), 'utf8'));
            if (rawPhone) {
              const clean = String(rawPhone).replace(/[^0-9]/g, '');
              if (clean.length >= 8) lidCache.set(lid, clean);
            }
          } catch (e) {}
        }
      }
    }
  } catch (err) {
    console.error('[GroupExtractor] Error loading LID mappings:', err.message);
  }
  return lidCache;
}

/**
 * Build and cache contact names from chats.json and leads.json
 * Enables extracting REAL Full Names for participants
 */
function loadContactNamesCache(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && contactNameCache && (now - lastCacheTime < 30000)) {
    return contactNameCache;
  }

  contactNameCache = new Map();
  lastCacheTime = now;

  // 1. Load from chats.json
  try {
    if (fs.existsSync(CHATS_FILE)) {
      const chats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8') || '{}');
      const chatEntries = Array.isArray(chats) ? chats : Object.values(chats);

      for (const c of chatEntries) {
        const uName = (c.userName || c.name || '').trim();
        const uId = String(c.userId || '').trim();
        const cleanPhone = uId.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

        if (uName && uName.length >= 2 && !uName.startsWith('+') && !/^\d+$/.test(uName)) {
          if (cleanPhone) {
            contactNameCache.set(cleanPhone, uName);
            if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
              contactNameCache.set(cleanPhone.slice(2), uName);
            }
          }
          if (uId) {
            contactNameCache.set(uId, uName);
          }
        }

        // Also check inside messages for pushName or lead form data
        if (Array.isArray(c.messages)) {
          for (const m of c.messages) {
            if (m.userName && typeof m.userName === 'string') {
              const pName = m.userName.trim();
              if (pName && pName.length >= 2 && !pName.startsWith('+') && !/^\d+$/.test(pName)) {
                if (cleanPhone && !contactNameCache.has(cleanPhone)) {
                  contactNameCache.set(cleanPhone, pName);
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[GroupExtractor] Error loading contact names from chats:', err.message);
  }

  // 2. Load from leads.json
  try {
    if (fs.existsSync(LEADS_FILE)) {
      const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8') || '[]');
      if (Array.isArray(leads)) {
        for (const lead of leads) {
          const lData = lead.leadData || {};
          const name = (lData.name || '').trim();
          const rawPhone = String(lData.phone || lead.userId || '').replace(/[^0-9]/g, '');
          if (name && rawPhone && rawPhone.length >= 8) {
            contactNameCache.set(rawPhone, name);
            if (rawPhone.startsWith('91') && rawPhone.length === 12) {
              contactNameCache.set(rawPhone.slice(2), name);
            }
          }
        }
      }
    }
  } catch (err) {}

  return contactNameCache;
}

/**
 * Resolve LID or WhatsApp JID to clean phone number
 */
function resolveLidToPhone(rawIdOrJid) {
  if (!rawIdOrJid) return '';
  const jid = String(rawIdOrJid).trim();
  const rawId = jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

  if (jid.endsWith('@s.whatsapp.net') && rawId.length >= 10 && rawId.length <= 13) {
    return rawId;
  }

  const cache = loadLidMappings();
  if (cache.has(rawId)) {
    return cache.get(rawId);
  }

  try {
    const revFile = path.join(AUTH_DIR, `lid-mapping-${rawId}_reverse.json`);
    if (fs.existsSync(revFile)) {
      const p = JSON.parse(fs.readFileSync(revFile, 'utf8'));
      if (p) {
        const clean = String(p).replace(/[^0-9]/g, '');
        cache.set(rawId, clean);
        return clean;
      }
    }
  } catch (e) {}

  return rawId;
}

/**
 * Resolve Real Contact Name from caches and participant data
 */
function resolveContactName(phone, jid, p = {}) {
  // 1. Direct name from Baileys participant object
  if (p.name && typeof p.name === 'string' && p.name.trim().length >= 2) {
    return p.name.trim();
  }
  if (p.notify && typeof p.notify === 'string' && p.notify.trim().length >= 2) {
    return p.notify.trim();
  }
  if (p.pushName && typeof p.pushName === 'string' && p.pushName.trim().length >= 2) {
    return p.pushName.trim();
  }

  // 2. Lookup in Contact Name Cache
  const cache = loadContactNamesCache();
  const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');

  if (cleanPhone && cache.has(cleanPhone)) {
    return cache.get(cleanPhone);
  }
  if (cleanPhone.startsWith('91') && cleanPhone.length === 12 && cache.has(cleanPhone.slice(2))) {
    return cache.get(cleanPhone.slice(2));
  }
  if (jid && cache.has(jid)) {
    return cache.get(jid);
  }

  return '';
}

/**
 * International Country & Flag Detector
 */
const COUNTRY_CODES = [
  { prefix: '91', country: 'India', flag: '🇮🇳' },
  { prefix: '1', country: 'USA / Canada', flag: '🇺🇸' },
  { prefix: '44', country: 'United Kingdom', flag: '🇬🇧' },
  { prefix: '971', country: 'UAE', flag: '🇦🇪' },
  { prefix: '966', country: 'Saudi Arabia', flag: '🇸🇦' },
  { prefix: '974', country: 'Qatar', flag: '🇶🇦' },
  { prefix: '965', country: 'Kuwait', flag: '🇰🇼' },
  { prefix: '968', country: 'Oman', flag: '🇴🇲' },
  { prefix: '973', country: 'Bahrain', flag: '🇧🇭' },
  { prefix: '65', country: 'Singapore', flag: '🇸🇬' },
  { prefix: '60', country: 'Malaysia', flag: '🇲🇾' },
  { prefix: '61', country: 'Australia', flag: '🇦🇺' },
  { prefix: '49', country: 'Germany', flag: '🇩🇪' },
  { prefix: '33', country: 'France', flag: '🇫🇷' },
  { prefix: '39', country: 'Italy', flag: '🇮🇹' },
  { prefix: '34', country: 'Spain', flag: '🇪🇸' },
  { prefix: '880', country: 'Bangladesh', flag: '🇧🇩' },
  { prefix: '92', country: 'Pakistan', flag: '🇵🇰' },
  { prefix: '977', country: 'Nepal', flag: '🇳🇵' },
  { prefix: '94', country: 'Sri Lanka', flag: '🇱🇰' },
  { prefix: '62', country: 'Indonesia', flag: '🇮🇩' },
  { prefix: '63', country: 'Philippines', flag: '🇵🇭' },
  { prefix: '55', country: 'Brazil', flag: '🇧🇷' },
  { prefix: '234', country: 'Nigeria', flag: '🇳🇬' },
  { prefix: '27', country: 'South Africa', flag: '🇿🇦' },
  { prefix: '7', country: 'Russia', flag: '🇷🇺' }
];

function detectCountry(phone) {
  const clean = String(phone || '').replace(/[^0-9]/g, '');
  if (!clean || clean.length < 5) {
    return { country: 'International', flag: '🌍', prefix: '' };
  }

  // Sort prefixes by descending length so 971 matches before 9, etc.
  for (const c of COUNTRY_CODES) {
    if (clean.startsWith(c.prefix)) {
      return { country: c.country, flag: c.flag, prefix: '+' + c.prefix };
    }
  }

  return { country: 'International', flag: '🌍', prefix: '+' };
}

/**
 * Format phone display cleanly with spacing
 */
function formatPhoneDisplay(phone) {
  const clean = String(phone).replace(/[^0-9]/g, '');
  if (clean.startsWith('91') && clean.length === 12) {
    return `+91 ${clean.slice(2, 7)} ${clean.slice(7)}`;
  } else if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  } else if (clean.startsWith('1') && clean.length === 11) {
    return `+1 (${clean.slice(1, 4)}) ${clean.slice(4, 7)}-${clean.slice(7)}`;
  } else if (clean.startsWith('44') && clean.length >= 11) {
    return `+44 ${clean.slice(2, 6)} ${clean.slice(6)}`;
  } else if (clean.startsWith('971') && clean.length >= 10) {
    return `+971 ${clean.slice(3, 5)} ${clean.slice(5)}`;
  } else if (clean.length > 5) {
    return `+${clean}`;
  }
  return clean;
}

/**
 * Map a raw WhatsApp group participant into a highly enriched lead object
 */
function mapParticipant(p, groupSubject = '') {
  const realPhone = resolveLidToPhone(p.phone || p.id);
  const isRealPhone = (realPhone.startsWith('91') && realPhone.length === 12) || (realPhone.length >= 10 && realPhone.length <= 15);
  const formattedPhone = formatPhoneDisplay(realPhone);
  const countryInfo = detectCountry(realPhone);
  const realName = resolveContactName(realPhone, p.id, p);

  const isAdmin = !!(p.isAdmin || p.admin === 'admin' || p.admin === 'superadmin');
  const isSuperAdmin = !!(p.isSuperAdmin || p.admin === 'superadmin');

  let role = 'Member';
  let roleBadge = '👤 Member';
  if (isSuperAdmin) {
    role = 'Super Admin / Creator';
    roleBadge = '👑 Creator';
  } else if (isAdmin) {
    role = 'Admin';
    roleBadge = '🛡️ Admin';
  }

  return {
    id: p.id,
    phone: realPhone,
    formattedPhone,
    isRealPhone,
    name: realName,
    hasRealName: !!realName,
    displayName: realName || formattedPhone,
    country: countryInfo.country,
    flag: countryInfo.flag,
    countryPrefix: countryInfo.prefix,
    role,
    roleBadge,
    isAdmin,
    isSuperAdmin,
    groupName: groupSubject || ''
  };
}

/**
 * Fetch all groups and members from active WhatsApp QR connection
 */
async function getAllGroups() {
  const groups = await whatsappQr.fetchAllGroups();
  return groups.map(g => ({
    ...g,
    participants: (g.participants || []).map(p => mapParticipant(p, g.subject))
  }));
}

/**
 * Fetch single group with participants by group ID
 * Checks live WhatsApp API metadata first so 100-1000 full members are fetched
 */
async function getGroupById(groupId) {
  const live = await whatsappQr.getLiveGroupMetadata(groupId);
  if (live && live.participants && live.participants.length > 0) {
    return {
      ...live,
      participants: live.participants.map(p => mapParticipant(p, live.subject))
    };
  }
  const groups = await whatsappQr.fetchAllGroups();
  const found = groups.find(g => g.id === groupId);
  if (found) {
    return {
      ...found,
      participants: (found.participants || []).map(p => mapParticipant(p, found.subject))
    };
  }
  return null;
}

/**
 * Super Advanced Multi-Group Bulk Extractor & Deduplication Engine
 * Scans multiple or ALL groups, cross-deduplicates members, and tags cross-group leads
 */
async function extractBulkGroups(groupIds = []) {
  let targetGroups = [];

  if (!groupIds || groupIds.length === 0 || groupIds === 'all' || (Array.isArray(groupIds) && groupIds[0] === 'all')) {
    targetGroups = await getAllGroups();
  } else {
    for (const gid of groupIds) {
      const g = await getGroupById(gid);
      if (g) targetGroups.push(g);
    }
  }

  const memberMap = new Map();
  let totalRawMembers = 0;

  for (const group of targetGroups) {
    const groupName = group.subject || 'Unknown Group';
    const participants = group.participants || [];
    totalRawMembers += participants.length;

    for (const p of participants) {
      const key = p.phone || p.id;
      if (!key) continue;

      if (memberMap.has(key)) {
        const existing = memberMap.get(key);
        existing.groupCount = (existing.groupCount || 1) + 1;
        if (!existing.groups.includes(groupName)) {
          existing.groups.push(groupName);
        }
        if (p.isAdmin) existing.isAdmin = true;
        if (p.isSuperAdmin) existing.isSuperAdmin = true;
        if (!existing.name && p.name) existing.name = p.name;
        if (existing.isSuperAdmin) {
          existing.role = 'Super Admin / Creator';
          existing.roleBadge = '👑 Creator';
        } else if (existing.isAdmin) {
          existing.role = 'Admin';
          existing.roleBadge = '🛡️ Admin';
        }
      } else {
        memberMap.set(key, {
          ...p,
          groupCount: 1,
          groups: [groupName]
        });
      }
    }
  }

  const deduplicatedMembers = Array.from(memberMap.values()).map(m => ({
    ...m,
    isCrossGroup: m.groupCount > 1,
    crossGroupBadge: m.groupCount > 1 ? `🔥 In ${m.groupCount} Groups` : ''
  }));

  // Sort so high-value leads appear at top: Cross-group leads first, then Admins, then members
  deduplicatedMembers.sort((a, b) => {
    if (b.groupCount !== a.groupCount) return b.groupCount - a.groupCount;
    if (b.isAdmin && !a.isAdmin) return 1;
    if (!b.isAdmin && a.isAdmin) return -1;
    if (b.hasRealName && !a.hasRealName) return 1;
    if (!b.hasRealName && a.hasRealName) return -1;
    return (a.displayName || '').localeCompare(b.displayName || '');
  });

  return {
    success: true,
    totalGroupsScanned: targetGroups.length,
    groupNames: targetGroups.map(g => g.subject),
    totalRawMembers,
    uniqueLeadsCount: deduplicatedMembers.length,
    duplicatesRemoved: totalRawMembers - deduplicatedMembers.length,
    members: deduplicatedMembers
  };
}

/**
 * Generate standard vCard 3.0 (.vcf) format from member objects or numbers
 * Allows 1-click import into Android / iPhone Contacts Phonebook with Real Names
 */
function generateVcf(groupSubject, participants = []) {
  const cleanGroupName = (groupSubject || 'WhatsApp Group').replace(/[\r\n;,]/g, ' ').trim();
  const vcfCards = [];

  participants.forEach((p, idx) => {
    const rawPhone = resolveLidToPhone(typeof p === 'string' ? p : (p.phone || p.id || ''));
    if (!rawPhone || rawPhone.length < 8) return;

    let contactName = '';
    const hasName = typeof p === 'object' && p.name && p.name.trim().length >= 2;

    if (hasName) {
      contactName = `${p.name.trim()} (${cleanGroupName.slice(0, 12)})`;
    } else {
      contactName = `${cleanGroupName.slice(0, 15)} ${idx + 1} (${rawPhone.slice(-4)})`;
    }

    const formattedPhone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;
    const country = typeof p === 'object' && p.country ? p.country : detectCountry(rawPhone).country;
    const role = typeof p === 'object' && p.role ? p.role : 'Member';

    vcfCards.push([
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${contactName}`,
      `TEL;TYPE=CELL,VOICE:${formattedPhone}`,
      `ORG:${cleanGroupName}`,
      `TITLE:${role}`,
      `NOTE:WhatsApp Extractor Lead | Country: ${country} | Group: ${cleanGroupName} | BWB Media`,
      'END:VCARD'
    ].join('\r\n'));
  });

  return vcfCards.join('\r\n');
}

/**
 * Generate CSV format for Excel / Google Sheets with rich lead attributes
 */
function generateCsv(groupSubject, participants = []) {
  const cleanGroupName = (groupSubject || 'WhatsApp Group').replace(/[",\r\n]/g, ' ').trim();
  const headers = [
    '"Full Name"',
    '"Phone Number"',
    '"Formatted Phone"',
    '"Role"',
    '"Country"',
    '"Country Flag"',
    '"In Groups Count"',
    '"Groups"',
    '"WhatsApp JID"'
  ];

  const lines = [headers.join(',')];

  participants.forEach(p => {
    const isObj = typeof p === 'object';
    const rawPhone = resolveLidToPhone(isObj ? (p.phone || p.id || '') : p);
    if (!rawPhone || rawPhone.length < 8) return;

    const formatted = formatPhoneDisplay(rawPhone);
    const country = isObj && p.country ? p.country : detectCountry(rawPhone).country;
    const flag = isObj && p.flag ? p.flag : detectCountry(rawPhone).flag;
    const name = (isObj && p.name ? p.name : resolveContactName(rawPhone, isObj ? p.id : '')).replace(/[",\r\n]/g, ' ').trim();
    const role = isObj && p.role ? p.role : (isObj && p.isAdmin ? 'Admin' : 'Member');
    const groupCount = isObj && p.groupCount ? p.groupCount : 1;
    const groupsStr = (isObj && Array.isArray(p.groups) ? p.groups.join('; ') : cleanGroupName).replace(/[",\r\n]/g, ' ').trim();
    const jid = isObj && p.id ? p.id : `${rawPhone}@s.whatsapp.net`;

    lines.push([
      `"${name || '-'}"`,
      `"+${rawPhone}"`,
      `"${formatted}"`,
      `"${role}"`,
      `"${country}"`,
      `"${flag}"`,
      `"${groupCount}"`,
      `"${groupsStr}"`,
      `"${jid}"`
    ].join(','));
  });

  return lines.join('\n');
}

/**
 * Generate clean Plain Text (.TXT) list of numbers (E.164 formatted: +919876543210)
 * Optimized for Facebook / Google Ads Custom Audiences and bulk broadcasters
 */
function generateTxtFromNumbers(phoneNumbersOrParticipants = [], delimiter = '\n') {
  const seen = new Set();
  const lines = [];

  phoneNumbersOrParticipants.forEach(item => {
    const raw = typeof item === 'object' ? (item.phone || item.id || '') : item;
    const resolved = resolveLidToPhone(raw);
    if (!resolved || resolved.length < 8) return;

    const e164 = resolved.startsWith('+') ? resolved : `+${resolved}`;
    if (!seen.has(e164)) {
      seen.add(e164);
      lines.push(e164);
    }
  });

  return lines.join(delimiter);
}

/**
 * Generate VCF from array of phone numbers (fallback helper)
 */
function generateVcfFromNumbers(groupSubject, phoneNumbers = []) {
  return generateVcf(groupSubject, phoneNumbers.map(p => ({ phone: p })));
}

/**
 * Generate CSV from array of phone numbers (fallback helper)
 */
function generateCsvFromNumbers(groupSubject, phoneNumbers = []) {
  return generateCsv(groupSubject, phoneNumbers.map(p => ({ phone: p })));
}

/**
 * Create a new WhatsApp group natively with selected phone numbers
 */
async function createGroupWithSelected(title, phoneNumbers = []) {
  const resolved = phoneNumbers.map(p => resolveLidToPhone(p)).filter(Boolean);
  return await whatsappQr.createWhatsAppGroup(title, resolved);
}

/**
 * Add extracted group participants directly into CRM Leads
 */
function addParticipantsToLeads(groupSubject, participants = []) {
  const leadService = require('./leadService');
  let addedCount = 0;
  const existingLeads = leadService.getAllLeads();
  const existingPhones = new Set();
  
  for (const l of existingLeads) {
    const p = String(l.leadData?.phone || l.userId || '').replace(/[^0-9]/g, '');
    if (p) existingPhones.add(p);
  }

  for (const item of participants) {
    const raw = typeof item === 'string' ? item : (item.phone || item.id || '');
    const cleanPhone = resolveLidToPhone(raw);
    if (!cleanPhone || cleanPhone.length < 7) continue;

    if (existingPhones.has(cleanPhone)) {
      continue; // Already registered as CRM lead
    }

    const name = (typeof item === 'object' && item.name && !item.name.startsWith('+')) 
      ? item.name 
      : `WhatsApp Contact (${cleanPhone.slice(-4)})`;

    const newLead = {
      channel: 'whatsapp_qr',
      userId: cleanPhone,
      stage: 'Lead',
      leadData: {
        name: name,
        phone: cleanPhone,
        service: `Group: ${groupSubject || 'Extracted Group'}`,
        source: 'Group Extractor',
        notes: `Imported from WhatsApp Group "${groupSubject || 'Group'}" on ${new Date().toLocaleDateString()}`
      }
    };

    const saved = leadService.saveLead(newLead);
    if (saved) {
      existingPhones.add(cleanPhone);
      addedCount++;
    }
  }

  return { success: true, count: addedCount };
}

module.exports = {
  getAllGroups,
  getGroupById,
  extractBulkGroups,
  generateVcf,
  generateCsv,
  generateTxtFromNumbers,
  generateVcfFromNumbers,
  generateCsvFromNumbers,
  createGroupWithSelected,
  addParticipantsToLeads,
  resolveLidToPhone,
  resolveContactName,
  detectCountry,
  formatPhoneDisplay,
  mapParticipant
};

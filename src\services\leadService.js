const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

// In-memory conversation state store: { [sessionKey]: { step, name, phone, email, service, notes } }
const userSessions = new Map();

// Ensure data folder and leads.json exist
function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LEADS_FILE)) {
    fs.writeFileSync(LEADS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

ensureStorage();

function getSession(userId, channel) {
  const key = `${channel}:${userId}`;
  if (!userSessions.has(key)) {
    userSessions.set(key, {
      userId,
      channel,
      step: 'AWAITING_NAME',
      leadData: {},
      lastActive: new Date().toISOString()
    });
  }
  return userSessions.get(key);
}

function updateSession(userId, channel, data) {
  const key = `${channel}:${userId}`;
  const current = getSession(userId, channel);
  userSessions.set(key, {
    ...current,
    ...data,
    lastActive: new Date().toISOString()
  });
}

function clearSession(userId, channel) {
  const key = `${channel}:${userId}`;
  userSessions.delete(key);
}

function saveLead(lead) {
  try {
    ensureStorage();
    const raw = fs.readFileSync(LEADS_FILE, 'utf-8');
    const leads = JSON.parse(raw || '[]');
    
    const newLead = {
      id: `LEAD-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...lead
    };
    
    leads.unshift(newLead); // latest on top
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf-8');
    console.log(`[LeadService] New lead saved: ${newLead.id} from ${newLead.channel}`);

    // Auto-sync to CSV and Google Sheets
    try {
      const googleSheetsService = require('./googleSheetsService');
      googleSheetsService.syncLeadToSheets(newLead);
    } catch (e) {}

    return newLead;
  } catch (error) {
    console.error('[LeadService] Error saving lead:', error.message);
    return null;
  }
}

function getAllLeads() {
  try {
    ensureStorage();
    const raw = fs.readFileSync(LEADS_FILE, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

module.exports = {
  getSession,
  updateSession,
  clearSession,
  saveLead,
  getAllLeads
};

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CSV_FILE = path.join(__dirname, '../../data/leads.csv');

// Ensure CSV file header exists
function ensureCsv() {
  const dir = path.dirname(CSV_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CSV_FILE)) {
    const headers = 'ID,Date,Platform,Name,Phone,Service,Budget,Requirements,Status\n';
    fs.writeFileSync(CSV_FILE, headers, 'utf-8');
  }
}

/**
 * Append lead to local CSV and optional Google Sheets Webhook
 */
async function syncLeadToSheets(lead) {
  try {
    ensureCsv();
    const data = lead.leadData || {};
    const clean = (val) => `"${(val || '').toString().replace(/"/g, '""')}"`;

    const row = [
      clean(lead.id),
      clean(new Date(lead.createdAt).toLocaleString()),
      clean(lead.channel),
      clean(data.name),
      clean(data.phone),
      clean(data.service),
      clean(data.budget || 'Not specified'),
      clean(data.notes),
      clean('New')
    ].join(',') + '\n';

    fs.appendFileSync(CSV_FILE, row, 'utf-8');
    console.log(`[GoogleSheetsService] Synced lead ${lead.id} to leads.csv`);

    // If Google Sheet Webhook is set in environment, post to it
    const sheetWebhook = process.env.GOOGLE_SHEET_WEBHOOK_URL;
    if (sheetWebhook) {
      await axios.post(sheetWebhook, {
        id: lead.id,
        date: new Date(lead.createdAt).toLocaleString(),
        channel: lead.channel,
        name: data.name,
        phone: data.phone,
        service: data.service,
        budget: data.budget || 'N/A',
        notes: data.notes
      });
      console.log(`[GoogleSheetsService] Synced lead ${lead.id} to Google Sheets Webhook`);
    }
  } catch (err) {
    console.error('[GoogleSheetsService] Sync error:', err.message);
  }
}

function getCsvPath() {
  ensureCsv();
  return CSV_FILE;
}

module.exports = {
  syncLeadToSheets,
  getCsvPath
};

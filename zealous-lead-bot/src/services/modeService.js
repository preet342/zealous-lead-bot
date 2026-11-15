const fs = require('fs');
const path = require('path');

const MODE_FILE = path.join(__dirname, '../../data/botMode.json');

// Modes:
// 'sales_closer': Ghoom-fir ke name & phone lena + automatic lead qualification & follow-up
// 'normal_chat': 100% normal conversation, helpful advice, creative discussion, zero lead pressure
// 'personal_human': 100% personal human friend / companion, zero business, never asks for leads/numbers, super familiar real human talk
const VALID_MODES = ['sales_closer', 'normal_chat', 'personal_human'];
const DEFAULT_MODE = 'sales_closer';

function getBotMode() {
  try {
    if (fs.existsSync(MODE_FILE)) {
      const data = JSON.parse(fs.readFileSync(MODE_FILE, 'utf8'));
      if (data && VALID_MODES.includes(data.mode)) {
        return data.mode;
      }
    }
  } catch (err) {
    console.error('[ModeService] Error reading mode:', err.message);
  }
  return DEFAULT_MODE;
}

function setBotMode(newMode) {
  if (!VALID_MODES.includes(newMode)) {
    throw new Error('Invalid bot mode. Must be "sales_closer", "normal_chat", or "personal_human".');
  }
  try {
    const dir = path.dirname(MODE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MODE_FILE, JSON.stringify({ mode: newMode, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
    console.log(`[ModeService] Bot mode updated to: ${newMode}`);
    return newMode;
  } catch (err) {
    console.error('[ModeService] Error writing mode:', err.message);
    throw err;
  }
}

module.exports = {
  getBotMode,
  setBotMode
};

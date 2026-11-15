const fs = require('fs');
const path = require('path');
const whatsappQr = require('../channels/whatsappQr');

const SCHEDULE_FILE = path.join(__dirname, '../../data/scheduledDrips.json');

// In-memory active drip queue
let activeDrip = {
  id: null,
  title: 'Idle',
  status: 'idle', // 'idle' | 'running' | 'paused' | 'completed' | 'stopped'
  intervalSeconds: 60,
  message: '',
  imageUrl: null,
  pdfUrl: null,
  pdfFileName: null,
  recipients: [],
  currentIndex: 0,
  timerHandle: null,
  startedAt: null,
  nextSendAt: null,
  lastSentPhone: null
};

// Scheduler background loop
let schedulerTimer = null;

function loadScheduledDrips() {
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[DripService] Error reading scheduled drips:', e.message);
  }
  return [];
}

function saveScheduledDrips(drips) {
  try {
    const dir = path.dirname(SCHEDULE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(drips, null, 2), 'utf8');
  } catch (e) {
    console.error('[DripService] Error writing scheduled drips:', e.message);
  }
}

function getScheduledDrips(includeAll = false) {
  const all = loadScheduledDrips();
  if (includeAll) return all;
  return all
    .filter(d => d.status === 'pending' || d.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}

function cancelScheduledDrip(id) {
  const all = loadScheduledDrips();
  const updated = all.map(d => {
    if (d.id === id) {
      return { ...d, status: 'cancelled' };
    }
    return d;
  });
  saveScheduledDrips(updated);
  console.log(`[DripService] Cancelled scheduled drip ${id}`);
  return true;
}

/**
 * Schedule a drip campaign for a future date/time
 */
function scheduleDrip({ title = 'WhatsApp Drip Campaign', recipients = [], message, imageUrl, pdfUrl, pdfFileName, intervalSeconds = 60, scheduledAt, scheduledTime }) {
  const targetTime = scheduledAt || scheduledTime;
  if (!targetTime) {
    throw new Error('A scheduled date and time is required.');
  }

  const schedDate = new Date(targetTime);
  if (isNaN(schedDate.getTime())) {
    throw new Error('Invalid scheduled date/time format.');
  }

  if (schedDate.getTime() <= Date.now() + 5000) {
    // If schedule time is right now or past, just start immediately
    return startDrip({ title, recipients, message, imageUrl, pdfUrl, pdfFileName, intervalSeconds });
  }

  // Deduplicate and sanitize numbers
  const sanitizedPhones = Array.from(new Set(
    recipients
      .map(r => (typeof r === 'string' ? r : (r.phone || r.id || '')).replace(/[^0-9]/g, ''))
      .filter(p => p.length >= 8)
  ));

  if (sanitizedPhones.length === 0) {
    throw new Error('No valid recipient phone numbers provided.');
  }

  const job = {
    id: `SCHED-${Date.now()}`,
    title,
    message: message || '',
    imageUrl: imageUrl || null,
    pdfUrl: pdfUrl || null,
    pdfFileName: pdfFileName || 'Document.pdf',
    intervalSeconds: Math.max(Number(intervalSeconds) || 60, 20),
    recipients: sanitizedPhones,
    recipientsCount: sanitizedPhones.length,
    scheduledAt: schedDate.toISOString(),
    scheduledTime: schedDate.toISOString(),
    createdAt: new Date().toISOString(),
    status: 'scheduled'
  };

  const all = loadScheduledDrips();
  all.push(job);
  saveScheduledDrips(all);

  console.log(`[DripService] Scheduled drip "${title}" for ${schedDate.toLocaleString()} (${sanitizedPhones.length} members).`);
  return job;
}

/**
 * Background runner that checks for due scheduled drips every 20 seconds
 */
function initScheduledDripChecker() {
  if (schedulerTimer) clearInterval(schedulerTimer);

  schedulerTimer = setInterval(() => {
    try {
      // If currently running an active drip, wait until it finishes
      if (activeDrip.status === 'running') return;

      const all = loadScheduledDrips();
      const now = Date.now();
      const dueJobIndex = all.findIndex(d => (d.status === 'pending' || d.status === 'scheduled') && new Date(d.scheduledAt).getTime() <= now);

      if (dueJobIndex !== -1) {
        const job = all[dueJobIndex];
        console.log(`[DripService] ⏰ Due scheduled drip triggered: "${job.title}"! Launching now...`);
        job.status = 'triggered';
        job.triggeredAt = new Date().toISOString();
        saveScheduledDrips(all);

        startDrip({
          title: job.title,
          recipients: job.recipients,
          message: job.message,
          imageUrl: job.imageUrl,
          pdfUrl: job.pdfUrl,
          pdfFileName: job.pdfFileName,
          intervalSeconds: job.intervalSeconds
        });
      }
    } catch (err) {
      console.error('[DripService] Error in scheduled drip checker:', err.message);
    }
  }, 20000);
}

// Auto-start checker on module load
initScheduledDripChecker();

function getDripStatus() {
  const total = activeDrip.recipients.length;
  const sent = activeDrip.recipients.filter(r => r.status === 'sent').length;
  const failed = activeDrip.recipients.filter(r => r.status === 'failed').length;
  const remaining = total - (sent + failed);
  const percent = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;

  return {
    id: activeDrip.id,
    title: activeDrip.title,
    status: activeDrip.status,
    intervalSeconds: activeDrip.intervalSeconds,
    total,
    sent,
    failed,
    remaining,
    percent,
    currentIndex: activeDrip.currentIndex,
    startedAt: activeDrip.startedAt,
    nextSendAt: activeDrip.nextSendAt,
    lastSentPhone: activeDrip.lastSentPhone,
    imageUrl: activeDrip.imageUrl,
    pdfUrl: activeDrip.pdfUrl,
    pdfFileName: activeDrip.pdfFileName,
    recipientsPreview: activeDrip.recipients.slice(Math.max(0, activeDrip.currentIndex - 2), activeDrip.currentIndex + 5)
  };
}

/**
 * Start a new drip campaign with safe 1-minute interval anti-ban protection
 */
function startDrip({ title = 'WhatsApp Drip Campaign', recipients = [], message, imageUrl, pdfUrl, pdfFileName, intervalSeconds = 60 }) {
  if (!message && !imageUrl && !pdfUrl) {
    throw new Error('Drip campaign requires a message, image, or PDF document.');
  }

  // Deduplicate and sanitize numbers
  const sanitizedPhones = Array.from(new Set(
    recipients
      .map(r => (typeof r === 'string' ? r : (r.phone || r.id || '')).replace(/[^0-9]/g, ''))
      .filter(p => p.length >= 8)
  ));

  if (sanitizedPhones.length === 0) {
    throw new Error('No valid recipient phone numbers provided.');
  }

  // If already running, cancel previous timer
  if (activeDrip.timerHandle) {
    clearTimeout(activeDrip.timerHandle);
  }

  activeDrip = {
    id: `DRIP-${Date.now()}`,
    title,
    status: 'running',
    intervalSeconds: Math.max(Number(intervalSeconds) || 60, 20), // Minimum 20s for safety
    message: message || '',
    imageUrl: imageUrl || null,
    pdfUrl: pdfUrl || null,
    pdfFileName: pdfFileName || 'Document.pdf',
    recipients: sanitizedPhones.map(phone => ({
      phone,
      status: 'pending',
      sentAt: null,
      error: null
    })),
    currentIndex: 0,
    timerHandle: null,
    startedAt: new Date().toISOString(),
    nextSendAt: new Date().toISOString(),
    lastSentPhone: null
  };

  console.log(`[DripService] Started drip campaign "${title}" for ${sanitizedPhones.length} recipients. Interval: ~${activeDrip.intervalSeconds}s`);

  // Execute immediately with first recipient
  processNextDripItem();

  return getDripStatus();
}

/**
 * Process single recipient, then schedule next with randomized human jitter
 */
async function processNextDripItem() {
  if (activeDrip.status !== 'running') return;

  if (activeDrip.currentIndex >= activeDrip.recipients.length) {
    activeDrip.status = 'completed';
    activeDrip.nextSendAt = null;
    console.log(`[DripService] Campaign "${activeDrip.title}" completed successfully!`);
    return;
  }

  const currentItem = activeDrip.recipients[activeDrip.currentIndex];
  activeDrip.lastSentPhone = currentItem.phone;

  try {
    // 1. Simulate real human typing for 2.5 - 4 seconds before sending
    await whatsappQr.simulateTyping(currentItem.phone, 3000);

    // 2. Deliver PDF Document, Image, or Text Message
    let success = false;
    if (activeDrip.pdfUrl) {
      success = await whatsappQr.sendWhatsAppQrDocument(
        currentItem.phone, 
        activeDrip.pdfUrl, 
        activeDrip.pdfFileName || 'Document.pdf', 
        activeDrip.message || ''
      );
    } else if (activeDrip.imageUrl) {
      success = await whatsappQr.sendWhatsAppQrImage(
        currentItem.phone, 
        activeDrip.imageUrl, 
        activeDrip.message || ''
      );
    } else {
      success = await whatsappQr.sendWhatsAppQrMessage(currentItem.phone, activeDrip.message);
    }

    if (success) {
      currentItem.status = 'sent';
      currentItem.sentAt = new Date().toISOString();
      console.log(`[DripService] [${activeDrip.currentIndex + 1}/${activeDrip.recipients.length}] Sent to +${currentItem.phone}`);
    } else {
      currentItem.status = 'failed';
      currentItem.error = 'Delivery returned false (socket offline)';
    }
  } catch (err) {
    currentItem.status = 'failed';
    currentItem.error = err.message;
    console.error(`[DripService] Failed for +${currentItem.phone}:`, err.message);
  }

  activeDrip.currentIndex++;

  // If there are more recipients, schedule next with natural human jitter (+/- 8s)
  if (activeDrip.currentIndex < activeDrip.recipients.length && activeDrip.status === 'running') {
    const jitter = Math.floor(Math.random() * 16000) - 8000; // -8s to +8s jitter
    const delayMs = Math.max(20000, (activeDrip.intervalSeconds * 1000) + jitter);
    
    activeDrip.nextSendAt = new Date(Date.now() + delayMs).toISOString();
    activeDrip.timerHandle = setTimeout(processNextDripItem, delayMs);
  } else if (activeDrip.currentIndex >= activeDrip.recipients.length) {
    activeDrip.status = 'completed';
    activeDrip.nextSendAt = null;
    console.log(`[DripService] Drip campaign finished.`);
  }
}

function pauseDrip() {
  if (activeDrip.status === 'running') {
    if (activeDrip.timerHandle) clearTimeout(activeDrip.timerHandle);
    activeDrip.status = 'paused';
    activeDrip.nextSendAt = null;
    console.log(`[DripService] Campaign paused.`);
  }
  return getDripStatus();
}

function resumeDrip() {
  if (activeDrip.status === 'paused') {
    activeDrip.status = 'running';
    console.log(`[DripService] Campaign resumed.`);
    processNextDripItem();
  }
  return getDripStatus();
}

function stopDrip() {
  if (activeDrip.timerHandle) clearTimeout(activeDrip.timerHandle);
  activeDrip.status = 'stopped';
  activeDrip.nextSendAt = null;
  console.log(`[DripService] Campaign stopped.`);
  return getDripStatus();
}

module.exports = {
  startDrip,
  scheduleDrip,
  getScheduledDrips,
  cancelScheduledDrip,
  pauseDrip,
  resumeDrip,
  stopDrip,
  getDripStatus
};

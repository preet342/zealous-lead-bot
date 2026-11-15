const fs = require('fs');
const path = require('path');
const localtunnel = require('localtunnel');

const PUBLIC_URL_FILE = path.join(__dirname, '../../data/public_url.txt');
let currentTunnel = null;
let publicWebhookUrl = null;

function getPublicUrl() {
  try {
    if (fs.existsSync(PUBLIC_URL_FILE)) {
      const saved = fs.readFileSync(PUBLIC_URL_FILE, 'utf8').trim();
      if (saved && saved.startsWith('http')) {
        return saved;
      }
    }
  } catch (e) {}

  if (publicWebhookUrl) {
    return publicWebhookUrl.replace(/\/webhook$/, '');
  }
  return null;
}

function setPublicUrl(url) {
  try {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    const dir = path.dirname(PUBLIC_URL_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PUBLIC_URL_FILE, cleanUrl, 'utf8');
    publicWebhookUrl = `${cleanUrl}/webhook`;
    console.log(`[TunnelService] Saved public URL: ${cleanUrl}`);
  } catch (e) {
    console.error('[TunnelService] Error saving public URL:', e.message);
  }
}

async function startTunnel(port = 3000) {
  try {
    const tunnel = await localtunnel({ port });
    currentTunnel = tunnel;
    publicWebhookUrl = `${tunnel.url}/webhook`;
    setPublicUrl(tunnel.url);

    console.log(`=================================================`);
    console.log(`🌐 Public Webhook URL: ${publicWebhookUrl}`);
    console.log(`=================================================`);

    tunnel.on('close', () => {
      console.log('[Tunnel] Webhook tunnel closed. Reconnecting in 3s...');
      publicWebhookUrl = null;
      setTimeout(() => startTunnel(port), 3000);
    });

    tunnel.on('error', (err) => {
      console.error('[Tunnel] Error:', err.message);
      publicWebhookUrl = null;
    });

    return publicWebhookUrl;
  } catch (err) {
    console.error('[Tunnel] Failed to start tunnel:', err.message);
    setTimeout(() => startTunnel(port), 5000);
    return null;
  }
}

function getWebhookUrl() {
  const base = getPublicUrl();
  return base ? `${base}/webhook` : publicWebhookUrl;
}

module.exports = {
  startTunnel,
  getWebhookUrl,
  getPublicUrl,
  setPublicUrl
};

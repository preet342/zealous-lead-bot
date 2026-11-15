const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const tunnelService = require('../src/services/tunnelService');

const isWindows = process.platform === 'win32';
const BIN_DIR = path.join(__dirname, '../bin');
const CLOUDFLARED_BIN = path.join(BIN_DIR, isWindows ? 'cloudflared.exe' : 'cloudflared');

const DOWNLOAD_URL = isWindows
  ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
  : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';

function ensureCloudflared() {
  // 1. Check if cloudflared is already in PATH
  try {
    const version = execSync('cloudflared --version', { stdio: 'pipe' }).toString();
    console.log(`[Cloudflare] Found global cloudflared: ${version.trim()}`);
    return 'cloudflared';
  } catch (e) {
    // Not in PATH, check local bin directory
  }

  if (fs.existsSync(CLOUDFLARED_BIN)) {
    return CLOUDFLARED_BIN;
  }

  // 2. Download cloudflared automatically
  console.log('⬇️ [Cloudflare] cloudflared not found. Downloading official binary from Cloudflare...');
  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

  try {
    // Use curl which is built-in on Windows 10/11 and Linux
    execSync(`curl -L -o "${CLOUDFLARED_BIN}" "${DOWNLOAD_URL}"`, { stdio: 'inherit' });
    if (!isWindows) {
      execSync(`chmod +x "${CLOUDFLARED_BIN}"`);
    }
    console.log('✅ [Cloudflare] Successfully downloaded cloudflared binary!');
    return CLOUDFLARED_BIN;
  } catch (err) {
    console.error('❌ [Cloudflare] Failed to download cloudflared with curl:', err.message);
    throw err;
  }
}

async function startCloudflareTunnel(targetPort = 3000) {
  const binPath = ensureCloudflared();
  console.log(`🌐 [Cloudflare] Launching secure HTTPS tunnel pointing to http://localhost:${targetPort}...`);

  const child = spawn(binPath, ['tunnel', '--url', `http://localhost:${targetPort}`], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let detectedUrl = null;

  function handleOutput(data) {
    const text = data.toString();
    // Look for https://*.trycloudflare.com
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !detectedUrl) {
      detectedUrl = match[0];
      tunnelService.setPublicUrl(detectedUrl);

      console.log('\n================================================================');
      console.log('🎉 BWB MEDIA IS NOW 100% LIVE ON THE INTERNET! (CLOUDFLARE)');
      console.log('================================================================');
      console.log(`🔗 Public Web Dashboard:  ${detectedUrl}/login`);
      console.log(`📱 WhatsApp QR Scanner:   ${detectedUrl}/qr`);
      console.log(`📨 Live Unified Inbox:    ${detectedUrl}/inbox`);
      console.log(`📊 CRM Leads Studio:      ${detectedUrl}/leads`);
      console.log(`👥 WhatsApp Groups Studio: ${detectedUrl}/groups`);
      console.log(`⚡ Meta / FB Webhook URL: ${detectedUrl}/webhook`);
      console.log('----------------------------------------------------------------');
      console.log('🔑 Login Credentials:');
      console.log('   UID:      biswa342');
      console.log('   Password: Biswa4404@');
      console.log('================================================================');
      console.log('🛡️ Zero Card Needed • 100% Free Forever • Global High-Speed CDN');
      console.log('================================================================\n');
    }
  }

  child.stdout.on('data', handleOutput);
  child.stderr.on('data', handleOutput);

  child.on('error', (err) => {
    console.error('[Cloudflare] Tunnel process error:', err.message);
  });

  child.on('close', (code) => {
    console.log(`[Cloudflare] Tunnel closed with code ${code}. Reconnecting in 5s...`);
    setTimeout(() => startCloudflareTunnel(targetPort), 5000);
  });

  return child;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  startCloudflareTunnel(port);
}

module.exports = {
  startCloudflareTunnel
};

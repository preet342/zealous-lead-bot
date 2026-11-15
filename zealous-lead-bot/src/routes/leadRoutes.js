const express = require('express');
const router = express.Router();
const leadService = require('../services/leadService');
const whatsappQr = require('../channels/whatsappQr');
const { renderSidebarLayout } = require('../views/sidebarLayout');

// API endpoint returning leads JSON
router.get('/api/leads', (req, res) => {
  const leads = leadService.getAllLeads();
  res.json({
    success: true,
    count: leads.length,
    leads
  });
});

// API endpoint for WhatsApp QR connection status
router.get('/api/qr-status', (req, res) => {
  res.json(whatsappQr.getQrStatus());
});

// API endpoint to Disconnect / Logout WhatsApp
router.post('/api/qr-logout', async (req, res) => {
  const result = await whatsappQr.logoutWhatsAppQr();
  res.json({ success: result });
});

// Dedicated WhatsApp QR Scan Page
router.get('/qr', (req, res) => {
  const qrStatus = whatsappQr.getQrStatus();
  
  const contentHtml = `
  <style>
    .qr-wrapper { display: flex; justify-content: center; align-items: center; min-height: 70vh; }
    .box { background: #1e293b; border: 1px solid #334155; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); padding: 36px; max-width: 480px; width: 100%; text-align: center; }
    .box h2 { color: white; font-size: 22px; margin: 0 0 8px 0; }
    .box p { color: #94a3b8; font-size: 14px; margin: 0 0 24px 0; }
    .qr-container { padding: 20px; background: #0f172a; border-radius: 12px; display: inline-flex; border: 2px dashed #38bdf8; min-height: 260px; min-width: 260px; align-items: center; justify-content: center; }
    .qr-container img { width: 260px; height: 260px; border-radius: 8px; }
    .status-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-weight: 700; font-size: 14px; margin-top: 16px; }
    .connected { background: #064e3b; color: #34d399; border: 1px solid #059669; }
    .waiting { background: #78350f; color: #fbbf24; border: 1px solid #d97706; }
    .disconnected { background: #7f1d1d; color: #f87171; border: 1px solid #dc2626; }
    .disconnect-btn { display: inline-block; margin-top: 15px; background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; transition: background 0.2s; }
    .disconnect-btn:hover { background: #dc2626; }
    .steps { text-align: left; background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 14px 18px; margin-top: 24px; font-size: 13px; color: #cbd5e1; }
    .steps ol { margin: 6px 0 0 18px; padding: 0; }
    .steps li { margin-bottom: 6px; }
    .nav-btn { display: inline-block; margin-top: 20px; text-decoration: none; color: #38bdf8; font-weight: 600; font-size: 14px; }
  </style>

  <div class="qr-wrapper">
    <div class="box">
      <h2>📱 Connect WhatsApp (QR Scan)</h2>
      <p>Scan with your phone to start 24x7 AI auto-reply and lead capture.</p>

      <div class="qr-container" id="qr-box">
        ${qrStatus.status === 'connected' 
          ? '<div style="color:#34d399; font-size:48px;">✅</div>' 
          : (qrStatus.qrDataUrl 
              ? `<img src="${qrStatus.qrDataUrl}" alt="WhatsApp QR Code" />` 
              : '<span style="color:#94a3b8;">Generating QR code...</span>')}
      </div>

      <div>
        <span id="badge" class="status-badge ${qrStatus.status === 'connected' ? 'connected' : (qrStatus.status === 'qr_ready' ? 'waiting' : 'disconnected')}">
          ${qrStatus.status === 'connected' ? `Connected (+${qrStatus.phone || 'Active'})` : (qrStatus.status === 'qr_ready' ? 'Scan QR Code Now' : 'Connecting...')}
        </span>
      </div>

      <div id="disconnect-container" style="display: ${qrStatus.status === 'connected' ? 'block' : 'none'};">
        <button class="disconnect-btn" onclick="disconnectWhatsApp()">❌ Disconnect / Logout WhatsApp</button>
      </div>

      <div class="steps">
        <strong>Steps to Connect:</strong>
        <ol>
          <li>Open WhatsApp on your phone.</li>
          <li>Tap <strong>Settings (or ⋮) > Linked Devices</strong>.</li>
          <li>Tap <strong>Link a Device</strong> and point your camera here.</li>
        </ol>
      </div>

      <a href="/leads" class="nav-btn">← Back to Leads Dashboard</a>
    </div>
  </div>

  <script>
    async function disconnectWhatsApp() {
      if (!confirm('Are you sure you want to disconnect this WhatsApp number?')) return;
      document.getElementById('badge').innerText = 'Disconnecting...';
      await fetch('/api/qr-logout', { method: 'POST' });
      setTimeout(() => location.reload(), 1500);
    }

    // Auto-refresh status every 2 seconds
    setInterval(async () => {
      try {
        const res = await fetch('/api/qr-status');
        const data = await res.json();
        const badge = document.getElementById('badge');
        const box = document.getElementById('qr-box');
        const disconnectBox = document.getElementById('disconnect-container');

        if (data.status === 'connected') {
          badge.className = 'status-badge connected';
          badge.innerText = 'Connected (+' + (data.phone || 'Active') + ')';
          box.innerHTML = '<div style="color:#34d399; font-size:60px;">✅<br><span style="font-size:16px; font-weight:600; color:#34d399;">WhatsApp Connected & Active!</span></div>';
          disconnectBox.style.display = 'block';
        } else if (data.status === 'qr_ready' && data.qrDataUrl) {
          badge.className = 'status-badge waiting';
          badge.innerText = 'Scan QR Code Now';
          box.innerHTML = '<img src="' + data.qrDataUrl + '" alt="WhatsApp QR Code" />';
          disconnectBox.style.display = 'none';
        } else if (data.status === 'disconnected') {
          disconnectBox.style.display = 'none';
        }
      } catch (e) {}
    }, 2000);
  </script>
  `;

  const html = renderSidebarLayout({
    title: 'Connect WhatsApp (QR Scan)',
    activeNav: 'qr',
    contentHtml
  });

  res.send(html);
});

// Real-time Visual Lead Dashboard
router.get('/leads', (req, res) => {
  const leads = leadService.getAllLeads();
  const qrStatus = whatsappQr.getQrStatus();
  
  const rows = leads.map((l, i) => `
    <tr>
      <td style="padding:12px 14px; border-bottom:1px solid #334155; color:#94a3b8;">${i + 1}</td>
      <td style="padding:12px 14px; border-bottom:1px solid #334155; font-weight:600; color:white;">${l.leadData.name || 'N/A'}</td>
      <td style="padding:12px 14px; border-bottom:1px solid #334155; color:#38bdf8; font-weight:700;">${l.leadData.phone || 'N/A'}</td>
      <td style="padding:12px 14px; border-bottom:1px solid #334155;">
        <span style="display:inline-block; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:bold; background:${getChannelBadgeColor(l.channel)}; color:#fff;">
          ${l.channel.toUpperCase()}
        </span>
      </td>
      <td style="padding:12px 14px; border-bottom:1px solid #334155; color:#cbd5e1;">${l.leadData.service || 'N/A'}</td>
      <td style="padding:12px 14px; border-bottom:1px solid #334155; color:#94a3b8; font-size:13px;">${l.leadData.notes || 'None'}</td>
      <td style="padding:12px 14px; border-bottom:1px solid #334155; color:#64748b; font-size:12px;">${new Date(l.createdAt).toLocaleString()}</td>
    </tr>
  `).join('');

  const contentHtml = `
  <style>
    .card { background: #1e293b; border-radius: 14px; border: 1px solid #334155; padding: 24px; max-width: 1200px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 20px; flex-wrap:wrap; gap:10px; }
    .header h2 { margin: 0; color: white; font-size: 20px; }
    .btn-group { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn { text-decoration: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .btn-primary { background: #0284c7; color: white; }
    .btn-primary:hover { background: #0369a1; }
    .btn-qr { background: #16a34a; color: white; }
    .btn-qr:hover { background: #15803d; }
    .stats { display: flex; gap: 15px; margin-bottom: 24px; flex-wrap: wrap; }
    .stat-box { background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 14px 22px; text-align: center; min-width: 120px; }
    .stat-number { font-size: 26px; font-weight: 800; color: white; }
    .stat-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    .table-responsive { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th { background: #0f172a88; padding: 12px 14px; font-size: 12px; color: #94a3b8; text-transform: uppercase; border-bottom: 1px solid #334155; }
    tr:hover td { background: #0f172a44; }
  </style>

  <div class="card">
    <div class="header">
      <div>
        <h2>🚀 Omnichannel Captured Leads</h2>
        <small style="color:#94a3b8;">Unified AI Lead Pipeline • WhatsApp • Instagram • Facebook • Telegram</small>
      </div>
      <div class="btn-group">
        <a href="/download/leads.csv" class="btn btn-primary" style="background:#059669;">📥 Export CSV</a>
        <button onclick="location.reload()" class="btn btn-primary">🔄 Refresh</button>
      </div>
    </div>
    
    <div class="stats">
      <div class="stat-box">
        <div class="stat-number">${leads.length}</div>
        <div class="stat-label">Total Leads</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${leads.filter(l => l.channel === 'whatsapp' || l.channel === 'whatsapp_qr').length}</div>
        <div class="stat-label">WhatsApp</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${leads.filter(l => l.channel === 'instagram').length}</div>
        <div class="stat-label">Instagram</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${leads.filter(l => l.channel === 'facebook').length}</div>
        <div class="stat-label">Facebook</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${leads.filter(l => l.channel === 'telegram').length}</div>
        <div class="stat-label">Telegram</div>
      </div>
    </div>

    ${leads.length === 0 ? '<p style="text-align:center; color:#94a3b8; padding:40px 0;">No leads captured yet. Start chatting on any connected channel!</p>' : `
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Phone / Contact</th>
            <th>Channel</th>
            <th>Service Interested</th>
            <th>Requirements</th>
            <th>Received At</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
    `}
  </div>
  `;

  const html = renderSidebarLayout({
    title: 'Omnichannel Leads CRM',
    activeNav: 'leads',
    contentHtml
  });

  res.send(html);
});

function getChannelBadgeColor(channel) {
  switch (channel) {
    case 'whatsapp': return '#22c55e'; // Green (Cloud API)
    case 'whatsapp_qr': return '#15803d'; // Dark Green (QR Scanned)
    case 'instagram': return '#ec4899'; // Pink/Purple
    case 'facebook': return '#2563eb'; // Blue
    case 'telegram': return '#0284c7'; // Sky Blue
    default: return '#64748b';
  }
}

module.exports = router;

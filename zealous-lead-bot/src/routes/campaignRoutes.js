const express = require('express');
const router = express.Router();
const modeService = require('../services/modeService');
const campaignService = require('../services/campaignService');
const leadService = require('../services/leadService');
const { renderSidebarLayout } = require('../views/sidebarLayout');

// API: Get Current Bot Mode
router.get('/api/bot-mode', (req, res) => {
  res.json({ success: true, mode: modeService.getBotMode() });
});

// API: Set Bot Mode
router.post('/api/bot-mode', (req, res) => {
  const { mode } = req.body;
  try {
    const updated = modeService.setBotMode(mode);
    const label = updated === 'sales_closer' 
      ? 'Lead Closer (Smart Lead Capture)' 
      : (updated === 'personal_human' ? 'Personal Friend (Zero Business / Pure Human)' : 'Creative Advisor (Helpful & Friendly)');
    res.json({ success: true, mode: updated, message: `Bot mode changed to ${label}` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// API: Send Test Campaign Message / Image / PDF
router.post('/api/campaign/test', async (req, res) => {
  try {
    const { channel, to, message, imageUrl, pdfUrl, pdfFileName } = req.body;
    const result = await campaignService.sendTestCampaign({ channel, to, message, imageUrl, pdfUrl, pdfFileName });
    res.json({ success: result.success, error: result.error, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Broadcast Campaign to All Leads
router.post('/api/campaign/broadcast', async (req, res) => {
  try {
    const { campaignTitle, channel, targetAudience, message, imageUrl, pdfUrl, pdfFileName } = req.body;
    const result = await campaignService.broadcastCampaign({
      campaignTitle,
      channel,
      targetAudience,
      message,
      imageUrl,
      pdfUrl,
      pdfFileName
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Campaign History
router.get('/api/campaign/history', (req, res) => {
  res.json({ success: true, history: campaignService.getCampaignHistory() });
});

// Web UI: Campaign Studio & Mode Switcher Page
router.get('/campaigns', (req, res) => {
  const currentMode = modeService.getBotMode();
  const leads = leadService.getAllLeads();
  const history = campaignService.getCampaignHistory();

  let modeTitle = '💬 Active Mode: Creative Advisor (Helpful & Friendly Companion)';
  let modeBadge = 'CREATIVE ADVISOR';
  let modeBorder = '#0284c7';
  let modeDesc = 'Bot aam insaan ki tarah natural creative consultancy karega, video & ads ke ideas dega bina kisi direct pressure ke.';

  if (currentMode === 'sales_closer') {
    modeTitle = '🎯 Active Mode: Lead Closer (Smart Capture & Follow-up)';
    modeBadge = 'LEAD CLOSER';
    modeBorder = '#059669';
    modeDesc = 'Bot consultancy dene ke baad ghoom-fir kar client ka Naam aur Mobile number naturally nikalega, lead save karega aur follow-up trigger karega.';
  } else if (currentMode === 'personal_human') {
    modeTitle = '🧑‍🤝‍🧑 Active Mode: Personal Friend (Zero Business / 100% Real Person)';
    modeBadge = 'PERSONAL FRIEND';
    modeBorder = '#ec4899';
    modeDesc = 'Pura 100% aam insaan/dost ki tarah baat karega. Koi business pitch nahi, kabhi koi phone number ya lead nahi maangega, aur pichhli baatein yaad rakhega!';
  }

  const contentHtml = `
  <style>
    .container { max-width: 1100px; margin: 0 auto; }
    
    /* Mode Switcher Banner */
    .mode-card { background: linear-gradient(135deg, #1e293b, #0f172a); border-radius: 16px; border: 2px solid ${modeBorder}; padding: 24px 28px; margin-bottom: 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px; }
    .mode-info h2 { margin: 0 0 6px 0; font-size: 20px; color: white; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .mode-badge { font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid #0284c7; }
    .mode-info p { margin: 0; color: #94a3b8; font-size: 14px; max-width: 650px; line-height: 1.5; }
    .mode-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn-toggle { padding: 10px 16px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; border: none; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
    .btn-toggle-active-closer { background: #059669; color: white; box-shadow: 0 4px 15px rgba(5,150,105,0.4); }
    .btn-toggle-active-chat { background: #0284c7; color: white; box-shadow: 0 4px 15px rgba(2,132,199,0.4); }
    .btn-toggle-active-human { background: #db2777; color: white; box-shadow: 0 4px 15px rgba(219,39,119,0.4); }
    .btn-toggle-inactive { background: #334155; color: #94a3b8; }
    .btn-toggle-inactive:hover { background: #475569; color: white; }

    /* Grid for Campaign Form & Preview */
    .grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 24px; }
    @media(max-width: 850px) { .grid { grid-template-columns: 1fr; } }
    
    .panel { background: #1e293b; border-radius: 14px; border: 1px solid #334155; padding: 24px; }
    .panel h3 { margin: 0 0 16px 0; font-size: 18px; color: white; border-bottom: 1px solid #334155; padding-bottom: 12px; }
    
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px; }
    .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 10px 14px; background: #0f172a; border: 1px solid #475569; border-radius: 8px; color: white; font-size: 14px; outline: none; }
    .form-group input:focus, .form-group textarea:focus, .form-group select:focus { border-color: #38bdf8; }
    .form-help { font-size: 11px; color: #64748b; margin-top: 4px; }

    .btn { padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; transition: background 0.2s; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; justify-content: center; }
    .btn-primary { background: #0284c7; color: white; }
    .btn-primary:hover { background: #0369a1; }
    .btn-success { background: #16a34a; color: white; }
    .btn-success:hover { background: #15803d; }
    .btn-warning { background: #d97706; color: white; }
    .btn-warning:hover { background: #b45309; }

    /* Phone preview */
    .preview-card { background: #0b141a; border-radius: 14px; border: 1px solid #2a3942; overflow: hidden; max-width: 380px; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .preview-header { background: #202c33; padding: 12px 16px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #2a3942; font-size: 13px; font-weight: 600; color: #e9edef; }
    .preview-body { padding: 16px; min-height: 200px; display: flex; flex-direction: column; justify-content: flex-end; }
    .bubble { background: #005c4b; color: #e9edef; border-radius: 8px 0px 8px 8px; padding: 10px; max-width: 90%; align-self: flex-end; font-size: 13px; line-height: 1.4; word-break: break-word; }
    .bubble img { width: 100%; max-height: 180px; object-fit: cover; border-radius: 6px; margin-bottom: 6px; }
    .preview-doc-card { display: flex; align-items: center; gap: 10px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; }

    /* History table */
    .table-container { margin-top: 30px; background: #1e293b; border-radius: 14px; border: 1px solid #334155; padding: 24px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
    th { color: #94a3b8; font-weight: 600; padding: 10px 14px; border-bottom: 1px solid #334155; }
    td { padding: 12px 14px; border-bottom: 1px solid #334155; }
  </style>

  <div class="container">
    <!-- MODE SWITCHER BANNER (3 MODES) -->
    <div class="mode-card">
      <div class="mode-info">
        <h2>
          ${modeTitle}
          <span class="mode-badge">${modeBadge}</span>
        </h2>
        <p>${modeDesc}</p>
      </div>
      <div class="mode-actions">
        <button class="btn-toggle ${currentMode === 'personal_human' ? 'btn-toggle-active-human' : 'btn-toggle-inactive'}" onclick="setBotMode('personal_human')">
          🧑‍🤝‍🧑 Real Friend (Zero Sales)
        </button>
        <button class="btn-toggle ${currentMode === 'normal_chat' ? 'btn-toggle-active-chat' : 'btn-toggle-inactive'}" onclick="setBotMode('normal_chat')">
          💬 Creative Advisor
        </button>
        <button class="btn-toggle ${currentMode === 'sales_closer' ? 'btn-toggle-active-closer' : 'btn-toggle-inactive'}" onclick="setBotMode('sales_closer')">
          🎯 Lead Closer
        </button>
      </div>
    </div>

    <!-- CAMPAIGN STUDIO -->
    <div class="grid">
      <!-- Left: Campaign Form -->
      <div class="panel">
        <h3>📢 Create & Cast Campaign (With Image or PDF Document)</h3>
        
        <form id="campaignForm">
          <div class="form-group">
            <label>Campaign Title (For your reference)</label>
            <input type="text" id="campaignTitle" placeholder="e.g. BWB Media Showreel / Rate Card PDF" required value="Special Offer Broadcast">
          </div>

          <div class="form-group">
            <label>Target Audience & Channel</label>
            <select id="targetChannel">
              <option value="whatsapp_qr">WhatsApp QR (${leads.length} Saved Leads & Chats)</option>
              <option value="telegram">Telegram (All Telegram Prospects)</option>
              <option value="all">Omnichannel (WhatsApp + Telegram)</option>
            </select>
          </div>

          <div class="form-group">
            <label>Media Attachment Type</label>
            <select id="mediaType" onchange="toggleMediaInputs()">
              <option value="none">💬 Text Only (No Attachment)</option>
              <option value="image">🖼️ Image (JPEG / PNG URL)</option>
              <option value="pdf">📄 PDF Document (Catalogue / Brochure / Rate Card)</option>
            </select>
          </div>

          <div class="form-group" id="imageInputGroup" style="display:none;">
            <label>Attach Image URL</label>
            <input type="url" id="imageUrl" placeholder="https://example.com/banner.jpg" oninput="updatePreview()">
            <div class="form-help">Enter any public direct image URL.</div>
          </div>

          <div id="pdfInputGroup" style="display:none;">
            <div class="form-group">
              <label>PDF Document URL</label>
              <input type="url" id="pdfUrl" placeholder="https://example.com/bwb_media_portfolio.pdf" oninput="updatePreview()">
              <div class="form-help">Enter direct link to PDF document file.</div>
            </div>
            <div class="form-group">
              <label>Custom PDF File Name</label>
              <input type="text" id="pdfFileName" placeholder="BWB_Media_Portfolio.pdf" value="BWB_Media_Brochure.pdf" oninput="updatePreview()">
            </div>
          </div>

          <div class="form-group">
            <label>Broadcast Message / Caption</label>
            <textarea id="messageText" rows="5" placeholder="Namaste! BWB Media lekar aaya hai exclusive Video Editing starter package..." required oninput="updatePreview()">🔥 *Exclusive Flash Offer from BWB Media!* 🔥

Hamare high-retention video editing plans par flat 30% discount available hai iss hafte!
🎬 Showreel: https://instagram.com/bwbmedia

Kya aap apne channel ya brand ke liye naye reels plan kar rahe hain? Reply karein to claim your slot!</textarea>
          </div>

          <div style="display:flex; gap:12px; margin-top:20px;">
            <button type="button" class="btn btn-warning" style="flex:1;" onclick="openTestModal()">
              📲 Send Test to My Phone
            </button>
            <button type="submit" class="btn btn-success" style="flex:1;">
              🚀 Broadcast to All (${leads.length} Leads)
            </button>
          </div>
        </form>
      </div>

      <!-- Right: Live WhatsApp Phone Preview -->
      <div class="panel">
        <h3>📱 Live Phone Preview (How Clients See It)</h3>
        <div class="preview-card">
          <div class="preview-header">
            <span>🟢 BWB Media Official</span>
          </div>
          <div class="preview-body">
            <div class="bubble">
              <div id="previewImageContainer" style="display:none;">
                <img id="previewImg" src="" alt="Campaign Attachment">
              </div>
              <div id="previewDocContainer" style="display:none;" class="preview-doc-card">
                <span style="font-size:24px;">📄</span>
                <div>
                  <b id="previewDocName" style="color:white; font-size:12px; display:block;">document.pdf</b>
                  <small style="color:#94a3b8; font-size:10px;">PDF Document • Direct Download</small>
                </div>
              </div>
              <div id="previewText" style="white-space: pre-wrap;"></div>
            </div>
          </div>
        </div>

        <div style="margin-top:20px; font-size:12px; color:#94a3b8; text-align:center;">
          🛡️ <b>Safe Cast Engine:</b> Messages are delivered with randomized delays to keep your WhatsApp number 100% safe from spam filters.
        </div>
      </div>
    </div>

    <!-- CAMPAIGN HISTORY -->
    <div class="table-container">
      <h3 style="margin:0 0 14px 0; color:white;">📊 Campaign Broadcast History</h3>
      <table>
        <thead>
          <tr>
            <th>Date & Time</th>
            <th>Campaign Title</th>
            <th>Channel</th>
            <th>Attachment</th>
            <th>Sent</th>
            <th>Failed</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="historyBody">
          ${history.length === 0 ? '<tr><td colspan="7" style="text-align:center; color:#64748b; padding:20px;">No campaigns sent yet. Create your first broadcast above!</td></tr>' : ''}
          ${history.map(h => `
            <tr>
              <td>${new Date(h.timestamp).toLocaleString()}</td>
              <td><b>${h.campaignTitle}</b></td>
              <td>${h.channel}</td>
              <td>
                ${h.pdfUrl ? `<a href="${h.pdfUrl}" target="_blank" style="color:#ec4899; font-weight:600;">📄 ${h.pdfFileName || 'PDF Document'}</a>` : 
                 (h.imageUrl ? `<a href="${h.imageUrl}" target="_blank" style="color:#38bdf8;">🖼️ Photo</a>` : '💬 Text only')}
              </td>
              <td style="color:#34d399; font-weight:700;">✅ ${h.sentCount}</td>
              <td style="color:${h.failedCount > 0 ? '#f87171' : '#94a3b8'};">${h.failedCount}</td>
              <td><span style="background:#064e3b; color:#34d399; padding:3px 8px; border-radius:12px; font-size:11px;">Completed</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

  </div>

  <script>
    function toggleMediaInputs() {
      const type = document.getElementById('mediaType').value;
      document.getElementById('imageInputGroup').style.display = (type === 'image') ? 'block' : 'none';
      document.getElementById('pdfInputGroup').style.display = (type === 'pdf') ? 'block' : 'none';
      updatePreview();
    }

    function updatePreview() {
      const text = document.getElementById('messageText').value;
      const type = document.getElementById('mediaType').value;
      const imgUrl = document.getElementById('imageUrl').value.trim();
      const pdfUrl = document.getElementById('pdfUrl').value.trim();
      const pdfName = document.getElementById('pdfFileName').value.trim() || 'document.pdf';

      document.getElementById('previewText').innerText = text;

      const previewImgContainer = document.getElementById('previewImageContainer');
      const previewImg = document.getElementById('previewImg');
      const previewDocContainer = document.getElementById('previewDocContainer');
      const previewDocName = document.getElementById('previewDocName');

      if (type === 'image' && imgUrl) {
        previewImg.src = imgUrl;
        previewImgContainer.style.display = 'block';
        previewDocContainer.style.display = 'none';
      } else if (type === 'pdf' && pdfUrl) {
        previewDocName.innerText = pdfName;
        previewDocContainer.style.display = 'flex';
        previewImgContainer.style.display = 'none';
      } else {
        previewImgContainer.style.display = 'none';
        previewDocContainer.style.display = 'none';
      }
    }
    updatePreview();

    async function setBotMode(mode) {
      const names = {
        'sales_closer': '🎯 Lead Closer Mode',
        'normal_chat': '💬 Creative Advisor Mode',
        'personal_human': '🧑‍🤝‍🧑 Personal Friend Mode (100% Human, Zero Sales)'
      };
      if (!confirm('Are you sure you want to switch bot mode to ' + (names[mode] || mode) + '?')) return;
      try {
        const res = await fetch('/api/bot-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode })
        });
        const data = await res.json();
        if (data.success) {
          alert('✅ Success: ' + data.message);
          location.reload();
        } else {
          alert('❌ Error: ' + data.error);
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      }
    }

    async function openTestModal() {
      const phone = prompt('Enter your phone number (e.g. 917008872017) to receive a test message with attachment:');
      if (!phone) return;
      
      const channel = document.getElementById('targetChannel').value;
      const message = document.getElementById('messageText').value;
      const type = document.getElementById('mediaType').value;
      const imageUrl = (type === 'image') ? document.getElementById('imageUrl').value.trim() : '';
      const pdfUrl = (type === 'pdf') ? document.getElementById('pdfUrl').value.trim() : '';
      const pdfFileName = (type === 'pdf') ? document.getElementById('pdfFileName').value.trim() : '';

      alert('⏳ Sending test preview to ' + phone + '...');
      try {
        const res = await fetch('/api/campaign/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, to: phone, message, imageUrl, pdfUrl, pdfFileName })
        });
        const data = await res.json();
        if (data.success) {
          alert('🎉 Test delivered successfully! Check your phone.');
        } else {
          alert('❌ Failed to deliver test: ' + (data.error || 'Check server connection'));
        }
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }

    document.getElementById('campaignForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('campaignTitle').value;
      const channel = document.getElementById('targetChannel').value;
      const message = document.getElementById('messageText').value;
      const type = document.getElementById('mediaType').value;
      const imageUrl = (type === 'image') ? document.getElementById('imageUrl').value.trim() : '';
      const pdfUrl = (type === 'pdf') ? document.getElementById('pdfUrl').value.trim() : '';
      const pdfFileName = (type === 'pdf') ? document.getElementById('pdfFileName').value.trim() : '';

      if (!confirm('Are you sure you want to broadcast this campaign to ALL leads?')) return;

      alert('🚀 Broadcast started! Delivery is running with safety delays. Please keep this tab open.');
      try {
        const res = await fetch('/api/campaign/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignTitle: title, channel, targetAudience: 'all', message, imageUrl, pdfUrl, pdfFileName })
        });
        const data = await res.json();
        if (data.success) {
          alert('🎉 Broadcast Finished! Sent: ' + data.result.sentCount + ', Failed: ' + data.result.failedCount);
          location.reload();
        } else {
          alert('❌ Broadcast error: ' + data.error);
        }
      } catch (e) {
        alert('Broadcast failed: ' + e.message);
      }
    });
  </script>
  </div>
  `;

  const html = renderSidebarLayout({
    title: 'Campaign Studio & Bot Modes',
    activeNav: 'campaigns',
    contentHtml
  });

  res.send(html);
});

module.exports = router;

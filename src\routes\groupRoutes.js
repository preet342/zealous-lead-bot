const express = require('express');
const router = express.Router();
const groupExtractorService = require('../services/groupExtractorService');
const dripCampaignService = require('../services/dripCampaignService');
const whatsappQr = require('../channels/whatsappQr');
const { renderSidebarLayout } = require('../views/sidebarLayout');

// API: Get all joined groups
router.get('/api/groups', async (req, res) => {
  try {
    const groups = await groupExtractorService.getAllGroups();
    res.json({ success: true, count: groups.length, groups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get live fresh members for a single group (100% complete list from WhatsApp API with names & country)
router.get('/api/groups/:groupId/live', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await groupExtractorService.getGroupById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found or WhatsApp is disconnected.' });
    }
    res.json({
      success: true,
      group: {
        id: group.id,
        subject: group.subject,
        desc: group.desc || '',
        size: group.participants?.length || 0,
        participants: group.participants || []
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Super Bulk Extraction & Deduplication across multiple or ALL groups
router.post('/api/groups/bulk-extract', async (req, res) => {
  try {
    const { groupIds } = req.body;
    const result = await groupExtractorService.extractBulkGroups(groupIds);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Create a new WhatsApp group natively from dashboard with selected numbers
router.post('/api/groups/create', async (req, res) => {
  try {
    const { title, phones } = req.body;
    if (!title || !phones || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ success: false, error: 'Group title and at least 1 participant phone number are required.' });
    }
    const created = await groupExtractorService.createGroupWithSelected(title, phones);
    res.json({ success: true, group: created, message: `Successfully created WhatsApp Group "${title}" with ${phones.length} members!` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Add selected group participants directly to CRM leads
router.post('/api/groups/add-to-leads', (req, res) => {
  try {
    const { groupSubject, participants } = req.body;
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ success: false, error: 'No participants selected.' });
    }
    const result = groupExtractorService.addParticipantsToLeads(groupSubject, participants);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Export selected contacts in multi-formats (.VCF, .CSV, .TXT, .JSON)
router.post('/api/groups/export-selected', (req, res) => {
  try {
    const { groupSubject, phones, format, membersJson } = req.body;
    
    let members = [];
    if (membersJson) {
      try {
        members = JSON.parse(membersJson);
      } catch (e) {}
    }

    if ((!phones || !Array.isArray(phones) || phones.length === 0) && (!members || members.length === 0)) {
      return res.status(400).send('No contacts provided for export.');
    }

    const exportList = members.length > 0 ? members : phones;
    const cleanFilename = (groupSubject || 'extracted_contacts').replace(/[^a-zA-Z0-9_\-]/g, '_');

    if (format === 'csv') {
      const csvContent = groupExtractorService.generateCsv(groupSubject, exportList);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}_leads.csv"`);
      return res.send(csvContent);
    } else if (format === 'txt') {
      const txtContent = groupExtractorService.generateTxtFromNumbers(exportList);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}_numbers.txt"`);
      return res.send(txtContent);
    } else if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}_leads.json"`);
      return res.json({ success: true, count: exportList.length, data: exportList });
    } else {
      // Default: .VCF
      const vcfContent = groupExtractorService.generateVcf(groupSubject, exportList);
      res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}_contacts.vcf"`);
      return res.send(vcfContent);
    }
  } catch (err) {
    res.status(500).send('Export error: ' + err.message);
  }
});

// Download Group Contacts as .VCF (All members)
router.get('/download/group/:groupId/contacts.vcf', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await groupExtractorService.getGroupById(groupId);
    if (!group) return res.status(404).send('Group not found or not connected to WhatsApp.');

    const vcfContent = groupExtractorService.generateVcf(group.subject, group.participants);
    const cleanFilename = (group.subject || 'contacts').replace(/[^a-zA-Z0-9_\-]/g, '_');

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}_contacts.vcf"`);
    res.send(vcfContent);
  } catch (err) {
    res.status(500).send('Error generating vCard: ' + err.message);
  }
});

// Download Group Contacts as .CSV (All members)
router.get('/download/group/:groupId/contacts.csv', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await groupExtractorService.getGroupById(groupId);
    if (!group) return res.status(404).send('Group not found or not connected to WhatsApp.');

    const csvContent = groupExtractorService.generateCsv(group.subject, group.participants);
    const cleanFilename = (group.subject || 'contacts').replace(/[^a-zA-Z0-9_\-]/g, '_');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}_members.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).send('Error generating CSV: ' + err.message);
  }
});

// Download Group Contacts as .TXT clean phone numbers (All members)
router.get('/download/group/:groupId/contacts.txt', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await groupExtractorService.getGroupById(groupId);
    if (!group) return res.status(404).send('Group not found or not connected to WhatsApp.');

    const txtContent = groupExtractorService.generateTxtFromNumbers(group.participants);
    const cleanFilename = (group.subject || 'contacts').replace(/[^a-zA-Z0-9_\-]/g, '_');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}_numbers.txt"`);
    res.send(txtContent);
  } catch (err) {
    res.status(500).send('Error generating TXT: ' + err.message);
  }
});

// API: Drip Status & Controls
router.get('/api/drip/status', (req, res) => {
  res.json({ success: true, drip: dripCampaignService.getDripStatus() });
});

// API: Start Drip Immediately
router.post('/api/drip/start', async (req, res) => {
  try {
    const { title, groupId, recipients, message, imageUrl, pdfUrl, pdfFileName, intervalSeconds } = req.body;
    let targetPhones = recipients || [];

    if (groupId && targetPhones.length === 0) {
      const group = await groupExtractorService.getGroupById(groupId);
      if (group && group.participants) {
        targetPhones = group.participants.map(p => p.phone || p.id);
      }
    }

    const status = dripCampaignService.startDrip({
      title: title || 'Group Outreach Campaign',
      recipients: targetPhones,
      message,
      imageUrl,
      pdfUrl,
      pdfFileName,
      intervalSeconds: Number(intervalSeconds) || 60
    });

    res.json({ success: true, drip: status });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// API: Schedule Drip Campaign for Future Date & Time
router.post('/api/drip/schedule', async (req, res) => {
  try {
    const { title, groupId, recipients, message, imageUrl, pdfUrl, pdfFileName, intervalSeconds, scheduledTime } = req.body;
    let targetPhones = recipients || [];

    if (groupId && targetPhones.length === 0) {
      const group = await groupExtractorService.getGroupById(groupId);
      if (group && group.participants) {
        targetPhones = group.participants.map(p => p.phone || p.id);
      }
    }

    const scheduled = dripCampaignService.scheduleDrip({
      title: title || 'Scheduled Outreach Campaign',
      recipients: targetPhones,
      message,
      imageUrl,
      pdfUrl,
      pdfFileName,
      intervalSeconds: Number(intervalSeconds) || 60,
      scheduledTime
    });

    res.json({ success: true, scheduled, message: `Drip scheduled successfully for ${new Date(scheduledTime).toLocaleString()}` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// API: Get Scheduled Drips
router.get('/api/drip/scheduled', (req, res) => {
  res.json({ success: true, drips: dripCampaignService.getScheduledDrips() });
});

// API: Cancel Scheduled Drip
router.post('/api/drip/cancel-scheduled', (req, res) => {
  const { id } = req.body;
  const ok = dripCampaignService.cancelScheduledDrip(id);
  res.json({ success: ok });
});

router.post('/api/drip/pause', (req, res) => res.json({ success: true, drip: dripCampaignService.pauseDrip() }));
router.post('/api/drip/resume', (req, res) => res.json({ success: true, drip: dripCampaignService.resumeDrip() }));
router.post('/api/drip/stop', (req, res) => res.json({ success: true, drip: dripCampaignService.stopDrip() }));

// Web UI: Super Advanced WhatsApp Groups & Dynamic Lead Extractor Studio
router.get('/groups', async (req, res) => {
  let groups = [];
  try {
    groups = await groupExtractorService.getAllGroups();
  } catch (e) {}

  const totalAudience = groups.reduce((acc, g) => acc + (g.size || (g.participants ? g.participants.length : 0)), 0);
  const dripStatus = dripCampaignService.getDripStatus();
  const isDripRunning = dripStatus.status === 'running';
  const scheduledDrips = dripCampaignService.getScheduledDrips();
  const pendingScheduled = scheduledDrips.filter(d => d.status === 'scheduled');

  const contentHtml = `
  <style>
    .container { max-width: 1260px; margin: 0 auto; }

    /* Top Stats Grid */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid #334155; border-radius: 14px; padding: 18px 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
    .stat-label { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; margin-bottom: 6px; }
    .stat-value { font-size: 26px; font-weight: 800; color: #f8fafc; display: flex; align-items: center; gap: 8px; }
    .stat-sub { font-size: 12px; color: #64748b; margin-top: 4px; }

    /* Drip Monitor Banner */
    .drip-monitor { background: linear-gradient(135deg, #1e293b, #0f172a); border-radius: 16px; border: 2px solid ${isDripRunning ? '#34d399' : '#334155'}; padding: 20px 24px; margin-bottom: 25px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
    .drip-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; margin-bottom: 12px; }
    .drip-title { font-size: 18px; font-weight: 700; color: white; display: flex; align-items: center; gap: 10px; }
    .drip-badge { font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; }
    .badge-running { background: #064e3b; color: #34d399; border: 1px solid #059669; }
    .badge-paused { background: #78350f; color: #fbbf24; border: 1px solid #d97706; }
    .badge-idle { background: #334155; color: #94a3b8; }
    
    .progress-bar { background: #334155; height: 10px; border-radius: 5px; overflow: hidden; margin-bottom: 10px; }
    .progress-fill { background: #10b981; height: 100%; transition: width 0.4s; }
    .drip-stats { display: flex; justify-content: space-between; font-size: 13px; color: #94a3b8; flex-wrap: wrap; gap: 10px; }

    /* Scheduled Drips Panel */
    .scheduled-panel { background: #1e293b; border-radius: 14px; border: 1px solid #475569; padding: 18px 24px; margin-bottom: 25px; }
    .scheduled-title { font-size: 16px; font-weight: 700; color: white; display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
    .scheduled-item { background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 10px; }

    /* Bulk Multi-Group Actions Floating Bar */
    .bulk-groups-bar { background: linear-gradient(135deg, #0f172a, #1e1b4b); border: 2px solid #6366f1; border-radius: 14px; padding: 14px 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; box-shadow: 0 8px 25px rgba(99,102,241,0.25); }
    .bulk-badge { background: #4338ca; color: #e0e7ff; padding: 4px 12px; border-radius: 12px; font-weight: 700; font-size: 12px; }

    /* Groups Panel & Search */
    .panel { background: #1e293b; border-radius: 14px; border: 1px solid #334155; padding: 24px; margin-bottom: 30px; }
    .panel-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; margin-bottom: 20px; }
    .panel-header h2 { margin: 0; font-size: 20px; color: white; display: flex; align-items: center; gap: 10px; }
    .search-input { padding: 10px 16px; background: #0f172a; border: 1px solid #475569; border-radius: 8px; color: white; font-size: 14px; width: 320px; outline: none; }
    .search-input:focus { border-color: #38bdf8; }

    table { width: 100%; border-collapse: collapse; font-size: 14px; text-align: left; }
    th { color: #94a3b8; font-weight: 600; padding: 12px 14px; border-bottom: 1px solid #334155; background: #0f172a55; }
    td { padding: 14px; border-bottom: 1px solid #334155; }
    tr:hover td { background: #1e293b88; }

    .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; justify-content: center; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-super { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; box-shadow: 0 4px 12px rgba(99,102,241,0.35); }
    .btn-super:hover { background: linear-gradient(135deg, #4f46e5, #7c3aed); transform: translateY(-1px); }
    .btn-view { background: #0284c7; color: white; }
    .btn-view:hover { background: #0369a1; }
    .btn-vcf { background: #16a34a; color: white; }
    .btn-vcf:hover { background: #15803d; }
    .btn-csv { background: #475569; color: white; }
    .btn-csv:hover { background: #334155; }
    .btn-txt { background: #d97706; color: white; }
    .btn-txt:hover { background: #b45309; }
    .btn-drip { background: #7c3aed; color: white; }
    .btn-drip:hover { background: #6d28d9; }
    .btn-group-create { background: #059669; color: white; }
    .btn-group-create:hover { background: #047857; }
    .btn-warning { background: #d97706; color: white; }
    .btn-danger { background: #dc2626; color: white; }

    /* Modals */
    .modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
    .modal-box { background: #1e293b; border: 1px solid #334155; border-radius: 16px; width: 100%; max-width: 980px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 60px rgba(0,0,0,0.7); }
    .modal-header { padding: 18px 24px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; background: #0f172a; }
    .modal-header h3 { margin: 0; color: white; font-size: 19px; display: flex; align-items: center; gap: 10px; }
    .modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
    .modal-footer { padding: 16px 24px; border-top: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; background: #0f172a; flex-wrap: wrap; gap: 10px; }

    /* Modal Stats Summary Banner */
    .extractor-stats-bar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .stat-pill { background: #0f172a; border: 1px solid #334155; padding: 8px 14px; border-radius: 10px; font-size: 13px; color: #cbd5e1; display: flex; align-items: center; gap: 6px; }
    .stat-pill b { color: #38bdf8; font-size: 15px; }

    /* Dynamic Filter Bar */
    .filter-toolbar { background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
    .filter-pills { display: flex; gap: 8px; flex-wrap: wrap; }
    .filter-btn { background: #1e293b; color: #94a3b8; border: 1px solid #334155; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .filter-btn:hover { background: #334155; color: white; }
    .filter-btn.active { background: #0284c7; color: white; border-color: #38bdf8; }

    /* Badges */
    .badge-creator { background: #78350f; color: #fbbf24; border: 1px solid #d97706; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
    .badge-admin { background: #064e3b; color: #34d399; border: 1px solid #059669; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
    .badge-member { background: #334155; color: #cbd5e1; padding: 2px 8px; border-radius: 10px; font-size: 11px; }
    .badge-cross { background: #4c1d95; color: #c084fc; border: 1px solid #7c3aed; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
    .badge-realname { background: #0369a1; color: #7dd3fc; border: 1px solid #0284c7; padding: 2px 6px; border-radius: 8px; font-size: 10px; font-weight: 700; }
    .badge-flag { background: #0f172a; border: 1px solid #475569; padding: 2px 8px; border-radius: 8px; font-size: 12px; }

    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px; }
    .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 10px 14px; background: #0f172a; border: 1px solid #475569; border-radius: 8px; color: white; font-size: 14px; outline: none; }
    .form-help { font-size: 11px; color: #64748b; margin-top: 4px; }
  </style>

  <div class="container">
    <!-- STATS OVERVIEW CARDS -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">📱 Joined Groups</div>
        <div class="stat-value"><span>${groups.length}</span> <small style="font-size:14px; color:#94a3b8; font-weight:normal;">Groups</small></div>
        <div class="stat-sub">Live connected Baileys WhatsApp</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">👥 Total Group Audience</div>
        <div class="stat-value"><span style="color:#38bdf8;">${totalAudience.toLocaleString()}</span> <small style="font-size:14px; color:#94a3b8; font-weight:normal;">Members</small></div>
        <div class="stat-sub">Ready for 1-Click extraction</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">🛡️ Anti-Ban Drip Status</div>
        <div class="stat-value">
          <span class="drip-badge ${isDripRunning ? 'badge-running' : (dripStatus.status === 'paused' ? 'badge-paused' : 'badge-idle')}">
            ${dripStatus.status.toUpperCase()}
          </span>
        </div>
        <div class="stat-sub">${dripStatus.sent}/${dripStatus.total} dispatched</div>
      </div>
      <div class="stat-card" style="display:flex; flex-direction:column; justify-content:center;">
        <button class="btn btn-super" style="padding:12px 18px; font-size:14px;" onclick="extractAllGroupsBulk()">
          ⚡ Extract ALL Groups (${groups.length})
        </button>
      </div>
    </div>

    <!-- DRIP MONITOR BANNER -->
    <div class="drip-monitor">
      <div class="drip-header">
        <div class="drip-title">
          🛡️ Anti-Ban 1-Minute Drip Messenger
          <span class="drip-badge ${isDripRunning ? 'badge-running' : (dripStatus.status === 'paused' ? 'badge-paused' : 'badge-idle')}">
            ${dripStatus.status.toUpperCase()}
          </span>
        </div>
        <div style="display:flex; gap:8px;">
          ${isDripRunning ? `
            <button class="btn btn-warning" onclick="pauseDrip()">⏸️ Pause</button>
            <button class="btn btn-danger" onclick="stopDrip()">⏹️ Stop</button>
          ` : (dripStatus.status === 'paused' ? `
            <button class="btn btn-vcf" onclick="resumeDrip()">▶️ Resume</button>
            <button class="btn btn-danger" onclick="stopDrip()">⏹️ Stop</button>
          ` : '')}
        </div>
      </div>

      <div class="progress-bar">
        <div class="progress-fill" style="width: ${dripStatus.percent}%;"></div>
      </div>

      <div class="drip-stats">
        <span><b>Campaign:</b> ${dripStatus.title}</span>
        <span><b>Progress:</b> ${dripStatus.sent}/${dripStatus.total} sent (${dripStatus.percent}%)</span>
        <span><b>Speed:</b> ~${dripStatus.intervalSeconds}s interval with Human Jitter</span>
        <span><b>Next Send:</b> ${dripStatus.nextSendAt ? new Date(dripStatus.nextSendAt).toLocaleTimeString() : 'N/A'}</span>
      </div>
    </div>

    <!-- SCHEDULED DRIP QUEUE PANEL -->
    ${pendingScheduled.length > 0 ? `
      <div class="scheduled-panel">
        <div class="scheduled-title">
          <span>⏰ Scheduled Drip Campaigns Waiting to Dispatch (${pendingScheduled.length})</span>
        </div>
        ${pendingScheduled.map(s => `
          <div class="scheduled-item">
            <div>
              <b style="color:white; font-size:14px;">${s.title}</b>
              <span style="margin-left:8px; background:#0284c733; color:#38bdf8; border:1px solid #0284c7; padding:2px 8px; border-radius:10px; font-size:11px;">👥 ${s.recipients.length} recipients</span>
              ${s.pdfUrl ? '<span style="margin-left:6px; background:#ec489933; color:#f472b6; padding:2px 8px; border-radius:10px; font-size:11px;">📄 PDF Attached</span>' : (s.imageUrl ? '<span style="margin-left:6px; background:#10b98133; color:#34d399; padding:2px 8px; border-radius:10px; font-size:11px;">🖼️ Image Attached</span>' : '')}
              <div style="color:#94a3b8; font-size:12px; margin-top:4px;">
                🚀 Set to dispatch: <b style="color:#fbbf24;">${new Date(s.scheduledTime).toLocaleString()}</b> (~${s.intervalSeconds}s delay)
              </div>
            </div>
            <div>
              <button class="btn btn-danger" onclick="cancelScheduledDrip('${s.id}')">✕ Cancel Schedule</button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- MULTI-GROUP SELECTION FLOATING BAR -->
    <div id="bulkGroupsBar" class="bulk-groups-bar" style="display:none;">
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="bulk-badge" id="bulkGroupsCountBadge">0 Groups Selected</span>
        <span style="color:#e2e8f0; font-size:14px;">Selected groups ready for cross-group extraction & deduplication</span>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn btn-super" onclick="extractSelectedGroupsBulk()">
          ⚡ Bulk Extract & Deduplicate
        </button>
        <button class="btn btn-csv" onclick="clearGroupSelection()">
          ✕ Deselect All
        </button>
      </div>
    </div>

    <!-- GROUPS LIST PANEL -->
    <div class="panel">
      <div class="panel-header">
        <h2>📱 WhatsApp Groups Explorer (${groups.length})</h2>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <input type="text" id="groupSearchInput" class="search-input" placeholder="🔍 Search among ${groups.length} groups..." onkeyup="filterGroupsTable()">
          <button onclick="location.reload()" class="btn btn-csv">🔄 Refresh</button>
        </div>
      </div>

      ${groups.length === 0 ? `
        <div style="text-align:center; padding:40px; color:#94a3b8;">
          <p style="font-size:16px; margin-bottom:12px;">No groups detected yet or WhatsApp QR is connecting.</p>
          <a href="/qr" class="btn btn-vcf" style="font-size:14px;">📲 Open WhatsApp QR Scanner</a>
        </div>
      ` : `
        <div style="overflow-x: auto;">
          <table id="groupsTable">
            <thead>
              <tr>
                <th style="width:40px;">
                  <input type="checkbox" id="masterGroupSelect" style="width:18px; height:18px; cursor:pointer;" onchange="toggleAllGroupCheckboxes(this.checked)" title="Select All Groups">
                </th>
                <th>Group Name & Original ID</th>
                <th>Audience</th>
                <th>Dynamic Extractor</th>
                <th>1-Click Export Suite</th>
                <th>Drip Outreach</th>
              </tr>
            </thead>
            <tbody>
              ${groups.map(g => `
                <tr class="group-row" data-name="${(g.subject || '').toLowerCase()}" data-id="${g.id}">
                  <td>
                    <input type="checkbox" class="group-checkbox" value="${g.id}" data-name="${(g.subject || '').replace(/"/g, '&quot;')}" style="width:16px; height:16px; cursor:pointer;" onchange="onGroupCheckboxChanged()">
                  </td>
                  <td>
                    <b style="font-size:15px; color:#f1f5f9;">${g.subject}</b><br>
                    <small style="color:#64748b;">${g.id}</small>
                  </td>
                  <td>
                    <span class="badge-size" style="background:#0284c722; color:#38bdf8; border:1px solid #0284c7; padding:4px 10px; border-radius:12px; font-weight:700;">
                      👥 ${g.size} Members
                    </span>
                  </td>
                  <td>
                    <button class="btn btn-view" onclick="openMembersModal('${encodeURIComponent(g.id)}', '${(g.subject || '').replace(/'/g, "\\'")}')">
                      👁️ Inspect & Extract
                    </button>
                  </td>
                  <td>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                      <a href="/download/group/${encodeURIComponent(g.id)}/contacts.vcf" class="btn btn-vcf" title="Import enriched contacts into mobile phonebook">
                        📲 .VCF
                      </a>
                      <a href="/download/group/${encodeURIComponent(g.id)}/contacts.csv" class="btn btn-csv" title="Open in Excel / Google Sheets">
                        📥 .CSV
                      </a>
                      <a href="/download/group/${encodeURIComponent(g.id)}/contacts.txt" class="btn btn-txt" title="Export clean phone numbers for Meta / Google Ads">
                        📋 .TXT
                      </a>
                    </div>
                  </td>
                  <td>
                    <button class="btn btn-drip" onclick="openDripModal('${encodeURIComponent(g.id)}', '${(g.subject || '').replace(/'/g, "\\'")}', ${g.size})">
                      🚀 1-Min Drip
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  </div>

  <!-- SUPER ADVANCED MEMBERS & BULK EXTRACTOR MODAL -->
  <div class="modal" id="membersModal">
    <div class="modal-box">
      <div class="modal-header">
        <h3 id="modalGroupTitle">👥 Dynamic Member Lead Extractor</h3>
        <button onclick="closeMembersModal()" style="background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer;">✕</button>
      </div>

      <div class="modal-body">
        <div id="loadingMembers" style="text-align:center; padding:40px; color:#38bdf8;">
          <div style="font-size:24px; margin-bottom:10px;">⚡</div>
          <div style="font-size:16px; font-weight:700;" id="loadingMembersText">Fetching live member list and enriching real full names & country codes...</div>
        </div>

        <div id="membersContent" style="display:none;">
          <!-- Top Stats Summary Pill Bar -->
          <div class="extractor-stats-bar" id="extractorStatsBar"></div>

          <!-- Dynamic Live Filter Toolbar -->
          <div class="filter-toolbar">
            <div class="filter-pills">
              <button class="filter-btn active" id="filterBtnAll" onclick="setMemberFilter('all')">All (<span id="countPillAll">0</span>)</button>
              <button class="filter-btn" id="filterBtnAdmins" onclick="setMemberFilter('admins')">🛡️ Admins (<span id="countPillAdmins">0</span>)</button>
              <button class="filter-btn" id="filterBtnRealPhones" onclick="setMemberFilter('phones')">🟢 Mobile Numbers (<span id="countPillPhones">0</span>)</button>
              <button class="filter-btn" id="filterBtnNamed" onclick="setMemberFilter('named')">🏷️ Real Names (<span id="countPillNamed">0</span>)</button>
              <button class="filter-btn" id="filterBtnCross" style="display:none;" onclick="setMemberFilter('cross')">🔥 Multi-Group Leads (<span id="countPillCross">0</span>)</button>
            </div>
            
            <div style="display:flex; gap:8px; align-items:center;">
              <select id="countryFilterSelect" onchange="applyAllFilters()" style="background:#1e293b; color:white; border:1px solid #475569; border-radius:8px; padding:6px 12px; font-size:12px; outline:none;">
                <option value="all">🌍 All Countries</option>
              </select>
            </div>
          </div>

          <!-- Search & Select All Actions Bar -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <input type="checkbox" id="masterSelectAll" style="width:18px; height:18px; cursor:pointer;" onchange="toggleSelectAllMembers(this.checked)">
              <label for="masterSelectAll" style="font-weight:700; cursor:pointer; color:#f8fafc;" id="selectionCountText">Select All (0 / 0)</label>
              <button type="button" class="btn" style="background:#334155; color:#f8fafc; padding:4px 10px; font-size:11.5px; border-radius:6px; cursor:pointer; border:1px solid #475569;" onclick="selectAdminsOnly()">👑 Select Admins</button>
              <button type="button" class="btn" style="background:#064e3b; color:#34d399; padding:4px 10px; font-size:11.5px; border-radius:6px; cursor:pointer; border:1px solid #059669;" onclick="selectPhonesOnly()">🟢 Select Mobiles</button>
            </div>

            <input type="text" id="memberFilterInput" class="search-input" style="width:340px; padding:8px 14px;" placeholder="🔍 Search by Name, Mobile, Country or Role..." onkeyup="applyAllFilters()">
          </div>

          <!-- Table -->
          <div style="max-height: 440px; overflow-y: auto; border: 1px solid #334155; border-radius: 8px;">
            <table id="membersTable">
              <thead>
                <tr>
                  <th style="width:36px;">Select</th>
                  <th>Contact Name & Phone</th>
                  <th>Role & Status</th>
                  <th>Country</th>
                  <th>Direct WhatsApp JID</th>
                </tr>
              </thead>
              <tbody id="membersTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <div style="color:#94a3b8; font-size:13px;" id="modalSummaryText">0 members chosen</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn" style="background:#eab308; color:#0f172a; font-weight:700; border:none; padding:8px 14px; border-radius:6px; cursor:pointer;" onclick="addSelectedToCrmLeads()">🎯 Add to CRM Leads</button>
          <button class="btn btn-vcf" onclick="exportSelected('vcf')">📲 Download .VCF (Phonebook)</button>
          <button class="btn btn-csv" onclick="exportSelected('csv')">📥 Excel (.CSV)</button>
          <button class="btn btn-txt" onclick="exportSelected('txt')">📋 .TXT (Meta Ads)</button>
          <button class="btn btn-group-create" onclick="openCreateGroupFromSelected()">➕ New WhatsApp Group</button>
          <button class="btn btn-drip" onclick="openDripForSelected()">🚀 1-Min Drip</button>
          <button class="btn btn-csv" onclick="closeMembersModal()">Close</button>
        </div>
      </div>
    </div>
  </div>

  <!-- MODAL 2: CREATE WHATSAPP GROUP MODAL -->
  <div class="modal" id="createGroupModal">
    <div class="modal-box" style="max-width:500px;">
      <div class="modal-header">
        <h3>➕ Create New WhatsApp Group</h3>
        <button onclick="closeCreateGroupModal()" style="background:none; border:none; color:#94a3b8; font-size:20px; cursor:pointer;">✕</button>
      </div>
      <div class="modal-body">
        <form id="createGroupForm">
          <div class="form-group">
            <label>Selected Contacts</label>
            <div id="createGroupCountNotice" style="background:#0f172a; padding:10px; border-radius:8px; font-weight:700; color:#34d399;">
              Adding 0 contacts to the new group
            </div>
          </div>

          <div class="form-group">
            <label>New Group Name / Subject</label>
            <input type="text" id="newGroupTitle" placeholder="e.g. VIP Video Creators / BWB Mastermind" required>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
            <button type="button" class="btn btn-csv" onclick="closeCreateGroupModal()">Cancel</button>
            <button type="submit" class="btn btn-group-create">🚀 Create Group in WhatsApp Now</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- MODAL 3: ADVANCED DRIP & SCHEDULE MODAL -->
  <div class="modal" id="dripModal">
    <div class="modal-box" style="max-width:580px;">
      <div class="modal-header">
        <h3 id="modalTitle">🚀 1-Minute Anti-Ban Drip & Scheduler</h3>
        <button onclick="closeDripModal()" style="background:none; border:none; color:#94a3b8; font-size:20px; cursor:pointer;">✕</button>
      </div>
      <div class="modal-body">
        <form id="dripForm">
          <input type="hidden" id="modalGroupId">
          <input type="hidden" id="modalSelectedPhonesJson">

          <div class="form-group">
            <label>Campaign Title</label>
            <input type="text" id="dripTitle" value="Group Member Direct Outreach" required>
          </div>

          <!-- Schedule or Send Now Option -->
          <div class="form-group">
            <label>Dispatch Timing</label>
            <select id="dripTimingMode" onchange="toggleTimingInputs()">
              <option value="immediate" selected>⚡ Send Immediately (Start Safe Queue Right Now)</option>
              <option value="scheduled">⏰ Schedule for Later (Auto-Dispatch at Specific Date & Time)</option>
            </select>
          </div>

          <div class="form-group" id="dripScheduleGroup" style="display:none; background:#0f172a; padding:12px; border-radius:8px; border:1px solid #38bdf8;">
            <label style="color:#38bdf8;">📅 Set Scheduled Date & Time (IST)</label>
            <input type="datetime-local" id="dripScheduledTime">
            <div class="form-help">System background daemon will automatically start dispatching messages at this exact moment.</div>
          </div>

          <div class="form-group">
            <label>Anti-Ban Speed Interval</label>
            <select id="dripInterval">
              <option value="60" selected>🛡️ Safe 1 Minute (60s with randomized human typing - Recommended)</option>
              <option value="90">🐢 Ultra Safe 1.5 Minutes (90s)</option>
              <option value="120">🔒 Maximum Safety 2 Minutes (120s)</option>
              <option value="35">⚡ Moderate 35 Seconds</option>
            </select>
          </div>

          <!-- Media Attachment Selector (Images & PDF) -->
          <div class="form-group">
            <label>Media Attachment Type</label>
            <select id="dripMediaType" onchange="toggleDripMediaInputs()">
              <option value="none" selected>💬 Text Only (No Attachment)</option>
              <option value="image">🖼️ Image URL (Banner / Creative)</option>
              <option value="pdf">📄 PDF Document (Portfolio / Rate Card)</option>
            </select>
          </div>

          <div class="form-group" id="dripImageGroup" style="display:none;">
            <label>Attach Image URL</label>
            <input type="url" id="dripImageUrl" placeholder="https://example.com/banner.jpg">
          </div>

          <div id="dripPdfGroup" style="display:none;">
            <div class="form-group">
              <label>Attach PDF Document URL</label>
              <input type="url" id="dripPdfUrl" placeholder="https://example.com/bwb_media_portfolio.pdf">
            </div>
            <div class="form-group">
              <label>Custom PDF File Name</label>
              <input type="text" id="dripPdfName" placeholder="BWB_Media_Brochure.pdf" value="BWB_Media_Brochure.pdf">
            </div>
          </div>

          <div class="form-group">
            <label>Message / Pitch / Caption</label>
            <textarea id="dripMessage" rows="5" required>Namaste! Maine aapko hamare common WhatsApp creator group se connect kiya.

BWB Media me hum high-retention video edits aur Meta ads provide karte hain.
🎬 Recent Showreel: https://instagram.com/bwbmedia

Kya aap apne channel ya brand ke liye naye videos plan kar rahe hain? Reply karein to claim 30% creator discount!</textarea>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
            <button type="button" class="btn btn-csv" onclick="closeDripModal()">Cancel</button>
            <button type="submit" class="btn btn-vcf" id="dripSubmitBtn">🚀 Start Anti-Ban Drip</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <script>
    let currentExtractedGroup = null;
    let currentMembersList = [];
    let currentFilterType = 'all';

    // Group Checkbox Selection & Bulk Bar
    function onGroupCheckboxChanged() {
      const checkedBoxes = document.querySelectorAll('.group-checkbox:checked');
      const totalBoxes = document.querySelectorAll('.group-checkbox');
      const count = checkedBoxes.length;

      const bar = document.getElementById('bulkGroupsBar');
      if (count > 0) {
        bar.style.display = 'flex';
        document.getElementById('bulkGroupsCountBadge').innerText = count + ' of ' + totalBoxes.length + ' Groups Selected';
      } else {
        bar.style.display = 'none';
      }

      document.getElementById('masterGroupSelect').checked = (count > 0 && count === totalBoxes.length);
    }

    function toggleAllGroupCheckboxes(checked) {
      const boxes = document.querySelectorAll('.group-checkbox');
      boxes.forEach(b => {
        const row = b.closest('tr');
        if (row && row.style.display !== 'none') {
          b.checked = checked;
        }
      });
      onGroupCheckboxChanged();
    }

    function clearGroupSelection() {
      const boxes = document.querySelectorAll('.group-checkbox');
      boxes.forEach(b => b.checked = false);
      document.getElementById('masterGroupSelect').checked = false;
      onGroupCheckboxChanged();
    }

    function getSelectedGroupIds() {
      const checked = document.querySelectorAll('.group-checkbox:checked');
      return Array.from(checked).map(c => c.value);
    }

    // Filter Groups in Main Table
    function filterGroupsTable() {
      const query = document.getElementById('groupSearchInput').value.toLowerCase().trim();
      const rows = document.querySelectorAll('.group-row');
      rows.forEach(r => {
        const name = r.getAttribute('data-name');
        r.style.display = (!query || name.includes(query)) ? '' : 'none';
      });
    }

    // Open Members Modal for a Single Group
    async function openMembersModal(groupId, subject) {
      currentExtractedGroup = { id: groupId, subject: subject, isBulk: false };
      currentMembersList = [];
      document.getElementById('modalGroupTitle').innerText = '👥 ' + subject;
      document.getElementById('loadingMembersText').innerText = 'Fetching live member list from WhatsApp API & cross-matching real names...';
      document.getElementById('loadingMembers').style.display = 'block';
      document.getElementById('membersContent').style.display = 'none';
      document.getElementById('membersModal').style.display = 'flex';

      try {
        const res = await fetch('/api/groups/' + groupId + '/live');
        const data = await res.json();
        if (!data.success) {
          alert('❌ Failed to fetch live group details: ' + (data.error || 'Check connection'));
          closeMembersModal();
          return;
        }

        currentMembersList = data.group.participants || [];
        renderMembersInterface(data.group.subject, currentMembersList, false);
      } catch (err) {
        alert('Network error: ' + err.message);
        closeMembersModal();
      }
    }

    // Bulk Extract from Selected Groups
    async function extractSelectedGroupsBulk() {
      const groupIds = getSelectedGroupIds();
      if (groupIds.length === 0) {
        alert('Please select at least 1 group using the checkboxes!');
        return;
      }
      executeBulkExtraction(groupIds, groupIds.length + ' Selected WhatsApp Groups');
    }

    // Bulk Extract from ALL Groups
    async function extractAllGroupsBulk() {
      executeBulkExtraction('all', 'ALL Joined WhatsApp Groups');
    }

    async function executeBulkExtraction(groupIds, title) {
      currentExtractedGroup = { id: 'bulk', subject: title, isBulk: true };
      currentMembersList = [];
      document.getElementById('modalGroupTitle').innerText = '⚡ Bulk Lead Extractor: ' + title;
      document.getElementById('loadingMembersText').innerText = 'Scanning all groups, cross-deduplicating members and pulling contact names...';
      document.getElementById('loadingMembers').style.display = 'block';
      document.getElementById('membersContent').style.display = 'none';
      document.getElementById('membersModal').style.display = 'flex';

      try {
        const res = await fetch('/api/groups/bulk-extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupIds })
        });
        const data = await res.json();
        if (!data.success) {
          alert('❌ Bulk extraction failed: ' + (data.error || 'Check connection'));
          closeMembersModal();
          return;
        }

        currentMembersList = data.members || [];
        renderMembersInterface(title, currentMembersList, true, data);
      } catch (err) {
        alert('Network error: ' + err.message);
        closeMembersModal();
      }
    }

    function closeMembersModal() {
      document.getElementById('membersModal').style.display = 'none';
    }

    // Render Members Table and UI Controls
    function renderMembersInterface(title, members, isBulk = false, bulkStats = null) {
      document.getElementById('loadingMembers').style.display = 'none';
      document.getElementById('membersContent').style.display = 'block';

      // 1. Calculate Stats
      const totalCount = members.length;
      const adminCount = members.filter(m => m.isAdmin || m.isSuperAdmin).length;
      const realPhoneCount = members.filter(m => m.isRealPhone).length;
      const namedCount = members.filter(m => m.hasRealName).length;
      const crossCount = members.filter(m => m.groupCount > 1).length;

      document.getElementById('countPillAll').innerText = totalCount;
      document.getElementById('countPillAdmins').innerText = adminCount;
      document.getElementById('countPillPhones').innerText = realPhoneCount;
      document.getElementById('countPillNamed').innerText = namedCount;
      document.getElementById('countPillCross').innerText = crossCount;

      const crossBtn = document.getElementById('filterBtnCross');
      if (isBulk && crossCount > 0) {
        crossBtn.style.display = 'inline-block';
      } else {
        crossBtn.style.display = 'none';
      }

      // Stats Bar HTML
      const statsBar = document.getElementById('extractorStatsBar');
      let statsHtml = \`
        <div class="stat-pill">👥 Total Leads: <b>\${totalCount}</b></div>
        <div class="stat-pill">🛡️ Admins: <b>\${adminCount}</b></div>
        <div class="stat-pill">🟢 Real Mobiles: <b>\${realPhoneCount}</b></div>
        <div class="stat-pill">🏷️ With Names: <b>\${namedCount}</b></div>
      \`;
      if (isBulk && bulkStats) {
        statsHtml += \`
          <div class="stat-pill" style="border-color:#7c3aed; background:#4c1d9533;">
            🔥 Scanned <b>\${bulkStats.totalGroupsScanned} Groups</b> (\${bulkStats.duplicatesRemoved} Duplicates Cleaned)
          </div>
        \`;
      }
      statsBar.innerHTML = statsHtml;

      // Populate Country Filter Dropdown
      const countries = Array.from(new Set(members.map(m => m.country || 'International'))).filter(Boolean).sort();
      const countrySelect = document.getElementById('countryFilterSelect');
      countrySelect.innerHTML = '<option value="all">🌍 All Countries (' + totalCount + ')</option>' +
        countries.map(c => {
          const cCount = members.filter(m => (m.country || 'International') === c).length;
          const flag = (members.find(m => m.country === c) || {}).flag || '🌍';
          return \`<option value="\${c}">\${flag} \${c} (\${cCount})</option>\`;
        }).join('');

      // Populate Table
      const tbody = document.getElementById('membersTableBody');
      tbody.innerHTML = '';

      members.forEach((m, idx) => {
        const phone = m.phone || (m.id ? m.id.split('@')[0].split(':')[0] : '');
        const formatted = m.formattedPhone || ('+' + phone);
        const name = m.name || '';
        const country = m.country || 'International';
        const flag = m.flag || '🌍';
        const role = m.roleBadge || (m.isAdmin ? '🛡️ Admin' : '👤 Member');

        const tr = document.createElement('tr');
        tr.className = 'member-item-row';
        tr.setAttribute('data-phone', phone);
        tr.setAttribute('data-name', (name || '').toLowerCase());
        tr.setAttribute('data-country', country.toLowerCase());
        tr.setAttribute('data-isadmin', m.isAdmin ? 'true' : 'false');
        tr.setAttribute('data-isrealphone', m.isRealPhone ? 'true' : 'false');
        tr.setAttribute('data-hasname', m.hasRealName ? 'true' : 'false');
        tr.setAttribute('data-iscross', (m.groupCount > 1) ? 'true' : 'false');

        tr.innerHTML = \`
          <td>
            <input type="checkbox" class="member-checkbox" value="\${phone}" data-json="\${encodeURIComponent(JSON.stringify(m))}" style="width:16px; height:16px; cursor:pointer;" onchange="updateSelectedCount()">
          </td>
          <td>
            \${m.hasRealName ? \`
              <div style="font-size:15px; font-weight:700; color:#f8fafc; display:flex; align-items:center; gap:6px;">
                \${name}
                <span class="badge-realname">Verified Name</span>
              </div>
              <div style="color:#94a3b8; font-size:13px; margin-top:2px; font-family:monospace;">
                \${formatted}
              </div>
            \` : \`
              <div style="font-size:15px; font-weight:700; color:#f8fafc; font-family:monospace;">
                \${formatted}
              </div>
            \`}
            <div style="margin-top:4px;">
              \${m.isRealPhone ? '<span style="background:#064e3b; color:#34d399; border:1px solid #059669; padding:1px 6px; border-radius:8px; font-size:10px; font-weight:700;">🟢 Mobile Number</span>' : '<span style="background:#334155; color:#94a3b8; padding:1px 6px; border-radius:8px; font-size:10px;">🔒 Direct WhatsApp ID</span>'}
            </div>
          </td>
          <td>
            <span class="\${m.isSuperAdmin ? 'badge-creator' : (m.isAdmin ? 'badge-admin' : 'badge-member')}">\${role}</span>
            \${m.groupCount > 1 ? \`<span class="badge-cross" style="margin-left:4px;">🔥 In \${m.groupCount} Groups</span>\` : ''}
            \${m.groups && m.groups.length > 1 ? \`<div style="font-size:11px; color:#94a3b8; margin-top:4px;">Groups: \${m.groups.slice(0, 2).join(', ')}\${m.groups.length > 2 ? '...' : ''}</div>\` : ''}
          </td>
          <td>
            <span class="badge-flag">\${flag} \${country}</span>
          </td>
          <td>
            <small style="color:#64748b; font-family:monospace; font-size:11px;">\${m.id || phone}</small>
          </td>
        \`;
        tbody.appendChild(tr);
      });

      // Default: select all
      document.getElementById('masterSelectAll').checked = true;
      toggleSelectAllMembers(true);
      setMemberFilter('all');
    }

    // Dynamic Filter Controller
    function setMemberFilter(type) {
      currentFilterType = type;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      if (type === 'all') document.getElementById('filterBtnAll').classList.add('active');
      if (type === 'admins') document.getElementById('filterBtnAdmins').classList.add('active');
      if (type === 'phones') document.getElementById('filterBtnRealPhones').classList.add('active');
      if (type === 'named') document.getElementById('filterBtnNamed').classList.add('active');
      if (type === 'cross') document.getElementById('filterBtnCross').classList.add('active');
      applyAllFilters();
    }

    function applyAllFilters() {
      const q = document.getElementById('memberFilterInput').value.toLowerCase().trim();
      const countryFilter = document.getElementById('countryFilterSelect').value.toLowerCase();
      const rows = document.querySelectorAll('.member-item-row');

      rows.forEach(r => {
        const phone = r.getAttribute('data-phone') || '';
        const name = r.getAttribute('data-name') || '';
        const country = r.getAttribute('data-country') || '';
        const isAdmin = r.getAttribute('data-isadmin') === 'true';
        const isRealPhone = r.getAttribute('data-isrealphone') === 'true';
        const hasName = r.getAttribute('data-hasname') === 'true';
        const isCross = r.getAttribute('data-iscross') === 'true';

        // 1. Text Search Filter
        let textMatch = !q || phone.includes(q) || name.includes(q) || country.includes(q);

        // 2. Filter Button Pill
        let typeMatch = true;
        if (currentFilterType === 'admins') typeMatch = isAdmin;
        else if (currentFilterType === 'phones') typeMatch = isRealPhone;
        else if (currentFilterType === 'named') typeMatch = hasName;
        else if (currentFilterType === 'cross') typeMatch = isCross;

        // 3. Country Dropdown
        let countryMatch = (countryFilter === 'all') || (country === countryFilter);

        r.style.display = (textMatch && typeMatch && countryMatch) ? '' : 'none';
      });

      updateSelectedCount();
    }

    function toggleSelectAllMembers(checked) {
      const boxes = document.querySelectorAll('.member-checkbox');
      boxes.forEach(b => {
        const row = b.closest('tr');
        if (row && row.style.display !== 'none') {
          b.checked = checked;
        }
      });
      updateSelectedCount();
    }

    function updateSelectedCount() {
      const checkedBoxes = document.querySelectorAll('.member-checkbox:checked');
      const totalBoxes = document.querySelectorAll('.member-checkbox');
      const visibleBoxes = Array.from(totalBoxes).filter(b => b.closest('tr').style.display !== 'none');
      const count = checkedBoxes.length;

      document.getElementById('selectionCountText').innerText = 'Selected (' + count + ' / ' + visibleBoxes.length + ' visible)';
      document.getElementById('modalSummaryText').innerText = count + ' of ' + totalBoxes.length + ' total leads selected for export/campaign.';
    }

    function getSelectedMembers() {
      const checked = document.querySelectorAll('.member-checkbox:checked');
      const members = [];
      checked.forEach(b => {
        const rawJson = b.getAttribute('data-json');
        if (rawJson) {
          try {
            members.push(JSON.parse(decodeURIComponent(rawJson)));
          } catch (e) {
            members.push({ phone: b.value });
          }
        } else {
          members.push({ phone: b.value });
        }
      });
      return members;
    }

    function getSelectedPhones() {
      return getSelectedMembers().map(m => m.phone || m.id).filter(Boolean);
    }

    function selectAdminsOnly() {
      const rows = document.querySelectorAll('#membersTableBody .member-item-row');
      rows.forEach(r => {
        const cb = r.querySelector('.member-checkbox');
        if (!cb) return;
        const isAdmin = r.getAttribute('data-isadmin') === 'true';
        cb.checked = (isAdmin && r.style.display !== 'none');
      });
      updateSelectedCount();
    }

    function selectPhonesOnly() {
      const rows = document.querySelectorAll('#membersTableBody .member-item-row');
      rows.forEach(r => {
        const cb = r.querySelector('.member-checkbox');
        if (!cb) return;
        const isReal = r.getAttribute('data-isrealphone') === 'true';
        cb.checked = (isReal && r.style.display !== 'none');
      });
      updateSelectedCount();
    }

    async function addSelectedToCrmLeads() {
      const members = getSelectedMembers();
      if (members.length === 0) {
        alert('Please select at least 1 contact using the checkboxes first!');
        return;
      }

      if (!confirm('Add ' + members.length + ' selected contact(s) directly to CRM Leads?')) {
        return;
      }

      try {
        const res = await fetch('/api/groups/add-to-leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupSubject: currentExtractedGroup ? currentExtractedGroup.subject : 'WhatsApp Group',
            participants: members
          })
        });
        const data = await res.json();
        if (data.success) {
          alert('✅ Successfully added ' + data.count + ' new contact(s) to CRM Leads! They will now show up under CRM Leads with full phone numbers.');
        } else {
          alert('Failed to add leads: ' + (data.error || 'Server error'));
        }
      } catch (err) {
        alert('Network error: ' + err.message);
      }
    }

    // Multi-Format Export (.VCF, .CSV, .TXT, .JSON)
    async function exportSelected(format) {
      const members = getSelectedMembers();
      if (members.length === 0) {
        alert('Please select at least 1 contact using the checkboxes first!');
        return;
      }

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/api/groups/export-selected';

      const subjectInput = document.createElement('input');
      subjectInput.type = 'hidden';
      subjectInput.name = 'groupSubject';
      subjectInput.value = currentExtractedGroup ? currentExtractedGroup.subject : 'Contacts';
      form.appendChild(subjectInput);

      const formatInput = document.createElement('input');
      formatInput.type = 'hidden';
      formatInput.name = 'format';
      formatInput.value = format;
      form.appendChild(formatInput);

      const membersJsonInput = document.createElement('input');
      membersJsonInput.type = 'hidden';
      membersJsonInput.name = 'membersJson';
      membersJsonInput.value = JSON.stringify(members);
      form.appendChild(membersJsonInput);

      members.forEach(m => {
        const pInput = document.createElement('input');
        pInput.type = 'hidden';
        pInput.name = 'phones[]';
        pInput.value = m.phone || m.id;
        form.appendChild(pInput);
      });

      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
    }

    // Create WhatsApp Group From Selected
    function openCreateGroupFromSelected() {
      const phones = getSelectedPhones();
      if (phones.length === 0) {
        alert('Please select at least 1 contact using the checkboxes first!');
        return;
      }
      document.getElementById('createGroupCountNotice').innerText = 'Adding ' + phones.length + ' selected contacts to new group';
      document.getElementById('createGroupModal').style.display = 'flex';
    }

    function closeCreateGroupModal() {
      document.getElementById('createGroupModal').style.display = 'none';
    }

    document.getElementById('createGroupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('newGroupTitle').value.trim();
      const phones = getSelectedPhones();

      if (!title) {
        alert('Please enter a group title!');
        return;
      }

      alert('⏳ Creating WhatsApp group "' + title + '" with ' + phones.length + ' members...');
      try {
        const res = await fetch('/api/groups/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, phones })
        });
        const data = await res.json();
        if (data.success) {
          alert('🎉 ' + data.message);
          closeCreateGroupModal();
          location.reload();
        } else {
          alert('❌ Failed to create group: ' + data.error);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });

    // Drip Modal
    function openDripForSelected() {
      const phones = getSelectedPhones();
      if (phones.length === 0) {
        alert('Please select at least 1 contact using the checkboxes first!');
        return;
      }
      document.getElementById('modalGroupId').value = '';
      document.getElementById('modalSelectedPhonesJson').value = JSON.stringify(phones);
      document.getElementById('modalTitle').innerText = '🚀 Launch Drip to ' + phones.length + ' Selected Members';
      document.getElementById('dripModal').style.display = 'flex';
    }

    function openDripModal(groupId, subject, size) {
      document.getElementById('modalGroupId').value = decodeURIComponent(groupId);
      document.getElementById('modalSelectedPhonesJson').value = '';
      document.getElementById('modalTitle').innerText = '🚀 Launch Drip to ' + subject + ' (' + size + ' Members)';
      document.getElementById('dripModal').style.display = 'flex';
    }

    function closeDripModal() {
      document.getElementById('dripModal').style.display = 'none';
    }

    function toggleTimingInputs() {
      const mode = document.getElementById('dripTimingMode').value;
      const grp = document.getElementById('dripScheduleGroup');
      const btn = document.getElementById('dripSubmitBtn');
      if (mode === 'scheduled') {
        grp.style.display = 'block';
        btn.innerText = '⏰ Schedule Drip Campaign';
        const timeInput = document.getElementById('dripScheduledTime');
        if (!timeInput.value) {
          const now = new Date(Date.now() + 60 * 60 * 1000);
          timeInput.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }
      } else {
        grp.style.display = 'none';
        btn.innerText = '🚀 Start Anti-Ban Drip';
      }
    }

    function toggleDripMediaInputs() {
      const media = document.getElementById('dripMediaType').value;
      document.getElementById('dripImageGroup').style.display = (media === 'image') ? 'block' : 'none';
      document.getElementById('dripPdfGroup').style.display = (media === 'pdf') ? 'block' : 'none';
    }

    document.getElementById('dripForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const groupId = document.getElementById('modalGroupId').value;
      const selectedPhonesJson = document.getElementById('modalSelectedPhonesJson').value;
      const title = document.getElementById('dripTitle').value;
      const timingMode = document.getElementById('dripTimingMode').value;
      const scheduledTime = document.getElementById('dripScheduledTime').value;
      const interval = document.getElementById('dripInterval').value;
      const mediaType = document.getElementById('dripMediaType').value;
      const imageUrl = (mediaType === 'image') ? document.getElementById('dripImageUrl').value.trim() : '';
      const pdfUrl = (mediaType === 'pdf') ? document.getElementById('dripPdfUrl').value.trim() : '';
      const pdfFileName = (mediaType === 'pdf') ? document.getElementById('dripPdfName').value.trim() : '';
      const message = document.getElementById('dripMessage').value;

      let recipients = [];
      if (selectedPhonesJson) {
        recipients = JSON.parse(selectedPhonesJson);
      }

      if (timingMode === 'scheduled') {
        if (!scheduledTime) {
          alert('Please specify a date and time for scheduled dispatch!');
          return;
        }

        try {
          const res = await fetch('/api/drip/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              groupId: groupId || undefined,
              recipients: recipients.length > 0 ? recipients : undefined,
              intervalSeconds: interval,
              imageUrl,
              pdfUrl,
              pdfFileName,
              message,
              scheduledTime
            })
          });
          const data = await res.json();
          if (data.success) {
            alert('🎉 ' + data.message);
            closeDripModal();
            location.reload();
          } else {
            alert('❌ Scheduling Error: ' + data.error);
          }
        } catch (err) {
          alert('Failed: ' + err.message);
        }
      } else {
        if (!confirm('Start safe 1-minute drip campaign? Messages will be queued and sent one-by-one safely.')) return;

        try {
          const res = await fetch('/api/drip/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              groupId: groupId || undefined,
              recipients: recipients.length > 0 ? recipients : undefined,
              intervalSeconds: interval,
              imageUrl,
              pdfUrl,
              pdfFileName,
              message
            })
          });
          const data = await res.json();
          if (data.success) {
            alert('🎉 Drip Campaign Started! ' + data.drip.total + ' members queued safely.');
            closeDripModal();
            location.reload();
          } else {
            alert('❌ Error: ' + data.error);
          }
        } catch (err) {
          alert('Failed: ' + err.message);
        }
      }
    });

    async function cancelScheduledDrip(id) {
      if (!confirm('Cancel this scheduled campaign?')) return;
      try {
        const res = await fetch('/api/drip/cancel-scheduled', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
          alert('✅ Scheduled drip cancelled.');
          location.reload();
        } else {
          alert('❌ Failed to cancel.');
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    async function pauseDrip() {
      await fetch('/api/drip/pause', { method: 'POST' });
      location.reload();
    }
    async function resumeDrip() {
      await fetch('/api/drip/resume', { method: 'POST' });
      location.reload();
    }
    async function stopDrip() {
      if (confirm('Stop the drip campaign?')) {
        await fetch('/api/drip/stop', { method: 'POST' });
        location.reload();
      }
    }

    ${isDripRunning ? 'setInterval(() => location.reload(), 10000);' : ''}
  </script>
  </div>
  `;

  const html = renderSidebarLayout({
    title: 'WhatsApp Groups & Super Extractor Studio',
    activeNav: 'groups',
    contentHtml
  });

  res.send(html);
});

module.exports = router;

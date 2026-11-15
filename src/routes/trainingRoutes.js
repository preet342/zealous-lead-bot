const express = require('express');
const router = express.Router();
const knowledgeBase = require('../services/knowledgeBase');
const aiService = require('../services/aiService');
const modeService = require('../services/modeService');
const { renderSidebarLayout } = require('../views/sidebarLayout');

// API: Get current training data
router.get('/api/training', (req, res) => {
  res.json({ success: true, training: knowledgeBase.getTrainingData() });
});

// API: Save updated training data
router.post('/api/training/save', (req, res) => {
  try {
    const { topic, businessName, persona, instructions, knowledgeText, faqs } = req.body;
    if (!topic || !businessName) {
      return res.status(400).json({ success: false, error: 'Topic and Business Name are required.' });
    }

    const updated = knowledgeBase.saveTrainingData({
      topic: topic.trim(),
      businessName: businessName.trim(),
      persona: persona ? persona.trim() : '',
      instructions: instructions ? instructions.trim() : '',
      knowledgeText: knowledgeText ? knowledgeText.trim() : '',
      faqs: Array.isArray(faqs) ? faqs : []
    });

    res.json({ success: true, message: '🎉 AI Bot successfully trained on this topic!', training: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Reset training to default
router.post('/api/training/reset', (req, res) => {
  try {
    const reset = knowledgeBase.resetTrainingToDefault();
    res.json({ success: true, message: 'Training reset to default BWB Media template.', training: reset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Live Sandbox Test Simulation
router.post('/api/training/test', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty.' });
    }

    const testId = 'sandbox_test_user';
    const reply = await aiService.processMessage(testId, 'whatsapp_qr', message.trim());
    res.json({ success: true, reply, mode: modeService.getBotMode() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Web UI: AI Training Studio Page
router.get('/training', (req, res) => {
  const training = knowledgeBase.getTrainingData();
  const currentMode = modeService.getBotMode();

  const contentHtml = `
  <style>
    .container { max-width: 1200px; margin: 0 auto; }
    
    .studio-header { background: linear-gradient(135deg, #1e293b, #0f172a); border-radius: 16px; border: 2px solid #38bdf8; padding: 24px 28px; margin-bottom: 25px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
    .studio-info h2 { margin: 0 0 6px 0; font-size: 22px; color: white; display: flex; align-items: center; gap: 10px; }
    .studio-info p { margin: 0; color: #94a3b8; font-size: 14px; max-width: 650px; line-height: 1.5; }

    /* Templates row */
    .templates-bar { background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 14px 20px; margin-bottom: 25px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
    .btn-template { background: #1e293b; border: 1px solid #475569; color: #e2e8f0; padding: 7px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
    .btn-template:hover { background: #0284c7; border-color: #38bdf8; color: white; }

    /* Main 2-column layout */
    .grid { display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 24px; }
    @media(max-width: 900px) { .grid { grid-template-columns: 1fr; } }

    .panel { background: #1e293b; border-radius: 14px; border: 1px solid #334155; padding: 24px; margin-bottom: 24px; }
    .panel h3 { margin: 0 0 16px 0; font-size: 18px; color: white; border-bottom: 1px solid #334155; padding-bottom: 12px; display: flex; align-items: center; gap: 8px; }

    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px; }
    .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 10px 14px; background: #0f172a; border: 1px solid #475569; border-radius: 8px; color: white; font-size: 14px; outline: none; }
    .form-group input:focus, .form-group textarea:focus { border-color: #38bdf8; }
    .form-help { font-size: 11px; color: #64748b; margin-top: 4px; }

    /* FAQ List builder */
    .faq-item { background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 14px; margin-bottom: 12px; position: relative; }
    .faq-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }

    .btn { padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: background 0.2s; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; justify-content: center; }
    .btn-primary { background: #0284c7; color: white; }
    .btn-primary:hover { background: #0369a1; }
    .btn-success { background: #16a34a; color: white; }
    .btn-success:hover { background: #15803d; }
    .btn-danger { background: #dc2626; color: white; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-secondary { background: #334155; color: #e2e8f0; }
    .btn-secondary:hover { background: #475569; }

    /* Live Sandbox Simulator */
    .chat-box { background: #0b141a; border-radius: 12px; border: 1px solid #2a3942; height: 380px; display: flex; flex-direction: column; overflow: hidden; }
    .chat-header { background: #202c33; padding: 12px 16px; font-size: 13px; font-weight: 600; color: #e9edef; display: flex; justify-content: space-between; align-items: center; }
    .chat-messages { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
    .msg-bubble { max-width: 85%; padding: 10px 14px; border-radius: 10px; font-size: 13px; line-height: 1.4; word-break: break-word; }
    .msg-user { background: #005c4b; color: #e9edef; align-self: flex-end; border-bottom-right-radius: 2px; }
    .msg-bot { background: #202c33; color: #e9edef; align-self: flex-start; border-bottom-left-radius: 2px; }
    .chat-input-bar { background: #202c33; padding: 10px; display: flex; gap: 8px; border-top: 1px solid #2a3942; }
    .chat-input-bar input { flex: 1; background: #2a3942; border: 1px solid #334155; border-radius: 8px; padding: 10px 14px; color: white; font-size: 13px; outline: none; }
    .chat-input-bar input:focus { border-color: #38bdf8; }
  </style>

  <div class="container">
    <!-- STUDIO HEADER BANNER -->
    <div class="studio-header">
      <div class="studio-info">
        <h2>
          🧠 AI Knowledge Base & Training Studio
        </h2>
        <p>
          Aap apne bot ko <b>kisi bhi business, service ya topic</b> par train kar sakte hain. Jo bhi details aap yahan likhenge, bot seedhe usi knowledge ke hisaab se natural insaan ki tarah baat karega!
        </p>
      </div>
      <div>
        <button type="button" class="btn btn-secondary" onclick="resetDefault()">🔄 Reset to Default Template</button>
      </div>
    </div>

    <!-- 1-CLICK TOPIC PRESETS -->
    <div class="templates-bar">
      <span style="font-size:13px; font-weight:700; color:#38bdf8;">⚡ Quick 1-Click Topic Presets:</span>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button type="button" class="btn-template" onclick="applyPreset('video_agency')">🎬 Video Editing & Ads Agency</button>
        <button type="button" class="btn-template" onclick="applyPreset('real_estate')">🏢 Real Estate & Property</button>
        <button type="button" class="btn-template" onclick="applyPreset('clinic')">🩺 Clinic & Healthcare</button>
        <button type="button" class="btn-template" onclick="applyPreset('ecommerce')">🛍️ E-Commerce Store</button>
        <button type="button" class="btn-template" onclick="applyPreset('gym')">🏋️ Gym & Fitness</button>
      </div>
    </div>

    <div class="grid">
      <!-- LEFT COLUMN: TRAINING FORM -->
      <div>
        <form id="trainingForm" onsubmit="saveTraining(event)">
          <div class="panel">
            <h3>🏷️ Core Identity & Business Topic</h3>
            
            <div class="form-group">
              <label>Training Topic / Field of Expertise</label>
              <input type="text" id="topic" value="${training.topic}" placeholder="e.g. Real Estate in Mumbai / Dental Clinic in Delhi / Video Editing Agency" required>
              <div class="form-help">Bot ko kis topic ya field ka expert banana hai.</div>
            </div>

            <div class="form-group">
              <label>Business / Brand / Creator Name</label>
              <input type="text" id="businessName" value="${training.businessName}" placeholder="e.g. BWB Media / Dr. Sharma Clinic / Skyline Realty" required>
            </div>

            <div class="form-group">
              <label>Bot Persona & Voice</label>
              <input type="text" id="persona" value="${training.persona}" placeholder="e.g. Aryan (Consultative, energetic, helpful friend)">
            </div>
          </div>

          <div class="panel">
            <h3>📖 Knowledge Base, Services & Pricing Rules</h3>

            <div class="form-group">
              <label>Custom Instructions & Behavior Guidelines</label>
              <textarea id="instructions" rows="4" placeholder="e.g. Talk naturally in everyday Hinglish. Always offer a free consultation call. Never mention competitors.">${training.instructions}</textarea>
              <div class="form-help">Bot ko baat karte waqt kin rules ka dhyan rakhna hai.</div>
            </div>

            <div class="form-group">
              <label>Detailed Business Information, Price List & Offerings</label>
              <textarea id="knowledgeText" rows="7" placeholder="Paste full details of your services, package prices, turnaround time, portfolio links, address, timings...">${training.knowledgeText}</textarea>
              <div class="form-help">Aapke services ki poori jaankari, rate list, timing, etc.</div>
            </div>
          </div>

          <div class="panel">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid #334155; padding-bottom:10px;">
              <h3 style="margin:0; border:none; padding:0;">❓ Custom FAQs / Q&A Knowledge</h3>
              <button type="button" class="btn btn-primary" onclick="addFaqRow()" style="font-size:12px; padding:6px 12px;">➕ Add Question</button>
            </div>
            
            <div id="faqsContainer">
              <!-- Render existing FAQs -->
              ${(training.faqs || []).map((f, idx) => `
                <div class="faq-item" id="faq-row-${idx}">
                  <div class="faq-item-header">
                    <b style="color:#38bdf8; font-size:12px;">Q&A #${idx + 1}</b>
                    <button type="button" class="btn btn-danger" style="font-size:11px; padding:3px 8px;" onclick="removeFaqRow(${idx})">🗑️ Remove</button>
                  </div>
                  <input type="text" class="faq-q" style="margin-bottom:8px; padding:8px 12px; font-size:13px; background:#1e293b; border:1px solid #475569; border-radius:6px; color:white; width:100%;" placeholder="Customer Question (e.g. Kitne din me deliver hoga?)" value="${f.q.replace(/"/g, '&quot;')}">
                  <textarea class="faq-a" rows="2" style="padding:8px 12px; font-size:13px; background:#1e293b; border:1px solid #475569; border-radius:6px; color:white; width:100%;" placeholder="Bot Answer">${f.a.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                </div>
              `).join('')}
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:12px; margin-bottom:30px;">
            <button type="submit" class="btn btn-success" style="font-size:15px; padding:12px 28px;">
              💾 Save Training & Update Bot Brain
            </button>
          </div>
        </form>
      </div>

      <!-- RIGHT COLUMN: LIVE TRAINING SIMULATOR -->
      <div>
        <div class="panel" style="position:sticky; top:20px;">
          <h3>
            <span>🧪 Live Training Simulator</span>
            <span style="font-size:11px; background:#064e3b; color:#34d399; padding:2px 8px; border-radius:10px; margin-left:auto;">TEST HERE</span>
          </h3>
          <p style="color:#94a3b8; font-size:12.5px; margin-bottom:14px;">
            Aapne jo bhi training save ki hai, use screen par hi turant test karein! Dekhiye bot kaise naye topic par jawab deta hai.
          </p>

          <div class="chat-box">
            <div class="chat-header">
              <span>🤖 BWB Brain Simulator (${currentMode.toUpperCase()})</span>
              <button onclick="clearChat()" style="background:none; border:none; color:#94a3b8; font-size:11px; cursor:pointer;">Clear</button>
            </div>
            <div class="chat-messages" id="simMessages">
              <div class="msg-bubble msg-bot">
                Hello! Main aapka trained AI bot hoon. Mujhse mere training topic ya services ke baare me kuch bhi poochhiye! 😊
              </div>
            </div>
            <form class="chat-input-bar" onsubmit="sendSimMessage(event)">
              <input type="text" id="simInput" placeholder="Type a test message (e.g. Aapke charges kya hain?)..." autocomplete="off">
              <button type="submit" class="btn btn-primary" style="padding:8px 14px;">Send</button>
            </form>
          </div>

          <div style="margin-top:14px; font-size:11.5px; color:#64748b; line-height:1.4;">
            💡 <b>Pro-Tip:</b> Aap yahan rates, turnaround time, location, ya koi bhi tricky question poochh kar check kar sakte hain ki bot training follow kar raha hai.
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let faqCounter = ${training.faqs ? training.faqs.length : 0};

    function addFaqRow() {
      const idx = faqCounter++;
      const html = \`
        <div class="faq-item" id="faq-row-\${idx}">
          <div class="faq-item-header">
            <b style="color:#38bdf8; font-size:12px;">Q&A #\${idx + 1}</b>
            <button type="button" class="btn btn-danger" style="font-size:11px; padding:3px 8px;" onclick="removeFaqRow(\${idx})">🗑️ Remove</button>
          </div>
          <input type="text" class="faq-q" style="margin-bottom:8px; padding:8px 12px; font-size:13px; background:#1e293b; border:1px solid #475569; border-radius:6px; color:white; width:100%;" placeholder="Customer Question (e.g. Kitne din me deliver hoga?)" value="">
          <textarea class="faq-a" rows="2" style="padding:8px 12px; font-size:13px; background:#1e293b; border:1px solid #475569; border-radius:6px; color:white; width:100%;" placeholder="Bot Answer"></textarea>
        </div>
      \`;
      document.getElementById('faqsContainer').insertAdjacentHTML('beforeend', html);
    }

    function removeFaqRow(idx) {
      const row = document.getElementById('faq-row-' + idx);
      if (row) row.remove();
    }

    async function saveTraining(e) {
      e.preventDefault();
      const topic = document.getElementById('topic').value.trim();
      const businessName = document.getElementById('businessName').value.trim();
      const persona = document.getElementById('persona').value.trim();
      const instructions = document.getElementById('instructions').value.trim();
      const knowledgeText = document.getElementById('knowledgeText').value.trim();

      const faqItems = document.querySelectorAll('.faq-item');
      const faqs = [];
      faqItems.forEach(item => {
        const q = item.querySelector('.faq-q')?.value?.trim();
        const a = item.querySelector('.faq-a')?.value?.trim();
        if (q && a) faqs.push({ q, a });
      });

      try {
        const res = await fetch('/api/training/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, businessName, persona, instructions, knowledgeText, faqs })
        });
        const data = await res.json();
        if (data.success) {
          alert('🎉 Success! Bot is now trained on: "' + topic + '". Live brain updated immediately!');
          // Add system message in simulator
          appendBotMessage('✅ System Notice: Nayi training save ho gayi hai! Ab aap naye topic ("' + topic + '") ke baare me mujhse poochhein.');
        } else {
          alert('❌ Error: ' + data.error);
        }
      } catch (err) {
        alert('Network error: ' + err.message);
      }
    }

    async function resetDefault() {
      if (!confirm('Are you sure you want to reset training to the default BWB Media template?')) return;
      try {
        const res = await fetch('/api/training/reset', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert('✅ Reset successful!');
          location.reload();
        }
      } catch (e) {
        alert('Failed: ' + e.message);
      }
    }

    // 1-Click Templates
    const PRESETS = {
      video_agency: {
        topic: "Video Editing & Meta Ads Agency",
        businessName: "BWB Media",
        persona: "Aryan (Helpful, energetic, conversational)",
        instructions: "Talk in natural casual Hinglish. Understand creator style, explain retention pacing, give exact pricing.",
        knowledgeText: "Services:\\n- Reels/Shorts: ₹800 to ₹2500\\n- YouTube Long Videos: ₹2500 to ₹10,000\\n- Meta Ads: ₹15,000 to ₹35,000/mo\\nPortfolio: https://instagram.com/bwbmedia",
        faqs: [
          { q: "Kitne din me deliver hoga?", a: "Reels 24 se 48 ghante me deliver ho jati hain." },
          { q: "Sample milega?", a: "Haan, hum 1-reel paid trial provide karte hain." }
        ]
      },
      real_estate: {
        topic: "Real Estate & Luxury Apartments",
        businessName: "Prime City Properties",
        persona: "Rohit (Professional, trusted property advisor)",
        instructions: "Talk politely in Hindi/English. Understand budget, location preference, and recommend suitable 2BHK/3BHK flats.",
        knowledgeText: "We deal in luxury residential and commercial properties.\\nProjects:\\n- 2BHK Luxury Flats: Starting ₹75 Lakhs\\n- 3BHK Premium: Starting ₹1.2 Crore\\n- Commercial Shops: Starting ₹45 Lakhs\\nLocations: Noida, Gurgaon, South Delhi\\nSite Visits: Free cab pickup on weekends.",
        faqs: [
          { q: "Is home loan available?", a: "Yes, we have tie-ups with SBI, HDFC, and ICICI with 8.5% interest rate." },
          { q: "When is the possession date?", a: "Ready to move in for Phase 1, and Dec 2026 for Phase 2." }
        ]
      },
      clinic: {
        topic: "Dental & Healthcare Clinic",
        businessName: "Apex Dental Care",
        persona: "Dr. Sharma Assistant (Caring, polite, medical advisor)",
        instructions: "Be very polite and empathetic. Answer treatment queries, inform about painless procedures, and invite for checkup.",
        knowledgeText: "Apex Dental Care offers painless treatments with advanced laser technology.\\nServices:\\n- Consultation Checkup: Free this week\\n- Root Canal Treatment (RCT): ₹2,500\\n- Teeth Whitening: ₹3,000\\n- Invisible Braces/Aligners: ₹35,000 onwards\\nTimings: 10:00 AM - 8:00 PM (All days except Sunday evening)",
        faqs: [
          { q: "Is root canal painful?", a: "No, we use painless computerized anesthesia for 100% comfort." },
          { q: "Where is the clinic located?", a: "Opposite City Mall, Main Market Road." }
        ]
      },
      ecommerce: {
        topic: "Online Fashion & Sneaker Store",
        businessName: "UrbanKicks India",
        persona: "Kabir (Trendy, stylish sneakerhead)",
        instructions: "Be cool, casual, and energetic. Help with shoe sizing, tracking orders, and return policy.",
        knowledgeText: "UrbanKicks sells 100% authentic streetwear sneakers and hoodies.\\nOffers: Flat 20% off with code FIRST20\\nShipping: Free express delivery across India in 3-5 days\\nReturn Policy: 7-day hassle-free exchange/return\\nCOD Available on all orders above ₹999.",
        faqs: [
          { q: "How do I track my order?", a: "You will receive a WhatsApp tracking link as soon as your order dispatches." },
          { q: "Are sneakers 100% authentic?", a: "Yes, each pair undergoes a 5-step authenticity check before dispatch." }
        ]
      },
      gym: {
        topic: "Gym, Fitness & Personal Training",
        businessName: "IronFit Gym & Crossfit",
        persona: "Coach Vikram (Motivating, fitness mentor)",
        instructions: "Be motivating and high energy! Explain membership plans, personal training benefits, and diet support.",
        knowledgeText: "IronFit is a premium 24/7 gym with imported equipment, steam room, and certified coaches.\\nMembership Plans:\\n- 3 Months: ₹4,999\\n- 6 Months: ₹7,999\\n- 1 Year Full Access: ₹12,999\\nFree 3-Day Trial Pass available for new members!\\nIncludes free diet chart and body composition analysis.",
        faqs: [
          { q: "Are trainers available for beginners?", a: "Yes, our certified floor trainers guide every beginner on form and workout routines for free." },
          { q: "What are gym timings?", a: "Open 6:00 AM to 11:00 PM Monday through Saturday, and 8:00 AM to 6:00 PM Sunday." }
        ]
      }
    };

    function applyPreset(key) {
      const p = PRESETS[key];
      if (!p) return;
      document.getElementById('topic').value = p.topic;
      document.getElementById('businessName').value = p.businessName;
      document.getElementById('persona').value = p.persona;
      document.getElementById('instructions').value = p.instructions;
      document.getElementById('knowledgeText').value = p.knowledgeText;

      const container = document.getElementById('faqsContainer');
      container.innerHTML = '';
      faqCounter = 0;
      p.faqs.forEach(f => {
        const idx = faqCounter++;
        const html = \`
          <div class="faq-item" id="faq-row-\${idx}">
            <div class="faq-item-header">
              <b style="color:#38bdf8; font-size:12px;">Q&A #\${idx + 1}</b>
              <button type="button" class="btn btn-danger" style="font-size:11px; padding:3px 8px;" onclick="removeFaqRow(\${idx})">🗑️ Remove</button>
            </div>
            <input type="text" class="faq-q" style="margin-bottom:8px; padding:8px 12px; font-size:13px; background:#1e293b; border:1px solid #475569; border-radius:6px; color:white; width:100%;" value="\${f.q}">
            <textarea class="faq-a" rows="2" style="padding:8px 12px; font-size:13px; background:#1e293b; border:1px solid #475569; border-radius:6px; color:white; width:100%;">\${f.a}</textarea>
          </div>
        \`;
        container.insertAdjacentHTML('beforeend', html);
      });

      alert('⚡ Loaded preset: "' + p.topic + '"! Click "Save Training" below to train the bot brain.');
    }

    // Live Simulator Functions
    function appendUserMessage(text) {
      const div = document.createElement('div');
      div.className = 'msg-bubble msg-user';
      div.innerText = text;
      document.getElementById('simMessages').appendChild(div);
      div.scrollIntoView({ behavior: 'smooth' });
    }

    function appendBotMessage(text) {
      const div = document.createElement('div');
      div.className = 'msg-bubble msg-bot';
      div.innerText = text;
      document.getElementById('simMessages').appendChild(div);
      div.scrollIntoView({ behavior: 'smooth' });
    }

    function clearChat() {
      document.getElementById('simMessages').innerHTML = '<div class="msg-bubble msg-bot">Simulator reset. Type a message below to test!</div>';
    }

    async function sendSimMessage(e) {
      e.preventDefault();
      const input = document.getElementById('simInput');
      const text = input.value.trim();
      if (!text) return;

      input.value = '';
      appendUserMessage(text);

      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'msg-bubble msg-bot';
      loadingDiv.id = 'simLoadingMsg';
      loadingDiv.innerText = '⏳ AI thinking with new training...';
      document.getElementById('simMessages').appendChild(loadingDiv);
      loadingDiv.scrollIntoView();

      try {
        const res = await fetch('/api/training/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        loadingDiv.remove();

        if (data.success && data.reply) {
          appendBotMessage(data.reply);
        } else {
          appendBotMessage('❌ Error: ' + (data.error || 'Failed to generate response'));
        }
      } catch (err) {
        loadingDiv.remove();
        appendBotMessage('❌ Connection error: ' + err.message);
      }
    }
  </script>
  </div>
  `;

  const html = renderSidebarLayout({
    title: 'AI Training Studio',
    activeNav: 'training',
    contentHtml
  });

  res.send(html);
});

module.exports = router;

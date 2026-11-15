const fs = require('fs');
const path = require('path');

const TRAINING_FILE = path.join(__dirname, '../../data/training.json');

const DEFAULT_TRAINING = {
  topic: "Video Editing & Meta Ads Agency",
  businessName: "BWB Media",
  persona: "Aryan (Helpful, energetic, empathetic, conversational)",
  instructions: "Talk naturally in everyday Hindi/Hinglish. Understand client goals, suggest high-retention video strategies, and give clear pricing.",
  knowledgeText: `BWB Media specializes in high-retention video editing (Reels, Shorts, YouTube) and Meta Ads.
Services & Pricing:
- Reels/Shorts: ₹800 to ₹2,500/reel (motion graphics, captions, sound effects)
- YouTube Long Videos: ₹2,500 to ₹10,000/video (storytelling, cuts, sound design)
- Meta Ads: ₹15,000 to ₹35,000/month (ad setup, creative angles, daily ROAS optimization)
- Web & Funnels: Starting ₹15,000
Recent Showreel: https://instagram.com/bwbmedia
Contact: +91 7008872017 | contact@bwbmedia.com
Timings: 10:00 AM - 7:00 PM (Monday to Saturday)`,
  faqs: [
    {
      q: "How fast do you deliver videos?",
      a: "Reels typically take 24 to 48 hours per draft, and YouTube long videos take 48 to 72 hours."
    },
    {
      q: "Which editing software do you use?",
      a: "Our team uses Adobe Premiere Pro, After Effects, and DaVinci Resolve Studio."
    },
    {
      q: "Can you provide a test sample?",
      a: "Yes! We can do a 1-reel paid trial so you can experience our retention pacing and creative quality."
    }
  ],
  updatedAt: new Date().toISOString()
};

function ensureStorage() {
  const dir = path.dirname(TRAINING_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(TRAINING_FILE)) {
    fs.writeFileSync(TRAINING_FILE, JSON.stringify(DEFAULT_TRAINING, null, 2), 'utf-8');
  }
}

function getTrainingData() {
  try {
    ensureStorage();
    const raw = fs.readFileSync(TRAINING_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_TRAINING, ...parsed };
  } catch (e) {
    return DEFAULT_TRAINING;
  }
}

function saveTrainingData(newData) {
  try {
    ensureStorage();
    const current = getTrainingData();
    const merged = {
      ...current,
      ...newData,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(TRAINING_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    console.log(`[KnowledgeBase] Training updated successfully for topic: "${merged.topic}"`);
    return merged;
  } catch (e) {
    console.error('[KnowledgeBase] Error saving training:', e.message);
    throw e;
  }
}

function resetTrainingToDefault() {
  ensureStorage();
  fs.writeFileSync(TRAINING_FILE, JSON.stringify(DEFAULT_TRAINING, null, 2), 'utf-8');
  return DEFAULT_TRAINING;
}

function getPromptContext() {
  const t = getTrainingData();
  const faqsText = (t.faqs || []).map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n\n');

  return `
PRIMARY TOPIC / DOMAIN OF EXPERTISE:
${t.topic}

BUSINESS / CREATOR NAME:
${t.businessName}

PERSONA & TONE:
${t.persona}

CUSTOM INSTRUCTIONS & GUIDELINES:
${t.instructions}

CORE KNOWLEDGE & PRICING:
${t.knowledgeText}

FREQUENTLY ASKED QUESTIONS (FAQ):
${faqsText}
`;
}

module.exports = {
  getTrainingData,
  saveTrainingData,
  resetTrainingToDefault,
  getPromptContext
};

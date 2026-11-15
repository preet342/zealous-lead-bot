const config = require('../config');
const leadService = require('./leadService');
const notificationService = require('./notificationService');
const chatManager = require('./chatManager');
const knowledgeBase = require('./knowledgeBase');
const mediaService = require('./mediaService');
const modeService = require('./modeService');
const axios = require('axios');

// Comprehensive Indian & International Name Dictionaries for Gender Recognition
const FEMALE_NAMES = new Set([
  'preety', 'priti', 'priya', 'pooja', 'puja', 'neha', 'sunita', 'anita', 'kavita',
  'shreya', 'sneha', 'swati', 'ritu', 'simran', 'komal', 'geeta', 'gita', 'divya',
  'deepa', 'deepika', 'ananya', 'aarti', 'arti', 'sonam', 'sakshi', 'muskan', 'muskaan',
  'richa', 'rashmi', 'renu', 'payal', 'sheetal', 'kajal', 'manisha', 'meena', 'radha',
  'bhavna', 'sonia', 'sonali', 'nidhi', 'shalini', 'tanu', 'taniya', 'tanya', 'rani',
  'kumari', 'devi', 'kaur', 'khatun', 'fatima', 'ayesha', 'zainab', 'parveen', 'jyoti',
  'monika', 'rekha', 'suman', 'sapna', 'khushi', 'prerna', 'pallavi', 'anjali',
  'sweta', 'shweta', 'mansi', 'tanvi', 'kriti', 'kritika', 'nandini', 'ishita', 'megha',
  'alisha', 'varsha', 'riya', 'alka', 'tina', 'shikha', 'priyanka', 'garima', 'archana',
  'sarita', 'reena', 'babita', 'chhaya', 'dimple', 'karishma', 'kareena', 'madhu', 'nisha'
]);

const MALE_NAMES = new Set([
  'sonu', 'rahul', 'rohit', 'amit', 'sumit', 'vikas', 'ankit', 'raj', 'rajesh',
  'rakesh', 'suraj', 'deepak', 'manoj', 'ajay', 'vijay', 'sachin', 'mohit', 'arun',
  'varun', 'alok', 'ashish', 'sandeep', 'pradip', 'pradeep', 'pankaj', 'suresh', 'mahesh',
  'dinesh', 'ram', 'shyam', 'krishna', 'shiv', 'vishal', 'rohan', 'aman', 'abhishek',
  'gaurav', 'harsh', 'karan', 'vivek', 'ritesh', 'kunal', 'nikhil', 'sunny',
  'manish', 'anil', 'sunil', 'mukesh', 'dheeraj', 'ravi', 'kashif', 'ali', 'khan',
  'arjun', 'aditya', 'mayank', 'shubham', 'saurabh', 'anurag', 'yash', 'dev', 'prateek'
]);

/**
 * Super Advanced Gender & Profile Intelligence
 * Analyzes contact display name, past conversation messages, and user self-declarations
 */
function detectGenderAndProfile(contactName, messages = [], leadData = {}) {
  let rawName = (contactName || leadData.name || '').trim();
  // Strip phone numbers or @lid suffixes
  rawName = rawName.replace(/\+?\d+(@[a-z.]+)?/gi, '').trim();
  rawName = rawName.replace(/[^\p{L}\s]/gu, '').trim();

  const firstName = rawName.split(/\s+/)[0]?.toLowerCase() || '';
  let gender = leadData.gender || 'neutral';
  let genderConfidence = 'low';
  let genderNotes = 'default';

  // 1. Check user self-declarations in message history (highest priority)
  const userMessages = (messages || []).filter(m => m.sender === 'user').slice(-15);
  for (const m of userMessages) {
    const txt = (m.text || '').toLowerCase();
    if (/\b(beti|ladki|aurat|female|behen|sister|patni|wife|maa|mother|daughter)\s*(hun|hoon|me|mein|hu)\b/i.test(txt) ||
        /\b(main|me|mein)\s*(beti|ladki|female|girl|sister)\b/i.test(txt) ||
        /\b(kartii|karti|rahi|gayi|sochi)\s*(hoon|hun|thi)\b/i.test(txt) ||
        /\bbhai\s*(nhi|nahi|mat bolo|kisko)\b/i.test(txt)) {
      gender = 'female';
      genderConfidence = 'high';
      genderNotes = 'self-identified as female/daughter';
      break;
    }
    if (/\b(beta|ladka|aadmi|male|bhai|brother|pati|husband|baap|father|son)\s*(hun|hoon|me|mein|hu)\b/i.test(txt) ||
        /\b(main|me|mein)\s*(beta|ladka|male|boy|brother)\b/i.test(txt) ||
        /\b(karta|raha|gaya|socha)\s*(hoon|hun|tha)\b/i.test(txt)) {
      gender = 'male';
      genderConfidence = 'high';
      genderNotes = 'self-identified as male';
      break;
    }
  }

  // 2. Check contact first name against dictionary
  if (genderConfidence !== 'high' && firstName) {
    if (FEMALE_NAMES.has(firstName)) {
      gender = 'female';
      genderConfidence = 'high';
      genderNotes = 'female name match: ' + firstName;
    } else if (MALE_NAMES.has(firstName)) {
      gender = 'male';
      genderConfidence = 'high';
      genderNotes = 'male name match: ' + firstName;
    } else if (/(a|i|ee|ti|ka|ya|na|ta)$/i.test(firstName) && firstName.length > 3) {
      gender = 'female';
      genderConfidence = 'medium';
      genderNotes = 'feminine phonetics ending: ' + firstName;
    }
  }

  const cleanDisplayName = rawName ? rawName.split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : '';
  const firstWordName = cleanDisplayName ? cleanDisplayName.split(' ')[0] : '';
  const respectfulSalutation = firstWordName ? (firstWordName + ' ji') : 'ji';

  return {
    gender,
    genderConfidence,
    genderNotes,
    cleanName: cleanDisplayName,
    firstName: firstWordName,
    respectfulSalutation,
    honorific: 'ji',
    verbGender: gender === 'female' ? 'feminine' : (gender === 'male' ? 'masculine' : 'neutral')
  };
}

/**
 * Super Advanced Emotion & Intent Detection
 */
function detectEmotionAndIntent(text) {
  const lower = (text || '').toLowerCase();
  let emotion = 'neutral';
  let intent = 'conversation';

  if (/😭|😢|🥺|😔|💔|ansu|aansu|dukhi|sad|pain|chhot|dard|cry/i.test(text)) {
    emotion = 'sad_or_crying';
  } else if (/😡|🤬|bekar|bakwas|gussa|hate|fraud|dhoka/i.test(lower)) {
    emotion = 'upset_or_angry';
  } else if (/😂|🤣|hah|haha|mast|badhiya|super|khush|maza/i.test(lower)) {
    emotion = 'joyful_or_playful';
  } else if (/urgent|turant|jaldi|asap|emergency/i.test(lower)) {
    emotion = 'urgent';
  }

  if (/bhai\s*(nhi|nahi)|(beti|ladki|beta|ladka)\s*(hun|hoon)/i.test(lower)) {
    intent = 'identity_clarification';
  } else if (/price|rate|charge|cost|kitna|paisa|budget|rupaye|fees/i.test(lower)) {
    intent = 'pricing_inquiry';
  } else if (/portfolio|sample|demo|work|kaam|dikhao|bhejo/i.test(lower)) {
    intent = 'portfolio_request';
  } else if (/^(hi|hello|hey|namaste|ram ram|kese ho|kaise ho)/i.test(lower)) {
    intent = 'greeting';
  }

  return { emotion, intent };
}

/**
 * Super Advanced Output Sanitizer:
 * 100% Strict Ban on "bhai", "bhaiya", "bro", "dost", "yaar", "buddy".
 * Enforces respectful feminine/masculine grammatical Hindi verbs based on profile.
 */
function sanitizeAiResponse(text, profileGender = {}) {
  if (!text) return '';
  let cleaned = text;

  // 1. Remove slang in greeting combinations
  cleaned = cleaned.replace(/\b([Aa]rre|[Oo]ye|[Hh]ey|[Hh]i|[Hh]ello)\s+(?:bhai|bhaiya|bro|dost|yaar|buddy)\b/gi, (m, p1) => p1);
  cleaned = cleaned.replace(/\b([Hh]aan|[Nn]ahi)\s+bilkul\s+(?:bhai|bhaiya|bro|dost|yaar|buddy)\b/gi, (m, p1) => p1 + ' bilkul');
  cleaned = cleaned.replace(/\b(shukriya|thanks|thank\s*you)\s+(?:bhai|bhaiya|bro|dost|yaar|buddy)\b/gi, (m, p1) => p1);
  cleaned = cleaned.replace(/\b(arre|bilkul|theek\s*hai)\s+dost\b/gi, (m, p1) => p1);

  // 2. Remove all standalone banned slang words
  cleaned = cleaned.replace(/\b(bhai|bhaiya|bro|dost|yaar|buddy|dude|mitr)\b/gi, '');

  // 3. For female contacts, strictly enforce feminine Hindi verb inflections
  if (profileGender && profileGender.gender === 'female') {
    cleaned = cleaned.replace(/\bkaise\s+ho\s+aap\b/gi, 'kaisi hain aap');
    cleaned = cleaned.replace(/\bkaise\s+ho\b/gi, 'kaisi hain aap');
    cleaned = cleaned.replace(/\bkaise\s+hain\s+aap\b/gi, 'kaisi hain aap');
    cleaned = cleaned.replace(/\bkaise\s+hain\b/gi, 'kaisi hain');
    cleaned = cleaned.replace(/\bkarta\s+hai\b/gi, 'karti hain');
    cleaned = cleaned.replace(/\bkarta\s+h[uo]{1,2}n\b/gi, 'karti hoon');
  }

  // 4. Clean up formatting and typography glitches
  cleaned = cleaned.replace(/,\s*,+/g, ',');
  cleaned = cleaned.replace(/!\s*!+/g, '!');
  cleaned = cleaned.replace(/\s+([!?,.])/g, (m, p1) => p1);
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  return cleaned.trim();
}

/**
 * Handle incoming message from any platform with living human-like empathy & sales intelligence
 * @param {string} userId - User's platform ID or phone number
 * @param {string} channel - 'whatsapp' | 'whatsapp_qr' | 'telegram' | 'facebook' | 'instagram'
 * @param {string} incomingText - Text sent by the user
 * @returns {Promise<string>} - Human-like reply to send back
 */
async function processMessage(userId, channel, incomingText) {
  const text = (incomingText || '').trim();
  if (!text) return '';

  // 1. Log incoming user message to unified chat history
  chatManager.logMessage(channel, userId, 'user', text);

  // 2. Human Handover Check: If human agent has taken over this chat, do not auto-reply
  if (chatManager.isHumanTakeoverActive(channel, userId)) {
    console.log(`[AIService] Human agent takeover is active for ${channel}:${userId}. Skipping AI auto-reply.`);
    return '';
  }

  const session = leadService.getSession(userId, channel);
  const leadData = session.leadData || {};

  // Retrieve unified conversation history
  const conv = chatManager.getConversation(channel, userId);
  const contactName = conv.displayName || conv.userName || leadData.name || '';
  const profileGender = detectGenderAndProfile(contactName, conv.messages || [], leadData);
  const emotionIntent = detectEmotionAndIntent(text);

  // Sync profile findings into leadData
  if (!leadData.name && profileGender.cleanName) {
    leadData.name = profileGender.cleanName;
  }
  if (!leadData.gender && profileGender.gender !== 'neutral') {
    leadData.gender = profileGender.gender;
  }

  // Check if user specifically requested media, portfolio, samples, rate card, or meeting link
  const mediaReq = mediaService.detectMediaRequest(text);
  if (mediaReq) {
    const mediaReply = sanitizeAiResponse(mediaReq.formattedText, profileGender);
    chatManager.logMessage(channel, userId, 'bot', mediaReply);
    return mediaReply;
  }

  // Dynamic Information Extraction from Natural Dialogue:
  const phoneMatch = text.match(/(\+?\d[\d -]{8,15}\d)/);
  if (phoneMatch && !leadData.phone) {
    leadData.phone = phoneMatch[0].replace(/\s+/g, '');
  }

  const budgetMatch = text.match(/(₹|rs\.?|inr)?\s*([0-9]+[kK]?|[0-9,]{3,})/i);
  if (budgetMatch && !leadData.budget && !/^(hi|hello|no|yes)$/i.test(text)) {
    leadData.budget = budgetMatch[0];
  }

  const nameMatch = text.match(/(?:my name is|i am|mera naam|naam hai|this is)\s+([A-Za-z\u0900-\u097F]+(?:\s+[A-Za-z\u0900-\u097F]+)?)/i);
  if (nameMatch && !leadData.name) {
    leadData.name = nameMatch[1].trim();
  }

  if (/video|edit|reel|short|youtube|podcast/i.test(text)) leadData.service = 'Video Editing & Retention Reels';
  else if (/meta|ad|facebook|fb|insta.*ad|campaign|roas|lead/i.test(text)) leadData.service = 'Meta Ads / Social Media Marketing';
  else if (/funnel|landing|website|web|shopify|store|site/i.test(text)) leadData.service = 'Website & Funnel Development';
  else if (/whatsapp|bot|automation|waba|crm/i.test(text)) leadData.service = 'WhatsApp Automation & CRM';

  // Check if user wants to reset or start over
  if (/^(restart|reset|start over)$/i.test(text)) {
    leadService.updateSession(userId, channel, { step: 'CONVERSING', leadData: {} });
    const reply = `Hello! Welcome back to *${config.ai.businessName}* 👋\n\nAlways happy to connect! How can we help your content or business grow today?`;
    chatManager.logMessage(channel, userId, 'bot', reply);
    return reply;
  }

  let reply = '';

  // Call Living Human Gemini Engine with Multi-Turn Memory & Profile Awareness
  if (config.ai.geminiApiKey) {
    reply = await callLivingHumanGemini(channel, userId, text, leadData, profileGender, emotionIntent);
  }

  // Empathetic Living Human Fallback Engine
  if (!reply) {
    reply = generateEmpatheticHumanFallback(text, leadData, session, profileGender, emotionIntent);
  }

  // Sanitize the final output: 100% strip all banned slang (bhai/dost/bro) & enforce gender agreements
  reply = sanitizeAiResponse(reply, profileGender);

  // Check if lead has key information (Name & Phone) and notify admin
  if (leadData.name && leadData.phone && session.step !== 'COMPLETED') {
    session.step = 'COMPLETED';
    session.leadData = leadData;
    leadService.updateSession(userId, channel, session);

    const savedLead = leadService.saveLead({
      channel,
      userId,
      leadData
    });

    await notificationService.notifyAdmin(savedLead);
  } else {
    session.leadData = leadData;
    leadService.updateSession(userId, channel, session);
  }

  // Log bot response in unified chat history
  chatManager.logMessage(channel, userId, 'bot', reply);
  return reply;
}

/**
 * Living Human Consciousness Gemini Engine with Multi-Turn Conversation Memory & Gender Alignment
 */
async function callLivingHumanGemini(channel, userId, userPrompt, leadInfo, profileGender = {}, emotionIntent = {}) {
  try {
    const context = knowledgeBase.getPromptContext();
    const botMode = modeService.getBotMode();

    // Gender Directives
    const genderDirective = profileGender.gender === 'female'
      ? `CRITICAL GENDER DIRECTIVE:
- The user is FEMALE (${profileGender.genderNotes}).
- ALWAYS use respectful feminine Hindi/Hinglish verb agreements (e.g., "Kaisi hain aap", "Aap kya karti hain", "Aap bataiye", "Aapki help").
- Address her respectfully as "${profileGender.respectfulSalutation}" or "Aap".
- NEVER address her as "bhai", "bhaiya", "bro", "dost", or use masculine verb endings.`
      : profileGender.gender === 'male'
      ? `CRITICAL GENDER DIRECTIVE:
- The user is MALE (${profileGender.genderNotes}).
- Address respectfully as "${profileGender.respectfulSalutation}" or "Aap" (e.g. "Kaise hain aap", "Aap bataiye").
- NEVER use informal slang like "bhai", "bhaiya", "bro", "dost", "yaar".`
      : `CRITICAL GENDER DIRECTIVE:
- Address respectfully with neutral polite Hindi ("Kaise hain aap", "Aap bataiye", "ji").
- NEVER assume gender or call the user "bhai", "bro", "dost", "yaar".`;

    const slangBanRule = `ABSOLUTE STRICT BAN ON INFORMAL SLANG:
- Under NO circumstance may you use words like "bhai", "bhaiya", "bro", "dost", "yaar", "buddy", or "dude".
- Even if the user uses slang, you MUST reply with polite respect using "ji", "aap", or "${profileGender.respectfulSalutation}".`;

    let systemPrompt = '';
    if (botMode === 'personal_human') {
      systemPrompt = `You are a real, genuine human companion talking directly from your WhatsApp phone (authentic voice of Biswa).
You are in a live, real-time chat on WhatsApp.

CURRENT MODE: [100% PERSONAL HUMAN COMPANION MODE - ZERO SALES PITCH]
${genderDirective}
${slangBanRule}

RULES:
1. TALK LIKE A REAL, CARING HUMAN:
   - Talk naturally in casual, warm Hindi/Hinglish ("Haan bilkul", "Aur bataiye kya chal raha hai", "Chinta mat kijiye", "Sab theek ho jayega").
   - If the user sent crying emojis (😭 😢) or expressed sadness, comfort them with deep empathy first before asking any questions.
   - If user clarified their identity (e.g. "beti hun me"), acknowledge with respect and care.
2. MULTI-TURN CONVERSATION MEMORY:
   - Carefully review the previous conversation history below.
   - ALWAYS talk according to the past conversation. Never ask questions that were already answered.
3. ZERO SALES PRESSURE: Do NOT pitch packages or ask for phone numbers for CRM.
4. TEXT-LIKE BREVITY: 1 to 3 short sentences maximum.

YOUR BACKGROUND / CONTEXT:
${context}`;
    } else if (botMode === 'normal_chat') {
      systemPrompt = `You are Aryan, a genuine, friendly, and knowledgeable creative advisor at ${config.ai.businessName}.
You are in a live chat on WhatsApp/Instagram/Telegram.

CURRENT MODE: [NORMAL CHAT & COMPANION MODE]
${genderDirective}
${slangBanRule}

RULES:
1. Provide a 100% natural, warm, and helpful human conversation.
2. Never push for sales, never pressure the user, and do not ask for their phone number.
3. Answer questions thoughtfully, give video editing & marketing tips, talk like an experienced, respectful peer.
4. Multi-turn memory: Maintain context from earlier messages in this chat.
5. Keep messages conversational (2-3 sentences max).

KNOWLEDGE BASE:
${context}`;
    } else {
      systemPrompt = `You are Aryan, Senior Client Growth Partner & Creative Strategist at ${config.ai.businessName}.
You are in a live, real-time chat with a client on WhatsApp/Instagram/Telegram.

CURRENT MODE: [HIGH-PERFORMANCE LEAD CLOSER MODE]
${genderDirective}
${slangBanRule}

GOAL: Chat with empathy, sales psychology, and naturally discover their project details and collect their Name and WhatsApp Mobile number.
1. EMPATHY & ACTIVE LISTENING: Acknowledge pain points emotionally first.
2. VALUE BEFORE CLOSING: Give exciting ideas, then naturally ask: "Aapka shubh naam aur WhatsApp number kya hai? Humari team aapko curated samples aur breakdown send kar sakegi."
3. MULTI-TURN CONVERSATION MEMORY: Actively remember everything discussed earlier in this chat.
4. Short mobile messages (2 to 4 sentences maximum).

PRICING & DATA:
- Reels/Shorts: ₹800 to ₹2,500
- YouTube Long-form: ₹2,500 to ₹10,000
- Meta Ads: ₹15,000 to ₹35,000/mo
- Funnels: ₹12,000 to ₹45,000
- Portfolio: https://instagram.com/bwbmedia

KNOWLEDGE BASE:
${context}

CLIENT PROFILE COLLECTED SO FAR:
${JSON.stringify(leadInfo)}`;
    }

    // Build rich multi-turn memory from recent chat history (up to 16 messages)
    const conv = chatManager.getConversation(channel, userId);
    const recentMessages = (conv.messages || []).slice(-16);

    const contents = [
      {
        role: 'user',
        parts: [{ text: `${systemPrompt}\n\nClient just messaged: "${userPrompt}"` }]
      }
    ];

    if (recentMessages.length > 1) {
      contents.length = 0;
      contents.push({
        role: 'user',
        parts: [{ text: systemPrompt }]
      });
      contents.push({
        role: 'model',
        parts: [{ text: `Understood! I will chat with genuine respect, following all gender directives for ${profileGender.gender} (${profileGender.respectfulSalutation}), zero slang words (no bhai/dost/bro), and keeping full context of past conversations.` }]
      });

      for (const m of recentMessages.slice(0, -1)) {
        contents.push({
          role: m.sender === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }]
        });
      }

      contents.push({
        role: 'user',
        parts: [{ text: userPrompt }]
      });
    }

    const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];
    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.ai.geminiApiKey}`;
        const res = await axios.post(url, { contents }, { timeout: 12000 });
        const replyText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (replyText) return replyText.trim();
      } catch (err) {
        continue;
      }
    }

    // 2. OpenRouter Hybrid Engine (Google Gemma & NVIDIA Nemotron Free)
    if (config.ai.openrouterApiKey) {
      const openRouterModels = [
        'google/gemma-4-26b-a4b-it:free',
        'nvidia/nemotron-3.5-lightning:free',
        'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        'google/gemma-4-31b-it:free'
      ];
      
      const openAiMessages = [
        { role: 'system', content: systemPrompt }
      ];
      for (const m of recentMessages) {
        openAiMessages.push({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        });
      }
      openAiMessages.push({ role: 'user', content: userPrompt });

      for (const orModel of openRouterModels) {
        try {
          const orRes = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: orModel,
            messages: openAiMessages,
            temperature: 0.7,
            max_tokens: 350
          }, {
            headers: {
              'Authorization': `Bearer ${config.ai.openrouterApiKey}`,
              'HTTP-Referer': 'https://bwbmedia.com',
              'X-Title': 'BWB Media AI Assistant',
              'Content-Type': 'application/json'
            },
            timeout: 15000
          });

          const orText = orRes.data?.choices?.[0]?.message?.content;
          if (orText) {
            // Strip any chain-of-thought tags (e.g. DeepSeek <think>...</think>)
            const cleanText = orText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            if (cleanText) return cleanText;
          }
        } catch (orErr) {
          continue;
        }
      }
    }
  } catch (err) {
    console.error('[AI] Gemini living human call failed:', err.response?.data?.error?.message || err.message);
  }

  return '';
}

/**
 * Empathetic Living Human Fallback Engine (when Gemini is unavailable or rate-limited)
 */
function generateEmpatheticHumanFallback(text, leadData, session, profileGender = {}, emotionIntent = {}) {
  const lower = text.toLowerCase();
  const botMode = modeService.getBotMode();
  const isFemale = profileGender.gender === 'female';
  const salutation = profileGender.respectfulSalutation || 'ji';
  const greetingVerb = isFemale ? 'kaisi hain aap' : 'kaise hain aap';

  // 1. Identity Clarification: User clarifies they are daughter / girl / sister / etc.
  if (/bhai\s*(nhi|nahi|mat bolo|kisko)|(uski|iski|inki|unki)\s*(beti|behen|wife|patni|mother|maa|sister|daughter)|(main|me)\s*(ladki|female|girl|beti|behen)|ladka\s*(nhi|nahi)|ladki\s*hun/i.test(lower)) {
    return `Arre, really sorry! Meri galti thi. Aap bataiye, ${isFemale ? 'kaisi hain aap' : 'kaise hain aap'}? Sab theek-thaak? Main aapki kya help kar sakta hoon? 😊`;
  }

  // 2. Emotional Distress / Crying / Tears
  if (emotionIntent.emotion === 'sad_or_crying' || /😭|😢|ansu|aansu/i.test(text)) {
    return `Arre kya hua? Ye ansu wali emoji kyun? Sab theek toh hai na? Bilkul pareshaan mat hoiye, main yahan hoon baat karne ke liye.`;
  }

  // PERSONAL HUMAN COMPANION MODE: 100% Real human companion, zero business, never asks for phone/lead
  if (botMode === 'personal_human') {
    if (/morning|subah/i.test(lower)) {
      return `Good morning! ☀️ Chai-paani ho gaya ya abhi uth rahe hain? Bataiye aaj ka kya plan hai!`;
    }
    if (/night|so raha|neend|shubh ratri/i.test(lower)) {
      return `Good night! Aaram kijiye mast, kal baat karte hain fresh mood se. Shubh raatri! 🌙`;
    }
    if (/^\?+$|kya hua|kuch to bol|bol na|bata na/i.test(lower)) {
      return `Haan bilkul, main sun raha hoon! Bataiye kya baat hai, sab theek toh hai na?`;
    }
    if (/^(done|ok|okay|theek|thik|haan|ha|yes|achha|sahi)$/i.test(lower)) {
      return `Sahi hai! Aur bataiye, aaj ka din kaisa chal raha hai? Sab badhiya?`;
    }
    if (/^(hi|hello|hey|namaste|salam|kese ho|ram ram|kaise ho|kya hal|kya haal)/i.test(lower)) {
      return `Hello ${salutation}! ${greetingVerb}? Sab badhiya? Bataiye aaj kya chal raha hai? 😊`;
    }
    if (/aur batao|or batao|kya chal raha|kya kar rahe|kuch naya|kaha ho|kidhar ho|kaha the/i.test(lower)) {
      return `Bas sab shanti hai, apna wahi routine chal raha hai. Aap bataiye, aaj din kaisa raha aapka?`;
    }
    if (/theek|mast|badhiya|sahi|all good|sab set|bindass/i.test(lower)) {
      return `Chalo sunke bohot accha laga! Bas hamesha khush rahiye aur mast rahiye. Kabhi bhi koi baat ho toh bejhijhak bataiye! ✨`;
    }
    if (/tension|pareshan|problem|sad|dukhi|bura|thak gaya|stress/i.test(lower)) {
      return `Arre bilkul tension mat lijiye. Life me ups and downs aate rehte hain. Thoda relax kijiye aur deep breathe lijiye, sab theek ho jayega. Main hoon na baat karne ke liye! ✨`;
    }
    if (/https?:\/\//i.test(lower)) {
      return `Arre, ye kiska link share kiya hai? Ruko abhi check karta hoon! Aur bataiye kya chal raha hai wahan? 😊`;
    }

    const randomFallbacks = [
      `Arre sahi baat hai! Aur bataiye, aaj kal kahan busy chal rahe hain aap?`,
      `Haan bilkul! Aur bataiye, khana-peena ho gaya? Aaj ka din kaisa raha?`,
      `Sahi keh rahe hain aap. Aur suniye, koi nayi taaza khabar?`,
      `Arre zabardast! Bas yahi positivity chahiye. Aur bataiye kya chal raha hai?`
    ];
    return randomFallbacks[Math.floor(Math.random() * randomFallbacks.length)];
  }

  // NORMAL CHAT MODE: Friendly, peer-like, 100% zero pressure
  if (botMode === 'normal_chat') {
    if (/^(hi|hello|hey|namaste|salam|kese ho|ram ram|kaise ho)/i.test(lower)) {
      if (leadData.name) {
        return `Hey ${salutation}! ${greetingVerb}? 😊 Bataiye aaj kis topic par baat karein ya content me kaise help kar sakta hoon?`;
      }
      return `Namaste! Welcome to *${config.ai.businessName}* 🌟\n\nMain Aryan hoon. ${greetingVerb}? Bataiye aaj aapke video editing ya content me kis tarah ki help chahiye?`;
    }

    if (/(budget.*(kam|low|tight|issue|problem)|(kam|low|tight).*budget|paisa.*(kam|nahi|problem)|sasta|afford)/i.test(lower)) {
      return `Budget ki bilkul chinta mat kijiye! Shuruat me har kisi ka budget thoda tight rehta hai. Free me bhi bohot saari aisi editing tricks aur tools hain jisse quality 10x ho sakti hai. Aap batao aapka content kis niche par hai?`;
    }

    if (lower.includes('price') || lower.includes('rate') || lower.includes('kitna') || lower.includes('charge') || lower.includes('cost')) {
      return `Humara estimate roughly rehta hai:\n• Reels/Shorts: ₹800 - ₹2,500/reel (motion graphics & sound design ke sath)\n• YouTube Long Video: ₹2,500 - ₹10,000\n• Meta Ads: ₹15,000 - ₹35,000/month\n\nAapko kis type ka content banana pasand hai?`;
    }

    if (/(kaha|kanha|kidhar).*(chale|gaye|ho|the)|(aur batao|or batao|or kuchh|kuchh aur|kuch aur|kya chal|kese ho|kaise ho|sab theek)/i.test(lower)) {
      return `Main yahi hoon aapke sath! 😊 Bas creators ke creative concepts dekh raha tha. Aap bataiye aaj aapka din kaisa chal raha hai? Kuch naya video plan kar rahe hain?`;
    }

    return `Arre bilkul! Content aur editing ko lekar koi bhi sawal ho toh bejhijhak poochhiye, main aapko poora explain kar doonga! ✨`;
  }

  // SALES CLOSER MODE: Warm consultative sales closer
  if (/(budget.*(kam|low|tight|issue|problem)|(kam|low|tight).*budget|paisa.*(kam|nahi|problem)|sasta|afford)/i.test(lower)) {
    return `Main bilkul samajh sakta hoon! Shuruat me har creator aur business ka budget thoda tight hota hai. Aap tension bilkul mat lijiye, hum pehle 2-3 reels ka ek affordable starter test kar sakte hain taaki aapko quality aur views me fark dikh sake.\n\nAapka shubh naam kya hai aur kis niche par aapka content hai?`;
  }

  if (/(bahar|300|500|saste|mehenga|expensive|dusre|freelancer)/i.test(lower)) {
    return `Aapki baat bilkul sahi hai, market me 300-500 me bhi mil jate hain, lekin wo basic cut-paste karte hain. BWB Media me hum retention editing (hook design, motion graphics, aur sound effects) karte hain jisse audience video pura dekhti hai aur engagement 3x badhti hai.\n\nAap ek baar humara recent showreel dekh lijiye, aapko khud fark samajh aa jayega!`;
  }

  if (/^(hi|hello|hey|namaste|salam|kese ho|ram ram|kaise ho)/i.test(lower)) {
    if (leadData.name) {
      return `Hey ${salutation}! ${greetingVerb}? Bataiye aaj aapke project ya business me hum kaise help kar sakte hain?`;
    }
    session.step = 'AWAITING_NAME';
    return `Namaste! Welcome to *${config.ai.businessName}* 🌟\n\nMain Aryan hoon. Hum creators aur businesses ko high-retention video editing aur Meta ads se scale karte hain.\n\nAap kis tarah ke project par kaam kar rahe hain? Aur aapka shubh naam kya hai?`;
  }

  if (lower.includes('price') || lower.includes('rate') || lower.includes('kitna') || lower.includes('charge') || lower.includes('cost')) {
    if (lower.includes('video') || lower.includes('reel') || lower.includes('edit')) {
      return `Humari video editing ₹800 se ₹2,500 per reel/short se start hoti hai (full motion graphics & sound design ke sath). YouTube long-form videos ₹2,500 - ₹10,000 me rehti hain.\n\nAapko roughly monthly kitni videos banwani hain? Aur aapka content kis topic par hai?`;
    }
    if (lower.includes('ad') || lower.includes('meta') || lower.includes('fb') || lower.includes('facebook') || lower.includes('insta')) {
      return `Meta aur Instagram ads management humara ₹15,000 se ₹35,000/month me start hota hai, jisme complete ad copy, creative design, target audience setup aur ROAS optimize karna sab included hai.\n\nAapka business kis category me hai aur monthly ad spend kitna plan kar rahe hain?`;
    }
    return `At *${config.ai.businessName}*, humare main plans:\n• Reels/Shorts Editing: ₹800 - ₹2,500 / reel\n• Meta Performance Ads: ₹15,000 - ₹35,000 / month\n• Funnels & Websites: ₹12,000 - ₹45,000\n\nAapko kis service ke baare me detail me janna hai?`;
  }

  if (/(kaha|kanha|kidhar).*(chale|gaye|ho|the)|(aur batao|or batao|or kuchh|kuchh aur|kuch aur|kya chal|kese ho|kaise ho|sab theek)/i.test(lower)) {
    return `Main yahi hoon aapke sath! 😊 BWB Media me hum video editing aur high-ROI ads par kaam kar rahe hain.\n\nAap bataiye, aapke content ya business ke liye kaunsi service sabse best rahegi — **High-Retention Video Editing** ya **Meta Ads**?`;
  }

  const nameIntroMatch = text.match(/(?:mera naam|my name is|i am|this is|naam hai|naam)\s+([a-zA-Z\u0900-\u097F\s]{2,25})/i);
  const isQuestionOrBanter = /(kaha|kanha|kya|kaise|kab|kyun|aur|or|kuch|batao|bataiye|chale|gaye|hai|ho|hello|hi|hey|ok|theek|ha|nahi|yes|no|good|thanks)/i.test(lower);

  if (nameIntroMatch) {
    leadData.name = nameIntroMatch[1].trim();
    session.step = 'AWAITING_PHONE';
    return `Pleasure to connect with you, *${leadData.name}* ji! 😊\n\nAapka WhatsApp ya contact number kya hai? Humari creative team aapke sath portfolio aur sample case studies share kar sakegi.`;
  } else if (session.step === 'AWAITING_NAME' && text.split(' ').length <= 3 && !/\d/.test(text) && !isQuestionOrBanter) {
    leadData.name = text.trim();
    session.step = 'AWAITING_PHONE';
    return `Pleasure to connect with you, *${leadData.name}* ji! 😊\n\nAapka WhatsApp ya contact number kya hai? Humari creative team aapke sath portfolio aur sample case studies share kar sakegi.`;
  }

  const phoneMatch = text.match(/(?:\+?91[\-\s]?)?[6-9]\d{9}|\d{8,}/);
  if (phoneMatch) {
    leadData.phone = phoneMatch[0].replace(/\D/g, '');
    session.step = 'AWAITING_SERVICE';
    return `Perfect, thanks *${leadData.name ? leadData.name + ' ji' : 'ji'}*! Number note kar liya hai 📱\n\nAap primarily kis cheez me interested hain — **Video Editing**, **Meta Performance Ads**, ya **Funnels & Automation**?`;
  }

  if (/^(ok|theek|ha|haan|yes|yup|sure|done|sahi|achha)$/i.test(lower)) {
    return `Great ${leadData.name ? '*' + leadData.name + '* ji' : ''}! 👍 Kya aapko humara recent video editing showreel dekhna hai ya seedha ek custom package plan discuss karein?`;
  }

  return `Bilkul ${leadData.name ? '*' + leadData.name + '* ji, ' : ''}hum aapke content aur brand ko next level par le jaane ke liye ready hain! ✨\n\nAap bataiye hum next step kya karein — recent sample edits dekhein ya direct 15-min ki quick strategy call schedule karein?`;
}

module.exports = {
  processMessage,
  callLivingHumanGemini,
  generateEmpatheticHumanFallback,
  detectGenderAndProfile,
  detectEmotionAndIntent,
  sanitizeAiResponse
};

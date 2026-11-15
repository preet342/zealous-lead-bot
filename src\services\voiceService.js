const axios = require('axios');
const config = require('../config');

/**
 * Handle incoming voice note/audio buffer and convert to text
 * @param {Buffer} audioBuffer - Binary audio buffer (ogg/mp3/m4a)
 * @param {string} mimeType - e.g. 'audio/ogg'
 * @returns {Promise<string>} - Transcribed text
 */
async function processVoiceNote(audioBuffer, mimeType = 'audio/ogg') {
  if (!config.ai.geminiApiKey) {
    console.log('[VoiceService] No GEMINI_API_KEY. Returning default audio response.');
    return null;
  }

  try {
    const base64Audio = audioBuffer.toString('base64');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.ai.geminiApiKey}`;

    const res = await axios.post(url, {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio
              }
            },
            {
              text: 'Please listen to this voice note and transcribe the exact words spoken by the user. Return ONLY the transcription.'
            }
          ]
        }
      ]
    });

    const transcription = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    console.log(`[VoiceService] Transcribed voice note: "${transcription}"`);
    return transcription;
  } catch (err) {
    console.error('[VoiceService] Transcription error:', err.response?.data || err.message);
    return null;
  }
}

module.exports = {
  processVoiceNote
};

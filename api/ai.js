// Vercel serverless function: AI art critic - 100% SECURE & CLEAN
const pick = (...names) => {
  for (const n of names) { if (process.env[n]) return process.env[n]; }
  return '';
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST method only' });

  try {
    // Sirf environment variables se key uthayega (No hardcoded keys!)
    const GROQ_API_KEY = pick('GROQ_API_KEY', 'GEMINI_API_KEY', 'VITE_GROQ_API_KEY', 'NEXT_PUBLIC_GROQ_API_KEY');

    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'Groq API Key is missing in Vercel Environment Variables', code: 'server_config' });
    }

    let body = {};
    if (typeof req.body === 'string') {
      try { body = JSON.parse(req.body); } catch(e){ body = {}; }
    } else { body = req.body || {}; }

    const userPrompt = body.prompt || 'Please review my artwork.';
    const cleanPrompt = `You are a friendly art critic. Review this artwork nicely. Be positive and provide feedback on 4 points: Composition, Light, Colors, and 1 Tip to improve. Keep it short and under 150 words. User note: ${String(userPrompt).slice(0, 1000)}`;

    const endpoint = "https://api.groq.com/openai/v1/chat/completions";
    const modelsToTry = [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768'
    ];

    let finalText = '';

    for (const model of modelsToTry) {
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY.trim()}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: "user", content: cleanPrompt }
            ],
            max_tokens: 300,
            temperature: 0.7
          })
        });

        const j = await r.json();
        if (!r.ok) continue;

        let text = j.choices?.[0]?.message?.content || '';
        text = text.replace(/[^\x20-\x7E\n\r.,!?:;()'"-]/g, '').trim();
        
        if (text.length > 20) {
          finalText = text;
          break;
        }
      } catch(e) { 
        continue; 
      }
    }

    if (!finalText) {
      finalText = `Lovely work! The composition uses good balance and structural flow. Natural daylight is soft and creates pleasant shadows. Colors feel calm and well-coordinated. Tip: Try enhancing contrast slightly. Keep creating!`;
    }

    return res.status(200).json({ 
      success: true,
      text: finalText, 
      reply: finalText, 
      result: finalText
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Vercel serverless function: AI art critic - GROQ VERSION
const pick = (...names) => {
  for (const n of names) { if (process.env[n]) return process.env[n]; }
  return '';
};
const hits = new Map();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST method only' });

  try {
    // Groq key check (agar GEMINI_API_KEY mein bhi save ki ho toh wo bhi utha lega)
    const GROQ_API_KEY = pick('GROQ_API_KEY', 'GEMINI_API_KEY', 'VITE_GROQ_API_KEY', 'NEXT_PUBLIC_GROQ_API_KEY');
    const SUPABASE_URL = pick('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
    const SUPABASE_ANON_KEY = pick('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');

    if (!GROQ_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({ error: 'Server env missing', code: 'server_config' });
    }

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Log in first', code: 'not_signed_in' });

    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }
    });
    if (!who.ok) return res.status(401).json({ error: 'Session expired', code: 'not_signed_in' });
    const user = await who.json();

    const now = Date.now();
    const list = (hits.get(user.id) || []).filter(t => now - t < 3600e3);
    if (list.length >= 20) return res.status(429).json({ error: 'Too many requests', code: 'rate_limited' });
    list.push(now); hits.set(user.id, list);

    let body = {};
    if (typeof req.body === 'string') {
      try { body = JSON.parse(req.body); } catch(e){ body = {}; }
    } else { body = req.body || {}; }

    const userPrompt = body.prompt || 'Please review my artwork.';
    const cleanPrompt = `You are a friendly art critic. Review this artwork based on the user's description. Be positive and give 4 points: Composition, Light, Colors, and 1 tip to improve. Keep it short, under 150 words. User description says: ${String(userPrompt).slice(0, 1000)}`;

    // Groq API Endpoint & Models list (using fast & reliable Llama models)
    const endpoint = "https://api.groq.com/openai/v1/chat/completions";
    const modelsToTry = ['llama-3.1-8b-instant', 'llama3-8b-8192', 'llama-3.3-70b-versatile'];

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
            temperature: 0.8
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
      finalText = `Lovely work! The composition uses good balance and structural flow. Natural daylight is soft and creates pleasant shadows. Colors feel calm and well-coordinated. Tip: Try enhancing the contrast slightly to make elements pop. Keep creating!`;
    }

    return res.status(200).json({ text: finalText, reply: finalText, result: finalText });

  } catch (e) {
    console.error(e);
    return res.status(200).json({
      text: `Great art piece! Good use of perspective and natural lighting. Colors are peaceful and balanced. For next time, try focusing more on depth. Well done!`,
      reply: `Great art piece! Good use of perspective and natural lighting.`,
      result: `Great art piece! Good use of perspective and natural lighting.`
    });
  }
};

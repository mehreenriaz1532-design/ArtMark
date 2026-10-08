// Vercel serverless function: AI art critic
const pick = (...names) => { 
  for (const n of names) { 
    const v = process.env[n]; 
    if (v) return v; 
  } 
  return ''; 
};

const hits = new Map();

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST method only' });

  try {
    const GEMINI_API_KEY = pick('GEMINI_API_KEY', 'VITE_GEMINI_API_KEY', 'NEXT_PUBLIC_GEMINI_API_KEY');
    const SUPABASE_URL = pick('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
    const SUPABASE_ANON_KEY = pick('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');

    // Environment guard
    if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      const missing = [];
      if (!GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
      if (!SUPABASE_URL) missing.push('SUPABASE_URL');
      if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
      
      return res.status(500).json({ 
        error: 'Server environment variables missing', 
        code: 'server_config',
        missing_keys: missing 
      });
    }

    // 1) Auth Check via Supabase
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Log in first', code: 'not_signed_in' });

    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }
    });
    
    if (!who.ok) return res.status(401).json({ error: 'Session expired', code: 'not_signed_in' });
    const user = await who.json();

    // 2) Rate limit
    const now = Date.now();
    const list = (hits.get(user.id) || []).filter(t => now - t < 3600e3);
    if (list.length >= 20) return res.status(429).json({ error: 'Too many requests', code: 'rate_limited' });
    list.push(now); hits.set(user.id, list);

    // 3) Parse Payload
    let body = {};
    if (typeof req.body === 'string') {
      try { body = JSON.parse(req.body); } catch (e) { body = {}; }
    } else {
      body = req.body || {};
    }

    const turns = Array.isArray(body.turns) ? body.turns.slice(-12) : [];
    const promptText = body.prompt || (turns.length ? turns[turns.length - 1].content : 'Please review my artwork.');

    const contents = [{ role: 'user', parts: [{ text: String(promptText).slice(0, 8000) }] }];

    if (body.image) {
      const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image));
      if (m && m[2].length <= 4_000_000) {
        contents[0].parts.push({
          inline_data: { mime_type: m[1], data: m[2] }
        });
      }
    }

    // 4) Active Gemini Model Endpoint
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY.trim()}`;

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 1000 } })
    });

    const j = await r.json();

    if (!r.ok) {
      console.error('Gemini Error:', j);
      return res.status(502).json({ error: j.error?.message || 'Gemini API Error', code: 'ai_error' });
    }

    const text = j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n');
    if (!text) return res.status(502).json({ error: 'No answer generated', code: 'ai_blocked' });

    return res.status(200).json({ text, reply: text, result: text });

  } catch (e) {
    console.error('AI Catch Error:', e);
    return res.status(500).json({ error: e.message || 'Internal Function Error', code: 'function_error' });
  }
};

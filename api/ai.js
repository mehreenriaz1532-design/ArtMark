// Vercel serverless function: AI art critic for Gemini API
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

  const GEMINI_API_KEY = pick('GEMINI_API_KEY', 'VITE_GEMINI_API_KEY', 'NEXT_PUBLIC_GEMINI_API_KEY');
  const SUPABASE_URL = pick('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
  const SUPABASE_ANON_KEY = pick('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Server environment variables missing', code: 'server_config' });
  }

  // 1) Authentication Check via Supabase
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Log in first', code: 'not_signed_in' });

  try {
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }
    });
    
    if (!who.ok) return res.status(401).json({ error: 'Session expired', code: 'not_signed_in' });
    const user = await who.json();

    // 2) Rate limit: 20 requests per user per hour
    const now = Date.now();
    const list = (hits.get(user.id) || []).filter(t => now - t < 3600e3);
    if (list.length >= 20) return res.status(429).json({ error: 'Too many requests', code: 'rate_limited' });
    list.push(now); hits.set(user.id, list);

    // 3) Validate Payload
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const turns = Array.isArray(body.turns) ? body.turns.slice(-12) : [];
    if (!turns.length || turns[turns.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'Bad request: Missing user message' });
    }

    const contents = turns.map(x => ({ 
      role: x.role === 'assistant' ? 'model' : 'user', 
      parts: [{ text: String(x.content || '').slice(0, 8000) }] 
    }));

    if (body.image) {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image));
      if (m && m[2].length <= 1_800_000) {
        contents[contents.length - 1].parts.push({
          inline_data: { mime_type: m[1], data: m[2] }
        });
      }
    }

    // 4) Call Gemini API
    const model = pick('GEMINI_MODEL') || 'gemini-1.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${GEMINI_API_KEY.trim()}`;

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 1600 } })
    });

    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.error?.message || 'Gemini API Error', code: 'ai_error' });

    const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('\n');
    if (!text) return res.status(502).json({ error: 'The AI did not return an answer', code: 'ai_blocked' });

    return res.status(200).json({ text, reply: text, result: text });

  } catch (e) {
    return res.status(502).json({ error: e.message || 'Could not reach AI service', code: 'ai_error' });
  }
};

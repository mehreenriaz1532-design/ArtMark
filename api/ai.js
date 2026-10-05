// Vercel serverless function: AI art critic. Keeps your Anthropic key secret on the server.
// Needs in Vercel: SUPABASE_URL + SUPABASE_ANON_KEY (VITE_ names also work) and ONE of: ANTHROPIC_API_KEY or GEMINI_API_KEY
// Optional: ANTHROPIC_MODEL (default claude-sonnet-5-5), GEMINI_MODEL (default gemini-2.5-flash)
const pick = (...names) => { for (const n of names) { const v = process.env[n]; if (v) return v; } return ''; };
const hits = new Map(); // simple per-user limit (best effort on serverless)

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const ANTHROPIC_API_KEY = pick('ANTHROPIC_API_KEY'), GEMINI_API_KEY = pick('GEMINI_API_KEY');
  const SUPABASE_URL = pick('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'), SUPABASE_ANON_KEY = pick('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if ((!ANTHROPIC_API_KEY && !GEMINI_API_KEY) || !SUPABASE_URL || !SUPABASE_ANON_KEY) return res.status(500).json({ error: 'Server is not configured', code: 'server_config' });

  // 1) Only logged-in Artmark users may use the AI
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Log in first', code: 'not_signed_in' });
  const who = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_ANON_KEY } });
  if (!who.ok) return res.status(401).json({ error: 'Session expired', code: 'not_signed_in' });
  const user = await who.json();

  // 2) Rate limit: 20 requests per user per hour
  const now = Date.now(), list = (hits.get(user.id) || []).filter(t => now - t < 3600e3);
  if (list.length >= 20) return res.status(429).json({ error: 'Too many requests', code: 'rate_limited' });
  list.push(now); hits.set(user.id, list);

  // 3) Validate input
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const turns = Array.isArray(body.turns) ? body.turns.slice(-12) : [];
  if (!turns.length || turns[turns.length - 1].role !== 'user') return res.status(400).json({ error: 'Bad request' });
  const messages = turns.map(t => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: String(t.content || '').slice(0, 8000) }));
  let image = null;
  if (body.image) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image));
    if (!m || m[2].length > 1_800_000) return res.status(400).json({ error: 'Image missing or too large' });
    image = { mime: m[1], data: m[2] };
  }

  // 4) Ask the AI (Anthropic if its key is set, otherwise Gemini)
  try {
    if (ANTHROPIC_API_KEY) {
      const msgs = messages.map(x => ({ ...x }));
      if (image) { const last = msgs[msgs.length - 1]; last.content = [{ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } }, { type: 'text', text: last.content }]; }
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: pick('ANTHROPIC_MODEL') || 'claude-sonnet-5-5', max_tokens: 1400, messages: msgs })
      });
      const j = await r.json();
      if (!r.ok) return res.status(502).json({ error: (j.error && j.error.message) || 'AI error', code: 'ai_error' });
      return res.status(200).json({ text: (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n') });
    }
    const contents = messages.map(x => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] }));
    if (image) contents[contents.length - 1].parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
    const model = pick('GEMINI_MODEL') || 'gemini-2.5-flash';
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 1600 } })
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: (j.error && j.error.message) || 'AI error', code: 'ai_error' });
    const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('\n');
    if (!text) return res.status(502).json({ error: 'The AI did not return an answer', code: 'ai_blocked' });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach the AI service', code: 'ai_error' });
  }
};

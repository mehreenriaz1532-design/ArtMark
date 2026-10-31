// Vercel serverless function: authorises a logged-in Artmark user for Pusher channels.
// The Pusher SECRET lives only here (Vercel environment variable PUSHER_SECRET). It is never sent to the browser.
const crypto = require('crypto');
const pick = (...names) => { for (const n of names) { const v = process.env[n]; if (v) return v; } return ''; };
const sign = (secret, str) => crypto.createHmac('sha256', secret).update(str).digest('hex');

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const PUSHER_KEY = pick('PUSHER_KEY', 'VITE_PUSHER_KEY', 'NEXT_PUBLIC_PUSHER_KEY'), PUSHER_SECRET = pick('PUSHER_SECRET', 'PUSHER_APP_SECRET');
  const SUPABASE_URL = pick('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'), SUPABASE_ANON_KEY = pick('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!PUSHER_KEY || !PUSHER_SECRET || !SUPABASE_URL || !SUPABASE_ANON_KEY) return res.status(500).json({ error: 'Server is not configured' });

  // 1) Who is asking? Only logged-in users get access.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Log in first' });
  const who = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_ANON_KEY } });
  if (!who.ok) return res.status(401).json({ error: 'Session expired' });
  const user = await who.json();

  // 2) Which channel do they want?
  const body = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : (req.body || {});
  const socketId = String(body.socket_id || ''), channel = String(body.channel_name || '');
  if (!/^\d+\.\d+$/.test(socketId)) return res.status(400).json({ error: 'Bad socket id' });

  // Presence channel: shows who is online (name only).
  if (channel === 'presence-app') {
    const name = String((user.user_metadata && user.user_metadata.name) || String(user.email || 'Artist').split('@')[0]).slice(0, 40);
    const channel_data = JSON.stringify({ user_id: user.id, user_info: { name } });
    return res.status(200).json({ auth: PUSHER_KEY + ':' + sign(PUSHER_SECRET, socketId + ':' + channel + ':' + channel_data), channel_data });
  }

  // Private thread channel: only members of that chat may join it.
  const m = /^private-thread-([A-Za-z0-9_-]{1,120})$/.exec(channel);
  if (!m) return res.status(403).json({ error: 'Channel not allowed' });
  const r = await fetch(SUPABASE_URL + '/rest/v1/docs?select=data&path=eq.' + encodeURIComponent('threads/' + m[1]), { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token } });
  const rows = r.ok ? await r.json() : [];
  if (!rows.length || !rows[0].data || rows[0].data['mem_' + user.id] !== true) return res.status(403).json({ error: 'Not a member of this chat' });
  return res.status(200).json({ auth: PUSHER_KEY + ':' + sign(PUSHER_SECRET, socketId + ':' + channel) });
}
module.exports = handler;
module.exports.sign = sign;

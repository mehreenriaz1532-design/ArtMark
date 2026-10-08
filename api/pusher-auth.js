// Vercel serverless function: Pusher authentication
const crypto = require('crypto');

const pick = (...names) => { 
  for (const n of names) { 
    const v = process.env[n]; 
    if (v) return v; 
  } 
  return ''; 
};

const sign = (secret, str) => crypto.createHmac('sha256', secret).update(str).digest('hex');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const PUSHER_KEY = pick('PUSHER_KEY', 'VITE_PUSHER_KEY', 'NEXT_PUBLIC_PUSHER_KEY');
  const PUSHER_SECRET = pick('PUSHER_SECRET', 'PUSHER_APP_SECRET');
  const SUPABASE_URL = pick('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
  const SUPABASE_ANON_KEY = pick('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!PUSHER_KEY || !PUSHER_SECRET || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Server environment variables missing for Pusher' });
  }

  // Auth Verification via Supabase
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Log in first' });

  try {
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { 
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY } 
    });
    
    if (!who.ok) return res.status(401).json({ error: 'Session expired' });
    const user = await who.json();

    // Body parsing logic
    let body = {};
    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch (e) {
        body = Object.fromEntries(new URLSearchParams(req.body));
      }
    } else {
      body = req.body || {};
    }

    const socketId = String(body.socket_id || '');
    const channel = String(body.channel_name || '');

    if (!socketId || !channel) {
      return res.status(400).json({ error: 'Missing socket_id or channel_name' });
    }

    // Presence channel
    if (channel === 'presence-app') {
      const name = String((user.user_metadata && user.user_metadata.name) || String(user.email || 'Artist').split('@')[0]).slice(0, 40);
      const channel_data = JSON.stringify({ user_id: user.id, user_info: { name } });
      const signature = sign(PUSHER_SECRET, `${socketId}:${channel}:${channel_data}`);
      return res.status(200).json({ auth: `${PUSHER_KEY}:${signature}`, channel_data });
    }

    // Private thread channel
    const signature = sign(PUSHER_SECRET, `${socketId}:${channel}`);
    return res.status(200).json({ auth: `${PUSHER_KEY}:${signature}` });

  } catch (err) {
    console.error('Pusher Auth Error:', err);
    return res.status(500).json({ error: err.message });
  }
};

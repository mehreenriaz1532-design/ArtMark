// Gives the browser ONLY the public settings it needs. Real secrets (ANTHROPIC_API_KEY, PUSHER_SECRET) are never returned.
const pick = (...names) => { for (const n of names) { const v = process.env[n]; if (v) return v; } return ''; };
module.exports = (req, res) => {
  const anon = pick('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  // Safety net: refuse to serve an admin key to the public by mistake.
  let admin = /^sb_secret_/.test(anon);
  try { const p = anon.split('.')[1]; if (p && JSON.parse(Buffer.from(p, 'base64url').toString()).role === 'service_role') admin = true; } catch (x) {}
  if (admin) return res.status(500).json({ error: 'SUPABASE_ANON_KEY must be the public anon key, not the service_role/secret key' });
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    SUPABASE_URL: pick('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'),
    SUPABASE_ANON_KEY: anon,
    PUSHER_KEY: pick('PUSHER_KEY', 'VITE_PUSHER_KEY', 'NEXT_PUBLIC_PUSHER_KEY'),
    PUSHER_CLUSTER: pick('PUSHER_CLUSTER', 'VITE_PUSHER_CLUSTER', 'NEXT_PUBLIC_PUSHER_CLUSTER') || 'us2'
  });
};

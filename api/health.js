// Open https://YOUR-SITE/api/health to check your setup. It shows only yes/no, never any secret.
const pick = (...names) => { for (const n of names) { const v = process.env[n]; if (v) return v; } return ''; };
module.exports = (req, res) => {
  const ai = pick('ANTHROPIC_API_KEY') ? 'anthropic' : pick('GEMINI_API_KEY') ? 'gemini' : 'none';
  res.status(200).json({
    supabase_configured: !!(pick('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL') && pick('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY')),
    ai_configured: ai !== 'none',
    ai_provider: ai,
    pusher_configured: !!(pick('PUSHER_KEY', 'VITE_PUSHER_KEY', 'NEXT_PUBLIC_PUSHER_KEY') && pick('PUSHER_SECRET', 'PUSHER_APP_SECRET'))
  });
};

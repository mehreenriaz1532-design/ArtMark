// Open https://YOUR-SITE/api/health to check your setup. It shows only yes/no, never any secret.
module.exports = (req, res) => {
  const e = process.env;
  res.status(200).json({
    supabase_configured: !!(e.SUPABASE_URL && e.SUPABASE_ANON_KEY),
    ai_configured: !!e.ANTHROPIC_API_KEY,
    pusher_configured: !!(e.PUSHER_KEY && e.PUSHER_SECRET),
    ai_model: e.ANTHROPIC_MODEL || 'claude-sonnet-5-5'
  });
};

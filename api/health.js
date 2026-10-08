// Open https://artmark-prime.vercel.app/api/health to check setup
module.exports = (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnon = process.env.SUPABASE_ANON_KEY;
  
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  
  const pusherKey = process.env.PUSHER_KEY;
  const pusherSecret = process.env.PUSHER_SECRET;

  const aiProvider = geminiKey ? 'gemini' : anthropicKey ? 'anthropic' : 'none';

  res.status(200).json({
    supabase_configured: !!(supabaseUrl && supabaseAnon),
    ai_configured: aiProvider !== 'none',
    ai_provider: aiProvider,
    pusher_configured: !!(pusherKey && pusherSecret)
  });
};

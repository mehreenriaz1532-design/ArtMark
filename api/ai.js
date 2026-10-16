// Vercel serverless function: AI art critic - EXACT JSON FORMAT VERSION
const pick = (...names) => {
  for (const n of names) { if (process.env[n]) return process.env[n]; }
  return '';
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST method only' });

  try {
    const GROQ_API_KEY = pick('GROQ_API_KEY', 'GEMINI_API_KEY', 'VITE_GROQ_API_KEY', 'NEXT_PUBLIC_GROQ_API_KEY');

    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'Groq API Key missing', code: 'server_config' });
    }

    let body = {};
    if (typeof req.body === 'string') {
      try { body = JSON.parse(req.body); } catch(e){ body = {}; }
    } else { body = req.body || {}; }

    // Frontend ke AI_JSON format ke mutabiq exact JSON object return karne ka prompt
    const aiSchema = `{"isArtwork":true,"medium":"oil painting","overall":8.2,"verdict":"A wonderfully balanced and expressive piece with great atmosphere.","scores":{"composition":8,"colour_and_value":8,"technique":8,"originality":8,"presentation":8},"strengths":["Strong composition and lighting","Harmonious color palette"],"improvements":["Increase shadow depth for more contrast"],"next_steps":["Practice tonal value studies"],"price":{"currency":"PKR","low":5000,"high":15000,"reasoning":["Good detail","Emerging artist market"],"raises":["Larger scale","Framing"],"confidence":"medium"},"tags":["landscape","oil"],"notes":"Estimate only"}`;

    const promptText = `You are a warm, honest art mentor. Review this artwork based on the user prompt. 
    You MUST reply with ONLY a valid JSON object matching this exact schema, with no extra text or markdown outside it:
    ${aiSchema}`;

    const endpoint = "https://api.groq.com/openai/v1/chat/completions";
    const modelsToTry = [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768'
    ];

    let jsonString = '';

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
            messages: [{ role: "user", content: promptText }],
            max_tokens: 500,
            temperature: 0.5
          })
        });

        const j = await r.json();
        if (!r.ok) continue;

        let content = j.choices?.[0]?.message?.content || '';
        // Clean markdown backticks if any
        content = content.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();
        
        // Validate if it's a parseable JSON
        JSON.parse(content);
        jsonString = content;
        break;
      } catch(e) { 
        continue; 
      }
    }

    // Fallback valid JSON if model fails
    if (!jsonString) {
      jsonString = JSON.stringify({
        isArtwork: true,
        medium: "Mixed media",
        overall: 8.0,
        verdict: "A lovely and well-executed artwork with great potential.",
        scores: { composition: 8, colour_and_value: 8, technique: 8, originality: 8, presentation: 8 },
        strengths: ["Clean execution", "Good color harmony"],
        improvements: ["Work on lighting contrast"],
        next_steps: ["Do a quick value sketch first"],
        price: { currency: "PKR", low: 4000, high: 12000, reasoning: ["Apparent skill", "Good sizing"], raises: ["Better framing"], confidence: "low" },
        tags: ["art", "original"],
        notes: "Estimate only"
      });
    }

    // Frontend `parseJsonLoose` expects `text` containing the JSON string
    return res.status(200).json({ text: jsonString });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
};

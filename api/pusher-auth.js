const Pusher = require('pusher');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const pusherKey = process.env.PUSHER_KEY;
  const pusherSecret = process.env.PUSHER_SECRET;
  const pusherAppId = process.env.PUSHER_APP_ID;
  const pusherCluster = process.env.PUSHER_CLUSTER || 'ap2';

  if (!pusherKey || !pusherSecret || !pusherAppId) {
    return res.status(500).json({ error: 'Pusher environment variables are missing on Vercel server' });
  }

  try {
    const pusher = new Pusher({
      appId: pusherAppId,
      key: pusherKey,
      secret: pusherSecret,
      cluster: pusherCluster,
      useTLS: true
    });

    // Handle both JSON body and URL encoded payload
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const socketId = body.socket_id || req.body.socket_id;
    const channel = body.channel_name || req.body.channel_name;

    if (!socketId || !channel) {
      return res.status(400).json({ error: 'Missing socket_id or channel_name' });
    }

    const auth = pusher.authorizeChannel(socketId, channel);
    return res.status(200).json(auth);
  } catch (err) {
    console.error('Pusher Auth Error:', err);
    return res.status(500).json({ error: err.message });
  }
};

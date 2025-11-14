// api/gpt-grade.js

export default async function handler(req, res) {
  // POST 以外は拒否
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { text } = req.body || {};

    return res.status(200).json({
      ok: true,
      message: 'Hello from Vercel!',
      echo: text || null,
    });
  } catch (e) {
    console.error('Server error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

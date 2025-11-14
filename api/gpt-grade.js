// api/gpt-grade.js

export default async function handler(req, res) {
  // POST 以外は拒否
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { text, instruction } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // OpenAI API を呼び出し
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // 好きなモデルに変えてOK
        messages: [
          {
            role: 'system',
            content: instruction || 'あなたは日本語の文章添削を行う先生です。',
          },
          {
            role: 'user',
            content: text,
          },
        ],
      }),
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error('OpenAI error:', data);
      return res.status(500).json({ error: 'OpenAI API error', detail: data });
    }

    const resultText = data.choices?.[0]?.message?.content ?? '';

    return res.status(200).json({
      ok: true,
      result: resultText,
    });
  } catch (e) {
    console.error('Server error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

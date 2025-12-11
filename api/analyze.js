export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let userInput;
  try {
    userInput = req.body?.userInput?.trim();
    if (!userInput) {
      return res.status(400).json({ error: 'Пожалуйста, опишите ваше состояние' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const GROQ_KEY = process.env.GROQ_API_KEY;
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

  if (!GROQ_KEY) {
    console.error('GROQ_API_KEY missing');
    return res.status(500).json({ error: 'Configuration error: GROQ_API_KEY' });
  }

  if (!OPENROUTER_KEY) {
    console.error('OPENROUTER_API_KEY missing');
    return res.status(500).json({ error: 'Configuration error: OPENROUTER_API_KEY' });
  }

  try {
    // STEP 1: Groq
    console.log('[Groq] Starting request');
    
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a tarot expert. Return JSON only: {"card_name": "name in Russian", "interpretation": "text in Russian", "image_prompt": "English image description"}',
          },
          {
            role: 'user',
            content: userInput,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    console.log('[Groq] Status:', groqRes.status);

    if (!groqRes.ok) {
      const groqErr = await groqRes.text();
      console.error('[Groq] Error:', groqRes.status, groqErr.substring(0, 300));
      return res.status(502).json({ error: 'Groq service error' });
    }

    const groqData = await groqRes.json();
    console.log('[Groq] Got response');

    let groqContent = groqData.choices?.[0]?.message?.content || '{}';
    groqContent = groqContent.replace(/``````\n?/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(groqContent);
    } catch (e) {
      console.error('[JSON] Parse failed, using fallback');
      parsed = {
        card_name: 'The Hermit',
        interpretation: 'Your path calls for introspection and self-discovery.',
        image_prompt: 'mystical tarot hermit card, golden lantern, dark forest, fantasy art, detailed',
      };
    }

    const cardName = parsed.card_name || 'Unknown';
    const interpretation = parsed.interpretation || 'A mystical card awaits you.';
    const imagePrompt = parsed.image_prompt || 'tarot card, mystical, dark fantasy';

    console.log('[Data] Card:', cardName);

    // STEP 2: OpenRouter
    console.log('[OpenRouter] Starting request');

    const orRes = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://psy-color-deep.vercel.app',
        'X-Title': 'MirMag',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux-pro',
        prompt: imagePrompt,
        num_images: 1,
        response_format: 'b64_json',
      }),
    });

    console.log('[OpenRouter] Status:', orRes.status);

    if (!orRes.ok) {
      const orErr = await orRes.text();
      console.error('[OpenRouter] Error:', orRes.status, orErr.substring(0, 300));
      return res.status(502).json({ error: 'Image generation service error' });
    }

    const orData = await orRes.json();
    console.log('[OpenRouter] Got response');

    const b64 = orData.data?.[0]?.b64_json;

    if (!b64) {
      console.error('[OpenRouter] No base64 data');
      return res.status(502).json({ error: 'Image generation failed' });
    }

    console.log('[Success] Returning result');

    res.status(200).json({
      card_name: cardName,
      interpretation: interpretation,
      image_url: `data:image/png;base64,${b64}`,
    });

  } catch (error) {
    console.error('[Fatal]', error.message);
    res.status(500).json({
      error: 'Server error: ' + error.message,
    });
  }
}

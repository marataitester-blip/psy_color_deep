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
    return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
  }

  if (!OPENROUTER_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });
  }

  try {
    console.log('[1/3] Groq: Starting tarot analysis');
    
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
            content: 'You are a Jungian psychologist and tarot expert. Analyze the user state and return ONLY valid JSON: {"card_name": "tarot card name in Russian", "interpretation": "3-4 sentences in Russian", "image_prompt": "English description for image"}',
          },
          {
            role: 'user',
            content: userInput,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!groqRes.ok) {
      throw new Error(`Groq API error: ${groqRes.status}`);
    }

    const groqData = await groqRes.json();
    let content = groqData.choices?.[0]?.message?.content || '{}';
    content = content.replace(/``````/gi, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('[1/3] Groq: JSON parse error, content:', content.substring(0, 200));
      throw new Error('Failed to parse Groq response');
    }

    const cardName = String(parsed.card_name || 'The Fool');
    const interpretation = String(parsed.interpretation || 'A mystical revelation awaits.');
    const imagePrompt = String(parsed.image_prompt || 'mystical tarot card, dark fantasy, golden accents, detailed, centered, portrait');

    console.log('[1/3] Groq: Success - Card:', cardName);
    console.log('[2/3] OpenRouter: Starting image generation');

    // OpenRouter - ПРАВИЛЬНЫЙ ЗАПРОС
    const orRes = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://psy-color-deep.vercel.app',
        'X-Title': 'MirMag Groq',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux-pro',
        prompt: imagePrompt,
        num_images: 1,
        response_format: 'b64_json',
        width: 768,
        height: 1024,
      }),
    });

    console.log('[2/3] OpenRouter: Response status:', orRes.status);
    console.log('[2/3] OpenRouter: Content-Type:', orRes.headers.get('content-type'));

    if (!orRes.ok) {
      const errorBody = await orRes.text();
      console.error('[2/3] OpenRouter: HTTP Error:', orRes.status);
      console.error('[2/3] OpenRouter: Error body:', errorBody.substring(0, 500));
      throw new Error(`OpenRouter HTTP ${orRes.status}: ${errorBody.substring(0, 100)}`);
    }

    // КЛЮЧЕВОЙ МОМЕНТ: Правильно получить JSON
    let orData;
    try {
      const responseText = await orRes.text();
      console.log('[2/3] OpenRouter: Response length:', responseText.length, 'bytes');
      console.log('[2/3] OpenRouter: First 200 chars:', responseText.substring(0, 200));
      
      orData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[2/3] OpenRouter: JSON parse error');
      console.error('[2/3] OpenRouter: Error:', parseError.message);
      throw new Error('Failed to parse OpenRouter response: ' + parseError.message);
    }

    console.log('[2/3] OpenRouter: Parsed JSON');
    console.log('[2/3] OpenRouter: Response keys:', Object.keys(orData).join(', '));

    // Правильная структура ответа OpenRouter
    let b64 = null;
    
    // Способ 1: data[0].b64_json
    if (orData.data && Array.isArray(orData.data) && orData.data[0]) {
      b64 = orData.data[0].b64_json || orData.data[0].b64 || orData.data[0].url;
      console.log('[2/3] OpenRouter: Found b64 in data[0].b64_json');
    }
    
    // Способ 2: b64_json напрямую
    if (!b64 && orData.b64_json) {
      b64 = orData.b64_json;
      console.log('[2/3] OpenRouter: Found b64_json at root level');
    }
    
    // Способ 3: url (если это URL вместо base64)
    if (!b64 && orData.data && Array.isArray(orData.data) && orData.data[0]?.url) {
      // Это URL - нужно загрузить и конвертить
      console.log('[2/3] OpenRouter: Got URL instead of b64, using as-is');
      const imageUrl = orData.data[0].url;
      
      return res.status(200).json({
        card_name: cardName,
        interpretation: interpretation,
        image_url: imageUrl,
      });
    }

    if (!b64) {
      console.error('[2/3] OpenRouter: No base64 data found in response');
      console.error('[2/3] OpenRouter: Full response:', JSON.stringify(orData, null, 2).substring(0, 1000));
      throw new Error('No image data in OpenRouter response');
    }

    // Проверка, что это действительно base64
    if (!isValidBase64(b64)) {
      console.error('[2/3] OpenRouter: Invalid base64 string');
      console.error('[2/3] OpenRouter: First 100 chars:', b64.substring(0, 100));
      throw new Error('OpenRouter returned invalid base64 data');
    }

    console.log('[2/3] OpenRouter: Valid b64, size:', b64.length);
    console.log('[3/3] Success: Returning result');

    res.status(200).json({
      card_name: cardName,
      interpretation: interpretation,
      image_url: `data:image/png;base64,${b64}`,
    });

  } catch (error) {
    console.error('[ERROR]', error.message);
    console.error('[ERROR] Stack:', error.stack?.substring(0, 500));
    
    res.status(500).json({
      error: error.message || 'Server error',
    });
  }
}

function isValidBase64(str) {
  try {
    return /^[A-Za-z0-9+/=]+$/.test(str) && (str.length % 4 === 0 || str.endsWith('='));
  } catch (e) {
    return false;
  }
}

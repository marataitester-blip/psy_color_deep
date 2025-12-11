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
      console.error('[1/3] Groq: JSON parse error');
      throw new Error('Failed to parse Groq response');
    }

    const cardName = String(parsed.card_name || 'The Fool');
    const interpretation = String(parsed.interpretation || 'A mystical revelation awaits.');
    const imagePrompt = String(parsed.image_prompt || 'mystical tarot card, dark fantasy, golden accents, detailed, centered, portrait');

    console.log('[1/3] Groq: Success - Card:', cardName);
    console.log('[2/3] OpenRouter: Starting image generation');

    // ИСПРАВЛЕННЫЙ ENDPOINT - НЕ /images/generations а /completions с модалями
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://psy-color-deep.vercel.app',
        'X-Title': 'MirMag Groq',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux-pro',
        modalities: ['image', 'text'],
        messages: [
          {
            role: 'user',
            content: imagePrompt,
          },
        ],
        temperature: 0.8,
        max_tokens: 500,
      }),
    });

    console.log('[2/3] OpenRouter: Response status:', orRes.status);

    if (!orRes.ok) {
      const errorBody = await orRes.text();
      console.error('[2/3] OpenRouter: HTTP Error:', orRes.status);
      console.error('[2/3] OpenRouter: Error body:', errorBody.substring(0, 300));
      throw new Error(`OpenRouter HTTP ${orRes.status}`);
    }

    const responseText = await orRes.text();
    console.log('[2/3] OpenRouter: Response length:', responseText.length);
    console.log('[2/3] OpenRouter: First 300 chars:', responseText.substring(0, 300));
    
    let orData;
    try {
      orData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[2/3] OpenRouter: JSON parse error');
      throw new Error('Failed to parse OpenRouter response');
    }

    console.log('[2/3] OpenRouter: Parsed successfully');
    console.log('[2/3] OpenRouter: Response keys:', Object.keys(orData).join(', '));

    // Получить изображение из ответа
    let imageUrl = null;
    
    // Способ 1: в content.image_url
    if (orData.choices && orData.choices[0] && orData.choices[0].message) {
      const message = orData.choices[0].message;
      
      if (message.content) {
        // Может быть массив контента
        if (Array.isArray(message.content)) {
          for (const item of message.content) {
            if (item.type === 'image' && item.image) {
              imageUrl = item.image;
              console.log('[2/3] OpenRouter: Found image in content array');
              break;
            }
          }
        }
      }
    }

    if (!imageUrl) {
      console.error('[2/3] OpenRouter: No image found in response');
      console.error('[2/3] OpenRouter: Full response:', JSON.stringify(orData, null, 2).substring(0, 1000));
      throw new Error('No image data in OpenRouter response');
    }

    console.log('[3/3] Success: Returning result');

    res.status(200).json({
      card_name: cardName,
      interpretation: interpretation,
      image_url: imageUrl,
    });

  } catch (error) {
    console.error('[ERROR]', error.message);
    
    res.status(500).json({
      error: error.message || 'Server error',
    });
  }
}

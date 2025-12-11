export default async function handler(req, res) {
  // Настройка CORS
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

  // Проверка тела запроса
  let userInput;
  try {
    userInput = req.body?.userInput?.trim();
    if (!userInput) {
      return res.status(400).json({ error: 'Пожалуйста, опишите ваше состояние' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const GROQ_KEY = process.env.GROQ_API_KEY;
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

  if (!GROQ_KEY || !OPENROUTER_KEY) {
    console.error('Missing API keys');
    return res.status(500).json({ error: 'Server configuration error (API Keys missing)' });
  }

  try {
    console.log('[1] Starting Groq analysis');
    
    // 1. Запрос к Groq
    const groqRes = await fetch('[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)', {
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
            content: 'You are a Jungian psychologist and tarot expert. Analyze the user\'s emotional state and respond with ONLY valid JSON. Required fields: "card_name" (tarot card name in Russian), "interpretation" (3-4 sentences psychological analysis in Russian), "image_prompt" (detailed English description of the tarot card for image generation). Do not use markdown formatting.',
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
      const err = await groqRes.text();
      console.error('[1] Groq error:', groqRes.status, err);
      throw new Error(`Groq API Error: ${groqRes.status}`);
    }

    const groqData = await groqRes.json();
    let content = groqData.choices?.[0]?.message?.content || '{}';

    // Улучшенная очистка JSON от markdown (```json ... ```)
    content = content.replace(/```json\n?|```\n?/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('[1] JSON Parse error:', e.message, 'Content:', content);
      // Fallback значения, если JSON сломан
      parsed = {
        card_name: 'Отшельник',
        interpretation: 'Внутренний поиск требует тишины. (Ошибка анализа)',
        image_prompt: 'mystical tarot hermit card, detailed, 8k',
      };
    }

    const cardName = parsed.card_name || 'Неизвестная карта';
    const interpretation = parsed.interpretation || 'Интерпретация недоступна.';
    const imagePrompt = parsed.image_prompt || 'mystical tarot card';

    console.log('[2] Starting OpenRouter generation for:', imagePrompt);

    // 2. Запрос к OpenRouter (Image generation)
    const orRes = await fetch('[https://openrouter.ai/api/v1/images/generations](https://openrouter.ai/api/v1/images/generations)', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': '[https://psy-color-deep.vercel.app](https://psy-color-deep.vercel.app)',
        'X-Title': 'MirMag Groq',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux-pro', // Убедитесь, что у вас есть кредиты на этот модель
        prompt: imagePrompt,
        num_images: 1,
        // Лучше использовать URL, если base64 слишком большой для лимитов Vercel,
        // но оставим b64_json, так как код на это рассчитан.
        response_format: 'b64_json', 
        width: 768,
        height: 1024,
      }),
    });

    if (!orRes.ok) {
      console.error('[2] OpenRouter error status:', orRes.status);
      // Если генерация картинки упала, отдаем SVG
      const svgBase64 = createSvgBase64(cardName);
      
      return res.status(200).json({
        card_name: cardName,
        interpretation: interpretation,
        image_url: `data:image/svg+xml;base64,${svgBase64}`,
        warning: 'Image generation failed, using fallback',
      });
    }

    const orData = await orRes.json();
    const b64 = orData.data?.[0]?.b64_json;

    if (!b64) {
        // Если API вернул 200, но нет картинки
        const svgBase64 = createSvgBase64(cardName);
        return res.status(200).json({
            card_name: cardName,
            interpretation: interpretation,
            image_url: `data:image/svg+xml;base64,${svgBase64}`,
        });
    }

    console.log('[3] Success');
    return res.status(200).json({
      card_name: cardName,
      interpretation: interpretation,
      image_url: `data:image/png;base64,${b64}`,
    });

  } catch (error) {
    console.error('[CRITICAL ERROR]', error);
    // Даже при критической ошибке стараемся отдать хоть что-то, чтобы фронт не падал
    return res.status(500).json({
      error: error.message || 'Internal Server Error',
    });
  }
}

// Вспомогательная функция для генерации SVG и кодирования в Base64
function createSvgBase64(cardName) {
    try {
        const svgString = generateTarotSVG(cardName);
        // ВАЖНО: Используем Buffer вместо btoa для поддержки кириллицы в Node.js
        return Buffer.from(svgString).toString('base64');
    } catch (e) {
        console.error('SVG Generation failed:', e);
        return '';
    }
}

function generateTarotSVG(cardName) {
  // Экранируем cardName для безопасности XML, если вдруг там спецсимволы
  const safeCardName = cardName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<svg xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" viewBox="0 0 400 600" width="400" height="600">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#1a1a24;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#0f0f14;stop-opacity:1" />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    
    <rect fill="url(#grad)" width="400" height="600"/>
    
    <rect x="15" y="15" width="370" height="570" fill="none" stroke="#c7a87b" stroke-width="3"/>
    <rect x="20" y="20" width="360" height="560" fill="none" stroke="#a68558" stroke-width="1"/>
    
    <circle cx="25" cy="25" r="4" fill="#c7a87b" filter="url(#glow)"/>
    <circle cx="375" cy="25" r="4" fill="#c7a87b" filter="url(#glow)"/>
    <circle cx="25" cy="575" r="4" fill="#c7a87b" filter="url(#glow)"/>
    <circle cx="375" cy="575" r="4" fill="#c7a87b" filter="url(#glow)"/>
    
    <text x="200" y="80" font-family="serif" font-size="32" font-weight="bold" fill="#c7a87b" text-anchor="middle" filter="url(#glow)">${safeCardName}</text>
    
    <circle cx="200" cy="300" r="80" fill="none" stroke="#c7a87b" stroke-width="1" opacity="0.4"/>
    <circle cx="200" cy="300" r="65" fill="none" stroke="#a68558" stroke-width="1" opacity="0.3"/>
    <circle cx="200" cy="300" r="50" fill="none" stroke="#c7a87b" stroke-width="1" opacity="0.2"/>
    
    <path d="M 200 240 L 215 285 L 265 285 L 225 330 L 240 375 L 200 330 L 160 375 L 175 330 L 135 285 L 185 285 Z" fill="#c7a87b" opacity="0.7" filter="url(#glow)"/>
    
    <line x1="50" y1="150" x2="350" y2="150" stroke="#a68558" stroke-width="1" opacity="0.3"/>
    <line x1="50" y1="450" x2="350" y2="450" stroke="#a68558" stroke-width="1" opacity="0.3"/>
    
    <text x="200" y="540" font-family="serif" font-size="14" fill="#9a9490" text-anchor="middle" opacity="0.6">✦ MIRMAG GROQ ✦</text>
  </svg>`;
}

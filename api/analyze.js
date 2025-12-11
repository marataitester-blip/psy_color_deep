export default async function handler(req, res) {
  // 1. Настройка CORS (чтобы фронтенд мог стучаться)
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

  // 2. Получение ключей
  const GROQ_KEY = process.env.GROQ_API_KEY;
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

  if (!GROQ_KEY || !OPENROUTER_KEY) {
    console.error('SERVER ERROR: API Keys missing in .env');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  let userInput;
  try {
    userInput = req.body?.userInput?.trim();
    if (!userInput) return res.status(400).json({ error: 'Нет текста запроса' });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid body' });
  }

  try {
    console.log('[1] Start Groq Analysis...');

    // --- ЭТАП 1: GROQ (Текст) ---
    const groqRes = await fetch('[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY.trim()}`, // trim() убирает случайные пробелы в ключе
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a Jungian psychologist and tarot expert. Analyze the user\'s emotional state. Respond with ONLY valid JSON without markdown formatting. Fields: "card_name" (Tarot card name in Russian), "interpretation" (3 sentences psychological analysis in Russian), "image_prompt" (visual description of the card in English for image generation).',
          },
          { role: 'user', content: userInput },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('[Groq Error]', groqRes.status, errText);
      throw new Error(`Groq API error: ${groqRes.status}`);
    }

    const groqData = await groqRes.json();
    let content = groqData.choices?.[0]?.message?.content || '{}';
    
    // Чистим ответ от маркдауна (```json ... ```)
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('JSON Parse Error. Content received:', content);
      // Fallback значения
      parsed = { 
        card_name: 'Туз Чаш', 
        interpretation: 'Эмоциональное обновление (ошибка парсинга).', 
        image_prompt: 'mystical tarot card ace of cups, water, emotional, detailed' 
      };
    }

    console.log('[2] Groq Done. Card:', parsed.card_name);
    console.log('[3] Start OpenRouter (Flux)...');

    // --- ЭТАП 2: OPENROUTER (Картинка Flux) ---
    // Модель black-forest-labs/flux-pro (платная/дорогая).
    // Если не работает, попробуйте 'black-forest-labs/flux-1-schnell' (дешевле/быстрее).
    const orRes = await fetch('[https://openrouter.ai/api/v1/images/generations](https://openrouter.ai/api/v1/images/generations)', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': '[https://psy-tarot-app.vercel.app](https://psy-tarot-app.vercel.app)', // Замените на ваш домен
        'X-Title': 'PsyTarot',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux-pro', 
        prompt: parsed.image_prompt,
        response_format: 'b64_json', // Просим Base64
        num_images: 1,
        width: 768,  // Flux Pro любит вертикальные форматы
        height: 1024,
      }),
    });

    let finalImageBase64 = '';

    if (!orRes.ok) {
      console.error('[OpenRouter Error]', orRes.status, await orRes.text());
      console.log('Generating SVG fallback...');
      // Генерация SVG если OpenRouter упал
      finalImageBase64 = createSvgBase64(parsed.card_name);
    } else {
      const orData = await orRes.json();
      if (orData.data && orData.data[0] && orData.data[0].b64_json) {
        finalImageBase64 = orData.data[0].b64_json;
        // Проверяем, есть ли префикс data:image... если нет, не добавляем пока, добавим в ответе
      } else if (orData.data && orData.data[0] && orData.data[0].url) {
        // Если вдруг модель вернула URL вместо b64
        const imgUrlRes = await fetch(orData.data[0].url);
        const arrayBuffer = await imgUrlRes.arrayBuffer();
        finalImageBase64 = Buffer.from(arrayBuffer).toString('base64');
      } else {
         console.error('No image data in response');
         finalImageBase64 = createSvgBase64(parsed.card_name);
      }
    }

    // Определяем тип контента (SVG или PNG)
    const prefix = finalImageBase64.startsWith('PHN2Zy') ? 'data:image/svg+xml;base64,' : 'data:image/png;base64,';

    res.status(200).json({
      card_name: parsed.card_name,
      interpretation: parsed.interpretation,
      image_url: finalImageBase64.startsWith('data:') ? finalImageBase64 : `${prefix}${finalImageBase64}`,
    });

  } catch (error) {
    console.error('[CRITICAL SERVER ERROR]', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

// --- Вспомогательная функция для SVG (Node.js Compatible) ---
function createSvgBase64(cardName) {
  // Экранирование спецсимволов для XML
  const safeName = cardName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  const svg = `
  <svg xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" viewBox="0 0 400 600" width="400" height="600">
    <rect width="400" height="600" fill="#1a1a24"/>
    <rect x="20" y="20" width="360" height="560" fill="none" stroke="#c7a87b" stroke-width="2"/>
    <circle cx="200" cy="300" r="100" stroke="#c7a87b" fill="none" opacity="0.5"/>
    <text x="200" y="300" font-family="serif" font-size="24" fill="#c7a87b" text-anchor="middle" dy=".3em">${safeName}</text>
    <text x="200" y="550" font-family="sans-serif" font-size="12" fill="#666" text-anchor="middle">SVG Fallback</text>
  </svg>
  `;
  
  // ВАЖНО: Buffer.from вместо btoa для поддержки кириллицы на сервере
  return Buffer.from(svg).toString('base64');
}

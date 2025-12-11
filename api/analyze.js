export default async function handler(req, res) {
  // 1. CORS заголовки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обработка preflight запроса
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Разрешаем только POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. Проверка ключей API
  const GROQ_KEY = process.env.GROQ_API_KEY;
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

  if (!GROQ_KEY || !OPENROUTER_KEY) {
    console.error('SERVER ERROR: Отсутствуют API ключи в .env');
    return res.status(500).json({ error: 'Configuration Error: Missing API Keys' });
  }

  // 3. Получение ввода пользователя
  let userInput;
  try {
    userInput = req.body?.userInput?.trim();
    if (!userInput) return res.status(400).json({ error: 'Текст запроса пуст' });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  try {
    console.log('[1] Начинаем анализ через Groq...');

    // --- ЗАПРОС К GROQ ---
    // Внимание: URL должен быть чистой строкой без скобок []
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a Jungian psychologist and tarot expert. Analyze the user\'s emotional state. Respond with ONLY valid JSON. No markdown. Fields: "card_name" (Russian), "interpretation" (Russian), "image_prompt" (English visual description).',
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
      throw new Error(`Groq API Error: ${groqRes.status}`);
    }

    const groqData = await groqRes.json();
    let content = groqData.choices?.[0]?.message?.content || '{}';

    // Очистка ответа от Markdown (```json ... ```)
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('Ошибка парсинга JSON от Groq:', content);
      // Значения по умолчанию, если Groq ошибся в формате
      parsed = { 
        card_name: 'Туз Пентаклей', 
        interpretation: 'Внутренний ресурс требует внимания.', 
        image_prompt: 'mystical tarot card ace of pentacles, gold, detailed' 
      };
    }

    console.log('[2] Groq OK. Карта:', parsed.card_name);
    console.log('[3] Генерация изображения через OpenRouter (Flux)...');

    // --- ЗАПРОС К OPENROUTER ---
    const orRes = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://psy-tarot.vercel.app', 
        'X-Title': 'PsyTarot App',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux-pro', 
        prompt: parsed.image_prompt,
        num_images: 1,
        response_format: 'b64_json', // Запрашиваем Base64
        width: 768,
        height: 1024,
      }),
    });

    let finalImage;

    if (!orRes.ok) {
      console.error('[OpenRouter Error]', orRes.status, await orRes.text());
      // Если ошибка генерации - создаем SVG
      const svgBase64 = createSvgBase64(parsed.card_name);
      finalImage = `data:image/svg+xml;base64,${svgBase64}`;
    } else {
      const orData = await orRes.json();
      
      // Проверяем наличие картинки
      if (orData.data && orData.data[0] && orData.data[0].b64_json) {
        finalImage = `data:image/png;base64,${orData.data[0].b64_json}`;
      } else if (orData.data && orData.data[0] && orData.data[0].url) {
        // Если пришла ссылка вместо Base64
        finalImage = orData.data[0].url; 
      } else {
        // Если ответ пустой - SVG
        const svgBase64 = createSvgBase64(parsed.card_name);
        finalImage = `data:image/svg+xml;base64,${svgBase64}`;
      }
    }

    // Отправляем ответ клиенту
    res.status(200).json({
      card_name: parsed.card_name,
      interpretation: parsed.interpretation,
      image_url: finalImage,
    });

  } catch (error) {
    console.error('[CRITICAL ERROR]', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

// Функция для создания SVG (использует Buffer вместо btoa)
function createSvgBase64(cardName) {
  // Экранируем символы для XML
  const safeName = (cardName || 'Unknown').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="400" height="600">
    <rect width="400" height="600" fill="#111"/>
    <rect x="20" y="20" width="360" height="560" fill="none" stroke="#d4af37" stroke-width="2"/>
    <circle cx="200" cy="300" r="100" stroke="#d4af37" fill="none" opacity="0.3"/>
    <text x="200" y="300" font-family="serif" font-size="24" fill="#d4af37" text-anchor="middle">${safeName}</text>
    <text x="200" y="550" font-family="sans-serif" font-size="12" fill="#555" text-anchor="middle">Image Gen Failed</text>
  </svg>`;
  
  // Кодируем в Base64 через Buffer (Node.js стандарт)
  return Buffer.from(svg).toString('base64');
}

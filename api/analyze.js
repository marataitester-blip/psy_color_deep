export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb', // Лимит для больших ответов
    },
  },
};

export default async function handler(req, res) {
  // 1. Настройка заголовков CORS
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

  // 2. Проверка ключей
  const GROQ_KEY = process.env.GROQ_API_KEY;
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

  if (!GROQ_KEY || !OPENROUTER_KEY) {
    console.error('SERVER ERROR: Не найдены API ключи в .env');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // 3. Получение текста от пользователя
    const userInput = req.body?.userInput?.trim();
    if (!userInput) return res.status(400).json({ error: 'Введите текст запроса' });

    console.log('[1] Начинаем анализ текста (Groq)...');

    // --- ЭТАП 1: GROQ (Текст) ---
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
            content: 'You are a Jungian psychologist and tarot expert. Analyze the user\'s emotional state. Respond with ONLY valid JSON. No markdown. Fields: "card_name" (Russian), "interpretation" (Russian, max 3 sentences), "image_prompt" (English visual description for tarot card).',
          },
          { role: 'user', content: userInput },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
    });

    if (!groqRes.ok) {
      throw new Error(`Groq API Error: ${groqRes.status}`);
    }

    const groqData = await groqRes.json();
    let content = groqData.choices?.[0]?.message?.content || '{}';
    // Очистка от маркдауна
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.warn('JSON Parse Error, using fallback');
      parsed = { 
        card_name: 'Колесо Фортуны', 
        interpretation: 'Перемены неизбежны.', 
        image_prompt: 'mystical tarot card wheel of fortune, detailed, 8k' 
      };
    }

    console.log(`[2] Groq OK. Карта: ${parsed.card_name}. Запуск Flux Schnell...`);

    // --- ЭТАП 2: OPENROUTER (Flux Schnell) ---
    // Используем flux-1-schnell — она быстрая и надежная
    const orRes = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://psy-tarot.vercel.app', 
        'X-Title': 'PsyTarot',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux-1-schnell', // <--- ИЗМЕНЕНО НА SCHNELL
        prompt: parsed.image_prompt,
        num_images: 1,
        // Просим Base64, но Schnell иногда возвращает URL, код ниже это обработает
        response_format: 'b64_json', 
        width: 768, 
        height: 1024,
      }),
    });

    let finalImageUrl;

    if (!orRes.ok) {
      console.error('[OpenRouter Error]', orRes.status, await orRes.text());
      // Fallback на SVG
      finalImageUrl = createSvgDataUri(parsed.card_name, 'Gen Error');
    } else {
      const orData = await orRes.json();
      
      // Логика обработки ответа (Base64 или URL)
      if (orData.data && orData.data[0]) {
        if (orData.data[0].b64_json) {
          // Если пришел Base64
          finalImageUrl = `data:image/png;base64,${orData.data[0].b64_json}`;
        } else if (orData.data[0].url) {
          // Если пришла ссылка (Schnell иногда так делает)
          finalImageUrl = orData.data[0].url;
        } else {
           finalImageUrl = createSvgDataUri(parsed.card_name, 'No Data');
        }
      } else {
         finalImageUrl = createSvgDataUri(parsed.card_name, 'Bad Response');
      }
    }

    res.status(200).json({
      card_name: parsed.card_name,
      interpretation: parsed.interpretation,
      image_url: finalImageUrl,
    });

  } catch (error) {
    console.error('[CRITICAL ERROR]', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });

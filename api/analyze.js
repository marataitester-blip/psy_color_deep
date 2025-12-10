export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { userInput } = req.body;

  if (!userInput) {
    return res.status(400).json({ error: 'Пожалуйста, опишите ваше состояние' });
  }

  try {
    // ---------------------------------------------------------
    // STEP 1: Groq API (Text Generation)
    // ---------------------------------------------------------
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: "system",
            content: "Ты юнгианский психолог и таролог. Проанализируй состояние пользователя. Верни ТОЛЬКО валидный JSON объект. Не используй markdown блоки (```json). Формат: {\"card_name\": \"Название карты (на русском)\", \"interpretation\": \"Глубокое психологическое толкование состояния (на русском, 3-4 предложения)\", \"image_prompt\": \"Description of the tarot card in English, dark fantasy style, detailed, mystical, golden accents, high resolution, centered composition\"}."
          },
          {
            role: "user",
            content: userInput
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error("Groq Error:", errorText);
      throw new Error(`Ошибка сервиса анализа (Groq): ${groqResponse.status}`);
    }

    const groqData = await groqResponse.json();
    let content = groqData.choices[0]?.message?.content || "{}";

    // Clean up markdown formatting if present
    content = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');

    let parsedGroq;
    try {
      parsedGroq = JSON.parse(content);
    } catch (e) {
      console.error("JSON Parse Error:", content);
      throw new Error("Ошибка обработки ответа от AI");
    }

    if (!parsedGroq.image_prompt) {
      throw new Error("AI не смог сформировать визуальный образ");
    }

    // ---------------------------------------------------------
    // STEP 2: OpenRouter API (Image Generation - Flux.2 Pro)
    // ---------------------------------------------------------
    // We use the generations endpoint to request b64_json directly for speed/simplicity
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://mirmag.vercel.app',
        'X-Title': 'MirMag Groq',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux.2-pro',
        prompt: parsedGroq.image_prompt,
        num_images: 1,
        response_format: 'b64_json' 
      }),
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error("OpenRouter Error:", errorText);
      throw new Error(`Ошибка генерации изображения: ${openRouterResponse.status}`);
    }

    const imageData = await openRouterResponse.json();
    const b64 = imageData.data?.[0]?.b64_json;

    if (!b64) {
      throw new Error("Изображение не было получено");
    }

    // ---------------------------------------------------------
    // STEP 3: Return Result
    // ---------------------------------------------------------
    res.status(200).json({
      card_name: parsedGroq.card_name,
      interpretation: parsedGroq.interpretation,
      image_url: `data:image/png;base64,${b64}`
    });

  } catch (error) {
    console.error("Full Error:", error);
    res.status(500).json({ 
      error: error.message || "Внутренняя ошибка сервера" 
    });
  }
}
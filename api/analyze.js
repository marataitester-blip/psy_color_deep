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

  // Verify API keys
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY is not configured' });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });
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
            content: "Ты юнгианский психолог и таролог. Проанализируй состояние пользователя. Верни ТОЛЬКО валидный JSON объект. Не используй markdown блоки (```
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
      throw new Error(`Groq API error: ${groqResponse.status}`);
    }

    const groqData = await groqResponse.json();
    let content = groqData.choices?.message?.content || "{}";

    // Clean up markdown formatting if present
    content = content.replace(/^```json\s*/i, '').replace(/\s*```

    let parsedGroq;
    try {
      parsedGroq = JSON.parse(content);
    } catch (e) {
      console.error("JSON Parse Error:", content);
      throw new Error("Failed to parse AI response");
    }

    if (!parsedGroq.image_prompt) {
      throw new Error("No image prompt generated");
    }

    const cardName = parsedGroq.card_name || 'Архетип';
    const interpretation = parsedGroq.interpretation || '';
    const imagePrompt = parsedGroq.image_prompt;

    // ---------------------------------------------------------
    // STEP 2: OpenRouter API (Image Generation - Flux.2 Pro)
    // ---------------------------------------------------------
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://psy-color-deep.vercel.app',
        'X-Title': 'MirMag Groq',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux-pro',
        prompt: imagePrompt,
        num_images: 1,
        response_format: 'b64_json'
      }),
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error("OpenRouter Error:", errorText);
      throw new Error(`Image generation failed: ${openRouterResponse.status}`);
    }

    const imageData = await openRouterResponse.json();
    const b64 = imageData.data?.?.b64_json;

    if (!b64) {
      throw new Error("No image data received");
    }

    const imageUrl = `data:image/png;base64,${b64}`;

    // ---------------------------------------------------------
    // STEP 3: Return Result
    // ---------------------------------------------------------
    res.status(200).json({
      card_name: cardName,
      interpretation: interpretation,
      image_url: imageUrl
    });

  } catch (error) {
    console.error("Full Error:", error);
    res.status(500).json({ 
      error: error.message || "Internal server error" 
    });
  }
}

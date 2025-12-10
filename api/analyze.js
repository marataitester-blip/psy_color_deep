export default async function handler(req, res) {
  // CORS configuration for Vercel Serverless Function
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Adjust for production security if needed
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle Preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Allow only POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { userInput } = req.body;

  if (!userInput) {
    return res.status(400).json({ error: 'Description is required' });
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
            content: "Ты юнгианский психолог и таролог. Проанализируй состояние пользователя. Верни ТОЛЬКО валидный JSON объект. Не используй markdown блоки (```json). Формат: {\"card_name\": \"Название карты\", \"interpretation\": \"Глубокое психологическое толкование (на русском)\", \"image_prompt\": \"Детальное описание карты для генерации изображения на английском, мистический стиль, высокое качество, dark fantasy tarot style\"}."
          },
          {
            role: "user",
            content: userInput
          }
        ],
        // Force JSON object mode if supported by the model, otherwise prompt relies on system instruction
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      throw new Error(`Groq API Error: ${groqResponse.status} ${errorText}`);
    }

    const groqData = await groqResponse.json();
    let content = groqData.choices[0]?.message?.content || "{}";

    // Clean up any potential markdown formatting from the LLM
    content = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');

    let parsedGroq;
    try {
      parsedGroq = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse Groq JSON:", content);
      throw new Error("Invalid JSON received from Groq");
    }

    if (!parsedGroq.image_prompt) {
      throw new Error("Groq response missing image_prompt");
    }

    // ---------------------------------------------------------
    // STEP 2: OpenRouter API (Image Generation)
    // ---------------------------------------------------------
    // Note: Using images/generations endpoint to ensure reliable b64_json return
    // which effectively maps to the 'image' modality requirement but ensures correct data format.
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://mirmag-groq.vercel.app', // Required by OpenRouter for ranking
        'X-Title': 'MirMag Groq',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux.2-pro',
        prompt: parsedGroq.image_prompt,
        // Request base64 directly to avoid secondary fetch
        response_format: 'b64_json', 
        num_images: 1
      }),
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      throw new Error(`OpenRouter API Error: ${openRouterResponse.status} ${errorText}`);
    }

    const imageData = await openRouterResponse.json();
    
    // Check for standard OpenAI-compatible image response structure
    const b64 = imageData.data?.[0]?.b64_json;

    if (!b64) {
      console.error("OpenRouter Response:", imageData);
      throw new Error("No image data received from OpenRouter");
    }

    // ---------------------------------------------------------
    // STEP 3: Return Final JSON
    // ---------------------------------------------------------
    res.status(200).json({
      card_name: parsedGroq.card_name,
      interpretation: parsedGroq.interpretation,
      image_url: `data:image/png;base64,${b64}`
    });

  } catch (error) {
    console.error("Analysis failed:", error);
    res.status(500).json({ 
      error: error.message || "Internal Server Error during analysis" 
    });
  }
}
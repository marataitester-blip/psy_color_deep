export default async function handler(req, res) {
  // CORS configuration
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

  const { userInput } = req.body;

  // Validate input
  if (!userInput || typeof userInput !== 'string' || userInput.trim().length === 0) {
    return res.status(400).json({ error: 'Пожалуйста, опишите ваше состояние' });
  }

  // Validate API keys
  if (!process.env.GROQ_API_KEY) {
    console.error('Missing GROQ_API_KEY');
    return res.status(500).json({ error: 'Groq API key not configured' });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('Missing OPENROUTER_API_KEY');
    return res.status(500).json({ error: 'OpenRouter API key not configured' });
  }

  try {
    // ─────────────────────────────────────────────
    // STEP 1: Groq API - Generate tarot card analysis
    // ─────────────────────────────────────────────
    console.log('📍 Step 1: Calling Groq API for tarot analysis...');
    
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
            role: 'system',
            content: `You are a Jungian psychologist and expert tarot reader. Analyze the user's emotional state and provide a deep psychological interpretation through tarot archetypes. 

Return ONLY valid JSON (no markdown, no code blocks):
{
  "card_name": "Specific Tarot Card Name (in Russian)",
  "interpretation": "3-4 sentences of deep psychological analysis in Russian, addressing the user's emotional state and psychological archetype",
  "image_prompt": "Detailed English description of the corresponding tarot card image: dark mystical fantasy style, golden accents, detailed composition, centered portrait, high quality, realistic yet mystical"
}`,
          },
          {
            role: 'user',
            content: userInput.trim(),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_tokens: 1500,
        top_p: 0.9,
      }),
    });

    // Check Groq response
    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('❌ Groq API Error:', groqResponse.status, errorText);
      throw new Error(`Groq API error: ${groqResponse.status}`);
    }

    const groqData = await groqResponse.json();
    console.log('✅ Groq response received');

    // Parse Groq response
    let content = groqData.choices?.[0]?.message?.content || '{}';
    content = content
      .replace(/^```
      .replace(/\s*```$/i, '')
      .trim();

    let parsedGroq;
    try {
      parsedGroq = JSON.parse(content);
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', content);
      throw new Error('Failed to parse tarot analysis from Groq');
    }

    // Extract data with fallbacks
    const cardName = parsedGroq.card_name?.trim() || 'The Fool';
    const interpretation = parsedGroq.interpretation?.trim() || 
      'Этот архетип отражает вашу способность к трансформации и внутреннему росту.';
    const imagePrompt = parsedGroq.image_prompt?.trim() || 
      'mystical tarot card, The Fool, dark fantasy, golden accents, detailed, centered, high resolution';

    console.log('📋 Parsed data:', { cardName, promptLength: imagePrompt.length });

    // ─────────────────────────────────────────────
    // STEP 2: OpenRouter API - Generate image
    // ─────────────────────────────────────────────
    console.log('📍 Step 2: Calling OpenRouter API for image generation...');
    
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
        response_format: 'b64_json',
        width: 768,
        height: 1024,
      }),
    });

    // Check OpenRouter response
    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error('❌ OpenRouter API Error:', openRouterResponse.status, errorText);
      throw new Error(`OpenRouter API error: ${openRouterResponse.status}`);
    }

    const imageData = await openRouterResponse.json();
    console.log('✅ OpenRouter response received');

    // Extract base64 image
    const b64 = imageData.data?.[0]?.b64_json;

    if (!b64) {
      console.error('❌ No base64 data in OpenRouter response:', imageData);
      throw new Error('Image generation failed: no data received');
    }

    console.log('✅ Image generated successfully');

    // ─────────────────────────────────────────────
    // STEP 3: Return successful response
    // ─────────────────────────────────────────────
    res.status(200).json({
      card_name: cardName,
      interpretation: interpretation,
      image_url: `data:image/png;base64,${b64}`,
    });

    console.log('✅ Successfully returned result to client');

  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
    
    // Return user-friendly error message
    const errorMessage = error.message.includes('Groq') 
      ? 'Ошибка анализа состояния. Попробуйте позже.'
      : error.message.includes('OpenRouter')
      ? 'Ошибка генерации портрета. Попробуйте позже.'
      : error.message || 'Внутренняя ошибка сервера';

    res.status(500).json({
      error: errorMessage,
    });
  }
}

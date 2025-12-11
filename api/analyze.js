export default async function handler(req, res) {
  // CORS
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

  if (!userInput) {
    return res.status(400).json({ error: 'No input provided' });
  }

  if (!process.env.GROQ_API_KEY || !process.env.OPENROUTER_API_KEY) {
    console.error('Missing API keys');
    return res.status(500).json({ error: 'API keys not configured' });
  }

  try {
    // Step 1: Call Groq for text analysis
    console.log('Calling Groq API...');
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
            content: 'You are a Jungian psychologist and tarot expert. Analyze the user state and return ONLY a JSON object with no markdown: {"card_name": "Tarot Card Name", "interpretation": "3-4 sentence psychological analysis in Russian", "image_prompt": "English description of the tarot card, dark fantasy style, mystical, golden accents, detailed"}',
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

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq error:', errorText);
      throw new Error(`Groq failed: ${groqResponse.status}`);
    }

    const groqData = await groqResponse.json();
    let content = groqData.choices?.[0]?.message?.content || '{}';
    content = content.replace(/^``````$/i, '').trim();

    let parsedGroq;
    try {
      parsedGroq = JSON.parse(content);
    } catch (e) {
      console.error('JSON parse error:', content);
      throw new Error('Failed to parse Groq response');
    }

    const cardName = parsedGroq.card_name || 'Archetype';
    const interpretation = parsedGroq.interpretation || 'A mystical revelation awaits.';
    const imagePrompt = parsedGroq.image_prompt || 'mystical tarot card, dark gold, detailed, fantasy';

    // Step 2: Call OpenRouter for image
    console.log('Calling OpenRouter API with prompt:', imagePrompt);
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
      }),
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error('OpenRouter error:', errorText);
      throw new Error(`Image generation failed: ${openRouterResponse.status}`);
    }

    const imageData = await openRouterResponse.json();
    const b64 = imageData.data?.[0]?.b64_json;

    if (!b64) {
      console.error('No b64 data in response:', imageData);
      throw new Error('No image generated');
    }

    // Return result
    res.status(200).json({
      card_name: cardName,
      interpretation: interpretation,
      image_url: `data:image/png;base64,${b64}`,
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      error: error.message || 'Server error',
    });
  }
}

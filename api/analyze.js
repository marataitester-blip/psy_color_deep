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
    console.log('[1] Starting Groq analysis');
    
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
            content: 'You are a Jungian psychologist and tarot expert. Analyze the user\'s emotional state and respond with ONLY valid JSON (no markdown or code blocks). Required fields: "card_name" (tarot card name in Russian), "interpretation" (3-4 sentences psychological analysis in Russian), "image_prompt" (detailed English description of the tarot card for image generation)',
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

    console.log('[1] Groq status:', groqRes.status);

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error('[1] Groq error:', groqRes.status, err.substring(0, 200));
      return res.status(502).json({ error: 'Groq service error' });
    }

    const groqData = await groqRes.json();
    console.log('[1] Groq success');

    let content = groqData.choices?.[0]?.message?.content || '{}';
    content = content.replace(/``````\n?/g, '').trim();

    let parsed = {
      card_name: 'The Hermit',
      interpretation: 'Ваше состояние отражает поиск смысла.',
      image_prompt: 'mystical tarot hermit card with lantern, dark fantasy style, golden accents, detailed',
    };

    try {
      parsed = JSON.parse(content);
      console.log('[1] Parse success');
    } catch (e) {
      console.error('[1] Parse error, using fallback');
    }

    const cardName = parsed.card_name || 'Unknown';
    const interpretation = parsed.interpretation || 'A mystical revelation awaits.';
    const imagePrompt = parsed.image_prompt || 'mystical tarot card, dark fantasy, golden accents, detailed';

    console.log('[2] Starting OpenRouter image generation');
    console.log('[2] Prompt:', imagePrompt.substring(0, 80));

    // OpenRouter API - правильный формат
    const orRes = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
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

    console.log('[2] OpenRouter status:', orRes.status);
    console.log('[2] OpenRouter headers:', JSON.stringify({
      'content-type': orRes.headers.get('content-type'),
      'content-length': orRes.headers.get('content-length'),
    }));

    if (!orRes.ok) {
      const errText = await orRes.text();
      console.error('[2] OpenRouter error:', orRes.status);
      console.error('[2] Error body:', errText.substring(0, 500));
      
      // Если OpenRouter упал, возвращаем текст + SVG fallback
      const svgFallback = generateTarotSVG(cardName);
      const b64Fallback = Buffer.from(svgFallback).toString('base64');
      
      return res.status(200).json({
        car

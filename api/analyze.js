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

    if (!orRes.ok) {
      const errText = await orRes.text();
      console.error('[2] OpenRouter error:', orRes.status);
      console.error('[2] Error body:', errText.substring(0, 500));
      
      // Fallback на SVG
      const svgFallback = generateTarotSVG(cardName);
      const b64Fallback = btoa(svgFallback);
      
      return res.status(200).json({
        card_name: cardName,
        interpretation: interpretation,
        image_url: `data:image/svg+xml;base64,${b64Fallback}`,
        warning: 'Image generation service unavailable, using default image',
      });
    }

    const orData = await orRes.json();
    console.log('[2] OpenRouter response received');

    const b64 = orData.data?.[0]?.b64_json;

    if (!b64) {
      console.error('[2] No b64 in response');
      
      // Fallback на SVG
      const svgFallback = generateTarotSVG(cardName);
      const b64Fallback = btoa(svgFallback);
      
      return res.status(200).json({
        card_name: cardName,
        interpretation: interpretation,
        image_url: `data:image/svg+xml;base64,${b64Fallback}`,
      });
    }

    console.log('[3] Image generated successfully');

    res.status(200).json({
      card_name: cardName,
      interpretation: interpretation,
      image_url: `data:image/png;base64,${b64}`,
    });

  } catch (error) {
    console.error('[ERROR]', error.message);
    res.status(500).json({
      error: error.message,
    });
  }
}

function generateTarotSVG(cardName) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="400" height="600">
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
    
    <!-- Ornate border -->
    <rect x="15" y="15" width="370" height="570" fill="none" stroke="#c7a87b" stroke-width="3"/>
    <rect x="20" y="20" width="360" height="560" fill="none" stroke="#a68558" stroke-width="1"/>
    
    <!-- Corner decorations -->
    <circle cx="25" cy="25" r="4" fill="#c7a87b" filter="url(#glow)"/>
    <circle cx="375" cy="25" r="4" fill="#c7a87b" filter="url(#glow)"/>
    <circle cx="25" cy="575" r="4" fill="#c7a87b" filter="url(#glow)"/>
    <circle cx="375" cy="575" r="4" fill="#c7a87b" filter="url(#glow)"/>
    
    <!-- Card title -->
    <text x="200" y="80" font-family="Cinzel, serif" font-size="32" font-weight="bold" fill="#c7a87b" text-anchor="middle" filter="url(#glow)">${cardName}</text>
    
    <!-- Mystical circles -->
    <circle cx="200" cy="300" r="80" fill="none" stroke="#c7a87b" stroke-width="1" opacity="0.4"/>
    <circle cx="200" cy="300" r="65" fill="none" stroke="#a68558" stroke-width="1" opacity="0.3"/>
    <circle cx="200" cy="300" r="50" fill="none" stroke="#c7a87b" stroke-width="1" opacity="0.2"/>
    
    <!-- Central star -->
    <path d="M 200 240 L 215 285 L 265 285 L 225 330 L 240 375 L 200 330 L 160 375 L 175 330 L 135 285 L 185 285 Z" fill="#c7a87b" opacity="0.7" filter="url(#glow)"/>
    
    <!-- Decorative lines -->
    <line x1="50" y1="150" x2="350" y2="150" stroke="#a68558" stroke-width="1" opacity="0.3"/>
    <line x1="50" y1="450" x2="350" y2="450" stroke="#a68558" stroke-width="1" opacity="0.3"/>
    
    <!-- Bottom text -->
    <text x="200" y="540" font-family="Cinzel, serif" font-size="14" fill="#9a9490" text-anchor="middle" opacity="0.6">✦ MIRMAG GROQ ✦</text>
  </svg>`;
}

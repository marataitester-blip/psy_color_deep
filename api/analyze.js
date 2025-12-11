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

  if (!GROQ_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
  }

  try {
    console.log('[Groq] Starting analysis');
    
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
            content: 'You are a Jungian psychologist and tarot expert. Analyze the user\'s emotional state and respond with ONLY valid JSON (no markdown or code blocks). Required fields: "card_name" (tarot card name in Russian), "interpretation" (3-4 sentences psychological analysis in Russian)',
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

    console.log('[Groq] Response status:', groqRes.status);

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error('[Groq] Error:', groqRes.status, err.substring(0, 200));
      return res.status(502).json({ error: 'Groq service error' });
    }

    const groqData = await groqRes.json();
    console.log('[Groq] Got data');

    let content = groqData.choices?.[0]?.message?.content || '{}';
    content = content.replace(/``````\n?/g, '').trim();

    let parsed = {
      card_name: 'The Hermit',
      interpretation: 'Ваше состояние отражает глубокий поиск смысла и внутренней истины. Это время интроспекции и размышления о жизненном пути.',
    };

    try {
      parsed = JSON.parse(content);
      console.log('[Parse] Success');
    } catch (e) {
      console.error('[Parse] Error, using fallback');
    }

    const cardName = parsed.card_name || 'Unknown Card';
    const interpretation = parsed.interpretation || 'A mystical revelation awaits.';

    // Generate placeholder image as SVG
    const svgImage = generateTarotSVG(cardName);
    const b64 = Buffer.from(svgImage).toString('base64');

    console.log('[Success] Returning result');

    res.status(200).json({
      card_name: cardName,
      interpretation: interpretation,
      image_url: `data:image/svg+xml;base64,${b64}`,
    });

  } catch (error) {
    console.error('[Fatal]', error.message);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
}

// Generate mystical tarot card SVG
function generateTarotSVG(cardName) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="400" height="600">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#1a1a24;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#0f0f14;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect fill="url(#grad)" width="400" height="600"/>
    
    <!-- Border -->
    <rect x="10" y="10" width="380" height="580" fill="none" stroke="#c7a87b" stroke-width="2"/>
    
    <!-- Decorative corners -->
    <circle cx="20" cy="20" r="3" fill="#c7a87b"/>
    <circle cx="380" cy="20" r="3" fill="#c7a87b"/>
    <circle cx="20" cy="580" r="3" fill="#c7a87b"/>
    <circle cx="380" cy="580" r="3" fill="#c7a87b"/>
    
    <!-- Card title -->
    <text x="200" y="100" font-family="serif" font-size="28" font-weight="bold" fill="#c7a87b" text-anchor="middle">${cardName}</text>
    
    <!-- Mystical symbol -->
    <circle cx="200" cy="300" r="60" fill="none" stroke="#c7a87b" stroke-width="1" opacity="0.5"/>
    <circle cx="200" cy="300" r="50" fill="none" stroke="#a68558" stroke-width="1" opacity="0.3"/>
    
    <!-- Star in center -->
    <path d="M 200 250 L 210 280 L 240 280 L 215 305 L 225 335 L 200 310 L 175 335 L 185 305 L 160 280 L 190 280 Z" fill="#c7a87b" opacity="0.8"/>
    
    <!-- Bottom text -->
    <text x="200" y="520" font-family="serif" font-size="12" fill="#9a9490" text-anchor="middle" opacity="0.7">🪞 MIRMAG GROQ</text>
  </svg>`;
}

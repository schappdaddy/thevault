export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(400).json({ error: 'Invalid JSON' }) }
  }

  const { imageData, mediaType, askingPrice, hints } = body;
  if (!imageData) return res.status(400).json({ error: 'No image data provided' });

  const cleanImageData = imageData.replace(/ /g, '+');
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const safeMediaType = validTypes.includes(mediaType) ? mediaType : 'image/jpeg';

  const hintsText = hints ? `\nAdditional context from user: ${hints}` : '';
  const priceText = askingPrice ? `\nAsking price: $${askingPrice}` : '\nNo asking price provided.';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: safeMediaType, data: cleanImageData }
            },
            {
              type: 'text',
              text: `You are an expert sports memorabilia buyer and appraiser. Analyze this item and give a detailed buying recommendation.${hintsText}${priceText}

Respond ONLY with a valid JSON object, no markdown, no preamble:
{
  "name": "descriptive item name",
  "category": "item category",
  "player": "player name or empty string",
  "team": "team name or empty string",
  "year": "year or empty string",
  "manufacturer": "manufacturer or empty string",
  "condition": "estimated condition",
  "marketValue": estimated current market value as number,
  "dealRating": "Great Deal, Good Deal, Fair Price, Overpriced, or No Price to Evaluate",
  "recommendation": "Buy, Pass, or Negotiate",
  "summary": "2-3 sentence overall assessment",
  "pros": ["pro 1", "pro 2", "pro 3"],
  "cons": ["con 1", "con 2"],
  "redFlags": ["any authenticity or condition concerns, or empty array"],
  "gradingPotential": "brief note on whether grading would add value"
}`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: `API error: ${response.status}` });
    }

    const data = await response.json();
    const text = data.content?.map(b => b.text || '').join('') || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: err.message });
  }
}

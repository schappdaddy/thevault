export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageData, mediaType } = req.body;
  if (!imageData) return res.status(400).json({ error: 'No image data provided' });

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
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageData }
            },
            {
              type: 'text',
              text: `You are a sports memorabilia expert with deep knowledge of baseball cards, bobbleheads, autographs, prints, jerseys, and all collectibles. Analyze this image carefully.

Respond ONLY with a valid JSON object, no markdown, no preamble, no explanation. Use these exact keys:
{
  "name": "descriptive item name including player and type",
  "year": "year as 4-digit string, or empty string if unknown",
  "category": "one of exactly: Baseball Card, Bobblehead, Print, Autograph Baseball, Jersey, Bat, Helmet, Photo, Poster, Figurine, Other",
  "player": "full player name or empty string",
  "team": "full team name or empty string",
  "manufacturer": "brand or manufacturer name or empty string",
  "condition": "one of exactly: Mint, Near Mint, Excellent, Very Good, Good, Fair, Poor",
  "gradingService": "one of exactly: PSA, BGS, SGC, JSA, BAS, or empty string",
  "gradeScore": "numeric grade as string if visible on label, or empty string",
  "marketValue": current estimated market value as a number with no dollar sign,
  "serialNumber": "serial number or cert number if visible, or empty string",
  "notes": "relevant details: pose, uniform style, edition, any text visible on item, authentication details, anything notable"
}`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return res.status(response.status).json({ error: `Anthropic API error: ${response.status}` });
    }

    const data = await response.json();
    const text = data.content?.map(b => b.text || '').join('') || '';
    const clean = text.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(clean);
      return res.status(200).json(parsed);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response', raw: text });
    }

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: err.message });
  }
}

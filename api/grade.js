export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, player, team, year, category, manufacturer, condition, market_value } = req.body;

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
          content: `You are a sports memorabilia grading expert who helps collectors decide if grading is financially worthwhile. Analyze whether this item is worth submitting for professional grading.

Item details:
- Name: ${name}
- Player: ${player || 'Unknown'}
- Team: ${team || 'Unknown'}
- Year: ${year || 'Unknown'}
- Category: ${category || 'Unknown'}
- Manufacturer: ${manufacturer || 'Unknown'}
- Current Condition: ${condition || 'Unknown'}
- Current Estimated Value (raw): $${market_value || 0}

Provide a detailed grading analysis. Consider PSA, BGS, and SGC grading services. Factor in typical grading costs ($25-$150 depending on service level) and realistic grade outcomes based on the described condition.

Respond ONLY with a valid JSON object, no markdown, no preamble:
{
  "verdict": "Worth Grading, Not Worth Grading, or Borderline",
  "summary": "2-3 sentence overall recommendation",
  "gradingTiers": [
    {
      "grade": "PSA 10",
      "estimatedValue": number,
      "probability": "percentage chance of achieving this grade e.g. 5%",
      "netGain": number after subtracting grading cost
    },
    {
      "grade": "PSA 9",
      "estimatedValue": number,
      "probability": "e.g. 20%",
      "netGain": number
    },
    {
      "grade": "PSA 8",
      "estimatedValue": number,
      "probability": "e.g. 40%",
      "netGain": number
    },
    {
      "grade": "PSA 7",
      "estimatedValue": number,
      "probability": "e.g. 35%",
      "netGain": number
    }
  ],
  "recommendedService": "PSA, BGS, or SGC and why in one sentence",
  "estimatedGradingCost": number,
  "bestCaseGain": number,
  "expectedGain": number,
  "considerations": ["consideration 1", "consideration 2", "consideration 3"]
}`
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

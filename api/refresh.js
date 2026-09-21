export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id, name, player, team, year, category, manufacturer, condition, grading_service, grade_score, serial_number } = req.body;

  if (!id) return res.status(400).json({ error: 'Item ID required' });

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )

  try {
    await supabase.from('items').update({ price_refreshing: true }).eq('id', id)

    const gradeInfo = grading_service && grade_score ? `${grading_service} ${grade_score}` : 'Ungraded'

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `You are a sports memorabilia market expert. Estimate the current market value for this item based on your knowledge of comparable sales.

Item details:
- Name: ${name}
- Player: ${player || 'Unknown'}
- Team: ${team || 'Unknown'}
- Year: ${year || 'Unknown'}
- Category: ${category || 'Unknown'}
- Manufacturer: ${manufacturer || 'Unknown'}
- Condition: ${condition || 'Unknown'}
- Grading: ${gradeInfo}
- Serial Number: ${serial_number || 'None'}

This estimate is not based on live sold-listing data — use your training knowledge of typical sale prices for comparable items, accounting for the specific set/manufacturer, parallel or print run implied by the name and serial number, and the grade. Be conservative, and note in your reasoning anything that makes the value uncertain.

Respond ONLY with valid JSON, no markdown, no preamble:
{
  "marketValue": number only,
  "reasoning": "2-3 sentence explanation of how you arrived at this estimate",
  "confidence": "high, medium, or low"
}`
        }]
      })
    })

    if (!claudeRes.ok) throw new Error(`Claude API error: ${claudeRes.status}`)

    const claudeData = await claudeRes.json()
    const text = claudeData.content?.map(b => b.text || '').join('') || ''
    const clean = text.replace(/```json|```/g, '').trim()
    const valuation = JSON.parse(clean)

    await supabase.from('items').update({
      market_value:          valuation.marketValue,
      price_refreshing:      false,
      price_last_refreshed:  new Date().toISOString(),
      price_reasoning:       valuation.reasoning || null,
      price_confidence:      valuation.confidence || null,
      price_data_source:     'AI estimate',
      price_range:           null,
      price_market_velocity: null,
      price_demand_level:    null,
      price_sales_count:     null,
      price_quick_take:      null,
    }).eq('id', id)

    return res.status(200).json({ success: true, marketValue: valuation.marketValue })

  } catch (err) {
    console.error('Refresh error:', err)
    await supabase.from('items').update({ price_refreshing: false }).eq('id', id)
    return res.status(500).json({ error: err.message })
  }
}

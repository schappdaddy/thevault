export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(400).json({ error: 'Invalid JSON' }) }
  }

  console.log('Callback body:', JSON.stringify(body).slice(0, 500))

  const { itemId, itemName, player, year, category, condition, grading_service, grade_score } = body;
  const datasetId = body.datasetId || body.resource?.defaultDatasetId
  const runId = body.runId || body.resource?.id

  console.log(`Callback received for item: ${itemName} (${itemId}), dataset: ${datasetId}, run: ${runId}`)

  if (!itemId) {
    return res.status(400).json({ error: 'Missing itemId' })
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )

  try {
    // Fetch results from Apify dataset
    const datasetUrl = datasetId
      ? `https://api.apify.com/v2/datasets/${datasetId}/items?token=${process.env.APIFY_API_TOKEN}`
      : `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${process.env.APIFY_API_TOKEN}`

    console.log(`Fetching dataset from: ${datasetUrl.split('?')[0]}`)

    const datasetRes = await fetch(datasetUrl)

    if (!datasetRes.ok) throw new Error(`Dataset fetch failed: ${datasetRes.status}`)

    const items = await datasetRes.json()
    console.log(`Dataset returned ${items.length} items`)

    const summary = items.find(i => i.summary)?.summary
    const meta = items.find(i => i.meta)?.meta

    let ebayData = null
    if (summary?.recommendedPrice?.raw) {
      ebayData = {
        recommendedPrice: summary.recommendedPrice.raw,
        priceLow:         summary.priceRange?.low?.raw,
        priceHigh:        summary.priceRange?.high?.raw,
        marketVelocity:   summary.marketVelocity,
        demandLevel:      summary.demandLevel,
        quickTake:        summary.quickTake,
        confidence:       summary.confidence,
        itemsAnalyzed:    meta?.itemsAnalyzed,
      }
      console.log(`eBay data for ${itemName}: $${ebayData.recommendedPrice}`)
    } else {
      console.log('No summary found in dataset, items:', JSON.stringify(items).slice(0, 300))
    }

    // Build Claude prompt with real data
    const ebayContext = ebayData
      ? `Real eBay sold data (last 90 days, ${ebayData.itemsAnalyzed} sales):
- Recommended price: $${ebayData.recommendedPrice}
- Price range: $${ebayData.priceLow} - $${ebayData.priceHigh}
- Market velocity: ${ebayData.marketVelocity}
- Demand level: ${ebayData.demandLevel}
- Confidence: ${ebayData.confidence}
- Market insight: ${ebayData.quickTake}
Use this real market data as the primary source for your valuation.`
      : `No eBay data available. Use your training knowledge to estimate.`

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
        messages: [{
          role: 'user',
          content: `You are a sports memorabilia market expert. Provide a market valuation for this item.

Item details:
- Name: ${itemName}
- Player: ${player || 'Unknown'}
- Year: ${year || 'Unknown'}
- Category: ${category || 'Unknown'}
- Condition: ${condition || 'Unknown'}
- Grading Service: ${grading_service || 'Ungraded'}
- Grade Score: ${grade_score || 'N/A'}

${ebayContext}

Respond ONLY with a valid JSON object, no markdown, no preamble:
{
  "marketValue": recommended market value as a number only,
  "reasoning": "2-3 sentence explanation referencing real sales data if available",
  "confidence": "high, medium, or low",
  "dataSource": "${ebayData ? 'eBay sold listings' : 'AI estimate'}"
}`
        }]
      })
    })

    if (!claudeRes.ok) throw new Error(`Claude API error: ${claudeRes.status}`)

    const claudeData = await claudeRes.json()
    const text = claudeData.content?.map(b => b.text || '').join('') || ''
    const clean = text.replace(/```json|```/g, '').trim()
    const valuation = JSON.parse(clean)

    console.log(`Valuation for ${itemName}: $${valuation.marketValue}`)

    // Update Supabase with new price and clear refreshing flag
    await supabase.from('items').update({
      market_value:         valuation.marketValue,
      price_refreshing:     false,
      price_last_refreshed: new Date().toISOString(),
    }).eq('id', itemId)

    console.log(`Updated ${itemName} to $${valuation.marketValue}`)
    return res.status(200).json({ success: true, marketValue: valuation.marketValue })

  } catch (err) {
    console.error('Callback error:', err)
    await supabase.from('items').update({ price_refreshing: false }).eq('id', itemId)
    return res.status(500).json({ error: err.message })
  }
}

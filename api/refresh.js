export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, player, team, year, category, manufacturer, condition, grading_service, grade_score } = req.body;

  // Build smart eBay search query
  const queryParts = [player, year, name.split(' ').slice(0,4).join(' ')].filter(Boolean)
  const searchQuery = queryParts.join(' ')

  let ebayData = null

  try {
    // Call Apify eBay Sold Listings Intelligence
    const apifyRes = await fetch(
      `https://api.apify.com/v2/acts/marielise.dev~ebay-sold-listings-intelligence/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          ebaySite: 'ebay.com',
          soldWithinDays: 90,
          maxItems: 20,
          sortBy: 'date_desc',
          outputFormat: 'full',
          includeAnalytics: true,
          proxy: { useApifyProxy: true }
        })
      }
    )

    if (apifyRes.ok) {
      const items = await apifyRes.json()
      // Find the summary record
      const summary = items.find(i => i.summary)?.summary
      if (summary) {
        ebayData = {
          recommendedPrice: summary.recommendedPrice?.raw,
          priceLow:         summary.priceRange?.low?.raw,
          priceHigh:        summary.priceRange?.high?.raw,
          marketVelocity:   summary.marketVelocity,
          avgDaysToSell:    summary.averageDaysToSell,
          demandLevel:      summary.demandLevel,
          quickTake:        summary.quickTake,
          confidence:       summary.confidence,
          itemsAnalyzed:    items.find(i => i.meta)?.meta?.itemsAnalyzed,
        }
        console.log('eBay data:', JSON.stringify(ebayData))
      }
    }
  } catch (err) {
    console.error('Apify error:', err.message)
    // Don't fail — fall through to Claude-only estimate
  }

  // Build Claude prompt with real data if available
  const ebayContext = ebayData
    ? `Real eBay sold data for "${searchQuery}" (last 90 days, ${ebayData.itemsAnalyzed} sales):
- Recommended price: $${ebayData.recommendedPrice}
- Price range: $${ebayData.priceLow} - $${ebayData.priceHigh}
- Market velocity: ${ebayData.marketVelocity}
- Avg days to sell: ${ebayData.avgDaysToSell}
- Demand level: ${ebayData.demandLevel}
- Confidence: ${ebayData.confidence}
- Market insight: ${ebayData.quickTake}

Use this real market data as the primary source for your valuation.`
    : `No real-time eBay data available. Use your training knowledge to estimate.`

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
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `You are a sports memorabilia market expert. Provide a market valuation for this item.

Item details:
- Name: ${name}
- Player: ${player || 'Unknown'}
- Team: ${team || 'Unknown'}
- Year: ${year || 'Unknown'}
- Category: ${category || 'Unknown'}
- Manufacturer: ${manufacturer || 'Unknown'}
- Condition: ${condition || 'Unknown'}
- Grading Service: ${grading_service || 'Ungraded'}
- Grade Score: ${grade_score || 'N/A'}

${ebayContext}

Respond ONLY with a valid JSON object, no markdown, no preamble:
{
  "marketValue": the recommended market value as a number only,
  "reasoning": "2-3 sentence explanation referencing the real sales data if available",
  "confidence": "high, medium, or low",
  "priceRange": "${ebayData ? `$${ebayData.priceLow} - $${ebayData.priceHigh}` : 'unknown'}",
  "salesCount": ${ebayData?.itemsAnalyzed || 0},
  "marketVelocity": "${ebayData?.marketVelocity || 'unknown'}",
  "demandLevel": "${ebayData?.demandLevel || 'unknown'}",
  "dataSource": "${ebayData ? 'eBay sold listings' : 'AI estimate'}"
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

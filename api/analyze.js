export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
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

  const { imageData, mediaType, hints } = body;
  if (!imageData) return res.status(400).json({ error: 'No image data provided' });

  const cleanImageData = imageData.replace(/ /g, '+');
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const safeMediaType = validTypes.includes(mediaType) ? mediaType : 'image/jpeg';

  const hintsSection = hints
    ? `\n\nIMPORTANT - The collector has provided this additional context which you MUST use and prioritize:\n${hints}\n`
    : '';

  try {
    // Step 1 — Identify the item with Claude vision
    const identifyRes = await fetch('https://api.anthropic.com/v1/messages', {
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
              text: `You are a sports memorabilia expert. Analyze this image carefully.${hintsSection}

Respond ONLY with a valid JSON object, no markdown, no preamble:
{
  "name": "descriptive item name including player and type",
  "year": "year as 4-digit string, or empty string if unknown",
  "category": "one of exactly: Baseball Card, Bobblehead, Print, Autograph Baseball, Jersey, Bat, Helmet, Photo, Poster, Figurine, Other",
  "player": "full player name or empty string — if the collector told you who signed it, use that name",
  "team": "full team name or empty string",
  "manufacturer": "brand or manufacturer name or empty string",
  "condition": "one of exactly: Mint, Near Mint, Excellent, Very Good, Good, Fair, Poor",
  "gradingService": "one of exactly: PSA, BGS, SGC, JSA, BAS, or empty string",
  "gradeScore": "numeric grade as string if visible on label, or empty string",
  "marketValue": 0,
  "serialNumber": "serial number or cert number if visible, or empty string",
  "notes": "relevant details including any context provided by the collector"
}`
            }
          ]
        }]
      })
    });

    if (!identifyRes.ok) {
      const err = await identifyRes.text();
      console.error('Anthropic error:', err);
      return res.status(identifyRes.status).json({ error: `Anthropic API error: ${identifyRes.status}` });
    }

    const identifyData = await identifyRes.json();
    const identifyText = identifyData.content?.map(b => b.text || '').join('') || '';
    const identifyClean = identifyText.replace(/```json|```/g, '').trim();
    const identified = JSON.parse(identifyClean);

    // Step 2 — Get real eBay pricing for the identified item
    let ebayData = null
    try {
      const queryParts = [identified.player, identified.year, identified.name?.split(' ').slice(0,4).join(' ')].filter(Boolean)
      const searchQuery = queryParts.join(' ')

      console.log(`Fetching eBay data for: ${searchQuery}`)

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
        const summary = items.find(i => i.summary)?.summary
        if (summary?.recommendedPrice?.raw) {
          ebayData = {
            recommendedPrice: summary.recommendedPrice.raw,
            priceLow:         summary.priceRange?.low?.raw,
            priceHigh:        summary.priceRange?.high?.raw,
            marketVelocity:   summary.marketVelocity,
            avgDaysToSell:    summary.averageDaysToSell,
            demandLevel:      summary.demandLevel,
            quickTake:        summary.quickTake,
            confidence:       summary.confidence,
            itemsAnalyzed:    items.find(i => i.meta)?.meta?.itemsAnalyzed,
          }
          console.log(`eBay price found: $${ebayData.recommendedPrice}`)
        }
      }
    } catch (err) {
      console.error('Apify error (non-fatal):', err.message)
    }

    // Step 3 — Return identified item with real pricing
    const result = {
      ...identified,
      marketValue: ebayData?.recommendedPrice || identified.marketValue || 0,
      dataSource: ebayData ? 'eBay sold listings' : 'AI estimate',
      salesCount: ebayData?.itemsAnalyzed || 0,
      priceRange: ebayData ? `$${ebayData.priceLow} - $${ebayData.priceHigh}` : null,
      marketVelocity: ebayData?.marketVelocity || null,
      demandLevel: ebayData?.demandLevel || null,
      quickTake: ebayData?.quickTake || null,
    }

    return res.status(200).json(result);

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: err.message });
  }
}

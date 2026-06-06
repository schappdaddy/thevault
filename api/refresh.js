export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id, name, player, team, year, category, manufacturer, condition, grading_service, grade_score } = req.body;

  if (!id) return res.status(400).json({ error: 'Item ID required' });

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY
    )

    // Mark item as refreshing
    await supabase.from('items').update({ price_refreshing: true }).eq('id', id)

    // Build search query
    const queryParts = [player, year, name?.split(' ').slice(0,4).join(' ')].filter(Boolean)
    const searchQuery = queryParts.join(' ')

    const callbackUrl = `https://thevault-iota.vercel.app/api/refresh-callback`

    // Fire Apify run — don't wait for it
    const apifyRes = await fetch(
      `https://api.apify.com/v2/acts/marielise.dev~ebay-sold-listings-intelligence/runs?token=${process.env.APIFY_API_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          ebaySite: 'ebay.com',
          soldWithinDays: 90,
          maxItems: 15,
          sortBy: 'date_desc',
          outputFormat: 'full',
          includeAnalytics: true,
          proxy: { useApifyProxy: true },
          webhooks: [{
            eventTypes: ['ACTOR.RUN.SUCCEEDED'],
            requestUrl: callbackUrl,
            payloadTemplate: JSON.stringify({
              itemId: id,
              itemName: name,
              player, year, category, manufacturer, condition,
              grading_service, grade_score,
              runId: '{{runId}}',
              datasetId: '{{defaultDatasetId}}'
            })
          }]
        })
      }
    )

    if (!apifyRes.ok) {
      const err = await apifyRes.text()
      console.error('Apify start error:', err)
      await supabase.from('items').update({ price_refreshing: false }).eq('id', id)
      return res.status(500).json({ error: 'Failed to start price refresh' })
    }

    const apifyRun = await apifyRes.json()
    console.log(`Apify run started: ${apifyRun.data?.id} for item: ${name}`)

    return res.status(200).json({
      success: true,
      message: 'Price refresh started — will update automatically when complete',
      runId: apifyRun.data?.id
    })

  } catch (err) {
    console.error('Refresh error:', err)
    return res.status(500).json({ error: err.message })
  }
}

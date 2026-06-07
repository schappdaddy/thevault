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

    // Build clean search query
    const gradeInfo = grading_service && grade_score ? `${grading_service} ${grade_score}` : null
    const queryParts = [player, year, gradeInfo].filter(Boolean)
    const searchQuery = queryParts.join(' ')
    console.log(`Search query: ${searchQuery}`)

    const callbackUrl = `https://thevault-iota.vercel.app/api/refresh-callback`

    // Start the Apify run
    const runRes = await fetch(
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
        })
      }
    )

    if (!runRes.ok) {
      const err = await runRes.text()
      console.error('Apify start error:', err)

      // Fall back to Claude-only estimate
      try {
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
              content: `You are a sports memorabilia expert. Estimate the market value for:
- Name: ${name}
- Player: ${player || 'Unknown'}
- Year: ${year || 'Unknown'}
- Category: ${category || 'Unknown'}
- Condition: ${condition || 'Unknown'}
- Grading Service: ${grading_service || 'Ungraded'}
- Grade Score: ${grade_score || 'N/A'}

Respond ONLY with valid JSON, no markdown, no preamble:
{
  "marketValue": number only,
  "reasoning": "2-3 sentence explanation",
  "confidence": "high, medium, or low"
}`
            }]
          })
        })

        if (claudeRes.ok) {
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
            price_data_source:     'AI estimate — eBay unavailable',
            price_range:           null,
            price_market_velocity: null,
            price_demand_level:    null,
            price_sales_count:     null,
            price_quick_take:      null,
          }).eq('id', id)

          console.log(`Fallback Claude estimate: $${valuation.marketValue}`)
          return res.status(200).json({ success: true, message: 'AI estimate used — Apify unavailable' })
        }
      } catch (fallbackErr) {
        console.error('Fallback error:', fallbackErr)
      }

      await supabase.from('items').update({ price_refreshing: false }).eq('id', id)
      return res.status(200).json({ success: true, message: 'Refresh failed — please try again' })
    }

    const runData = await runRes.json()
    const runId = runData.data?.id

    console.log(`Apify run started: ${runId} for item: ${name}`)

    // Register webhook for this specific run
    const safeName     = (name||'').replace(/"/g, '').replace(/&/g, 'and')
    const safePlayer   = (player||'').replace(/"/g, '')
    const safeYear     = (year||'').replace(/"/g, '')
    const safeCategory = (category||'').replace(/"/g, '')
    const safeCond     = (condition||'').replace(/"/g, '')
    const safeGrader   = (grading_service||'').replace(/"/g, '')
    const safeGrade    = (grade_score||'').replace(/"/g, '')

    const webhookRes = await fetch(
      `https://api.apify.com/v2/webhooks?token=${process.env.APIFY_API_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED'],
          condition: { actorRunId: runId },
          requestUrl: callbackUrl,
          headersTemplate: '{"Content-Type": "application/json"}',
          payloadTemplate: `{"itemId":"${id}","itemName":"${safeName}","player":"${safePlayer}","year":"${safeYear}","category":"${safeCategory}","condition":"${safeCond}","grading_service":"${safeGrader}","grade_score":"${safeGrade}","resource":{{resource}}}`
        })
      }
    )

    if (!webhookRes.ok) {
      const err = await webhookRes.text()
      console.error('Webhook registration error:', err)
    } else {
      const webhookData = await webhookRes.json()
      console.log(`Webhook registered: ${webhookData.data?.id}`)
    }

    return res.status(200).json({
      success: true,
      message: 'Price refresh started',
      runId
    })

  } catch (err) {
    console.error('Refresh error:', err)
    return res.status(500).json({ error: err.message })
  }
}

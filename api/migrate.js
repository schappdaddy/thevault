import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

export const config = {
  maxDuration: 300,
  api: { bodyParser: false }
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const results = { migrated:[], skipped:[], failed:[] }

  try {
    const { data: items, error } = await supabase
      .from('items')
      .select('id, name, image_url, image_path')
      .not('image_url', 'is', null)

    if (error) throw error

    console.log(`Found ${items.length} items with images`)

    for (const item of items) {
      try {
        // Skip if already migrated to R2
        if (item.image_url?.includes('r2.dev') || item.image_url?.includes('cloudflarestorage')) {
          results.skipped.push(item.name)
          continue
        }

        // Download image from Supabase
        const response = await fetch(item.image_url)
        if (!response.ok) {
          results.failed.push({ name: item.name, reason: `Download failed: ${response.status}` })
          continue
        }

        const buffer = Buffer.from(await response.arrayBuffer())
        const key = `migrated-${Date.now()}-${item.id}.jpg`

        // Upload to R2
        await r2.send(new PutObjectCommand({
          Bucket: 'vault-images',
          Key: key,
          Body: buffer,
          ContentType: 'image/jpeg',
        }))

        const newUrl = `${process.env.R2_PUBLIC_URL}/${key}`

        // Update database with new R2 URL
        await supabase
          .from('items')
          .update({ image_url: newUrl, image_path: key })
          .eq('id', item.id)

        results.migrated.push(item.name)
        console.log(`Migrated: ${item.name}`)

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200))

      } catch (err) {
        results.failed.push({ name: item.name, reason: err.message })
        console.error(`Failed: ${item.name}`, err)
      }
    }

    return res.status(200).json({
      summary: {
        total: items.length,
        migrated: results.migrated.length,
        skipped: results.skipped.length,
        failed: results.failed.length,
      },
      results
    })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

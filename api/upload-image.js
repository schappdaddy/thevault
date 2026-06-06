import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

export const config = {
  maxDuration: 30,
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

const BUCKET = 'vault-images'
const PUBLIC_URL = process.env.R2_PUBLIC_URL

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  // DELETE image
  if (req.method === 'DELETE') {
    const { key, url } = req.body

    // Derive key from URL if key not provided
    let imageKey = key
    if (!imageKey && url) {
      imageKey = url.split('/').pop()
    }

    console.log(`Deleting R2 key: ${imageKey}`)

    if (!imageKey) return res.status(400).json({ error: 'No key or url provided' })

    try {
      await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: imageKey }))
      console.log(`Successfully deleted: ${imageKey}`)
      return res.status(200).json({ success: true })
    } catch (err) {
      console.error(`Delete error for key ${imageKey}:`, err)
      return res.status(500).json({ error: err.message })
    }
  }

  // UPLOAD image
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imageData, filename, contentType } = req.body
  if (!imageData) return res.status(400).json({ error: 'No image data provided' })

  try {
    const buffer = Buffer.from(imageData.replace(/ /g, '+'), 'base64')
    const key = `${Date.now()}-${filename || 'image.jpg'}`

    await r2.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'image/jpeg',
    }))

    console.log(`Uploaded to R2: ${key}`)

    return res.status(200).json({
      key,
      url: `${PUBLIC_URL}/${key}`,
    })
  } catch (err) {
    console.error('R2 upload error:', err)
    return res.status(500).json({ error: err.message })
  }
}

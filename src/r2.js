import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const r2 = new S3Client({
  region: 'auto',
  endpoint: import.meta.env.VITE_R2_ENDPOINT,
  credentials: {
    accessKeyId: import.meta.env.VITE_R2_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_R2_SECRET_ACCESS_KEY,
  },
})

const BUCKET = 'vault-images'
const PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL

export async function uploadToR2(blob, filename, contentType = 'image/jpeg') {
  const key = `${Date.now()}-${filename}`
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: blob,
    ContentType: contentType,
  }))
  return {
    key,
    url: `${PUBLIC_URL}/${key}`,
  }
}

export async function deleteFromR2(key) {
  if (!key) return
  await r2.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }))
}

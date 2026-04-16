import { Buffer } from 'node:buffer'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { env } from './env'
import { badRequest } from './errors'

const normalizeUrl = (value: string) => value.replace(/\/$/, '')
const normalizeUrlLike = (value: string) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    return ''
  }

  return /^https?:\/\//i.test(trimmed)
    ? normalizeUrl(trimmed)
    : `https://${normalizeUrl(trimmed)}`
}

const getClient = () => {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_S3_BUCKET || !env.AWS_S3_REGION) {
    throw badRequest('S3 is not configured')
  }

  return new S3Client({
    region: env.AWS_S3_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      sessionToken: env.AWS_SESSION_TOKEN || undefined,
    },
    endpoint: env.AWS_S3_ENDPOINT ? normalizeUrlLike(env.AWS_S3_ENDPOINT) : undefined,
    forcePathStyle: !!env.AWS_S3_ENDPOINT,
  })
}

const resolvePublicUrl = (objectKey: string) => {
  if (env.AWS_S3_PUBLIC_BASE_URL) {
    return `${normalizeUrl(env.AWS_S3_PUBLIC_BASE_URL)}/${objectKey}`
  }

  if (env.AWS_S3_ENDPOINT) {
    return `${normalizeUrlLike(env.AWS_S3_ENDPOINT)}/${env.AWS_S3_BUCKET}/${objectKey}`
  }

  return `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_S3_REGION}.amazonaws.com/${objectKey}`
}

export const parseDataUrl = (value: string) => {
  const match = String(value || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) {
    throw badRequest('Invalid image data URL')
  }

  return {
    mimeType: match[1] || 'image/png',
    base64Data: match[2] || '',
  }
}

export const resolveExtension = (mimeType: string) => {
  return mimeType === 'image/jpeg'
    ? '.jpg'
    : mimeType === 'image/webp'
      ? '.webp'
      : '.png'
}

export const resolveFilename = (fileName: string, mimeType: string) => {
  const extension = resolveExtension(mimeType)
  const safeName = String(fileName || 'asset')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset'

  return `${safeName}${extension}`
}

export const uploadBufferAsset = async (options: {
  objectKey: string
  mimeType: string
  body: Buffer
}) => {
  const client = getClient()

  await client.send(new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: options.objectKey,
    Body: options.body,
    ContentType: options.mimeType,
  }))

  return {
    objectKey: options.objectKey,
    url: resolvePublicUrl(options.objectKey),
    size: options.body.byteLength,
  }
}

export const uploadBase64Asset = async (options: {
  objectKey: string
  mimeType: string
  base64Data: string
}) => {
  return await uploadBufferAsset({
    objectKey: options.objectKey,
    mimeType: options.mimeType,
    body: Buffer.from(options.base64Data, 'base64'),
  })
}

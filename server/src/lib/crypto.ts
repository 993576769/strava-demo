import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from './env'

const normalizeKey = (value: string) => createHash('sha256').update(value).digest()

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export const signState = (payload: string) => {
  const signature = createHmac('sha256', env.STRAVA_STATE_SECRET).update(payload).digest('hex')
  return `${payload}.${signature}`
}

export const verifyState = (value: string) => {
  const [payload, signature] = value.split('.')
  if (!payload || !signature) {
    return null
  }

  const expected = createHmac('sha256', env.STRAVA_STATE_SECRET).update(payload).digest('hex')
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null
  }

  return payload
}

export const encryptSecret = (value: string) => {
  if (!value) {
    return ''
  }

  const key = normalizeKey(env.STRAVA_TOKEN_ENCRYPTION_KEY || env.STRAVA_STATE_SECRET)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export const decryptSecret = (value: string) => {
  if (!value) {
    return ''
  }

  const key = normalizeKey(env.STRAVA_TOKEN_ENCRYPTION_KEY || env.STRAVA_STATE_SECRET)
  const input = Buffer.from(value, 'base64url')
  const iv = input.subarray(0, 12)
  const tag = input.subarray(12, 28)
  const encrypted = input.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

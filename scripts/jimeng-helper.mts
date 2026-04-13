import { createHash, createHmac } from 'node:crypto'
import http from 'node:http'
import process from 'node:process'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import qs from 'qs'
import { loadEnv } from './load-env.mts'

dayjs.extend(utc)

type JimengConfig = {
  accessKey: string
  secretKey: string
  host: string
  region: string
  service: string
  version: string
}

type S3Config = {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  bucket: string
  region: string
  endpoint: string
  publicBaseUrl: string
}

type UtcDateParts = {
  shortDate: string
  amzDate: string
}

type SignedRequest = {
  url: string
  bodyString: string
  headers: Record<string, string>
}

type S3UploadPayload = {
  objectKey: string
  mimeType?: string
  base64Data: string
}

type S3UploadResponse = {
  url: string
  objectKey: string
}

type OpenApiPayload = {
  action?: string
  body?: unknown
}

type OpenApiSuccessPayload = {
  status: number
  payload: Record<string, unknown>
  requestId: string
}

type ErrorPayload = {
  error: string
}

const repoRoot = process.cwd()

loadEnv(repoRoot)

const helperHost = process.env.JIMENG_HELPER_HOST || '127.0.0.1'
const helperPort = Number.parseInt(process.env.JIMENG_HELPER_PORT || '3210', 10)
const requestTimeoutMs = Number.parseInt(process.env.JIMENG_HELPER_TIMEOUT_MS || '120000', 10)

const getRequiredEnv = (key: string) => {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required env: ${key}`)
  }
  return value
}

const getJimengConfig = (): JimengConfig => ({
  accessKey: getRequiredEnv('VOLCENGINE_ACCESS_KEY'),
  secretKey: getRequiredEnv('VOLCENGINE_SECRET_KEY'),
  host: process.env.JIMENG_API_HOST || 'visual.volcengineapi.com',
  region: process.env.JIMENG_API_REGION || 'cn-north-1',
  service: process.env.JIMENG_API_SERVICE || 'cv',
  version: process.env.JIMENG_API_VERSION || '2022-08-31',
})

const getS3Config = (): S3Config => ({
  accessKeyId: getRequiredEnv('AWS_ACCESS_KEY_ID'),
  secretAccessKey: getRequiredEnv('AWS_SECRET_ACCESS_KEY'),
  sessionToken: process.env.AWS_SESSION_TOKEN || '',
  bucket: getRequiredEnv('AWS_S3_BUCKET'),
  region: getRequiredEnv('AWS_S3_REGION'),
  endpoint: process.env.AWS_S3_ENDPOINT || '',
  publicBaseUrl: process.env.AWS_S3_PUBLIC_BASE_URL || '',
})

const normalizeUrlLike = (value: string, defaultProtocol = 'https://') => {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return ''
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized
  }

  return `${defaultProtocol}${normalized}`
}

const toUtcDateParts = (value = dayjs.utc()): UtcDateParts => {
  return {
    shortDate: value.utc().format('YYYYMMDD'),
    amzDate: value.utc().format('YYYYMMDDTHHmmss[Z]'),
  }
}

const encodeRFC3986 = (value: string) => {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (match) => `%${match.charCodeAt(0).toString(16).toUpperCase()}`)
}

const buildCanonicalQuery = (query: Record<string, string>) => {
  const sortedQuery = Object.keys(query)
    .sort()
    .reduce<Record<string, string>>((accumulator, key) => {
      accumulator[key] = query[key]
      return accumulator
    }, {})

  return qs.stringify(sortedQuery, {
    encode: true,
    encoder(value: unknown) {
      return encodeRFC3986(String(value))
    },
    format: 'RFC3986',
    sort: (left: string, right: string) => left.localeCompare(right),
  })
}

const buildCanonicalHeaders = (headers: Record<string, string>) => {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    normalized[String(key).toLowerCase()] = String(value).trim().replace(/\s+/g, ' ')
  }

  const keys = Object.keys(normalized).sort()
  return {
    canonicalHeaders: `${keys.map((key) => `${key}:${normalized[key]}`).join('\n')}\n`,
    signedHeaders: keys.join(';'),
  }
}

const sha256Hex = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

const hmacSha256 = (key: string | Buffer, value: string, encoding?: 'hex') => {
  const hmac = createHmac('sha256', key)
  hmac.update(value)
  return encoding ? hmac.digest(encoding) : hmac.digest()
}

const buildSignedRequest = ({ action, body }: { action: string, body: unknown }): SignedRequest => {
  const config = getJimengConfig()
  const requestTime = toUtcDateParts()
  const bodyString = JSON.stringify(body || {})
  const payloadHash = sha256Hex(bodyString)
  const query = {
    Action: action,
    Version: config.version,
  }
  const canonicalQuery = buildCanonicalQuery(query)
  const signed = buildCanonicalHeaders({
    'content-type': 'application/json',
    host: config.host,
    'x-content-sha256': payloadHash,
    'x-date': requestTime.amzDate,
  })
  const canonicalRequest = [
    'POST',
    '/',
    canonicalQuery,
    signed.canonicalHeaders,
    signed.signedHeaders,
    payloadHash,
  ].join('\n')
  const credentialScope = [
    requestTime.shortDate,
    config.region,
    config.service,
    'request',
  ].join('/')
  const stringToSign = [
    'HMAC-SHA256',
    requestTime.amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const dateKey = hmacSha256(config.secretKey, requestTime.shortDate)
  const regionKey = hmacSha256(dateKey, config.region)
  const serviceKey = hmacSha256(regionKey, config.service)
  const signingKey = hmacSha256(serviceKey, 'request')
  const signature = hmacSha256(signingKey, stringToSign, 'hex')

  return {
    url: `https://${config.host}/?${canonicalQuery}`,
    bodyString,
    headers: {
      'Content-Type': 'application/json',
      Host: config.host,
      'X-Content-Sha256': payloadHash,
      'X-Date': requestTime.amzDate,
      Authorization: `HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signed.signedHeaders}, Signature=${signature}`,
    },
  }
}

const resolveS3ObjectKey = (objectKey: string) => {
  const normalizedKey = String(objectKey).replace(/^\/+/, '')
  if (!normalizedKey) {
    throw new Error('Missing S3 object key.')
  }

  return normalizedKey
}

const createS3Client = (config: S3Config) => {
  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken || undefined,
    },
    endpoint: config.endpoint ? normalizeUrlLike(config.endpoint) : undefined,
    forcePathStyle: !!config.endpoint,
  })
}

const buildS3PublicUrl = (config: S3Config, objectKey: string) => {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/$/, '')}/${objectKey}`
  }

  if (config.endpoint) {
    const endpoint = new URL(normalizeUrlLike(config.endpoint))
    endpoint.pathname = `/${config.bucket}/${objectKey}`
    return endpoint.toString()
  }

  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${objectKey}`
}

const uploadToS3 = async ({ objectKey, mimeType, base64Data }: S3UploadPayload): Promise<S3UploadResponse> => {
  const config = getS3Config()
  const resolvedObjectKey = resolveS3ObjectKey(objectKey)
  const bodyBuffer = Buffer.from(String(base64Data || ''), 'base64')
  const client = createS3Client(config)

  try {
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: resolvedObjectKey,
      Body: bodyBuffer,
      ContentType: mimeType || 'application/octet-stream',
    }), {
      abortSignal: AbortSignal.timeout(requestTimeoutMs),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`S3 upload failed: ${message}`)
  }

  return {
    url: buildS3PublicUrl(config, resolvedObjectKey),
    objectKey: resolvedObjectKey,
  }
}

const json = (res: http.ServerResponse, status: number, payload: Record<string, unknown>) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

const readJsonBody = async <T,>(req: http.IncomingMessage): Promise<T> => {
  let raw = ''
  for await (const chunk of req) {
    raw += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
  }

  if (!raw) {
    return {} as T
  }

  return JSON.parse(raw) as T
}

const readUpstreamPayload = async (response: Response) => {
  const text = await response.text()
  if (!text) {
    return {}
  }

  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { message: text }
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    json(res, 400, { error: 'Missing request url.' } satisfies ErrorPayload)
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && req.url === '/s3-upload') {
    let payload: S3UploadPayload
    try {
      payload = await readJsonBody<S3UploadPayload>(req)
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : 'Invalid JSON body.' } satisfies ErrorPayload)
      return
    }

    try {
      const uploaded = await uploadToS3(payload)
      json(res, 200, uploaded)
    } catch (error) {
      json(res, 502, {
        error: error instanceof Error ? error.message : 'Failed to upload to S3.',
      } satisfies ErrorPayload)
    }
    return
  }

  if (req.method !== 'POST' || req.url !== '/openapi') {
    json(res, 404, { error: 'Not found.' } satisfies ErrorPayload)
    return
  }

  let payload: OpenApiPayload
  try {
    payload = await readJsonBody<OpenApiPayload>(req)
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : 'Invalid JSON body.' } satisfies ErrorPayload)
    return
  }

  const action = typeof payload.action === 'string' ? payload.action.trim() : ''
  if (!action) {
    json(res, 400, { error: 'Missing action.' } satisfies ErrorPayload)
    return
  }

  let signedRequest: SignedRequest
  try {
    signedRequest = buildSignedRequest({
      action,
      body: payload.body || {},
    })
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : 'Invalid Jimeng configuration.' } satisfies ErrorPayload)
    return
  }

  try {
    const response = await fetch(signedRequest.url, {
      method: 'POST',
      headers: signedRequest.headers,
      body: signedRequest.bodyString,
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
    const upstreamPayload = await readUpstreamPayload(response)

    json(res, response.status, {
      status: response.status,
      payload: upstreamPayload,
      requestId: typeof upstreamPayload.ResponseMetadata === 'object'
        && upstreamPayload.ResponseMetadata
        && 'RequestId' in upstreamPayload.ResponseMetadata
        && typeof upstreamPayload.ResponseMetadata.RequestId === 'string'
        ? upstreamPayload.ResponseMetadata.RequestId
        : '',
    } satisfies OpenApiSuccessPayload)
  } catch (error) {
    json(res, 502, {
      error: error instanceof Error ? error.message : 'Failed to reach Jimeng upstream.',
    } satisfies ErrorPayload)
  }
})

server.listen(helperPort, helperHost, () => {
  process.stdout.write(`Jimeng helper listening at http://${helperHost}:${helperPort}\n`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}

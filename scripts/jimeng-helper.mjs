import { createHash, createHmac } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()

const loadEnvFile = (filename) => {
  const filepath = path.join(repoRoot, filename)
  if (!fs.existsSync(filepath)) {
    return
  }

  const content = fs.readFileSync(filepath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separator = line.indexOf('=')
    if (separator === -1) {
      continue
    }

    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

loadEnvFile('.env')
loadEnvFile('.env.local')

const helperHost = process.env.JIMENG_HELPER_HOST || '127.0.0.1'
const helperPort = Number.parseInt(process.env.JIMENG_HELPER_PORT || '3210', 10)
const requestTimeoutMs = Number.parseInt(process.env.JIMENG_HELPER_TIMEOUT_MS || '120000', 10)

const getRequiredEnv = (key) => {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required env: ${key}`)
  }
  return value
}

const getJimengConfig = () => ({
  accessKey: getRequiredEnv('VOLCENGINE_ACCESS_KEY'),
  secretKey: getRequiredEnv('VOLCENGINE_SECRET_KEY'),
  host: process.env.JIMENG_API_HOST || 'visual.volcengineapi.com',
  region: process.env.JIMENG_API_REGION || 'cn-north-1',
  service: process.env.JIMENG_API_SERVICE || 'cv',
  version: process.env.JIMENG_API_VERSION || '2022-08-31',
})

const getS3Config = () => ({
  accessKeyId: getRequiredEnv('AWS_ACCESS_KEY_ID'),
  secretAccessKey: getRequiredEnv('AWS_SECRET_ACCESS_KEY'),
  sessionToken: process.env.AWS_SESSION_TOKEN || '',
  bucket: getRequiredEnv('AWS_S3_BUCKET'),
  region: getRequiredEnv('AWS_S3_REGION'),
  endpoint: process.env.AWS_S3_ENDPOINT || '',
  publicBaseUrl: process.env.AWS_S3_PUBLIC_BASE_URL || '',
})

const normalizeUrlLike = (value, defaultProtocol = 'https://') => {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return ''
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized
  }

  return `${defaultProtocol}${normalized}`
}

const toUtcDateParts = (date) => {
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hour = String(date.getUTCHours()).padStart(2, '0')
  const minute = String(date.getUTCMinutes()).padStart(2, '0')
  const second = String(date.getUTCSeconds()).padStart(2, '0')

  return {
    shortDate: `${year}${month}${day}`,
    amzDate: `${year}${month}${day}T${hour}${minute}${second}Z`,
  }
}

const encodeRFC3986 = (value) => {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (match) => `%${match.charCodeAt(0).toString(16).toUpperCase()}`)
}

const buildCanonicalQuery = (query) => {
  return Object.keys(query)
    .sort()
    .map((key) => `${encodeRFC3986(key)}=${encodeRFC3986(query[key])}`)
    .join('&')
}

const buildCanonicalHeaders = (headers) => {
  const normalized = {}
  for (const [key, value] of Object.entries(headers)) {
    normalized[String(key).toLowerCase()] = String(value).trim().replace(/\s+/g, ' ')
  }

  const keys = Object.keys(normalized).sort()
  return {
    canonicalHeaders: `${keys.map((key) => `${key}:${normalized[key]}`).join('\n')}\n`,
    signedHeaders: keys.join(';'),
  }
}

const sha256Hex = (value) => createHash('sha256').update(value).digest('hex')

const hmacSha256 = (key, value, encoding) => {
  const hmac = createHmac('sha256', key)
  hmac.update(value)
  return encoding ? hmac.digest(encoding) : hmac.digest()
}

const encodeS3Path = (value) => {
  return String(value)
    .split('/')
    .map((segment) => encodeRFC3986(segment))
    .join('/')
}

const buildSignedRequest = ({ action, body }) => {
  const config = getJimengConfig()
  const requestTime = toUtcDateParts(new Date())
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

const buildS3Target = (config, objectKey) => {
  const normalizedKey = String(objectKey).replace(/^\/+/, '')
  if (!normalizedKey) {
    throw new Error('Missing S3 object key.')
  }

  if (config.endpoint) {
    const endpoint = new URL(normalizeUrlLike(config.endpoint))
    endpoint.pathname = `/${config.bucket}/${normalizedKey}`
    return {
      uploadUrl: endpoint.toString(),
      host: endpoint.host,
      canonicalUri: `/${config.bucket}/${normalizedKey}`,
      objectKey: normalizedKey,
    }
  }

  const host = `${config.bucket}.s3.${config.region}.amazonaws.com`
  return {
    uploadUrl: `https://${host}/${normalizedKey}`,
    host,
    canonicalUri: `/${normalizedKey}`,
    objectKey: normalizedKey,
  }
}

const buildS3PublicUrl = (config, target) => {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/$/, '')}/${target.objectKey}`
  }

  return target.uploadUrl
}

const uploadToS3 = async ({ objectKey, mimeType, base64Data }) => {
  const config = getS3Config()
  const bodyBuffer = Buffer.from(String(base64Data || ''), 'base64')
  const target = buildS3Target(config, objectKey)
  const requestTime = toUtcDateParts(new Date())
  const payloadHash = sha256Hex(bodyBuffer)
  const headers = {
    'content-type': mimeType || 'application/octet-stream',
    host: target.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': requestTime.amzDate,
  }

  if (config.sessionToken) {
    headers['x-amz-security-token'] = config.sessionToken
  }

  const signed = buildCanonicalHeaders(headers)
  const canonicalRequest = [
    'PUT',
    encodeS3Path(target.canonicalUri),
    '',
    signed.canonicalHeaders,
    signed.signedHeaders,
    payloadHash,
  ].join('\n')
  const credentialScope = [
    requestTime.shortDate,
    config.region,
    's3',
    'aws4_request',
  ].join('/')
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    requestTime.amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const dateKey = hmacSha256(`AWS4${config.secretAccessKey}`, requestTime.shortDate)
  const regionKey = hmacSha256(dateKey, config.region)
  const serviceKey = hmacSha256(regionKey, 's3')
  const signingKey = hmacSha256(serviceKey, 'aws4_request')
  const signature = hmacSha256(signingKey, stringToSign, 'hex')
  const requestHeaders = {
    'Content-Type': headers['content-type'],
    Host: headers.host,
    'X-Amz-Content-Sha256': headers['x-amz-content-sha256'],
    'X-Amz-Date': headers['x-amz-date'],
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signed.signedHeaders}, Signature=${signature}`,
  }

  if (config.sessionToken) {
    requestHeaders['X-Amz-Security-Token'] = config.sessionToken
  }

  const response = await fetch(target.uploadUrl, {
    method: 'PUT',
    headers: requestHeaders,
    body: bodyBuffer,
    signal: AbortSignal.timeout(requestTimeoutMs),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`S3 upload failed: HTTP ${response.status}${text ? ` - ${text.slice(0, 400)}` : ''}`)
  }

  return {
    url: buildS3PublicUrl(config, target),
    objectKey: target.objectKey,
  }
}

const json = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

const readJsonBody = async (req) => {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
  }

  if (!raw) {
    return {}
  }

  return JSON.parse(raw)
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    json(res, 400, { error: 'Missing request url.' })
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { ok: true })
    return
  }

  if (req.method !== 'POST' || req.url !== '/openapi') {
    if (req.method === 'POST' && req.url === '/s3-upload') {
      let payload
      try {
        payload = await readJsonBody(req)
      } catch (error) {
        json(res, 400, { error: error instanceof Error ? error.message : 'Invalid JSON body.' })
        return
      }

      try {
        const uploaded = await uploadToS3({
          objectKey: payload.objectKey,
          mimeType: payload.mimeType,
          base64Data: payload.base64Data,
        })
        json(res, 200, uploaded)
      } catch (error) {
        json(res, 502, {
          error: error instanceof Error ? error.message : 'Failed to upload to S3.',
        })
      }
      return
    }

    json(res, 404, { error: 'Not found.' })
    return
  }

  let payload
  try {
    payload = await readJsonBody(req)
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : 'Invalid JSON body.' })
    return
  }

  const action = typeof payload.action === 'string' ? payload.action.trim() : ''
  if (!action) {
    json(res, 400, { error: 'Missing action.' })
    return
  }

  let signedRequest
  try {
    signedRequest = buildSignedRequest({
      action,
      body: payload.body || {},
    })
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : 'Invalid Jimeng configuration.' })
    return
  }

  try {
    const response = await fetch(signedRequest.url, {
      method: 'POST',
      headers: signedRequest.headers,
      body: signedRequest.bodyString,
      signal: AbortSignal.timeout(requestTimeoutMs),
    })

    const text = await response.text()
    let upstreamPayload = {}
    if (text) {
      try {
        upstreamPayload = JSON.parse(text)
      } catch {
        upstreamPayload = { message: text }
      }
    }

    json(res, response.status, {
      status: response.status,
      payload: upstreamPayload,
      requestId: upstreamPayload?.ResponseMetadata?.RequestId || '',
    })
  } catch (error) {
    json(res, 502, {
      error: error instanceof Error ? error.message : 'Failed to reach Jimeng upstream.',
    })
  }
})

server.listen(helperPort, helperHost, () => {
  process.stdout.write(`Jimeng helper listening at http://${helperHost}:${helperPort}\n`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}

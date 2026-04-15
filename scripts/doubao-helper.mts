import process from 'node:process'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { loadEnv } from './load-env.mts'

type GenerateImagePayload = {
  model?: string
  prompt?: string
  size?: string
  outputFormat?: 'png' | 'jpeg' | 'webp'
  responseFormat?: 'url' | 'b64_json'
  image?: string | string[]
  watermark?: boolean
  sequentialImageGeneration?: 'disabled' | 'auto'
  sequentialImageGenerationOptions?: {
    maxImages?: number
  }
}

type ErrorPayload = {
  error: string
  code?: string
  status?: number
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

type S3UploadPayload = {
  objectKey: string
  mimeType?: string
  base64Data: string
}

type S3UploadResponse = {
  url: string
  objectKey: string
}

const repoRoot = process.cwd()

loadEnv(repoRoot)

const helperHost = process.env.DOUBAO_HELPER_HOST || '127.0.0.1'
const helperPort = Number.parseInt(process.env.DOUBAO_HELPER_PORT || '3211', 10)
const requestTimeoutMs = Number.parseInt(process.env.DOUBAO_HELPER_TIMEOUT_MS || '120000', 10)
const defaultBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3'
const defaultModel = process.env.DOUBAO_SEEDREAM_MODEL || 'doubao-seedream-5-0-260128'
const defaultSize = process.env.DOUBAO_IMAGE_SIZE || '2K'
const defaultOutputFormat = process.env.DOUBAO_OUTPUT_FORMAT || 'png'
const defaultResponseFormat = (process.env.DOUBAO_RESPONSE_FORMAT || 'url') === 'b64_json' ? 'b64_json' : 'url'

const getApiKey = () => {
  const apiKey = process.env.ARK_API_KEY
  if (!apiKey) {
    throw new Error('Missing required env: ARK_API_KEY')
  }

  return apiKey
}

const getRequiredEnv = (key: string) => {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required env: ${key}`)
  }

  return value
}

const getS3Config = (): S3Config => ({
  accessKeyId: getRequiredEnv('AWS_ACCESS_KEY_ID'),
  secretAccessKey: getRequiredEnv('AWS_SECRET_ACCESS_KEY'),
  sessionToken: process.env.AWS_SESSION_TOKEN || '',
  bucket: getRequiredEnv('AWS_S3_BUCKET'),
  region: getRequiredEnv('AWS_S3_REGION'),
  endpoint: process.env.AWS_S3_ENDPOINT || '',
  publicBaseUrl: process.env.AWS_S3_PUBLIC_BASE_URL || '',
})

const extractError = (error: unknown) => {
  if (typeof error !== 'object' || error === null) {
    return {
      message: String(error),
      code: '',
      status: 500,
    }
  }

  const status = 'status' in error && typeof error.status === 'number' ? error.status : 500
  const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
  const message = 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Doubao helper request failed.'

  return {
    message,
    code,
    status,
  }
}

const normalizeImageList = (payload: GenerateImagePayload) => {
  const imageList = Array.isArray(payload.image)
    ? payload.image
        .map(value => typeof value === 'string' ? value.trim() : '')
        .filter(Boolean)
    : typeof payload.image === 'string' && payload.image.trim()
      ? [payload.image.trim()]
      : []

  return {
    sourceImage: imageList[imageList.length - 1] || '',
    imageList,
  }
}

const buildRequestBody = (payload: GenerateImagePayload, prompt: string) => {
  const { imageList } = normalizeImageList(payload)
  const sequentialImageGeneration = payload.sequentialImageGeneration || 'disabled'
  const body: Record<string, unknown> = {
    model: payload.model || defaultModel,
    prompt,
    size: payload.size || defaultSize,
    output_format: payload.outputFormat || defaultOutputFormat,
    watermark: false,
    sequential_image_generation: sequentialImageGeneration,
  }

  if (imageList.length > 0) {
    body.image = imageList
  }

  if ((payload.responseFormat === 'b64_json' ? 'b64_json' : defaultResponseFormat) === 'b64_json') {
    body.response_format = 'b64_json'
  }

  if (payload.sequentialImageGenerationOptions?.maxImages) {
    body.sequential_image_generation_options = {
      max_images: payload.sequentialImageGenerationOptions.maxImages,
    }
  }

  return {
    body,
    imageList,
    responseFormat: payload.responseFormat === 'b64_json' ? 'b64_json' : defaultResponseFormat,
    outputFormat: payload.outputFormat || defaultOutputFormat,
    sequentialImageGeneration,
  }
}

const shouldRetryWithoutReferenceImage = (error: unknown, imageList: string[]) => {
  if (imageList.length <= 1) {
    return false
  }

  if (typeof error !== 'object' || error === null) {
    return false
  }

  const message = 'message' in error && typeof error.message === 'string'
    ? error.message
    : ''
  const code = 'code' in error && typeof error.code === 'string'
    ? error.code
    : ''
  const status = 'status' in error && typeof error.status === 'number'
    ? error.status
    : 0

  return (
    status === 400
    && code === 'InvalidParameter'
    && /timeout while downloading url/i.test(message)
  )
}

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

const postImagesGeneration = async (body: Record<string, unknown>) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)

  try {
    const response = await fetch(`${defaultBaseUrl.replace(/\/$/, '')}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    let payload: any = {}
    try {
      payload = await response.json()
    } catch {
      payload = {}
    }

    if (!response.ok) {
      const error = new Error(
        typeof payload?.error?.message === 'string'
          ? payload.error.message
          : typeof payload?.message === 'string'
            ? payload.message
            : 'Doubao helper request failed.',
      ) as Error & { status?: number, code?: string }
      error.status = response.status
      error.code = typeof payload?.error?.code === 'string'
        ? payload.error.code
        : typeof payload?.code === 'string'
          ? payload.code
          : ''
      throw error
    }

    return payload
  } finally {
    clearTimeout(timeout)
  }
}

const app = new Hono()

app.notFound(c => {
  return c.json({ error: 'Not found.' } satisfies ErrorPayload, 404)
})

app.get('/health', c => {
  return c.json({ ok: true })
})

app.post('/s3-upload', async (c) => {
  let payload: S3UploadPayload
  try {
    payload = await c.req.json<S3UploadPayload>()
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Invalid JSON body.' } satisfies ErrorPayload,
      400,
    )
  }

  try {
    const uploaded = await uploadToS3(payload)
    return c.json(uploaded)
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to upload to S3.' } satisfies ErrorPayload,
      502,
    )
  }
})

app.post('/images/generate', async (c) => {
  let payload: GenerateImagePayload
  try {
    payload = await c.req.json<GenerateImagePayload>()
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Invalid JSON body.' } satisfies ErrorPayload,
      400,
    )
  }

  const prompt = String(payload.prompt || '').trim()
  if (!prompt) {
    return c.json({ error: 'Missing prompt.' } satisfies ErrorPayload, 400)
  }

  try {
    const { body, imageList, outputFormat, responseFormat, sequentialImageGeneration } = buildRequestBody(payload, prompt)
    let imageResponse
    let fallbackUsed = false

    try {
      imageResponse = await postImagesGeneration(body)
    } catch (error) {
      if (!shouldRetryWithoutReferenceImage(error, imageList)) {
        throw error
      }

      fallbackUsed = true
      imageResponse = await postImagesGeneration({
        ...body,
        image: [imageList[0]],
      })
    }

    const data = Array.isArray(imageResponse.data)
      ? imageResponse.data.map((item: any) => ({
          url: typeof item.url === 'string' ? item.url : '',
          b64Json: typeof item.b64_json === 'string' ? item.b64_json : '',
          revisedPrompt: typeof item.revised_prompt === 'string' ? item.revised_prompt : '',
        }))
      : []

    return c.json({
      created: typeof imageResponse.created === 'number' ? imageResponse.created : 0,
      data,
      model: payload.model || defaultModel,
      size: payload.size || defaultSize,
      outputFormat,
      responseFormat,
      image: fallbackUsed ? [imageList[0]] : imageList,
      fallbackUsed,
      requestBody: body,
      watermark: false,
      sequentialImageGeneration,
    })
  } catch (error) {
    const details = extractError(error)
    const status = details.status >= 400 ? details.status : 502
    return new Response(JSON.stringify({
      error: details.message,
      code: details.code,
      status: details.status,
    } satisfies ErrorPayload), {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
})

const server = serve({
  fetch: app.fetch,
  hostname: helperHost,
  port: helperPort,
}, () => {
  process.stdout.write(`Doubao helper listening at http://${helperHost}:${helperPort}\n`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}

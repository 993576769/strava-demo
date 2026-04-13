import http from 'node:http'
import process from 'node:process'
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
const defaultWatermark = process.env.DOUBAO_WATERMARK !== 'false'

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

const getApiKey = () => {
  const apiKey = process.env.ARK_API_KEY
  if (!apiKey) {
    throw new Error('Missing required env: ARK_API_KEY')
  }

  return apiKey
}

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
    watermark: payload.watermark ?? defaultWatermark,
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

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    json(res, 400, { error: 'Missing request url.' } satisfies ErrorPayload)
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { ok: true })
    return
  }

  if (req.method !== 'POST' || req.url !== '/images/generate') {
    json(res, 404, { error: 'Not found.' } satisfies ErrorPayload)
    return
  }

  let payload: GenerateImagePayload
  try {
    payload = await readJsonBody<GenerateImagePayload>(req)
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : 'Invalid JSON body.' } satisfies ErrorPayload)
    return
  }

  const prompt = String(payload.prompt || '').trim()
  if (!prompt) {
    json(res, 400, { error: 'Missing prompt.' } satisfies ErrorPayload)
    return
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

    json(res, 200, {
      created: typeof imageResponse.created === 'number' ? imageResponse.created : 0,
      data,
      model: payload.model || defaultModel,
      size: payload.size || defaultSize,
      outputFormat,
      responseFormat,
      image: fallbackUsed ? [imageList[0]] : imageList,
      fallbackUsed,
      requestBody: body,
      watermark: payload.watermark ?? defaultWatermark,
      sequentialImageGeneration,
    })
  } catch (error) {
    const details = extractError(error)
    json(res, details.status >= 400 ? details.status : 502, {
      error: details.message,
      code: details.code,
      status: details.status,
    } satisfies ErrorPayload)
  }
})

server.listen(helperPort, helperHost, () => {
  process.stdout.write(`Doubao helper listening at http://${helperHost}:${helperPort}\n`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}

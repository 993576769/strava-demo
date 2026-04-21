import { env } from '../../../lib/env'
import { badRequest } from '../../../lib/errors'
import { createId } from '../../../lib/ids'
import { resolveExtension, uploadBase64Asset } from '../../../lib/storage'

interface DoubaoAsset {
  url?: string
  b64_json?: string
  revised_prompt?: string
}

interface DoubaoResponse {
  created?: number
  data?: DoubaoAsset[]
}

type DoubaoError = Error & {
  status?: number
  code?: string
}

const shouldRetryWithoutReferenceImage = (error: unknown, imageList: string[]) => {
  if (imageList.length <= 1 || typeof error !== 'object' || error === null) {
    return false
  }

  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
  const status = 'status' in error && typeof error.status === 'number' ? error.status : 0

  return (
    status === 400
    && code === 'InvalidParameter'
    && /timeout while downloading url/i.test(message)
  )
}

const postImagesGeneration = async (body: Record<string, unknown>) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), env.DOUBAO_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${env.ARK_BASE_URL.replace(/\/$/, '')}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.ARK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    let payload: DoubaoResponse & {
      error?: { message?: string, code?: string }
      message?: string
      code?: string
    } = {}

    try {
      payload = await response.json()
    }
    catch {
      payload = {}
    }

    if (!response.ok) {
      const error = new Error(
        payload.error?.message
        || payload.message
        || `Doubao request failed (${response.status})`,
      ) as DoubaoError
      error.status = response.status
      error.code = payload.error?.code || payload.code || ''
      throw error
    }

    return payload
  }
  finally {
    clearTimeout(timeout)
  }
}

const normalizeImageList = (routeBaseImageUrl: string, referenceImageUrl: string) => {
  return [routeBaseImageUrl, referenceImageUrl]
    .map(value => String(value || '').trim())
    .filter(Boolean)
}

const resolveMimeType = () => {
  return env.DOUBAO_OUTPUT_FORMAT === 'jpeg'
    ? 'image/jpeg'
    : env.DOUBAO_OUTPUT_FORMAT === 'webp'
      ? 'image/webp'
      : 'image/png'
}

const uploadGeneratedAsset = async (jobId: string, asset: DoubaoAsset) => {
  if (asset.url) {
    return {
      imageUrl: asset.url,
      mimeType: resolveMimeType(),
      fileSize: 0,
      width: 1400,
      height: 1400,
      metadata: {
        response_format: 'url',
      },
    }
  }

  if (!asset.b64_json) {
    throw badRequest('Doubao returned no image asset')
  }

  const mimeType = resolveMimeType()
  const uploaded = await uploadBase64Asset({
    objectKey: `art-results/${encodeURIComponent(jobId)}/${createId()}${resolveExtension(mimeType)}`,
    mimeType,
    base64Data: asset.b64_json,
  })

  return {
    imageUrl: uploaded.url,
    mimeType,
    fileSize: uploaded.size,
    width: 1400,
    height: 1400,
    metadata: {
      response_format: 'b64_json',
      object_key: uploaded.objectKey,
    },
  }
}

export const renderWithDoubao = async (params: {
  jobId: string
  prompt: string
  routeBaseImageUrl: string
  referenceImageUrl?: string
}) => {
  const imageList = normalizeImageList(params.routeBaseImageUrl, params.referenceImageUrl || '')
  const body: Record<string, unknown> = {
    model: env.DOUBAO_SEEDREAM_MODEL,
    prompt: params.prompt,
    size: env.DOUBAO_IMAGE_SIZE,
    output_format: env.DOUBAO_OUTPUT_FORMAT,
    response_format: env.DOUBAO_RESPONSE_FORMAT,
    watermark: false,
  }

  if (imageList.length > 0) {
    body.image = imageList
  }

  let fallbackUsed = false
  let payload: DoubaoResponse

  try {
    payload = await postImagesGeneration(body)
  }
  catch (error) {
    if (!shouldRetryWithoutReferenceImage(error, imageList)) {
      throw error
    }

    fallbackUsed = true
    payload = await postImagesGeneration({
      ...body,
      image: [imageList[0]],
    })
  }

  const asset = payload.data?.[0]
  if (!asset) {
    throw badRequest('Doubao returned no image asset')
  }

  const uploaded = await uploadGeneratedAsset(params.jobId, asset)
  return {
    ...uploaded,
    metadata: {
      provider: 'doubao-seedream',
      created: payload.created || 0,
      fallback_used: fallbackUsed,
      revised_prompt: asset.revised_prompt || '',
      ...uploaded.metadata,
    },
  }
}

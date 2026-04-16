import { createHash } from 'node:crypto'
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { activities, activityStreams, artJobs, artPromptTemplates, artResults } from '../../db/schema'
import { badRequest, notFound } from '../../lib/errors'
import { createId } from '../../lib/ids'
import { parseDataUrl, resolveFilename, uploadBase64Asset } from '../../lib/storage'
import { toArtJobDto, toArtPromptTemplateDto, toArtResultDto } from '../shared/dto'

export const normalizeRenderOptions = (value: unknown) => {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const aspectRatio = typeof input.aspectRatio === 'string' ? input.aspectRatio : 'square'
  if (!['portrait', 'square', 'landscape'].includes(aspectRatio)) {
    throw badRequest('Unsupported aspect ratio')
  }

  return {
    aspectRatio,
    includeTitle: input.includeTitle !== false,
    includeStats: input.includeStats !== false,
    version: 'v1',
  }
}

export const buildPromptSnapshot = (activity: typeof activities.$inferSelect, templateKey: string, renderOptions: ReturnType<typeof normalizeRenderOptions>) => {
  const distanceKm = Number(activity.distanceMeters || 0) > 0 ? `${(Number(activity.distanceMeters) / 1000).toFixed(1)}km` : 'unknown distance'
  return [
    'Generate a hand-drawn route artwork.',
    `Template key: ${templateKey}.`,
    `Include title: ${renderOptions.includeTitle ? 'yes' : 'no'}.`,
    `Include stats: ${renderOptions.includeStats ? 'yes' : 'no'}.`,
    `Activity title: ${activity.name || 'Untitled activity'}.`,
    `Sport type: ${activity.sportType || 'activity'}.`,
    `Distance: ${distanceKm}.`,
  ].join(' ')
}

export const getArtJobsForActivity = async (userId: string, activityId: string, limit = 20) => {
  const jobs = await db.query.artJobs.findMany({
    where: and(eq(artJobs.userId, userId), eq(artJobs.activityId, activityId)),
    orderBy: desc(artJobs.queuedAt),
    limit,
  })
  const resultRows = jobs.length
    ? await db.query.artResults.findMany({
        where: inArray(artResults.jobId, jobs.map(job => job.id)),
      })
    : []
  const resultMap = new Map(resultRows.map(result => [result.jobId, result]))
  return jobs.map(job => toArtJobDto(job, resultMap.get(job.id) || null))
}

export const createArtJob = async (params: {
  userId: string
  activityId: string
  templateKey: string
  renderOptions: unknown
}) => {
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, params.activityId), eq(activities.userId, params.userId)),
  })
  if (!activity) {
    throw notFound('Activity not found')
  }
  if (!activity.isGeneratable) {
    throw badRequest(activity.generatableReason || 'This activity is not generatable yet')
  }

  const renderOptions = normalizeRenderOptions(params.renderOptions)
  const renderOptionsHash = createHash('sha256').update(JSON.stringify(renderOptions)).digest('hex')
  const reusable = await db.query.artJobs.findFirst({
    where: and(
      eq(artJobs.userId, params.userId),
      eq(artJobs.activityId, params.activityId),
      eq(artJobs.stylePreset, params.templateKey),
      eq(artJobs.renderOptionsHash, renderOptionsHash),
      or(eq(artJobs.status, 'pending'), eq(artJobs.status, 'processing')),
    ),
    orderBy: desc(artJobs.createdAt),
  })

  if (reusable) {
    const result = await db.query.artResults.findFirst({
      where: eq(artResults.jobId, reusable.id),
    })
    return {
      job: toArtJobDto(reusable, result || null),
      reused: true,
    }
  }

  const stream = await db.query.activityStreams.findFirst({
    where: and(eq(activityStreams.activityId, params.activityId), eq(activityStreams.userId, params.userId)),
  })
  const id = createId()
  await db.insert(artJobs).values({
    id,
    userId: params.userId,
    activityId: params.activityId,
    streamId: stream?.id || null,
    status: 'pending',
    stylePreset: params.templateKey,
    promptSnapshot: buildPromptSnapshot(activity, params.templateKey, renderOptions),
    renderOptionsJson: renderOptions,
    renderOptionsHash,
    routeBaseImageUrl: '',
    attemptCount: 0,
    queuedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const job = await db.query.artJobs.findFirst({
    where: eq(artJobs.id, id),
  })
  return {
    job: job ? toArtJobDto(job) : null,
    reused: false,
  }
}

export const uploadRouteBase = async (params: {
  userId: string
  jobId: string
  dataUrl: string
  fileName: string
}) => {
  const job = await db.query.artJobs.findFirst({
    where: and(eq(artJobs.id, params.jobId), eq(artJobs.userId, params.userId)),
  })
  if (!job) {
    throw notFound('Art job not found')
  }
  if (job.status !== 'pending') {
    throw badRequest('Route base image can only be uploaded for pending jobs')
  }

  const parsed = parseDataUrl(params.dataUrl)
  const filename = resolveFilename(params.fileName, parsed.mimeType)
  const uploaded = await uploadBase64Asset({
    objectKey: `route-bases/${encodeURIComponent(params.userId)}/${encodeURIComponent(params.jobId)}/${filename}`,
    mimeType: parsed.mimeType,
    base64Data: parsed.base64Data,
  })
  await db.update(artJobs).set({
    routeBaseImageUrl: uploaded.url,
    updatedAt: new Date(),
  }).where(eq(artJobs.id, params.jobId))

  const refreshed = await db.query.artJobs.findFirst({
    where: eq(artJobs.id, params.jobId),
  })
  return {
    job: refreshed ? toArtJobDto(refreshed) : null,
    routeBaseImageUrl: uploaded.url,
  }
}

export const queueArtJob = async (params: {
  userId: string
  jobId: string
}) => {
  const job = await db.query.artJobs.findFirst({
    where: and(eq(artJobs.id, params.jobId), eq(artJobs.userId, params.userId)),
  })
  if (!job) {
    throw notFound('Art job not found')
  }
  if (!job.routeBaseImageUrl) {
    throw badRequest('Missing route base image URL')
  }

  await db.update(artJobs).set({
    status: 'pending',
    queuedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(artJobs.id, job.id))

  const result = await db.query.artResults.findFirst({
    where: eq(artResults.jobId, job.id),
  })

  return {
    queued: true,
    reused: !!result,
    provider: 'doubao-seedream',
    result: result ? toArtResultDto(result) : null,
  }
}

export const listArtResults = async (params: {
  userId: string
  activityId: string
  page: number
  perPage: number
}) => {
  const offset = (params.page - 1) * params.perPage
  const [countRows, items] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` })
      .from(artResults)
      .where(and(eq(artResults.userId, params.userId), eq(artResults.activityId, params.activityId))),
    db.query.artResults.findMany({
      where: and(eq(artResults.userId, params.userId), eq(artResults.activityId, params.activityId)),
      orderBy: desc(artResults.createdAt),
      limit: params.perPage,
      offset,
    }),
  ])
  const totalItems = countRows[0]?.count || 0
  return {
    items: items.map(toArtResultDto),
    page: params.page,
    perPage: params.perPage,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / params.perPage)),
  }
}

export const getArtResult = async (userId: string, resultId: string) => {
  const result = await db.query.artResults.findFirst({
    where: and(eq(artResults.id, resultId), eq(artResults.userId, userId)),
  })
  if (!result) {
    throw notFound('Art result not found')
  }
  return toArtResultDto(result)
}

export const listPromptTemplates = async (includeInactive = false) => {
  const rows = await db.query.artPromptTemplates.findMany({
    where: includeInactive
      ? undefined
      : eq(artPromptTemplates.isActive, true),
    orderBy: asc(artPromptTemplates.templateKey),
  })
  return rows.map(toArtPromptTemplateDto)
}

export const updatePromptTemplate = async (templateId: string, payload: Partial<Pick<typeof artPromptTemplates.$inferInsert, 'promptTemplate' | 'referenceImageUrl' | 'notes' | 'isActive'>>) => {
  await db.update(artPromptTemplates).set({
    ...payload,
    updatedAt: new Date(),
  }).where(eq(artPromptTemplates.id, templateId))
  const template = await db.query.artPromptTemplates.findFirst({
    where: eq(artPromptTemplates.id, templateId),
  })
  if (!template) {
    throw notFound('Prompt template not found')
  }
  return toArtPromptTemplateDto(template)
}

export const uploadPromptReferenceImage = async (params: {
  templateId: string
  dataUrl: string
  fileName: string
}) => {
  const template = await db.query.artPromptTemplates.findFirst({
    where: eq(artPromptTemplates.id, params.templateId),
  })
  if (!template) {
    throw notFound('Prompt template not found')
  }

  const parsed = parseDataUrl(params.dataUrl)
  const filename = resolveFilename(params.fileName, parsed.mimeType)
  const uploaded = await uploadBase64Asset({
    objectKey: `prompt-templates/${encodeURIComponent(params.templateId)}/${filename}`,
    mimeType: parsed.mimeType,
    base64Data: parsed.base64Data,
  })

  const updated = await updatePromptTemplate(params.templateId, {
    referenceImageUrl: uploaded.url,
  })
  return {
    template: updated,
    referenceImageUrl: uploaded.url,
  }
}

import { and, asc, eq, lte, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { activities, artJobs, artPromptTemplates, artResults } from '../../db/schema'
import { env } from '../../lib/env'
import { createId } from '../../lib/ids'
import { renderWithDoubao } from '../art/providers/doubao'

const buildSubtitle = (activity: typeof activities.$inferSelect) => {
  const dateText = activity.startDate ? activity.startDate.toISOString().slice(0, 10) : ''
  const distanceText = Number(activity.distanceMeters || 0) > 0 ? `${(Number(activity.distanceMeters) / 1000).toFixed(1)} km` : 'Distance N/A'
  return [distanceText, dateText].filter(Boolean).join(' · ')
}

const createDoubaoResult = async (job: typeof artJobs.$inferSelect, activity: typeof activities.$inferSelect) => {
  const template = await db.query.artPromptTemplates.findFirst({
    where: and(
      eq(artPromptTemplates.provider, 'doubao-seedream'),
      eq(artPromptTemplates.templateKey, job.stylePreset),
    ),
  })
  const rendered = await renderWithDoubao({
    jobId: job.id,
    prompt: job.promptSnapshot,
    routeBaseImageUrl: job.routeBaseImageUrl,
    referenceImageUrl: template?.referenceImageUrl || '',
  })

  const existing = await db.query.artResults.findFirst({
    where: eq(artResults.jobId, job.id),
  })
  if (existing) {
    return existing
  }

  const id = createId()
  const now = new Date()
  await db.insert(artResults).values({
    id,
    jobId: job.id,
    userId: job.userId,
    activityId: job.activityId,
    imageDataUri: rendered.imageUrl,
    thumbnailDataUri: rendered.imageUrl,
    width: rendered.width,
    height: rendered.height,
    fileSize: rendered.fileSize,
    mimeType: rendered.mimeType,
    stylePreset: job.stylePreset,
    titleSnapshot: activity.name || 'Route Artwork',
    subtitleSnapshot: buildSubtitle(activity),
    metadataJson: rendered.metadata,
    visibility: 'private',
    createdAt: now,
    updatedAt: now,
  })
  return await db.query.artResults.findFirst({
    where: eq(artResults.id, id),
  })
}

const processNextJob = async () => {
  const staleBefore = new Date(Date.now() - env.ART_WORKER_STALE_PROCESSING_MS)
  const candidate = await db.query.artJobs.findFirst({
    where: and(
      or(
        and(eq(artJobs.status, 'pending'), lte(artJobs.queuedAt, new Date())),
        and(eq(artJobs.status, 'failed'), lte(artJobs.queuedAt, new Date())),
        and(eq(artJobs.status, 'processing'), lte(artJobs.startedAt, staleBefore)),
      ),
      sql`${artJobs.routeBaseImageUrl} <> ''`,
    ),
    orderBy: asc(artJobs.queuedAt),
  })

  if (!candidate) {
    return
  }

  await db.update(artJobs).set({
    status: 'processing',
    startedAt: new Date(),
    workerRef: 'inline-runner',
    attemptCount: candidate.attemptCount + 1,
    updatedAt: new Date(),
  }).where(eq(artJobs.id, candidate.id))

  const job = await db.query.artJobs.findFirst({
    where: eq(artJobs.id, candidate.id),
  })
  if (!job) {
    return
  }
  const activity = await db.query.activities.findFirst({
    where: eq(activities.id, job.activityId),
  })
  if (!activity) {
    return
  }

  try {
    const result = await createDoubaoResult(job, activity)

    await db.update(artJobs).set({
      status: 'succeeded',
      finishedAt: new Date(),
      errorCode: '',
      errorMessage: '',
      updatedAt: new Date(),
    }).where(eq(artJobs.id, job.id))
    return result
  }
  catch (error) {
    const retryDelay = error instanceof Error && /429|rate.?limit/i.test(error.message)
      ? env.ART_WORKER_RATE_LIMIT_RETRY_DELAY_MS
      : env.ART_WORKER_RETRY_DELAY_MS
    await db.update(artJobs).set({
      status: 'failed',
      finishedAt: new Date(),
      errorCode: 'ART_RENDER_FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
      queuedAt: new Date(Date.now() + retryDelay),
      updatedAt: new Date(),
    }).where(eq(artJobs.id, job.id))
  }
}

export const startJobRunner = () => {
  const timer = setInterval(() => {
    void processNextJob()
  }, env.ART_JOB_POLL_INTERVAL_MS)

  return () => clearInterval(timer)
}

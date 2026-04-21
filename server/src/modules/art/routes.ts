import type { AuthVariables } from '../auth/middleware'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../../db/client'
import { artJobs, artResults } from '../../db/schema'
import { parseJsonBody, parseParams, parseQuery } from '../../lib/http'
import { requireAdmin, requireAuth } from '../auth/middleware'
import { toArtJobDto } from '../shared/dto'
import { createArtJob, getArtJobsForActivity, getArtResult, listArtResults, listPromptTemplates, queueArtJob, updatePromptTemplate, uploadPromptReferenceImage, uploadRouteBase } from './service'

const router = new Hono<{ Variables: AuthVariables }>()

router.get('/jobs', requireAuth, async (c) => {
  const query = parseQuery(c, z.object({
    activityId: z.string().uuid(),
    limit: z.coerce.number().int().positive().max(50).default(20),
  }))
  return c.json({
    items: await getArtJobsForActivity(c.get('user').id, query.activityId, query.limit),
  })
})

router.post('/jobs', requireAuth, async (c) => {
  const body = await parseJsonBody(c, z.object({
    activityId: z.string().uuid(),
    templateKey: z.string().min(1),
    renderOptions: z.record(z.string(), z.unknown()).optional(),
  }))
  return c.json(await createArtJob({
    userId: c.get('user').id,
    activityId: body.activityId,
    templateKey: body.templateKey,
    renderOptions: body.renderOptions || {},
  }))
})

router.post('/jobs/:id/route-base', requireAuth, async (c) => {
  const { id } = parseParams(c, z.object({ id: z.string().uuid() }))
  const body = await parseJsonBody(c, z.object({
    dataUrl: z.string().min(1),
    fileName: z.string().default('route-base'),
  }))
  return c.json(await uploadRouteBase({
    userId: c.get('user').id,
    jobId: id,
    dataUrl: body.dataUrl,
    fileName: body.fileName,
  }))
})

router.post('/jobs/:id/render', requireAuth, async (c) => {
  const { id } = parseParams(c, z.object({ id: z.string().uuid() }))
  return c.json(await queueArtJob({
    userId: c.get('user').id,
    jobId: id,
  }))
})

router.get('/results', requireAuth, async (c) => {
  const query = parseQuery(c, z.object({
    activityId: z.string().uuid(),
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().positive().max(50).default(20),
  }))
  return c.json(await listArtResults({
    userId: c.get('user').id,
    activityId: query.activityId,
    page: query.page,
    perPage: query.perPage,
  }))
})

router.get('/results/:id', requireAuth, async (c) => {
  const { id } = parseParams(c, z.object({ id: z.string().uuid() }))
  return c.json({
    result: await getArtResult(c.get('user').id, id),
  })
})

router.get('/prompt-templates', requireAuth, async (c) => {
  const query = parseQuery(c, z.object({
    includeInactive: z.enum(['true', 'false']).optional(),
  }))
  return c.json({
    items: await listPromptTemplates(query.includeInactive === 'true' && c.get('user').isAdmin),
  })
})

router.patch('/prompt-templates/:id', requireAuth, requireAdmin, async (c) => {
  const { id } = parseParams(c, z.object({ id: z.string().uuid() }))
  const body = await parseJsonBody(c, z.object({
    prompt_template: z.string().optional(),
    reference_image_url: z.string().optional(),
    notes: z.string().optional(),
    is_active: z.boolean().optional(),
  }))
  const template = await updatePromptTemplate(id, {
    promptTemplate: body.prompt_template,
    referenceImageUrl: body.reference_image_url,
    notes: body.notes,
    isActive: body.is_active,
  })
  return c.json({ template })
})

router.post('/admin/art-prompt-templates/:id/reference-image', requireAuth, requireAdmin, async (c) => {
  const { id } = parseParams(c, z.object({ id: z.string().uuid() }))
  const body = await parseJsonBody(c, z.object({
    dataUrl: z.string().min(1),
    fileName: z.string().default('reference-image'),
  }))
  return c.json(await uploadPromptReferenceImage({
    templateId: id,
    dataUrl: body.dataUrl,
    fileName: body.fileName,
  }))
})

router.get('/history/jobs', requireAuth, async (c) => {
  const query = parseQuery(c, z.object({
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().positive().max(50).default(12),
  }))
  const offset = (query.page - 1) * query.perPage
  const userId = c.get('user').id

  const [countRows, jobs] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(artJobs).where(eq(artJobs.userId, userId)),
    db.query.artJobs.findMany({
      where: eq(artJobs.userId, userId),
      orderBy: desc(artJobs.queuedAt),
      limit: query.perPage,
      offset,
    }),
  ])
  const results = jobs.length
    ? await db.query.artResults.findMany({
        where: inArray(artResults.jobId, jobs.map(job => job.id)),
      })
    : []
  const resultMap = new Map(results.map(result => [result.jobId, result]))
  const totalItems = countRows[0]?.count || 0

  return c.json({
    items: jobs.map(job => toArtJobDto(job, resultMap.get(job.id) || null)),
    page: query.page,
    perPage: query.perPage,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / query.perPage)),
  })
})

export { router as artRoutes }

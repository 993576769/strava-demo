import type { AuthVariables } from '../auth/middleware'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../../db/client'
import { activities, activityStreams } from '../../db/schema'
import { notFound } from '../../lib/errors'
import { parseParams, parseQuery } from '../../lib/http'
import { requireAuth } from '../auth/middleware'
import { toActivityDto, toActivityListDto, toActivityStreamDto } from '../shared/dto'

const router = new Hono<{ Variables: AuthVariables }>()

router.get('/', requireAuth, async (c) => {
  const query = parseQuery(c, z.object({
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().positive().max(50).default(12),
    ids: z.string().optional(),
  }))
  const userId = c.get('user').id
  const requestedIds = query.ids
    ? query.ids.split(',').map(value => value.trim()).filter(Boolean)
    : []

  if (requestedIds.length > 0) {
    const items = await db.query.activities.findMany({
      where: and(eq(activities.userId, userId), inArray(activities.id, requestedIds)),
      orderBy: desc(activities.startDate),
    })

    return c.json({
      items: items.map(toActivityListDto),
      page: 1,
      perPage: items.length || requestedIds.length,
      totalItems: items.length,
      totalPages: 1,
    })
  }

  const offset = (query.page - 1) * query.perPage

  const [countRows, items] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(activities).where(eq(activities.userId, userId)),
    db.query.activities.findMany({
      where: eq(activities.userId, userId),
      orderBy: desc(activities.startDate),
      limit: query.perPage,
      offset,
    }),
  ])

  const totalItems = countRows[0]?.count || 0
  return c.json({
    items: items.map(toActivityListDto),
    page: query.page,
    perPage: query.perPage,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / query.perPage)),
  })
})

router.get('/:id', requireAuth, async (c) => {
  const { id } = parseParams(c, z.object({ id: z.string().uuid() }))
  const record = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.userId, c.get('user').id)),
  })
  if (!record) {
    throw notFound('Activity not found')
  }
  return c.json({ activity: toActivityDto(record) })
})

router.get('/:id/stream', requireAuth, async (c) => {
  const { id } = parseParams(c, z.object({ id: z.string().uuid() }))
  const stream = await db.query.activityStreams.findFirst({
    where: and(eq(activityStreams.activityId, id), eq(activityStreams.userId, c.get('user').id)),
  })
  if (!stream) {
    throw notFound('Activity stream not found')
  }
  return c.json({ stream: toActivityStreamDto(stream) })
})

export { router as activityRoutes }

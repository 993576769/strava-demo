import type { AuthVariables } from '../auth/middleware'
import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../../db/client'
import { syncEvents } from '../../db/schema'
import { parseQuery } from '../../lib/http'
import { requireAuth } from '../auth/middleware'
import { toSyncEventDto } from '../shared/dto'

const router = new Hono<{ Variables: AuthVariables }>()

router.get('/', requireAuth, async (c) => {
  const query = parseQuery(c, z.object({
    limit: z.coerce.number().int().positive().max(50).default(8),
  }))
  const items = await db.query.syncEvents.findMany({
    where: eq(syncEvents.userId, c.get('user').id),
    orderBy: desc(syncEvents.occurredAt),
    limit: query.limit,
  })
  return c.json({
    items: items.map(toSyncEventDto),
  })
})

export { router as syncEventRoutes }

import type { MiddlewareHandler } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { users } from '../../db/schema'
import { verifyAccessToken } from '../../lib/auth'
import { forbidden, unauthorized } from '../../lib/errors'

export interface AuthVariables {
  user: typeof users.$inferSelect
  token: {
    sessionId: string
  }
}

export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const authHeader = c.req.header('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw unauthorized()
  }

  const payload = await verifyAccessToken(authHeader.replace(/^Bearer\s+/i, ''))
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.sub),
  })

  if (!user) {
    throw unauthorized()
  }

  c.set('user', user)
  c.set('token', { sessionId: payload.sessionId })
  await next()
}

export const requireAdmin: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const user = c.get('user')
  if (!user?.isAdmin) {
    throw forbidden('Admin access is required')
  }
  await next()
}

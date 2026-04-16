import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { env } from '../lib/env'
import { AppError } from '../lib/errors'
import { activityRoutes } from '../modules/activities/routes'
import { artRoutes } from '../modules/art/routes'
import { authRoutes } from '../modules/auth/routes'
import { stravaRoutes } from '../modules/strava/routes'
import { syncEventRoutes } from '../modules/sync-events/routes'

export const createApp = () => {
  const app = new Hono()

  app.use('*', logger())
  app.use('/api/*', cors({
    origin: env.APP_URL,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    credentials: true,
  }))

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json({
        code: error.code,
        message: error.message,
        details: error.details,
      }, error.status as 400)
    }

    console.error(error)
    return c.json({
      code: 'INTERNAL_SERVER_ERROR',
      message: error instanceof Error ? error.message : 'Internal server error',
    }, 500)
  })

  app.get('/api/health', c => c.json({
    ok: true,
    runtime: 'bun',
  }))
  app.route('/api/auth', authRoutes)
  app.route('/api/integrations/strava', stravaRoutes)
  app.route('/api/activities', activityRoutes)
  app.route('/api/art', artRoutes)
  app.route('/api/sync-events', syncEventRoutes)

  return app
}

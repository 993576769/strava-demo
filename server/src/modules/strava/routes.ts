import type { AuthVariables } from '../auth/middleware'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../../db/client'
import { stravaConnections } from '../../db/schema'
import { env } from '../../lib/env'
import { parseJsonBody } from '../../lib/http'
import { requireAuth } from '../auth/middleware'
import { toStravaConnectionDto } from '../shared/dto'
import { buildStravaConnectUrl, exchangeStravaCode, fetchAthlete, getConnectionByUserId, logSyncEvent, syncActivitiesForUser, upsertConnection, validateStateToken } from './service'

const router = new Hono<{ Variables: AuthVariables }>()

router.get('/status', requireAuth, async (c) => {
  const connection = await getConnectionByUserId(c.get('user').id)
  return c.json({
    connection: connection ? toStravaConnectionDto(connection) : null,
  })
})

router.post('/connect', requireAuth, async (c) => {
  const url = buildStravaConnectUrl(c.get('user').id)
  return c.json({ url })
})

router.get('/callback', async (c) => {
  const error = c.req.query('error')
  const code = c.req.query('code')
  const state = c.req.query('state')

  if (error || !code || !state) {
    return c.redirect(`${env.APP_URL.replace(/\/$/, '')}/activities?strava=callback_error`, 302)
  }

  const claims = validateStateToken(state)
  const tokenData = await exchangeStravaCode(code)
  const athlete = tokenData.athlete || await fetchAthlete(tokenData.access_token)
  await upsertConnection(claims.userId, tokenData, athlete, env.STRAVA_SCOPES)
  await logSyncEvent(claims.userId, 'connection', 'success', 'Strava 授权成功', '连接已建立')
  return c.redirect(`${env.APP_URL.replace(/\/$/, '')}/activities?strava=connected`, 302)
})

router.post('/sync', requireAuth, async (c) => {
  const body = await parseJsonBody(c, z.object({
    mode: z.enum(['incremental', 'history']).optional(),
  }))

  const result = await syncActivitiesForUser(c.get('user').id, body.mode || 'incremental')
  return c.json({
    connection: result.connection ? toStravaConnectionDto(result.connection) : null,
    stats: result.stats,
  })
})

router.post('/sync-history', requireAuth, async (c) => {
  const result = await syncActivitiesForUser(c.get('user').id, 'history')
  return c.json({
    connection: result.connection ? toStravaConnectionDto(result.connection) : null,
    stats: result.stats,
  })
})

router.post('/disconnect', requireAuth, async (c) => {
  const userId = c.get('user').id
  const connection = await getConnectionByUserId(userId)
  if (connection) {
    await db.update(stravaConnections).set({
      status: 'revoked',
      accessTokenEncrypted: '',
      refreshTokenEncrypted: '',
      lastErrorMessage: '',
      updatedAt: new Date(),
    }).where(and(eq(stravaConnections.id, connection.id), eq(stravaConnections.userId, userId)))
    await logSyncEvent(userId, 'connection', 'warning', 'Strava 已断开', '连接已被用户手动断开')
  }

  return c.json({ success: true })
})

router.get('/webhook', async (c) => {
  const challenge = c.req.query('hub.challenge')
  const verifyToken = c.req.query('hub.verify_token')
  const mode = c.req.query('hub.mode')

  if (mode !== 'subscribe' || verifyToken !== env.STRAVA_WEBHOOK_VERIFY_TOKEN || !challenge) {
    return c.json({ code: 'INVALID_WEBHOOK_VERIFY', message: 'Invalid webhook verification' }, 400)
  }

  return c.json({ 'hub.challenge': challenge })
})

router.post('/webhook', async (c) => {
  const payload = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const ownerId = String(payload.owner_id || '')
  if (ownerId) {
    const connection = await db.query.stravaConnections.findFirst({
      where: eq(stravaConnections.stravaAthleteId, ownerId),
    })
    if (connection) {
      await db.update(stravaConnections).set({
        lastWebhookAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(stravaConnections.id, connection.id))
      await logSyncEvent(connection.userId, 'webhook', 'info', '收到 Strava webhook', 'Strava 已推送事件', payload)
    }
  }

  return c.json({ received: true })
})

export { router as stravaRoutes }

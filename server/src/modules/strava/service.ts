import { Buffer } from 'node:buffer'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { activities, activityStreams, stravaConnections, syncEvents } from '../../db/schema'
import { decryptSecret, encryptSecret, signState, verifyState } from '../../lib/crypto'
import { env } from '../../lib/env'
import { badRequest } from '../../lib/errors'
import { createId } from '../../lib/ids'

interface StravaAthlete {
  id?: number
  username?: string
}

const requestStrava = async (url: string, init: RequestInit = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(env.STRAVA_HTTP_TIMEOUT_SECONDS * 1000),
  })

  const bodyText = await response.text()
  const json = bodyText ? JSON.parse(bodyText) : null
  if (!response.ok) {
    throw badRequest(`Strava request failed (${response.status})`, json)
  }

  return json
}

export const buildStravaConnectUrl = (userId: string) => {
  const state = signState(Buffer.from(JSON.stringify({ userId, nonce: createId() })).toString('base64url'))
  const url = new URL('https://www.strava.com/oauth/authorize')
  url.searchParams.set('client_id', env.STRAVA_CLIENT_ID)
  url.searchParams.set('redirect_uri', env.STRAVA_REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('approval_prompt', 'auto')
  url.searchParams.set('scope', env.STRAVA_SCOPES)
  url.searchParams.set('state', state)
  return url.toString()
}

export const exchangeStravaCode = async (code: string) => {
  return await requestStrava('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  }) as {
    access_token: string
    refresh_token: string
    expires_at: number
    athlete?: StravaAthlete
  }
}

export const refreshStravaToken = async (refreshToken: string) => {
  return await requestStrava('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  }) as {
    access_token: string
    refresh_token: string
    expires_at: number
  }
}

export const fetchAthlete = async (accessToken: string) => {
  return await requestStrava('https://www.strava.com/api/v3/athlete', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }) as StravaAthlete
}

const fetchAthleteActivities = async (accessToken: string, page: number, afterEpoch?: number) => {
  const url = new URL('https://www.strava.com/api/v3/athlete/activities')
  url.searchParams.set('page', String(page))
  url.searchParams.set('per_page', String(env.STRAVA_SYNC_PER_PAGE))
  if (afterEpoch) {
    url.searchParams.set('after', String(afterEpoch))
  }

  return await requestStrava(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }) as Array<Record<string, unknown>>
}

const fetchActivityDetail = async (accessToken: string, activityId: string) => {
  return await requestStrava(`https://www.strava.com/api/v3/activities/${encodeURIComponent(activityId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }) as Record<string, unknown>
}

const fetchActivityStreams = async (accessToken: string, activityId: string) => {
  const url = new URL(`https://www.strava.com/api/v3/activities/${encodeURIComponent(activityId)}/streams`)
  url.searchParams.set('keys', 'latlng,altitude,time,distance')
  url.searchParams.set('key_by_type', 'true')
  return await requestStrava(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }) as Record<string, { data?: unknown[] }>
}

export const getConnectionByUserId = async (userId: string) => {
  return await db.query.stravaConnections.findFirst({
    where: and(eq(stravaConnections.userId, userId), eq(stravaConnections.provider, 'strava')),
    orderBy: desc(stravaConnections.createdAt),
  })
}

export const upsertConnection = async (userId: string, tokenData: Awaited<ReturnType<typeof exchangeStravaCode>>, athlete: StravaAthlete, scope: string) => {
  const existing = await getConnectionByUserId(userId)
  const values = {
    userId,
    provider: 'strava',
    stravaAthleteId: String(athlete.id || ''),
    stravaUsername: athlete.username || '',
    scopeGranted: scope,
    accessTokenEncrypted: encryptSecret(tokenData.access_token),
    refreshTokenEncrypted: encryptSecret(tokenData.refresh_token),
    tokenExpiresAt: new Date((tokenData.expires_at || 0) * 1000),
    status: 'active',
    lastErrorCode: '',
    lastErrorMessage: '',
    updatedAt: new Date(),
  } as const

  if (existing) {
    await db.update(stravaConnections).set(values).where(eq(stravaConnections.id, existing.id))
    return await getConnectionByUserId(userId)
  }

  const id = createId()
  await db.insert(stravaConnections).values({
    id,
    ...values,
  })
  return await getConnectionByUserId(userId)
}

export const validateStateToken = (token: string) => {
  const payload = verifyState(token)
  if (!payload) {
    throw badRequest('Invalid Strava callback state')
  }
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { userId: string }
}

const computeGeneratableReason = (summary: Record<string, unknown>, streamPoints: number[][] | null) => {
  const sportType = typeof summary.sport_type === 'string' ? summary.sport_type : ''
  if (!streamPoints || streamPoints.length < 2) {
    return {
      isGeneratable: false,
      reason: 'This activity does not have enough route points yet',
    }
  }

  if (!sportType) {
    return {
      isGeneratable: true,
      reason: '',
    }
  }

  return {
    isGeneratable: true,
    reason: '',
  }
}

const normalizeStreamPoints = (value: unknown) => {
  if (!Array.isArray(value)) {
    return null
  }
  return value
    .filter((item): item is number[] => Array.isArray(item) && item.length >= 2 && item.every(point => typeof point === 'number'))
    .map(item => [item[0]!, item[1]!])
}

export const logSyncEvent = async (userId: string, category: string, status: string, title: string, message: string, payload?: Record<string, unknown>) => {
  await db.insert(syncEvents).values({
    id: createId(),
    userId,
    provider: 'strava',
    category,
    status,
    title,
    message,
    payloadJson: payload || null,
    occurredAt: new Date(),
  })
}

export const ensureValidAccessToken = async (connection: NonNullable<Awaited<ReturnType<typeof getConnectionByUserId>>>) => {
  const refreshToken = decryptSecret(connection.refreshTokenEncrypted)
  const accessToken = decryptSecret(connection.accessTokenEncrypted)
  if (!connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() > Date.now() + 30_000) {
    return {
      connection,
      accessToken,
    }
  }

  const refreshed = await refreshStravaToken(refreshToken)
  await db.update(stravaConnections).set({
    accessTokenEncrypted: encryptSecret(refreshed.access_token),
    refreshTokenEncrypted: encryptSecret(refreshed.refresh_token),
    tokenExpiresAt: new Date(refreshed.expires_at * 1000),
    status: 'active',
    lastErrorCode: '',
    lastErrorMessage: '',
    updatedAt: new Date(),
  }).where(eq(stravaConnections.id, connection.id))

  const updated = await getConnectionByUserId(connection.userId)
  if (!updated) {
    throw badRequest('Failed to refresh Strava connection')
  }

  return {
    connection: updated,
    accessToken: refreshed.access_token,
  }
}

export const syncActivitiesForUser = async (userId: string, mode: 'incremental' | 'history' = 'incremental') => {
  const connection = await getConnectionByUserId(userId)
  if (!connection) {
    throw badRequest('Strava connection not found')
  }

  const valid = await ensureValidAccessToken(connection)
  const afterEpoch = mode === 'incremental' ? (valid.connection.lastSyncCursor || undefined) : undefined
  const stats = {
    mode,
    fetched: 0,
    created: 0,
    updated: 0,
    ready: 0,
    partial: 0,
    generatable: 0,
    failed: 0,
  }

  for (let page = 1; page <= env.STRAVA_SYNC_MAX_PAGES; page += 1) {
    const items = await fetchAthleteActivities(valid.accessToken, page, afterEpoch)
    if (!items.length) {
      break
    }

    for (const item of items.slice(0, env.STRAVA_SYNC_MAX_ACTIVITIES)) {
      const sourceActivityId = String(item.id || '')
      if (!sourceActivityId) {
        continue
      }
      stats.fetched += 1
      const detail = await fetchActivityDetail(valid.accessToken, sourceActivityId)
      const streamPayload = await fetchActivityStreams(valid.accessToken, sourceActivityId).catch(() => null)
      const latlng = normalizeStreamPoints(streamPayload?.latlng?.data)
      const altitude = Array.isArray(streamPayload?.altitude?.data)
        ? streamPayload.altitude.data.filter((value): value is number => typeof value === 'number')
        : null
      const time = Array.isArray(streamPayload?.time?.data)
        ? streamPayload.time.data.filter((value): value is number => typeof value === 'number')
        : null
      const distance = Array.isArray(streamPayload?.distance?.data)
        ? streamPayload.distance.data.filter((value): value is number => typeof value === 'number')
        : null
      const generatable = computeGeneratableReason(detail, latlng)

      const existing = await db.query.activities.findFirst({
        where: and(eq(activities.source, 'strava'), eq(activities.sourceActivityId, sourceActivityId)),
      })

      const activityValues = {
        userId,
        connectionId: valid.connection.id,
        source: 'strava',
        sourceActivityId,
        name: String(detail.name || item.name || 'Untitled activity'),
        sportType: String(detail.sport_type || item.sport_type || ''),
        startDate: detail.start_date ? new Date(String(detail.start_date)) : null,
        timezone: String(detail.timezone || item.timezone || ''),
        distanceMeters: String(detail.distance || item.distance || 0),
        movingTimeSeconds: Number(detail.moving_time || item.moving_time || 0),
        elapsedTimeSeconds: Number(detail.elapsed_time || item.elapsed_time || 0),
        elevationGainMeters: String(detail.total_elevation_gain || item.total_elevation_gain || 0),
        averageSpeed: String(detail.average_speed || item.average_speed || 0),
        startLatlng: Array.isArray(detail.start_latlng) ? detail.start_latlng as number[] : null,
        endLatlng: Array.isArray(detail.end_latlng) ? detail.end_latlng as number[] : null,
        visibility: String(detail.visibility || 'unknown'),
        hasPolyline: Boolean((detail.map as Record<string, unknown> | undefined)?.summary_polyline),
        hasStreams: !!latlng?.length,
        isGeneratable: generatable.isGeneratable,
        generatableReason: generatable.reason,
        syncStatus: latlng?.length ? 'ready' : 'partial',
        syncedAt: new Date(),
        rawSummaryJson: item,
        rawDetailJson: detail,
        updatedAt: new Date(),
      } as const

      let activityId = existing?.id || ''
      if (existing) {
        await db.update(activities).set(activityValues).where(eq(activities.id, existing.id))
        stats.updated += 1
        activityId = existing.id
      }
      else {
        activityId = createId()
        await db.insert(activities).values({
          id: activityId,
          createdAt: new Date(),
          ...activityValues,
        })
        stats.created += 1
      }

      const existingStream = await db.query.activityStreams.findFirst({
        where: eq(activityStreams.activityId, activityId),
      })
      const streamValues = {
        userId,
        activityId,
        streamVersion: 'v1',
        pointCount: latlng?.length || 0,
        distanceStreamJson: distance,
        latlngStreamJson: latlng,
        altitudeStreamJson: altitude,
        timeStreamJson: time,
        normalizedPathJson: latlng,
        bboxJson: null,
        samplingStrategy: 'raw',
        processedAt: new Date(),
        updatedAt: new Date(),
      } as const

      if (existingStream) {
        await db.update(activityStreams).set(streamValues).where(eq(activityStreams.id, existingStream.id))
      }
      else {
        await db.insert(activityStreams).values({
          id: createId(),
          createdAt: new Date(),
          ...streamValues,
        })
      }

      if (latlng?.length) {
        stats.ready += 1
        if (generatable.isGeneratable) {
          stats.generatable += 1
        }
      }
      else {
        stats.partial += 1
      }
    }
  }

  const latestCursor = Math.floor(Date.now() / 1000)
  await db.update(stravaConnections).set({
    lastSyncAt: new Date(),
    lastSyncCursor: latestCursor,
    lastErrorCode: '',
    lastErrorMessage: '',
    status: 'active',
    updatedAt: new Date(),
  }).where(eq(stravaConnections.id, valid.connection.id))

  await logSyncEvent(userId, 'sync', 'success', mode === 'history' ? '历史活动回填完成' : 'Strava 活动同步完成', `本次获取 ${stats.fetched} 条活动`, stats as unknown as Record<string, unknown>)
  const updatedConnection = await getConnectionByUserId(userId)
  return {
    connection: updatedConnection,
    stats,
  }
}

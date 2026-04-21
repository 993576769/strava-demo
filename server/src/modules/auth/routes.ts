import type { Context } from 'hono'
import { Buffer } from 'node:buffer'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { db } from '../../db/client'
import { oauthAccounts, sessions, users } from '../../db/schema'
import { createAccessToken, createRefreshToken, verifyAccessToken, verifyRefreshToken } from '../../lib/auth'
import { hashToken } from '../../lib/crypto'
import { env, getGitHubRedirectUri } from '../../lib/env'
import { internalError, unauthorized } from '../../lib/errors'
import { parseJsonBody } from '../../lib/http'
import { createId } from '../../lib/ids'
import { toUserDto } from '../shared/dto'

const router = new Hono()
const refreshCookieName = 'strava_art_refresh_token'

const requireGitHubOAuthConfig = () => {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    throw internalError('GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.')
  }
}

const resolveGitHubRedirectUri = (c: Context) => {
  return getGitHubRedirectUri(new URL(c.req.url).origin)
}

const getGitHubUser = async (accessToken: string) => {
  const [profileResponse, emailResponse] = await Promise.all([
    fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    }),
    fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    }),
  ])

  if (!profileResponse.ok || !emailResponse.ok) {
    throw unauthorized('Failed to read GitHub user profile')
  }

  const profile = await profileResponse.json() as Record<string, unknown>
  const emails = await emailResponse.json() as Array<{ email?: string, primary?: boolean, verified?: boolean }>
  const email = emails.find(item => item.primary && item.verified)?.email || emails.find(item => item.verified)?.email

  if (!email) {
    throw unauthorized('GitHub account does not expose a verified email')
  }

  return {
    providerAccountId: String(profile.id ?? ''),
    email,
    name: String(profile.login || profile.name || email.split('@')[0] || ''),
    avatarUrl: String(profile.avatar_url || ''),
  }
}

const buildSessionPayload = async (user: typeof users.$inferSelect, sessionId: string) => ({
  user: toUserDto(user),
  accessToken: await createAccessToken({
    sub: user.id,
    sessionId,
    role: user.isAdmin ? 'admin' : 'user',
  }),
})

const issueSession = async (c: Context, user: typeof users.$inferSelect) => {
  const sessionId = createId()
  const refreshToken = await createRefreshToken({
    sub: user.id,
    sessionId,
  })
  const expiresAt = new Date(Date.now() + (env.REFRESH_TOKEN_TTL_SECONDS * 1000))

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt,
  })

  setCookie(c, refreshCookieName, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })

  return await buildSessionPayload(user, sessionId)
}

router.post('/github/start', async (c) => {
  requireGitHubOAuthConfig()

  const body = await parseJsonBody(c, z.object({
    redirectTo: z.string().optional(),
  }))

  const statePayload = Buffer.from(JSON.stringify({
    redirectTo: body.redirectTo || '/',
    nonce: createId(),
  })).toString('base64url')

  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', env.GITHUB_CLIENT_ID)
  url.searchParams.set('redirect_uri', resolveGitHubRedirectUri(c))
  url.searchParams.set('scope', 'read:user user:email')
  url.searchParams.set('state', statePayload)

  return c.json({ url: url.toString() })
})

router.get('/github/callback', async (c) => {
  requireGitHubOAuthConfig()

  const code = c.req.query('code')
  const state = c.req.query('state')
  const error = c.req.query('error')
  const fallbackRedirect = `${env.APP_URL.replace(/\/$/, '')}/login`

  if (error || !code) {
    return c.redirect(`${fallbackRedirect}?error=github_oauth_failed`, 302)
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: resolveGitHubRedirectUri(c),
    }),
  })

  if (!tokenResponse.ok) {
    return c.redirect(`${fallbackRedirect}?error=github_token_exchange_failed`, 302)
  }

  const tokenPayload = await tokenResponse.json() as { access_token?: string }
  if (!tokenPayload.access_token) {
    return c.redirect(`${fallbackRedirect}?error=github_token_missing`, 302)
  }

  const githubUser = await getGitHubUser(tokenPayload.access_token)
  let user = await db.query.users.findFirst({
    where: eq(users.email, githubUser.email),
  })

  if (!user) {
    const id = createId()
    await db.insert(users).values({
      id,
      email: githubUser.email,
      name: githubUser.name,
      avatarUrl: githubUser.avatarUrl,
      isActive: true,
      isAdmin: false,
    })
    user = await db.query.users.findFirst({
      where: eq(users.id, id),
    })
  }
  else {
    await db.update(users)
      .set({
        name: githubUser.name || user.name,
        avatarUrl: githubUser.avatarUrl || user.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
    user = await db.query.users.findFirst({
      where: eq(users.id, user.id),
    })
  }

  if (!user) {
    return c.redirect(`${fallbackRedirect}?error=user_creation_failed`, 302)
  }

  const existingAccount = await db.query.oauthAccounts.findFirst({
    where: and(
      eq(oauthAccounts.provider, 'github'),
      eq(oauthAccounts.providerAccountId, githubUser.providerAccountId),
    ),
  })

  if (existingAccount) {
    await db.update(oauthAccounts).set({
      userId: user.id,
      accessToken: tokenPayload.access_token,
      updatedAt: new Date(),
    }).where(eq(oauthAccounts.id, existingAccount.id))
  }
  else {
    await db.insert(oauthAccounts).values({
      id: createId(),
      userId: user.id,
      provider: 'github',
      providerAccountId: githubUser.providerAccountId,
      accessToken: tokenPayload.access_token,
      refreshToken: '',
      scope: 'read:user user:email',
    })
  }

  const session = await issueSession(c, user)
  const redirectState = state ? JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as { redirectTo?: string } : {}
  const redirectPath = typeof redirectState.redirectTo === 'string' && redirectState.redirectTo.startsWith('/')
    ? redirectState.redirectTo
    : '/'
  const redirectUrl = new URL('/login', env.APP_URL)
  redirectUrl.searchParams.set('access_token', session.accessToken)
  redirectUrl.searchParams.set('redirect', redirectPath)
  return c.redirect(redirectUrl.toString(), 302)
})

router.get('/session', async (c) => {
  const authHeader = c.req.header('authorization')
  const refreshToken = getCookie(c, refreshCookieName)

  if (authHeader?.startsWith('Bearer ')) {
    const payload = await verifyAccessToken(authHeader.replace(/^Bearer\s+/i, ''))
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.sub),
    })
    if (!user) {
      throw unauthorized()
    }
    return c.json({ user: toUserDto(user) })
  }

  if (!refreshToken) {
    throw unauthorized()
  }

  const payload = await verifyRefreshToken(refreshToken)
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, payload.sessionId),
  })
  if (!session || session.refreshTokenHash !== hashToken(refreshToken) || session.expiresAt.getTime() < Date.now()) {
    throw unauthorized()
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.sub),
  })
  if (!user) {
    throw unauthorized()
  }

  return c.json(await buildSessionPayload(user, session.id))
})

router.post('/logout', async (c) => {
  const refreshToken = getCookie(c, refreshCookieName)
  if (refreshToken) {
    const payload = await verifyRefreshToken(refreshToken).catch(() => null)
    if (payload?.sessionId) {
      await db.delete(sessions).where(eq(sessions.id, payload.sessionId))
    }
  }

  deleteCookie(c, refreshCookieName, {
    path: '/',
  })
  return c.json({ success: true })
})

export { router as authRoutes, refreshCookieName }

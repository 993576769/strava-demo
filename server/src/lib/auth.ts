import type { JWTPayload } from 'jose'
import { jwtVerify, SignJWT } from 'jose'
import { env } from './env'
import { unauthorized } from './errors'

const accessSecret = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET)
const refreshSecret = new TextEncoder().encode(env.REFRESH_TOKEN_SECRET)

export interface AccessTokenPayload extends JWTPayload {
  sub: string
  sessionId: string
  role: 'user' | 'admin'
}

export const createAccessToken = async (payload: AccessTokenPayload) => {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessSecret)
}

export const createRefreshToken = async (payload: Pick<AccessTokenPayload, 'sub' | 'sessionId'>) => {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.REFRESH_TOKEN_TTL_SECONDS}s`)
    .sign(refreshSecret)
}

export const verifyAccessToken = async (token: string) => {
  try {
    const { payload } = await jwtVerify(token, accessSecret)
    return payload as unknown as AccessTokenPayload
  }
  catch {
    throw unauthorized('Access token is invalid or expired')
  }
}

export const verifyRefreshToken = async (token: string) => {
  try {
    const { payload } = await jwtVerify(token, refreshSecret)
    return payload as unknown as Pick<AccessTokenPayload, 'sub' | 'sessionId'>
  }
  catch {
    throw unauthorized('Refresh token is invalid or expired')
  }
}

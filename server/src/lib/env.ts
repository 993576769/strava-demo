import path from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config({
  path: path.join(process.cwd(), '.env'),
  override: false,
})

dotenv.config({
  path: path.join(process.cwd(), '.env.local'),
  override: false,
})

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8090),
  APP_URL: z.string().url().default('http://127.0.0.1:5173'),
  DATABASE_URL: z.string().min(1).default('postgres://postgres:postgres@127.0.0.1:5432/strava_art_lab'),
  ACCESS_TOKEN_SECRET: z.string().min(32).default('replace-this-access-token-secret-with-at-least-32-chars'),
  REFRESH_TOKEN_SECRET: z.string().min(32).default('replace-this-refresh-token-secret-with-at-least-32-chars'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),
  GITHUB_REDIRECT_URI: z.string().url().optional(),
  STRAVA_CLIENT_ID: z.string().default(''),
  STRAVA_CLIENT_SECRET: z.string().default(''),
  STRAVA_REDIRECT_URI: z.string().url().default('http://127.0.0.1:8090/api/integrations/strava/callback'),
  STRAVA_SCOPES: z.string().default('read,activity:read_all'),
  STRAVA_STATE_SECRET: z.string().min(16).default('replace-with-a-long-random-string'),
  STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().default('replace-with-a-webhook-verify-token'),
  STRAVA_TOKEN_ENCRYPTION_KEY: z.string().default(''),
  STRAVA_HTTP_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(15),
  STRAVA_SYNC_PER_PAGE: z.coerce.number().int().positive().default(10),
  STRAVA_SYNC_MAX_PAGES: z.coerce.number().int().positive().default(1),
  STRAVA_SYNC_MAX_ACTIVITIES: z.coerce.number().int().positive().default(10),
  ART_ASSET_BASE_URL: z.string().url().optional(),
  ART_JOB_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  ART_WORKER_STALE_PROCESSING_MS: z.coerce.number().int().positive().default(120000),
  ART_WORKER_RETRY_DELAY_MS: z.coerce.number().int().positive().default(120000),
  ART_WORKER_RATE_LIMIT_RETRY_DELAY_MS: z.coerce.number().int().positive().default(300000),
  ARK_API_KEY: z.string().default(''),
  ARK_BASE_URL: z.string().url().default('https://ark.cn-beijing.volces.com/api/v3'),
  DOUBAO_SEEDREAM_MODEL: z.string().default('doubao-seedream-5-0-260128'),
  DOUBAO_IMAGE_SIZE: z.string().default('2K'),
  DOUBAO_OUTPUT_FORMAT: z.enum(['png', 'jpeg', 'webp']).default('png'),
  DOUBAO_RESPONSE_FORMAT: z.enum(['url', 'b64_json']).default('url'),
  DOUBAO_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),
  AWS_SESSION_TOKEN: z.string().default(''),
  AWS_S3_BUCKET: z.string().default(''),
  AWS_S3_REGION: z.string().default(''),
  AWS_S3_ENDPOINT: z.string().default(''),
  AWS_S3_PUBLIC_BASE_URL: z.string().default(''),
})

export const env = envSchema.parse(process.env)

export const getGitHubRedirectUri = (origin?: string) => {
  if (env.GITHUB_REDIRECT_URI) {
    return env.GITHUB_REDIRECT_URI
  }

  const baseUrl = (origin || env.APP_URL).replace(/\/$/, '')
  return `${baseUrl}/api/auth/github/callback`
}

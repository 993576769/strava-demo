import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PocketBase from 'pocketbase'
import { demoUserSeed } from '../seeds/demo-user.mts'
import { loadEnv } from '../../scripts/load-env.mts'

type SeedRecord = {
  id: string
  email?: string
}

const currentFile = fileURLToPath(import.meta.url)
const pocketbaseDir = path.resolve(path.dirname(currentFile), '..')
const rootDir = path.resolve(pocketbaseDir, '..')
const args = new Set(process.argv.slice(2))

if (args.has('--help') || args.has('-h')) {
  console.log(`Usage: pnpm run seed:pocketbase

Seeds demo data into a running PocketBase instance.

Environment variables:
  PB_SEED_URL             Optional. Defaults to http://127.0.0.1:8090
  PB_SEED_EMAIL           Preferred superuser email
  PB_SEED_PASSWORD        Preferred superuser password
  PB_SEED_TOKEN           Preferred superuser impersonation token

Notes:
  - Seed data comes from pocketbase/seeds/demo-user.mts
  - This script reads .env first and .env.local as a compatibility fallback
  - Credentials fall back in this order: PB_SEED_* -> PB_TYPEGEN_* -> PB_ADMIN_*
`)
  process.exit(0)
}

loadEnv(rootDir)

const firstEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]
    if (value) {
      return value
    }
  }

  return undefined
}

const pbUrl = firstEnv('PB_SEED_URL', 'PB_TYPEGEN_URL') || 'http://127.0.0.1:8090'
const superuserEmail = firstEnv('PB_SEED_EMAIL', 'PB_TYPEGEN_EMAIL', 'PB_ADMIN_EMAIL')
const superuserPassword = firstEnv('PB_SEED_PASSWORD', 'PB_TYPEGEN_PASSWORD', 'PB_ADMIN_PASSWORD')
const superuserToken = firstEnv('PB_SEED_TOKEN', 'PB_TYPEGEN_TOKEN')

const usingCompatFallback = (
  (!process.env.PB_SEED_URL && process.env.PB_TYPEGEN_URL) ||
  (!process.env.PB_SEED_URL && process.env.PB_TYPEGEN_URL) ||
  (!process.env.PB_SEED_EMAIL && process.env.PB_TYPEGEN_EMAIL) ||
  (!process.env.PB_SEED_EMAIL && !process.env.PB_TYPEGEN_EMAIL && process.env.PB_ADMIN_EMAIL) ||
  (!process.env.PB_SEED_PASSWORD && process.env.PB_TYPEGEN_PASSWORD) ||
  (!process.env.PB_SEED_PASSWORD && !process.env.PB_TYPEGEN_PASSWORD && process.env.PB_ADMIN_PASSWORD) ||
  (!process.env.PB_SEED_TOKEN && process.env.PB_TYPEGEN_TOKEN)
)

if (usingCompatFallback) {
  console.warn('Using fallback credentials for seed. Preferred order is PB_SEED_* -> PB_TYPEGEN_* -> PB_ADMIN_*.')
}

if (!superuserToken && (!superuserEmail || !superuserPassword)) {
  console.error('Missing seed credentials.')
  console.error('Set PB_SEED_TOKEN or PB_SEED_EMAIL/PB_SEED_PASSWORD in .env, or provide PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD.')
  process.exit(1)
}

const pb = new PocketBase(pbUrl)
pb.autoCancellation(false)

const hasStatus = (error: unknown, status: number) => {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === status
}

const hasCauseCode = (error: unknown, code: string) => {
  if (typeof error !== 'object' || error === null || !('cause' in error)) {
    return false
  }

  const cause = error.cause
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === code
}

const authenticateSuperuser = async () => {
  if (superuserToken) {
    pb.authStore.save(superuserToken)
    try {
      await pb.collection('_superusers').authRefresh()
      return
    } catch {
      throw new Error('PB_SEED_TOKEN is invalid or expired.')
    }
  }

  try {
    await pb.collection('_superusers').authWithPassword(superuserEmail!, superuserPassword!)
  } catch (error) {
    if (hasStatus(error, 400)) {
      throw new Error('Failed to authenticate superuser. Check PB_SEED_EMAIL/PB_SEED_PASSWORD.')
    }
    throw error
  }
}

const ensureDemoUser = async (): Promise<SeedRecord> => {
  const existing = await pb
    .collection('users')
    .getFirstListItem<SeedRecord>(`email="${demoUserSeed.email}"`)
    .catch(() => null)

  if (existing) {
    return existing
  }

  return pb.collection('users').create<SeedRecord>({
    email: demoUserSeed.email,
    password: demoUserSeed.password,
    passwordConfirm: demoUserSeed.password,
    name: demoUserSeed.name,
    theme: demoUserSeed.theme,
  })
}

const main = async () => {
  console.log(`Seeding PocketBase at ${pbUrl}`)
  await authenticateSuperuser()
  const demoUser = await ensureDemoUser()
  console.log(`PocketBase seed completed for ${demoUser.email}`)
}

main().catch((error: unknown) => {
  console.error('PocketBase seed failed.')
  if (hasCauseCode(error, 'ECONNREFUSED') || hasCauseCode(error, 'EPERM')) {
    console.error(`Cannot connect to PocketBase at ${pbUrl}. Make sure PocketBase is running and reachable.`)
  } else if (error instanceof Error) {
    console.error(error.message)
  } else {
    console.error(error)
  }
  process.exit(1)
})

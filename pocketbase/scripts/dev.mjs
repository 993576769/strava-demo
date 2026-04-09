import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const pocketbaseDir = path.resolve(repoRoot, 'pocketbase')
const migrationsDir = path.resolve(pocketbaseDir, 'pb_migrations')
const dataDir = path.resolve(repoRoot, 'pb_data')

const loadEnvFile = (filename) => {
  const filepath = path.join(repoRoot, filename)
  if (!fs.existsSync(filepath)) {
    return
  }

  const content = fs.readFileSync(filepath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separator = line.indexOf('=')
    if (separator === -1) {
      continue
    }

    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

loadEnvFile('.env')
loadEnvFile('.env.local')

const canExecute = async (target) => {
  try {
    await access(target, constants.X_OK)
    return true
  } catch {
    return false
  }
}

const resolveExecutable = async () => {
  const envExecutable = process.env.PB_EXECUTABLE
  if (envExecutable) return envExecutable

  const localBinary = path.resolve(pocketbaseDir, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase')
  if (await canExecute(localBinary)) return localBinary

  return 'pocketbase'
}

const executable = await resolveExecutable()
const adminEmail = process.env.PB_ADMIN_EMAIL
const adminPassword = process.env.PB_ADMIN_PASSWORD

const sharedFlags = [
  '--dir', dataDir,
  '--migrationsDir', migrationsDir,
]

const runPocketBaseCommand = (args) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, {
    cwd: pocketbaseDir,
    stdio: 'inherit',
    env: {
      ...process.env,
    },
  })

  child.on('error', reject)
  child.on('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`PocketBase command exited with signal ${signal}.`))
      return
    }

    if ((code ?? 0) !== 0) {
      reject(new Error(`PocketBase command exited with code ${code}.`))
      return
    }

    resolve()
  })
})

if (adminEmail && adminPassword) {
  try {
    await runPocketBaseCommand(['superuser', 'upsert', adminEmail, adminPassword, ...sharedFlags])
    console.log(`[dev:pb] ensured superuser ${adminEmail}`)
  } catch (error) {
    console.error('[dev:pb] Failed to upsert PocketBase superuser.')
    console.error('[dev:pb] Make sure your PocketBase binary supports `superuser upsert`.')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
} else {
  console.warn('[dev:pb] PB_ADMIN_EMAIL or PB_ADMIN_PASSWORD is not set; skipping superuser bootstrap.')
}

const args = ['serve', ...sharedFlags, ...process.argv.slice(2)]

const child = spawn(executable, args, {
  cwd: pocketbaseDir,
  stdio: 'inherit',
  env: {
    ...process.env,
  },
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

child.on('error', (error) => {
  console.error('[dev:pb] PocketBase failed to start.')
  console.error('[dev:pb] Set PB_EXECUTABLE or place the binary at ./pocketbase/pocketbase.')
  console.error(error.message)
  process.exit(1)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal)
    }
  })
}

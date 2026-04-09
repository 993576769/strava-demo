import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'

const repoRoot = process.cwd()
const pbBaseUrl = process.env.PB_SEED_URL || process.env.PB_TYPEGEN_URL || 'http://127.0.0.1:8090'
const healthUrl = new URL('/api/health', pbBaseUrl).toString()
const startupTimeoutMs = Number.parseInt(process.env.PB_DEV_STARTUP_TIMEOUT_MS || '60000', 10)

const processes = [
  {
    name: 'pocketbase',
    command: process.execPath,
    args: [path.resolve(repoRoot, 'pocketbase/scripts/dev.mjs')],
    color: '\x1b[36m',
  },
  {
    name: 'frontend',
    command: 'pnpm',
    args: ['--dir', 'frontend', 'dev'],
    color: '\x1b[35m',
  },
]

let shuttingDown = false
let exitCode = 0

const formatPrefix = (name, color = '\x1b[36m') => `${color}[${name}]\x1b[0m`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForPocketBase = async () => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < startupTimeoutMs) {
    try {
      const response = await fetch(healthUrl)
      if (response.ok) {
        return
      }
    } catch {
      // Keep polling until timeout.
    }

    await sleep(1000)
  }

  throw new Error(`PocketBase did not become ready within ${startupTimeoutMs}ms (${healthUrl}).`)
}

const runSeed = () => new Promise((resolve, reject) => {
  const prefix = formatPrefix('seed', '\x1b[33m')
  const child = spawn('pnpm', ['run', 'seed:pocketbase'], {
    cwd: repoRoot,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  })

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`${prefix} ${chunk}`)
  })

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`${prefix} ${chunk}`)
  })

  child.on('error', (error) => {
    reject(error)
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`Seed process exited with signal ${signal}.`))
      return
    }

    if ((code ?? 0) !== 0) {
      reject(new Error(`Seed process exited with code ${code}.`))
      return
    }

    resolve()
  })
})

const children = processes.map(({ name, command, args, color }) => {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  })

  const prefix = `${color}[${name}]\x1b[0m`

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`${prefix} ${chunk}`)
  })

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`${prefix} ${chunk}`)
  })

  child.on('exit', (code, signal) => {
    if (shuttingDown) return

    shuttingDown = true
    exitCode = code ?? 0
    for (const sibling of children) {
      if (sibling !== child && !sibling.killed) {
        sibling.kill('SIGTERM')
      }
    }

    if (signal) {
      process.kill(process.pid, signal)
      return
    }

    process.exit(exitCode)
  })

  child.on('error', (error) => {
    if (shuttingDown) return

    shuttingDown = true
    exitCode = 1
    console.error(`${prefix} failed to start: ${error.message}`)
    for (const sibling of children) {
      if (sibling !== child && !sibling.killed) {
        sibling.kill('SIGTERM')
      }
    }
    process.exit(1)
  })

  return child
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return
    shuttingDown = true
    for (const child of children) {
      if (!child.killed) {
        child.kill(signal)
      }
    }
  })
}

try {
  await waitForPocketBase()
  await runSeed()
} catch (error) {
  if (!shuttingDown) {
    shuttingDown = true
    exitCode = 1
    const prefix = formatPrefix('seed', '\x1b[33m')
    console.error(`${prefix} ${error instanceof Error ? error.message : String(error)}`)
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGTERM')
      }
    }
    process.exit(exitCode)
  }
}

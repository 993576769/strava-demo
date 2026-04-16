import path from 'node:path'
import process from 'node:process'
import { execFileSync, spawn } from 'node:child_process'

const repoRoot = process.cwd()
const apiBaseUrl = process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || '8090'}`
const healthUrl = new URL('/api/health', apiBaseUrl).toString()
const startupTimeoutMs = Number.parseInt(process.env.API_DEV_STARTUP_TIMEOUT_MS || '60000', 10)
const portsToClean = [
  Number.parseInt(process.env.PORT || '8090', 10),
  Number.parseInt(process.env.VITE_DEV_PORT || '5173', 10),
].filter(port => Number.isFinite(port))

const bootstrapProcesses = [
  {
    name: 'postgres',
    command: 'docker',
    args: ['compose', '-f', path.resolve(repoRoot, 'docker-compose.dev.yml'), 'up', '-d', 'postgres'],
    color: '\x1b[34m',
  },
]

const immediateProcesses = [
  {
    name: 'server',
    command: 'bun',
    args: ['--watch', '--no-clear-screen', path.resolve(repoRoot, 'server/src/index.ts')],
    color: '\x1b[36m',
  },
  {
    name: 'frontend',
    command: 'bun',
    args: ['run', 'dev'],
    color: '\x1b[35m',
  },
]

const auxiliaryProcesses = []

let shuttingDown = false
let exitCode = 0

const formatPrefix = (name, color = '\x1b[36m') => `${color}[${name}]\x1b[0m`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const children = []

const findListeningPids = (port) => {
  try {
    const output = execFileSync('lsof', ['-tiTCP:' + String(port), '-sTCP:LISTEN'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    return output
      .split('\n')
      .map(value => Number.parseInt(value.trim(), 10))
      .filter(pid => Number.isInteger(pid) && pid > 0 && pid !== process.pid)
  } catch {
    return []
  }
}

const terminatePid = async (pid, signal = 'SIGTERM') => {
  try {
    process.kill(pid, signal)
  } catch {
    return
  }

  const startedAt = Date.now()
  while (Date.now() - startedAt < 4000) {
    try {
      process.kill(pid, 0)
      await sleep(150)
    } catch {
      return
    }
  }

  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // noop
  }
}

const cleanupPorts = async () => {
  for (const port of portsToClean) {
    const pids = findListeningPids(port)
    if (!pids.length) {
      continue
    }

    const prefix = formatPrefix('cleanup', '\x1b[33m')
    process.stdout.write(`${prefix} freeing port ${port} from PID ${pids.join(', ')}\n`)
    for (const pid of pids) {
      await terminatePid(pid)
    }
  }
}

const runBootstrapProcess = ({ name, command, args, color }) => {
  return new Promise((resolve, reject) => {
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
      if (signal) {
        reject(new Error(`${name} exited with signal ${signal}`))
        return
      }

      if ((code ?? 1) !== 0) {
        reject(new Error(`${name} exited with code ${code ?? 1}`))
        return
      }

      resolve(undefined)
    })

    child.on('error', (error) => {
      reject(error)
    })
  })
}

const waitForApi = async () => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < startupTimeoutMs) {
    try {
      const response = await fetch(healthUrl)
      if (response.ok) {
        return
      }
    } catch {
      // keep polling
    }

    await sleep(1000)
  }

  throw new Error(`API server did not become ready within ${startupTimeoutMs}ms (${healthUrl}).`)
}

const startChild = ({ name, command, args, color }) => {
  const child = spawn(command, args, {
    cwd: name === 'frontend' ? path.resolve(repoRoot, 'frontend') : repoRoot,
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

  children.push(child)
}

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
  await cleanupPorts()

  for (const definition of bootstrapProcesses) {
    await runBootstrapProcess(definition)
  }

  for (const definition of immediateProcesses) {
    startChild(definition)
  }

  await waitForApi()
  for (const definition of auxiliaryProcesses) {
    if (shuttingDown) break
    startChild(definition)
  }
} catch (error) {
  if (!shuttingDown) {
    shuttingDown = true
    exitCode = 1
    const prefix = formatPrefix('api', '\x1b[33m')
    console.error(`${prefix} ${error instanceof Error ? error.message : String(error)}`)
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGTERM')
      }
    }
    process.exit(exitCode)
  }
}

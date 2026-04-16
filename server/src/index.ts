import process from 'node:process'
import { serve } from '@hono/node-server'
import { createApp } from './app/create-app'
import { ensureArtPromptTemplatesSeeded } from './db/client'
import { env } from './lib/env'
import { startJobRunner } from './modules/jobs/runner'

const startupRetryDelayMs = 250
const startupRetryTimeoutMs = 5000
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const startServer = (fetchHandler: ReturnType<typeof createApp>['fetch']) => {
  return serve({
    fetch: fetchHandler,
    port: env.PORT,
  }, (info) => {
    process.stdout.write(`API server listening on http://127.0.0.1:${info.port}\n`)
  })
}

const startServerWithRetry = async (fetchHandler: ReturnType<typeof createApp>['fetch']) => {
  const startedAt = Date.now()

  while (true) {
    try {
      return startServer(fetchHandler)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const isPortConflict = /port\s+\d+\s+in use|EADDRINUSE/i.test(message)
      if (!isPortConflict || Date.now() - startedAt >= startupRetryTimeoutMs) {
        throw error
      }

      process.stdout.write(`Port ${env.PORT} still busy, retrying...\n`)
      await sleep(startupRetryDelayMs)
    }
  }
}

const main = async () => {
  await ensureArtPromptTemplatesSeeded()

  const app = createApp()
  const stopRunner = startJobRunner()
  const server: ReturnType<typeof serve> = await startServerWithRetry(app.fetch)
  let shuttingDown = false

  const shutdown = () => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    stopRunner()
    const nodeServer = server as ReturnType<typeof serve> & {
      closeAllConnections?: () => void
    }
    nodeServer.closeAllConnections?.()
    server?.close(() => {
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

void main()

import os from 'node:os'
import process from 'node:process'
import PocketBase from 'pocketbase'
import { loadEnv } from './load-env.mts'

type ClaimedJobStatus = 'processing'

type ClaimedJob = {
  id: string
  status: ClaimedJobStatus
  worker_ref?: string
}

type ClaimSource = 'pending' | 'stale_processing'

type ClaimJobResponse = {
  claimed: boolean
  job?: ClaimedJob | null
  claimSource?: ClaimSource
}

type ProcessJobResponse = {
  result?: {
    id?: string
  } | null
}

type RecoverReason = 'retryable_error' | 'transport_failure'

type RecoverJobResponse = {
  recovered: boolean
  reason: RecoverReason | 'skipped'
  scheduledRetryAt?: string
}

type WorkerTaskAdapter<TClaim extends { id: string }> = {
  claimNext: () => Promise<{ claimed: false } | { claimed: true; job: TClaim; claimSource: ClaimSource }>
  execute: (job: TClaim) => Promise<{ resultId: string }>
  recover: (job: TClaim, error: unknown) => Promise<RecoverJobResponse>
}

type ErrorWithMessage = {
  message: string
}

type ErrorWithResponse = {
  response: {
    message?: unknown
  }
}

type ErrorWithOriginalError = {
  originalError: {
    message?: unknown
  }
}

const repoRoot = process.cwd()

for (const key of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY']) {
  delete process.env[key]
}

loadEnv(repoRoot)

const parseIntegerEnv = (key: string, fallback: number, minimum?: number) => {
  const value = Number.parseInt(process.env[key] || String(fallback), 10)
  if (Number.isNaN(value)) {
    return fallback
  }

  if (typeof minimum === 'number') {
    return Math.max(minimum, value)
  }

  return value
}

const hasProperty = <K extends PropertyKey>(
  value: unknown,
  key: K,
): value is Record<K, unknown> => {
  return typeof value === 'object' && value !== null && key in value
}

const hasStringMessage = (value: unknown): value is ErrorWithMessage => {
  return hasProperty(value, 'message') && typeof value.message === 'string'
}

const hasResponseMessage = (value: unknown): value is ErrorWithResponse => {
  return hasProperty(value, 'response')
    && typeof value.response === 'object'
    && value.response !== null
}

const hasOriginalErrorMessage = (value: unknown): value is ErrorWithOriginalError => {
  return hasProperty(value, 'originalError')
    && typeof value.originalError === 'object'
    && value.originalError !== null
}

const pbBaseUrl = process.env.PB_SEED_URL || process.env.PB_TYPEGEN_URL || 'http://127.0.0.1:8090'
const healthUrl = new URL('/api/health', pbBaseUrl).toString()
const workerSecret = process.env.ART_WORKER_SECRET || 'local-art-worker-secret'
const pollIntervalMs = parseIntegerEnv('ART_WORKER_POLL_INTERVAL_MS', 3000)
const failureBackoffMs = parseIntegerEnv('ART_WORKER_FAILURE_BACKOFF_MS', 5000)
const idleHeartbeatMs = parseIntegerEnv('ART_WORKER_IDLE_HEARTBEAT_MS', 30000)
const retryDelayMs = parseIntegerEnv('ART_WORKER_RETRY_DELAY_MS', 120000)
const rateLimitRetryDelayMs = parseIntegerEnv('ART_WORKER_RATE_LIMIT_RETRY_DELAY_MS', 300000)
const maxConcurrentJobs = parseIntegerEnv('ART_WORKER_MAX_CONCURRENT_JOBS', 1, 1)
const retryableJimengCodes = new Set(['50511', '50519', '50429', '50430'])
const rateLimitedJimengCodes = new Set(['50429', '50430'])
const workerRef = `art-worker:${os.hostname() || process.pid}:${Date.now()}`

const pb = new PocketBase(pbBaseUrl)
let stopping = false
let hasLoggedWaiting = false
let lastIdleHeartbeatAt = 0
let activeJobId = ''

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isPocketBaseReady = async () => {
  try {
    const response = await fetch(healthUrl)
    return response.ok
  } catch {
    return false
  }
}

const claimArtJob = async () => {
  return pb.send<ClaimJobResponse>('/api/internal/art/jobs/claim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      secret: workerSecret,
      workerRef,
      now: new Date().toISOString(),
    },
  })
}

const processArtJob = async (jobId: string) => {
  return pb.send<ProcessJobResponse>(`/api/internal/art/jobs/${jobId}/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      secret: workerSecret,
      workerRef,
    },
  })
}

const extractJimengErrorCode = (value: unknown) => {
  const match = String(value || '').match(/JIMENG_ERROR_CODE=(\d+)/)
  return match ? match[1] : ''
}

const isRetryableError = (error: unknown) => {
  if (hasStringMessage(error) && retryableJimengCodes.has(extractJimengErrorCode(error.message))) {
    return true
  }

  if (hasResponseMessage(error) && retryableJimengCodes.has(extractJimengErrorCode(error.response.message))) {
    return true
  }

  return false
}

const getRetryDelayForError = (error: unknown) => {
  let code = ''

  if (hasStringMessage(error)) {
    code = extractJimengErrorCode(error.message)
  }

  if (rateLimitedJimengCodes.has(code)) {
    return rateLimitRetryDelayMs
  }

  return retryDelayMs
}

const recoverArtJob = async (jobId: string, reason: RecoverReason, retryAt?: string) => {
  return pb.send<RecoverJobResponse>(`/api/internal/art/jobs/${jobId}/recover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      secret: workerSecret,
      workerRef,
      reason,
      retryAt,
    },
  })
}

const log = (message: string) => {
  process.stdout.write(`${message}\n`)
}

const formatError = (error: unknown) => {
  if (typeof error !== 'object' || error === null) {
    return String(error)
  }

  const message = hasStringMessage(error) ? error.message : String(error)
  const response = hasResponseMessage(error)
    ? JSON.stringify(error.response)
    : ''
  const originalError = hasOriginalErrorMessage(error) && typeof error.originalError.message === 'string'
    ? error.originalError.message
    : ''

  return [message, originalError, response].filter(Boolean).join(' | ')
}

const artTaskAdapter: WorkerTaskAdapter<ClaimedJob> = {
  async claimNext() {
    const response = await claimArtJob()
    if (!response.claimed || !response.job) {
      return { claimed: false }
    }

    return {
      claimed: true,
      job: response.job,
      claimSource: response.claimSource || 'pending',
    }
  },

  async execute(job) {
    const response = await processArtJob(job.id)
    return {
      resultId: response.result?.id || '',
    }
  },

  async recover(job, error) {
    if (isRetryableError(error)) {
      const delayMs = getRetryDelayForError(error)
      return recoverArtJob(job.id, 'retryable_error', new Date(Date.now() + delayMs).toISOString())
    }

    return recoverArtJob(job.id, 'transport_failure')
  },
}

const runLoop = async (adapter: WorkerTaskAdapter<ClaimedJob>) => {
  log(`started; polling ${pbBaseUrl} every ${pollIntervalMs}ms as ${workerRef} with max concurrency ${maxConcurrentJobs}`)

  while (!stopping) {
    try {
      const ready = await isPocketBaseReady()
      if (!ready) {
        if (!hasLoggedWaiting) {
          log(`waiting for PocketBase at ${healthUrl}`)
          hasLoggedWaiting = true
        }
        await sleep(pollIntervalMs)
        continue
      }

      hasLoggedWaiting = false
      const claim = await adapter.claimNext()

      if (!claim.claimed) {
        if (Date.now() - lastIdleHeartbeatAt >= idleHeartbeatMs) {
          log('idle; waiting for queued jobs')
          lastIdleHeartbeatAt = Date.now()
        }
        await sleep(pollIntervalMs)
        continue
      }

      lastIdleHeartbeatAt = 0
      activeJobId = claim.job.id
      if (claim.claimSource === 'stale_processing') {
        log(`claimed stale processing job ${claim.job.id}`)
      }
      else {
        log(`claimed pending job ${claim.job.id}`)
      }

      const response = await adapter.execute(claim.job)
      log(`finished ${claim.job.id}${response.resultId ? ` -> ${response.resultId}` : ''}`)
      activeJobId = ''
    } catch (error) {
      if (activeJobId) {
        try {
          const recoverResult = await adapter.recover({
            id: activeJobId,
            status: 'processing',
            worker_ref: workerRef,
          }, error)

          if (recoverResult.recovered && recoverResult.reason === 'retryable_error') {
            log(`scheduled retry for ${activeJobId}${recoverResult.scheduledRetryAt ? ` at ${recoverResult.scheduledRetryAt}` : ''}`)
          }
          else if (recoverResult.recovered && recoverResult.reason === 'transport_failure') {
            log(`recovered ${activeJobId} after transport failure`)
          }
        } catch (requeueError) {
          log(`failed to recover ${activeJobId}: ${formatError(requeueError)}`)
        }
      }

      log(formatError(error))
      activeJobId = ''
      await sleep(failureBackoffMs)
    }
  }

  log(activeJobId ? `shutdown requested; waiting for active job ${activeJobId}` : 'shutdown requested; no active job')
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log(`received ${signal}; stopping new claims`)
    stopping = true
  })
}

await runLoop(artTaskAdapter)
log('worker stopped')

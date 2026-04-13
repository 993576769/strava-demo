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
const recoverRetryCount = parseIntegerEnv('ART_WORKER_RECOVER_RETRY_COUNT', 5, 1)
const recoverRetryWaitMs = parseIntegerEnv('ART_WORKER_RECOVER_RETRY_WAIT_MS', 2000, 250)
const maxConcurrentJobs = parseIntegerEnv('ART_WORKER_MAX_CONCURRENT_JOBS', 1, 1)
const retryableProviderCodes = new Set(['50511', '50519', '50429', '50430', '408', '409', '425', '429', '500', '502', '503', '504'])
const rateLimitedProviderCodes = new Set(['429', '50429', '50430'])
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

const extractProviderErrorCode = (value: unknown) => {
  const match = String(value || '').match(/(?:JIMENG|DOUBAO)_ERROR_CODE=(\d+)/)
  return match ? match[1] : ''
}

const isRetryableError = (error: unknown) => {
  if (hasStringMessage(error) && retryableProviderCodes.has(extractProviderErrorCode(error.message))) {
    return true
  }

  if (hasResponseMessage(error) && retryableProviderCodes.has(extractProviderErrorCode(error.response.message))) {
    return true
  }

  return false
}

const getRetryDelayForError = (error: unknown) => {
  let code = ''

  if (hasStringMessage(error)) {
    code = extractProviderErrorCode(error.message)
  }

  if (rateLimitedProviderCodes.has(code)) {
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

const waitForPocketBaseRecovery = async () => {
  for (let attempt = 1; attempt <= recoverRetryCount; attempt += 1) {
    const ready = await isPocketBaseReady()
    if (ready) {
      return {
        recovered: true,
        attempts: attempt,
      }
    }

    if (attempt < recoverRetryCount) {
      await sleep(recoverRetryWaitMs)
    }
  }

  return {
    recovered: false,
    attempts: recoverRetryCount,
  }
}

const describeRecoveryPlan = (error: unknown) => {
  if (isRetryableError(error)) {
    const delayMs = getRetryDelayForError(error)
    return {
      reason: 'retryable_error' as const,
      retryAt: new Date(Date.now() + delayMs).toISOString(),
      detail: `retryable provider error; scheduling retry in ${delayMs}ms`,
    }
  }

  return {
    reason: 'transport_failure' as const,
    retryAt: '',
    detail: 'non-retryable or transport-level failure; attempting immediate recovery to pending',
  }
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
    const recoveryPlan = describeRecoveryPlan(error)

    if (recoveryPlan.reason === 'retryable_error') {
      return recoverArtJob(job.id, recoveryPlan.reason, recoveryPlan.retryAt)
    }

    return recoverArtJob(job.id, recoveryPlan.reason)
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
        const recoveryPlan = describeRecoveryPlan(error)
        log(`job ${activeJobId} failed: ${formatError(error)}`)
        log(`job ${activeJobId} recovery plan: ${recoveryPlan.detail}${recoveryPlan.retryAt ? ` (retryAt=${recoveryPlan.retryAt})` : ''}`)

        try {
          const recoverResult = await adapter.recover({
            id: activeJobId,
            status: 'processing',
            worker_ref: workerRef,
          }, error)

          if (recoverResult.recovered && recoverResult.reason === 'retryable_error') {
            log(`job ${activeJobId} recovered: scheduled retry${recoverResult.scheduledRetryAt ? ` at ${recoverResult.scheduledRetryAt}` : ''}`)
          }
          else if (recoverResult.recovered && recoverResult.reason === 'transport_failure') {
            log(`job ${activeJobId} recovered: moved back to pending after transport failure`)
          }
          else {
            log(`job ${activeJobId} recovery skipped by PocketBase`)
          }
        } catch (requeueError) {
          log(`job ${activeJobId} recovery failed: ${formatError(requeueError)}`)
          const pocketBaseRecovery = await waitForPocketBaseRecovery()

          if (pocketBaseRecovery.recovered) {
            log(`job ${activeJobId} retrying recovery after PocketBase became healthy on attempt ${pocketBaseRecovery.attempts}`)

            try {
              const retryRecoverResult = await adapter.recover({
                id: activeJobId,
                status: 'processing',
                worker_ref: workerRef,
              }, error)

              if (retryRecoverResult.recovered && retryRecoverResult.reason === 'retryable_error') {
                log(`job ${activeJobId} recovered after retry: scheduled retry${retryRecoverResult.scheduledRetryAt ? ` at ${retryRecoverResult.scheduledRetryAt}` : ''}`)
              }
              else if (retryRecoverResult.recovered && retryRecoverResult.reason === 'transport_failure') {
                log(`job ${activeJobId} recovered after retry: moved back to pending after transport failure`)
              }
              else {
                log(`job ${activeJobId} recovery retry skipped by PocketBase`)
              }
            } catch (retryError) {
              log(`job ${activeJobId} recovery retry failed: ${formatError(retryError)}`)
            }
          }
          else {
            log(`job ${activeJobId} recovery retry skipped: PocketBase stayed unhealthy after ${pocketBaseRecovery.attempts} attempts`)
          }
        }
      }
      else {
        log(`worker loop error without active job: ${formatError(error)}`)
      }
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

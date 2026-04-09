import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import PocketBase from 'pocketbase'

const repoRoot = process.cwd()

for (const key of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY']) {
  delete process.env[key]
}

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

const pbBaseUrl = process.env.PB_SEED_URL || process.env.PB_TYPEGEN_URL || 'http://127.0.0.1:8090'
const healthUrl = new URL('/api/health', pbBaseUrl).toString()
const workerSecret = process.env.ART_WORKER_SECRET || 'local-art-worker-secret'
const pollIntervalMs = Number.parseInt(process.env.ART_WORKER_POLL_INTERVAL_MS || '3000', 10)
const failureBackoffMs = Number.parseInt(process.env.ART_WORKER_FAILURE_BACKOFF_MS || '5000', 10)
const idleHeartbeatMs = Number.parseInt(process.env.ART_WORKER_IDLE_HEARTBEAT_MS || '30000', 10)
const staleProcessingMs = Number.parseInt(process.env.ART_WORKER_STALE_PROCESSING_MS || '120000', 10)
const retryDelayMs = Number.parseInt(process.env.ART_WORKER_RETRY_DELAY_MS || '120000', 10)
const rateLimitRetryDelayMs = Number.parseInt(process.env.ART_WORKER_RATE_LIMIT_RETRY_DELAY_MS || '300000', 10)
const maxConcurrentJobs = Math.max(1, Number.parseInt(process.env.ART_WORKER_MAX_CONCURRENT_JOBS || '1', 10))
const adminEmail = process.env.PB_ADMIN_EMAIL || ''
const adminPassword = process.env.PB_ADMIN_PASSWORD || ''
const retryableJimengCodes = new Set(['50511', '50519', '50429', '50430'])
const rateLimitedJimengCodes = new Set(['50429', '50430'])

const pb = new PocketBase(pbBaseUrl)
let stopping = false
let hasLoggedWaiting = false
let lastIdleHeartbeatAt = 0

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isPocketBaseReady = async () => {
  try {
    const response = await fetch(healthUrl)
    return response.ok
  } catch {
    return false
  }
}

const ensureAdminAuth = async () => {
  if (pb.authStore.isValid) {
    return
  }

  if (!adminEmail || !adminPassword) {
    throw new Error('Missing PB_ADMIN_EMAIL or PB_ADMIN_PASSWORD for art worker.')
  }

  await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword)
}

const getNextPendingJob = async () => {
  const nowIso = new Date().toISOString()
  const result = await pb.collection('art_jobs').getList(1, 1, {
    filter: `status = "pending" && route_base_image_url != "" && (queued_at = "" || queued_at <= "${nowIso}")`,
    sort: '+queued_at',
  })

  return result.items[0] ?? null
}

const getNextStaleProcessingJob = async () => {
  const staleBefore = new Date(Date.now() - staleProcessingMs).toISOString()
  const result = await pb.collection('art_jobs').getList(1, 1, {
    filter: `status = "processing" && route_base_image_url != "" && started_at != "" && started_at <= "${staleBefore}"`,
    sort: '+started_at',
  })

  return result.items[0] ?? null
}

const getActiveProcessingJobs = async () => {
  const staleBefore = new Date(Date.now() - staleProcessingMs).toISOString()
  const result = await pb.collection('art_jobs').getList(1, maxConcurrentJobs, {
    filter: `status = "processing" && route_base_image_url != "" && started_at != "" && started_at > "${staleBefore}"`,
    sort: '+started_at',
  })

  return result.items
}

const processJob = async (jobId) => {
  return pb.send(`/api/internal/art/jobs/${jobId}/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      secret: workerSecret,
    },
  })
}

const hasExistingResult = async (jobId) => {
  try {
    await pb.collection('art_results').getFirstListItem(`job = "${jobId}"`, {
      requestKey: null,
    })
    return true
  } catch {
    return false
  }
}

const requeueJobIfStuck = async (jobId) => {
  const job = await pb.collection('art_jobs').getOne(jobId, {
    requestKey: null,
  })

  if (job.status !== 'processing' || job.finished_at) {
    return false
  }

  if (await hasExistingResult(jobId)) {
    return false
  }

  await pb.collection('art_jobs').update(jobId, {
    status: 'pending',
    queued_at: new Date().toISOString(),
    started_at: '',
    finished_at: '',
    worker_ref: '',
    error_code: '',
    error_message: '',
  })

  return true
}

const extractJimengErrorCode = (value) => {
  const match = String(value || '').match(/JIMENG_ERROR_CODE=(\d+)/)
  return match ? match[1] : ''
}

const isRetryableError = (error, job) => {
  if (job && retryableJimengCodes.has(extractJimengErrorCode(job.error_message))) {
    return true
  }

  if (!error || typeof error !== 'object') {
    return false
  }

  if ('message' in error && retryableJimengCodes.has(extractJimengErrorCode(error.message))) {
    return true
  }

  if ('response' in error && error.response && typeof error.response === 'object') {
    if ('message' in error.response && retryableJimengCodes.has(extractJimengErrorCode(error.response.message))) {
      return true
    }
  }

  return false
}

const scheduleRetry = async (jobId, delayMs) => {
  const job = await pb.collection('art_jobs').getOne(jobId, {
    requestKey: null,
  })

  if (await hasExistingResult(jobId)) {
    return false
  }

  if (job.status !== 'failed' && job.status !== 'processing') {
    return false
  }

  await pb.collection('art_jobs').update(jobId, {
    status: 'pending',
    queued_at: new Date(Date.now() + delayMs).toISOString(),
    started_at: '',
    finished_at: '',
    worker_ref: '',
    error_code: '',
    error_message: '',
  })

  return true
}

const getRetryDelayForJob = (job, error) => {
  var code = ''

  if (job && job.error_message) {
    code = extractJimengErrorCode(job.error_message)
  }

  if (!code && error && typeof error === 'object' && 'message' in error) {
    code = extractJimengErrorCode(error.message)
  }

  if (rateLimitedJimengCodes.has(code)) {
    return rateLimitRetryDelayMs
  }

  return retryDelayMs
}

const log = (message) => {
  process.stdout.write(`${message}\n`)
}

const formatError = (error) => {
  if (!error || typeof error !== 'object') {
    return String(error)
  }

  const message = typeof error.message === 'string' ? error.message : String(error)
  const response = 'response' in error && error.response && typeof error.response === 'object'
    ? JSON.stringify(error.response)
    : ''
  const originalError = 'originalError' in error && error.originalError && typeof error.originalError === 'object' && 'message' in error.originalError
    ? String(error.originalError.message || '')
    : ''

  return [message, originalError, response].filter(Boolean).join(' | ')
}

const loop = async () => {
  log(`started; polling ${pbBaseUrl} every ${pollIntervalMs}ms with max concurrency ${maxConcurrentJobs}`)

  while (!stopping) {
    let claimedJobId = ''

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
      await ensureAdminAuth()
      const staleProcessingJob = await getNextStaleProcessingJob()
      const activeProcessingJobs = staleProcessingJob ? [] : await getActiveProcessingJobs()

      if (!staleProcessingJob && activeProcessingJobs.length >= maxConcurrentJobs) {
        if (Date.now() - lastIdleHeartbeatAt >= idleHeartbeatMs) {
          log(`at concurrency limit (${activeProcessingJobs.length}/${maxConcurrentJobs}); waiting for in-flight jobs`)
          lastIdleHeartbeatAt = Date.now()
        }
        await sleep(pollIntervalMs)
        continue
      }

      const pendingJob = staleProcessingJob ? null : await getNextPendingJob()
      const job = staleProcessingJob || pendingJob

      if (!job) {
        if (Date.now() - lastIdleHeartbeatAt >= idleHeartbeatMs) {
          log('idle; waiting for queued jobs')
          lastIdleHeartbeatAt = Date.now()
        }
        await sleep(pollIntervalMs)
        continue
      }

      lastIdleHeartbeatAt = 0
      if (job.status === 'processing') {
        log(`reclaiming stale processing job ${job.id}`)
      }
      claimedJobId = job.id
      log(`processing ${job.id}`)
      const response = await processJob(job.id)
      const resultId = response && typeof response === 'object' && 'result' in response && response.result && typeof response.result === 'object' && 'id' in response.result
        ? response.result.id
        : ''
      log(`finished ${job.id}${resultId ? ` -> ${resultId}` : ''}`)
    } catch (error) {
      if (claimedJobId) {
        try {
          const claimedJob = await pb.collection('art_jobs').getOne(claimedJobId, {
            requestKey: null,
          })

          if (isRetryableError(error, claimedJob)) {
            const delayMs = getRetryDelayForJob(claimedJob, error)
            const scheduled = await scheduleRetry(claimedJobId, delayMs)
            if (scheduled) {
              log(`requeued ${claimedJobId} after retryable Jimeng error; retrying in ${delayMs}ms`)
            }
          } else {
            const requeued = await requeueJobIfStuck(claimedJobId)
            if (requeued) {
              log(`requeued ${claimedJobId} after transport failure`)
            }
          }
        } catch (requeueError) {
          log(`failed to requeue ${claimedJobId}: ${formatError(requeueError)}`)
        }
      }

      log(formatError(error))
      pb.authStore.clear()
      await sleep(failureBackoffMs)
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true
  })
}

await loop()

import type {
  Activity,
  ActivityStream,
  ArtJob,
  ArtPromptTemplate,
  ArtResult,
  PaginatedResponse,
  StravaConnection,
  SyncEvent,
  User,
} from '@/types/api'

const storageKey = 'strava-art-access-token'

const getBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return String(import.meta.env.VITE_API_URL).replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
}

let accessToken = ''

const restoreAccessToken = () => {
  if (accessToken || typeof window === 'undefined') {
    return accessToken
  }

  accessToken = window.sessionStorage.getItem(storageKey) || ''
  return accessToken
}

export const setAccessToken = (token: string) => {
  accessToken = token
  if (typeof window !== 'undefined') {
    if (token) {
      window.sessionStorage.setItem(storageKey, token)
    }
    else {
      window.sessionStorage.removeItem(storageKey)
    }
  }
}

export const clearAccessToken = () => {
  setAccessToken('')
}

class ApiError extends Error {
  status: number
  code: string

  constructor(message: string, status = 500, code = 'API_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

type ApiRequestInit = Omit<RequestInit, 'body'> & {
  body?: BodyInit | Record<string, unknown> | null
}

const apiRequest = async <T>(path: string, init: ApiRequestInit = {}) => {
  const token = restoreAccessToken()
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const body = init.body && typeof init.body !== 'string' && !(init.body instanceof FormData) && !(init.body instanceof URLSearchParams) && !(init.body instanceof Blob)
    ? JSON.stringify(init.body)
    : init.body ?? null

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    body,
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new ApiError(payload?.message || 'Request failed', response.status, payload?.code || 'API_ERROR')
  }

  return payload as T
}

export const api = {
  auth: {
    getSession: () => apiRequest<{ user?: User, accessToken?: string }>('/api/auth/session'),
    startGitHub: (redirectTo?: string) => apiRequest<{ url: string }>('/api/auth/github/start', {
      method: 'POST',
      body: {
        redirectTo,
      },
    }),
    logout: () => apiRequest<{ success: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),
  },
  strava: {
    getStatus: () => apiRequest<{ connection?: StravaConnection | null }>('/api/integrations/strava/status'),
    connect: () => apiRequest<{ url: string }>('/api/integrations/strava/connect', { method: 'POST' }),
    sync: (mode: 'incremental' | 'history') => apiRequest<{ connection?: StravaConnection | null, stats?: Record<string, unknown> }>(
      mode === 'history' ? '/api/integrations/strava/sync-history' : '/api/integrations/strava/sync',
      {
        method: 'POST',
        body: { mode },
      },
    ),
    disconnect: () => apiRequest<{ success: boolean }>('/api/integrations/strava/disconnect', { method: 'POST' }),
  },
  activities: {
    list: (page: number, perPage: number, ids?: string[]) => {
      const params = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
      })
      if (ids?.length) {
        params.set('ids', ids.join(','))
      }
      return apiRequest<PaginatedResponse<Activity>>(`/api/activities?${params.toString()}`)
    },
    getOne: (id: string) => apiRequest<{ activity?: Activity }>(`/api/activities/${id}`),
    getStream: (id: string) => apiRequest<{ stream?: ActivityStream }>(`/api/activities/${id}/stream`),
  },
  art: {
    listJobs: (activityId: string, limit: number) => apiRequest<{ items: ArtJob[] }>(`/api/art/jobs?activityId=${encodeURIComponent(activityId)}&limit=${limit}`),
    createJob: (payload: { activityId: string, templateKey: string, renderOptions: Record<string, unknown> }) => apiRequest<{ job?: ArtJob, reused?: boolean }>('/api/art/jobs', {
      method: 'POST',
      body: payload,
    }),
    uploadRouteBase: (jobId: string, payload: { dataUrl: string, fileName: string }) => apiRequest<{ job?: ArtJob | null, routeBaseImageUrl?: string }>(`/api/art/jobs/${jobId}/route-base`, {
      method: 'POST',
      body: payload,
    }),
    queueJob: (jobId: string) => apiRequest<{ result?: ArtResult | null, queued?: boolean, reused?: boolean, provider?: string | null }>(`/api/art/jobs/${jobId}/render`, {
      method: 'POST',
    }),
    listResults: (activityId: string, page: number, perPage: number) => apiRequest<PaginatedResponse<ArtResult>>(`/api/art/results?activityId=${encodeURIComponent(activityId)}&page=${page}&perPage=${perPage}`),
    getResult: (id: string) => apiRequest<{ result?: ArtResult }>(`/api/art/results/${id}`),
    listPromptTemplates: (includeInactive: boolean) => apiRequest<{ items: ArtPromptTemplate[] }>(`/api/art/prompt-templates${includeInactive ? '?includeInactive=true' : ''}`),
    updatePromptTemplate: (id: string, payload: Partial<Pick<ArtPromptTemplate, 'prompt_template' | 'reference_image_url' | 'notes' | 'is_active'>>) => apiRequest<{ template?: ArtPromptTemplate }>(`/api/art/prompt-templates/${id}`, {
      method: 'PATCH',
      body: payload,
    }),
    uploadPromptReferenceImage: (id: string, payload: { dataUrl: string, fileName: string }) => apiRequest<{ template?: ArtPromptTemplate, referenceImageUrl?: string }>(`/api/art/admin/art-prompt-templates/${id}/reference-image`, {
      method: 'POST',
      body: payload,
    }),
    listHistoryJobs: (page: number, perPage: number) => apiRequest<PaginatedResponse<ArtJob>>(`/api/art/history/jobs?page=${page}&perPage=${perPage}`),
  },
  syncEvents: {
    list: (limit: number) => apiRequest<{ items: SyncEvent[] }>(`/api/sync-events?limit=${limit}`),
  },
}

export { ApiError }

export type Theme = 'light' | 'dark' | 'system'
export type StravaConnectionStatus = 'active' | 'expired' | 'revoked' | 'reauthorization_required'
export type ActivityVisibility = 'public' | 'followers_only' | 'only_me' | 'unknown'
export type ActivitySyncStatus = 'pending_detail' | 'ready' | 'partial' | 'failed'
export type ArtJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled'
export type ArtResultVisibility = 'private' | 'unlisted' | 'public'
export type SyncEventCategory = 'sync' | 'webhook' | 'connection'
export type SyncEventStatus = 'info' | 'success' | 'warning' | 'error'

export interface User {
  id: string
  email: string
  name: string
  avatar_url: string
  is_active: boolean
  is_admin: boolean
  created: string
  updated: string
}

export interface StravaConnection {
  id: string
  user: string
  provider: string
  strava_athlete_id: string
  strava_username: string
  scope_granted: string
  status: StravaConnectionStatus
  last_sync_at: string
  last_webhook_at: string
  last_error_code: string
  last_error_message: string
  created: string
  updated: string
}

export interface Activity {
  id: string
  user: string
  connection: string
  source: string
  source_activity_id: string
  name: string
  sport_type: string
  start_date: string
  timezone: string
  distance_meters: number
  moving_time_seconds: number
  elapsed_time_seconds: number
  elevation_gain_meters: number
  average_speed: number
  start_latlng: number[] | null
  end_latlng: number[] | null
  visibility: ActivityVisibility
  has_polyline: boolean
  has_streams: boolean
  is_generatable: boolean
  generatable_reason: string
  sync_status: ActivitySyncStatus
  synced_at: string
  raw_summary_json: Record<string, unknown> | null
  raw_detail_json: Record<string, unknown> | null
  created: string
  updated: string
}

export interface ActivityStream {
  id: string
  user: string
  activity: string
  stream_version: string
  point_count: number
  distance_stream_json: number[] | null
  latlng_stream_json: number[][] | null
  altitude_stream_json: number[] | null
  time_stream_json: number[] | null
  normalized_path_json: number[][] | null
  bbox_json: number[] | null
  sampling_strategy: string
  processed_at: string
  created: string
  updated: string
}

export interface ArtResult {
  id: string
  job: string
  user: string
  activity: string
  image_data_uri: string
  thumbnail_data_uri: string
  width: number
  height: number
  file_size: number
  mime_type: string
  style_preset: string
  title_snapshot: string
  subtitle_snapshot: string
  metadata_json: Record<string, unknown>
  visibility: ArtResultVisibility
  created: string
  updated: string
}

export interface ArtJob {
  id: string
  user: string
  activity: string
  stream: string
  status: ArtJobStatus
  style_preset: string
  prompt_snapshot: string
  render_options_json: Record<string, unknown>
  render_options_hash: string
  route_base_image_url: string
  attempt_count: number
  error_code: string
  error_message: string
  queued_at: string
  started_at: string
  finished_at: string
  worker_ref: string
  created: string
  updated: string
  result?: ArtResult | null
}

export interface ArtPromptTemplate {
  id: string
  provider: string
  template_key: string
  prompt_template: string
  reference_image_url: string
  notes: string
  is_active: boolean
  created: string
  updated: string
}

export interface SyncEvent {
  id: string
  user: string
  provider: string
  category: SyncEventCategory
  status: SyncEventStatus
  title: string
  message: string
  payload_json: Record<string, unknown> | null
  occurred_at: string
  created: string
}

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

export type FilterStatus = 'all' | 'active' | 'completed'

export const themeValues = ['light', 'dark', 'system'] as const satisfies readonly Theme[]
export const stravaConnectionStatusValues = ['active', 'expired', 'revoked', 'reauthorization_required'] as const satisfies readonly StravaConnectionStatus[]
export const activityVisibilityValues = ['public', 'followers_only', 'only_me', 'unknown'] as const satisfies readonly ActivityVisibility[]
export const activitySyncStatusValues = ['pending_detail', 'ready', 'partial', 'failed'] as const satisfies readonly ActivitySyncStatus[]
export const artJobStatusValues = ['pending', 'processing', 'succeeded', 'failed', 'canceled'] as const satisfies readonly ArtJobStatus[]
export const artResultVisibilityValues = ['private', 'unlisted', 'public'] as const satisfies readonly ArtResultVisibility[]
export const syncEventCategoryValues = ['sync', 'webhook', 'connection'] as const satisfies readonly SyncEventCategory[]
export const syncEventStatusValues = ['info', 'success', 'warning', 'error'] as const satisfies readonly SyncEventStatus[]
export const filterStatusValues = ['all', 'active', 'completed'] as const satisfies readonly FilterStatus[]

export const isTheme = (value: unknown): value is Theme => typeof value === 'string' && themeValues.includes(value as Theme)
export const isStravaConnectionStatus = (value: unknown): value is StravaConnectionStatus => typeof value === 'string' && stravaConnectionStatusValues.includes(value as StravaConnectionStatus)
export const isActivityVisibility = (value: unknown): value is ActivityVisibility => typeof value === 'string' && activityVisibilityValues.includes(value as ActivityVisibility)
export const isActivitySyncStatus = (value: unknown): value is ActivitySyncStatus => typeof value === 'string' && activitySyncStatusValues.includes(value as ActivitySyncStatus)
export const isArtJobStatus = (value: unknown): value is ArtJobStatus => typeof value === 'string' && artJobStatusValues.includes(value as ArtJobStatus)
export const isArtResultVisibility = (value: unknown): value is ArtResultVisibility => typeof value === 'string' && artResultVisibilityValues.includes(value as ArtResultVisibility)
export const isSyncEventCategory = (value: unknown): value is SyncEventCategory => typeof value === 'string' && syncEventCategoryValues.includes(value as SyncEventCategory)
export const isSyncEventStatus = (value: unknown): value is SyncEventStatus => typeof value === 'string' && syncEventStatusValues.includes(value as SyncEventStatus)
export const isFilterStatus = (value: unknown): value is FilterStatus => typeof value === 'string' && filterStatusValues.includes(value as FilterStatus)

export const isUser = (value: unknown): value is User => typeof value === 'object' && value !== null && 'id' in value && 'email' in value
export const isStravaConnection = (value: unknown): value is StravaConnection => typeof value === 'object' && value !== null && 'id' in value && 'provider' in value && 'status' in value
export const isActivity = (value: unknown): value is Activity => typeof value === 'object' && value !== null && 'id' in value && 'source' in value && 'source_activity_id' in value
export const isActivityStream = (value: unknown): value is ActivityStream => typeof value === 'object' && value !== null && 'id' in value && 'activity' in value
export const isArtJob = (value: unknown): value is ArtJob => typeof value === 'object' && value !== null && 'id' in value && 'activity' in value && 'status' in value
export const isArtPromptTemplate = (value: unknown): value is ArtPromptTemplate => typeof value === 'object' && value !== null && 'id' in value && 'template_key' in value
export const isArtResult = (value: unknown): value is ArtResult => typeof value === 'object' && value !== null && 'id' in value && 'job' in value && 'image_data_uri' in value
export const isSyncEvent = (value: unknown): value is SyncEvent => typeof value === 'object' && value !== null && 'id' in value && 'category' in value

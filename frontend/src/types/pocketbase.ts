import type {
  ActivitiesResponse,
  ActivityStreamsResponse,
  ArtJobsResponse,
  ArtResultsResponse,
  StravaConnectionsResponse,
  SyncEventsResponse,
  TodoCreate,
  TodoUpdate,
  TodosResponse,
  TypedPocketBase,
  UserCreate,
  UserUpdate,
  UsersResponse,
} from './pocketbase.generated'
import {
  TodosPriorityOptions,
  UsersThemeOptions,
} from './pocketbase.generated'

export type Priority = `${TodosPriorityOptions}`
export type Theme = `${UsersThemeOptions}`
export type StravaConnectionStatus = 'active' | 'expired' | 'revoked' | 'reauthorization_required'
export type ActivityVisibility = 'public' | 'followers_only' | 'only_me' | 'unknown'
export type ActivitySyncStatus = 'pending_detail' | 'ready' | 'partial' | 'failed'
export type ArtJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled'
export type ArtResultVisibility = 'private' | 'unlisted' | 'public'
export type SyncEventCategory = 'sync' | 'webhook' | 'connection'
export type SyncEventStatus = 'info' | 'success' | 'warning' | 'error'
export type TodoCreateInput = Omit<TodoCreate, 'priority'> & {
  priority?: Priority
}
export type TodoUpdateInput = Omit<TodoUpdate, 'priority'> & {
  priority?: Priority
}
export type UserUpdateInput = Omit<UserUpdate, 'theme'> & {
  theme?: Theme
}

export type User = UsersResponse
export type StravaConnection = StravaConnectionsResponse<{ user?: UsersResponse }>
export type Activity = ActivitiesResponse<{ user?: UsersResponse; connection?: StravaConnectionsResponse }>
export type ActivityStream = ActivityStreamsResponse<{ activity?: ActivitiesResponse }>
export type ArtJob = ArtJobsResponse<{ activity?: ActivitiesResponse; stream?: ActivityStreamsResponse; user?: UsersResponse }>
export type ArtResult = ArtResultsResponse<{ activity?: ActivitiesResponse; job?: ArtJobsResponse; user?: UsersResponse }>
export type SyncEvent = SyncEventsResponse<{ user?: UsersResponse }>
export type Todo = TodosResponse<string[], { user?: UsersResponse }>

export type { TypedPocketBase }
export type { TodoCreate, TodoUpdate, UserCreate, UserUpdate }

// 前端使用的筛选状态
export type FilterStatus = 'all' | 'active' | 'completed'
export type FilterPriority = 'all' | Priority

export const priorityValues = ['low', 'medium', 'high'] as const satisfies readonly Priority[]
export const themeValues = ['light', 'dark', 'system'] as const satisfies readonly Theme[]
export const stravaConnectionStatusValues = [
  'active',
  'expired',
  'revoked',
  'reauthorization_required',
] as const satisfies readonly StravaConnectionStatus[]
export const activityVisibilityValues = [
  'public',
  'followers_only',
  'only_me',
  'unknown',
] as const satisfies readonly ActivityVisibility[]
export const activitySyncStatusValues = [
  'pending_detail',
  'ready',
  'partial',
  'failed',
] as const satisfies readonly ActivitySyncStatus[]
export const artJobStatusValues = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'canceled',
] as const satisfies readonly ArtJobStatus[]
export const artResultVisibilityValues = [
  'private',
  'unlisted',
  'public',
] as const satisfies readonly ArtResultVisibility[]
export const syncEventCategoryValues = ['sync', 'webhook', 'connection'] as const satisfies readonly SyncEventCategory[]
export const syncEventStatusValues = ['info', 'success', 'warning', 'error'] as const satisfies readonly SyncEventStatus[]
export const filterStatusValues = ['all', 'active', 'completed'] as const satisfies readonly FilterStatus[]

export const isPriority = (value: unknown): value is Priority =>
  typeof value === 'string' && priorityValues.includes(value as Priority)

export const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && themeValues.includes(value as Theme)

export const isStravaConnectionStatus = (value: unknown): value is StravaConnectionStatus =>
  typeof value === 'string' && stravaConnectionStatusValues.includes(value as StravaConnectionStatus)

export const isActivityVisibility = (value: unknown): value is ActivityVisibility =>
  typeof value === 'string' && activityVisibilityValues.includes(value as ActivityVisibility)

export const isActivitySyncStatus = (value: unknown): value is ActivitySyncStatus =>
  typeof value === 'string' && activitySyncStatusValues.includes(value as ActivitySyncStatus)

export const isArtJobStatus = (value: unknown): value is ArtJobStatus =>
  typeof value === 'string' && artJobStatusValues.includes(value as ArtJobStatus)

export const isArtResultVisibility = (value: unknown): value is ArtResultVisibility =>
  typeof value === 'string' && artResultVisibilityValues.includes(value as ArtResultVisibility)

export const isSyncEventCategory = (value: unknown): value is SyncEventCategory =>
  typeof value === 'string' && syncEventCategoryValues.includes(value as SyncEventCategory)

export const isSyncEventStatus = (value: unknown): value is SyncEventStatus =>
  typeof value === 'string' && syncEventStatusValues.includes(value as SyncEventStatus)

export const isFilterStatus = (value: unknown): value is FilterStatus =>
  typeof value === 'string' && filterStatusValues.includes(value as FilterStatus)

export const isUser = (value: unknown): value is User => {
  if (typeof value !== 'object' || value === null) return false

  return (
    'collectionName' in value &&
    value.collectionName === 'users' &&
    'id' in value &&
    'email' in value &&
    'username' in value
  )
}

export const isTodo = (value: unknown): value is Todo => {
  if (typeof value !== 'object' || value === null) return false

  return (
    'collectionName' in value &&
    value.collectionName === 'todos' &&
    'id' in value &&
    'title' in value &&
    'user' in value
  )
}

export const isStravaConnection = (value: unknown): value is StravaConnection => {
  if (typeof value !== 'object' || value === null) return false

  return (
    'collectionName' in value &&
    value.collectionName === 'strava_connections' &&
    'id' in value &&
    'provider' in value &&
    'status' in value
  )
}

export const isActivity = (value: unknown): value is Activity => {
  if (typeof value !== 'object' || value === null) return false

  return (
    'collectionName' in value &&
    value.collectionName === 'activities' &&
    'id' in value &&
    'source' in value &&
    'source_activity_id' in value
  )
}

export const isArtJob = (value: unknown): value is ArtJob => {
  if (typeof value !== 'object' || value === null) return false

  return (
    'collectionName' in value &&
    value.collectionName === 'art_jobs' &&
    'id' in value &&
    'activity' in value &&
    'status' in value &&
    'style_preset' in value
  )
}

export const isArtResult = (value: unknown): value is ArtResult => {
  if (typeof value !== 'object' || value === null) return false

  return (
    'collectionName' in value &&
    value.collectionName === 'art_results' &&
    'id' in value &&
    'job' in value &&
    'activity' in value &&
    'image_data_uri' in value
  )
}

export const isSyncEvent = (value: unknown): value is SyncEvent => {
  if (typeof value !== 'object' || value === null) return false

  return (
    'collectionName' in value &&
    value.collectionName === 'sync_events' &&
    'id' in value &&
    'category' in value &&
    'status' in value &&
    'title' in value
  )
}

export function toTodoPriorityOption(priority: Priority): TodosPriorityOptions
export function toTodoPriorityOption(priority?: Priority): TodosPriorityOptions | undefined
export function toTodoPriorityOption(priority?: Priority): TodosPriorityOptions | undefined {
  switch (priority) {
    case 'low':
      return TodosPriorityOptions.Low
    case 'medium':
      return TodosPriorityOptions.Medium
    case 'high':
      return TodosPriorityOptions.High
    default:
      return undefined
  }
}

export function toUserThemeOption(theme: Theme): UsersThemeOptions
export function toUserThemeOption(theme?: Theme): UsersThemeOptions | undefined
export function toUserThemeOption(theme?: Theme): UsersThemeOptions | undefined {
  switch (theme) {
    case 'light':
      return UsersThemeOptions.Light
    case 'dark':
      return UsersThemeOptions.Dark
    case 'system':
      return UsersThemeOptions.System
    default:
      return undefined
  }
}

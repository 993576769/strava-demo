/**
 * This file mirrors the output shape of pocketbase-typegen and serves as the
 * committed baseline for the current schema. Regenerate it with:
 * `pnpm run typegen:pocketbase`
 */

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export enum Collections {
  Activities = 'activities',
  ActivityStreams = 'activity_streams',
  StravaConnections = 'strava_connections',
  Todos = 'todos',
  Users = 'users',
}

export type IsoDateString = string
export type RecordIdString = string
export type HTMLString = string

type ExpandType<T> = unknown extends T
  ? T extends unknown
    ? { expand?: unknown }
    : { expand: T }
  : { expand?: T }

export type BaseSystemFields<T = unknown> = {
  id: RecordIdString
  collectionId: string
  collectionName: Collections
} & ExpandType<T>

export type AuthSystemFields<T = unknown> = {
  email: string
  emailVisibility: boolean
  username: string
  verified: boolean
} & BaseSystemFields<T>

export enum UsersThemeOptions {
  Light = 'light',
  Dark = 'dark',
  System = 'system',
}

export type UsersRecord = {
  avatar?: string
  created?: IsoDateString
  email: string
  emailVisibility?: boolean
  id: string
  name?: string
  password: string
  theme?: UsersThemeOptions
  tokenKey: string
  updated?: IsoDateString
  verified?: boolean
}

export enum StravaConnectionsStatusOptions {
  Active = 'active',
  Expired = 'expired',
  Revoked = 'revoked',
  ReauthorizationRequired = 'reauthorization_required',
}

export type StravaConnectionsRecord = {
  access_token_encrypted?: string
  created?: IsoDateString
  id: string
  last_error_code?: string
  last_error_message?: string
  last_sync_at?: IsoDateString
  last_sync_cursor?: IsoDateString
  last_webhook_at?: IsoDateString
  provider: string
  refresh_token_encrypted?: string
  scope_granted?: string
  status: StravaConnectionsStatusOptions
  strava_athlete_id: string
  strava_username?: string
  token_expires_at?: IsoDateString
  updated?: IsoDateString
  user: RecordIdString
}

export enum ActivitiesVisibilityOptions {
  Public = 'public',
  FollowersOnly = 'followers_only',
  OnlyMe = 'only_me',
  Unknown = 'unknown',
}

export enum ActivitiesSyncStatusOptions {
  PendingDetail = 'pending_detail',
  Ready = 'ready',
  Partial = 'partial',
  Failed = 'failed',
}

export type ActivitiesRecord = {
  average_speed?: number
  connection: RecordIdString
  created?: IsoDateString
  distance_meters?: number
  elapsed_time_seconds?: number
  elevation_gain_meters?: number
  end_latlng?: unknown
  generatable_reason?: string
  has_polyline?: boolean
  has_streams?: boolean
  id: string
  is_generatable?: boolean
  moving_time_seconds?: number
  name: string
  raw_detail_json?: unknown
  raw_summary_json?: unknown
  source: string
  source_activity_id: string
  sport_type?: string
  start_date?: IsoDateString
  start_latlng?: unknown
  sync_status: ActivitiesSyncStatusOptions
  synced_at?: IsoDateString
  timezone?: string
  updated?: IsoDateString
  user: RecordIdString
  visibility?: ActivitiesVisibilityOptions
}

export type ActivityStreamsRecord = {
  activity: RecordIdString
  altitude_stream_json?: unknown
  bbox_json?: unknown
  created?: IsoDateString
  distance_stream_json?: unknown
  id: string
  latlng_stream_json?: unknown
  normalized_path_json?: unknown
  point_count?: number
  processed_at?: IsoDateString
  sampling_strategy?: string
  stream_version?: string
  time_stream_json?: unknown
  updated?: IsoDateString
  user: RecordIdString
}

export enum TodosPriorityOptions {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export type TodosRecord<Ttags = unknown> = {
  completed?: boolean
  created?: IsoDateString
  description?: string
  due_date?: IsoDateString
  id: string
  priority?: TodosPriorityOptions
  sort_order?: number
  tags?: null | Ttags
  title: string
  updated?: IsoDateString
  user: RecordIdString
}

export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>
export type StravaConnectionsResponse<Texpand = unknown> = Required<StravaConnectionsRecord> & BaseSystemFields<Texpand>
export type ActivitiesResponse<Texpand = unknown> = Required<ActivitiesRecord> & BaseSystemFields<Texpand>
export type ActivityStreamsResponse<Texpand = unknown> = Required<ActivityStreamsRecord> & BaseSystemFields<Texpand>
export type TodosResponse<Ttags = unknown, Texpand = unknown> = Required<TodosRecord<Ttags>> & BaseSystemFields<Texpand>

export type CollectionRecords = {
  activities: ActivitiesRecord
  activity_streams: ActivityStreamsRecord
  strava_connections: StravaConnectionsRecord
  todos: TodosRecord
  users: UsersRecord
}

export type CollectionResponses = {
  activities: ActivitiesResponse
  activity_streams: ActivityStreamsResponse
  strava_connections: StravaConnectionsResponse
  todos: TodosResponse
  users: UsersResponse
}

export type TodoCreate = Pick<TodosRecord<string[]>, 'title' | 'user'> & {
  description?: string
  completed?: boolean
  due_date?: string | null
  priority?: TodosPriorityOptions
  sort_order?: number
  tags?: string[]
}

export type TodoUpdate = Partial<Omit<TodoCreate, 'user'>>

export type UserCreate = Pick<UsersRecord, 'email' | 'password'> & {
  passwordConfirm: string
  name?: string
}

export type UserUpdate = {
  theme?: UsersThemeOptions
}

export type TypedPocketBase = PocketBase & {
  collection(idOrName: 'activities'): RecordService<ActivitiesResponse>
  collection(idOrName: 'activity_streams'): RecordService<ActivityStreamsResponse>
  collection(idOrName: 'strava_connections'): RecordService<StravaConnectionsResponse>
  collection(idOrName: 'todos'): RecordService<TodosResponse>
  collection(idOrName: 'users'): RecordService<UsersResponse>
}

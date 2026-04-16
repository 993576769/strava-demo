import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull().default(''),
  avatarUrl: text('avatar_url').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const oauthAccounts = pgTable('oauth_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  accessToken: text('access_token').notNull().default(''),
  refreshToken: text('refresh_token').notNull().default(''),
  scope: text('scope').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  providerAccountUnique: uniqueIndex('oauth_accounts_provider_account_unique').on(table.provider, table.providerAccountId),
}))

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const stravaConnections = pgTable('strava_connections', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('strava'),
  stravaAthleteId: text('strava_athlete_id').notNull(),
  stravaUsername: text('strava_username').notNull().default(''),
  scopeGranted: text('scope_granted').notNull().default(''),
  accessTokenEncrypted: text('access_token_encrypted').notNull().default(''),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull().default(''),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  status: text('status').notNull().default('active'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSyncCursor: integer('last_sync_cursor'),
  lastWebhookAt: timestamp('last_webhook_at', { withTimezone: true }),
  lastErrorCode: text('last_error_code').notNull().default(''),
  lastErrorMessage: text('last_error_message').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  userProviderUnique: uniqueIndex('strava_connections_user_provider_unique').on(table.userId, table.provider),
  athleteUnique: uniqueIndex('strava_connections_provider_athlete_unique').on(table.provider, table.stravaAthleteId),
}))

export const activities = pgTable('activities', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  connectionId: text('connection_id').notNull().references(() => stravaConnections.id, { onDelete: 'cascade' }),
  source: text('source').notNull().default('strava'),
  sourceActivityId: text('source_activity_id').notNull(),
  name: text('name').notNull().default(''),
  sportType: text('sport_type').notNull().default(''),
  startDate: timestamp('start_date', { withTimezone: true }),
  timezone: text('timezone').notNull().default(''),
  distanceMeters: numeric('distance_meters', { precision: 12, scale: 2 }).notNull().default('0'),
  movingTimeSeconds: integer('moving_time_seconds').notNull().default(0),
  elapsedTimeSeconds: integer('elapsed_time_seconds').notNull().default(0),
  elevationGainMeters: numeric('elevation_gain_meters', { precision: 12, scale: 2 }).notNull().default('0'),
  averageSpeed: numeric('average_speed', { precision: 12, scale: 4 }).notNull().default('0'),
  startLatlng: jsonb('start_latlng').$type<number[] | null>().default(null),
  endLatlng: jsonb('end_latlng').$type<number[] | null>().default(null),
  visibility: text('visibility').notNull().default('unknown'),
  hasPolyline: boolean('has_polyline').notNull().default(false),
  hasStreams: boolean('has_streams').notNull().default(false),
  isGeneratable: boolean('is_generatable').notNull().default(false),
  generatableReason: text('generatable_reason').notNull().default(''),
  syncStatus: text('sync_status').notNull().default('pending_detail'),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  rawSummaryJson: jsonb('raw_summary_json').$type<Record<string, unknown> | null>().default(null),
  rawDetailJson: jsonb('raw_detail_json').$type<Record<string, unknown> | null>().default(null),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  sourceActivityUnique: uniqueIndex('activities_source_activity_unique').on(table.source, table.sourceActivityId),
  userStartDateIndex: index('activities_user_start_date_idx').on(table.userId, table.startDate),
}))

export const activityStreams = pgTable('activity_streams', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  activityId: text('activity_id').notNull().references(() => activities.id, { onDelete: 'cascade' }).unique(),
  streamVersion: text('stream_version').notNull().default('v1'),
  pointCount: integer('point_count').notNull().default(0),
  distanceStreamJson: jsonb('distance_stream_json').$type<number[] | null>().default(null),
  latlngStreamJson: jsonb('latlng_stream_json').$type<number[][] | null>().default(null),
  altitudeStreamJson: jsonb('altitude_stream_json').$type<number[] | null>().default(null),
  timeStreamJson: jsonb('time_stream_json').$type<number[] | null>().default(null),
  normalizedPathJson: jsonb('normalized_path_json').$type<number[][] | null>().default(null),
  bboxJson: jsonb('bbox_json').$type<number[] | null>().default(null),
  samplingStrategy: text('sampling_strategy').notNull().default('raw'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const artPromptTemplates = pgTable('art_prompt_templates', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull().default('doubao-seedream'),
  templateKey: text('template_key').notNull(),
  promptTemplate: text('prompt_template').notNull(),
  referenceImageUrl: text('reference_image_url').notNull().default(''),
  notes: text('notes').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  providerTemplateUnique: uniqueIndex('art_prompt_templates_provider_key_unique').on(table.provider, table.templateKey),
}))

export const artJobs = pgTable('art_jobs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  activityId: text('activity_id').notNull().references(() => activities.id, { onDelete: 'cascade' }),
  streamId: text('stream_id').references(() => activityStreams.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending'),
  stylePreset: text('style_preset').notNull(),
  promptSnapshot: text('prompt_snapshot').notNull().default(''),
  renderOptionsJson: jsonb('render_options_json').$type<Record<string, unknown>>().notNull().default({}),
  renderOptionsHash: text('render_options_hash').notNull().default(''),
  routeBaseImageUrl: text('route_base_image_url').notNull().default(''),
  attemptCount: integer('attempt_count').notNull().default(0),
  errorCode: text('error_code').notNull().default(''),
  errorMessage: text('error_message').notNull().default(''),
  queuedAt: timestamp('queued_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  workerRef: text('worker_ref').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  activityQueuedAtIndex: index('art_jobs_activity_queued_at_idx').on(table.activityId, table.queuedAt),
}))

export const artResults = pgTable('art_results', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => artJobs.id, { onDelete: 'cascade' }).unique(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  activityId: text('activity_id').notNull().references(() => activities.id, { onDelete: 'cascade' }),
  imageDataUri: text('image_data_uri').notNull(),
  thumbnailDataUri: text('thumbnail_data_uri').notNull().default(''),
  width: integer('width').notNull().default(0),
  height: integer('height').notNull().default(0),
  fileSize: integer('file_size').notNull().default(0),
  mimeType: text('mime_type').notNull().default('image/png'),
  stylePreset: text('style_preset').notNull(),
  titleSnapshot: text('title_snapshot').notNull().default(''),
  subtitleSnapshot: text('subtitle_snapshot').notNull().default(''),
  metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull().default({}),
  visibility: text('visibility').notNull().default('private'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const syncEvents = pgTable('sync_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('strava'),
  category: text('category').notNull(),
  status: text('status').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull().default(''),
  payloadJson: jsonb('payload_json').$type<Record<string, unknown> | null>().default(null),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  userOccurredAtIndex: index('sync_events_user_occurred_at_idx').on(table.userId, table.occurredAt),
}))

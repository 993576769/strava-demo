import type {
  activities,
  activityStreams,
  artJobs,
  artPromptTemplates,
  artResults,
  stravaConnections,
  syncEvents,
  users,
} from '../../db/schema'

type UserRow = typeof users.$inferSelect
type StravaConnectionRow = typeof stravaConnections.$inferSelect
type ActivityRow = typeof activities.$inferSelect
type ActivityStreamRow = typeof activityStreams.$inferSelect
type ArtJobRow = typeof artJobs.$inferSelect
type ArtResultRow = typeof artResults.$inferSelect
type ArtPromptTemplateRow = typeof artPromptTemplates.$inferSelect
type SyncEventRow = typeof syncEvents.$inferSelect

const toIso = (value: Date | null | undefined) => value ? value.toISOString() : ''
const toNumber = (value: string | number | null | undefined) => value === null || value === undefined ? 0 : Number(value)
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const toSummaryPolylinePayload = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value)) { return null }

  const rawMap = value.map
  if (!isRecord(rawMap)) { return null }

  const summaryPolyline = rawMap.summary_polyline
  if (typeof summaryPolyline !== 'string' || summaryPolyline.length === 0) { return null }

  return {
    map: {
      summary_polyline: summaryPolyline,
    },
  }
}

const toBaseActivityDto = (row: ActivityRow) => ({
  id: row.id,
  user: row.userId,
  connection: row.connectionId,
  source: row.source,
  source_activity_id: row.sourceActivityId,
  name: row.name,
  sport_type: row.sportType,
  start_date: toIso(row.startDate),
  timezone: row.timezone,
  distance_meters: toNumber(row.distanceMeters),
  moving_time_seconds: row.movingTimeSeconds,
  elapsed_time_seconds: row.elapsedTimeSeconds,
  elevation_gain_meters: toNumber(row.elevationGainMeters),
  average_speed: toNumber(row.averageSpeed),
  start_latlng: row.startLatlng,
  end_latlng: row.endLatlng,
  visibility: row.visibility,
  has_polyline: row.hasPolyline,
  has_streams: row.hasStreams,
  is_generatable: row.isGeneratable,
  generatable_reason: row.generatableReason,
  sync_status: row.syncStatus,
  synced_at: toIso(row.syncedAt),
  created: toIso(row.createdAt),
  updated: toIso(row.updatedAt),
})

export const toUserDto = (row: UserRow) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  avatar_url: row.avatarUrl,
  is_active: row.isActive,
  is_admin: row.isAdmin,
  created: toIso(row.createdAt),
  updated: toIso(row.updatedAt),
})

export const toStravaConnectionDto = (row: StravaConnectionRow) => ({
  id: row.id,
  user: row.userId,
  provider: row.provider,
  strava_athlete_id: row.stravaAthleteId,
  strava_username: row.stravaUsername,
  scope_granted: row.scopeGranted,
  status: row.status,
  last_sync_at: toIso(row.lastSyncAt),
  last_webhook_at: toIso(row.lastWebhookAt),
  last_error_code: row.lastErrorCode,
  last_error_message: row.lastErrorMessage,
  created: toIso(row.createdAt),
  updated: toIso(row.updatedAt),
})

export const toActivityListDto = (row: ActivityRow) => ({
  ...toBaseActivityDto(row),
})

export const toActivityDto = (row: ActivityRow) => ({
  ...toBaseActivityDto(row),
  raw_summary_json: toSummaryPolylinePayload(row.rawSummaryJson),
  raw_detail_json: toSummaryPolylinePayload(row.rawDetailJson),
})

export const toActivityStreamDto = (row: ActivityStreamRow) => ({
  id: row.id,
  user: row.userId,
  activity: row.activityId,
  stream_version: row.streamVersion,
  point_count: row.pointCount,
  distance_stream_json: row.distanceStreamJson,
  latlng_stream_json: row.latlngStreamJson,
  altitude_stream_json: row.altitudeStreamJson,
  time_stream_json: row.timeStreamJson,
  normalized_path_json: row.normalizedPathJson,
  bbox_json: row.bboxJson,
  sampling_strategy: row.samplingStrategy,
  processed_at: toIso(row.processedAt),
  created: toIso(row.createdAt),
  updated: toIso(row.updatedAt),
})

export const toArtResultDto = (row: ArtResultRow) => ({
  id: row.id,
  job: row.jobId,
  user: row.userId,
  activity: row.activityId,
  image_data_uri: row.imageDataUri,
  thumbnail_data_uri: row.thumbnailDataUri,
  width: row.width,
  height: row.height,
  file_size: row.fileSize,
  mime_type: row.mimeType,
  style_preset: row.stylePreset,
  title_snapshot: row.titleSnapshot,
  subtitle_snapshot: row.subtitleSnapshot,
  metadata_json: row.metadataJson,
  visibility: row.visibility,
  created: toIso(row.createdAt),
  updated: toIso(row.updatedAt),
})

export const toArtJobDto = (row: ArtJobRow, result?: ArtResultRow | null) => ({
  id: row.id,
  user: row.userId,
  activity: row.activityId,
  stream: row.streamId || '',
  status: row.status,
  style_preset: row.stylePreset,
  prompt_snapshot: row.promptSnapshot,
  render_options_json: row.renderOptionsJson,
  render_options_hash: row.renderOptionsHash,
  route_base_image_url: row.routeBaseImageUrl,
  attempt_count: row.attemptCount,
  error_code: row.errorCode,
  error_message: row.errorMessage,
  queued_at: toIso(row.queuedAt),
  started_at: toIso(row.startedAt),
  finished_at: toIso(row.finishedAt),
  worker_ref: row.workerRef,
  created: toIso(row.createdAt),
  updated: toIso(row.updatedAt),
  result: result ? toArtResultDto(result) : null,
})

export const toArtPromptTemplateDto = (row: ArtPromptTemplateRow) => ({
  id: row.id,
  provider: row.provider,
  template_key: row.templateKey,
  prompt_template: row.promptTemplate,
  reference_image_url: row.referenceImageUrl,
  notes: row.notes,
  is_active: row.isActive,
  created: toIso(row.createdAt),
  updated: toIso(row.updatedAt),
})

export const toSyncEventDto = (row: SyncEventRow) => ({
  id: row.id,
  user: row.userId,
  provider: row.provider,
  category: row.category,
  status: row.status,
  title: row.title,
  message: row.message,
  payload_json: row.payloadJson,
  occurred_at: toIso(row.occurredAt),
  created: toIso(row.createdAt),
})

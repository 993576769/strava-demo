// @ts-check

// PocketBase migration: enable OAuth auth and add Strava activity collections.

/** @param {PBApp} app @param {string} name */
const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name)
  } catch (_) {
    return null
  }
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")

  users.oauth2 = {
    enabled: true,
  }
  users.passwordAuth = {
    enabled: true,
  }
  app.save(users)

  let stravaConnections = findCollection(app, "strava_connections")
  if (!stravaConnections) {
    stravaConnections = new Collection({
      name: "strava_connections",
      type: "base",
      listRule: "@request.auth.id != '' && user = @request.auth.id",
      viewRule: "@request.auth.id != '' && user = @request.auth.id",
      fields: [
        {
          name: "user",
          type: "relation",
          required: true,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
          displayFields: ["name", "email"],
        },
        {
          name: "provider",
          type: "text",
          required: true,
          min: 1,
          max: 50,
        },
        {
          name: "strava_athlete_id",
          type: "text",
          required: true,
          min: 1,
          max: 100,
        },
        {
          name: "strava_username",
          type: "text",
          max: 255,
        },
        {
          name: "scope_granted",
          type: "text",
          max: 1000,
        },
        {
          name: "access_token_encrypted",
          type: "text",
          max: 4000,
        },
        {
          name: "refresh_token_encrypted",
          type: "text",
          max: 4000,
        },
        {
          name: "token_expires_at",
          type: "date",
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["active", "expired", "revoked", "reauthorization_required"],
        },
        {
          name: "last_sync_at",
          type: "date",
        },
        {
          name: "last_sync_cursor",
          type: "date",
        },
        {
          name: "last_webhook_at",
          type: "date",
        },
        {
          name: "last_error_code",
          type: "text",
          max: 255,
        },
        {
          name: "last_error_message",
          type: "text",
          max: 2000,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_strava_connections_user_provider ON strava_connections (user, provider)",
        "CREATE UNIQUE INDEX idx_strava_connections_provider_athlete ON strava_connections (provider, strava_athlete_id)",
      ],
    })

    app.save(stravaConnections)
  }

  let activities = findCollection(app, "activities")
  if (!activities) {
    activities = new Collection({
      name: "activities",
      type: "base",
      listRule: "@request.auth.id != '' && user = @request.auth.id",
      viewRule: "@request.auth.id != '' && user = @request.auth.id",
      fields: [
        {
          name: "user",
          type: "relation",
          required: true,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
          displayFields: ["name", "email"],
        },
        {
          name: "connection",
          type: "relation",
          required: true,
          collectionId: stravaConnections.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: "source",
          type: "text",
          required: true,
          min: 1,
          max: 50,
        },
        {
          name: "source_activity_id",
          type: "text",
          required: true,
          min: 1,
          max: 100,
        },
        {
          name: "name",
          type: "text",
          required: true,
          min: 1,
          max: 500,
        },
        {
          name: "sport_type",
          type: "text",
          max: 100,
        },
        {
          name: "start_date",
          type: "date",
        },
        {
          name: "timezone",
          type: "text",
          max: 255,
        },
        {
          name: "distance_meters",
          type: "number",
          min: 0,
        },
        {
          name: "moving_time_seconds",
          type: "number",
          min: 0,
        },
        {
          name: "elapsed_time_seconds",
          type: "number",
          min: 0,
        },
        {
          name: "elevation_gain_meters",
          type: "number",
        },
        {
          name: "average_speed",
          type: "number",
        },
        {
          name: "start_latlng",
          type: "json",
        },
        {
          name: "end_latlng",
          type: "json",
        },
        {
          name: "visibility",
          type: "select",
          maxSelect: 1,
          values: ["public", "followers_only", "only_me", "unknown"],
        },
        {
          name: "has_polyline",
          type: "bool",
        },
        {
          name: "has_streams",
          type: "bool",
        },
        {
          name: "is_generatable",
          type: "bool",
        },
        {
          name: "generatable_reason",
          type: "text",
          max: 1000,
        },
        {
          name: "sync_status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["pending_detail", "ready", "partial", "failed"],
        },
        {
          name: "synced_at",
          type: "date",
        },
        {
          name: "raw_summary_json",
          type: "json",
        },
        {
          name: "raw_detail_json",
          type: "json",
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_activities_source_activity ON activities (source, source_activity_id)",
        "CREATE INDEX idx_activities_user_start_date ON activities (user, start_date)",
      ],
    })

    app.save(activities)
  }

  const activitiesCollection = app.findCollectionByNameOrId("activities")

  let activityStreams = findCollection(app, "activity_streams")
  if (!activityStreams) {
    activityStreams = new Collection({
      name: "activity_streams",
      type: "base",
      listRule: "@request.auth.id != '' && user = @request.auth.id",
      viewRule: "@request.auth.id != '' && user = @request.auth.id",
      fields: [
        {
          name: "user",
          type: "relation",
          required: true,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
          displayFields: ["name", "email"],
        },
        {
          name: "activity",
          type: "relation",
          required: true,
          collectionId: activitiesCollection.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: "stream_version",
          type: "text",
          max: 50,
        },
        {
          name: "point_count",
          type: "number",
          min: 0,
        },
        {
          name: "distance_stream_json",
          type: "json",
        },
        {
          name: "latlng_stream_json",
          type: "json",
        },
        {
          name: "altitude_stream_json",
          type: "json",
        },
        {
          name: "time_stream_json",
          type: "json",
        },
        {
          name: "normalized_path_json",
          type: "json",
        },
        {
          name: "bbox_json",
          type: "json",
        },
        {
          name: "sampling_strategy",
          type: "text",
          max: 255,
        },
        {
          name: "processed_at",
          type: "date",
        },
      ],
      indexes: [
        "CREATE INDEX idx_activity_streams_user ON activity_streams (user)",
        "CREATE UNIQUE INDEX idx_activity_streams_activity ON activity_streams (activity)",
      ],
    })

    app.save(activityStreams)
  }
}, (app) => {
  try {
    const activityStreams = app.findCollectionByNameOrId("activity_streams")
    app.delete(activityStreams)
  } catch (_) {}

  try {
    const activities = app.findCollectionByNameOrId("activities")
    app.delete(activities)
  } catch (_) {}

  try {
    const stravaConnections = app.findCollectionByNameOrId("strava_connections")
    app.delete(stravaConnections)
  } catch (_) {}

  try {
    const users = app.findCollectionByNameOrId("users")
    users.oauth2 = {
      enabled: false,
    }
    app.save(users)
  } catch (_) {}
})

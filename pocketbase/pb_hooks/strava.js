module.exports = {
  getRequiredEnv: function (key) {
    var value = $os.getenv(key)
    if (!value) {
      throw new BadRequestError("Missing required env: " + key)
    }
    return value
  },

  getOptionalEnv: function (key, fallback) {
    var value = $os.getenv(key)
    return value || fallback
  },

  getRedirectBase: function () {
    return $os.getenv("APP_URL") || ""
  },

  buildFrontendRedirect: function (pathWithQuery) {
    var base = this.getRedirectBase()
    if (!base) {
      return pathWithQuery
    }
    return base.replace(/\/$/, "") + pathWithQuery
  },

  getStateSecret: function () {
    return this.getRequiredEnv("STRAVA_STATE_SECRET")
  },

  getEncryptionKey: function () {
    var rawKey = $os.getenv("STRAVA_TOKEN_ENCRYPTION_KEY") || this.getStateSecret()
    return $security.sha256(rawKey).slice(0, 32)
  },

  buildAuthorizeUrl: function (stateToken) {
    var clientId = this.getRequiredEnv("STRAVA_CLIENT_ID")
    var redirectUri = this.getRequiredEnv("STRAVA_REDIRECT_URI")
    var scope = this.getOptionalEnv("STRAVA_SCOPES", "read,activity:read_all")

    var query = [
      "client_id=" + encodeURIComponent(clientId),
      "redirect_uri=" + encodeURIComponent(redirectUri),
      "response_type=code",
      "approval_prompt=auto",
      "scope=" + encodeURIComponent(scope),
      "state=" + encodeURIComponent(stateToken),
    ].join("&")

    return "https://www.strava.com/oauth/authorize?" + query
  },

  createStateToken: function (userId) {
    return $security.createJWT({ uid: userId }, this.getStateSecret(), 600)
  },

  parseStateToken: function (token) {
    return $security.parseJWT(token, this.getStateSecret())
  },

  exchangeCode: function (code) {
    var response = $http.send({
      url: "https://www.strava.com/oauth/token",
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: [
        "client_id=" + encodeURIComponent(this.getRequiredEnv("STRAVA_CLIENT_ID")),
        "client_secret=" + encodeURIComponent(this.getRequiredEnv("STRAVA_CLIENT_SECRET")),
        "code=" + encodeURIComponent(code),
        "grant_type=authorization_code",
      ].join("&"),
      timeout: 30,
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadRequestError("Strava token exchange failed")
    }

    return response.json
  },

  refreshAccessToken: function (refreshToken) {
    var response = $http.send({
      url: "https://www.strava.com/oauth/token",
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: [
        "client_id=" + encodeURIComponent(this.getRequiredEnv("STRAVA_CLIENT_ID")),
        "client_secret=" + encodeURIComponent(this.getRequiredEnv("STRAVA_CLIENT_SECRET")),
        "grant_type=refresh_token",
        "refresh_token=" + encodeURIComponent(refreshToken),
      ].join("&"),
      timeout: 30,
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadRequestError("Strava token refresh failed")
    }

    return response.json
  },

  fetchAthlete: function (accessToken) {
    var response = $http.send({
      url: "https://www.strava.com/api/v3/athlete",
      method: "GET",
      headers: {
        Authorization: "Bearer " + accessToken,
      },
      timeout: 30,
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadRequestError("Failed to fetch Strava athlete")
    }

    return response.json
  },

  fetchActivityDetail: function (accessToken, activityId) {
    var response = $http.send({
      url: "https://www.strava.com/api/v3/activities/" + encodeURIComponent(String(activityId)),
      method: "GET",
      headers: {
        Authorization: "Bearer " + accessToken,
      },
      timeout: 30,
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadRequestError("Failed to fetch activity detail")
    }

    return response.json
  },

  fetchAthleteActivities: function (accessToken, options) {
    var query = []
    if (options && options.afterEpoch) {
      query.push("after=" + encodeURIComponent(String(options.afterEpoch)))
    }
    if (options && options.page) {
      query.push("page=" + encodeURIComponent(String(options.page)))
    }
    if (options && options.perPage) {
      query.push("per_page=" + encodeURIComponent(String(options.perPage)))
    }

    var url = "https://www.strava.com/api/v3/athlete/activities"
    if (query.length > 0) {
      url += "?" + query.join("&")
    }

    var response = $http.send({
      url: url,
      method: "GET",
      headers: {
        Authorization: "Bearer " + accessToken,
      },
      timeout: 30,
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadRequestError("Failed to fetch athlete activities")
    }

    return Array.isArray(response.json) ? response.json : []
  },

  fetchActivityStreams: function (accessToken, activityId) {
    var query = [
      "keys=" + encodeURIComponent("latlng,distance,altitude,time"),
      "key_by_type=true",
    ].join("&")

    var response = $http.send({
      url: "https://www.strava.com/api/v3/activities/" + encodeURIComponent(String(activityId)) + "/streams?" + query,
      method: "GET",
      headers: {
        Authorization: "Bearer " + accessToken,
      },
      timeout: 30,
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadRequestError("Failed to fetch activity streams")
    }

    return response.json || {}
  },

  getConnectionForUser: function (userId) {
    return $app.findFirstRecordByFilter(
      "strava_connections",
      "user = {:userId} && provider = 'strava'",
      { userId: userId }
    )
  },

  decryptValue: function (cipherText) {
    if (!cipherText) {
      return ""
    }
    return toString($security.decrypt(cipherText, this.getEncryptionKey()))
  },

  persistTokenData: function (connection, tokenData) {
    connection.set("access_token_encrypted", $security.encrypt(tokenData.access_token, this.getEncryptionKey()))
    connection.set("refresh_token_encrypted", $security.encrypt(tokenData.refresh_token, this.getEncryptionKey()))
    connection.set("token_expires_at", new Date(tokenData.expires_at * 1000).toISOString())
    connection.set("status", "active")
    connection.set("last_error_code", "")
    connection.set("last_error_message", "")
    $app.save(connection)
  },

  getValidAccessToken: function (connection) {
    var accessToken = this.decryptValue(connection.getString("access_token_encrypted"))
    var refreshToken = this.decryptValue(connection.getString("refresh_token_encrypted"))
    var expiresAt = connection.getString("token_expires_at")
    var expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : 0
    var shouldRefresh = !accessToken || !expiresAtMs || expiresAtMs - Date.now() <= 60 * 60 * 1000

    if (!shouldRefresh) {
      return accessToken
    }

    if (!refreshToken) {
      connection.set("status", "reauthorization_required")
      connection.set("last_error_code", "missing_refresh_token")
      connection.set("last_error_message", "Missing Strava refresh token")
      $app.save(connection)
      throw new BadRequestError("Missing Strava refresh token")
    }

    var tokenData = this.refreshAccessToken(refreshToken)
    this.persistTokenData(connection, tokenData)
    return tokenData.access_token
  },

  inferVisibility: function (detail) {
    if (detail && typeof detail.visibility === "string" && detail.visibility) {
      return detail.visibility
    }

    if (detail && detail.private === true) {
      return "only_me"
    }

    return "public"
  },

  normalizePath: function (latlngData) {
    if (!Array.isArray(latlngData)) {
      return []
    }

    return latlngData
      .map(function (point) {
        if (!Array.isArray(point) || point.length < 2) {
          return null
        }

        var lat = Number(point[0])
        var lng = Number(point[1])
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null
        }

        return [lng, lat]
      })
      .filter(Boolean)
  },

  computeBBox: function (pathPoints) {
    if (!Array.isArray(pathPoints) || pathPoints.length === 0) {
      return null
    }

    var minX = Number.POSITIVE_INFINITY
    var minY = Number.POSITIVE_INFINITY
    var maxX = Number.NEGATIVE_INFINITY
    var maxY = Number.NEGATIVE_INFINITY

    pathPoints.forEach(function (point) {
      minX = Math.min(minX, point[0])
      minY = Math.min(minY, point[1])
      maxX = Math.max(maxX, point[0])
      maxY = Math.max(maxY, point[1])
    })

    return {
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
    }
  },

  findActivityRecord: function (sourceActivityId) {
    try {
      return $app.findFirstRecordByFilter(
        "activities",
        "source = 'strava' && source_activity_id = {:sourceActivityId}",
        {
          sourceActivityId: String(sourceActivityId),
        }
      )
    } catch (_) {
      return null
    }
  },

  findActivityStreamRecord: function (activityId, userId) {
    try {
      return $app.findFirstRecordByFilter(
        "activity_streams",
        "activity = {:activityId} && user = {:userId}",
        {
          activityId: activityId,
          userId: userId,
        }
      )
    } catch (_) {
      return null
    }
  },

  upsertActivity: function (params) {
    var userId = params.userId
    var connection = params.connection
    var summary = params.summary
    var detail = params.detail
    var streams = params.streams || {}
    var existing = this.findActivityRecord(summary.id)
    var collection = $app.findCollectionByNameOrId("activities")
    var record = existing || new Record(collection)

    var latlngData = streams.latlng && Array.isArray(streams.latlng.data) ? streams.latlng.data : []
    var normalizedPath = this.normalizePath(latlngData)
    var hasStreams = normalizedPath.length >= 2
    var hasPolyline = !!(
      (detail && detail.map && detail.map.summary_polyline) ||
      (summary && summary.map && summary.map.summary_polyline)
    )
    var isGeneratable = normalizedPath.length >= 8
    var generatableReason = ""

    if (!hasStreams) {
      generatableReason = "缺少可用轨迹数据"
    } else if (!isGeneratable) {
      generatableReason = "轨迹点数量过少"
    }

    record.set("user", userId)
    record.set("connection", connection.id)
    record.set("source", "strava")
    record.set("source_activity_id", String(summary.id))
    record.set("name", detail && detail.name ? detail.name : (summary.name || "Untitled Activity"))
    record.set("sport_type", (detail && detail.sport_type) || summary.sport_type || (detail && detail.type) || "")
    record.set("start_date", (detail && detail.start_date) || summary.start_date || null)
    record.set("timezone", (detail && detail.timezone) || summary.timezone || null)
    record.set("distance_meters", Number((detail && detail.distance) || summary.distance || 0))
    record.set("moving_time_seconds", Number((detail && detail.moving_time) || summary.moving_time || 0))
    record.set("elapsed_time_seconds", Number((detail && detail.elapsed_time) || summary.elapsed_time || 0))
    record.set("elevation_gain_meters", Number((detail && detail.total_elevation_gain) || summary.total_elevation_gain || 0))
    record.set("average_speed", Number((detail && detail.average_speed) || summary.average_speed || 0))
    record.set("start_latlng", (detail && detail.start_latlng) || summary.start_latlng || null)
    record.set("end_latlng", (detail && detail.end_latlng) || summary.end_latlng || null)
    record.set("visibility", this.inferVisibility(detail || summary))
    record.set("has_polyline", hasPolyline)
    record.set("has_streams", hasStreams)
    record.set("is_generatable", isGeneratable)
    record.set("generatable_reason", generatableReason)
    record.set("sync_status", hasStreams ? "ready" : "partial")
    record.set("synced_at", new Date().toISOString())
    record.set("raw_summary_json", summary)
    record.set("raw_detail_json", detail || summary)
    $app.save(record)

    var streamRecord = this.findActivityStreamRecord(record.id, userId)
    if (hasStreams) {
      var streamCollection = $app.findCollectionByNameOrId("activity_streams")
      var stream = streamRecord || new Record(streamCollection)
      stream.set("user", userId)
      stream.set("activity", record.id)
      stream.set("stream_version", (streams.latlng && streams.latlng.resolution) || "raw")
      stream.set("point_count", normalizedPath.length)
      stream.set("distance_stream_json", streams.distance ? streams.distance.data || [] : [])
      stream.set("latlng_stream_json", latlngData)
      stream.set("altitude_stream_json", streams.altitude ? streams.altitude.data || [] : [])
      stream.set("time_stream_json", streams.time ? streams.time.data || [] : [])
      stream.set("normalized_path_json", normalizedPath)
      stream.set("bbox_json", this.computeBBox(normalizedPath))
      stream.set("sampling_strategy", "strava_stream_raw")
      stream.set("processed_at", new Date().toISOString())
      $app.save(stream)
    }

    return {
      record: record,
      created: !existing,
      ready: hasStreams,
      generatable: isGeneratable,
    }
  },

  syncActivities: function (userId) {
    var connection = this.getConnectionForUser(userId)
    if (!connection) {
      throw new BadRequestError("Strava connection not found")
    }

    if (connection.getString("status") !== "active" && connection.getString("status") !== "reauthorization_required") {
      throw new BadRequestError("Strava connection is not active")
    }

    var accessToken
    try {
      accessToken = this.getValidAccessToken(connection)
    } catch (error) {
      connection.set("status", "reauthorization_required")
      connection.set("last_error_code", "token_refresh_failed")
      connection.set("last_error_message", error && error.message ? error.message : "Failed to refresh Strava token")
      $app.save(connection)
      throw error
    }

    var afterEpoch = 0
    var cursor = connection.getString("last_sync_cursor")
    if (cursor) {
      afterEpoch = Math.floor(new Date(cursor).getTime() / 1000)
    }

    var page = 1
    var perPage = 50
    var maxPages = 3
    var allSummaries = []

    while (page <= maxPages) {
      var items = this.fetchAthleteActivities(accessToken, {
        afterEpoch: afterEpoch,
        page: page,
        perPage: perPage,
      })
      if (!items.length) {
        break
      }
      allSummaries = allSummaries.concat(items)
      if (items.length < perPage) {
        break
      }
      page += 1
    }

    var stats = {
      fetched: allSummaries.length,
      created: 0,
      updated: 0,
      ready: 0,
      partial: 0,
      generatable: 0,
      failed: 0,
    }
    var latestStartDate = cursor || ""

    for (var i = 0; i < allSummaries.length; i += 1) {
      var summary = allSummaries[i]
      var detail = null
      var streams = {}

      try {
        detail = this.fetchActivityDetail(accessToken, summary.id)
      } catch (_) {
        detail = summary
      }

      try {
        streams = this.fetchActivityStreams(accessToken, summary.id)
      } catch (_) {
        streams = {}
      }

      try {
        var outcome = this.upsertActivity({
          userId: userId,
          connection: connection,
          summary: summary,
          detail: detail,
          streams: streams,
        })

        if (outcome.created) {
          stats.created += 1
        } else {
          stats.updated += 1
        }

        if (outcome.ready) {
          stats.ready += 1
        } else {
          stats.partial += 1
        }

        if (outcome.generatable) {
          stats.generatable += 1
        }
      } catch (_) {
        stats.failed += 1
      }

      var startDate = (detail && detail.start_date) || summary.start_date || ""
      if (startDate && (!latestStartDate || new Date(startDate).getTime() > new Date(latestStartDate).getTime())) {
        latestStartDate = startDate
      }
    }

    var now = new Date().toISOString()
    connection.set("last_sync_at", now)
    connection.set("last_sync_cursor", latestStartDate || now)
    connection.set("status", "active")
    connection.set("last_error_code", "")
    connection.set("last_error_message", "")
    $app.save(connection)

    return {
      connection: connection,
      stats: stats,
    }
  },

  upsertConnection: function (userId, tokenData, athleteData, scopeGranted) {
    var collection = $app.findCollectionByNameOrId("strava_connections")
    var existing = null

    try {
      existing = $app.findFirstRecordByFilter(
        "strava_connections",
        "user = {:userId} && provider = 'strava'",
        { userId: userId }
      )
    } catch (_) {}

    var record = existing || new Record(collection)
    record.set("user", userId)
    record.set("provider", "strava")
    record.set("strava_athlete_id", String(athleteData.id))
    record.set("strava_username", athleteData.username || athleteData.firstname || "")
    record.set("scope_granted", scopeGranted || "")
    record.set("access_token_encrypted", $security.encrypt(tokenData.access_token, this.getEncryptionKey()))
    record.set("refresh_token_encrypted", $security.encrypt(tokenData.refresh_token, this.getEncryptionKey()))
    record.set("token_expires_at", new Date(tokenData.expires_at * 1000).toISOString())
    record.set("status", "active")
    record.set("last_error_code", "")
    record.set("last_error_message", "")
    $app.save(record)
    return record
  },
}

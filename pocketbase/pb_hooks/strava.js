module.exports = {
  getPositiveIntEnv: function (key, fallback, maxValue) {
    var raw = $os.getenv(key)
    if (!raw) {
      return fallback
    }

    var value = parseInt(String(raw), 10)
    if (!Number.isFinite(value) || value < 1) {
      return fallback
    }

    if (typeof maxValue === "number" && value > maxValue) {
      return maxValue
    }

    return value
  },

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

  summarizeHttpError: function (response) {
    if (!response) {
      return "Unknown Strava API error"
    }

    var details = []
    if (response.json && typeof response.json === "object") {
      if (typeof response.json.message === "string" && response.json.message) {
        details.push(response.json.message)
      } else if (typeof response.json.errors === "string" && response.json.errors) {
        details.push(response.json.errors)
      } else if (Array.isArray(response.json.errors) && response.json.errors.length > 0) {
        details.push(JSON.stringify(response.json.errors))
      }
    }

    if (!details.length && typeof response.body === "string" && response.body) {
      details.push(response.body.slice(0, 200))
    }

    if (!details.length) {
      details.push("No response body")
    }

    return "HTTP " + response.statusCode + " - " + details.join(" | ")
  },

  throwStravaHttpError: function (label, response) {
    throw new BadRequestError(label + ": " + this.summarizeHttpError(response))
  },

  getStravaRequestTimeout: function () {
    return this.getPositiveIntEnv("STRAVA_HTTP_TIMEOUT_SECONDS", 15, 120)
  },

  getSyncPerPage: function () {
    return this.getPositiveIntEnv("STRAVA_SYNC_PER_PAGE", 10, 50)
  },

  getSyncMaxPages: function () {
    return this.getPositiveIntEnv("STRAVA_SYNC_MAX_PAGES", 1, 10)
  },

  getSyncMaxActivities: function () {
    return this.getPositiveIntEnv("STRAVA_SYNC_MAX_ACTIVITIES", 10, 100)
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

  getWebhookVerifyToken: function () {
    return this.getOptionalEnv("STRAVA_WEBHOOK_VERIFY_TOKEN", this.getStateSecret())
  },

  logEvent: function (userId, category, status, title, message, payload) {
    if (!userId) {
      return null
    }

    try {
      var collection = $app.findCollectionByNameOrId("sync_events")
      var record = new Record(collection)
      record.set("user", userId)
      record.set("provider", "strava")
      record.set("category", category)
      record.set("status", status)
      record.set("title", title)
      record.set("message", message || "")
      record.set("payload_json", payload || null)
      record.set("occurred_at", new Date().toISOString())
      $app.save(record)
      return record
    } catch (_) {
      return null
    }
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
      timeout: this.getStravaRequestTimeout(),
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      this.throwStravaHttpError("Strava token exchange failed", response)
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
      timeout: this.getStravaRequestTimeout(),
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      this.throwStravaHttpError("Strava token refresh failed", response)
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
      timeout: this.getStravaRequestTimeout(),
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      this.throwStravaHttpError("Failed to fetch Strava athlete", response)
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
      timeout: this.getStravaRequestTimeout(),
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      this.throwStravaHttpError("Failed to fetch activity detail", response)
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
      timeout: this.getStravaRequestTimeout(),
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      this.throwStravaHttpError("Failed to fetch athlete activities", response)
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
      timeout: this.getStravaRequestTimeout(),
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadRequestError("Failed to fetch activity streams")
    }

    return response.json || {}
  },

  getConnectionForUser: function (userId) {
    try {
      return $app.findFirstRecordByFilter(
        "strava_connections",
        "user = {:userId} && provider = 'strava'",
        { userId: userId }
      )
    } catch (_) {
      return null
    }
  },

  getConnectionByAthleteId: function (athleteId) {
    try {
      return $app.findFirstRecordByFilter(
        "strava_connections",
        "provider = 'strava' && strava_athlete_id = {:athleteId}",
        { athleteId: String(athleteId) }
      )
    } catch (_) {
      return null
    }
  },

  getStatusPayload: function (userId) {
    var connection = this.getConnectionForUser(userId)
    return {
      connected: !!connection && connection.getString("status") === "active",
      needsReauth: !!connection && connection.getString("status") === "reauthorization_required",
      connection: connection ? connection.publicExport() : null,
    }
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
    var rawVisibility = detail && typeof detail.visibility === "string"
      ? String(detail.visibility).toLowerCase()
      : ""

    if (rawVisibility === "everyone" || rawVisibility === "public") {
      return "public"
    }

    if (rawVisibility === "followers_only") {
      return "followers_only"
    }

    if (rawVisibility === "only_me" || rawVisibility === "private") {
      return "only_me"
    }

    if (rawVisibility === "unknown") {
      return "unknown"
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

  deleteActivityBySourceId: function (sourceActivityId, userId) {
    var activity = null
    try {
      activity = $app.findFirstRecordByFilter(
        "activities",
        "source = 'strava' && source_activity_id = {:sourceActivityId} && user = {:userId}",
        {
          sourceActivityId: String(sourceActivityId),
          userId: userId,
        }
      )
    } catch (_) {
      return false
    }

    if (!activity) {
      return false
    }

    var stream = this.findActivityStreamRecord(activity.id, userId)
    if (stream) {
      $app.delete(stream)
    }

    $app.delete(activity)
    return true
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
      this.logEvent(userId, "sync", "error", "Strava 同步失败", "当前用户还没有有效的 Strava 连接。", null)
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
      this.logEvent(userId, "sync", "error", "Strava 同步失败", "刷新 Strava access token 失败。", {
        error: error && error.message ? error.message : "token_refresh_failed",
      })
      throw error
    }

    var afterEpoch = 0
    var cursor = connection.getString("last_sync_cursor")
    if (cursor) {
      afterEpoch = Math.floor(new Date(cursor).getTime() / 1000)
    }

    var page = 1
    var perPage = this.getSyncPerPage()
    var maxPages = this.getSyncMaxPages()
    var maxActivities = this.getSyncMaxActivities()
    var allSummaries = []

    this.logEvent(userId, "sync", "info", "Strava 同步开始", "正在拉取最近活动并更新本地数据。", {
      afterEpoch: afterEpoch || null,
      perPage: perPage,
      maxPages: maxPages,
      maxActivities: maxActivities,
    })

    try {
      while (page <= maxPages && allSummaries.length < maxActivities) {
        var items = this.fetchAthleteActivities(accessToken, {
          afterEpoch: afterEpoch,
          page: page,
          perPage: perPage,
        })
        if (!items.length) {
          break
        }

        var remaining = maxActivities - allSummaries.length
        if (items.length > remaining) {
          items = items.slice(0, remaining)
        }

        allSummaries = allSummaries.concat(items)

        if (items.length < perPage || allSummaries.length >= maxActivities) {
          break
        }

        page += 1
      }
    } catch (error) {
      connection.set("last_error_code", "sync_fetch_failed")
      connection.set("last_error_message", error && error.message ? error.message : "Failed to fetch Strava activities")
      $app.save(connection)
      this.logEvent(userId, "sync", "error", "Strava 同步失败", "读取 Strava 活动列表失败。", {
        error: error && error.message ? error.message : "sync_fetch_failed",
      })
      throw error
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
        connection.set("last_sync_cursor", latestStartDate)
        $app.save(connection)
      }
    }

    var now = new Date().toISOString()
    connection.set("last_sync_at", now)
    connection.set("last_sync_cursor", latestStartDate || now)
    connection.set("status", "active")
    connection.set("last_error_code", "")
    connection.set("last_error_message", "")
    $app.save(connection)
    this.logEvent(
      userId,
      "sync",
      stats.failed > 0 ? "warning" : "success",
      stats.failed > 0 ? "Strava 同步完成（部分失败）" : "Strava 同步完成",
      "本次同步抓取 " + stats.fetched + " 条活动，新增 " + stats.created + " 条，更新 " + stats.updated + " 条，失败 " + stats.failed + " 条。" + (stats.fetched >= maxActivities ? " 已达到本次同步上限，下一次会继续从上次游标之后拉取。" : ""),
      {
        fetched: stats.fetched,
        created: stats.created,
        updated: stats.updated,
        ready: stats.ready,
        partial: stats.partial,
        generatable: stats.generatable,
        failed: stats.failed,
        maxActivities: maxActivities,
        limited: stats.fetched >= maxActivities,
      }
    )

    return {
      connection: connection,
      stats: stats,
    }
  },

  syncSingleActivity: function (connection, activityId) {
    if (!connection) {
      throw new BadRequestError("Strava connection not found")
    }

    var userId = connection.getString("user")
    var accessToken = this.getValidAccessToken(connection)
    var detail = this.fetchActivityDetail(accessToken, activityId)
    var streams = {}

    try {
      streams = this.fetchActivityStreams(accessToken, activityId)
    } catch (_) {
      streams = {}
    }

    var outcome = this.upsertActivity({
      userId: userId,
      connection: connection,
      summary: detail,
      detail: detail,
      streams: streams,
    })

    connection.set("last_webhook_at", new Date().toISOString())
    connection.set("last_error_code", "")
    connection.set("last_error_message", "")
    $app.save(connection)

    return outcome
  },

  revokeConnection: function (connection, reason) {
    if (!connection) {
      return null
    }

    connection.set("status", "revoked")
    connection.set("access_token_encrypted", "")
    connection.set("refresh_token_encrypted", "")
    connection.set("token_expires_at", null)
    connection.set("last_webhook_at", new Date().toISOString())
    connection.set("last_error_code", reason || "")
    connection.set("last_error_message", reason ? "Strava webhook reported deauthorization" : "")
    $app.save(connection)
    return connection
  },

  processWebhookEvent: function (payload) {
    var objectType = String(payload && payload.object_type || "")
    var aspectType = String(payload && payload.aspect_type || "")
    var objectId = payload && payload.object_id
    var ownerId = payload && payload.owner_id
    var updates = payload && typeof payload.updates === "object" && payload.updates ? payload.updates : {}

    if (!objectType || !aspectType || !ownerId) {
      return { ignored: true, reason: "missing_required_fields" }
    }

    var connection = this.getConnectionByAthleteId(ownerId)
    if (!connection) {
      return { ignored: true, reason: "connection_not_found" }
    }
    var userId = connection.getString("user")

    connection.set("last_webhook_at", new Date().toISOString())
    $app.save(connection)

    if (objectType === "athlete" && updates && updates.authorized === "false") {
      this.revokeConnection(connection, "webhook_deauthorized")
      this.logEvent(userId, "webhook", "warning", "Strava webhook：授权已撤销", "Strava 推送了 athlete deauthorize 事件，连接已被标记为 revoked。", payload)
      return { handled: true, action: "revoked" }
    }

    if (objectType !== "activity" || !objectId) {
      this.logEvent(userId, "webhook", "info", "Strava webhook：已忽略事件", "收到了暂不处理的 webhook 类型。", payload)
      return { ignored: true, reason: "unsupported_object_type" }
    }

    if (aspectType === "delete") {
      this.deleteActivityBySourceId(objectId, connection.getString("user"))
      this.logEvent(userId, "webhook", "warning", "Strava webhook：活动已删除", "本地已根据 webhook 删除对应活动记录。", payload)
      return { handled: true, action: "deleted" }
    }

    if (aspectType === "create" || aspectType === "update") {
      this.syncSingleActivity(connection, objectId)
      this.logEvent(
        userId,
        "webhook",
        "success",
        aspectType === "create" ? "Strava webhook：新活动已同步" : "Strava webhook：活动更新已同步",
        aspectType === "create" ? "检测到新活动，已按单条活动同步到本地。" : "检测到活动更新，已刷新本地活动和轨迹数据。",
        payload
      )
      return { handled: true, action: aspectType === "create" ? "synced_created_activity" : "synced_updated_activity" }
    }

    this.logEvent(userId, "webhook", "info", "Strava webhook：已忽略事件", "收到了暂不处理的 aspect type。", payload)
    return { ignored: true, reason: "unsupported_aspect_type" }
  },

  disconnect: function (userId) {
    var connection = this.getConnectionForUser(userId)
    if (!connection) {
      return {
        disconnected: true,
        connection: null,
      }
    }

    this.revokeConnection(connection, "")
    this.logEvent(userId, "connection", "warning", "Strava 已断开连接", "用户手动断开了当前 Strava 授权连接。", null)

    return {
      disconnected: true,
      connection: connection.publicExport(),
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

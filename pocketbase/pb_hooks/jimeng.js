module.exports = {
  getOptionalEnv: function (key, fallback) {
    var value = $os.getenv(key)
    return value || fallback
  },

  hasRequiredEnv: function (key) {
    return !!$os.getenv(key)
  },

  isConfigured: function () {
    return this.hasRequiredEnv("VOLCENGINE_ACCESS_KEY")
      && this.hasRequiredEnv("VOLCENGINE_SECRET_KEY")
      && this.hasRequiredEnv("JIMENG_REQ_KEY")
  },

  getConfig: function () {
    if (!this.isConfigured()) {
      throw new BadRequestError("Jimeng 4.6 is not configured")
    }

    return {
      accessKey: $os.getenv("VOLCENGINE_ACCESS_KEY"),
      secretKey: $os.getenv("VOLCENGINE_SECRET_KEY"),
      host: this.getOptionalEnv("JIMENG_API_HOST", "visual.volcengineapi.com"),
      region: this.getOptionalEnv("JIMENG_API_REGION", "cn-north-1"),
      service: this.getOptionalEnv("JIMENG_API_SERVICE", "cv"),
      version: this.getOptionalEnv("JIMENG_API_VERSION", "2022-08-31"),
      submitAction: this.getOptionalEnv("JIMENG_SUBMIT_ACTION", "CVSync2AsyncSubmitTask"),
      queryAction: this.getOptionalEnv("JIMENG_QUERY_ACTION", "CVSync2AsyncGetResult"),
      reqKey: $os.getenv("JIMENG_REQ_KEY"),
      negativePrompt: this.getOptionalEnv("JIMENG_NEGATIVE_PROMPT", ""),
      pollIntervalMs: Math.max(1000, Number(this.getOptionalEnv("JIMENG_POLL_INTERVAL_MS", "3000")) || 3000),
      pollMaxAttempts: Math.max(1, Number(this.getOptionalEnv("JIMENG_POLL_MAX_ATTEMPTS", "20")) || 20),
    }
  },

  toUtcDateParts: function (date) {
    var year = String(date.getUTCFullYear())
    var month = String(date.getUTCMonth() + 1).padStart(2, "0")
    var day = String(date.getUTCDate()).padStart(2, "0")
    var hour = String(date.getUTCHours()).padStart(2, "0")
    var minute = String(date.getUTCMinutes()).padStart(2, "0")
    var second = String(date.getUTCSeconds()).padStart(2, "0")

    return {
      shortDate: year + month + day,
      amzDate: year + month + day + "T" + hour + minute + second + "Z",
    }
  },

  encodeRFC3986: function (value) {
    return encodeURIComponent(String(value))
      .replace(/[!'()*]/g, function (match) {
        return "%" + match.charCodeAt(0).toString(16).toUpperCase()
      })
  },

  buildCanonicalQuery: function (query) {
    var keys = Object.keys(query || {}).sort()
    return keys
      .map(function (key) {
        return this.encodeRFC3986(key) + "=" + this.encodeRFC3986(query[key])
      }, this)
      .join("&")
  },

  buildCanonicalHeaders: function (headers) {
    var normalized = {}
    Object.keys(headers || {}).forEach(function (key) {
      normalized[String(key).toLowerCase()] = String(headers[key]).trim().replace(/\s+/g, " ")
    })

    var keys = Object.keys(normalized).sort()
    return {
      canonicalHeaders: keys
        .map(function (key) {
          return key + ":" + normalized[key]
        })
        .join("\n") + "\n",
      signedHeaders: keys.join(";"),
    }
  },

  buildSignatureHeaders: function (config, bodyString) {
    var requestTime = this.toUtcDateParts(new Date())
    var query = {
      Action: config.action,
      Version: config.version,
    }
    var headers = {
      "content-type": "application/json",
      host: config.host,
      "x-date": requestTime.amzDate,
    }
    var canonicalQuery = this.buildCanonicalQuery(query)
    var signed = this.buildCanonicalHeaders(headers)
    var payloadHash = $security.sha256(bodyString || "")
    var canonicalRequest = [
      "POST",
      "/",
      canonicalQuery,
      signed.canonicalHeaders,
      signed.signedHeaders,
      payloadHash,
    ].join("\n")

    var credentialScope = [
      requestTime.shortDate,
      config.region,
      config.service,
      "request",
    ].join("/")

    var stringToSign = [
      "HMAC-SHA256",
      requestTime.amzDate,
      credentialScope,
      $security.sha256(canonicalRequest),
    ].join("\n")

    var dateKey = $security.hs256(requestTime.shortDate, config.secretKey)
    var regionKey = $security.hs256(config.region, dateKey)
    var serviceKey = $security.hs256(config.service, regionKey)
    var signingKey = $security.hs256("request", serviceKey)
    var signature = $security.hs256(stringToSign, signingKey)

    return {
      queryString: canonicalQuery,
      headers: {
        "Content-Type": "application/json",
        Host: config.host,
        "X-Date": requestTime.amzDate,
        Authorization: "HMAC-SHA256 Credential="
          + config.accessKey
          + "/"
          + credentialScope
          + ", SignedHeaders="
          + signed.signedHeaders
          + ", Signature="
          + signature,
      },
    }
  },

  sendSignedRequest: function (action, body) {
    var config = this.getConfig()
    var bodyString = JSON.stringify(body || {})
    var signed = this.buildSignatureHeaders({
      action: action,
      version: config.version,
      region: config.region,
      service: config.service,
      host: config.host,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    }, bodyString)

    var response = $http.send({
      url: "https://" + config.host + "/?" + signed.queryString,
      method: "POST",
      headers: signed.headers,
      body: bodyString,
      timeout: 120,
    })

    var payload = response.json || {}
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadRequestError(this.extractErrorMessage(payload) || "Jimeng request failed")
    }

    if (payload.ResponseMetadata && payload.ResponseMetadata.Error) {
      throw new BadRequestError(payload.ResponseMetadata.Error.Message || "Jimeng request failed")
    }

    return payload
  },

  extractErrorMessage: function (payload) {
    if (!payload || typeof payload !== "object") {
      return ""
    }

    if (payload.error && typeof payload.error.message === "string") {
      return payload.error.message
    }

    if (payload.message && typeof payload.message === "string") {
      return payload.message
    }

    if (payload.ResponseMetadata && payload.ResponseMetadata.Error && payload.ResponseMetadata.Error.Message) {
      return payload.ResponseMetadata.Error.Message
    }

    if (payload.Result && payload.Result.RespJson && payload.Result.RespJson.message) {
      return payload.Result.RespJson.message
    }

    return ""
  },

  buildPrompt: function (activityRecord, stylePreset, renderOptions) {
    var sportType = activityRecord.getString("sport_type") || "outdoor activity"
    var title = activityRecord.getString("name") || "Untitled activity"
    var distanceMeters = activityRecord.getFloat("distance_meters") || 0
    var distanceKm = distanceMeters > 0 ? (distanceMeters / 1000).toFixed(1) + " km" : "unknown distance"
    var startDate = activityRecord.getString("start_date") || ""

    var stylePromptMap = {
      sketch: "pencil sketch, delicate line art, paper texture, understated monochrome palette",
      watercolor: "watercolor wash, soft edges, handmade paper texture, airy artistic mood",
      poster: "graphic poster composition, bold typography area, editorial layout, premium print feel",
    }

    var ratioPromptMap = {
      portrait: "portrait poster composition",
      square: "square social-share composition",
      landscape: "wide landscape composition",
    }

    var titleInstruction = renderOptions.includeTitle
      ? "Leave a clean title area at the top for activity title and date."
      : "Do not add decorative text."

    return [
      "Create a premium hand-drawn route artwork inspired by a Strava activity.",
      "The main subject must be a single elegant route path with minimal map abstraction.",
      "No people, no vehicles, no photorealistic scenery, no app UI, no watermark.",
      "Style:",
      stylePromptMap[stylePreset] || stylePromptMap.sketch,
      ". Composition:",
      ratioPromptMap[renderOptions.aspectRatio] || ratioPromptMap.portrait,
      ".",
      titleInstruction,
      "Activity:",
      title + ",",
      sportType + ",",
      distanceKm + ",",
      startDate || "date unavailable",
      ".",
    ].join(" ")
  },

  buildSubmitBody: function (activityRecord, stylePreset, renderOptions, routeBaseImageUrl) {
    var config = this.getConfig()
    if (!routeBaseImageUrl) {
      throw new BadRequestError("Missing route base image URL for Jimeng image-to-image render")
    }

    var body = {
      req_key: config.reqKey,
      prompt: this.buildPrompt(activityRecord, stylePreset, renderOptions),
      image_urls: [routeBaseImageUrl],
      return_url: true,
    }

    if (config.negativePrompt) {
      body.negative_prompt = config.negativePrompt
    }

    return body
  },

  extractTaskId: function (payload) {
    if (!payload || typeof payload !== "object") {
      return ""
    }

    var result = payload.Result || {}
    var respJson = result.RespJson || {}
    var data = respJson.data || {}

    return String(
      result.TaskId
        || result.task_id
        || respJson.task_id
        || data.task_id
        || data.id
        || ""
    )
  },

  extractTaskStatus: function (payload) {
    if (!payload || typeof payload !== "object") {
      return ""
    }

    var result = payload.Result || {}
    var respJson = result.RespJson || {}
    var data = respJson.data || {}

    return String(
      result.Status
        || result.status
        || data.status
        || respJson.status
        || ""
    ).toLowerCase()
  },

  extractImageAsset: function (payload) {
    if (!payload || typeof payload !== "object") {
      return null
    }

    var result = payload.Result || {}
    var respJson = result.RespJson || {}
    var data = respJson.data || {}
    var imageUrls = []

    if (Array.isArray(result.ImageUrls)) {
      imageUrls = imageUrls.concat(result.ImageUrls)
    }
    if (Array.isArray(data.image_urls)) {
      imageUrls = imageUrls.concat(data.image_urls)
    }
    if (typeof data.image_url === "string") {
      imageUrls.push(data.image_url)
    }

    var firstUrl = imageUrls.find(function (value) {
      return typeof value === "string" && value.length > 0
    })

    if (firstUrl) {
      return {
        kind: "url",
        value: firstUrl,
      }
    }

    if (typeof data.binary_data_base64 === "string" && data.binary_data_base64.length > 0) {
      return {
        kind: "base64",
        value: data.binary_data_base64,
      }
    }

    return null
  },

  pollTaskResult: function (taskId) {
    var config = this.getConfig()

    for (var attempt = 0; attempt < config.pollMaxAttempts; attempt += 1) {
      var payload = this.sendSignedRequest(config.queryAction, {
        req_key: config.reqKey,
        task_id: taskId,
      })
      var status = this.extractTaskStatus(payload)

      if (status === "done" || status === "succeeded" || status === "success") {
        return payload
      }

      if (status === "not_found" || status === "failed" || status === "error") {
        throw new BadRequestError(this.extractErrorMessage(payload) || "Jimeng task failed")
      }

      sleep(config.pollIntervalMs)
    }

    throw new BadRequestError("Jimeng task polling timed out")
  },

  render: function (activityRecord, stylePreset, renderOptions, routeBaseImageUrl) {
    var config = this.getConfig()
    var submitPayload = this.sendSignedRequest(config.submitAction, this.buildSubmitBody(activityRecord, stylePreset, renderOptions, routeBaseImageUrl))
    var taskId = this.extractTaskId(submitPayload)

    if (!taskId) {
      throw new BadRequestError(this.extractErrorMessage(submitPayload) || "Jimeng submit response missing task id")
    }

    var resultPayload = this.pollTaskResult(taskId)
    var imageAsset = this.extractImageAsset(resultPayload)
    if (!imageAsset) {
      throw new BadRequestError("Jimeng result missing image output")
    }

    return {
      taskId: taskId,
      requestId: resultPayload.ResponseMetadata ? resultPayload.ResponseMetadata.RequestId || "" : "",
      imageAsset: imageAsset,
      rawResult: resultPayload,
    }
  },
}

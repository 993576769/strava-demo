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
      submitAction: this.getOptionalEnv("JIMENG_SUBMIT_ACTION", "CVSync2AsyncSubmitTask"),
      queryAction: this.getOptionalEnv("JIMENG_QUERY_ACTION", "CVSync2AsyncGetResult"),
      reqKey: $os.getenv("JIMENG_REQ_KEY"),
      negativePrompt: this.getOptionalEnv("JIMENG_NEGATIVE_PROMPT", ""),
      pollIntervalMs: Math.max(1000, Number(this.getOptionalEnv("JIMENG_POLL_INTERVAL_MS", "3000")) || 3000),
      pollMaxAttempts: Math.max(1, Number(this.getOptionalEnv("JIMENG_POLL_MAX_ATTEMPTS", "20")) || 20),
      helperHost: this.getOptionalEnv("JIMENG_HELPER_HOST", "127.0.0.1"),
      helperPort: Math.max(1, Number(this.getOptionalEnv("JIMENG_HELPER_PORT", "3210")) || 3210),
    }
  },

  getHelperBaseUrl: function () {
    var config = this.getConfig()
    return "http://" + config.helperHost + ":" + config.helperPort
  },

  callHelper: function (action, body) {
    var response = $http.send({
      url: this.getHelperBaseUrl() + "/openapi",
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: action,
        body: body || {},
      }),
      timeout: 120,
    })

    var envelope = response.json || {}
    var payload = envelope.payload || {}

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadRequestError(
        this.formatErrorMessage(
          payload,
          this.extractErrorMessage(payload)
            || envelope.error
            || payload.message
            || "Jimeng helper request failed",
          envelope.status || response.statusCode
        )
      )
    }

    if (payload.ResponseMetadata && payload.ResponseMetadata.Error) {
      throw new BadRequestError(this.formatErrorMessage(payload, payload.ResponseMetadata.Error.Message || "Jimeng request failed"))
    }

    if (typeof payload.code !== "undefined" && !this.isDirectSuccessCode(payload.code)) {
      throw new BadRequestError(this.formatErrorMessage(payload, this.extractErrorMessage(payload) || "Jimeng request failed"))
    }

    return payload
  },

  extractErrorMessage: function (payload) {
    if (!payload || typeof payload !== "object") {
      return ""
    }

    var data = payload.data || {}

    if (payload.error && typeof payload.error.message === "string") {
      return payload.error.message
    }

    if (typeof payload.error === "string") {
      return payload.error
    }

    if (payload.message && typeof payload.message === "string" && !this.isSuccessMessage(payload.message)) {
      return payload.message
    }

    if (data.message && typeof data.message === "string" && !this.isSuccessMessage(data.message)) {
      return data.message
    }

    if (payload.ResponseMetadata && payload.ResponseMetadata.Error && payload.ResponseMetadata.Error.Message) {
      return payload.ResponseMetadata.Error.Message
    }

    if (
      payload.Result
      && payload.Result.RespJson
      && payload.Result.RespJson.message
      && !this.isSuccessMessage(payload.Result.RespJson.message)
    ) {
      return payload.Result.RespJson.message
    }

    return ""
  },

  extractErrorCode: function (payload) {
    if (!payload || typeof payload !== "object") {
      return ""
    }

    var data = payload.data || {}
    var result = payload.Result || {}
    var respJson = result.RespJson || {}
    var respData = respJson.data || {}

    return String(
      payload.code
        || data.code
        || result.Code
        || result.code
        || respJson.code
        || respData.code
        || ""
    )
  },

  formatErrorMessage: function (payload, fallbackMessage, httpStatus) {
    var code = this.extractErrorCode(payload)
    var message = String(fallbackMessage || "Jimeng request failed")
    var status = String(httpStatus || payload && payload.status || "").trim()

    if (code && status) {
      return "JIMENG_ERROR_CODE=" + code + " HTTP_STATUS=" + status + " " + message
    }

    if (code) {
      return "JIMENG_ERROR_CODE=" + code + " " + message
    }

    return message
  },

  isDirectSuccessCode: function (value) {
    return value === 0 || value === 10000 || value === "0" || value === "10000"
  },

  isSuccessMessage: function (value) {
    var normalized = String(value || "").trim().toLowerCase()
    return normalized === "success" || normalized === "success."
  },

  getDirectData: function (payload) {
    if (!payload || typeof payload !== "object") {
      return {}
    }

    if (payload.data && typeof payload.data === "object") {
      return payload.data
    }

    return {}
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
      "Multi-image instruction: image 1 is the route structure image, image 2 is the background style reference image.",
      "Please perform composition and style transfer: keep the route subject from image 1, and use image 2 only to generate the background style and overall atmosphere.",
      "The route subject must strictly follow image 1 and preserve its topology, bends, turns, loops, out-and-back structure, and overall silhouette.",
      "Treat image 1 like a tracing guide or control image. The final route must match image 1 shape-to-shape.",
      "Image 2 may only influence background style, palette, paper texture, decorative elements, and composition mood. It must never replace, cover, or reshape the route from image 1.",
      "If the style from image 2 conflicts with the route from image 1, always preserve the route from image 1.",
      "The background map texture and style elements must fill the entire canvas as a full-bleed background. Do not keep them only in the center, and do not leave large blank borders or empty margins.",
      "Small place names or map labels are allowed if they help identify the location, but they must stay subtle and must not cover the route or turn the image into a literal map screenshot.",
      "No people, no vehicles, no app UI, no watermark, no dominant text.",
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
      "Again: keep the route subject from image 1, and use image 2 only for background style.",
    ].join(" ")
  },

  buildSubmitBody: function (activityRecord, stylePreset, renderOptions, routeBaseImageUrl) {
    var config = this.getConfig()
    var art = require(__hooks + "/art.js")
    var referenceImageUrl = art.getTemplateReferenceImageUrl()
    var imageUrls = []
    if (!routeBaseImageUrl) {
      throw new BadRequestError("Missing route base image URL for Jimeng image-to-image render")
    }

    imageUrls.push(routeBaseImageUrl)
    if (referenceImageUrl) {
      imageUrls.push(referenceImageUrl)
    }

    var body = {
      req_key: config.reqKey,
      prompt: this.buildPrompt(activityRecord, stylePreset, renderOptions),
      image_urls: imageUrls,
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

    var directData = this.getDirectData(payload)
    var result = payload.Result || {}
    var respJson = result.RespJson || {}
    var data = respJson.data || {}

    return String(
      directData.task_id
        || directData.id
        || result.TaskId
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

    var directData = this.getDirectData(payload)
    var result = payload.Result || {}
    var respJson = result.RespJson || {}
    var data = respJson.data || {}

    var rawStatus = String(
      directData.status
        || directData.task_status
        || result.Status
        || result.status
        || data.status
        || respJson.status
        || ""
    ).toLowerCase()

    if (rawStatus === "1") {
      return "processing"
    }
    if (rawStatus === "2") {
      return "success"
    }
    if (rawStatus === "3") {
      return "failed"
    }

    return rawStatus
  },

  extractImageAsset: function (payload) {
    if (!payload || typeof payload !== "object") {
      return null
    }

    var directData = this.getDirectData(payload)
    var result = payload.Result || {}
    var respJson = result.RespJson || {}
    var data = respJson.data || {}
    var imageUrls = []
    var base64Images = []

    if (Array.isArray(directData.image_urls)) {
      imageUrls = imageUrls.concat(directData.image_urls)
    }
    if (typeof directData.image_url === "string") {
      imageUrls.push(directData.image_url)
    }

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

    if (Array.isArray(directData.binary_data_base64)) {
      base64Images = base64Images.concat(directData.binary_data_base64)
    }
    if (typeof directData.binary_data_base64 === "string") {
      base64Images.push(directData.binary_data_base64)
    }
    if (Array.isArray(data.binary_data_base64)) {
      base64Images = base64Images.concat(data.binary_data_base64)
    }
    if (typeof data.binary_data_base64 === "string") {
      base64Images.push(data.binary_data_base64)
    }

    var firstBase64 = base64Images.find(function (value) {
      return typeof value === "string" && value.length > 0
    })

    if (firstBase64) {
      return {
        kind: "base64",
        value: firstBase64,
      }
    }

    return null
  },

  pollTaskResult: function (taskId) {
    var config = this.getConfig()

    for (var attempt = 0; attempt < config.pollMaxAttempts; attempt += 1) {
      var payload = this.callHelper(config.queryAction, {
        req_key: config.reqKey,
        task_id: taskId,
      })
      var status = this.extractTaskStatus(payload)
      var directCode = payload && typeof payload === "object" ? payload.code : null

      if (status === "done" || status === "succeeded" || status === "success") {
        return payload
      }

      if (!status && this.isDirectSuccessCode(directCode) && this.extractImageAsset(payload)) {
        return payload
      }

      if (status === "not_found" || status === "failed" || status === "error") {
        throw new BadRequestError(this.formatErrorMessage(payload, this.extractErrorMessage(payload) || "Jimeng task failed"))
      }

      sleep(config.pollIntervalMs)
    }

    throw new BadRequestError("Jimeng task polling timed out")
  },

  render: function (activityRecord, stylePreset, renderOptions, routeBaseImageUrl) {
    var config = this.getConfig()
    var submitBody = this.buildSubmitBody(activityRecord, stylePreset, renderOptions, routeBaseImageUrl)
    var submitPayload = this.callHelper(config.submitAction, submitBody)
    var taskId = this.extractTaskId(submitPayload)

    if (!taskId) {
      throw new BadRequestError(this.formatErrorMessage(submitPayload, this.extractErrorMessage(submitPayload) || "Jimeng submit response missing task id"))
    }

    var resultPayload = this.pollTaskResult(taskId)
    var imageAsset = this.extractImageAsset(resultPayload)
    if (!imageAsset) {
      throw new BadRequestError("Jimeng result missing image output")
    }

    return {
      taskId: taskId,
      requestId: resultPayload.ResponseMetadata ? resultPayload.ResponseMetadata.RequestId || "" : "",
      referenceImageUrl: require(__hooks + "/art.js").getTemplateReferenceImageUrl(),
      imageAsset: imageAsset,
      rawResult: resultPayload,
    }
  },
}

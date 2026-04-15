module.exports = {
  getOptionalEnv: function (key, fallback) {
    var value = $os.getenv(key)
    return value || fallback
  },

  hasRequiredEnv: function (key) {
    return !!$os.getenv(key)
  },

  isConfigured: function () {
    return this.hasRequiredEnv("ARK_API_KEY")
  },

  getConfig: function () {
    if (!this.isConfigured()) {
      throw new BadRequestError("Doubao Seedream is not configured")
    }

    return {
      model: this.getOptionalEnv("DOUBAO_SEEDREAM_MODEL", "doubao-seedream-5-0-260128"),
      helperHost: this.getOptionalEnv("DOUBAO_HELPER_HOST", "127.0.0.1"),
      helperPort: Math.max(1, Number(this.getOptionalEnv("DOUBAO_HELPER_PORT", "3211")) || 3211),
      size: this.getOptionalEnv("DOUBAO_IMAGE_SIZE", "2K"),
      outputFormat: this.getOptionalEnv("DOUBAO_OUTPUT_FORMAT", "png"),
      responseFormat: this.getOptionalEnv("DOUBAO_RESPONSE_FORMAT", "url") === "b64_json" ? "b64_json" : "url",
    }
  },

  getHelperBaseUrl: function () {
    var config = this.getConfig()
    return "http://" + config.helperHost + ":" + config.helperPort
  },

  callHelper: function (body) {
    var response = $http.send({
      url: this.getHelperBaseUrl() + "/images/generate",
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body || {}),
      timeout: 120,
    })

    var payload = response.json || {}

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadRequestError(this.formatErrorMessage(payload))
    }

    return payload
  },

  formatErrorMessage: function (payload) {
    var status = payload && payload.status ? String(payload.status) : ""
    var code = payload && payload.code ? String(payload.code) : ""
    var message = payload && payload.error ? String(payload.error) : "Doubao request failed"

    if (status) {
      return "DOUBAO_ERROR_CODE=" + status + (code ? " PROVIDER_CODE=" + code : "") + " " + message
    }

    return message
  },

  buildPrompt: function (activityRecord, templateKey, renderOptions) {
    var art = require(__hooks + "/art.js")
    var sportType = activityRecord.getString("sport_type") || "户外运动"
    var title = activityRecord.getString("name") || "Untitled activity"
    var distanceMeters = activityRecord.getFloat("distance_meters") || 0
    var distanceKm = distanceMeters > 0 ? (distanceMeters / 1000).toFixed(1) + " 公里" : "未知距离"
    var startDate = activityRecord.getString("start_date") || ""
    var templateConfig = art.getPromptTemplateConfig("doubao-seedream", templateKey)

    var titleInstruction = renderOptions.includeTitle
      ? "为标题和日期预留干净的信息区，但不要直接渲染真实文字。"
      : "不要出现任何文字、logo 或界面元素。"

    return art.renderPromptTemplate(
      templateConfig.promptTemplate,
      {
        title_instruction: titleInstruction,
        title: title,
        sport_type: sportType,
        distance: distanceKm,
        start_date: startDate || "日期未知",
      }
    )
  },

  extractImageAsset: function (payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.data) || !payload.data.length) {
      throw new BadRequestError("Doubao response missing image data")
    }

    var first = payload.data[0] || {}
    if (typeof first.url === "string" && first.url) {
      return {
        kind: "url",
        value: first.url,
      }
    }

    if (typeof first.b64Json === "string" && first.b64Json) {
      return {
        kind: "base64",
        value: first.b64Json,
      }
    }

    throw new BadRequestError("Doubao response does not contain a usable image asset")
  },

  render: function (activityRecord, templateKey, renderOptions, routeBaseImageUrl) {
    var config = this.getConfig()
    var art = require(__hooks + "/art.js")
    var templateConfig = art.getPromptTemplateConfig("doubao-seedream", templateKey)
    var referenceImageUrl = templateConfig.referenceImageUrl || ""
    var inputImages = [routeBaseImageUrl]
    if (!routeBaseImageUrl) {
      throw new BadRequestError("Missing route base image URL for Doubao image-to-image render")
    }

    if (referenceImageUrl) {
      inputImages.push(referenceImageUrl)
    }

    var requestBody = {
      model: config.model,
      prompt: this.buildPrompt(activityRecord, templateKey, renderOptions),
      size: config.size,
      outputFormat: config.outputFormat,
      responseFormat: config.responseFormat,
      image: inputImages,
      watermark: config.watermark,
      sequentialImageGeneration: "disabled",
    }
    var payload = this.callHelper(requestBody)

    return {
      model: config.model,
      sourceImageUrl: routeBaseImageUrl,
      referenceImageUrl: referenceImageUrl,
      sourceImageUrls: payload && Array.isArray(payload.image)
        ? payload.image
        : payload && Array.isArray(payload.images)
          ? payload.images
          : [routeBaseImageUrl],
      fallbackUsed: !!(payload && payload.fallbackUsed),
      imageAsset: this.extractImageAsset(payload),
      rawResult: payload,
    }
  },
}

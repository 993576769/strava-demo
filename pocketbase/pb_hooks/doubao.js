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
      watermark: this.getOptionalEnv("DOUBAO_WATERMARK", "true") !== "false",
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

  buildPrompt: function (activityRecord, stylePreset, renderOptions) {
    var sportType = activityRecord.getString("sport_type") || "户外运动"
    var title = activityRecord.getString("name") || "Untitled activity"
    var distanceMeters = activityRecord.getFloat("distance_meters") || 0
    var distanceKm = distanceMeters > 0 ? (distanceMeters / 1000).toFixed(1) + " 公里" : "未知距离"
    var startDate = activityRecord.getString("start_date") || ""

    var stylePromptMap = {
      sketch: "手绘速写，细腻线稿，纸张肌理，克制配色，保留主路径的清晰识别度",
      watercolor: "水彩晕染，柔和色块，纸张肌理，轻盈氛围，保留主路径的清晰识别度",
      poster: "艺术海报构图，强烈视觉冲击，版式感，电影级光影，保留主路径的清晰识别度",
    }

    var ratioPromptMap = {
      portrait: "竖版海报构图",
      square: "方形社交媒体构图",
      landscape: "横版宽幅构图",
    }

    var titleInstruction = renderOptions.includeTitle
      ? "为标题和日期预留干净的信息区，但不要直接渲染真实文字。"
      : "不要出现任何文字、logo 或界面元素。"

    return [
      "以输入图片为基础进行图生图。",
      "多图输入说明：图片1是路线结构图，图片2是背景风格参考图。",
      "请执行组合与风格迁移：保留图片1中的路线主体，参考图片2生成背景风格与画面氛围。",
      "路线主体必须严格使用图片1的路线形状与走向，完整保留路线拓扑、弯折、拐点、闭环、往返关系和整体轮廓，不得改写、增删、拉直、平滑或重绘为另一条路线。",
      "把图片1当成路线描图模板或控制图，输出中的路线要与图片1逐形对应。",
      "图片2只提供背景风格、配色、纸张肌理、装饰元素和整体气质，不能替代、覆盖或主导图片1中的路线结构。",
      "如果图片2的风格与图片1的路线结构冲突，始终优先保留图片1的路线。",
      "背景地图纹理与风格元素必须铺满整个画面，做成全幅满版背景，不要只出现在中间区域，不要留下大面积空白边缘、白边或留白框。",
      "可以在背景中少量显示地名、地点标签或地图文字，帮助识别地点，但必须简洁克制，不要遮挡路线，不要变成真实地图截图。",
      "禁止人物、车辆、应用 UI、品牌标识、水印和多余文字。",
      "风格：",
      stylePromptMap[stylePreset] || stylePromptMap.sketch,
      "。",
      "构图：",
      ratioPromptMap[renderOptions.aspectRatio] || ratioPromptMap.portrait,
      "。",
      titleInstruction,
      "活动信息：",
      title + "，",
      sportType + "，",
      distanceKm + "，",
      startDate || "日期未知",
      "。",
      "再次强调：保留图片1的路线主体，参考图片2生成背景风格。",
    ].join("")
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

  render: function (activityRecord, stylePreset, renderOptions, routeBaseImageUrl) {
    var config = this.getConfig()
    var art = require(__hooks + "/art.js")
    var referenceImageUrl = art.getTemplateReferenceImageUrl()
    var inputImages = [routeBaseImageUrl]
    if (!routeBaseImageUrl) {
      throw new BadRequestError("Missing route base image URL for Doubao image-to-image render")
    }

    if (referenceImageUrl) {
      inputImages.push(referenceImageUrl)
    }

    var requestBody = {
      model: config.model,
      prompt: this.buildPrompt(activityRecord, stylePreset, renderOptions),
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

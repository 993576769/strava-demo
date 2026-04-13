module.exports = {
  supportedAspectRatios: ["portrait", "square", "landscape"],
  defaultPromptTemplates: {
    "doubao-seedream": {
      templateKey: "doubao-seedream-default",
      referenceImageUrl: "https://todo-demo-744531146978-ap-east-1-an.s3.ap-east-1.amazonaws.com/template/openai_images_6Ksy3QUezrWe2tkrl7TZcA18ILw2_pWTkyPf1DSPoOKW1FCzD_generated_map.png",
      promptTemplate: "以输入图片为基础进行图生图。多图输入说明：图片1是路线结构图，图片2是背景风格参考图。请执行组合与风格迁移：保留图片1中的路线主体，参考图片2生成背景风格与画面氛围。路线主体必须严格使用图片1的路线形状与走向，完整保留路线拓扑、弯折、拐点、闭环、往返关系和整体轮廓，不得改写、增删、拉直、平滑或重绘为另一条路线。把图片1当成路线描图模板或控制图，输出中的路线要与图片1逐形对应。图片2只提供背景风格、配色、纸张肌理、装饰元素和整体气质，不能替代、覆盖或主导图片1中的路线结构。如果图片2的风格与图片1的路线结构冲突，始终优先保留图片1的路线。背景地图纹理与风格元素必须铺满整个画面，做成全幅满版背景，不要只出现在中间区域，不要留下大面积空白边缘、白边或留白框。可以在背景中少量显示地名、地点标签或地图文字，帮助识别地点，但必须简洁克制，不要遮挡路线，不要变成真实地图截图。禁止人物、车辆、应用 UI、品牌标识、水印和多余文字。风格要求：以参考图中的地图海报风格、配色、纸张肌理和整体氛围为准，同时保持路线主体的高可读性。构图：{{ratio_prompt}}。{{title_instruction}} 活动信息：{{title}}，{{sport_type}}，{{distance}}，{{start_date}}。再次强调：保留图片1的路线主体，参考图片2生成背景风格。",
    },
  },

  normalizeTemplateKey: function (value, provider) {
    var templateKey = String(value || "").trim()
    if (!templateKey) {
      return this.getPromptTemplateConfig(provider || "doubao-seedream").templateKey
    }
    return templateKey
  },

  normalizeAspectRatio: function (value) {
    var ratio = String(value || "portrait").trim().toLowerCase()
    if (this.supportedAspectRatios.indexOf(ratio) === -1) {
      throw new BadRequestError("Unsupported aspect ratio")
    }
    return ratio
  },

  normalizeRenderOptions: function (value) {
    var options = value && typeof value === "object" ? value : {}
    return {
      aspectRatio: this.normalizeAspectRatio(options.aspectRatio),
      includeTitle: options.includeTitle !== false,
      includeStats: options.includeStats !== false,
      version: "v1",
    }
  },

  getPromptTemplateConfig: function (provider, templateKey) {
    var normalizedProvider = String(provider || "").trim()
    var fallback = this.defaultPromptTemplates["doubao-seedream"]

    try {
      if (templateKey) {
        var recordByKey = $app.findFirstRecordByFilter(
          "art_prompt_templates",
          "provider = {:provider} && template_key = {:templateKey} && is_active = true",
          {
            provider: normalizedProvider,
            templateKey: String(templateKey || "").trim(),
          }
        )

        return {
          templateKey: recordByKey.getString("template_key") || fallback.templateKey,
          promptTemplate: recordByKey.getString("prompt_template") || fallback.promptTemplate,
          referenceImageUrl: recordByKey.getString("reference_image_url") || fallback.referenceImageUrl,
        }
      }

      var record = $app.findFirstRecordByFilter(
        "art_prompt_templates",
        "provider = {:provider} && is_active = true",
        {
          provider: normalizedProvider,
        }
      )

      return {
        templateKey: record.getString("template_key") || fallback.templateKey,
        promptTemplate: record.getString("prompt_template") || fallback.promptTemplate,
        referenceImageUrl: record.getString("reference_image_url") || fallback.referenceImageUrl,
      }
    } catch (_) {
      return fallback
    }
  },

  getTemplateReferenceImageUrl: function (provider) {
    return this.getPromptTemplateConfig(provider).referenceImageUrl || ""
  },

  renderPromptTemplate: function (template, variables) {
    var output = String(template || "")
    var keys = Object.keys(variables || {})
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i]
      var pattern = new RegExp("\\{\\{" + key + "\\}\\}", "g")
      output = output.replace(pattern, String(variables[key] || ""))
    }
    return output
  },

  buildPromptSnapshot: function (activity, templateKey, renderOptions) {
    var name = activity.getString("name") || "Untitled activity"
    var sportType = activity.getString("sport_type") || "activity"
    var distanceMeters = activity.getFloat("distance_meters") || 0
    var distanceKm = distanceMeters > 0 ? (distanceMeters / 1000).toFixed(1) + "km" : "unknown distance"

    return [
      "Generate a hand-drawn route artwork.",
      "Template key: " + templateKey + ".",
      "Aspect ratio: " + renderOptions.aspectRatio + ".",
      "Include title: " + (renderOptions.includeTitle ? "yes" : "no") + ".",
      "Include stats: " + (renderOptions.includeStats ? "yes" : "no") + ".",
      "Activity title: " + name + ".",
      "Sport type: " + sportType + ".",
      "Distance: " + distanceKm + ".",
    ].join(" ")
  },

  findStreamForActivity: function (app, userId, activityId) {
    try {
      return app.findFirstRecordByFilter(
        "activity_streams",
        "user = {:userId} && activity = {:activityId}",
        {
          userId: userId,
          activityId: activityId,
        }
      )
    } catch (_) {
      return null
    }
  },

  findReusableJob: function (app, userId, activityId, templateKey, renderOptionsHash) {
    try {
      return app.findFirstRecordByFilter(
        "art_jobs",
        "user = {:userId} && activity = {:activityId} && style_preset = {:templateKey} && render_options_hash = {:renderOptionsHash} && (status = 'pending' || status = 'processing')",
        {
          userId: userId,
          activityId: activityId,
          templateKey: templateKey,
          renderOptionsHash: renderOptionsHash,
        }
      )
    } catch (_) {
      return null
    }
  },

  assertUserIsActive: function (userRecord) {
    if (!userRecord || !userRecord.getBool("is_active")) {
      throw new ForbiddenError("User is not active")
    }
  },

  createJob: function (e) {
    var body = e.requestInfo().body || {}
    var activityId = String(body.activityId || body.activity_id || "").trim()

    if (!activityId) {
      throw new BadRequestError("Missing activityId")
    }

    var userId = e.auth.id
    this.assertUserIsActive(e.auth)
    var activity = e.app.findFirstRecordByFilter(
      "activities",
      "id = {:activityId} && user = {:userId}",
      {
        activityId: activityId,
        userId: userId,
      }
    )

    if (!activity.getBool("is_generatable")) {
      throw new BadRequestError(activity.getString("generatable_reason") || "This activity is not generatable yet")
    }

    var templateKey = this.normalizeTemplateKey(body.templateKey || body.template_key || body.stylePreset || body.style_preset, "doubao-seedream")
    var renderOptions = this.normalizeRenderOptions(body.renderOptions || body.render_options_json)
    var renderOptionsHash = $security.sha256(JSON.stringify(renderOptions))

    var reusableJob = this.findReusableJob(e.app, userId, activityId, templateKey, renderOptionsHash)
    if (reusableJob) {
      return {
        job: reusableJob.publicExport(),
        reused: true,
      }
    }

    var stream = this.findStreamForActivity(e.app, userId, activityId)
    var collection = e.app.findCollectionByNameOrId("art_jobs")
    var record = new Record(collection)

    record.set("user", userId)
    record.set("activity", activityId)
    if (stream) {
      record.set("stream", stream.id)
    }
    record.set("status", "pending")
    record.set("style_preset", templateKey)
    record.set("prompt_snapshot", this.buildPromptSnapshot(activity, templateKey, renderOptions))
    record.set("render_options_json", renderOptions)
    record.set("render_options_hash", renderOptionsHash)
    record.set("attempt_count", 0)
    record.set("queued_at", new Date().toISOString())

    e.app.save(record)

    return {
      job: record.publicExport(),
      reused: false,
    }
  },
}

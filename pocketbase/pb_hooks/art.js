module.exports = {
  supportedAspectRatios: ["portrait", "square", "landscape"],
  normalizeTemplateKey: function (value, provider) {
    var templateKey = String(value || "").trim()
    if (!templateKey) {
      throw new BadRequestError("Missing templateKey")
    }
    return templateKey
  },

  normalizeAspectRatio: function (value) {
    var ratio = String(value || "square").trim().toLowerCase()
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
    var normalizedTemplateKey = String(templateKey || "").trim()
    if (!normalizedTemplateKey) {
      throw new BadRequestError("Missing templateKey")
    }

    var record = $app.findFirstRecordByFilter(
      "art_prompt_templates",
      "provider = {:provider} && template_key = {:templateKey} && is_active = true",
      {
        provider: normalizedProvider,
        templateKey: normalizedTemplateKey,
      }
    )

    var promptTemplate = record.getString("prompt_template")
    if (!promptTemplate) {
      throw new BadRequestError("Prompt template is empty")
    }

    return {
      templateKey: record.getString("template_key") || normalizedTemplateKey,
      promptTemplate: promptTemplate,
      referenceImageUrl: record.getString("reference_image_url") || "",
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
      "Prefer a square canvas unless a renderer-specific fallback overrides it.",
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

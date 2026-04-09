module.exports = {
  supportedStylePresets: ["sketch", "watercolor", "poster"],
  supportedAspectRatios: ["portrait", "square", "landscape"],

  normalizeStylePreset: function (value) {
    var preset = String(value || "sketch").trim().toLowerCase()
    if (this.supportedStylePresets.indexOf(preset) === -1) {
      throw new BadRequestError("Unsupported style preset")
    }
    return preset
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

  buildPromptSnapshot: function (activity, stylePreset, renderOptions) {
    var name = activity.getString("name") || "Untitled activity"
    var sportType = activity.getString("sport_type") || "activity"
    var distanceMeters = activity.getFloat("distance_meters") || 0
    var distanceKm = distanceMeters > 0 ? (distanceMeters / 1000).toFixed(1) + "km" : "unknown distance"

    return [
      "Generate a hand-drawn route artwork.",
      "Style preset: " + stylePreset + ".",
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

  findReusableJob: function (app, userId, activityId, stylePreset, renderOptionsHash) {
    try {
      return app.findFirstRecordByFilter(
        "art_jobs",
        "user = {:userId} && activity = {:activityId} && style_preset = {:stylePreset} && render_options_hash = {:renderOptionsHash} && (status = 'pending' || status = 'processing')",
        {
          userId: userId,
          activityId: activityId,
          stylePreset: stylePreset,
          renderOptionsHash: renderOptionsHash,
        }
      )
    } catch (_) {
      return null
    }
  },

  createJob: function (e) {
    var body = e.requestInfo().body || {}
    var activityId = String(body.activityId || body.activity_id || "").trim()

    if (!activityId) {
      throw new BadRequestError("Missing activityId")
    }

    var userId = e.auth.id
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

    var stylePreset = this.normalizeStylePreset(body.stylePreset || body.style_preset)
    var renderOptions = this.normalizeRenderOptions(body.renderOptions || body.render_options_json)
    var renderOptionsHash = $security.sha256(JSON.stringify(renderOptions))

    var reusableJob = this.findReusableJob(e.app, userId, activityId, stylePreset, renderOptionsHash)
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
    record.set("style_preset", stylePreset)
    record.set("prompt_snapshot", this.buildPromptSnapshot(activity, stylePreset, renderOptions))
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

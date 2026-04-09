module.exports = {
  getRequestedProvider: function (forceProvider) {
    if (forceProvider) {
      return forceProvider
    }

    var envProvider = String($os.getenv("ART_RENDER_PROVIDER") || "").trim().toLowerCase()
    if (envProvider === "mock" || envProvider === "jimeng46") {
      return envProvider
    }

    var jimeng = require(__hooks + "/jimeng.js")
    return jimeng.isConfigured() ? "jimeng46" : "mock"
  },

  getExistingResult: function (app, userId, jobId) {
    try {
      return app.findFirstRecordByFilter(
        "art_results",
        "job = {:jobId} && user = {:userId}",
        {
          jobId: jobId,
          userId: userId,
        }
      )
    } catch (_) {
      return null
    }
  },

  getJobContext: function (e, jobId) {
    var userId = e.auth.id
    var job = e.app.findFirstRecordByFilter(
      "art_jobs",
      "id = {:jobId} && user = {:userId}",
      {
        jobId: jobId,
        userId: userId,
      }
    )

    var activity = e.app.findFirstRecordByFilter(
      "activities",
      "id = {:activityId} && user = {:userId}",
      {
        activityId: job.getString("activity"),
        userId: userId,
      }
    )

    var stream = null
    var streamId = job.getString("stream")
    if (streamId) {
      try {
        stream = e.app.findFirstRecordByFilter(
          "activity_streams",
          "id = {:streamId} && user = {:userId}",
          {
            streamId: streamId,
            userId: userId,
          }
        )
      } catch (_) {}
    }

    return {
      userId: userId,
      job: job,
      activity: activity,
      stream: stream,
    }
  },

  getCanvasSize: function (aspectRatio) {
    var mockArt = require(__hooks + "/mock-art.js")
    return mockArt.aspectRatioSizes[aspectRatio] || mockArt.aspectRatioSizes.portrait
  },

  buildSubtitle: function (activityRecord) {
    var mockArt = require(__hooks + "/mock-art.js")
    return mockArt.subtitleText(activityRecord)
  },

  createResultRecord: function (e, params) {
    var collection = e.app.findCollectionByNameOrId("art_results")
    var record = new Record(collection)

    record.set("job", params.jobId)
    record.set("user", params.userId)
    record.set("activity", params.activityId)
    record.set("image_data_uri", params.imageDataUri)
    record.set("thumbnail_data_uri", params.thumbnailDataUri || params.imageDataUri)
    record.set("width", params.width || 0)
    record.set("height", params.height || 0)
    record.set("file_size", params.fileSize || 0)
    record.set("mime_type", params.mimeType || "image/png")
    record.set("style_preset", params.stylePreset)
    record.set("title_snapshot", params.title || "")
    record.set("subtitle_snapshot", params.subtitle || "")
    record.set("metadata_json", params.metadata || {})
    record.set("visibility", "private")
    e.app.save(record)

    return record
  },

  markJobProcessing: function (e, job, workerRef) {
    if (job.getString("status") === "canceled") {
      throw new BadRequestError("Canceled jobs can't be rendered")
    }

    var now = new Date().toISOString()
    job.set("status", "processing")
    if (!job.getString("started_at")) {
      job.set("started_at", now)
    }
    job.set("worker_ref", workerRef)
    job.set("attempt_count", (job.getInt("attempt_count") || 0) + 1)
    e.app.save(job)
  },

  markJobSucceeded: function (e, job) {
    job.set("status", "succeeded")
    job.set("finished_at", new Date().toISOString())
    job.set("error_code", "")
    job.set("error_message", "")
    e.app.save(job)
  },

  markJobFailed: function (e, job, code, err) {
    job.set("status", "failed")
    job.set("error_code", code)
    job.set("error_message", err && err.message ? err.message : code)
    job.set("finished_at", new Date().toISOString())
    e.app.save(job)
  },

  buildJimengAssets: function (jobRecord, activityRecord, stylePreset, renderOptions) {
    var jimeng = require(__hooks + "/jimeng.js")
    var routeBaseImageUrl = jobRecord.getString("route_base_image_url")
    if (!routeBaseImageUrl) {
      throw new BadRequestError("Missing route base image URL")
    }

    var renderResult = jimeng.render(activityRecord, stylePreset, renderOptions, routeBaseImageUrl)
    var size = this.getCanvasSize(renderOptions.aspectRatio)
    var title = activityRecord.getString("name") || "Untitled activity"
    var subtitle = this.buildSubtitle(activityRecord)
    var mimeType = renderResult.imageAsset.kind === "base64" ? "image/png" : "image/png"
    var imageData = renderResult.imageAsset.kind === "base64"
      ? "data:" + mimeType + ";base64," + renderResult.imageAsset.value
      : renderResult.imageAsset.value

    return {
      imageDataUri: imageData,
      thumbnailDataUri: imageData,
      width: size.width,
      height: size.height,
      fileSize: renderResult.imageAsset.value.length,
      mimeType: mimeType,
      title: title,
      subtitle: subtitle,
      metadata: {
        renderer: "jimeng-4.6",
        provider: "jimeng46",
        taskId: renderResult.taskId,
        requestId: renderResult.requestId,
        aspectRatio: renderOptions.aspectRatio,
        includeTitle: renderOptions.includeTitle,
        includeStats: renderOptions.includeStats,
        routeBaseImageUrl: routeBaseImageUrl,
        outputKind: renderResult.imageAsset.kind,
        rawResult: renderResult.rawResult && renderResult.rawResult.Result ? renderResult.rawResult.Result : null,
      },
    }
  },

  buildMockAssets: function (activityRecord, streamRecord, stylePreset, renderOptions) {
    var mockArt = require(__hooks + "/mock-art.js")
    var assets = mockArt.buildMockAssets(activityRecord, streamRecord, stylePreset, renderOptions)
    assets.mimeType = "image/svg+xml"
    return assets
  },

  renderJob: function (e, options) {
    var art = require(__hooks + "/art.js")
    var jobId = e.request.pathValue("id")
    var context = this.getJobContext(e, jobId)
    var existingResult = this.getExistingResult(e.app, context.userId, jobId)
    if (existingResult) {
      return {
        job: context.job.publicExport(),
        result: existingResult.publicExport(),
        reused: true,
        provider: existingResult.getRaw("metadata_json") && existingResult.getRaw("metadata_json").provider
          ? existingResult.getRaw("metadata_json").provider
          : "unknown",
      }
    }

    var renderOptions = art.normalizeRenderOptions(context.job.getRaw("render_options_json"))
    var stylePreset = art.normalizeStylePreset(context.job.getString("style_preset"))
    var provider = this.getRequestedProvider(options && options.forceProvider)

    this.markJobProcessing(e, context.job, provider === "jimeng46" ? "jimeng-4.6" : "mock-svg-renderer:v1")

    try {
      var assets = provider === "jimeng46"
        ? this.buildJimengAssets(context.job, context.activity, stylePreset, renderOptions)
        : this.buildMockAssets(context.activity, context.stream, stylePreset, renderOptions)

      var resultRecord = this.createResultRecord(e, {
        jobId: context.job.id,
        userId: context.userId,
        activityId: context.activity.id,
        imageDataUri: assets.imageDataUri,
        thumbnailDataUri: assets.thumbnailDataUri,
        width: assets.width,
        height: assets.height,
        fileSize: assets.fileSize,
        mimeType: assets.mimeType,
        stylePreset: stylePreset,
        title: assets.title,
        subtitle: assets.subtitle,
        metadata: assets.metadata,
      })

      this.markJobSucceeded(e, context.job)

      return {
        job: context.job.publicExport(),
        result: resultRecord.publicExport(),
        reused: false,
        provider: provider,
      }
    } catch (err) {
      this.markJobFailed(e, context.job, provider === "jimeng46" ? "jimeng_render_failed" : "mock_render_failed", err)
      throw err
    }
  },
}

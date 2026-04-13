module.exports = {
  claimablePendingFilter: function (nowIso) {
    return 'status = "pending" && route_base_image_url != "" && (queued_at = "" || queued_at <= "' + nowIso + '")'
  },

  claimableStaleFilter: function (staleBeforeIso) {
    return 'status = "processing" && route_base_image_url != "" && started_at != "" && started_at <= "' + staleBeforeIso + '"'
  },

  getOptionalEnv: function (key, fallback) {
    var value = $os.getenv(key)
    return value || fallback
  },

  getWorkerSecret: function () {
    return this.getOptionalEnv("ART_WORKER_SECRET", "local-art-worker-secret")
  },

  assertWorkerSecret: function (providedSecret) {
    if (String(providedSecret || "") !== this.getWorkerSecret()) {
      throw new ForbiddenError("Invalid art worker secret")
    }
  },

  getRequestedProvider: function (forceProvider) {
    if (forceProvider) {
      return forceProvider
    }

    var envProvider = String($os.getenv("ART_RENDER_PROVIDER") || "").trim().toLowerCase()
    if (envProvider === "mock" || envProvider === "jimeng46" || envProvider === "doubao-seedream" || envProvider === "doubao") {
      return envProvider === "doubao" ? "doubao-seedream" : envProvider
    }

    var jimeng = require(__hooks + "/jimeng.js")
    var doubao = require(__hooks + "/doubao.js")
    if (jimeng.isConfigured()) {
      return "jimeng46"
    }

    if (doubao.isConfigured()) {
      return "doubao-seedream"
    }

    return "mock"
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

  getStreamRecord: function (app, userId, streamId) {
    if (!streamId) {
      return null
    }

    try {
      return app.findFirstRecordByFilter(
        "activity_streams",
        "id = {:streamId} && user = {:userId}",
        {
          streamId: streamId,
          userId: userId,
        }
      )
    } catch (_) {
      return null
    }
  },

  getJobContextByUserId: function (app, userId, jobId) {
    var job = app.findFirstRecordByFilter(
      "art_jobs",
      "id = {:jobId} && user = {:userId}",
      {
        jobId: jobId,
        userId: userId,
      }
    )

    var activity = app.findFirstRecordByFilter(
      "activities",
      "id = {:activityId} && user = {:userId}",
      {
        activityId: job.getString("activity"),
        userId: userId,
      }
    )

    return {
      userId: userId,
      job: job,
      activity: activity,
      stream: this.getStreamRecord(app, userId, job.getString("stream")),
    }
  },

  getJobContextById: function (app, jobId) {
    var job = app.findFirstRecordByFilter(
      "art_jobs",
      "id = {:jobId}",
      {
        jobId: jobId,
      }
    )

    var userId = job.getString("user")
    return this.getJobContextByUserId(app, userId, jobId)
  },

  getCanvasSize: function (aspectRatio) {
    var mockArt = require(__hooks + "/mock-art.js")
    return mockArt.aspectRatioSizes[aspectRatio] || mockArt.aspectRatioSizes.portrait
  },

  buildSubtitle: function (activityRecord) {
    var mockArt = require(__hooks + "/mock-art.js")
    return mockArt.subtitleText(activityRecord)
  },

  sanitizeMetadataValue: function (value, depth) {
    if (depth > 4) {
      return null
    }

    if (typeof value === "string") {
      return value.length > 2000 ? value.slice(0, 2000) + "..." : value
    }

    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      return value
    }

    if (Array.isArray(value)) {
      return value.slice(0, 20).map(function (item) {
        return module.exports.sanitizeMetadataValue(item, depth + 1)
      })
    }

    if (value && typeof value === "object") {
      var output = {}
      var keys = Object.keys(value).slice(0, 20)
      for (var i = 0; i < keys.length; i += 1) {
        var key = keys[i]
        output[key] = this.sanitizeMetadataValue(value[key], depth + 1)
      }
      return output
    }

    return String(value)
  },

  buildResultFilename: function (activityRecord, jobRecord, stylePreset, mimeType) {
    var routeBase = require(__hooks + "/route-base.js")
    var baseName = [
      activityRecord.getString("sport_type") || "activity",
      activityRecord.id,
      stylePreset,
      "art-result",
    ].join("-")

    return routeBase.resolveFilename(baseName, mimeType)
  },

  persistJimengImageAsset: function (jobRecord, activityRecord, stylePreset, imageAsset) {
    if (imageAsset.kind !== "base64") {
      return {
        imageDataUri: imageAsset.value,
        thumbnailDataUri: imageAsset.value,
        fileSize: imageAsset.value.length,
        mimeType: "image/png",
      }
    }

    var routeBase = require(__hooks + "/route-base.js")
    var mimeType = "image/png"

    if (routeBase.getUploadProvider() !== "s3") {
      throw new BadRequestError("Jimeng base64 output requires ART_ASSET_UPLOAD_PROVIDER=s3")
    }

    var uploaded = routeBase.uploadToS3(
      imageAsset.value,
      mimeType,
      this.buildResultFilename(activityRecord, jobRecord, stylePreset, mimeType),
      jobRecord.getString("user"),
      jobRecord.id,
      "art-results"
    )

    return {
      imageDataUri: uploaded.url,
      thumbnailDataUri: uploaded.url,
      fileSize: imageAsset.value.length,
      mimeType: mimeType,
    }
  },

  createResultRecord: function (app, params) {
    var collection = app.findCollectionByNameOrId("art_results")
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
    app.save(record)

    return record
  },

  ensureRouteBaseReady: function (job) {
    if (!job.getString("route_base_image_url")) {
      throw new BadRequestError("Missing route base image URL")
    }
  },

  markJobPending: function (app, job, options) {
    var queuedAt = options && options.queuedAt ? options.queuedAt : new Date().toISOString()
    var clearErrors = !options || options.clearErrors !== false

    job.set("status", "pending")
    job.set("queued_at", queuedAt)
    job.set("started_at", "")
    job.set("finished_at", "")
    job.set("worker_ref", "")
    if (clearErrors) {
      job.set("error_code", "")
      job.set("error_message", "")
    }
    app.save(job)
  },

  markJobProcessing: function (app, job, workerRef) {
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
    app.save(job)
  },

  markJobSucceeded: function (app, job) {
    job.set("status", "succeeded")
    job.set("finished_at", new Date().toISOString())
    job.set("error_code", "")
    job.set("error_message", "")
    app.save(job)
  },

  markJobFailed: function (app, job, code, err) {
    job.set("status", "failed")
    job.set("error_code", code)
    job.set("error_message", err && err.message ? err.message : code)
    job.set("finished_at", new Date().toISOString())
    app.save(job)
  },

  isClaimablePendingJob: function (job, nowIso) {
    var queuedAt = job.getString("queued_at")
    return job.getString("status") === "pending"
      && !!job.getString("route_base_image_url")
      && (!queuedAt || queuedAt <= nowIso)
  },

  isClaimableStaleProcessingJob: function (job, staleBeforeIso) {
    var startedAt = job.getString("started_at")
    return job.getString("status") === "processing"
      && !!job.getString("route_base_image_url")
      && !!startedAt
      && startedAt <= staleBeforeIso
  },

  findClaimCandidate: function (app, nowIso, staleBeforeIso) {
    try {
      return {
        job: app.findFirstRecordByFilter(
          "art_jobs",
          this.claimableStaleFilter(staleBeforeIso)
        ),
        claimSource: "stale_processing",
      }
    } catch (_) {}

    try {
      return {
        job: app.findFirstRecordByFilter(
          "art_jobs",
          this.claimablePendingFilter(nowIso)
        ),
        claimSource: "pending",
      }
    } catch (_) {}

    return null
  },

  claimJobForWorker: function (app, workerRef, nowIso) {
    var staleProcessingMs = Number.parseInt(this.getOptionalEnv("ART_WORKER_STALE_PROCESSING_MS", "120000"), 10)
    var staleBeforeIso = new Date(Date.now() - staleProcessingMs).toISOString()
    var candidate = this.findClaimCandidate(app, nowIso, staleBeforeIso)
    if (!candidate) {
      return {
        claimed: false,
      }
    }

    var job = app.findFirstRecordByFilter(
      "art_jobs",
      "id = {:jobId}",
      {
        jobId: candidate.job.id,
      }
    )

    var stillClaimable = candidate.claimSource === "stale_processing"
      ? this.isClaimableStaleProcessingJob(job, staleBeforeIso)
      : this.isClaimablePendingJob(job, nowIso)

    if (!stillClaimable) {
      return {
        claimed: false,
      }
    }

    this.markJobProcessing(app, job, workerRef)

    return {
      claimed: true,
      claimSource: candidate.claimSource,
      job: {
        id: job.id,
        status: job.getString("status"),
        worker_ref: job.getString("worker_ref"),
      },
    }
  },

  getWorkerRequestBody: function (e) {
    var body = e.requestInfo().body || {}
    this.assertWorkerSecret(body.secret || body.workerSecret)
    return body
  },

  assertWorkerOwnership: function (job, workerRef) {
    if (!workerRef) {
      throw new BadRequestError("Missing workerRef")
    }

    if (job.getString("worker_ref") !== workerRef) {
      throw new ForbiddenError("Job is claimed by another worker")
    }
  },

  assertProcessingClaim: function (job, workerRef) {
    this.assertWorkerOwnership(job, workerRef)

    if (job.getString("status") !== "processing") {
      throw new BadRequestError("Job is not currently processing")
    }
  },

  recoverClaimedJob: function (app, context, options) {
    var job = context.job
    var reason = options && options.reason ? String(options.reason) : "skipped"
    var retryAt = options && options.retryAt ? String(options.retryAt) : ""
    var currentStatus = job.getString("status")
    var hasResult = this.getExistingResult(app, context.userId, job.id)

    if (hasResult || currentStatus === "succeeded" || currentStatus === "canceled") {
      return {
        recovered: false,
        reason: "skipped",
      }
    }

    if (reason === "retryable_error") {
      if (currentStatus !== "failed" && currentStatus !== "processing") {
        return {
          recovered: false,
          reason: "skipped",
        }
      }

      this.markJobPending(app, job, {
        queuedAt: retryAt || new Date().toISOString(),
        clearErrors: false,
      })

      return {
        recovered: true,
        reason: "retryable_error",
        scheduledRetryAt: job.getString("queued_at"),
      }
    }

    if (reason === "transport_failure") {
      if (currentStatus !== "processing") {
        return {
          recovered: false,
          reason: "skipped",
        }
      }

      this.markJobPending(app, job, {
        queuedAt: new Date().toISOString(),
        clearErrors: true,
      })

      return {
        recovered: true,
        reason: "transport_failure",
      }
    }

    return {
      recovered: false,
      reason: "skipped",
    }
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
    var persistedImage = this.persistJimengImageAsset(jobRecord, activityRecord, stylePreset, renderResult.imageAsset)

    return {
      imageDataUri: persistedImage.imageDataUri,
      thumbnailDataUri: persistedImage.thumbnailDataUri,
      width: size.width,
      height: size.height,
      fileSize: persistedImage.fileSize,
      mimeType: persistedImage.mimeType,
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
        referenceImageUrl: renderResult.referenceImageUrl,
        routeBaseImageUrl: routeBaseImageUrl,
        outputKind: renderResult.imageAsset.kind,
        imageUrl: persistedImage.imageDataUri,
        rawResult: this.sanitizeMetadataValue(
          renderResult.rawResult && renderResult.rawResult.Result ? renderResult.rawResult.Result : renderResult.rawResult || null,
          0
        ),
      },
    }
  },

  buildDoubaoAssets: function (jobRecord, activityRecord, stylePreset, renderOptions) {
    var doubao = require(__hooks + "/doubao.js")
    var routeBaseImageUrl = jobRecord.getString("route_base_image_url")
    if (!routeBaseImageUrl) {
      throw new BadRequestError("Missing route base image URL")
    }

    var renderResult = doubao.render(activityRecord, stylePreset, renderOptions, routeBaseImageUrl)
    var size = this.getCanvasSize(renderOptions.aspectRatio)
    var title = activityRecord.getString("name") || "Untitled activity"
    var subtitle = this.buildSubtitle(activityRecord)
    var persistedImage = this.persistJimengImageAsset(jobRecord, activityRecord, stylePreset, renderResult.imageAsset)

    return {
      imageDataUri: persistedImage.imageDataUri,
      thumbnailDataUri: persistedImage.thumbnailDataUri,
      width: size.width,
      height: size.height,
      fileSize: persistedImage.fileSize,
      mimeType: persistedImage.mimeType,
      title: title,
      subtitle: subtitle,
      metadata: {
        renderer: "doubao-seedream-5.0",
        provider: "doubao-seedream",
        model: renderResult.model,
        aspectRatio: renderOptions.aspectRatio,
        includeTitle: renderOptions.includeTitle,
        includeStats: renderOptions.includeStats,
        referenceImageUrl: renderResult.referenceImageUrl,
        routeBaseImageUrl: routeBaseImageUrl,
        sourceImageUrl: renderResult.sourceImageUrl,
        sourceImageUrls: renderResult.sourceImageUrls,
        fallbackUsed: renderResult.fallbackUsed,
        outputKind: renderResult.imageAsset.kind,
        imageUrl: persistedImage.imageDataUri,
        rawResult: this.sanitizeMetadataValue(renderResult.rawResult, 0),
      },
    }
  },

  buildMockAssets: function (activityRecord, streamRecord, stylePreset, renderOptions) {
    var mockArt = require(__hooks + "/mock-art.js")
    var assets = mockArt.buildMockAssets(activityRecord, streamRecord, stylePreset, renderOptions)
    assets.mimeType = "image/svg+xml"
    return assets
  },

  processContext: function (app, context, options) {
    var art = require(__hooks + "/art.js")
    var existingResult = this.getExistingResult(app, context.userId, context.job.id)
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

    this.ensureRouteBaseReady(context.job)

    var renderOptions = art.normalizeRenderOptions(context.job.getRaw("render_options_json"))
    var stylePreset = art.normalizeStylePreset(context.job.getString("style_preset"))
    var provider = this.getRequestedProvider(options && options.forceProvider)
    var workerRef = options && options.workerRef
      ? options.workerRef
      : provider === "jimeng46"
        ? "jimeng-4.6"
        : provider === "doubao-seedream"
          ? "doubao-seedream-5.0"
          : "mock-svg-renderer:v1"

    if (options && options.requireClaimedWorker) {
      this.assertProcessingClaim(context.job, workerRef)
    } else {
      this.markJobProcessing(app, context.job, workerRef)
    }

    try {
      var assets = provider === "jimeng46"
        ? this.buildJimengAssets(context.job, context.activity, stylePreset, renderOptions)
        : provider === "doubao-seedream"
          ? this.buildDoubaoAssets(context.job, context.activity, stylePreset, renderOptions)
          : this.buildMockAssets(context.activity, context.stream, stylePreset, renderOptions)

      var resultRecord = this.createResultRecord(app, {
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

      this.markJobSucceeded(app, context.job)

      return {
        job: context.job.publicExport(),
        result: resultRecord.publicExport(),
        reused: false,
        provider: provider,
      }
    } catch (err) {
      this.markJobFailed(
        app,
        context.job,
        provider === "jimeng46"
          ? "jimeng_render_failed"
          : provider === "doubao-seedream"
            ? "doubao_render_failed"
            : "mock_render_failed",
        err
      )
      throw err
    }
  },

  enqueueJob: function (e) {
    var context = this.getJobContextByUserId(e.app, e.auth.id, e.request.pathValue("id"))
    var existingResult = this.getExistingResult(e.app, context.userId, context.job.id)
    if (existingResult) {
      return {
        job: context.job.publicExport(),
        result: existingResult.publicExport(),
        reused: true,
        queued: false,
        provider: existingResult.getRaw("metadata_json") && existingResult.getRaw("metadata_json").provider
          ? existingResult.getRaw("metadata_json").provider
          : "unknown",
      }
    }

    this.ensureRouteBaseReady(context.job)

    var currentStatus = context.job.getString("status")
    if (currentStatus === "processing" || currentStatus === "pending") {
      return {
        job: context.job.publicExport(),
        queued: true,
        reused: currentStatus === "processing",
        provider: null,
      }
    }

    this.markJobPending(e.app, context.job)

    return {
      job: context.job.publicExport(),
      queued: true,
      reused: false,
      provider: null,
    }
  },

  renderNowForUser: function (e, options) {
    return this.processContext(e.app, this.getJobContextByUserId(e.app, e.auth.id, e.request.pathValue("id")), options)
  },

  claimQueuedJob: function (e) {
    var body = this.getWorkerRequestBody(e)
    var workerRef = String(body.workerRef || "").trim()
    var nowIso = body.now ? String(body.now) : new Date().toISOString()
    return this.claimJobForWorker(e.app, workerRef, nowIso)
  },

  processQueuedJob: function (e, options) {
    var body = this.getWorkerRequestBody(e)
    var workerRef = String(body.workerRef || "").trim()
    return this.processContext(e.app, this.getJobContextById(e.app, e.request.pathValue("id")), {
      forceProvider: options && options.forceProvider,
      requireClaimedWorker: true,
      workerRef: workerRef,
    })
  },

  recoverQueuedJob: function (e) {
    var body = this.getWorkerRequestBody(e)
    var workerRef = String(body.workerRef || "").trim()
    var context = this.getJobContextById(e.app, e.request.pathValue("id"))
    this.assertWorkerOwnership(context.job, workerRef)

    return this.recoverClaimedJob(e.app, context, {
      reason: body.reason,
      retryAt: body.retryAt,
    })
  },
}

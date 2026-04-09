routerAdd("POST", "/api/integrations/strava/connect", function (e) {
  var utils = require(__hooks + "/strava.js")
  var stateToken = utils.createStateToken(e.auth.id)
  return e.json(200, {
    url: utils.buildAuthorizeUrl(stateToken),
  })
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/integrations/strava/callback", function (e) {
  var utils = require(__hooks + "/strava.js")
  var query = e.request.url.query()
  var error = query.get("error")
  var code = query.get("code")
  var state = query.get("state")
  var scope = query.get("scope")

  if (error) {
    return e.redirect(302, utils.buildFrontendRedirect("/activities?strava=denied"))
  }

  if (!code || !state) {
    return e.redirect(302, utils.buildFrontendRedirect("/activities?strava=invalid_callback"))
  }

  try {
    var claims = utils.parseStateToken(state)
    var userId = String(claims.uid || "")
    if (!userId) {
      throw new BadRequestError("Missing user id in state")
    }

    var tokenData = utils.exchangeCode(code)
    var athlete = utils.fetchAthlete(tokenData.access_token)
    utils.upsertConnection(userId, tokenData, athlete, scope)

    return e.redirect(302, utils.buildFrontendRedirect("/activities?strava=connected"))
  } catch (err) {
    console.log(err)
    return e.redirect(302, utils.buildFrontendRedirect("/activities?strava=callback_error"))
  }
})

routerAdd("GET", "/api/integrations/strava/webhook", function (e) {
  var utils = require(__hooks + "/strava.js")
  var query = e.request.url.query()
  var challenge = query.get("hub.challenge")
  var verifyToken = query.get("hub.verify_token")
  var mode = query.get("hub.mode")

  if (mode !== "subscribe" || verifyToken !== utils.getWebhookVerifyToken() || !challenge) {
    throw new BadRequestError("Invalid Strava webhook verification request")
  }

  return e.json(200, {
    "hub.challenge": challenge,
  })
})

routerAdd("POST", "/api/integrations/strava/webhook", function (e) {
  var utils = require(__hooks + "/strava.js")
  var body = e.requestInfo().body || {}

  try {
    utils.processWebhookEvent(body)
  } catch (err) {
    console.log(err)
  }

  return e.json(200, {
    received: true,
  })
})

routerAdd("GET", "/api/integrations/strava/status", function (e) {
  var utils = require(__hooks + "/strava.js")
  return e.json(200, utils.getStatusPayload(e.auth.id))
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/integrations/strava/sync", function (e) {
  var utils = require(__hooks + "/strava.js")
  var result = utils.syncActivities(e.auth.id)
  return e.json(200, {
    connection: result.connection.publicExport(),
    stats: result.stats,
  })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/integrations/strava/disconnect", function (e) {
  var utils = require(__hooks + "/strava.js")
  return e.json(200, utils.disconnect(e.auth.id))
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/art/jobs", function (e) {
  var art = require(__hooks + "/art.js")
  var result = art.createJob(e)
  return e.json(200, result)
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/art/jobs/{id}/mock-render", function (e) {
  var art = require(__hooks + "/art.js")
  var mockArt = require(__hooks + "/mock-art.js")
  var jobId = e.request.pathValue("id")
  var userId = e.auth.id

  var job = e.app.findFirstRecordByFilter(
    "art_jobs",
    "id = {:jobId} && user = {:userId}",
    {
      jobId: jobId,
      userId: userId,
    }
  )

  var existingResult = null
  try {
    existingResult = e.app.findFirstRecordByFilter(
      "art_results",
      "job = {:jobId} && user = {:userId}",
      {
        jobId: jobId,
        userId: userId,
      }
    )
  } catch (_) {}

  if (existingResult) {
    return e.json(200, {
      job: job.publicExport(),
      result: existingResult.publicExport(),
      reused: true,
    })
  }

  if (job.getString("status") === "canceled") {
    throw new BadRequestError("Canceled jobs can't be rendered")
  }

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

  var renderOptions = art.normalizeRenderOptions(job.getRaw("render_options_json"))
  var stylePreset = art.normalizeStylePreset(job.getString("style_preset"))
  var now = new Date().toISOString()

  job.set("status", "processing")
  if (!job.getString("started_at")) {
    job.set("started_at", now)
  }
  job.set("worker_ref", "mock-svg-renderer:v1")
  e.app.save(job)

  try {
    var assets = mockArt.buildMockAssets(activity, stream, stylePreset, renderOptions)
    var collection = e.app.findCollectionByNameOrId("art_results")
    var resultRecord = new Record(collection)

    resultRecord.set("job", job.id)
    resultRecord.set("user", userId)
    resultRecord.set("activity", activity.id)
    resultRecord.set("image_data_uri", assets.imageDataUri)
    resultRecord.set("thumbnail_data_uri", assets.thumbnailDataUri)
    resultRecord.set("width", assets.width)
    resultRecord.set("height", assets.height)
    resultRecord.set("file_size", assets.fileSize)
    resultRecord.set("mime_type", "image/svg+xml")
    resultRecord.set("style_preset", stylePreset)
    resultRecord.set("title_snapshot", assets.title)
    resultRecord.set("subtitle_snapshot", assets.subtitle)
    resultRecord.set("metadata_json", assets.metadata)
    resultRecord.set("visibility", "private")
    e.app.save(resultRecord)

    job.set("status", "succeeded")
    job.set("finished_at", new Date().toISOString())
    job.set("error_code", "")
    job.set("error_message", "")
    e.app.save(job)

    return e.json(200, {
      job: job.publicExport(),
      result: resultRecord.publicExport(),
      reused: false,
    })
  } catch (err) {
    job.set("status", "failed")
    job.set("error_code", "mock_render_failed")
    job.set("error_message", err && err.message ? err.message : "Mock render failed")
    job.set("finished_at", new Date().toISOString())
    e.app.save(job)
    throw err
  }
}, $apis.requireAuth("users"))

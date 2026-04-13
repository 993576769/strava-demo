var hookLogger = $app.logger().with("module", "main.pb.js")

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
    hookLogger.error(
      "Strava callback failed",
      "route", "/api/integrations/strava/callback",
      "code", code || "",
      "state", state || "",
      "scope", scope || "",
      "error", err
    )
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
    hookLogger.error(
      "Strava webhook processing failed",
      "route", "/api/integrations/strava/webhook",
      "ownerId", body && body.owner_id ? String(body.owner_id) : "",
      "aspectType", body && body.aspect_type ? String(body.aspect_type) : "",
      "objectType", body && body.object_type ? String(body.object_type) : "",
      "eventTime", body && body.event_time ? String(body.event_time) : "",
      "error", err
    )
    var ownerId = body && body.owner_id
    var connection = ownerId ? utils.getConnectionByAthleteId(ownerId) : null
    if (connection) {
      utils.logEvent(connection.getString("user"), "webhook", "error", "Strava webhook 处理失败", err && err.message ? err.message : "Unknown webhook processing error", body)
    }
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

routerAdd("POST", "/api/art/jobs/{id}/route-base", function (e) {
  var routeBase = require(__hooks + "/route-base.js")
  return e.json(200, routeBase.uploadRouteBase(e))
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/art/jobs/{id}/render", function (e) {
  var renderArt = require(__hooks + "/render-art.js")
  return e.json(200, renderArt.enqueueJob(e))
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/art/jobs/{id}/mock-render", function (e) {
  var renderArt = require(__hooks + "/render-art.js")
  return e.json(200, renderArt.renderNowForUser(e, {
    forceProvider: "mock",
  }))
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/internal/art/jobs/{id}/process", function (e) {
  var renderArt = require(__hooks + "/render-art.js")
  return e.json(200, renderArt.processQueuedJob(e))
})

routerAdd("POST", "/api/internal/art/jobs/claim", function (e) {
  var renderArt = require(__hooks + "/render-art.js")
  return e.json(200, renderArt.claimQueuedJob(e))
})

routerAdd("POST", "/api/internal/art/jobs/{id}/recover", function (e) {
  var renderArt = require(__hooks + "/render-art.js")
  return e.json(200, renderArt.recoverQueuedJob(e))
})

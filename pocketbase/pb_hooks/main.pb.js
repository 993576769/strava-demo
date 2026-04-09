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

routerAdd("POST", "/api/art/jobs/{id}/render", function (e) {
  var renderArt = require(__hooks + "/render-art.js")
  return e.json(200, renderArt.renderJob(e))
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/art/jobs/{id}/mock-render", function (e) {
  var renderArt = require(__hooks + "/render-art.js")
  return e.json(200, renderArt.renderJob(e, {
    forceProvider: "mock",
  }))
}, $apis.requireAuth("users"))

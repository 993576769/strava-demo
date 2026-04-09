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

routerAdd("POST", "/api/art/jobs", function (e) {
  var art = require(__hooks + "/art.js")
  var result = art.createJob(e)
  return e.json(200, result)
}, $apis.requireAuth("users"))

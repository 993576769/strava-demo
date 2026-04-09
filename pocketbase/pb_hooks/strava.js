module.exports = {
  getRequiredEnv: function (key) {
    var value = $os.getenv(key)
    if (!value) {
      throw new BadRequestError("Missing required env: " + key)
    }
    return value
  },

  getOptionalEnv: function (key, fallback) {
    var value = $os.getenv(key)
    return value || fallback
  },

  getRedirectBase: function () {
    return $os.getenv("APP_URL") || ""
  },

  buildFrontendRedirect: function (pathWithQuery) {
    var base = this.getRedirectBase()
    if (!base) {
      return pathWithQuery
    }
    return base.replace(/\/$/, "") + pathWithQuery
  },

  getStateSecret: function () {
    return this.getRequiredEnv("STRAVA_STATE_SECRET")
  },

  getEncryptionKey: function () {
    var rawKey = $os.getenv("STRAVA_TOKEN_ENCRYPTION_KEY") || this.getStateSecret()
    return $security.sha256(rawKey).slice(0, 32)
  },

  buildAuthorizeUrl: function (stateToken) {
    var clientId = this.getRequiredEnv("STRAVA_CLIENT_ID")
    var redirectUri = this.getRequiredEnv("STRAVA_REDIRECT_URI")
    var scope = this.getOptionalEnv("STRAVA_SCOPES", "read,activity:read_all")

    var query = [
      "client_id=" + encodeURIComponent(clientId),
      "redirect_uri=" + encodeURIComponent(redirectUri),
      "response_type=code",
      "approval_prompt=auto",
      "scope=" + encodeURIComponent(scope),
      "state=" + encodeURIComponent(stateToken),
    ].join("&")

    return "https://www.strava.com/oauth/authorize?" + query
  },

  createStateToken: function (userId) {
    return $security.createJWT({ uid: userId }, this.getStateSecret(), 600)
  },

  parseStateToken: function (token) {
    return $security.parseJWT(token, this.getStateSecret())
  },

  exchangeCode: function (code) {
    var response = $http.send({
      url: "https://www.strava.com/oauth/token",
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: [
        "client_id=" + encodeURIComponent(this.getRequiredEnv("STRAVA_CLIENT_ID")),
        "client_secret=" + encodeURIComponent(this.getRequiredEnv("STRAVA_CLIENT_SECRET")),
        "code=" + encodeURIComponent(code),
        "grant_type=authorization_code",
      ].join("&"),
      timeout: 30,
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadRequestError("Strava token exchange failed")
    }

    return response.json
  },

  fetchAthlete: function (accessToken) {
    var response = $http.send({
      url: "https://www.strava.com/api/v3/athlete",
      method: "GET",
      headers: {
        Authorization: "Bearer " + accessToken,
      },
      timeout: 30,
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadRequestError("Failed to fetch Strava athlete")
    }

    return response.json
  },

  upsertConnection: function (userId, tokenData, athleteData, scopeGranted) {
    var collection = $app.findCollectionByNameOrId("strava_connections")
    var existing = null

    try {
      existing = $app.findFirstRecordByFilter(
        "strava_connections",
        "user = {:userId} && provider = 'strava'",
        { userId: userId }
      )
    } catch (_) {}

    var record = existing || new Record(collection)
    record.set("user", userId)
    record.set("provider", "strava")
    record.set("strava_athlete_id", String(athleteData.id))
    record.set("strava_username", athleteData.username || athleteData.firstname || "")
    record.set("scope_granted", scopeGranted || "")
    record.set("access_token_encrypted", $security.encrypt(tokenData.access_token, this.getEncryptionKey()))
    record.set("refresh_token_encrypted", $security.encrypt(tokenData.refresh_token, this.getEncryptionKey()))
    record.set("token_expires_at", new Date(tokenData.expires_at * 1000).toISOString())
    record.set("status", "active")
    record.set("last_error_code", "")
    record.set("last_error_message", "")
    $app.save(record)
    return record
  },
}

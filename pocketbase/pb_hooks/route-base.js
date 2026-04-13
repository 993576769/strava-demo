module.exports = {
  getUploadProvider: function () {
    return String($os.getenv("ART_ASSET_UPLOAD_PROVIDER") || "pocketbase").trim().toLowerCase()
  },

  getHelperBaseUrl: function () {
    var host = String(
      $os.getenv("ART_ASSET_HELPER_HOST")
      || $os.getenv("DOUBAO_HELPER_HOST")
      || "127.0.0.1"
    ).trim()
    var port = String(
      $os.getenv("ART_ASSET_HELPER_PORT")
      || $os.getenv("DOUBAO_HELPER_PORT")
      || "3211"
    ).trim()
    return "http://" + host + ":" + port
  },

  getAssetBaseUrl: function () {
    var base = $os.getenv("ART_ASSET_BASE_URL") || $os.getenv("APP_URL") || ""
    base = String(base || "").trim().replace(/\/$/, "")

    if (!/^https?:\/\//.test(base)) {
      throw new BadRequestError("Missing public ART_ASSET_BASE_URL for route base uploads")
    }

    return base
  },

  buildFileUrl: function (record, filename) {
    if (!filename) {
      return ""
    }

    var collection = record.collection()
    return this.getAssetBaseUrl()
      + "/api/files/"
      + encodeURIComponent(collection.id)
      + "/"
      + encodeURIComponent(record.id)
      + "/"
      + encodeURIComponent(filename)
  },

  parseDataUrl: function (value) {
    var match = String(value || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (!match) {
      throw new BadRequestError("Invalid route base data URL")
    }

    return {
      mimeType: match[1],
      base64Data: match[2],
    }
  },

  decodeBase64ToBytes: function (base64Data) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    var clean = String(base64Data || "").replace(/[^A-Za-z0-9+/=]/g, "")
    var output = []

    for (var i = 0; i < clean.length; i += 4) {
      var c1 = chars.indexOf(clean.charAt(i))
      var c2 = chars.indexOf(clean.charAt(i + 1))
      var c3 = clean.charAt(i + 2) === "=" ? -1 : chars.indexOf(clean.charAt(i + 2))
      var c4 = clean.charAt(i + 3) === "=" ? -1 : chars.indexOf(clean.charAt(i + 3))

      if (c1 < 0 || c2 < 0) {
        throw new BadRequestError("Invalid route base base64 data")
      }

      var b1 = (c1 << 2) | (c2 >> 4)
      output.push(b1 & 255)

      if (c3 >= 0) {
        var b2 = ((c2 & 15) << 4) | (c3 >> 2)
        output.push(b2 & 255)
      }

      if (c4 >= 0 && c3 >= 0) {
        var b3 = ((c3 & 3) << 6) | c4
        output.push(b3 & 255)
      }
    }

    return output
  },

  resolveFilename: function (fileName, mimeType) {
    var ext = ".png"
    if (mimeType === "image/jpeg") {
      ext = ".jpg"
    } else if (mimeType === "image/webp") {
      ext = ".webp"
    }

    var safeName = String(fileName || "route-base").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "")
    if (!safeName) {
      safeName = "route-base"
    }

    return safeName + ext
  },

  uploadToS3: function (base64Data, mimeType, fileName, userId, jobId, objectPrefix) {
    var objectKey = [
      objectPrefix || "route-bases",
      encodeURIComponent(userId),
      encodeURIComponent(jobId),
      encodeURIComponent(fileName),
    ].join("/")

    var response = $http.send({
      url: this.getHelperBaseUrl() + "/s3-upload",
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        objectKey: objectKey,
        mimeType: mimeType,
        base64Data: base64Data,
      }),
      timeout: 120,
    })

    var payload = response.json || {}
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new BadRequestError(payload.error || "Failed to upload route base to S3")
    }

    if (!payload.url) {
      throw new BadRequestError("S3 upload response missing file url")
    }

    return {
      url: payload.url,
      objectKey: payload.objectKey || objectKey,
    }
  },

  uploadRouteBase: function (e) {
    var body = e.requestInfo().body || {}
    var jobId = e.request.pathValue("id")
    var userId = e.auth.id
    var dataUrl = body.dataUrl || body.data_url
    var fileName = body.fileName || body.file_name

    if (!dataUrl) {
      throw new BadRequestError("Missing route base image data")
    }

    var job = e.app.findFirstRecordByFilter(
      "art_jobs",
      "id = {:jobId} && user = {:userId}",
      {
        jobId: jobId,
        userId: userId,
      }
    )

    if (job.getString("status") !== "pending") {
      throw new BadRequestError("Route base image can only be uploaded for pending jobs")
    }

    var parsed = this.parseDataUrl(dataUrl)
    var resolvedFileName = this.resolveFilename(fileName, parsed.mimeType)
    var fileUrl = ""

    if (this.getUploadProvider() === "s3") {
      var uploaded = this.uploadToS3(parsed.base64Data, parsed.mimeType, resolvedFileName, userId, jobId)
      fileUrl = uploaded.url
    } else {
      var bytes = this.decodeBase64ToBytes(parsed.base64Data)
      var file = $filesystem.fileFromBytes(bytes, resolvedFileName)

      job.set("route_base_image", file)
      e.app.save(job)

      var storedName = job.getString("route_base_image")
      fileUrl = this.buildFileUrl(job, storedName)
    }

    job.set("route_base_image_url", fileUrl)
    e.app.save(job)

    return {
      job: job.publicExport(),
      routeBaseImageUrl: fileUrl,
    }
  },
}

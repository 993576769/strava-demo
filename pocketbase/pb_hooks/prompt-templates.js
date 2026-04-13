module.exports = {
  assertAdmin: function (authRecord) {
    if (!authRecord || !authRecord.getBool("is_admin")) {
      throw new ForbiddenError("Admin access required")
    }
  },

  uploadReferenceImage: function (e) {
    this.assertAdmin(e.auth)

    var templateId = String(e.request.pathValue("id") || "").trim()
    if (!templateId) {
      throw new BadRequestError("Missing template id")
    }

    var body = e.requestInfo().body || {}
    var dataUrl = body.dataUrl || body.data_url
    var fileName = body.fileName || body.file_name || "reference-image"

    if (!dataUrl) {
      throw new BadRequestError("Missing reference image data")
    }

    var record = e.app.findFirstRecordByFilter(
      "art_prompt_templates",
      "id = {:templateId}",
      { templateId: templateId }
    )

    var routeBase = require(__hooks + "/route-base.js")
    var parsed = routeBase.parseDataUrl(dataUrl)
    var resolvedFileName = routeBase.resolveFilename(fileName, parsed.mimeType)
    var bytes = routeBase.decodeBase64ToBytes(parsed.base64Data)
    var file = $filesystem.fileFromBytes(bytes, resolvedFileName)

    record.set("reference_image_file", file)
    e.app.save(record)

    var fileUrl = routeBase.buildFileUrl(record, record.getString("reference_image_file"))

    record.set("reference_image_url", fileUrl)
    e.app.save(record)

    return {
      template: record.publicExport(),
      referenceImageUrl: fileUrl,
    }
  },
}

/// <reference path="../../pb_data/types.d.ts" />

module.exports = {
  exportResult: function (record) {
    if (!record) {
      return null
    }

    return record.publicExport()
  },

  findLatestResultForActivity: function (app, userId, activityId) {
    if (!userId || !activityId) {
      return null
    }

    try {
      var records = app.findRecordsByFilter(
        "art_results",
        "user = {:userId} && activity = {:activityId}",
        "-created",
        1,
        0,
        {
          userId: userId,
          activityId: activityId,
        }
      )

      return records && records.length ? records[0] : null
    } catch (_) {
      return null
    }
  },

  findResultForJob: function (app, userId, jobId) {
    if (!userId || !jobId) {
      return null
    }

    try {
      return app.findFirstRecordByFilter(
        "art_results",
        "user = {:userId} && job = {:jobId}",
        {
          userId: userId,
          jobId: jobId,
        }
      )
    } catch (_) {
      return null
    }
  },

  enrichActivityRecord: function (e) {
    if (!e.record) {
      return e.next()
    }

    var userId = e.record.getString("user")
    var result = this.findLatestResultForActivity(e.app, userId, e.record.id)

    e.record.withCustomData(true)
    e.record.set("result", this.exportResult(result))

    return e.next()
  },

  enrichArtJobRecord: function (e) {
    if (!e.record) {
      return e.next()
    }

    var userId = e.record.getString("user")
    var result = this.findResultForJob(e.app, userId, e.record.id)

    e.record.withCustomData(true)
    e.record.set("result", this.exportResult(result))

    return e.next()
  },
}

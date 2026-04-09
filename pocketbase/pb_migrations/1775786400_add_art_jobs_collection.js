// @ts-check

// PocketBase migration: add art_jobs collection for generation task tracking.

/** @param {PBApp} app @param {string} name */
const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name)
  } catch (_) {
    return null
  }
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  const activities = app.findCollectionByNameOrId("activities")
  const activityStreams = app.findCollectionByNameOrId("activity_streams")

  let artJobs = findCollection(app, "art_jobs")
  if (!artJobs) {
    artJobs = new Collection({
      name: "art_jobs",
      type: "base",
      listRule: "@request.auth.id != '' && user = @request.auth.id",
      viewRule: "@request.auth.id != '' && user = @request.auth.id",
      fields: [
        {
          name: "user",
          type: "relation",
          required: true,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
          displayFields: ["name", "email"],
        },
        {
          name: "activity",
          type: "relation",
          required: true,
          collectionId: activities.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: "stream",
          type: "relation",
          collectionId: activityStreams.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["pending", "processing", "succeeded", "failed", "canceled"],
        },
        {
          name: "style_preset",
          type: "text",
          required: true,
          min: 1,
          max: 100,
        },
        {
          name: "prompt_snapshot",
          type: "text",
          max: 4000,
        },
        {
          name: "render_options_json",
          type: "json",
        },
        {
          name: "render_options_hash",
          type: "text",
          max: 128,
        },
        {
          name: "attempt_count",
          type: "number",
          min: 0,
        },
        {
          name: "error_code",
          type: "text",
          max: 255,
        },
        {
          name: "error_message",
          type: "text",
          max: 2000,
        },
        {
          name: "queued_at",
          type: "date",
        },
        {
          name: "started_at",
          type: "date",
        },
        {
          name: "finished_at",
          type: "date",
        },
        {
          name: "worker_ref",
          type: "text",
          max: 255,
        },
      ],
      indexes: [
        "CREATE INDEX idx_art_jobs_user_queued_at ON art_jobs (user, queued_at)",
        "CREATE INDEX idx_art_jobs_activity_queued_at ON art_jobs (activity, queued_at)",
        "CREATE INDEX idx_art_jobs_status ON art_jobs (status)",
        "CREATE INDEX idx_art_jobs_idempotency ON art_jobs (user, activity, style_preset, render_options_hash, status)",
      ],
    })

    app.save(artJobs)
  }
}, (app) => {
  try {
    const artJobs = app.findCollectionByNameOrId("art_jobs")
    app.delete(artJobs)
  } catch (_) {}
})

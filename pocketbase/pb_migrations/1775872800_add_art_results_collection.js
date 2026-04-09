// @ts-check

// PocketBase migration: add art_results collection for generated outputs.

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
  const artJobs = app.findCollectionByNameOrId("art_jobs")

  let artResults = findCollection(app, "art_results")
  if (!artResults) {
    artResults = new Collection({
      name: "art_results",
      type: "base",
      listRule: "@request.auth.id != '' && user = @request.auth.id",
      viewRule: "@request.auth.id != '' && user = @request.auth.id",
      fields: [
        {
          name: "job",
          type: "relation",
          required: true,
          collectionId: artJobs.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
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
          name: "image_data_uri",
          type: "text",
          required: true,
          max: 120000,
        },
        {
          name: "thumbnail_data_uri",
          type: "text",
          max: 80000,
        },
        {
          name: "width",
          type: "number",
          min: 1,
        },
        {
          name: "height",
          type: "number",
          min: 1,
        },
        {
          name: "file_size",
          type: "number",
          min: 0,
        },
        {
          name: "mime_type",
          type: "text",
          max: 100,
        },
        {
          name: "style_preset",
          type: "text",
          required: true,
          min: 1,
          max: 100,
        },
        {
          name: "title_snapshot",
          type: "text",
          max: 500,
        },
        {
          name: "subtitle_snapshot",
          type: "text",
          max: 500,
        },
        {
          name: "metadata_json",
          type: "json",
        },
        {
          name: "visibility",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["private", "unlisted", "public"],
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_art_results_job ON art_results (job)",
        "CREATE INDEX idx_art_results_user ON art_results (user)",
        "CREATE INDEX idx_art_results_activity ON art_results (activity)",
      ],
    })

    app.save(artResults)
  }
}, (app) => {
  try {
    const artResults = app.findCollectionByNameOrId("art_results")
    app.delete(artResults)
  } catch (_) {}
})

// @ts-check

// PocketBase migration: add sync_events collection for user-visible integration diagnostics.

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

  let syncEvents = findCollection(app, "sync_events")
  if (!syncEvents) {
    syncEvents = new Collection({
      name: "sync_events",
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
          name: "provider",
          type: "text",
          required: true,
          min: 1,
          max: 50,
        },
        {
          name: "category",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["sync", "webhook", "connection"],
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["info", "success", "warning", "error"],
        },
        {
          name: "title",
          type: "text",
          required: true,
          min: 1,
          max: 255,
        },
        {
          name: "message",
          type: "text",
          max: 2000,
        },
        {
          name: "payload_json",
          type: "json",
        },
      ],
      indexes: [
        "CREATE INDEX idx_sync_events_user_created ON sync_events (user, created)",
        "CREATE INDEX idx_sync_events_provider_category_created ON sync_events (provider, category, created)",
      ],
    })

    app.save(syncEvents)
  }
}, (app) => {
  try {
    const syncEvents = app.findCollectionByNameOrId("sync_events")
    app.delete(syncEvents)
  } catch (_) {}
})

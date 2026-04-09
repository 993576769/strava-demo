// @ts-check

// PocketBase migration: add occurred_at to sync_events for stable sorting in the UI.

migrate((app) => {
  const syncEvents = app.findCollectionByNameOrId("sync_events")
  const hasField = syncEvents.fields.fieldNames().includes("occurred_at")

  if (!hasField) {
    syncEvents.fields.add(
      new DateField({
        name: "occurred_at",
      }),
    )
    app.save(syncEvents)
  }
}, (app) => {
  const syncEvents = app.findCollectionByNameOrId("sync_events")
  if (syncEvents.fields.fieldNames().includes("occurred_at")) {
    syncEvents.fields.removeByName("occurred_at")
    app.save(syncEvents)
  }
})

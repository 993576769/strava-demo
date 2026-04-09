// @ts-check

// PocketBase migration: add route base image fields to art_jobs.

migrate((app) => {
  const artJobs = app.findCollectionByNameOrId("art_jobs")

  /** @param {string} name */
  const hasField = (name) => artJobs.fields.fieldNames().includes(name)

  if (!hasField("route_base_image")) {
    // @ts-ignore PocketBase exposes FileField globally in migrations.
    artJobs.fields.add(new FileField({
      name: "route_base_image",
      maxSelect: 1,
      maxSize: 10 * 1024 * 1024,
      mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    }))
  }

  if (!hasField("route_base_image_url")) {
    // @ts-ignore PocketBase exposes TextField globally in migrations.
    artJobs.fields.add(new TextField({
      name: "route_base_image_url",
      max: 1000,
    }))
  }

  app.save(artJobs)
}, (app) => {
  const artJobs = app.findCollectionByNameOrId("art_jobs")

  try {
    artJobs.fields.removeByName("route_base_image")
  } catch (_) {}

  try {
    artJobs.fields.removeByName("route_base_image_url")
  } catch (_) {}

  app.save(artJobs)
})

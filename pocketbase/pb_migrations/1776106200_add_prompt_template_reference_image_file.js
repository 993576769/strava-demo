// @ts-check

// PocketBase migration: add reference_image_file to art_prompt_templates for local uploads.

/** @param {PBCollection} collection @param {string} fieldName */
const hasField = (collection, fieldName) => {
  return collection.fields.fieldNames().includes(fieldName)
}

migrate((app) => {
  const templates = app.findCollectionByNameOrId("art_prompt_templates")
  if (!hasField(templates, "reference_image_file")) {
    templates.fields.add(
      new FileField({
        name: "reference_image_file",
        maxSelect: 1,
        maxSize: 10485760,
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      }),
    )
    app.save(templates)
  }
}, (app) => {
  const templates = app.findCollectionByNameOrId("art_prompt_templates")
  if (hasField(templates, "reference_image_file")) {
    templates.fields.removeByName("reference_image_file")
    app.save(templates)
  }
})

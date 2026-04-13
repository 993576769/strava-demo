// @ts-check

// PocketBase migration: add art_prompt_templates collection for provider prompt templates and reference images.

/** @param {PBApp} app @param {string} name */
const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name)
  } catch (_) {
    return null
  }
}

migrate((app) => {
  let artPromptTemplates = findCollection(app, "art_prompt_templates")
  if (!artPromptTemplates) {
    artPromptTemplates = new Collection({
      name: "art_prompt_templates",
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      fields: [
        {
          name: "template_key",
          type: "text",
          required: true,
          min: 1,
          max: 120,
        },
        {
          name: "provider",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["doubao-seedream"],
        },
        {
          name: "prompt_template",
          type: "text",
          required: true,
          min: 1,
          max: 12000,
        },
        {
          name: "reference_image_url",
          type: "text",
          max: 4000,
        },
        {
          name: "is_active",
          type: "bool",
        },
        {
          name: "notes",
          type: "text",
          max: 2000,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_art_prompt_templates_key ON art_prompt_templates (template_key)",
        "CREATE INDEX idx_art_prompt_templates_provider_active ON art_prompt_templates (provider, is_active)",
      ],
    })

    app.save(artPromptTemplates)
  }
}, (app) => {
  try {
    const artPromptTemplates = app.findCollectionByNameOrId("art_prompt_templates")
    app.delete(artPromptTemplates)
  } catch (_) {}
})

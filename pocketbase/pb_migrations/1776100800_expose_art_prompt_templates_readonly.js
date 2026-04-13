// @ts-check

// PocketBase migration: allow authenticated users to read art_prompt_templates.

/** @param {PBApp} app @param {string} name */
const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name)
  } catch (_) {
    return null
  }
}

migrate((app) => {
  const artPromptTemplates = findCollection(app, "art_prompt_templates")
  if (!artPromptTemplates) {
    return
  }

  artPromptTemplates.listRule = "@request.auth.id != ''"
  artPromptTemplates.viewRule = "@request.auth.id != ''"
  artPromptTemplates.createRule = "@request.auth.id != '' && @request.auth.is_admin = true"
  artPromptTemplates.updateRule = "@request.auth.id != '' && @request.auth.is_admin = true"
  artPromptTemplates.deleteRule = "@request.auth.id != '' && @request.auth.is_admin = true"
  app.save(artPromptTemplates)
}, (app) => {
  const artPromptTemplates = findCollection(app, "art_prompt_templates")
  if (!artPromptTemplates) {
    return
  }

  artPromptTemplates.listRule = null
  artPromptTemplates.viewRule = null
  artPromptTemplates.createRule = null
  artPromptTemplates.updateRule = null
  artPromptTemplates.deleteRule = null
  app.save(artPromptTemplates)
})

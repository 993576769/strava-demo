// @ts-check

// PocketBase migration: add users.is_admin and allow admin write access to art_prompt_templates.

/** @param {PBCollection} collection @param {string} fieldName */
const hasField = (collection, fieldName) => {
  return collection.fields.fieldNames().includes(fieldName)
}

/** @param {PBApp} app @param {string} name */
const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name)
  } catch (_) {
    return null
  }
}

/** @param {PBApp} app @param {string} collectionName */
const getAllRecords = (app, collectionName) => {
  if (typeof app.findAllRecords === "function") {
    return app.findAllRecords(collectionName)
  }

  if (typeof app.findRecordsByFilter === "function") {
    return app.findRecordsByFilter(collectionName, "")
  }

  return []
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  if (!hasField(users, "is_admin")) {
    users.fields.add(
      new BoolField({
        name: "is_admin",
      }),
    )
  }
  app.save(users)

  const userRecords = getAllRecords(app, "users")
  for (let i = 0; i < userRecords.length; i += 1) {
    const record = /** @type {PBRecord} */ (userRecords[i])
    if (record && record.getBool("is_admin") !== true) {
      record.set("is_admin", false)
      app.save(record)
    }
  }

  const artPromptTemplates = findCollection(app, "art_prompt_templates")
  if (artPromptTemplates) {
    artPromptTemplates.listRule = "@request.auth.id != ''"
    artPromptTemplates.viewRule = "@request.auth.id != ''"
    artPromptTemplates.createRule = "@request.auth.id != '' && @request.auth.is_admin = true"
    artPromptTemplates.updateRule = "@request.auth.id != '' && @request.auth.is_admin = true"
    artPromptTemplates.deleteRule = "@request.auth.id != '' && @request.auth.is_admin = true"
    app.save(artPromptTemplates)
  }
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  if (hasField(users, "is_admin")) {
    users.fields.removeByName("is_admin")
    app.save(users)
  }

  const artPromptTemplates = findCollection(app, "art_prompt_templates")
  if (artPromptTemplates) {
    artPromptTemplates.listRule = "@request.auth.id != ''"
    artPromptTemplates.viewRule = "@request.auth.id != ''"
    artPromptTemplates.createRule = null
    artPromptTemplates.updateRule = null
    artPromptTemplates.deleteRule = null
    app.save(artPromptTemplates)
  }
})

// @ts-check

// PocketBase migration: remove users.theme and add users.is_active gate.

/** @param {PBCollection} collection @param {string} fieldName */
const hasField = (collection, fieldName) => {
  return collection.fields.fieldNames().includes(fieldName)
}

/** @param {PBApp} app @param {string} collectionName */
const getAllRecords = (app, collectionName) => {
  if (typeof app.findAllRecords === 'function') {
    return app.findAllRecords(collectionName)
  }

  if (typeof app.findRecordsByFilter === 'function') {
    return app.findRecordsByFilter(collectionName, "")
  }

  return []
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")

  if (hasField(users, "theme")) {
    users.fields.removeByName("theme")
  }

  if (!hasField(users, "is_active")) {
    users.fields.add(
      new BoolField({
        name: "is_active",
      }),
    )
  }

  app.save(users)

  const records = getAllRecords(app, "users")
  for (let i = 0; i < records.length; i += 1) {
    const record = /** @type {PBRecord} */ (records[i])
    if (record && record.getBool("is_active") !== true) {
      record.set("is_active", false)
      app.save(record)
    }
  }
}, (app) => {
  const users = app.findCollectionByNameOrId("users")

  if (hasField(users, "is_active")) {
    users.fields.removeByName("is_active")
  }

  if (!hasField(users, "theme")) {
    users.fields.add(
      new SelectField({
        name: "theme",
        maxSelect: 1,
        values: ["light", "dark", "system"],
      }),
    )
  }

  app.save(users)
})

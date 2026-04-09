// @ts-check

// PocketBase migration: align legacy installs with the current frontend contract.

/** @param {PBCollection} collection @param {string} fieldName */
const hasField = (collection, fieldName) => {
  return collection.fields.fieldNames().includes(fieldName)
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")

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

  const todos = app.findCollectionByNameOrId("todos")
  return app.save(todos)
}, (app) => {
  const todos = app.findCollectionByNameOrId("todos")
  app.save(todos)

  const users = app.findCollectionByNameOrId("users")
  if (hasField(users, "theme")) {
    users.fields.removeByName("theme")
  }

  return app.save(users)
})

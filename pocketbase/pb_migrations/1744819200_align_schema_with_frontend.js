// @ts-check

// PocketBase migration: align legacy installs with the current frontend contract.

/** @param {PBCollection} collection @param {string} fieldName */
const hasField = (collection, fieldName) => {
  return collection.fields.fieldNames().includes(fieldName)
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")

  if (!hasField(users, "is_active")) {
    users.fields.add(
      new BoolField({
        name: "is_active",
      }),
    )
  }

  if (!hasField(users, "is_admin")) {
    users.fields.add(
      new BoolField({
        name: "is_admin",
      }),
    )
  }

  if (hasField(users, "theme")) {
    users.fields.removeByName("theme")
  }

  return app.save(users)
}, (app) => {
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

  if (hasField(users, "is_active")) {
    users.fields.removeByName("is_active")
  }

  if (hasField(users, "is_admin")) {
    users.fields.removeByName("is_admin")
  }

  return app.save(users)
})

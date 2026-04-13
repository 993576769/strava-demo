// @ts-check

// PocketBase migration: initialize the users auth collection.

/** @param {PBApp} app @param {string} name */
const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name)
  } catch (_) {
    return null
  }
}

migrate((app) => {
  let users = findCollection(app, "users")

  if (!users) {
    users = new Collection({
      name: "users",
      type: "auth",
      listRule: "id = @request.auth.id",
      viewRule: "id = @request.auth.id",
      updateRule: "id = @request.auth.id",
      passwordAuth: {
        enabled: true,
      },
      oauth2: {
        enabled: false,
      },
      otp: {
        enabled: false,
      },
      fields: [
        {
          name: "name",
          type: "text",
        },
        {
          name: "avatar",
          type: "file",
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
        },
        {
          name: "is_active",
          type: "bool",
        },
      ],
    })

    app.save(users)
  }

  return app.save(users)
}, (app) => {
  try {
    const users = app.findCollectionByNameOrId("users")
    app.delete(users)
  } catch (_) {}
})

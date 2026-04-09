// @ts-check

// PocketBase migration: initialize auth and todo collections.

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
          name: "theme",
          type: "select",
          maxSelect: 1,
          values: ["light", "dark", "system"],
        },
      ],
    })

    app.save(users)
  }

  const existingTodos = findCollection(app, "todos")
  if (existingTodos) {
    return
  }

  const todos = new Collection({
    name: "todos",
    type: "base",
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: "user = @request.auth.id",
    updateRule: "user = @request.auth.id",
    deleteRule: "user = @request.auth.id",
    fields: [
      {
        name: "title",
        type: "text",
        required: true,
        min: 1,
        max: 500,
      },
      {
        name: "description",
        type: "text",
        max: 2000,
      },
      {
        name: "completed",
        type: "bool",
      },
      {
        name: "priority",
        type: "select",
        maxSelect: 1,
        values: ["low", "medium", "high"],
      },
      {
        name: "due_date",
        type: "date",
      },
      {
        name: "tags",
        type: "json",
      },
      {
        name: "sort_order",
        type: "number",
        min: 0,
      },
      {
        name: "user",
        type: "relation",
        required: true,
        collectionId: users.id,
        cascadeDelete: true,
        maxSelect: 1,
        displayFields: ["name", "email"],
      },
    ],
    indexes: [
      "CREATE INDEX idx_todos_user ON todos (user)",
      "CREATE INDEX idx_todos_completed ON todos (completed)",
      "CREATE INDEX idx_todos_priority ON todos (priority)",
      "CREATE INDEX idx_todos_due_date ON todos (due_date)",
      "CREATE INDEX idx_todos_sort_order ON todos (sort_order)",
    ],
  })

  return app.save(todos)
}, (app) => {
  try {
    const todos = app.findCollectionByNameOrId("todos")
    app.delete(todos)
  } catch (_) {}

  try {
    const users = app.findCollectionByNameOrId("users")
    app.delete(users)
  } catch (_) {}
})

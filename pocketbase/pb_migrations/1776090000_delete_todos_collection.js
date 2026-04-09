// @ts-check

// PocketBase migration: remove the legacy todos collection.

/** @param {PBApp} app @param {string} name */
const findCollection = (app, name) => {
  try {
    return app.findCollectionByNameOrId(name)
  } catch (_) {
    return null
  }
}

migrate((app) => {
  const todos = findCollection(app, "todos")
  if (todos) {
    app.delete(todos)
  }
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
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

  app.save(todos)
})

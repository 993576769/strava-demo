// @ts-check

// PocketBase migration: remove Jimeng provider from prompt templates and clean legacy result metadata.

/** @param {PBApp} app @param {string} collectionName @param {string} fieldName @param {string[]} values */
const replaceSelectField = (app, collectionName, fieldName, values) => {
  const collection = app.findCollectionByNameOrId(collectionName)
  if (collection.fields.fieldNames().includes(fieldName)) {
    collection.fields.removeByName(fieldName)
  }

  collection.fields.add(new SelectField({
    name: fieldName,
    required: true,
    maxSelect: 1,
    values,
  }))

  app.save(collection)
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

/** @param {PBRecord | Record<string, unknown>} record @param {string} fieldName */
const getFieldValue = (record, fieldName) => {
  if (record && typeof record.getString === 'function') {
    return record.getString(fieldName)
  }
  if (record && typeof record.getRaw === 'function') {
    return record.getRaw(fieldName)
  }
  return record && typeof record === 'object' && fieldName in record ? record[fieldName] : undefined
}

/** @param {PBRecord | Record<string, unknown>} record @param {string} fieldName @param {unknown} value */
const setFieldValue = (record, fieldName, value) => {
  if (record && typeof record.set === 'function') {
    record.set(fieldName, value)
  } else if (record && typeof record === 'object') {
    record[fieldName] = value
  }
}

migrate((app) => {
  replaceSelectField(app, "art_prompt_templates", "provider", ["doubao-seedream"])

  const promptTemplates = getAllRecords(app, "art_prompt_templates")
  for (const record of promptTemplates) {
    if (String(getFieldValue(record, "provider") || "") === "jimeng46") {
      app.delete(record)
    }
  }

  const artResults = getAllRecords(app, "art_results")
  for (const record of artResults) {
    const metadata = /** @type {Record<string, unknown> | null} */ (getFieldValue(record, "metadata_json"))
    if (!metadata || typeof metadata !== "object") {
      continue
    }

    if (metadata.provider !== "jimeng46" && metadata.renderer !== "jimeng-4.6") {
      continue
    }

    const nextMetadata = Object.assign({}, metadata, {
      legacy_provider: metadata.provider === "jimeng46" ? "jimeng46" : metadata.legacy_provider || "",
      provider: "legacy-removed",
      renderer: "legacy-removed",
    })

    setFieldValue(record, "metadata_json", nextMetadata)
    app.save(record)
  }
}, (app) => {
  replaceSelectField(app, "art_prompt_templates", "provider", ["doubao-seedream", "jimeng46"])
})

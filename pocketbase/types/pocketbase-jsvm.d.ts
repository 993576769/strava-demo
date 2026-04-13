type MigrationCallback = (app: PBApp) => void | unknown

declare function migrate(up: MigrationCallback, down?: MigrationCallback): void

declare interface PBApp {
  save(model: unknown): unknown
  delete(model: unknown): unknown
  findCollectionByNameOrId(nameOrId: string): PBCollection
  findAllRecords?(collectionName: string): PBRecord[]
  findRecordsByFilter?(collectionName: string, filter: string): PBRecord[]
}

declare interface PBCollectionOptions {
  name: string
  type: "auth" | "base" | "view"
  listRule?: string | null
  viewRule?: string | null
  createRule?: string | null
  updateRule?: string | null
  deleteRule?: string | null
  fields?: PBFieldConfig[]
  indexes?: string[]
  passwordAuth?: {
    enabled?: boolean
  }
  oauth2?: {
    enabled?: boolean
  }
  otp?: {
    enabled?: boolean
  }
}

declare interface PBCollection {
  id: string
  fields: PBFieldsList
  passwordAuth?: {
    enabled?: boolean
  }
  oauth2?: {
    enabled?: boolean
  }
  otp?: {
    enabled?: boolean
  }
  addIndex(name: string, unique: boolean, columnsExpr: string, optWhereExpr: string): void
  removeIndex(name: string): void
}

declare class Collection implements PBCollection {
  constructor(config: PBCollectionOptions)
  id: string
  fields: PBFieldsList
  addIndex(name: string, unique: boolean, columnsExpr: string, optWhereExpr: string): void
  removeIndex(name: string): void
}

declare interface PBFieldConfig {
  name: string
  type?: string
  required?: boolean
  min?: number
  max?: number
  maxSelect?: number
  maxSize?: number
  values?: string[]
  mimeTypes?: string[]
  collectionId?: string
  cascadeDelete?: boolean
  displayFields?: string[]
}

declare interface PBField {
  name: string
}

declare interface PBRecord {
  getString(fieldName: string): string
  getRaw(fieldName: string): unknown
  set(fieldName: string, value: unknown): void
  [key: string]: unknown
}

declare interface PBFieldsList {
  fieldNames(): string[]
  add(...fields: PBField[]): void
  removeByName(fieldName: string): void
}

declare class SelectField implements PBField {
  constructor(config: PBFieldConfig)
  name: string
}

declare class DateField implements PBField {
  constructor(config: PBFieldConfig)
  name: string
}

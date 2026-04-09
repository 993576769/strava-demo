/**
 * This file mirrors the output shape of pocketbase-typegen and serves as the
 * committed baseline for the current schema. Regenerate it with:
 * `pnpm run typegen:pocketbase`
 */

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export enum Collections {
  Todos = 'todos',
  Users = 'users',
}

export type IsoDateString = string
export type RecordIdString = string
export type HTMLString = string

type ExpandType<T> = unknown extends T
  ? T extends unknown
    ? { expand?: unknown }
    : { expand: T }
  : { expand?: T }

export type BaseSystemFields<T = unknown> = {
  id: RecordIdString
  collectionId: string
  collectionName: Collections
} & ExpandType<T>

export type AuthSystemFields<T = unknown> = {
  email: string
  emailVisibility: boolean
  username: string
  verified: boolean
} & BaseSystemFields<T>

export enum UsersThemeOptions {
  Light = 'light',
  Dark = 'dark',
  System = 'system',
}

export type UsersRecord = {
  avatar?: string
  created?: IsoDateString
  email: string
  emailVisibility?: boolean
  id: string
  name?: string
  password: string
  theme?: UsersThemeOptions
  tokenKey: string
  updated?: IsoDateString
  verified?: boolean
}

export enum TodosPriorityOptions {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export type TodosRecord<Ttags = unknown> = {
  completed?: boolean
  created?: IsoDateString
  description?: string
  due_date?: IsoDateString
  id: string
  priority?: TodosPriorityOptions
  sort_order?: number
  tags?: null | Ttags
  title: string
  updated?: IsoDateString
  user: RecordIdString
}

export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>
export type TodosResponse<Ttags = unknown, Texpand = unknown> = Required<TodosRecord<Ttags>> & BaseSystemFields<Texpand>

export type CollectionRecords = {
  todos: TodosRecord
  users: UsersRecord
}

export type CollectionResponses = {
  todos: TodosResponse
  users: UsersResponse
}

export type TodoCreate = Pick<TodosRecord<string[]>, 'title' | 'user'> & {
  description?: string
  completed?: boolean
  due_date?: string | null
  priority?: TodosPriorityOptions
  sort_order?: number
  tags?: string[]
}

export type TodoUpdate = Partial<Omit<TodoCreate, 'user'>>

export type UserCreate = Pick<UsersRecord, 'email' | 'password'> & {
  passwordConfirm: string
  name?: string
}

export type UserUpdate = {
  theme?: UsersThemeOptions
}

export type TypedPocketBase = PocketBase & {
  collection(idOrName: 'todos'): RecordService<TodosResponse>
  collection(idOrName: 'users'): RecordService<UsersResponse>
}

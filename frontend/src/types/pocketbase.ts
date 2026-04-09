import type {
  TodoCreate,
  TodoUpdate,
  TodosResponse,
  TypedPocketBase,
  UserCreate,
  UserUpdate,
  UsersResponse,
} from './pocketbase.generated'
import {
  TodosPriorityOptions,
  UsersThemeOptions,
} from './pocketbase.generated'

export type Priority = `${TodosPriorityOptions}`
export type Theme = `${UsersThemeOptions}`
export type TodoCreateInput = Omit<TodoCreate, 'priority'> & {
  priority?: Priority
}
export type TodoUpdateInput = Omit<TodoUpdate, 'priority'> & {
  priority?: Priority
}
export type UserUpdateInput = Omit<UserUpdate, 'theme'> & {
  theme?: Theme
}

export type User = UsersResponse
export type Todo = TodosResponse<string[], { user?: UsersResponse }>

export type { TypedPocketBase }
export type { TodoCreate, TodoUpdate, UserCreate, UserUpdate }

// 前端使用的筛选状态
export type FilterStatus = 'all' | 'active' | 'completed'
export type FilterPriority = 'all' | Priority

export const priorityValues = ['low', 'medium', 'high'] as const satisfies readonly Priority[]
export const themeValues = ['light', 'dark', 'system'] as const satisfies readonly Theme[]
export const filterStatusValues = ['all', 'active', 'completed'] as const satisfies readonly FilterStatus[]

export const isPriority = (value: unknown): value is Priority =>
  typeof value === 'string' && priorityValues.includes(value as Priority)

export const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && themeValues.includes(value as Theme)

export const isFilterStatus = (value: unknown): value is FilterStatus =>
  typeof value === 'string' && filterStatusValues.includes(value as FilterStatus)

export const isUser = (value: unknown): value is User => {
  if (typeof value !== 'object' || value === null) return false

  return (
    'collectionName' in value &&
    value.collectionName === 'users' &&
    'id' in value &&
    'email' in value &&
    'username' in value
  )
}

export const isTodo = (value: unknown): value is Todo => {
  if (typeof value !== 'object' || value === null) return false

  return (
    'collectionName' in value &&
    value.collectionName === 'todos' &&
    'id' in value &&
    'title' in value &&
    'user' in value
  )
}

export function toTodoPriorityOption(priority: Priority): TodosPriorityOptions
export function toTodoPriorityOption(priority?: Priority): TodosPriorityOptions | undefined
export function toTodoPriorityOption(priority?: Priority): TodosPriorityOptions | undefined {
  switch (priority) {
    case 'low':
      return TodosPriorityOptions.Low
    case 'medium':
      return TodosPriorityOptions.Medium
    case 'high':
      return TodosPriorityOptions.High
    default:
      return undefined
  }
}

export function toUserThemeOption(theme: Theme): UsersThemeOptions
export function toUserThemeOption(theme?: Theme): UsersThemeOptions | undefined
export function toUserThemeOption(theme?: Theme): UsersThemeOptions | undefined {
  switch (theme) {
    case 'light':
      return UsersThemeOptions.Light
    case 'dark':
      return UsersThemeOptions.Dark
    case 'system':
      return UsersThemeOptions.System
    default:
      return undefined
  }
}

import PocketBase, { type RecordService } from 'pocketbase'
import { Collections } from '@/types/pocketbase.generated'
import type { Todo, TypedPocketBase, User } from '@/types/pocketbase'

const getPBUrl = () => {
  if (import.meta.env.VITE_PB_URL) return import.meta.env.VITE_PB_URL
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return '/'
}

export const pb = new PocketBase(getPBUrl()) as TypedPocketBase

export const usersCollection = () => pb.collection(Collections.Users) as RecordService<User>
export const todosCollection = () => pb.collection(Collections.Todos) as RecordService<Todo>

if (import.meta.env.DEV) {
  pb.autoCancellation(false)
}

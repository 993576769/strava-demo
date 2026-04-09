import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { todosCollection } from '@/lib/pocketbase'
import { useAuthStore } from './auth'
import {
  isTodo,
  toTodoPriorityOption,
  type Todo,
  type TodoCreate,
  type TodoUpdate,
  type TodoUpdateInput,
  type FilterStatus,
  type FilterPriority,
  type Priority,
} from '@/types/pocketbase'

export const useTodosStore = defineStore('todos', () => {
  const todos = ref<Todo[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 筛选状态
  const filterStatus = ref<FilterStatus>('all')
  const filterPriority = ref<FilterPriority>('all')
  const searchQuery = ref('')

  const auth = useAuthStore()

  const upsertTodo = (todo: Todo, position: 'start' | 'end' = 'start') => {
    const existingIndex = todos.value.findIndex(item => item.id === todo.id)

    if (existingIndex !== -1) {
      todos.value[existingIndex] = todo
      return
    }

    if (position === 'start') {
      todos.value.unshift(todo)
      return
    }

    todos.value.push(todo)
  }

  // 计算属性：筛选后的 todos
  const filteredTodos = computed(() => {
    let result = [...todos.value]

    // 状态筛选
    if (filterStatus.value === 'active') {
      result = result.filter(t => !t.completed)
    } else if (filterStatus.value === 'completed') {
      result = result.filter(t => t.completed)
    }

    // 优先级筛选
    if (filterPriority.value !== 'all') {
      result = result.filter(t => t.priority === filterPriority.value)
    }

    // 搜索
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase()
      result = result.filter(t =>
        t.title.toLowerCase().includes(query) ||
        (t.description?.toLowerCase().includes(query))
      )
    }

    // 排序：sort_order 升序，然后 created 降序
    result.sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order
      }
      return new Date(b.created).getTime() - new Date(a.created).getTime()
    })

    return result
  })

  // 统计
  const stats = computed(() => {
    const total = todos.value.length
    const completed = todos.value.filter(t => t.completed).length
    const active = total - completed
    const overdue = todos.value.filter(t => {
      if (!t.due_date || t.completed) return false
      return new Date(t.due_date) < new Date()
    }).length

    return { total, completed, active, overdue }
  })

  // 获取当前用户的 todos
  const fetchTodos = async () => {
    if (!auth.user) return

    loading.value = true
    error.value = null

    try {
      const result = await todosCollection().getList(1, 500, {
        sort: 'sort_order'
      })
      todos.value = result.items
    } catch (e) {
      error.value = '获取任务列表失败'
      console.error(e)
    } finally {
      loading.value = false
    }
  }

  // 添加 todo
  const addTodo = async (title: string, priority?: Priority, due_date?: string, description?: string, tags?: string[]) => {
    if (!auth.user) return

    try {
      // 获取最大 sort_order
      const maxOrder = todos.value.reduce((max, t) => Math.max(max, t.sort_order || 0), 0)

      const payload: TodoCreate = {
        title,
        completed: false,
        due_date: due_date || null,
        tags: tags || [],
        sort_order: maxOrder + 1,
        user: auth.user.id
      }
      const normalizedDescription = description?.trim()
      if (normalizedDescription) payload.description = normalizedDescription
      payload.priority = toTodoPriorityOption(priority || 'medium')

      const todo = await todosCollection().create(payload)
      upsertTodo(todo)
      return todo
    } catch (e) {
      error.value = '添加任务失败'
      throw e
    }
  }

  // 切换完成状态
  const toggleTodo = async (id: string) => {
    const todo = todos.value.find(t => t.id === id)
    if (!todo) return

    try {
      const updated = await todosCollection().update(id, {
        completed: !todo.completed
      })
      upsertTodo(updated)
    } catch (e) {
      error.value = '更新状态失败'
      throw e
    }
  }

  // 更新 todo
  const updateTodo = async (id: string, data: TodoUpdateInput) => {
    try {
      const { priority, ...rest } = data
      const payload: TodoUpdate = { ...rest }
      if (priority) {
        payload.priority = toTodoPriorityOption(priority)
      }
      const updated = await todosCollection().update(id, payload)
      upsertTodo(updated)
    } catch (e) {
      error.value = '更新任务失败'
      throw e
    }
  }

  // 删除 todo
  const deleteTodo = async (id: string) => {
    try {
      await todosCollection().delete(id)
      todos.value = todos.value.filter(t => t.id !== id)
    } catch (e) {
      error.value = '删除任务失败'
      throw e
    }
  }

  // 批量操作
  const markAllCompleted = async () => {
    const activeTodos = todos.value.filter(t => !t.completed)
    try {
      await Promise.all(
        activeTodos.map(t => todosCollection().update(t.id, { completed: true }))
      )
      activeTodos.forEach(t => t.completed = true)
    } catch (e) {
      error.value = '批量更新失败'
      throw e
    }
  }

  const clearCompleted = async () => {
    const completedTodos = todos.value.filter(t => t.completed)
    try {
      await Promise.all(
        completedTodos.map(t => todosCollection().delete(t.id))
      )
      todos.value = todos.value.filter(t => !t.completed)
    } catch (e) {
      error.value = '清除失败'
      throw e
    }
  }

  // 拖拽排序
  const reorderTodos = async (fromIndex: number, toIndex: number) => {
    const filtered = [...filteredTodos.value]
    const [moved] = filtered.splice(fromIndex, 1)
    if (!moved) return
    filtered.splice(toIndex, 0, moved)

    // 更新 sort_order
    const updates = filtered.map((todo, index) => ({
      id: todo.id,
      sort_order: index
    }))

    try {
      await Promise.all(
        updates.map(u => todosCollection().update(u.id, { sort_order: u.sort_order }))
      )

      // 更新本地状态
      updates.forEach(u => {
        const todo = todos.value.find(t => t.id === u.id)
        if (todo) todo.sort_order = u.sort_order
      })
    } catch (e) {
      error.value = '排序更新失败'
      throw e
    }
  }

  // 实时订阅
  const subscribe = () => {
    todosCollection().subscribe<Todo>('*', (e) => {
      // 确保是当前用户的 todo
      if (!isTodo(e.record) || e.record.user !== auth.user?.id) return

      if (e.action === 'create') {
        upsertTodo(e.record)
      }
      if (e.action === 'update') {
        upsertTodo(e.record)
      }
      if (e.action === 'delete') {
        todos.value = todos.value.filter(t => t.id !== e.record.id)
      }
    })
  }

  // 取消订阅
  const unsubscribe = () => {
    todosCollection().unsubscribe()
  }

  return {
    todos,
    filteredTodos,
    loading,
    error,
    filterStatus,
    filterPriority,
    searchQuery,
    stats,
    fetchTodos,
    addTodo,
    toggleTodo,
    updateTodo,
    deleteTodo,
    markAllCompleted,
    clearCompleted,
    reorderTodos,
    subscribe,
    unsubscribe
  }
})

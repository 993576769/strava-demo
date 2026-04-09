<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Todo, Priority, TodoUpdateInput } from '@/types/pocketbase'

const props = defineProps<{ todo: Todo }>()
const emit = defineEmits<{
  toggle: [id: string]
  update: [id: string, data: TodoUpdateInput]
  delete: [id: string]
}>()

const isEditing = ref(false)
const editTitle = ref('')
const editDescription = ref('')
const editPriority = ref<Priority>('medium')
const editDueDate = ref('')

// 优先级颜色
const priorityColors: Record<Priority, string> = {
  low: 'var(--info)',
  medium: 'var(--warning)',
  high: 'var(--danger)'
}

const priorityLabels: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高'
}

// 是否过期
const isOverdue = computed(() => {
  if (!props.todo.due_date || props.todo.completed) return false
  return new Date(props.todo.due_date) < new Date()
})

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) return '今天'
  if (days === 1) return '明天'
  if (days === -1) return '昨天'
  if (days < 0) return `过期 ${Math.abs(days)} 天`
  if (days <= 7) return `${days} 天后`
  
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

const startEdit = () => {
  editTitle.value = props.todo.title
  editDescription.value = props.todo.description || ''
  editPriority.value = props.todo.priority || 'medium'
  editDueDate.value = props.todo.due_date?.split('T')[0] ?? ''
  isEditing.value = true
}

const saveEdit = () => {
  if (editTitle.value.trim()) {
    const payload: TodoUpdateInput = {
      title: editTitle.value.trim(),
      priority: editPriority.value
    }

    const description = editDescription.value.trim()
    if (description) payload.description = description

    if (editDueDate.value) {
      payload.due_date = editDueDate.value
    }

    emit('update', props.todo.id, payload)
  }
  isEditing.value = false
}

const cancelEdit = () => {
  isEditing.value = false
}
</script>

<template>
  <div 
    class="todo-item" 
    :class="{ 
      completed: todo.completed, 
      overdue: isOverdue,
      [`priority-${todo.priority}`]: todo.priority
    }"
  >
    <input
      type="checkbox"
      :checked="todo.completed"
      @change="emit('toggle', todo.id)"
      class="checkbox"
    />

    <template v-if="isEditing">
      <div class="edit-form">
        <input
          v-model="editTitle"
          @keyup.enter="saveEdit"
          @keyup.escape="cancelEdit"
          class="edit-input"
          placeholder="任务标题"
          v-focus
        />
        <textarea
          v-model="editDescription"
          class="edit-textarea"
          placeholder="描述（可选）"
          rows="2"
        />
        <div class="edit-options">
          <select v-model="editPriority" class="edit-select">
            <option value="low">低优先级</option>
            <option value="medium">中优先级</option>
            <option value="high">高优先级</option>
          </select>
          <input
            type="date"
            v-model="editDueDate"
            class="edit-date"
          />
        </div>
        <div class="edit-actions">
          <button class="btn btn-sm btn-primary" @click="saveEdit">保存</button>
          <button class="btn btn-sm btn-ghost" @click="cancelEdit">取消</button>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="todo-content">
        <div class="todo-header">
          <span class="title" @dblclick="startEdit">{{ todo.title }}</span>
          <span 
            v-if="todo.priority" 
            class="priority-badge"
            :style="{ backgroundColor: priorityColors[todo.priority] }"
          >
            {{ priorityLabels[todo.priority] }}
          </span>
        </div>
        
        <p v-if="todo.description" class="description">{{ todo.description }}</p>
        
        <div class="todo-meta">
          <span v-if="todo.due_date" class="due-date" :class="{ overdue: isOverdue }">
            📅 {{ formatDate(todo.due_date) }}
          </span>
          <span v-if="todo.tags?.length" class="tags">
            <span v-for="tag in todo.tags" :key="tag" class="tag">{{ tag }}</span>
          </span>
        </div>
      </div>
      
      <div class="actions">
        <button class="btn btn-sm btn-ghost" @click="startEdit" title="编辑">✏️</button>
        <button class="btn btn-sm btn-danger" @click="emit('delete', todo.id)" title="删除">🗑️</button>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
// v-focus 指令
export default {
  directives: {
    focus: {
      mounted(el: HTMLInputElement) {
        el.focus()
        el.select()
      }
    }
  }
}
</script>

<style scoped>
.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s ease;
}

.todo-item:last-child {
  border-bottom: none;
}

.todo-item:hover {
  background: var(--bg);
}

.todo-item.completed {
  opacity: 0.7;
}

.todo-item.completed .title {
  text-decoration: line-through;
  color: var(--text-light);
}

.todo-item.overdue {
  border-left: 3px solid var(--danger);
}

.todo-item.priority-high {
  border-left: 3px solid var(--danger);
}

.todo-item.priority-medium {
  border-left: 3px solid var(--warning);
}

.todo-item.priority-low {
  border-left: 3px solid var(--info);
}

.checkbox {
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;
  accent-color: var(--primary);
  margin-top: 0.125rem;
  flex-shrink: 0;
}

.todo-content {
  flex: 1;
  min-width: 0;
}

.todo-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.title {
  font-size: 1rem;
  cursor: text;
  word-break: break-word;
}

.priority-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  color: white;
  font-weight: 500;
  text-transform: uppercase;
}

.description {
  font-size: 0.875rem;
  color: var(--text-light);
  margin-top: 0.25rem;
  word-break: break-word;
}

.todo-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.375rem;
  flex-wrap: wrap;
}

.due-date {
  font-size: 0.75rem;
  color: var(--text-light);
}

.due-date.overdue {
  color: var(--danger);
  font-weight: 500;
}

.tags {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.tag {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  background: var(--primary-light);
  color: var(--primary);
  border-radius: 0.25rem;
}

.actions {
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.todo-item:hover .actions {
  opacity: 1;
}

/* 移动端始终显示操作按钮 */
@media (max-width: 640px) {
  .actions {
    opacity: 1;
  }
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

/* 编辑表单 */
.edit-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.edit-input {
  padding: 0.375rem 0.5rem;
  font-size: 1rem;
  border: 1px solid var(--primary);
  border-radius: 0.375rem;
  width: 100%;
}

.edit-textarea {
  padding: 0.375rem 0.5rem;
  font-size: 0.875rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  resize: vertical;
  min-height: 60px;
  width: 100%;
}

.edit-options {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.edit-select,
.edit-date {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  background: var(--bg);
}

.edit-actions {
  display: flex;
  gap: 0.25rem;
}
</style>

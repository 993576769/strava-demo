<script setup lang="ts">
import { Calendar, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'

const dueDate = defineModel<string | null>({ default: null })

const showPicker = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

const formattedDate = computed(() => {
  if (!dueDate.value) { return null }
  const date = new Date(dueDate.value)
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
})

const openPicker = () => {
  showPicker.value = true
  inputRef.value?.showPicker?.()
}

const clearDate = () => {
  dueDate.value = null
  showPicker.value = false
}

const handleDateChange = (e: Event) => {
  const target = e.target
  if (!(target instanceof HTMLInputElement)) { return }
  dueDate.value = target.value || null
  showPicker.value = false
}
</script>

<template>
  <div class="relative flex items-center">
    <input
      ref="inputRef"
      type="date"
      :value="dueDate ?? ''"
      class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      @change="handleDateChange"
    >

    <button
      v-if="dueDate"
      class="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-2.5 text-xs font-medium text-blue-500 transition-all duration-200 hover:bg-blue-500/20 sm:min-h-0 sm:rounded-xl sm:py-2"
      @click.stop="openPicker"
    >
      <Calendar class="h-4 w-4 sm:h-3.5 sm:w-3.5" />
      {{ formattedDate }}
      <X
        class="ml-0.5 h-3.5 w-3.5 hover:text-red-400 sm:h-3 sm:w-3"
        @click.stop="clearDate"
      />
    </button>

    <button
      v-else
      class="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-medium text-[var(--color-text-muted)] transition-all duration-200 hover:bg-[var(--color-border)]/30 sm:min-h-0 sm:rounded-xl sm:py-2"
      @click.stop="openPicker"
    >
      <Calendar class="h-4 w-4" />
      <span class="hidden sm:inline">截止日期</span>
    </button>
  </div>
</template>

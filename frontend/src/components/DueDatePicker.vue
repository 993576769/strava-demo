<script setup lang="ts">
import { ref, computed } from 'vue'
import { Calendar, X } from 'lucide-vue-next'

const dueDate = defineModel<string | null>({ default: null })

const showPicker = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

const formattedDate = computed(() => {
  if (!dueDate.value) return null
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
  if (!(target instanceof HTMLInputElement)) return
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
      class="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
      @change="handleDateChange"
    />

    <button
      v-if="dueDate"
      class="inline-flex items-center gap-1.5 px-3 py-2.5 sm:py-2 text-xs font-medium rounded-lg sm:rounded-xl transition-all duration-200 cursor-pointer bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 min-h-[44px] sm:min-h-0"
      @click.stop="openPicker"
    >
      <Calendar class="w-4 h-4 sm:w-3.5 sm:h-3.5" />
      {{ formattedDate }}
      <X
        class="w-3.5 h-3.5 sm:w-3 sm:h-3 ml-0.5 hover:text-red-400"
        @click.stop="clearDate"
      />
    </button>

    <button
      v-else
      class="inline-flex items-center gap-1.5 px-3 py-2.5 sm:py-2 text-xs font-medium text-[var(--color-text-muted)] rounded-lg sm:rounded-xl hover:bg-[var(--color-border)]/30 transition-all duration-200 cursor-pointer min-h-[44px] sm:min-h-0"
      @click.stop="openPicker"
    >
      <Calendar class="w-4 h-4" />
      <span class="hidden sm:inline">截止日期</span>
    </button>
  </div>
</template>

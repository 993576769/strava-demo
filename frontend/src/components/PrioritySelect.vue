<script setup lang="ts">
import { Flag } from 'lucide-vue-next'

const priority = defineModel<number>({ default: 0 })

const priorities = [
  { value: 0, label: '低', color: 'text-gray-400 hover:text-gray-500 hover:bg-gray-500/10' },
  { value: 1, label: '中', color: 'text-yellow-500 hover:text-yellow-600 hover:bg-yellow-500/10' },
  { value: 2, label: '高', color: 'text-red-500 hover:text-red-600 hover:bg-red-500/10' },
]
</script>

<template>
  <div class="flex gap-0.5 sm:gap-1">
    <button
      v-for="p in priorities"
      :key="p.value"
      type="button"
      class="p-2.5 sm:p-2 rounded-lg sm:rounded-xl transition-all duration-200 cursor-pointer min-h-[44px] sm:min-h-0 min-w-[44px] sm:min-w-0 flex items-center justify-center"
      :class="[p.color, { 'bg-current/10 ring-2 ring-current/30': priority === p.value }]"
      :title="p.label"
      @click="priority = p.value"
    >
      <Flag class="w-4 h-4" />
    </button>
  </div>
</template>

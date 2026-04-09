<script setup lang="ts">
import { computed } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import type { Theme } from '@/types/pocketbase'
import { Sun, Moon, Monitor } from 'lucide-vue-next'

const themeStore = useThemeStore()
const authStore = useAuthStore()

const themeOptions: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'system', icon: Monitor, label: '跟随系统' },
  { value: 'light', icon: Sun, label: '浅色' },
  { value: 'dark', icon: Moon, label: '深色' }
]

const currentIcon = computed(() => {
  switch (themeStore.theme) {
    case 'light':
      return Sun
    case 'dark':
      return Moon
    default:
      return Monitor
  }
})

const setTheme = async (theme: Theme) => {
  themeStore.setTheme(theme)
  // Sync with PocketBase if logged in
  if (authStore.isLoggedIn) {
    await authStore.updateTheme(theme)
  }
}
</script>

<template>
  <div class="relative group">
    <button
      class="p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition-all duration-200 cursor-pointer min-h-[40px] sm:min-h-0 min-w-[40px] sm:min-w-0 flex items-center justify-center"
      :class="[
        'bg-[var(--color-surface-elevated)] border border-[var(--color-border)]',
        'hover:border-primary hover:bg-primary/10'
      ]"
      :title="themeOptions.find(o => o.value === themeStore.theme)?.label"
    >
      <component :is="currentIcon" class="w-4 h-4 sm:w-5 sm:h-5 text-[var(--color-text-muted)] group-hover:text-primary transition-colors" />
    </button>

    <!-- Dropdown -->
    <div class="absolute right-0 top-full mt-2 py-1 sm:py-1.5 bg-[var(--color-surface-card)] border border-[var(--color-border)] rounded-lg sm:rounded-xl card-shadow opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 min-w-[130px] sm:min-w-[140px]">
      <button
        v-for="option in themeOptions"
        :key="option.value"
        class="w-full px-3.5 sm:px-4 py-2.5 sm:py-2.5 text-sm flex items-center gap-2.5 sm:gap-3 transition-all duration-200 cursor-pointer"
        :class="themeStore.theme === option.value
          ? 'text-primary bg-primary/10'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)]'"
        @click="setTheme(option.value)"
      >
        <component :is="option.icon" class="w-4 h-4" />
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

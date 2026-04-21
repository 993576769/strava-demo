<script setup lang="ts">
import type { Theme } from '@/types/api'
import { Monitor, Moon, Sun } from 'lucide-vue-next'
import { computed } from 'vue'
import AppDropdown from '@/components/AppDropdown.vue'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()

const themeOptions: { value: Theme, icon: typeof Sun, label: string }[] = [
  { value: 'system', icon: Monitor, label: '跟随系统' },
  { value: 'light', icon: Sun, label: '浅色' },
  { value: 'dark', icon: Moon, label: '深色' },
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

const setTheme = (theme: Theme, close: () => void) => {
  themeStore.setTheme(theme)
  close()
}

const themeOptionClass = (theme: Theme) => cn(
  themeStore.theme === theme
    ? 'text-primary bg-primary/10'
    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)]',
)

const currentLabel = computed(() => themeOptions.find(option => option.value === themeStore.theme)?.label ?? '切换主题')
</script>

<template>
  <AppDropdown :min-width="144" panel-class="rounded-xl py-1.5">
    <template #trigger="{ isOpen, toggle }">
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-full p-0 transition-all duration-200 hover:text-primary"
        :aria-expanded="isOpen"
        aria-haspopup="menu"
        :title="currentLabel"
        @click="toggle"
      >
        <component :is="currentIcon" class="h-4 w-4 text-(--color-text-muted) transition-colors" :class="isOpen ? 'text-primary' : ''" />
      </button>
    </template>

    <template #default="{ close }">
      <button
        v-for="option in themeOptions"
        :key="option.value"
        type="button"
        class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm transition-all duration-200 sm:gap-3 sm:px-4 sm:py-2.5"
        :class="themeOptionClass(option.value)"
        role="menuitemradio"
        :aria-checked="themeStore.theme === option.value"
        @click="setTheme(option.value, close)"
      >
        <component :is="option.icon" class="h-4 w-4" />
        {{ option.label }}
      </button>
    </template>
  </AppDropdown>
</template>

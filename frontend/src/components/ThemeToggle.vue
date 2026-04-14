<script setup lang="ts">
import type { Theme } from '@/types/pocketbase'
import { onClickOutside, useToggle } from '@vueuse/core'
import { Monitor, Moon, Sun } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
const [isOpen, toggleOpen] = useToggle(false)
const menuRef = ref<HTMLElement | null>(null)

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

const setTheme = (theme: Theme) => {
  themeStore.setTheme(theme)
  toggleOpen(false)
}

const themeOptionClass = (theme: Theme) => cn(
  themeStore.theme === theme
    ? 'text-primary bg-primary/10'
    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)]',
)

const currentLabel = computed(() => themeOptions.find(option => option.value === themeStore.theme)?.label ?? '切换主题')

const toggleMenu = () => {
  toggleOpen()
}

onClickOutside(menuRef, () => {
  toggleOpen(false)
})
</script>

<template>
  <div ref="menuRef" class="relative">
    <button
      type="button"
      class="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-(--color-border) bg-(--color-surface-elevated) p-2 transition-all duration-200 hover:border-primary hover:bg-primary/10 sm:min-h-0 sm:min-w-0 sm:rounded-xl sm:p-2.5"
      :aria-expanded="isOpen"
      aria-haspopup="menu"
      :title="currentLabel"
      @click="toggleMenu"
    >
      <component :is="currentIcon" class="h-4 w-4 text-(--color-text-muted) transition-colors sm:h-5 sm:w-5" :class="isOpen ? 'text-primary' : ''" />
    </button>

    <div
      v-show="isOpen"
      class="absolute top-full right-0 z-50 mt-2 min-w-36 rounded-lg border border-(--color-border) bg-(--color-surface-card) py-1 transition-all duration-200 sm:min-w-36 sm:rounded-xl sm:py-1.5"
      role="menu"
      aria-label="主题切换菜单"
    >
      <button
        v-for="option in themeOptions"
        :key="option.value"
        type="button"
        class="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-sm transition-all duration-200 sm:gap-3 sm:px-4 sm:py-2.5"
        :class="themeOptionClass(option.value)"
        role="menuitemradio"
        :aria-checked="themeStore.theme === option.value"
        @click="setTheme(option.value)"
      >
        <component :is="option.icon" class="h-4 w-4" />
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

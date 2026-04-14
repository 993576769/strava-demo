import type { Theme } from '@/types/pocketbase'
import { useColorMode } from '@vueuse/core'
import { defineStore } from 'pinia'

export { type Theme }

export const useThemeStore = defineStore('theme', () => {
  const colorMode = useColorMode<Theme>({
    attribute: 'data-theme',
    initialValue: 'system',
    modes: {
      light: 'light',
      dark: 'dark',
      system: 'system',
    },
    storageKey: 'theme',
  })

  const theme = colorMode.store

  const setTheme = (t: Theme) => {
    theme.value = t
  }

  const toggleTheme = () => {
    const current = colorMode.state.value
    setTheme(current === 'dark' ? 'light' : 'dark')
  }

  return {
    theme,
    setTheme,
    toggleTheme,
  }
})

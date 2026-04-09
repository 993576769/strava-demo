import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { isTheme, type Theme } from '@/types/pocketbase'

export { type Theme }

const getStoredTheme = (): Theme => {
  if (typeof window === 'undefined') return 'system'

  const storedTheme = window.localStorage.getItem('theme')
  return isTheme(storedTheme) ? storedTheme : 'system'
}

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>(getStoredTheme())

  // Get the actual theme based on system preference
  const getSystemTheme = (): 'light' | 'dark' => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return 'dark'
  }

  // Apply theme to document
  const applyTheme = (t: Theme) => {
    const actualTheme = t === 'system' ? getSystemTheme() : t
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(actualTheme)
  }

  // Initial apply
  applyTheme(theme.value)

  // Watch for changes
  watch(theme, (newTheme) => {
    window.localStorage.setItem('theme', newTheme)
    applyTheme(newTheme)
  })

  // Listen for system theme changes
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (theme.value === 'system') {
        applyTheme('system')
      }
    })
  }

  const setTheme = (t: Theme) => {
    theme.value = t
  }

  const toggleTheme = () => {
    const current = theme.value === 'system' ? getSystemTheme() : theme.value
    setTheme(current === 'dark' ? 'light' : 'dark')
  }

  // Initialize theme from user preference (called after auth)
  const initFromUser = (userTheme?: Theme) => {
    if (userTheme && userTheme !== theme.value) {
      theme.value = userTheme
    }
  }

  return {
    theme,
    setTheme,
    toggleTheme,
    initFromUser
  }
})

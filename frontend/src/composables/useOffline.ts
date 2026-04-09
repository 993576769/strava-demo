import { ref, onMounted, onUnmounted } from 'vue'

export function useOffline() {
  const isOffline = ref(!navigator.onLine)

  const handleOnline = () => {
    isOffline.value = false
  }

  const handleOffline = () => {
    isOffline.value = true
  }

  onMounted(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  })

  onUnmounted(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  })

  return {
    isOffline
  }
}

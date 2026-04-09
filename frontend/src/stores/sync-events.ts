import { defineStore } from 'pinia'
import { ref } from 'vue'
import { syncEventsCollection } from '@/lib/pocketbase'
import { isSyncEvent, type SyncEvent } from '@/types/pocketbase'

export const useSyncEventsStore = defineStore('syncEvents', () => {
  const events = ref<SyncEvent[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchLatestEvents = async () => {
    loading.value = true
    error.value = null

    try {
      const result = await syncEventsCollection().getList(1, 8, {
        sort: '-created',
      })
      events.value = result.items.filter(isSyncEvent)
    } catch (value) {
      console.error(value)
      events.value = []
      error.value = '读取同步事件失败'
    } finally {
      loading.value = false
    }
  }

  const clear = () => {
    events.value = []
    error.value = null
  }

  return {
    events,
    loading,
    error,
    fetchLatestEvents,
    clear,
  }
})

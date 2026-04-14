import type { SyncEvent } from '@/types/pocketbase'
import { useQuery } from '@pinia/colada'
import { defineStore } from 'pinia'
import { computed } from 'vue'
import { syncEventsCollection } from '@/lib/pocketbase'
import { isSyncEvent } from '@/types/pocketbase'

export const useSyncEventsStore = defineStore('syncEvents', () => {
  const eventsQuery = useQuery<SyncEvent[], Error>({
    key: ['sync-events', 'latest'],
    query: async () => {
      const result = await syncEventsCollection().getList(1, 8, {
        sort: '-occurred_at',
      })
      return result.items.filter(isSyncEvent)
    },
    refetchOnWindowFocus: false,
  })

  const events = computed(() => eventsQuery.data.value ?? [])
  const loading = computed(() => eventsQuery.isLoading.value)
  const error = computed(() => eventsQuery.error.value ? '读取同步事件失败' : null)

  const fetchLatestEvents = async () => {
    await eventsQuery.refetch()
  }

  const clear = () => {
    // Colada cache is shared; local reset isn't needed here.
  }

  return {
    events,
    loading,
    error,
    fetchLatestEvents,
    clear,
  }
})

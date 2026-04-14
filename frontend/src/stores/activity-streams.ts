import type { ActivityStream } from '@/types/pocketbase'
import { useQuery } from '@pinia/colada'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { activityStreamsCollection } from '@/lib/pocketbase'
import { isActivityStream } from '@/types/pocketbase'

export const useActivityStreamsStore = defineStore('activityStreams', () => {
  const currentActivityId = ref('')

  const streamQuery = useQuery<ActivityStream | null, Error>({
    key: () => ['activity-streams', currentActivityId.value || '__idle__'],
    enabled: computed(() => currentActivityId.value.length > 0),
    query: async () => {
      const record = await activityStreamsCollection().getFirstListItem(`activity = "${currentActivityId.value}"`)
      return isActivityStream(record) ? record : null
    },
    refetchOnWindowFocus: false,
  })

  const currentStream = computed(() => currentActivityId.value ? (streamQuery.data.value ?? null) : null)
  const loading = computed(() => currentActivityId.value.length > 0 && streamQuery.isLoading.value)
  const error = computed(() => streamQuery.error.value ? '读取活动轨迹失败' : null)

  const fetchStreamForActivity = async (activityId: string) => {
    currentActivityId.value = activityId
    await streamQuery.refetch()
  }

  const clear = () => {
    currentActivityId.value = ''
  }

  return {
    currentStream,
    loading,
    error,
    fetchStreamForActivity,
    clear,
  }
})

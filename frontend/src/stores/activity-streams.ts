import { defineStore } from 'pinia'
import { ref } from 'vue'
import { activityStreamsCollection } from '@/lib/pocketbase'
import { isActivityStream, type ActivityStream } from '@/types/pocketbase'

export const useActivityStreamsStore = defineStore('activityStreams', () => {
  const currentStream = ref<ActivityStream | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchStreamForActivity = async (activityId: string) => {
    loading.value = true
    error.value = null

    try {
      const record = await activityStreamsCollection().getFirstListItem(`activity = "${activityId}"`)
      currentStream.value = isActivityStream(record) ? record : null
    } catch (value) {
      console.error(value)
      currentStream.value = null
      error.value = '读取活动轨迹失败'
    } finally {
      loading.value = false
    }
  }

  const clear = () => {
    currentStream.value = null
    error.value = null
  }

  return {
    currentStream,
    loading,
    error,
    fetchStreamForActivity,
    clear,
  }
})

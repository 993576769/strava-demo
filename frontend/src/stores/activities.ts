import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { activitiesCollection } from '@/lib/pocketbase'
import { useAuthStore } from '@/stores/auth'
import { isActivity, type Activity } from '@/types/pocketbase'

export const useActivitiesStore = defineStore('activities', () => {
  const auth = useAuthStore()

  const activities = ref<Activity[]>([])
  const currentActivity = ref<Activity | null>(null)
  const loading = ref(false)
  const detailLoading = ref(false)
  const error = ref<string | null>(null)

  const readyActivities = computed(() => activities.value.filter((activity) => activity.sync_status === 'ready'))
  const generatableActivities = computed(() => activities.value.filter((activity) => activity.is_generatable))

  const fetchActivities = async () => {
    if (!auth.isLoggedIn) {
      activities.value = []
      return
    }

    loading.value = true
    error.value = null

    try {
      const result = await activitiesCollection().getList(1, 100, {
        sort: '-start_date',
      })
      activities.value = result.items.filter(isActivity)
    } catch (value) {
      console.error(value)
      error.value = '读取活动列表失败'
      activities.value = []
    } finally {
      loading.value = false
    }
  }

  const fetchActivityById = async (id: string) => {
    detailLoading.value = true
    error.value = null

    try {
      const record = await activitiesCollection().getOne(id)
      currentActivity.value = isActivity(record) ? record : null
    } catch (value) {
      console.error(value)
      currentActivity.value = null
      error.value = '读取活动详情失败'
    } finally {
      detailLoading.value = false
    }
  }

  const clearCurrentActivity = () => {
    currentActivity.value = null
  }

  return {
    activities,
    currentActivity,
    loading,
    detailLoading,
    error,
    readyActivities,
    generatableActivities,
    fetchActivities,
    fetchActivityById,
    clearCurrentActivity,
  }
})

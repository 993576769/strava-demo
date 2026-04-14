import type { Activity } from '@/types/pocketbase'
import { useQuery } from '@pinia/colada'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { activitiesCollection } from '@/lib/pocketbase'
import { useAuthStore } from '@/stores/auth'
import { isActivity } from '@/types/pocketbase'

const fetchActivitiesList = async () => {
  const result = await activitiesCollection().getList(1, 100, {
    sort: '-start_date',
  })

  return result.items.filter(isActivity)
}

export const useActivitiesStore = defineStore('activities', () => {
  const auth = useAuthStore()
  const currentActivityId = ref('')

  const activitiesQuery = useQuery<Activity[], Error>({
    key: () => ['activities', 'list', auth.user?.id ?? '__guest__'],
    enabled: computed(() => auth.isLoggedIn),
    query: fetchActivitiesList,
    refetchOnWindowFocus: false,
  })

  const detailQuery = useQuery<Activity | null, Error>({
    key: () => ['activities', 'detail', currentActivityId.value || '__idle__'],
    enabled: computed(() => currentActivityId.value.length > 0),
    query: async () => {
      const record = await activitiesCollection().getOne(currentActivityId.value)
      return isActivity(record) ? record : null
    },
    refetchOnWindowFocus: false,
  })

  const activities = computed(() => (auth.isLoggedIn ? activitiesQuery.data.value ?? [] : []))
  const currentActivity = computed(() => currentActivityId.value ? (detailQuery.data.value ?? null) : null)
  const loading = computed(() => auth.isLoggedIn && activitiesQuery.isLoading.value)
  const detailLoading = computed(() => currentActivityId.value.length > 0 && detailQuery.isLoading.value)
  const error = computed(() => {
    if (detailQuery.error.value) { return '读取活动详情失败' }
    if (activitiesQuery.error.value) { return '读取活动列表失败' }
    return null
  })

  const readyActivities = computed(() => activities.value.filter(activity => activity.sync_status === 'ready'))
  const generatableActivities = computed(() => activities.value.filter(activity => activity.is_generatable))

  const fetchActivities = async () => {
    if (!auth.isLoggedIn) { return }
    await activitiesQuery.refetch()
  }

  const fetchActivityById = async (id: string) => {
    currentActivityId.value = id
    await detailQuery.refetch()
  }

  const clearCurrentActivity = () => {
    currentActivityId.value = ''
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

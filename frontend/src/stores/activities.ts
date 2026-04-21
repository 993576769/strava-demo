import type { Activity } from '@/types/api'
import { useQuery } from '@pinia/colada'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { isActivity } from '@/types/api'

const ACTIVITIES_PER_PAGE = 12

export const useActivitiesStore = defineStore('activities', () => {
  const auth = useAuthStore()
  const currentActivityId = ref('')
  const activities = ref<Activity[]>([])
  const totalItems = ref(0)
  const currentPage = ref(1)
  const loading = ref(false)
  const loadingMore = ref(false)
  const listError = ref<string | null>(null)

  const fetchActivitiesPage = async (page: number) => {
    const result = await api.activities.list(page, ACTIVITIES_PER_PAGE)

    return {
      items: result.items.filter(isActivity),
      page: result.page,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
    }
  }

  const detailQuery = useQuery<Activity | null, Error>({
    key: () => ['activities', 'detail', currentActivityId.value || '__idle__'],
    enabled: computed(() => currentActivityId.value.length > 0),
    query: async () => {
      const response = await api.activities.getOne(currentActivityId.value)
      const record = response.activity
      return isActivity(record) ? record : null
    },
    refetchOnWindowFocus: false,
  })

  const currentActivity = computed(() => currentActivityId.value ? (detailQuery.data.value ?? null) : null)
  const detailLoading = computed(() => currentActivityId.value.length > 0 && detailQuery.isPending.value)
  const hasMore = computed(() => activities.value.length < totalItems.value)
  const error = computed(() => {
    if (detailQuery.error.value) { return '读取活动详情失败' }
    if (listError.value) { return listError.value }
    return null
  })

  const readyActivities = computed(() => activities.value.filter(activity => activity.sync_status === 'ready'))
  const generatableActivities = computed(() => activities.value.filter(activity => activity.is_generatable))
  const loadedCount = computed(() => activities.value.length)

  const fetchActivities = async () => {
    if (!auth.isLoggedIn) { return }

    loading.value = true
    listError.value = null

    try {
      const result = await fetchActivitiesPage(1)
      activities.value = result.items
      totalItems.value = result.totalItems
      currentPage.value = result.page
    }
    catch (value) {
      console.error(value)
      listError.value = '读取活动列表失败'
    }
    finally {
      loading.value = false
    }
  }

  const loadMoreActivities = async () => {
    if (!auth.isLoggedIn || loading.value || loadingMore.value || !hasMore.value) { return }

    loadingMore.value = true
    listError.value = null

    try {
      const nextPage = currentPage.value + 1
      const result = await fetchActivitiesPage(nextPage)
      activities.value = activities.value.concat(result.items)
      totalItems.value = result.totalItems
      currentPage.value = result.page
    }
    catch (value) {
      console.error(value)
      listError.value = '读取更多活动失败'
    }
    finally {
      loadingMore.value = false
    }
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
    totalItems,
    loadedCount,
    currentActivity,
    loading,
    loadingMore,
    hasMore,
    detailLoading,
    error,
    readyActivities,
    generatableActivities,
    fetchActivities,
    loadMoreActivities,
    fetchActivityById,
    clearCurrentActivity,
  }
})

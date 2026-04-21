import type { ArtResult } from '@/types/api'
import { useInfiniteQuery, useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/lib/api'
import { isArtResult } from '@/types/api'

interface RenderMockJobResponse {
  job?: unknown
  result?: unknown
  reused?: boolean
  queued?: boolean
  provider?: string
}

interface ActivityResultsPage {
  items: ArtResult[]
  page: number
  perPage: number
  totalPages: number
  totalItems: number
}

interface QueueJobResult {
  result: ArtResult | null
  queued: boolean
  reused: boolean
  provider: string | null
}

const fetchResultsPage = async (activityId: string, page: number, perPage: number) => {
  const response = await api.art.listResults(activityId, page, perPage)

  return {
    items: response.items
      .filter(isArtResult)
      .sort((left, right) => new Date(right.created).getTime() - new Date(left.created).getTime()),
    page: response.page,
    perPage: response.perPage,
    totalPages: response.totalPages,
    totalItems: response.totalItems,
  } satisfies ActivityResultsPage
}

export const useArtResultsStore = defineStore('artResults', () => {
  const queryCache = useQueryCache()
  const listActivityId = ref('')
  const listPerPage = ref(20)
  const detailResultId = ref('')
  const lastProvider = ref<string | null>(null)

  const listQuery = useInfiniteQuery<ActivityResultsPage, Error, number>({
    key: () => ['art-results', 'activity', listActivityId.value || '__idle__', listPerPage.value],
    enabled: computed(() => listActivityId.value.length > 0),
    initialPageParam: 1,
    query: ({ pageParam }) => fetchResultsPage(listActivityId.value, pageParam, listPerPage.value),
    getNextPageParam: (lastPage) => {
      return lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined
    },
    refetchOnWindowFocus: false,
  })

  const detailQuery = useQuery<ArtResult | null, Error>({
    key: () => ['art-results', 'detail', detailResultId.value || '__idle__'],
    enabled: computed(() => detailResultId.value.length > 0),
    query: async () => {
      const response = await api.art.getResult(detailResultId.value)
      const record = response.result
      return isArtResult(record) ? record : null
    },
    refetchOnWindowFocus: false,
  })

  const queueMutation = useMutation<QueueJobResult, string, Error>({
    mutation: async (jobId) => {
      const response = await api.art.queueJob(jobId) as RenderMockJobResponse

      return {
        result: isArtResult(response.result) ? response.result : null,
        queued: response.queued !== false,
        reused: !!response.reused,
        provider: response.provider ?? null,
      }
    },
    onSuccess: (payload) => {
      lastProvider.value = payload.provider

      if (!payload.result) { return }

      queryCache.setQueryData(['art-results', 'detail', payload.result.id], payload.result)
      void queryCache.invalidateQueries({
        key: ['art-results', 'activity', payload.result.activity],
      }, 'all')
    },
  })

  const results = computed(() => {
    if (!listActivityId.value) { return [] }

    return listQuery.data.value?.pages.flatMap(page => page.items) ?? []
  })
  const latestPage = computed(() => {
    const pages = listQuery.data.value?.pages
    return pages && pages.length > 0 ? pages[pages.length - 1] : null
  })
  const latestPageParam = computed<number>(() => {
    const pageParams = listQuery.data.value?.pageParams
    return pageParams && pageParams.length > 0 ? (pageParams[pageParams.length - 1] ?? 1) : 1
  })
  const currentResult = computed(() => {
    if (!detailResultId.value) { return null }
    return detailQuery.data.value ?? null
  })
  const loading = computed(() => listQuery.isPending.value && results.value.length === 0)
  const detailLoading = computed(() => detailResultId.value.length > 0 && detailQuery.isPending.value)
  const queueing = computed(() => queueMutation.isLoading.value)
  const loadingMore = computed(() => listQuery.asyncStatus.value === 'loading' && results.value.length > 0)
  const currentPage = computed<number>(() => latestPageParam.value)
  const perPage = computed(() => latestPage.value?.perPage ?? listPerPage.value)
  const totalPages = computed(() => latestPage.value?.totalPages ?? 1)
  const totalItems = computed(() => latestPage.value?.totalItems ?? 0)
  const latestResult = computed(() => results.value[0] ?? null)
  const hasMore = computed(() => listQuery.hasNextPage.value)
  const error = computed(() => {
    if (queueMutation.error.value) { return queueMutation.error.value.message || '加入生成队列失败' }

    if (detailQuery.error.value) { return '读取结果详情失败' }

    if (listQuery.error.value) { return '读取生成结果失败' }

    return null
  })

  const fetchResultsForActivity = async (
    activityId: string,
    options?: {
      page?: number
      perPage?: number
      append?: boolean
    },
  ) => {
    const page = options?.page ?? 1
    const pageSize = options?.perPage ?? listPerPage.value
    const append = options?.append ?? false
    const isSameTarget = listActivityId.value === activityId && listPerPage.value === pageSize

    listActivityId.value = activityId
    listPerPage.value = pageSize

    if (!append || !isSameTarget || page <= 1) {
      await listQuery.refetch()
      return
    }

    if (!listQuery.hasNextPage.value) { return }

    while (currentPage.value < page && listQuery.hasNextPage.value) {
      await listQuery.loadNextPage()
    }
  }

  const fetchResultById = async (id: string) => {
    detailResultId.value = id
    await detailQuery.refetch()
  }

  const queueJob = async (jobId: string) => {
    lastProvider.value = null
    queueMutation.reset()

    try {
      return await queueMutation.mutateAsync(jobId)
    }
    catch (value) {
      console.error(value)
      return null
    }
  }

  const clear = () => {
    listActivityId.value = ''
    listPerPage.value = 20
    detailResultId.value = ''
    lastProvider.value = null
    queueMutation.reset()
  }

  const clearList = () => {
    listActivityId.value = ''
    listPerPage.value = 20
  }

  const clearDetail = () => {
    detailResultId.value = ''
  }

  return {
    results,
    currentResult,
    loading,
    detailLoading,
    queueing,
    loadingMore,
    error,
    lastProvider,
    latestResult,
    currentPage,
    perPage,
    totalPages,
    totalItems,
    hasMore,
    fetchResultsForActivity,
    fetchResultById,
    queueJob,
    clearList,
    clearDetail,
    clear,
  }
})

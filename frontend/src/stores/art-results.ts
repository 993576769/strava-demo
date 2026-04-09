import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { artResultsCollection, pb } from '@/lib/pocketbase'
import { isArtResult, type ArtResult } from '@/types/pocketbase'

type RenderMockJobResponse = {
  job?: unknown
  result?: unknown
  reused?: boolean
  queued?: boolean
  provider?: string
}

export const useArtResultsStore = defineStore('artResults', () => {
  const results = ref<ArtResult[]>([])
  const currentResult = ref<ArtResult | null>(null)
  const loading = ref(false)
  const detailLoading = ref(false)
  const queueing = ref(false)
  const error = ref<string | null>(null)

  const latestResult = computed(() => results.value[0] ?? null)

  const fetchResultsForActivity = async (activityId: string) => {
    loading.value = true
    error.value = null

    try {
      const response = await artResultsCollection().getList(1, 20, {
        filter: `activity = "${activityId}"`,
      })
      results.value = response.items.filter(isArtResult)
    } catch (value) {
      console.error(value)
      results.value = []
      error.value = '读取生成结果失败'
    } finally {
      loading.value = false
    }
  }

  const fetchResultById = async (id: string) => {
    detailLoading.value = true
    error.value = null

    try {
      const record = await artResultsCollection().getOne(id)
      currentResult.value = isArtResult(record) ? record : null
    } catch (value) {
      console.error(value)
      currentResult.value = null
      error.value = '读取结果详情失败'
    } finally {
      detailLoading.value = false
    }
  }

  const lastProvider = ref<string | null>(null)

  const queueJob = async (jobId: string) => {
    queueing.value = true
    error.value = null
    lastProvider.value = null

    try {
      const response = await pb.send<RenderMockJobResponse>(`/api/art/jobs/${jobId}/render`, {
        method: 'POST',
      })
      const result = isArtResult(response.result) ? response.result : null
      if (result) {
        results.value = [result, ...results.value.filter((item) => item.id !== result.id)]
        currentResult.value = result
      }

      lastProvider.value = response.provider ?? null
      return {
        result,
        queued: response.queued !== false,
        reused: !!response.reused,
      }
    } catch (value) {
      console.error(value)
      error.value = value instanceof Error ? value.message : '加入生成队列失败'
      return null
    } finally {
      queueing.value = false
    }
  }

  const clear = () => {
    results.value = []
    currentResult.value = null
    error.value = null
    lastProvider.value = null
  }

  return {
    results,
    currentResult,
    loading,
    detailLoading,
    queueing,
    error,
    lastProvider,
    latestResult,
    fetchResultsForActivity,
    fetchResultById,
    queueJob,
    clear,
  }
})

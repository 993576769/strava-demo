import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { artJobsCollection, pb } from '@/lib/pocketbase'
import type { AspectRatio } from '@/lib/art-presets'
import { isArtJob, type ArtJob } from '@/types/pocketbase'

type CreateArtJobResponse = {
  job?: unknown
  reused?: boolean
}

type UploadRouteBaseResponse = {
  job?: unknown
  routeBaseImageUrl?: string
}

export const useArtJobsStore = defineStore('artJobs', () => {
  const jobs = ref<ArtJob[]>([])
  const creating = ref(false)
  const uploadingRouteBase = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastCreateResult = ref<'created' | 'reused' | null>(null)

  const activeJob = computed(() => {
    return jobs.value.find((job) => job.status === 'pending' || job.status === 'processing') ?? null
  })

  const latestJob = computed(() => jobs.value[0] ?? null)

  const fetchJobsForActivity = async (activityId: string) => {
    loading.value = true
    error.value = null

    try {
      const result = await artJobsCollection().getList(1, 20, {
        filter: `activity = "${activityId}"`,
        sort: '-queued_at',
      })
      jobs.value = result.items.filter(isArtJob)
    } catch (value) {
      console.error(value)
      jobs.value = []
      error.value = '读取生成任务失败'
    } finally {
      loading.value = false
    }
  }

  const createJob = async (params: {
    activityId: string
    templateKey: string
    aspectRatio: AspectRatio
    includeTitle: boolean
  }) => {
    creating.value = true
    error.value = null
    lastCreateResult.value = null

    try {
      const response = await pb.send<CreateArtJobResponse>('/api/art/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          activityId: params.activityId,
          templateKey: params.templateKey,
          renderOptions: {
            aspectRatio: params.aspectRatio,
            includeTitle: params.includeTitle,
            includeStats: true,
          },
        },
      })

      const job = isArtJob(response.job) ? response.job : null
      if (!job) {
        throw new Error('Invalid art job response')
      }

      jobs.value = [job, ...jobs.value.filter((item) => item.id !== job.id)]
      lastCreateResult.value = response.reused ? 'reused' : 'created'
      return job
    } catch (value) {
      console.error(value)
      lastCreateResult.value = null
      error.value = value instanceof Error ? value.message : '创建生成任务失败'
      return null
    } finally {
      creating.value = false
    }
  }

  const uploadRouteBase = async (jobId: string, dataUrl: string, fileName: string) => {
    uploadingRouteBase.value = true
    error.value = null

    try {
      const response = await pb.send<UploadRouteBaseResponse>(`/api/art/jobs/${jobId}/route-base`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          dataUrl,
          fileName,
        },
      })

      const job = isArtJob(response.job) ? response.job : null
      if (job) {
        jobs.value = [job, ...jobs.value.filter(item => item.id !== job.id)]
      }

      return {
        job,
        routeBaseImageUrl: response.routeBaseImageUrl ?? '',
      }
    } catch (value) {
      console.error(value)
      error.value = value instanceof Error ? value.message : '上传轨迹底稿失败'
      return null
    } finally {
      uploadingRouteBase.value = false
    }
  }

  const clear = () => {
    jobs.value = []
    error.value = null
    lastCreateResult.value = null
  }

  return {
    jobs,
    loading,
    creating,
    uploadingRouteBase,
    error,
    latestJob,
    activeJob,
    lastCreateResult,
    fetchJobsForActivity,
    createJob,
    uploadRouteBase,
    clear,
  }
})

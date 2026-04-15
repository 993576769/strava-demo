import type { ArtJob, ArtResult } from '@/types/pocketbase'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { artJobsCollection, pb } from '@/lib/pocketbase'
import { isArtJob, isArtResult } from '@/types/pocketbase'

interface CreateArtJobResponse {
  job?: unknown
  reused?: boolean
}

interface UploadRouteBaseResponse {
  job?: unknown
  routeBaseImageUrl?: string
}

interface CreateJobParams {
  activityId: string
  templateKey: string
  includeTitle: boolean
}

interface UploadRouteBaseParams {
  jobId: string
  dataUrl: string
  fileName: string
}

export type ArtJobWithResult = ArtJob & {
  result?: ArtResult | null
}

const toArtJobWithResult = (value: unknown): ArtJobWithResult | null => {
  if (!isArtJob(value)) {
    return null
  }

  const result = 'result' in value && isArtResult(value.result) ? value.result : null
  return Object.assign(value, { result })
}

const mergeJobList = (jobs: ArtJobWithResult[], job: ArtJobWithResult) => [job, ...jobs.filter(item => item.id !== job.id)]

export const useArtJobsStore = defineStore('artJobs', () => {
  const queryCache = useQueryCache()
  const activityId = ref('')
  const jobLimit = ref(20)
  const lastCreateResult = ref<'created' | 'reused' | null>(null)

  const jobsQuery = useQuery<ArtJobWithResult[], Error>({
    key: () => ['art-jobs', 'activity', activityId.value || '__idle__', jobLimit.value],
    enabled: computed(() => activityId.value.length > 0),
    query: async () => {
      const result = await artJobsCollection().getList(1, jobLimit.value, {
        filter: `activity = "${activityId.value}"`,
        sort: '-queued_at',
      })
      return result.items
        .map(toArtJobWithResult)
        .filter(item => item !== null)
    },
    refetchOnWindowFocus: false,
  })

  const createJobMutation = useMutation<ArtJobWithResult, CreateJobParams, Error>({
    mutation: async (params) => {
      const response = await pb.send<CreateArtJobResponse>('/api/art/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          activityId: params.activityId,
          templateKey: params.templateKey,
          renderOptions: {
            includeTitle: params.includeTitle,
            includeStats: true,
          },
        },
      })

      const job = toArtJobWithResult(response.job)
      if (!job) { throw new Error('Invalid art job response') }

      lastCreateResult.value = response.reused ? 'reused' : 'created'
      return job
    },
    onSuccess: (job, params) => {
      queryCache.setQueryData(['art-jobs', 'activity', params.activityId], (previous) => {
        const next = Array.isArray(previous) ? previous : []
        return mergeJobList(next, job)
      })
    },
  })

  const uploadRouteBaseMutation = useMutation<{ job: ArtJobWithResult | null, routeBaseImageUrl: string }, UploadRouteBaseParams, Error>({
    mutation: async (params) => {
      const response = await pb.send<UploadRouteBaseResponse>(`/api/art/jobs/${params.jobId}/route-base`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          dataUrl: params.dataUrl,
          fileName: params.fileName,
        },
      })

      return {
        job: toArtJobWithResult(response.job),
        routeBaseImageUrl: response.routeBaseImageUrl ?? '',
      }
    },
    onSuccess: ({ job }) => {
      if (!job) { return }
      queryCache.setQueryData(['art-jobs', 'activity', job.activity], (previous) => {
        const next = Array.isArray(previous) ? previous : []
        return mergeJobList(next, job)
      })
    },
  })

  const jobs = computed(() => activityId.value ? (jobsQuery.data.value ?? []) : [])
  const loading = computed(() => activityId.value.length > 0 && jobsQuery.isLoading.value)
  const creating = computed(() => createJobMutation.isLoading.value)
  const uploadingRouteBase = computed(() => uploadRouteBaseMutation.isLoading.value)
  const error = computed(() => {
    if (uploadRouteBaseMutation.error.value) { return uploadRouteBaseMutation.error.value.message || '上传轨迹底稿失败' }

    if (createJobMutation.error.value) { return createJobMutation.error.value.message || '创建生成任务失败' }

    if (jobsQuery.error.value) { return '读取生成任务失败' }

    return null
  })

  const activeJob = computed(() => {
    return jobs.value.find(job => job.status === 'pending' || job.status === 'processing') ?? null
  })

  const latestJob = computed(() => jobs.value[0] ?? null)

  const fetchJobsForActivity = async (nextActivityId: string, options?: { perPage?: number }) => {
    activityId.value = nextActivityId
    jobLimit.value = options?.perPage ?? 20
    await jobsQuery.refetch()
  }

  const createJob = async (params: CreateJobParams) => {
    lastCreateResult.value = null

    try {
      return await createJobMutation.mutateAsync(params)
    }
    catch (value) {
      console.error(value)
      lastCreateResult.value = null
      return null
    }
  }

  const uploadRouteBase = async (jobId: string, dataUrl: string, fileName: string) => {
    try {
      return await uploadRouteBaseMutation.mutateAsync({
        jobId,
        dataUrl,
        fileName,
      })
    }
    catch (value) {
      console.error(value)
      return null
    }
  }

  const clear = () => {
    activityId.value = ''
    jobLimit.value = 20
    lastCreateResult.value = null
    createJobMutation.reset()
    uploadRouteBaseMutation.reset()
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

<script setup lang="ts">
import type { Activity, ArtJob } from '@/types/pocketbase'
import { CheckCircle2, History, RefreshCw, Route, Sparkles } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { formatArtPromptTemplateLabel } from '@/lib/art-prompt-templates'
import { activitiesCollection, artJobsCollection } from '@/lib/pocketbase'
import { cn } from '@/lib/utils'
import { isActivity, isArtJob, isArtResult } from '@/types/pocketbase'

type HistoryJob = ArtJob & {
  activityRecord?: Activity | null
  result?: {
    id: string
    image_data_uri: string
    thumbnail_data_uri?: string
    title_snapshot?: string
  } | null
}

const PAGE_SIZE = 12

const router = useRouter()
const jobs = ref<HistoryJob[]>([])
const page = ref(1)
const totalItems = ref(0)
const totalPages = ref(1)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')

const hasJobs = computed(() => jobs.value.length > 0)
const hasMore = computed(() => page.value < totalPages.value)

const fetchActivitiesByIds = async (activityIds: string[]) => {
  if (!activityIds.length) {
    return new Map<string, Activity>()
  }

  const filter = activityIds
    .map(id => `id = "${id}"`)
    .join(' || ')

  const records = await activitiesCollection().getFullList({
    filter,
  })

  return records
    .filter(isActivity)
    .reduce((map, activity) => {
      map.set(activity.id, activity)
      return map
    }, new Map<string, Activity>())
}

const toHistoryJob = (value: unknown): HistoryJob | null => {
  if (!isArtJob(value)) {
    return null
  }

  const resultRecord = 'result' in value && isArtResult(value.result) ? value.result : null

  return Object.assign(value, {
    activityRecord: null,
    result: resultRecord
      ? {
          id: resultRecord.id,
          image_data_uri: resultRecord.image_data_uri,
          thumbnail_data_uri: resultRecord.thumbnail_data_uri,
          title_snapshot: resultRecord.title_snapshot,
        }
      : null,
  })
}

const formatDateTime = (value: string) => {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatDistance = (meters?: number) => {
  if (!meters) { return '' }
  return `${(meters / 1000).toFixed(1)} km`
}

const getJobTimestamp = (job: { queued_at?: string, started_at?: string, finished_at?: string, created?: string }) => {
  return job.finished_at || job.started_at || job.queued_at || job.created || ''
}

const jobStatusLabel = (status: string) => {
  switch (status) {
    case 'pending':
      return '排队中'
    case 'processing':
      return '生成中'
    case 'succeeded':
      return '已完成'
    case 'failed':
      return '失败'
    case 'canceled':
      return '已取消'
    default:
      return status
  }
}

const jobStatusClass = (status: string) => {
  switch (status) {
    case 'succeeded':
      return cn('bg-emerald-500/12 text-emerald-600')
    case 'failed':
      return cn('bg-red-500/12 text-red-500')
    case 'processing':
      return cn('bg-sky-500/12 text-sky-600')
    case 'canceled':
      return cn('bg-stone-500/12 text-stone-600')
    default:
      return cn('bg-amber-500/12 text-amber-600')
  }
}

const fetchPage = async (targetPage: number, append = false) => {
  if (append) {
    loadingMore.value = true
  } else {
    loading.value = true
  }
  error.value = ''

  try {
    const response = await artJobsCollection().getList(targetPage, PAGE_SIZE, {
      sort: '-queued_at',
    })
    const baseItems = response.items
      .map(toHistoryJob)
      .filter((item): item is HistoryJob => item !== null)
    const activityMap = await fetchActivitiesByIds(
      [...new Set(baseItems.map(item => item.activity).filter((value): value is string => typeof value === 'string' && value.length > 0))],
    )
    const items = baseItems.map(item => ({
      ...item,
      activityRecord: activityMap.get(item.activity) ?? null,
    }))

    jobs.value = append ? jobs.value.concat(items) : items
    page.value = response.page
    totalItems.value = response.totalItems
    totalPages.value = response.totalPages
  } catch (value) {
    console.error(value)
    error.value = append ? '读取更多生成记录失败' : '读取生成记录失败'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const refresh = async () => {
  await fetchPage(1)
}

const loadMore = async () => {
  if (!hasMore.value || loadingMore.value) { return }
  await fetchPage(page.value + 1, true)
}

const openActivity = (activityId: string) => {
  router.push({ name: 'activity-detail', params: { id: activityId } })
}

const openResult = (resultId: string) => {
  router.push({ name: 'art-result-detail', params: { id: resultId } })
}

const openHistoryCard = (job: HistoryJob) => {
  if (job.result?.id) {
    openResult(job.result.id)
    return
  }

  if (job.activityRecord?.id) {
    openActivity(job.activityRecord.id)
  }
}

const isHistoryCardInteractive = (job: HistoryJob) => {
  return Boolean(job.result?.id || job.activityRecord?.id)
}

const historyCardHint = (job: HistoryJob) => {
  if (job.result?.id) {
    return '点击卡片查看成品详情'
  }

  if (job.activityRecord?.id) {
    return '点击卡片查看活动详情'
  }

  return ''
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(180deg,_rgba(79,70,229,0.06),_transparent_24%),var(--bg)]">
    <main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <div class="mb-6 flex justify-end">
        <button class="btn btn-ghost w-full justify-center sm:w-auto sm:justify-start" @click="refresh">
          <RefreshCw class="mr-2 h-4 w-4" />
          刷新记录
        </button>
      </div>

      <div v-if="error" class="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
        {{ error }}
      </div>

      <div v-if="loading" class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
        正在读取生成记录...
      </div>

      <div v-else-if="!hasJobs" class="rounded-[28px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-card)]/70 p-8 text-center">
        <Sparkles class="mx-auto h-8 w-8 text-primary" />
        <p class="mt-4 text-sm text-[var(--color-text-muted)]">
          还没有生成记录，先去某条活动详情页创建任务。
        </p>
      </div>

      <section v-else class="grid gap-5">
        <article
          v-for="job in jobs"
          :key="job.id"
          class="rounded-[30px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-7"
          :class="isHistoryCardInteractive(job) ? 'cursor-pointer transition hover:border-primary/35 hover:shadow-[0_22px_48px_rgba(79,70,229,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40' : ''"
          :role="isHistoryCardInteractive(job) ? 'button' : undefined"
          :tabindex="isHistoryCardInteractive(job) ? 0 : undefined"
          @click="isHistoryCardInteractive(job) ? openHistoryCard(job) : undefined"
          @keydown.enter.prevent="isHistoryCardInteractive(job) ? openHistoryCard(job) : undefined"
          @keydown.space.prevent="isHistoryCardInteractive(job) ? openHistoryCard(job) : undefined"
        >
          <div
            class="flex flex-col gap-6"
            :class="job.result ? 'xl:flex-row xl:items-start xl:justify-between' : ''"
          >
            <div class="min-w-0 flex-1 overflow-hidden">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-xl font-semibold text-[var(--color-text)]">
                  {{ formatArtPromptTemplateLabel(job.style_preset) }}
                </h2>
                <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium" :class="jobStatusClass(job.status)">
                  {{ jobStatusLabel(job.status) }}
                </span>
              </div>

              <p class="mt-3 text-sm text-[var(--color-text-muted)]">
                {{ getJobTimestamp(job) ? formatDateTime(getJobTimestamp(job)) : '暂无时间信息' }}
              </p>

              <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <div class="inline-flex items-center gap-2 text-[var(--color-text)]">
                  <Route class="h-4 w-4 text-primary" />
                  <span class="font-medium">{{ job.activityRecord?.name || '关联活动' }}</span>
                </div>
                <span class="text-[var(--color-text-muted)]">
                  {{
                    [
                      job.activityRecord?.sport_type || '',
                      formatDistance(job.activityRecord?.distance_meters),
                    ].filter(Boolean).join(' · ') || '暂无活动摘要'
                  }}
                </span>
              </div>

              <p v-if="historyCardHint(job)" class="mt-4 text-sm text-[var(--color-text-muted)]">
                {{ historyCardHint(job) }}
              </p>

              <p v-if="job.error_message" class="mt-4 min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-all text-sm text-red-500">
                {{ job.error_message }}
              </p>
            </div>

            <div v-if="job.result" class="w-full xl:w-80">
              <div class="block w-full overflow-hidden rounded-3xl border border-[var(--color-border)]/60 bg-[var(--color-surface-elevated)]/30 text-left">
                <img
                  :src="job.result.thumbnail_data_uri || job.result.image_data_uri"
                  :alt="job.result.title_snapshot || 'Art result preview'"
                  class="h-56 w-full object-cover"
                >
                <div class="flex items-center justify-between border-t border-[var(--color-border)]/60 px-4 py-3 text-sm">
                  <span class="font-medium text-[var(--color-text)]">成品预览</span>
                  <CheckCircle2 class="h-4 w-4 text-emerald-600" />
                </div>
              </div>
            </div>
          </div>
        </article>

        <div class="flex flex-col items-center gap-3 py-2 text-center">
          <p class="text-sm text-[var(--color-text-muted)]">
            已加载 {{ jobs.length }} / {{ totalItems }} 条生成记录
          </p>
          <button class="btn btn-ghost" :disabled="loadingMore || !hasMore" @click="loadMore">
            <History class="mr-2 h-4 w-4" />
            {{ loadingMore ? '正在加载更多记录...' : (hasMore ? '加载更多记录' : '没有更多记录了') }}
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

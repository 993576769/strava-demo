<script setup lang="ts">
import type { AspectRatio } from '@/lib/art-presets'
import { ArrowLeft, Loader2, MapPinned, Palette, Sparkles, WandSparkles } from 'lucide-vue-next'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ActivityRouteMap from '@/components/ActivityRouteMap.vue'
import ArtJobCard from '@/components/ArtJobCard.vue'
import { aspectRatioDefinitions } from '@/lib/art-presets'
import { cn } from '@/lib/utils'
import { useActivitiesStore } from '@/stores/activities'
import { useActivityStreamsStore } from '@/stores/activity-streams'
import { useArtJobsStore } from '@/stores/art-jobs'
import { useArtPromptTemplatesStore } from '@/stores/art-prompt-templates'
import { useArtResultsStore } from '@/stores/art-results'
import { useAuthStore } from '@/stores/auth'

interface ActivityRouteMapExpose {
  exportPngDataUrl: () => Promise<string | null>
}

const route = useRoute()
const router = useRouter()
const activitiesStore = useActivitiesStore()
const activityStreamsStore = useActivityStreamsStore()
const artJobsStore = useArtJobsStore()
const artPromptTemplatesStore = useArtPromptTemplatesStore()
const artResultsStore = useArtResultsStore()
const authStore = useAuthStore()
const routeMapRef = ref<ActivityRouteMapExpose | null>(null)

const activityId = computed(() => String(route.params.id ?? ''))
const activity = computed(() => activitiesStore.currentActivity)
const selectedTemplateKey = ref('')
const selectedAspectRatio = ref<AspectRatio>('portrait')
const includeTitle = ref(true)
const createFeedback = ref('')
let queuePollingTimer: number | null = null

const parseJsonObject = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === 'object' && !Array.isArray(value)) { return value as Record<string, unknown> }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null
    }
    catch {
      return null
    }
  }

  return null
}

const getSummaryPolyline = (source: unknown) => {
  const raw = parseJsonObject(source)
  const map = raw && 'map' in raw ? parseJsonObject(raw.map) : null
  const encoded = map && 'summary_polyline' in map ? map.summary_polyline : ''

  if (typeof encoded !== 'string' || encoded.length === 0) { return null }

  return encoded
}

const formatDistance = (meters: number) => `${(meters / 1000).toFixed(1)} km`

const routeSubtitle = computed(() => {
  if (!activity.value) { return '' }

  const parts = []
  if (activity.value.distance_meters) { parts.push(formatDistance(activity.value.distance_meters)) }
  if (activity.value.start_date) { parts.push(new Date(activity.value.start_date).toLocaleDateString('zh-CN')) }

  return parts.join(' · ')
})
const encodedPolyline = computed(() => {
  return getSummaryPolyline(activity.value?.raw_summary_json)
    ?? getSummaryPolyline(activity.value?.raw_detail_json)
    ?? ''
})
const routePoints = computed(() => {
  return activityStreamsStore.currentStream?.normalized_path_json
    ?? activityStreamsStore.currentStream?.latlng_stream_json
    ?? null
})

const getResultRendererLabel = (result: unknown) => {
  if (!result || typeof result !== 'object') { return '成品' }

  const metadata = 'metadata_json' in result ? result.metadata_json : undefined
  if (!metadata || typeof metadata !== 'object') { return '成品' }

  const provider = 'provider' in metadata ? metadata.provider : undefined
  if (provider === 'doubao-seedream') { return 'Doubao Seedream 5.0 成品' }

  const renderer = 'renderer' in metadata ? metadata.renderer : undefined
  if (renderer === 'mock-svg-v1') { return 'Mock 成品' }

  return '成品'
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

const activityGeneratableClass = (isGeneratable: boolean) => cn(
  isGeneratable ? 'bg-emerald-500/12 text-emerald-600' : 'bg-amber-500/12 text-amber-600',
)

const selectableCardClass = (selected: boolean, selectedClass: string) => cn(
  selected
    ? selectedClass
    : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)]/55',
)

const hasRouteBaseImageUrl = (job: unknown) => {
  if (!job || typeof job !== 'object') { return false }

  return 'route_base_image_url' in job
    && typeof job.route_base_image_url === 'string'
    && job.route_base_image_url.length > 0
}

const loadPage = async () => {
  if (activityId.value) {
    await Promise.all([
      activitiesStore.fetchActivityById(activityId.value),
      activityStreamsStore.fetchStreamForActivity(activityId.value),
      artJobsStore.fetchJobsForActivity(activityId.value, {
        perPage: 3,
      }),
      artPromptTemplatesStore.fetchTemplates(),
    ])
  }
}

const stopQueuePolling = () => {
  if (queuePollingTimer) {
    window.clearInterval(queuePollingTimer)
    queuePollingTimer = null
  }
}

const refreshQueueState = async () => {
  if (!activityId.value) { return }

  await Promise.all([
    artJobsStore.fetchJobsForActivity(activityId.value, {
      perPage: 3,
    }),
  ])
}

const ensureQueuePolling = () => {
  if (queuePollingTimer || !activityId.value) { return }

  queuePollingTimer = window.setInterval(() => {
    void refreshQueueState()
  }, 3000)
}

const createArtJob = async () => {
  if (!activity.value) { return }

  createFeedback.value = ''

  const job = await artJobsStore.createJob({
    activityId: activity.value.id,
    templateKey: selectedTemplateKey.value || artPromptTemplatesStore.defaultTemplateKey,
    aspectRatio: selectedAspectRatio.value,
    includeTitle: includeTitle.value,
  })

  if (!job) {
    return
  }

  const routeBaseDataUrl = await routeMapRef.value?.exportPngDataUrl()
  if (!routeBaseDataUrl && !hasRouteBaseImageUrl(job)) {
    createFeedback.value = '轨迹底稿还没准备好，请等待地图预览加载完成后再试。'
    await refreshQueueState()
    return
  }

  if (routeBaseDataUrl && !hasRouteBaseImageUrl(job)) {
    const uploadResult = await artJobsStore.uploadRouteBase(
      job.id,
      routeBaseDataUrl,
      `${activity.value.sport_type || 'activity'}-${activity.value.id}-route-base`,
    )

    if (!uploadResult?.routeBaseImageUrl) {
      createFeedback.value = artJobsStore.error || '轨迹底稿上传失败，请稍后重试。'
      await refreshQueueState()
      return
    }
  }

  const queued = await artResultsStore.queueJob(job.id)
  await refreshQueueState()

  if (artJobsStore.activeJob) {
    ensureQueuePolling()
  }

  createFeedback.value = queued?.result
    ? (artJobsStore.lastCreateResult === 'reused'
        ? `已复用并完成一个现有任务，${getResultRendererLabel(queued.result)}已生成。`
        : `任务已创建并完成${getResultRendererLabel(queued.result)}生成。`)
    : (artJobsStore.lastCreateResult === 'reused'
        ? '已复用现有任务，并加入后台生成队列。'
        : '任务已创建并加入后台生成队列。')
}

const openResult = (id: string) => {
  router.push({ name: 'art-result-detail', params: { id } })
}

const openAllResults = () => {
  router.push({ name: 'activity-results', params: { id: activityId.value } })
}

const hasJobResults = computed(() => artJobsStore.jobs.some(job => !!job.result))

watch(activityId, () => {
  void loadPage()
}, { immediate: true })

watch(() => artPromptTemplatesStore.defaultTemplateKey, (defaultTemplateKey) => {
  if (!selectedTemplateKey.value && defaultTemplateKey) {
    selectedTemplateKey.value = defaultTemplateKey
  }
}, { immediate: true })

watch(() => artJobsStore.activeJob?.id, (activeJobId) => {
  if (activeJobId) {
    ensureQueuePolling()
    return
  }

  stopQueuePolling()
})

onUnmounted(() => {
  stopQueuePolling()
  activitiesStore.clearCurrentActivity()
  activityStreamsStore.clear()
  artJobsStore.clear()
  artPromptTemplatesStore.clear()
  artResultsStore.clear()
})
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(180deg,_rgba(79,70,229,0.06),_transparent_24%),var(--bg)]">
    <main class="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div class="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button class="btn btn-ghost w-full justify-center sm:w-auto sm:justify-start" @click="router.push({ name: 'activities' })">
          <ArrowLeft class="mr-2 h-4 w-4" />
          返回活动列表
        </button>
      </div>

      <section v-if="activitiesStore.detailLoading" class="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-6 text-sm text-[var(--color-text-muted)]">
        正在读取活动详情...
      </section>

      <section v-else-if="!activity" class="rounded-[28px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-card)]/80 p-8 text-center">
        <h1 class="text-xl font-semibold text-[var(--color-text)]">
          未找到活动详情
        </h1>
        <p class="mt-3 text-[var(--color-text-muted)]">
          可能是活动尚未同步到本地，或者记录不存在。
        </p>
      </section>

      <section v-else class="grid gap-6">
        <article class="rounded-4xl border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-8">
          <div class="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <h1 class="w-full min-w-0 text-2xl leading-tight font-semibold break-words text-[var(--color-text)] sm:w-auto sm:text-3xl">
              {{ activity.name }}
            </h1>
            <span class="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {{ activity.sport_type || 'unknown' }}
            </span>
            <span
              class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
              :class="activityGeneratableClass(activity.is_generatable)"
            >
              {{ activity.is_generatable ? '可生成' : '暂不可生成' }}
            </span>
          </div>

          <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/70 p-4">
              <p class="text-xs tracking-[0.2em] text-[var(--color-text-muted)] uppercase">
                开始时间
              </p>
              <p class="mt-2 text-sm font-medium text-[var(--color-text)]">
                {{ activity.start_date ? formatDateTime(activity.start_date) : '暂无' }}
              </p>
            </div>

            <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/70 p-4">
              <p class="text-xs tracking-[0.2em] text-[var(--color-text-muted)] uppercase">
                距离
              </p>
              <p class="mt-2 text-sm font-medium text-[var(--color-text)]">
                {{ activity.distance_meters ? formatDistance(activity.distance_meters) : '暂无' }}
              </p>
            </div>

            <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/70 p-4">
              <p class="text-xs tracking-[0.2em] text-[var(--color-text-muted)] uppercase">
                移动时间
              </p>
              <p class="mt-2 text-sm font-medium text-[var(--color-text)]">
                {{ activity.moving_time_seconds ? `${Math.round(activity.moving_time_seconds / 60)} 分钟` : '暂无' }}
              </p>
            </div>

            <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/70 p-4">
              <p class="text-xs tracking-[0.2em] text-[var(--color-text-muted)] uppercase">
                同步状态
              </p>
              <p class="mt-2 text-sm font-medium text-[var(--color-text)]">
                {{ activity.sync_status }}
              </p>
            </div>
          </div>

          <div class="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-5">
            <div class="flex items-start gap-3">
              <MapPinned class="mt-1 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h2 class="text-base font-semibold text-[var(--color-text)]">
                  轨迹可用性
                </h2>
                <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                  {{
                    activity.is_generatable
                      ? '当前活动已通过基础可生成校验。现在已经可以创建 `art_jobs` 任务，并走真实渲染入口。'
                      : (activity.generatable_reason || '当前活动暂时不可生成，后续会补充更明确的判定说明。')
                  }}
                </p>
              </div>
            </div>
          </div>
        </article>

        <ActivityRouteMap
          ref="routeMapRef"
          :encoded-polyline="encodedPolyline"
          :points="routePoints"
          :title="activity?.name || 'Untitled Activity'"
          :subtitle="routeSubtitle"
          :filename="`${activity?.sport_type || 'activity'}-${activity?.id || 'route'}`"
        />

        <article class="rounded-4xl border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div class="flex items-start gap-3">
            <Palette class="mt-1 h-5 w-5 shrink-0 text-primary" />
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-semibold text-[var(--color-text)]">
                生成设置
              </h2>
              <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                现在会优先走真实渲染入口；如果本地还没有配置 Doubao Seedream 5.0 的必要参数，则会自动回退到 mock 渲染器。
              </p>

              <div v-if="artPromptTemplatesStore.loading" class="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/50 px-4 py-4 text-sm text-[var(--color-text-muted)]">
                正在读取模板选项...
              </div>

              <div v-else-if="artPromptTemplatesStore.error" class="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {{ artPromptTemplatesStore.error }}
              </div>

              <div v-else-if="artPromptTemplatesStore.options.length === 0" class="mt-5 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-elevated)]/35 px-4 py-5 text-sm text-[var(--color-text-muted)]">
                当前还没有可用生成模板，先在 `art_prompt_templates` 里 seed 一条已激活模板后再生成。
              </div>

              <div v-if="artPromptTemplatesStore.options.length > 0" class="mt-5 grid gap-3 md:grid-cols-3">
                <button
                  v-for="template in artPromptTemplatesStore.options"
                  :key="template.id"
                  type="button"
                  class="min-w-0 rounded-2xl border p-4 text-left transition"
                  :class="selectableCardClass(selectedTemplateKey === template.id, 'border-primary bg-primary/8 shadow-[0_12px_30px_rgba(79,70,229,0.12)]')"
                  @click="selectedTemplateKey = template.id"
                >
                  <div class="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span class="min-w-0 text-sm font-semibold break-words text-[var(--color-text)]">{{ template.label }}</span>
                    <span class="max-w-full rounded-full px-2.5 py-1 text-xs font-medium break-all sm:self-start" :class="cn(template.accentClass)">
                      {{ template.id }}
                    </span>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
                    {{ template.description }}
                  </p>
                </button>
              </div>

              <div class="mt-5 grid gap-3 sm:grid-cols-3">
                <button
                  v-for="ratio in aspectRatioDefinitions"
                  :key="ratio.id"
                  type="button"
                  class="rounded-2xl border p-4 text-left transition"
                  :class="selectableCardClass(selectedAspectRatio === ratio.id, 'border-primary bg-primary/8')"
                  @click="selectedAspectRatio = ratio.id"
                >
                  <p class="text-sm font-semibold text-[var(--color-text)]">
                    {{ ratio.label }}
                  </p>
                  <p class="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                    {{ ratio.description }}
                  </p>
                </button>
              </div>

              <label class="mt-5 inline-flex items-center gap-3 text-sm text-[var(--color-text)]">
                <input v-model="includeTitle" type="checkbox" class="h-4 w-4 rounded border-[var(--color-border)]">
                在首版输出中保留活动标题
              </label>

              <div v-if="createFeedback" class="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
                {{ createFeedback }}
              </div>

              <div v-if="authStore.isLoggedIn && !authStore.isActive" class="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
                当前账号尚未激活，暂时不能提交生成任务。请先由管理员手动激活账号。
              </div>

              <div v-if="artJobsStore.error" class="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {{ artJobsStore.error }}
              </div>

              <div v-if="artResultsStore.error" class="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {{ artResultsStore.error }}
              </div>

              <div class="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  class="btn btn-primary w-full justify-center sm:w-auto"
                  :disabled="!activity.is_generatable || !authStore.isActive || !selectedTemplateKey || artJobsStore.creating || artJobsStore.uploadingRouteBase || artResultsStore.queueing"
                  @click="createArtJob"
                >
                  <Loader2 v-if="artJobsStore.creating || artJobsStore.uploadingRouteBase || artResultsStore.queueing" class="mr-2 h-4 w-4 animate-spin" />
                  <WandSparkles v-else class="mr-2 h-4 w-4" />
                  {{
                    artJobsStore.creating
                      ? '正在创建任务...'
                      : artJobsStore.uploadingRouteBase
                        ? '正在上传轨迹底稿...'
                        : artResultsStore.queueing
                          ? '正在加入队列...'
                          : '生成成品'
                  }}
                </button>
                <p class="text-sm leading-6 text-[var(--color-text-muted)]">
                  {{ activity.is_generatable ? '这一步会先创建任务、上传轨迹底稿，再由后台 worker 异步消费队列并产出成品。' : '当前活动不可生成，按钮已禁用。' }}
                </p>
              </div>
            </div>
          </div>
        </article>

        <article class="rounded-4xl border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div class="flex items-start gap-3">
            <Sparkles class="mt-1 h-5 w-5 shrink-0 text-primary" />
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-semibold text-[var(--color-text)]">
                生成任务
              </h2>
              <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                当前活动下的任务会记录生成状态；如果任务已经完成，这里会直接显示对应的生成图片。
              </p>

              <div v-if="artJobsStore.loading" class="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/50 px-4 py-4 text-sm text-[var(--color-text-muted)]">
                正在读取历史任务...
              </div>

              <div v-else-if="artJobsStore.jobs.length === 0" class="mt-5 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-elevated)]/35 px-4 py-5 text-sm text-[var(--color-text-muted)]">
                还没有生成任务。你可以先选一个模板，然后把这条活动落成第一条 `art_jobs` 记录。
              </div>

              <div v-else class="mt-5 grid gap-3">
                <ArtJobCard
                  v-for="job in artJobsStore.jobs"
                  :key="job.id"
                  :job="job"
                  :is-active="artJobsStore.activeJob?.id === job.id"
                  @open-result="openResult"
                />
              </div>

              <div v-if="hasJobResults" class="mt-5 flex justify-start">
                <button type="button" class="btn btn-ghost w-full justify-center sm:w-auto" @click="openAllResults">
                  查看更多结果
                </button>
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  </div>
</template>

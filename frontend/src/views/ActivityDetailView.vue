<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, MapPinned, Palette, Sparkles, WandSparkles } from 'lucide-vue-next'
import { artPresetDefinitions, aspectRatioDefinitions, type AspectRatio, type StylePreset } from '@/lib/art-presets'
import { useActivitiesStore } from '@/stores/activities'
import { useArtJobsStore } from '@/stores/art-jobs'
import { useArtResultsStore } from '@/stores/art-results'

const route = useRoute()
const router = useRouter()
const activitiesStore = useActivitiesStore()
const artJobsStore = useArtJobsStore()
const artResultsStore = useArtResultsStore()

const activityId = computed(() => String(route.params.id ?? ''))
const activity = computed(() => activitiesStore.currentActivity)
const selectedPreset = ref<StylePreset>('sketch')
const selectedAspectRatio = ref<AspectRatio>('portrait')
const includeTitle = ref(true)
const createFeedback = ref('')

const getResultRendererLabel = (result: unknown) => {
  if (!result || typeof result !== 'object') return '成品'

  const metadata = 'metadata_json' in result ? result.metadata_json : undefined
  if (!metadata || typeof metadata !== 'object') return '成品'

  const provider = 'provider' in metadata ? metadata.provider : undefined
  if (provider === 'jimeng46') return '即梦 4.6 成品'

  const renderer = 'renderer' in metadata ? metadata.renderer : undefined
  if (renderer === 'mock-svg-v1') return 'Mock 成品'

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

const formatDistance = (meters: number) => `${(meters / 1000).toFixed(1)} km`

const getAspectRatioLabel = (value: unknown) => {
  if (!value || typeof value !== 'object') return 'portrait'

  const ratio = 'aspectRatio' in value ? value.aspectRatio : undefined
  return typeof ratio === 'string' && ratio.length > 0 ? ratio : 'portrait'
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

const loadPage = async () => {
  if (activityId.value) {
    await Promise.all([
      activitiesStore.fetchActivityById(activityId.value),
      artJobsStore.fetchJobsForActivity(activityId.value),
      artResultsStore.fetchResultsForActivity(activityId.value),
    ])
  }
}

const createArtJob = async () => {
  if (!activity.value) return

  createFeedback.value = ''

  const job = await artJobsStore.createJob({
    activityId: activity.value.id,
    stylePreset: selectedPreset.value,
    aspectRatio: selectedAspectRatio.value,
    includeTitle: includeTitle.value,
  })

  if (!job) {
    return
  }

  const result = await artResultsStore.renderJob(job.id)
  await Promise.all([
    artJobsStore.fetchJobsForActivity(activity.value.id),
    artResultsStore.fetchResultsForActivity(activity.value.id),
  ])

  createFeedback.value = result
    ? (artJobsStore.lastCreateResult === 'reused'
        ? `已复用并完成一个现有任务，${getResultRendererLabel(result)}已生成。`
        : `任务已创建并完成${getResultRendererLabel(result)}生成。`)
    : '任务已创建，但图片生成失败。'
}

const openResult = (id: string) => {
  router.push({ name: 'art-result-detail', params: { id } })
}

watch(activityId, () => {
  void loadPage()
}, { immediate: true })

onUnmounted(() => {
  activitiesStore.clearCurrentActivity()
  artJobsStore.clear()
  artResultsStore.clear()
})
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(180deg,_rgba(79,70,229,0.06),_transparent_24%),var(--bg)]">
    <main class="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div class="flex justify-between items-center gap-4 mb-6">
        <button class="btn btn-ghost" @click="router.push({ name: 'activities' })">
          <ArrowLeft class="w-4 h-4 mr-2" />
          返回活动列表
        </button>
      </div>

      <section v-if="activitiesStore.detailLoading" class="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-6 text-sm text-[var(--color-text-muted)]">
        正在读取活动详情...
      </section>

      <section v-else-if="!activity" class="rounded-[28px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-card)]/80 p-8 text-center">
        <h1 class="text-xl font-semibold text-[var(--color-text)]">未找到活动详情</h1>
        <p class="mt-3 text-[var(--color-text-muted)]">可能是活动尚未同步到本地，或者记录不存在。</p>
      </section>

      <section v-else class="grid gap-6">
        <article class="rounded-[32px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 sm:p-8 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl sm:text-3xl font-semibold text-[var(--color-text)]">{{ activity.name }}</h1>
            <span class="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {{ activity.sport_type || 'unknown' }}
            </span>
            <span
              class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
              :class="activity.is_generatable ? 'bg-emerald-500/12 text-emerald-600' : 'bg-amber-500/12 text-amber-600'"
            >
              {{ activity.is_generatable ? '可生成' : '暂不可生成' }}
            </span>
          </div>

          <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-2xl bg-[var(--color-surface-elevated)]/70 border border-[var(--color-border)] p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">开始时间</p>
              <p class="mt-2 text-sm font-medium text-[var(--color-text)]">
                {{ activity.start_date ? formatDateTime(activity.start_date) : '暂无' }}
              </p>
            </div>

            <div class="rounded-2xl bg-[var(--color-surface-elevated)]/70 border border-[var(--color-border)] p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">距离</p>
              <p class="mt-2 text-sm font-medium text-[var(--color-text)]">
                {{ activity.distance_meters ? formatDistance(activity.distance_meters) : '暂无' }}
              </p>
            </div>

            <div class="rounded-2xl bg-[var(--color-surface-elevated)]/70 border border-[var(--color-border)] p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">移动时间</p>
              <p class="mt-2 text-sm font-medium text-[var(--color-text)]">
                {{ activity.moving_time_seconds ? `${Math.round(activity.moving_time_seconds / 60)} 分钟` : '暂无' }}
              </p>
            </div>

            <div class="rounded-2xl bg-[var(--color-surface-elevated)]/70 border border-[var(--color-border)] p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">同步状态</p>
              <p class="mt-2 text-sm font-medium text-[var(--color-text)]">{{ activity.sync_status }}</p>
            </div>
          </div>

          <div class="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-5">
            <div class="flex items-start gap-3">
              <MapPinned class="w-5 h-5 mt-1 text-primary shrink-0" />
              <div>
                <h2 class="text-base font-semibold text-[var(--color-text)]">轨迹可用性</h2>
                <p class="mt-2 text-sm text-[var(--color-text-muted)] leading-7">
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

        <article class="rounded-[32px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div class="flex items-start gap-3">
            <Palette class="w-5 h-5 mt-1 text-primary shrink-0" />
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-semibold text-[var(--color-text)]">生成设置</h2>
              <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                现在会优先走真实渲染入口；如果本地还没有配置即梦 4.6 的必要参数，则会自动回退到 mock 渲染器。
              </p>

              <div class="mt-5 grid gap-3 md:grid-cols-3">
                <button
                  v-for="preset in artPresetDefinitions"
                  :key="preset.id"
                  type="button"
                  class="rounded-2xl border p-4 text-left transition"
                  :class="selectedPreset === preset.id
                    ? 'border-primary bg-primary/8 shadow-[0_12px_30px_rgba(79,70,229,0.12)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)]/55'"
                  @click="selectedPreset = preset.id"
                >
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-sm font-semibold text-[var(--color-text)]">{{ preset.label }}</span>
                    <span class="rounded-full px-2.5 py-1 text-xs font-medium" :class="preset.accentClass">
                      {{ preset.id }}
                    </span>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">{{ preset.description }}</p>
                </button>
              </div>

              <div class="mt-5 grid gap-3 sm:grid-cols-3">
                <button
                  v-for="ratio in aspectRatioDefinitions"
                  :key="ratio.id"
                  type="button"
                  class="rounded-2xl border p-4 text-left transition"
                  :class="selectedAspectRatio === ratio.id
                    ? 'border-primary bg-primary/8'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)]/55'"
                  @click="selectedAspectRatio = ratio.id"
                >
                  <p class="text-sm font-semibold text-[var(--color-text)]">{{ ratio.label }}</p>
                  <p class="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{{ ratio.description }}</p>
                </button>
              </div>

              <label class="mt-5 inline-flex items-center gap-3 text-sm text-[var(--color-text)]">
                <input v-model="includeTitle" type="checkbox" class="h-4 w-4 rounded border-[var(--color-border)]" />
                在首版输出中保留活动标题
              </label>

              <div v-if="createFeedback" class="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
                {{ createFeedback }}
              </div>

              <div v-if="artJobsStore.error" class="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {{ artJobsStore.error }}
              </div>

              <div v-if="artResultsStore.error" class="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {{ artResultsStore.error }}
              </div>

              <div class="mt-5 flex flex-wrap items-center gap-3">
                <button
                  class="btn btn-primary"
                  :disabled="!activity.is_generatable || artJobsStore.creating || artResultsStore.rendering"
                  @click="createArtJob"
                >
                  <Loader2 v-if="artJobsStore.creating || artResultsStore.rendering" class="w-4 h-4 mr-2 animate-spin" />
                  <WandSparkles v-else class="w-4 h-4 mr-2" />
                  {{ artJobsStore.creating || artResultsStore.rendering ? '正在生成图片...' : '生成成品' }}
                </button>
                <p class="text-sm text-[var(--color-text-muted)]">
                  {{ activity.is_generatable ? '这一步会先创建任务，再由当前渲染 provider 产出成品。' : '当前活动不可生成，按钮已禁用。' }}
                </p>
              </div>
            </div>
          </div>
        </article>

        <article class="rounded-[32px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div class="flex items-start gap-3">
            <Sparkles class="w-5 h-5 mt-1 text-primary shrink-0" />
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-semibold text-[var(--color-text)]">生成任务</h2>
              <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                当前活动下的任务会先记录在 `art_jobs`，后续生成完成后再关联到结果页。
              </p>

              <div v-if="artJobsStore.loading" class="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/50 px-4 py-4 text-sm text-[var(--color-text-muted)]">
                正在读取历史任务...
              </div>

              <div v-else-if="artJobsStore.jobs.length === 0" class="mt-5 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-elevated)]/35 px-4 py-5 text-sm text-[var(--color-text-muted)]">
                还没有生成任务。你可以先选一个模板，然后把这条活动落成第一条 `art_jobs` 记录。
              </div>

              <div v-else class="mt-5 grid gap-3">
                <div
                  v-for="job in artJobsStore.jobs"
                  :key="job.id"
                  class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-4"
                >
                  <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="text-sm font-semibold text-[var(--color-text)]">{{ job.style_preset }}</span>
                        <span
                          class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                          :class="job.status === 'succeeded'
                            ? 'bg-emerald-500/12 text-emerald-600'
                            : job.status === 'failed'
                              ? 'bg-red-500/12 text-red-500'
                              : 'bg-primary/10 text-primary'"
                        >
                          {{ jobStatusLabel(job.status) }}
                        </span>
                        <span v-if="artJobsStore.activeJob?.id === job.id" class="inline-flex items-center rounded-full bg-amber-500/12 px-2.5 py-1 text-xs font-medium text-amber-600">
                          当前活动中的任务
                        </span>
                      </div>
                      <p class="mt-2 text-sm text-[var(--color-text-muted)]">
                        创建时间：{{ formatDateTime(job.created) }}
                      </p>
                      <p v-if="job.error_message" class="mt-2 text-sm text-red-500">
                        {{ job.error_message }}
                      </p>
                    </div>

                    <div class="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                      <CheckCircle2 class="w-4 h-4" />
                      {{ getAspectRatioLabel(job.render_options_json) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article class="rounded-[32px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div class="flex items-start gap-3">
            <Sparkles class="w-5 h-5 mt-1 text-primary shrink-0" />
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-semibold text-[var(--color-text)]">生成结果</h2>
              <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                这里会展示当前 provider 产出的结果图。未配置即梦 4.6 时，会自动显示 mock 回退结果。
              </p>

              <div v-if="artResultsStore.loading" class="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/50 px-4 py-4 text-sm text-[var(--color-text-muted)]">
                正在读取结果列表...
              </div>

              <div v-else-if="artResultsStore.results.length === 0" class="mt-5 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-elevated)]/35 px-4 py-5 text-sm text-[var(--color-text-muted)]">
                还没有成品结果。创建一个任务后，这里会出现结果预览和详情入口。
              </div>

              <div v-else class="mt-5 grid gap-4 md:grid-cols-2">
                <button
                  v-for="result in artResultsStore.results"
                  :key="result.id"
                  type="button"
                  class="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-4 text-left transition hover:border-primary/40"
                  @click="openResult(result.id)"
                >
                  <img
                    :src="result.thumbnail_data_uri || result.image_data_uri"
                    :alt="result.title_snapshot || 'Art result thumbnail'"
                    class="h-52 w-full rounded-[18px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] object-cover"
                  />

                  <div class="mt-4 flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-[var(--color-text)] truncate">
                        {{ result.title_snapshot || 'Untitled result' }}
                      </p>
                      <p class="mt-2 text-sm text-[var(--color-text-muted)] line-clamp-2">
                        {{ result.subtitle_snapshot || '暂无副标题' }}
                      </p>
                    </div>
                    <span class="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {{ result.style_preset }}
                    </span>
                  </div>

                  <div class="mt-4 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                    查看详情
                    <ExternalLink class="w-4 h-4" />
                  </div>
                </button>
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  </div>
</template>

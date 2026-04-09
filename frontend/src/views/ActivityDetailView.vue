<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, MapPinned, Sparkles } from 'lucide-vue-next'
import { useActivitiesStore } from '@/stores/activities'

const route = useRoute()
const router = useRouter()
const activitiesStore = useActivitiesStore()

const activityId = computed(() => String(route.params.id ?? ''))
const activity = computed(() => activitiesStore.currentActivity)

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

onMounted(async () => {
  if (activityId.value) {
    await activitiesStore.fetchActivityById(activityId.value)
  }
})

onUnmounted(() => {
  activitiesStore.clearCurrentActivity()
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
                      ? '当前活动已通过基础可生成校验。下一阶段会把这里接到真实的生成任务创建入口。'
                      : (activity.generatable_reason || '当前活动暂时不可生成，后续会补充更明确的判定说明。')
                  }}
                </p>
              </div>
            </div>
          </div>
        </article>

        <article class="rounded-[32px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div class="flex items-start gap-3">
            <Sparkles class="w-5 h-5 mt-1 text-primary shrink-0" />
            <div>
              <h2 class="text-base font-semibold text-[var(--color-text)]">下一步</h2>
              <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                阶段 3 会在这个页面加入风格模板、画布比例和生成按钮，把当前活动落成 `art_jobs` 任务。
              </p>
            </div>
          </div>
        </article>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { Antenna, CheckCircle2, ChevronDown, Download, Link2, RefreshCw, Route, TriangleAlert, Unplug } from 'lucide-vue-next'
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppDropdown from '@/components/AppDropdown.vue'
import { cn } from '@/lib/utils'
import { useActivitiesStore } from '@/stores/activities'
import { useStravaStore } from '@/stores/strava'

const route = useRoute()
const router = useRouter()
const activitiesStore = useActivitiesStore()
const stravaStore = useStravaStore()

const hasActivities = computed(() => activitiesStore.activities.length > 0)
const stravaQueryStatus = computed(() => {
  const value = route.query.strava
  return typeof value === 'string' ? value : ''
})
const stravaNotice = computed(() => {
  switch (stravaQueryStatus.value) {
    case 'connected':
      return {
        tone: 'success' as const,
        title: 'Strava 已完成授权',
        description: '账户连接已保存。页面会继续尝试把你的 Strava 活动同步到本地。',
      }
    case 'denied':
      return {
        tone: 'warning' as const,
        title: '你取消了 Strava 授权',
        description: '如果后面想继续同步运动记录，可以重新点击“连接 Strava”发起授权。',
      }
    case 'invalid_callback':
      return {
        tone: 'warning' as const,
        title: '授权回调参数不完整',
        description: '这通常意味着授权流程被中断，重新发起一次连接会更稳妥。',
      }
    case 'callback_error':
      return {
        tone: 'warning' as const,
        title: 'Strava 授权回调失败',
        description: '请检查 API 服务环境变量、Strava 应用回调地址和服务端日志。',
      }
    default:
      return null
  }
})

const formatDateTime = (value: string) => {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatDistance = (meters: number) => {
  return `${(meters / 1000).toFixed(1)} km`
}

const stravaNoticeClass = (tone: 'success' | 'warning') => cn(
  tone === 'success'
    ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-700'
    : 'border border-amber-500/20 bg-amber-500/10 text-amber-700',
)

const activityGeneratableClass = (isGeneratable: boolean) => cn(
  isGeneratable ? 'bg-emerald-500/12 text-emerald-600' : 'bg-amber-500/12 text-amber-600',
)

const openActivity = (id: string) => {
  router.push({ name: 'activity-detail', params: { id } })
}

const openWebhookStatus = () => {
  router.push({ name: 'webhook-status' })
}

const refreshPage = async () => {
  await Promise.all([
    stravaStore.fetchConnection(),
    activitiesStore.fetchActivities(),
  ])
}

const syncActivities = async () => {
  await stravaStore.runSync('incremental')
  await Promise.all([
    activitiesStore.fetchActivities(),
  ])
}

const backfillHistory = async () => {
  await stravaStore.runSync('history')
  await Promise.all([
    activitiesStore.fetchActivities(),
  ])
}

const disconnectStrava = async () => {
  const disconnected = await stravaStore.disconnect()
  if (disconnected) {
    await activitiesStore.fetchActivities()
  }
}

onMounted(async () => {
  await refreshPage()
  if (stravaQueryStatus.value === 'connected') {
    await syncActivities()
  }
})
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(180deg,_rgba(79,70,229,0.06),_transparent_24%),var(--bg)]">
    <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <section class="flex flex-col gap-6">
        <div class="flex items-center justify-between gap-3">
          <div class="inline-flex items-center gap-2 rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] px-4 py-2.5 text-sm shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
            <span class="text-[var(--color-text-muted)]">活动</span>
            <span class="font-medium text-[var(--color-text)]">{{ activitiesStore.loadedCount }} / {{ activitiesStore.totalItems }}</span>
          </div>

          <div class="flex flex-wrap justify-end gap-3">
            <button v-if="stravaStore.canConnect" class="btn btn-primary" :disabled="stravaStore.connecting" @click="stravaStore.startConnection">
              <Link2 class="mr-2 h-4 w-4" />
              {{ stravaStore.connecting ? '正在跳转到 Strava...' : '连接 Strava' }}
            </button>
            <button v-if="stravaStore.canSync" class="btn btn-primary" @click="syncActivities">
              <Download class="mr-2 h-4 w-4" />
              {{
                stravaStore.activeSyncMode === 'incremental'
                  ? '正在同步活动...'
                  : '同步活动'
              }}
            </button>
            <AppDropdown>
              <template #trigger="{ isOpen, toggle }">
                <button class="btn btn-ghost" :aria-expanded="isOpen" @click="toggle">
                  更多操作
                  <ChevronDown class="ml-2 h-4 w-4 transition" :class="isOpen ? 'rotate-180' : ''" />
                </button>
              </template>

              <template #default="{ close }">
                <button v-if="stravaStore.canSync" class="btn btn-ghost !justify-start" @click="close(); backfillHistory()">
                  <Download class="mr-2 h-4 w-4" />
                  {{ stravaStore.activeSyncMode === 'history' ? '正在回填历史...' : '加载更早活动' }}
                </button>
                <button class="btn btn-ghost !justify-start" @click="close(); refreshPage()">
                  <RefreshCw class="mr-2 h-4 w-4" />
                  刷新状态
                </button>
                <button class="btn btn-ghost !justify-start" @click="close(); openWebhookStatus()">
                  <Antenna class="mr-2 h-4 w-4" />
                  Webhook 状态
                </button>
                <button class="btn btn-ghost !justify-start" :disabled="!stravaStore.canDisconnect" @click="close(); disconnectStrava()">
                  <Unplug class="mr-2 h-4 w-4" />
                  {{ stravaStore.disconnecting ? '正在断开连接...' : '断开 Strava' }}
                </button>
              </template>
            </AppDropdown>
          </div>
        </div>

        <div v-if="stravaStore.error" class="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {{ stravaStore.error }}
        </div>

        <div v-if="stravaStore.hasConnectionIssue" class="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-700">
          <p class="font-semibold">
            {{ stravaStore.needsReauthorization ? 'Strava 连接需要重新授权' : 'Strava 连接存在异常' }}
          </p>
          <p class="mt-1 leading-6">
            {{ stravaStore.lastErrorMessage || '当前连接可能已过期、被撤销或本地 token 已失效。重新连接后会继续沿用当前产品账号。' }}
          </p>
          <div class="mt-3 flex flex-wrap gap-3">
            <button class="btn btn-primary" :disabled="stravaStore.connecting || !stravaStore.canConnect" @click="stravaStore.startConnection">
              <Link2 class="mr-2 h-4 w-4" />
              {{ stravaStore.needsReauthorization ? '重新授权 Strava' : '重新连接 Strava' }}
            </button>
            <button class="btn btn-ghost" :disabled="!stravaStore.canDisconnect" @click="disconnectStrava">
              <Unplug class="mr-2 h-4 w-4" />
              断开当前连接
            </button>
          </div>
        </div>

        <div
          v-if="stravaNotice"
          class="rounded-2xl px-4 py-4"
          :class="stravaNoticeClass(stravaNotice.tone)"
        >
          <div class="flex items-start gap-3">
            <CheckCircle2 v-if="stravaNotice.tone === 'success'" class="mt-0.5 h-5 w-5 shrink-0" />
            <TriangleAlert v-else class="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p class="text-sm font-semibold">
                {{ stravaNotice.title }}
              </p>
              <p class="mt-1 text-sm leading-6">
                {{ stravaNotice.description }}
              </p>
            </div>
          </div>
        </div>

        <div v-if="activitiesStore.error" class="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {{ activitiesStore.error }}
        </div>

        <div v-if="stravaStore.syncSummary" class="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-700">
          <p class="font-semibold">
            {{ stravaStore.syncSummary.mode === 'history' ? '历史回填完成' : '同步完成' }}
          </p>
          <p class="mt-1 leading-6">
            本次抓取 {{ stravaStore.syncSummary.fetched }} 条活动，新增 {{ stravaStore.syncSummary.created }} 条，更新 {{ stravaStore.syncSummary.updated }} 条，可生成 {{ stravaStore.syncSummary.generatable }} 条。
            {{ stravaStore.syncSummary.mode === 'history' ? '如果还有更早的数据，继续点一次“加载更早活动”即可。' : '' }}
          </p>
        </div>

        <section v-if="!hasActivities && !activitiesStore.loading" class="rounded-4xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-card)]/70 p-8 text-center sm:p-10">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
            <Route class="h-8 w-8" />
          </div>
          <h2 class="mt-5 text-xl font-semibold text-[var(--color-text)]">
            还没有本地活动数据
          </h2>
          <p class="mx-auto mt-3 max-w-xl leading-7 text-[var(--color-text-muted)]">
            这通常意味着你还没连接 Strava，或者授权刚完成但首次同步任务还没接上。当前阶段先把连接回流和本地活动读取边界搭起来。
          </p>
          <div class="mt-6 flex flex-wrap justify-center gap-3">
            <button v-if="stravaStore.canConnect" class="btn btn-primary" :disabled="stravaStore.connecting" @click="stravaStore.startConnection">
              <Link2 class="mr-2 h-4 w-4" />
              {{ stravaStore.connecting ? '正在跳转到 Strava...' : '开始连接 Strava' }}
            </button>
            <button v-if="stravaStore.canSync" class="btn btn-primary" @click="syncActivities">
              <Download class="mr-2 h-4 w-4" />
              {{ stravaStore.activeSyncMode === 'incremental' ? '正在同步活动...' : '同步首批活动' }}
            </button>
            <AppDropdown align="center">
              <template #trigger="{ isOpen, toggle }">
                <button class="btn btn-ghost" :aria-expanded="isOpen" @click="toggle">
                  更多操作
                  <ChevronDown class="ml-2 h-4 w-4 transition" :class="isOpen ? 'rotate-180' : ''" />
                </button>
              </template>

              <template #default="{ close }">
                <button v-if="stravaStore.canSync" class="btn btn-ghost !justify-start" @click="close(); backfillHistory()">
                  <Download class="mr-2 h-4 w-4" />
                  {{ stravaStore.activeSyncMode === 'history' ? '正在回填历史...' : '加载更早活动' }}
                </button>
                <button class="btn btn-ghost !justify-start" @click="close(); refreshPage()">
                  <RefreshCw class="mr-2 h-4 w-4" />
                  重新读取状态
                </button>
                <button class="btn btn-ghost !justify-start" @click="close(); openWebhookStatus()">
                  <Antenna class="mr-2 h-4 w-4" />
                  Webhook 状态
                </button>
                <button class="btn btn-ghost !justify-start" :disabled="!stravaStore.canDisconnect" @click="close(); disconnectStrava()">
                  <Unplug class="mr-2 h-4 w-4" />
                  {{ stravaStore.disconnecting ? '正在断开连接...' : '断开连接' }}
                </button>
              </template>
            </AppDropdown>
          </div>
        </section>

        <section v-else class="grid gap-4">
          <div v-if="activitiesStore.loading" class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
            正在读取本地活动列表...
          </div>

          <article
            v-for="activity in activitiesStore.activities"
            :key="activity.id"
            class="cursor-pointer rounded-[28px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:border-primary/35 hover:shadow-[0_22px_48px_rgba(79,70,229,0.12)] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none sm:p-6"
            role="button"
            tabindex="0"
            @click="openActivity(activity.id)"
            @keydown.enter.prevent="openActivity(activity.id)"
            @keydown.space.prevent="openActivity(activity.id)"
          >
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-lg font-semibold text-[var(--color-text)]">
                    {{ activity.name }}
                  </h2>
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

                <p class="mt-3 text-sm text-[var(--color-text-muted)]">
                  {{ activity.start_date ? formatDateTime(activity.start_date) : '暂无开始时间' }}
                </p>

                <div class="mt-4 flex flex-wrap gap-3 text-sm text-[var(--color-text-muted)]">
                  <span v-if="activity.distance_meters">{{ formatDistance(activity.distance_meters) }}</span>
                  <span v-if="activity.moving_time_seconds">{{ Math.round(activity.moving_time_seconds / 60) }} 分钟</span>
                  <span v-if="activity.sync_status">同步状态：{{ activity.sync_status }}</span>
                </div>

                <p v-if="activity.generatable_reason && !activity.is_generatable" class="mt-3 text-sm text-amber-600">
                  {{ activity.generatable_reason }}
                </p>
              </div>
            </div>
          </article>

          <div v-if="hasActivities" class="flex flex-col items-center gap-3 rounded-[28px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-5 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p class="text-sm text-[var(--color-text-muted)]">
              已加载 {{ activitiesStore.loadedCount }} / {{ activitiesStore.totalItems }} 条活动
            </p>
            <button class="btn btn-ghost" :disabled="activitiesStore.loadingMore || !activitiesStore.hasMore" @click="activitiesStore.loadMoreActivities">
              <Download class="mr-2 h-4 w-4" />
              {{
                activitiesStore.loadingMore
                  ? '正在加载更多活动...'
                  : (activitiesStore.hasMore ? '加载更多活动' : '没有更多活动了')
              }}
            </button>
          </div>
        </section>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Antenna, ArrowRight, CheckCircle2, Download, Link2, RefreshCw, Route, Sparkles, TriangleAlert, Unplug } from 'lucide-vue-next'
import { useActivitiesStore } from '@/stores/activities'
import { useStravaStore } from '@/stores/strava'
import { useSyncEventsStore } from '@/stores/sync-events'

const route = useRoute()
const router = useRouter()
const activitiesStore = useActivitiesStore()
const stravaStore = useStravaStore()
const syncEventsStore = useSyncEventsStore()

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
        description: '请检查 PocketBase 环境变量、Strava 应用回调地址和服务端日志。',
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

const eventToneClass = (status: string) => {
  switch (status) {
    case 'success':
      return 'bg-emerald-500/12 text-emerald-600'
    case 'warning':
      return 'bg-amber-500/12 text-amber-600'
    case 'error':
      return 'bg-red-500/12 text-red-500'
    default:
      return 'bg-slate-500/12 text-slate-600'
  }
}

const eventStatusLabel = (status: string) => {
  switch (status) {
    case 'success':
      return '成功'
    case 'warning':
      return '警告'
    case 'error':
      return '失败'
    default:
      return '信息'
  }
}

const eventTimestamp = (value: { occurred_at?: string; created?: string }) => value.occurred_at || value.created || ''

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
    syncEventsStore.fetchLatestEvents(),
  ])
}

const syncActivities = async () => {
  await stravaStore.runSync()
  await Promise.all([
    activitiesStore.fetchActivities(),
    syncEventsStore.fetchLatestEvents(),
  ])
}

const disconnectStrava = async () => {
  const disconnected = await stravaStore.disconnect()
  if (disconnected) {
    await Promise.all([
      activitiesStore.fetchActivities(),
      syncEventsStore.fetchLatestEvents(),
    ])
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
    <main class="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <section class="flex flex-col gap-6">
        <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p class="text-xs uppercase tracking-[0.26em] text-[var(--color-text-muted)]">Activities</p>
            <h1 class="text-2xl sm:text-3xl font-semibold text-[var(--color-text)] mt-2">本地活动列表</h1>
            <p class="text-[var(--color-text-muted)] mt-3 leading-7 max-w-2xl">
              这里读取的是本地同步后的活动数据，不直接从前端实时请求 Strava。阶段 2 的目标是先把连接状态、活动列表和详情页跑通。
            </p>
          </div>

          <div class="flex flex-wrap gap-3">
            <button class="btn btn-primary" :disabled="stravaStore.connecting || !stravaStore.canConnect" @click="stravaStore.startConnection">
              <Link2 class="w-4 h-4 mr-2" />
              {{ stravaStore.connecting ? '正在跳转到 Strava...' : '连接 Strava' }}
            </button>
            <button class="btn btn-primary" :disabled="!stravaStore.canSync" @click="syncActivities">
              <Download class="w-4 h-4 mr-2" />
              {{ stravaStore.syncing ? '正在同步活动...' : '同步活动' }}
            </button>
            <button class="btn btn-ghost" :disabled="!stravaStore.canDisconnect" @click="disconnectStrava">
              <Unplug class="w-4 h-4 mr-2" />
              {{ stravaStore.disconnecting ? '正在断开连接...' : '断开 Strava' }}
            </button>
            <button class="btn btn-ghost" @click="refreshPage">
              <RefreshCw class="w-4 h-4 mr-2" />
              刷新状态
            </button>
            <button class="btn btn-ghost" @click="openWebhookStatus">
              <Antenna class="w-4 h-4 mr-2" />
              Webhook 状态
            </button>
          </div>
        </div>

        <section class="grid gap-4 md:grid-cols-3">
          <div class="rounded-3xl border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p class="text-xs uppercase tracking-[0.22em] text-[var(--color-text-muted)]">Strava</p>
            <p class="mt-2 text-base font-semibold text-[var(--color-text)]">{{ stravaStore.statusLabel }}</p>
            <p class="mt-2 text-sm text-[var(--color-text-muted)]">
              {{
                stravaStore.athleteLabel
                  ? `已绑定：${stravaStore.athleteLabel}`
                  : (stravaStore.lastSyncAt ? `最近同步：${new Date(stravaStore.lastSyncAt).toLocaleString()}` : '首次同步尚未开始')
              }}
            </p>
          </div>

          <div class="rounded-3xl border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p class="text-xs uppercase tracking-[0.22em] text-[var(--color-text-muted)]">活动总数</p>
            <p class="mt-2 text-base font-semibold text-[var(--color-text)]">{{ activitiesStore.activities.length }}</p>
            <p class="mt-2 text-sm text-[var(--color-text-muted)]">本地已读取的活动记录</p>
          </div>

          <div class="rounded-3xl border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p class="text-xs uppercase tracking-[0.22em] text-[var(--color-text-muted)]">可生成活动</p>
            <p class="mt-2 text-base font-semibold text-[var(--color-text)]">{{ activitiesStore.generatableActivities.length }}</p>
            <p class="mt-2 text-sm text-[var(--color-text-muted)]">满足当前轨迹生成条件</p>
          </div>
        </section>

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
              <Link2 class="w-4 h-4 mr-2" />
              {{ stravaStore.needsReauthorization ? '重新授权 Strava' : '重新连接 Strava' }}
            </button>
            <button class="btn btn-ghost" :disabled="!stravaStore.canDisconnect" @click="disconnectStrava">
              <Unplug class="w-4 h-4 mr-2" />
              断开当前连接
            </button>
          </div>
        </div>

        <div
          v-if="stravaNotice"
          class="rounded-2xl px-4 py-4"
          :class="stravaNotice.tone === 'success'
            ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-700'
            : 'border border-amber-500/20 bg-amber-500/10 text-amber-700'"
        >
          <div class="flex items-start gap-3">
            <CheckCircle2 v-if="stravaNotice.tone === 'success'" class="w-5 h-5 mt-0.5 shrink-0" />
            <TriangleAlert v-else class="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p class="text-sm font-semibold">{{ stravaNotice.title }}</p>
              <p class="mt-1 text-sm leading-6">{{ stravaNotice.description }}</p>
            </div>
          </div>
        </div>

        <div v-if="activitiesStore.error" class="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {{ activitiesStore.error }}
        </div>

        <div v-if="stravaStore.syncSummary" class="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-700">
          <p class="font-semibold">同步完成</p>
          <p class="mt-1 leading-6">
            本次抓取 {{ stravaStore.syncSummary.fetched }} 条活动，新增 {{ stravaStore.syncSummary.created }} 条，更新 {{ stravaStore.syncSummary.updated }} 条，可生成 {{ stravaStore.syncSummary.generatable }} 条。
          </p>
        </div>

        <section v-if="!hasActivities && !activitiesStore.loading" class="rounded-[32px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-card)]/70 p-8 sm:p-10 text-center">
          <div class="mx-auto w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center">
            <Route class="w-8 h-8" />
          </div>
          <h2 class="mt-5 text-xl font-semibold text-[var(--color-text)]">还没有本地活动数据</h2>
          <p class="mt-3 text-[var(--color-text-muted)] leading-7 max-w-xl mx-auto">
            这通常意味着你还没连接 Strava，或者授权刚完成但首次同步任务还没接上。当前阶段先把连接回流和本地活动读取边界搭起来。
          </p>
          <div class="mt-6 flex flex-wrap justify-center gap-3">
            <button class="btn btn-primary" :disabled="stravaStore.connecting || !stravaStore.canConnect" @click="stravaStore.startConnection">
              <Link2 class="w-4 h-4 mr-2" />
              {{ stravaStore.connecting ? '正在跳转到 Strava...' : '开始连接 Strava' }}
            </button>
            <button class="btn btn-primary" :disabled="!stravaStore.canSync" @click="syncActivities">
              <Download class="w-4 h-4 mr-2" />
              {{ stravaStore.syncing ? '正在同步活动...' : '同步首批活动' }}
            </button>
            <button class="btn btn-ghost" :disabled="!stravaStore.canDisconnect" @click="disconnectStrava">
              <Unplug class="w-4 h-4 mr-2" />
              {{ stravaStore.disconnecting ? '正在断开连接...' : '断开连接' }}
            </button>
            <button class="btn btn-ghost" @click="refreshPage">
              <RefreshCw class="w-4 h-4 mr-2" />
              重新读取状态
            </button>
          </div>
        </section>

        <section v-else class="grid gap-4">
          <div v-if="activitiesStore.loading" class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
            正在读取本地活动列表...
          </div>

          <article
            v-for="activity in activitiesStore.activities"
            :key="activity.id"
            class="rounded-[28px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-5 sm:p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
          >
            <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-lg font-semibold text-[var(--color-text)]">{{ activity.name }}</h2>
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

              <div class="flex items-center gap-3 shrink-0">
                <button class="btn btn-ghost" @click="openActivity(activity.id)">
                  查看详情
                  <ArrowRight class="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          </article>
        </section>

        <section class="rounded-[28px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div class="flex items-start gap-3">
            <Sparkles class="w-5 h-5 mt-1 text-primary shrink-0" />
            <div>
              <h2 class="text-base font-semibold text-[var(--color-text)]">阶段 2 说明</h2>
              <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                当前活动页已经可以读取本地 collections，也支持发起真实 Strava 首次同步。下一步会继续补 webhook 和更稳定的增量同步。
              </p>
            </div>
          </div>
        </section>

        <section class="rounded-[28px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div class="flex items-start gap-3">
            <RefreshCw class="w-5 h-5 mt-1 text-primary shrink-0" />
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-semibold text-[var(--color-text)]">最近事件</h2>
              <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                这里会记录最近一次同步、webhook 更新和连接变更，方便联调时快速判断系统刚刚做了什么。
              </p>

              <div v-if="syncEventsStore.loading" class="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/50 px-4 py-4 text-sm text-[var(--color-text-muted)]">
                正在读取最近事件...
              </div>

              <div v-else-if="syncEventsStore.error" class="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm text-red-500">
                {{ syncEventsStore.error }}
              </div>

              <div v-else-if="syncEventsStore.events.length === 0" class="mt-5 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-elevated)]/35 px-4 py-5 text-sm text-[var(--color-text-muted)]">
                还没有事件记录。完成一次同步或收到 webhook 后，这里会显示最近日志。
              </div>

              <div v-else class="mt-5 grid gap-3">
                <div
                  v-for="event in syncEventsStore.events"
                  :key="event.id"
                  class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-4"
                >
                  <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="text-sm font-semibold text-[var(--color-text)]">{{ event.title }}</span>
                        <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium" :class="eventToneClass(event.status)">
                          {{ eventStatusLabel(event.status) }}
                        </span>
                        <span class="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          {{ event.category }}
                        </span>
                      </div>
                      <p class="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                        {{ event.message || '暂无附加说明' }}
                      </p>
                    </div>

                    <p class="shrink-0 text-sm text-[var(--color-text-muted)]">
                      {{ eventTimestamp(event) ? formatDateTime(eventTimestamp(event)) : '暂无时间信息' }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  </div>
</template>

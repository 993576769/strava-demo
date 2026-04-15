<script setup lang="ts">
import { CheckCircle2, Link2, RefreshCw, ShieldCheck, TriangleAlert, Unplug } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { cn } from '@/lib/utils'
import { useStravaStore } from '@/stores/strava'
import { useSyncEventsStore } from '@/stores/sync-events'

const stravaStore = useStravaStore()
const syncEventsStore = useSyncEventsStore()
const copyFeedback = ref('')
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null

const webhookEvents = computed(() => syncEventsStore.events.filter(event => event.category === 'webhook'))
const connectionEvents = computed(() => syncEventsStore.events.filter(event => event.category === 'connection'))
const syncEvents = computed(() => syncEventsStore.events.filter(event => event.category === 'sync'))
const callbackBase = computed(() => {
  if (import.meta.env.VITE_PB_URL) {
    return import.meta.env.VITE_PB_URL.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
})
const webhookVerifyUrl = computed(() => `${callbackBase.value}/api/integrations/strava/webhook`)
const verifyChecklistText = computed(() =>
  [
    'Strava webhook verify checklist',
    '',
    `Webhook Callback URL: ${webhookVerifyUrl.value}`,
    '',
    '1. 确认 Strava 应用中的 callback domain 与当前 PocketBase 域名一致。',
    '2. 确认 `.env` 中的 `STRAVA_WEBHOOK_VERIFY_TOKEN` 与订阅时填写的 `verify_token` 一致。',
    '3. 发送一次测试事件后，检查这个页面里的“最近 webhook 事件”是否新增记录。',
  ].join('\n'),
)

const eventTimestamp = (value: { occurred_at?: string, created?: string }) => value.occurred_at || value.created || ''

const formatDateTime = (value: string) => {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const eventToneClass = (status: string) => {
  switch (status) {
    case 'success':
      return cn('bg-emerald-500/12 text-emerald-600')
    case 'warning':
      return cn('bg-amber-500/12 text-amber-600')
    case 'error':
      return cn('bg-red-500/12 text-red-500')
    default:
      return cn('bg-slate-500/12 text-slate-600')
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

const showCopyFeedback = (message: string) => {
  copyFeedback.value = message

  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer)
  }

  copyFeedbackTimer = setTimeout(() => {
    copyFeedback.value = ''
    copyFeedbackTimer = null
  }, 2200)
}

const copyText = async (text: string, successMessage: string) => {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      showCopyFeedback(successMessage)
      return
    }

    if (typeof document === 'undefined') {
      throw new TypeError('clipboard unavailable')
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    showCopyFeedback(successMessage)
  }
  catch {
    showCopyFeedback('复制失败，请手动复制。')
  }
}

const refreshPage = async () => {
  await Promise.all([
    stravaStore.fetchConnection(),
    syncEventsStore.fetchLatestEvents(),
  ])
}

const reconnect = async () => {
  await stravaStore.startConnection()
}

const disconnect = async () => {
  await stravaStore.disconnect()
  await syncEventsStore.fetchLatestEvents()
}

onMounted(async () => {
  await refreshPage()
})

onUnmounted(() => {
  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer)
  }
})
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(180deg,_rgba(79,70,229,0.06),_transparent_24%),var(--bg)]">
    <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div class="mb-5 flex">
        <button class="btn btn-ghost w-full justify-center sm:w-auto sm:justify-start" @click="refreshPage">
          <RefreshCw class="mr-2 h-4 w-4" />
          刷新状态页
        </button>
      </div>

      <section class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <article class="min-w-0 rounded-4xl border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-8">
          <p class="text-xs tracking-[0.26em] text-[var(--color-text-muted)] uppercase">
            Dev Panel
          </p>
          <h1 class="mt-3 text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
            Webhook 状态页
          </h1>
          <p class="mt-3 text-sm leading-6 text-[var(--color-text-muted)] sm:text-base sm:leading-7">
            这个页面用于开发联调。你可以在这里确认当前 Strava 连接状态、webhook 回调地址，以及最近一次 webhook / 同步事件是否真的进入了系统。
          </p>

          <div class="mt-6 grid min-w-0 gap-4 sm:grid-cols-2">
            <div class="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-4">
              <p class="text-xs tracking-[0.2em] text-[var(--color-text-muted)] uppercase">
                连接状态
              </p>
              <p class="mt-2 text-sm font-semibold text-[var(--color-text)]">
                {{ stravaStore.statusLabel }}
              </p>
              <p class="mt-2 text-sm text-[var(--color-text-muted)]">
                {{ stravaStore.athleteLabel ? `绑定账号：${stravaStore.athleteLabel}` : '还没有可展示的 Strava 账号标识' }}
              </p>
            </div>

            <div class="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-4">
              <p class="text-xs tracking-[0.2em] text-[var(--color-text-muted)] uppercase">
                最近 webhook
              </p>
              <p class="mt-2 text-sm font-semibold text-[var(--color-text)]">
                {{ stravaStore.connection?.last_webhook_at ? formatDateTime(stravaStore.connection.last_webhook_at) : '还没有收到 webhook' }}
              </p>
              <p class="mt-2 text-sm text-[var(--color-text-muted)]">
                {{ stravaStore.lastSyncAt ? `最近同步：${formatDateTime(stravaStore.lastSyncAt)}` : '最近同步时间尚未记录' }}
              </p>
            </div>
          </div>

          <div v-if="stravaStore.hasConnectionIssue" class="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-700">
            <p class="font-semibold">
              {{ stravaStore.needsReauthorization ? '当前需要重新授权 Strava' : '当前连接存在异常' }}
            </p>
            <p class="mt-1 leading-6">
              {{ stravaStore.lastErrorMessage || '连接已失效、被撤销，或者 token 刷新失败。' }}
            </p>
            <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button class="btn btn-primary w-full sm:w-auto" :disabled="stravaStore.connecting || !stravaStore.canConnect" @click="reconnect">
                <Link2 class="mr-2 h-4 w-4" />
                {{ stravaStore.needsReauthorization ? '重新授权 Strava' : '重新连接 Strava' }}
              </button>
              <button class="btn btn-ghost w-full sm:w-auto" :disabled="!stravaStore.canDisconnect" @click="disconnect">
                <Unplug class="mr-2 h-4 w-4" />
                {{ stravaStore.disconnecting ? '正在断开连接...' : '断开当前连接' }}
              </button>
            </div>
          </div>

          <div class="mt-6 min-w-0 rounded-[28px] border border-[var(--color-border)]/60 bg-[var(--color-surface-elevated)]/35 p-5">
            <div class="flex items-start gap-3">
              <ShieldCheck class="mt-1 h-5 w-5 shrink-0 text-primary" />
              <div class="min-w-0 flex-1">
                <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <h2 class="text-base font-semibold text-[var(--color-text)]">
                    联调检查清单
                  </h2>
                  <button class="btn btn-ghost w-full justify-center sm:w-auto sm:justify-start" @click="copyText(verifyChecklistText, 'verify checklist 已复制')">
                    复制 verify checklist
                  </button>
                </div>
                <p v-if="copyFeedback" class="mt-3 text-sm text-primary">
                  {{ copyFeedback }}
                </p>
                <div class="mt-4 grid min-w-0 gap-3">
                  <div class="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] px-4 py-4">
                    <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <p class="text-xs tracking-[0.2em] text-[var(--color-text-muted)] uppercase">
                        Webhook Callback URL
                      </p>
                      <button class="btn btn-ghost w-full justify-center sm:w-auto sm:max-w-full sm:justify-start" @click="copyText(webhookVerifyUrl, 'callback URL 已复制')">
                        复制 callback URL
                      </button>
                    </div>
                    <p class="mt-2 min-w-0 overflow-hidden text-sm font-medium break-all text-[var(--color-text)]">
                      {{ webhookVerifyUrl }}
                    </p>
                  </div>
                  <div class="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] px-4 py-4">
                    <p class="text-xs tracking-[0.2em] text-[var(--color-text-muted)] uppercase">
                      需要确认
                    </p>
                    <ul class="mt-2 space-y-2 text-sm text-[var(--color-text-muted)]">
                      <li>Strava 应用中的 callback domain 与当前 PocketBase 域名一致。</li>
                      <li>`.env` 中的 `STRAVA_WEBHOOK_VERIFY_TOKEN` 与订阅时填写的 `verify_token` 一致。</li>
                      <li>收到 webhook 后，下面的“最近 webhook 事件”列表会新增一条记录。</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>

        <aside class="grid min-w-0 gap-4">
          <section class="min-w-0 rounded-[28px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
            <h2 class="text-base font-semibold text-[var(--color-text)]">
              最近 webhook 事件
            </h2>
            <div v-if="syncEventsStore.loading" class="mt-4 text-sm text-[var(--color-text-muted)]">
              正在读取事件...
            </div>
            <div v-else-if="webhookEvents.length === 0" class="mt-4 text-sm text-[var(--color-text-muted)]">
              还没有 webhook 事件记录。
            </div>
            <div v-else class="mt-4 grid min-w-0 gap-3">
              <div v-for="event in webhookEvents" :key="event.id" class="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-4">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-semibold text-[var(--color-text)]">{{ event.title }}</span>
                  <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium" :class="eventToneClass(event.status)">
                    {{ eventStatusLabel(event.status) }}
                  </span>
                </div>
                <p class="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                  {{ event.message || '暂无附加说明' }}
                </p>
                <p class="mt-2 text-sm text-[var(--color-text-muted)]">
                  {{ formatDateTime(eventTimestamp(event)) }}
                </p>
              </div>
            </div>
          </section>

          <section class="min-w-0 rounded-[28px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
            <h2 class="text-base font-semibold text-[var(--color-text)]">
              最近同步 / 连接事件
            </h2>
            <div v-if="syncEventsStore.loading" class="mt-4 text-sm text-[var(--color-text-muted)]">
              正在读取事件...
            </div>
            <div v-else-if="syncEvents.length === 0 && connectionEvents.length === 0" class="mt-4 text-sm text-[var(--color-text-muted)]">
              还没有同步或连接事件记录。
            </div>
            <div v-else class="mt-4 grid min-w-0 gap-3">
              <div
                v-for="event in [...connectionEvents, ...syncEvents].sort((a, b) => new Date(eventTimestamp(b)).getTime() - new Date(eventTimestamp(a)).getTime()).slice(0, 6)"
                :key="event.id"
                class="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-4"
              >
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
                <p class="mt-2 text-sm text-[var(--color-text-muted)]">
                  {{ formatDateTime(eventTimestamp(event)) }}
                </p>
              </div>
            </div>
          </section>

          <section v-if="stravaStore.connection?.last_webhook_at" class="min-w-0 rounded-[28px] border border-emerald-500/20 bg-emerald-500/10 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
            <div class="flex items-start gap-3">
              <CheckCircle2 class="mt-1 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <h2 class="text-base font-semibold text-[var(--color-text)]">
                  最近 webhook 已到达
                </h2>
                <p class="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                  最近一次 webhook 到达时间是 {{ formatDateTime(stravaStore.connection.last_webhook_at) }}。如果同时能在上面的事件列表里看到新记录，说明回调链路基本正常。
                </p>
              </div>
            </div>
          </section>

          <section v-else class="min-w-0 rounded-[28px] border border-amber-500/20 bg-amber-500/10 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
            <div class="flex items-start gap-3">
              <TriangleAlert class="mt-1 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <h2 class="text-base font-semibold text-[var(--color-text)]">
                  还没有收到 webhook
                </h2>
                <p class="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                  如果你已经创建了 Strava webhook 订阅，但这里仍然一直为空，优先检查 callback URL、verify token 和公网可达性。
                </p>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  </div>
</template>

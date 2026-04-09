<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Compass, Download, Link2, LogOut, Route, ShieldCheck, Sparkles, Unplug } from 'lucide-vue-next'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { useAuthStore } from '@/stores/auth'
import { useStravaStore } from '@/stores/strava'

const router = useRouter()
const auth = useAuthStore()
const strava = useStravaStore()

const displayName = computed(() => auth.displayName)
const email = computed(() => auth.user?.email ?? '')
const stravaStatusLabel = computed(() => strava.statusLabel)
const lastSyncLabel = computed(() => {
  if (!strava.lastSyncAt) return '首次同步尚未开始'
  return `最近同步时间：${new Date(strava.lastSyncAt).toLocaleString()}`
})

const handleLogout = () => {
  auth.logout()
  router.push({ name: 'login' })
}

onMounted(async () => {
  await strava.fetchConnection()
})

const openActivities = () => {
  router.push({ name: 'activities' })
}

const syncActivities = async () => {
  await strava.runSync()
}

const disconnectStrava = async () => {
  await strava.disconnect()
}
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(180deg,_rgba(79,70,229,0.08),_transparent_28%),var(--bg)]">
    <header class="border-b border-[var(--color-border)]/60 backdrop-blur-xl bg-[var(--color-surface-card)]/70 sticky top-0 z-10">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <p class="text-xs uppercase tracking-[0.26em] text-[var(--color-text-muted)]">Strava Art Lab</p>
          <h1 class="text-lg sm:text-xl font-semibold text-[var(--color-text)] mt-1">运动轨迹手绘生成器</h1>
        </div>

        <div class="flex items-center gap-3">
          <ThemeToggle />
          <div class="flex items-center gap-2 pl-3 border-l border-[var(--color-border)]">
            <div class="text-right hidden sm:block">
              <p class="text-sm font-medium text-[var(--color-text)]">{{ displayName }}</p>
              <p class="text-xs text-[var(--color-text-muted)]">{{ email }}</p>
            </div>
            <button class="btn btn-ghost" @click="handleLogout" title="退出登录">
              <LogOut class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <section class="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
        <div class="rounded-[28px] border border-[var(--color-border)]/50 bg-[var(--color-surface-card)] p-6 sm:p-8 shadow-[0_20px_50px_rgba(15,23,42,0.10)]">
          <p class="text-xs uppercase tracking-[0.28em] text-[var(--color-text-muted)]">Stage 1</p>
          <h2 class="text-2xl sm:text-4xl font-semibold text-[var(--color-text)] mt-3 leading-tight">
            GitHub 登录、Strava 同步和成品生成链路已经接通。
          </h2>
          <p class="mt-4 text-[var(--color-text-muted)] leading-7">
            现在首页已经从模板示例页切成产品控制台壳层。你可以在这里连接 Strava、触发同步、查看活动，再把活动生成成成品图；未配置即梦 4.6 时会自动回退到 mock。
          </p>

          <div class="mt-6 flex flex-wrap gap-3">
            <button class="btn btn-primary" @click="strava.startConnection" :disabled="strava.connecting || !strava.canConnect">
              <Link2 class="w-4 h-4 mr-2" />
              {{
                strava.connecting
                  ? '正在跳转到 Strava...'
                  : (strava.canConnect ? '连接 Strava' : 'Strava 状态已读取')
              }}
            </button>
            <button class="btn btn-primary" @click="syncActivities" :disabled="!strava.canSync">
              <Download class="w-4 h-4 mr-2" />
              {{ strava.syncing ? '正在同步活动...' : '同步活动' }}
            </button>
            <button class="btn btn-ghost" @click="disconnectStrava" :disabled="!strava.canDisconnect">
              <Unplug class="w-4 h-4 mr-2" />
              {{ strava.disconnecting ? '正在断开连接...' : '断开 Strava' }}
            </button>
            <button class="btn btn-ghost" @click="openActivities">
              <Sparkles class="w-4 h-4 mr-2" />
              查看本地活动
            </button>
          </div>

          <div class="mt-8 grid gap-4 sm:grid-cols-3">
            <div class="rounded-2xl bg-[var(--color-surface-elevated)]/70 border border-[var(--color-border)] p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">登录</p>
              <p class="mt-2 text-sm font-medium text-[var(--color-text)]">当前仅 GitHub</p>
            </div>
            <div class="rounded-2xl bg-[var(--color-surface-elevated)]/70 border border-[var(--color-border)] p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">数据源</p>
              <p class="mt-2 text-sm font-medium text-[var(--color-text)]">{{ stravaStatusLabel }}</p>
            </div>
            <div class="rounded-2xl bg-[var(--color-surface-elevated)]/70 border border-[var(--color-border)] p-4">
              <p class="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">风格</p>
              <p class="mt-2 text-sm font-medium text-[var(--color-text)]">首版默认 `sketch`</p>
            </div>
          </div>
        </div>

        <div class="grid gap-4">
          <section v-if="strava.hasConnectionIssue" class="rounded-[28px] border border-amber-500/20 bg-amber-500/10 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <div class="flex items-start gap-3">
              <ShieldCheck class="w-5 h-5 mt-1 text-amber-600 shrink-0" />
              <div>
                <h3 class="text-base font-semibold text-[var(--color-text)]">
                  {{ strava.needsReauthorization ? 'Strava 需要重新授权' : 'Strava 连接异常' }}
                </h3>
                <p class="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                  {{ strava.lastErrorMessage || '当前连接状态异常，重新连接后即可继续同步活动。' }}
                </p>
                <div class="mt-4 flex flex-wrap gap-3">
                  <button class="btn btn-primary" :disabled="strava.connecting || !strava.canConnect" @click="strava.startConnection">
                    <Link2 class="w-4 h-4 mr-2" />
                    {{ strava.needsReauthorization ? '重新授权 Strava' : '重新连接 Strava' }}
                  </button>
                  <button class="btn btn-ghost" :disabled="!strava.canDisconnect" @click="disconnectStrava">
                    <Unplug class="w-4 h-4 mr-2" />
                    {{ strava.disconnecting ? '正在断开连接...' : '断开当前连接' }}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section class="rounded-[28px] border border-[var(--color-border)]/50 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Compass class="w-5 h-5" />
              </div>
              <div>
                <h3 class="text-lg font-semibold text-[var(--color-text)]">当前状态</h3>
                <p class="text-sm text-[var(--color-text-muted)]">阶段 2 正在推进中</p>
              </div>
            </div>

            <ul class="mt-5 space-y-3 text-sm text-[var(--color-text-muted)]">
              <li class="flex gap-3">
                <span class="mt-1 w-2 h-2 rounded-full bg-primary shrink-0"></span>
                产品首页和登录页已经切换到 Strava 轨迹图项目语义。
              </li>
              <li class="flex gap-3">
                <span class="mt-1 w-2 h-2 rounded-full bg-primary shrink-0"></span>
                认证层优先使用 GitHub OAuth，并保留未来账号密码扩展空间。
              </li>
              <li class="flex gap-3">
                <span class="mt-1 w-2 h-2 rounded-full bg-primary shrink-0"></span>
                当前已补上 Strava 连接管理、首次同步、本地活动读取和统一成品生成链路。
              </li>
            </ul>
          </section>

          <section class="rounded-[28px] border border-[var(--color-border)]/50 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <div class="flex items-start gap-3">
              <ShieldCheck class="w-5 h-5 mt-1 text-primary shrink-0" />
              <div>
                <h3 class="text-base font-semibold text-[var(--color-text)]">实现提醒</h3>
                <p class="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                  连接 Strava、活动同步和 AI 生成都不会直接在页面请求中完成，后续都会落成可追踪的异步任务。
                </p>
              </div>
            </div>
          </section>

          <section class="rounded-[28px] border border-[var(--color-border)]/50 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <div class="flex items-start gap-3">
              <Route class="w-5 h-5 mt-1 text-primary shrink-0" />
              <div>
                <h3 class="text-base font-semibold text-[var(--color-text)]">接下来要做</h3>
                <p class="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                  {{ lastSyncLabel }}
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  </div>
</template>

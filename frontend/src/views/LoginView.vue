<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter, type LocationQueryValue } from 'vue-router'
import { Github, Loader2, Route, ShieldCheck } from 'lucide-vue-next'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const error = ref('')
const loading = ref(false)

const getRedirectTarget = (redirect: LocationQueryValue | LocationQueryValue[] | undefined) => {
  if (typeof redirect === 'string' && redirect.length > 0) return redirect
  if (Array.isArray(redirect)) {
    const [firstRedirect] = redirect
    return typeof firstRedirect === 'string' && firstRedirect.length > 0 ? firstRedirect : undefined
  }
  return undefined
}

const getErrorMessage = (value: unknown, fallback: string) => {
  if (value instanceof Error && value.message) return value.message
  if (typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string') {
    return value.message
  }
  return fallback
}

const handleGitHubLogin = async () => {
  error.value = ''
  loading.value = true

  try {
    await auth.loginWithGitHub()
    const redirect = getRedirectTarget(route.query.redirect)
    router.push(redirect || { name: 'home' })
  } catch (value: unknown) {
    error.value = getErrorMessage(value, 'GitHub 登录失败，请确认 PocketBase 已启用 GitHub OAuth Provider。')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(79,70,229,0.18),_transparent_36%),linear-gradient(180deg,_var(--bg),_var(--bg))] flex items-center justify-center p-4">
    <div class="absolute top-4 right-4">
      <ThemeToggle />
    </div>

    <div class="w-full max-w-[460px] bg-[var(--color-surface-card)]/88 backdrop-blur-xl rounded-3xl p-7 sm:p-9 border border-[var(--color-border)]/40 shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary mb-4 shadow-lg shadow-primary/20">
          <Route class="w-8 h-8 text-white" />
        </div>
        <p class="text-xs tracking-[0.28em] uppercase text-[var(--color-text-muted)]">
          Strava Art Lab
        </p>
        <h1 class="text-2xl sm:text-3xl font-bold text-[var(--color-text)] mt-2">
          把每次运动变成一张手绘轨迹图
        </h1>
        <p class="text-[var(--color-text-muted)] mt-3 text-sm sm:text-base leading-6">
          当前先支持 GitHub 登录。登录后即可连接 Strava，同步活动并生成可下载的轨迹作品。
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/55 p-4">
          <p class="text-xs uppercase tracking-[0.22em] text-[var(--color-text-muted)]">当前阶段</p>
          <p class="mt-2 text-sm font-medium text-[var(--color-text)]">GitHub 登录 + Strava 同步</p>
        </div>
        <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/55 p-4">
          <p class="text-xs uppercase tracking-[0.22em] text-[var(--color-text-muted)]">后续规划</p>
          <p class="mt-2 text-sm font-medium text-[var(--color-text)]">账号密码注册、登录、找回密码</p>
        </div>
      </div>

      <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/40 p-4 mb-6">
        <div class="flex items-start gap-3">
          <ShieldCheck class="w-5 h-5 mt-0.5 text-primary shrink-0" />
          <div class="text-sm text-[var(--color-text-muted)] leading-6">
            登录只是进入产品账号。真正读取运动数据时，我们会在登录后单独发起 Strava 授权。
          </div>
        </div>
      </div>

      <div v-if="error" class="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-sm text-center flex items-center justify-center gap-2 mb-5">
        <span class="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
        {{ error }}
      </div>

      <button
        type="button"
        class="w-full py-4 text-base font-semibold text-white btn-gradient rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer min-h-[52px]"
        :disabled="loading"
        @click="handleGitHubLogin"
      >
        <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
        <Github v-else class="w-5 h-5" />
        {{ loading ? '正在连接 GitHub...' : '使用 GitHub 登录' }}
      </button>

      <div class="mt-6 text-center text-sm text-[var(--color-text-muted)]">
        账号密码登录与找回密码会在后续阶段补齐。
      </div>

      <div class="mt-3 text-center text-xs text-[var(--color-text-muted)]/80">
        如果登录失败，请先在 PocketBase 管理后台为 `users` 启用 GitHub OAuth Provider。
      </div>
    </div>
  </div>
</template>

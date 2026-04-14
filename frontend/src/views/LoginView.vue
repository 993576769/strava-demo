<script setup lang="ts">
import type { LocationQueryValue } from 'vue-router'
import { Github, Loader2, Route, ShieldCheck } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const error = ref('')
const loading = ref(false)

const getRedirectTarget = (redirect: LocationQueryValue | LocationQueryValue[] | undefined) => {
  if (typeof redirect === 'string' && redirect.length > 0) { return redirect }
  if (Array.isArray(redirect)) {
    const [firstRedirect] = redirect
    return typeof firstRedirect === 'string' && firstRedirect.length > 0 ? firstRedirect : undefined
  }
  return undefined
}

const getErrorMessage = (value: unknown, fallback: string) => {
  if (value instanceof Error && value.message) { return value.message }
  if (typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string') {
    return value.message
  }
  return fallback
}

const redirectIfAuthenticated = () => {
  if (!auth.isLoggedIn) { return }
  const redirect = getRedirectTarget(route.query.redirect)
  router.replace(redirect || { name: 'home' })
}

watch(() => auth.isLoggedIn, redirectIfAuthenticated, { immediate: true })

const handleGitHubLogin = async () => {
  error.value = ''
  loading.value = true

  try {
    await auth.loginWithGitHub()
    redirectIfAuthenticated()
  }
  catch (value: unknown) {
    error.value = getErrorMessage(value, 'GitHub 登录失败，请确认 PocketBase 已启用 GitHub OAuth Provider。')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(79,70,229,0.18),_transparent_36%),linear-gradient(180deg,_var(--bg),_var(--bg))] p-4">
    <div class="absolute top-4 right-4">
      <ThemeToggle />
    </div>

    <div class="w-full max-w-[460px] rounded-3xl border border-[var(--color-border)]/40 bg-[var(--color-surface-card)]/88 p-7 shadow-[0_24px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:p-9">
      <div class="mb-8 text-center">
        <div class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/20">
          <Route class="h-8 w-8 text-white" />
        </div>
        <p class="text-xs tracking-[0.28em] text-[var(--color-text-muted)] uppercase">
          Strava Art Lab
        </p>
        <h1 class="mt-2 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">
          把每次运动变成一张手绘轨迹图
        </h1>
        <p class="mt-3 text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
          当前先支持 GitHub 登录。登录后即可连接 Strava，同步活动并生成可下载的轨迹作品。
        </p>
      </div>

      <div class="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/55 p-4">
          <p class="text-xs tracking-[0.22em] text-[var(--color-text-muted)] uppercase">
            当前阶段
          </p>
          <p class="mt-2 text-sm font-medium text-[var(--color-text)]">
            GitHub 登录 + Strava 同步
          </p>
        </div>
        <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/55 p-4">
          <p class="text-xs tracking-[0.22em] text-[var(--color-text-muted)] uppercase">
            后续规划
          </p>
          <p class="mt-2 text-sm font-medium text-[var(--color-text)]">
            账号密码注册、登录、找回密码
          </p>
        </div>
      </div>

      <div class="mb-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/40 p-4">
        <div class="flex items-start gap-3">
          <ShieldCheck class="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div class="text-sm leading-6 text-[var(--color-text-muted)]">
            登录只是进入产品账号。真正读取运动数据时，我们会在登录后单独发起 Strava 授权。
          </div>
        </div>
      </div>

      <div v-if="error" class="mb-5 flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-center text-sm text-red-400">
        <span class="h-1.5 w-1.5 rounded-full bg-red-500" />
        {{ error }}
      </div>

      <button
        type="button"
        class="btn-gradient flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="loading"
        @click="handleGitHubLogin"
      >
        <Loader2 v-if="loading" class="h-5 w-5 animate-spin" />
        <Github v-else class="h-5 w-5" />
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

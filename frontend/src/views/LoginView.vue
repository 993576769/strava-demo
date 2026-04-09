<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute, type LocationQueryValue } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Layers3, Mail, Lock, User, Loader2 } from 'lucide-vue-next'
import ThemeToggle from '@/components/ThemeToggle.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const isLogin = ref(true)
const email = ref('')
const password = ref('')
const name = ref('')
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

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return fallback
}

const toggleMode = () => {
  isLogin.value = !isLogin.value
  error.value = ''
}

const handleSubmit = async () => {
  error.value = ''

  if (!email.value || !password.value) {
    error.value = '请填写邮箱和密码'
    return
  }

  loading.value = true

  try {
    if (isLogin.value) {
      await auth.login(email.value, password.value)
    } else {
      await auth.register(email.value, password.value, name.value || undefined)
    }

    const redirect = getRedirectTarget(route.query.redirect)
    router.push(redirect || { name: 'home' })
  } catch (e: unknown) {
    error.value = getErrorMessage(e, isLogin.value ? '登录失败' : '注册失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-3 sm:p-4">
    <div class="absolute top-3 sm:top-4 right-3 sm:right-4">
      <ThemeToggle />
    </div>

    <div class="w-full max-w-[420px] bg-[var(--color-surface-card)]/80 backdrop-blur-xl rounded-2xl sm:card-shadow-lg p-6 sm:p-8 transition-all duration-300 hover:shadow-xl border border-[var(--color-border)]/30">
      <div class="text-center mb-6 sm:mb-8">
        <div class="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary mb-3 sm:mb-4 shadow-lg shadow-primary/25">
          <Layers3 class="w-7 h-7 sm:w-8 sm:h-8 text-white" />
        </div>
        <h1 class="text-xl sm:text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          Vue PocketBase Template
        </h1>
        <p class="text-[var(--color-text-muted)] mt-1.5 sm:mt-2 text-sm sm:text-base">
          {{ isLogin ? '登录模板演示账户' : '创建一个新的模板账户' }}
        </p>
      </div>

      <form @submit.prevent="handleSubmit" class="flex flex-col gap-4 sm:gap-5">
        <div v-if="!isLogin" class="flex flex-col gap-1.5 sm:gap-2">
          <label class="text-sm font-medium text-[var(--color-text)]">姓名（可选）</label>
          <div class="relative group">
            <User class="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-muted)] group-focus-within:text-primary transition-colors" />
            <input
              v-model="name"
              type="text"
              class="w-full pl-11 sm:pl-12 pr-4 py-3.5 text-base bg-[var(--color-surface-elevated)]/50 border-2 border-[var(--color-border)] rounded-xl focus:outline-none focus:border-primary focus:bg-[var(--color-surface-elevated)] focus:ring-4 focus:ring-primary/20 text-[var(--color-text)] placeholder-[var(--color-text-placeholder)] transition-all duration-200 min-h-[48px]"
              placeholder="你的名字"
            />
          </div>
        </div>

        <div class="flex flex-col gap-1.5 sm:gap-2">
          <label class="text-sm font-medium text-[var(--color-text)]">邮箱</label>
          <div class="relative group">
            <Mail class="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-muted)] group-focus-within:text-primary transition-colors" />
            <input
              v-model="email"
              type="email"
              class="w-full pl-11 sm:pl-12 pr-4 py-3.5 text-base bg-[var(--color-surface-elevated)]/50 border-2 border-[var(--color-border)] rounded-xl focus:outline-none focus:border-primary focus:bg-[var(--color-surface-elevated)] focus:ring-4 focus:ring-primary/20 text-[var(--color-text)] placeholder-[var(--color-text-placeholder)] transition-all duration-200 min-h-[48px]"
              placeholder="your@email.com"
              required
            />
          </div>
        </div>

        <div class="flex flex-col gap-1.5 sm:gap-2">
          <label class="text-sm font-medium text-[var(--color-text)]">密码</label>
          <div class="relative group">
            <Lock class="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-muted)] group-focus-within:text-primary transition-colors" />
            <input
              v-model="password"
              type="password"
              class="w-full pl-11 sm:pl-12 pr-4 py-3.5 text-base bg-[var(--color-surface-elevated)]/50 border-2 border-[var(--color-border)] rounded-xl focus:outline-none focus:border-primary focus:bg-[var(--color-surface-elevated)] focus:ring-4 focus:ring-primary/20 text-[var(--color-text)] placeholder-[var(--color-text-placeholder)] transition-all duration-200 min-h-[48px]"
              placeholder="至少8位"
              required
              minlength="8"
            />
          </div>
        </div>

        <div v-if="error" class="bg-red-500/10 border border-red-500/20 text-red-400 p-3 sm:p-3.5 rounded-xl text-sm text-center flex items-center justify-center gap-2">
          <span class="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
          {{ error }}
        </div>

        <button
          type="submit"
          class="w-full py-3.5 sm:py-4 text-base font-semibold text-white btn-gradient rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
          :disabled="loading"
        >
          <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
          {{ loading ? '处理中...' : (isLogin ? '登录' : '注册') }}
        </button>
      </form>

      <div class="mt-6 sm:mt-8 text-center text-sm text-[var(--color-text-muted)]">
        <span>{{ isLogin ? '没有账户？' : '已有账户？' }}</span>
        <button
          class="text-primary font-semibold hover:text-primary-hover ml-1 cursor-pointer transition-colors hover:underline underline-offset-2"
          @click="toggleMode"
        >
          {{ isLogin ? '立即注册' : '立即登录' }}
        </button>
      </div>
    </div>
  </div>
</template>

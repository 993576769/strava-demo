<script setup lang="ts">
import { ArrowRightLeft, House, LogOut, Menu, Route, ShieldCheck, Sparkles, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'

interface NavItem {
  label: string
  routeName: string
  icon: typeof House
  adminOnly?: boolean
}

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const isMobileSidebarOpen = ref(false)

const navItems: NavItem[] = [
  { label: '控制台', routeName: 'home', icon: House },
  { label: '活动列表', routeName: 'activities', icon: Route },
  { label: '生成记录', routeName: 'generation-history', icon: Sparkles },
  { label: 'Webhook 状态', routeName: 'webhook-status', icon: ArrowRightLeft },
  { label: 'Prompt 模板', routeName: 'admin-prompt-templates', icon: ShieldCheck, adminOnly: true },
]

const shellVisible = computed(() => auth.isLoggedIn && !route.meta.guest)
const filteredNavItems = computed(() => navItems.filter(item => !item.adminOnly || auth.isAdmin))
const pageTitle = computed(() => {
  const current = filteredNavItems.value.find(item => item.routeName === route.name)
  return current?.label ?? 'Strava Art Lab'
})
const userInitial = computed(() => (auth.displayName || 'S').trim().charAt(0).toUpperCase())

const isNavActive = (routeName: string) => route.name === routeName

const closeMobileSidebar = () => {
  isMobileSidebarOpen.value = false
}

const handleLogout = () => {
  auth.logout()
  closeMobileSidebar()
  router.push({ name: 'login' })
}

watch(() => route.fullPath, () => {
  closeMobileSidebar()
})
</script>

<template>
  <RouterView v-if="!shellVisible" />

  <div v-else class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.16),_transparent_26%),linear-gradient(180deg,_rgba(15,23,42,0.02),_transparent_22%),var(--bg)]">
    <div v-if="isMobileSidebarOpen" class="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden" @click="closeMobileSidebar" />

    <aside
      :class="cn(
        'fixed inset-y-0 left-0 z-50 w-70 flex flex-col border-r border-[var(--color-border)]/70 bg-[color:color-mix(in_srgb,var(--color-surface-card)_88%,white_12%)]/95 shadow-[0_22px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl transition-all duration-300',
        isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0',
      )"
    >
      <div class="flex items-center justify-between border-b border-[var(--color-border)]/70 px-5 py-5">
        <div class="min-w-0">
          <p class="text-[11px] tracking-[0.32em] text-[var(--color-text-muted)] uppercase">
            Strava Art Lab
          </p>
          <h1 class="mt-2 truncate text-lg font-semibold text-[var(--color-text)]">
            轨迹生成控制台
          </h1>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn btn-ghost !h-10 !w-10 !rounded-2xl !p-0 lg:hidden"
            @click="closeMobileSidebar"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="px-4 py-5">
        <div class="rounded-[26px] border border-[var(--color-border)]/70 bg-[linear-gradient(135deg,rgba(79,70,229,0.12),rgba(14,165,233,0.08))] p-4">
          <div class="flex items-center gap-3">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-surface-card)] text-sm font-semibold text-primary shadow-[0_10px_25px_rgba(79,70,229,0.18)]">
              {{ userInitial }}
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-[var(--color-text)]">
                {{ auth.displayName }}
              </p>
              <p class="truncate text-xs text-[var(--color-text-muted)]">
                {{ auth.user?.email }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <nav class="flex-1 px-3 pb-4">
        <RouterLink
          v-for="item in filteredNavItems"
          :key="item.routeName"
          :to="{ name: item.routeName }"
          class="mb-1.5 flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all"
          :class="cn(
            isNavActive(item.routeName)
              ? 'bg-primary text-white shadow-[0_14px_30px_rgba(79,70,229,0.28)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text)]',
          )"
        >
          <component :is="item.icon" class="h-5 w-5 shrink-0" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="border-t border-[var(--color-border)]/70 px-3 py-4">
        <button class="btn btn-ghost !w-full !justify-start !rounded-2xl !px-3 !py-3" @click="handleLogout">
          <LogOut class="h-5 w-5 shrink-0" />
          <span>退出登录</span>
        </button>
      </div>
    </aside>

    <div class="transition-all duration-300 lg:pl-[280px]">
      <header class="sticky top-0 z-30 border-b border-[var(--color-border)]/70 bg-[color:color-mix(in_srgb,var(--color-surface-card)_78%,white_22%)]/90 backdrop-blur-xl">
        <div class="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div class="flex min-w-0 items-center gap-3">
            <button
              type="button"
              class="btn btn-ghost !h-9 !w-9 !rounded-2xl !p-0 lg:hidden"
              @click="isMobileSidebarOpen = true"
            >
              <Menu class="h-5 w-5" />
            </button>
            <div class="min-w-0">
              <p class="truncate text-xs tracking-[0.28em] text-[var(--color-text-muted)] uppercase">
                {{ pageTitle }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <ThemeToggle />
            <div class="hidden items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 py-1.5 shadow-[0_12px_25px_rgba(15,23,42,0.06)] sm:flex">
              <div class="text-right">
                <p class="max-w-36 truncate text-sm font-medium text-[var(--color-text)]">
                  {{ auth.displayName }}
                </p>
                <p class="max-w-40 truncate text-xs text-[var(--color-text-muted)]">
                  {{ auth.user?.email }}
                </p>
              </div>
              <div class="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
                {{ userInitial }}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main class="px-0">
        <RouterView />
      </main>
    </div>
  </div>
</template>

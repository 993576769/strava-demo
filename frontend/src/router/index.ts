import type { RouteLocationNormalizedGeneric, RouteLocationRaw } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/activities',
      name: 'activities',
      component: () => import('@/views/ActivitiesView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/activities/:id',
      name: 'activity-detail',
      component: () => import('@/views/ActivityDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/activities/:id/results',
      name: 'activity-results',
      component: () => import('@/views/ActivityResultsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/history',
      name: 'generation-history',
      component: () => import('@/views/GenerationHistoryView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/results/:id',
      name: 'art-result-detail',
      component: () => import('@/views/ArtResultView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/prompt-templates',
      name: 'admin-prompt-templates',
      component: () => import('@/views/AdminPromptTemplatesView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/dev/webhook-status',
      name: 'webhook-status',
      component: () => import('@/views/WebhookStatusView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true },
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    else {
      return { top: 0 }
    }
  },
})

const resolveGuestRedirect = (to: RouteLocationNormalizedGeneric): RouteLocationRaw => {
  const redirect = to.query.redirect
  if (typeof redirect === 'string' && redirect.startsWith('/')) {
    return redirect
  }

  return { name: 'home' }
}

// 路由守卫
router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore()
  await auth.initialize()

  if (auth.isLoggedIn) {
    try {
      await auth.refresh()
    }
    catch {
      await auth.logout()
    }
  }

  // 需要登录但未登录
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    next({ name: 'login', query: { redirect: to.fullPath } })
    return
  }

  if (to.meta.requiresAdmin && !auth.isAdmin) {
    next({ name: 'home' })
    return
  }

  // 已登录但访问登录页
  if (to.meta.guest && auth.isLoggedIn) {
    next(resolveGuestRedirect(to))
    return
  }

  next()
})

export default router

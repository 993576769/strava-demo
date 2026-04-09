import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true }
    }
  ]
})

// 路由守卫
router.beforeEach((to, _from, next) => {
  const auth = useAuthStore()
  
  // 需要登录但未登录
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    next({ name: 'login', query: { redirect: to.fullPath } })
    return
  }
  
  // 已登录但访问登录页
  if (to.meta.guest && auth.isLoggedIn) {
    next({ name: 'home' })
    return
  }
  
  next()
})

export default router

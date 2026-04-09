import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { pb, usersCollection } from '@/lib/pocketbase'
import { useThemeStore } from '@/stores/theme'
import { isUser, toUserThemeOption, type Theme, type User, type UserCreate, type UserUpdate } from '@/types/pocketbase'

const toUserRecord = (value: unknown): User | null => {
  return isUser(value) ? value : null
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)

  // 初始化时从 PocketBase 恢复登录状态
  if (pb.authStore.isValid && pb.authStore.record) {
    user.value = toUserRecord(pb.authStore.record)
    // Initialize theme from user preference
    const themeStore = useThemeStore()
    themeStore.initFromUser(user.value?.theme)
  }

  // 登录状态
  const isLoggedIn = computed(() => !!user.value && pb.authStore.isValid)

  // 监听 authStore 变化
  pb.authStore.onChange((_token, model) => {
    user.value = toUserRecord(model)
  })

  // 登录
  const login = async (email: string, password: string) => {
    const auth = await usersCollection().authWithPassword(email, password)
    user.value = toUserRecord(auth.record)
    // Initialize theme from user preference
    const themeStore = useThemeStore()
    themeStore.initFromUser(user.value?.theme)
    return auth
  }

  // 注册
  const register = async (email: string, password: string, name?: string) => {
    const payload: UserCreate = {
      email,
      password,
      passwordConfirm: password
    }
    if (name) payload.name = name

    const newUser = await usersCollection().create(payload)
    await login(email, password)
    return newUser
  }

  // 登出
  const logout = () => {
    pb.authStore.clear()
    user.value = null
  }

  // 刷新用户信息
  const refresh = async () => {
    if (!pb.authStore.isValid) return
    const fresh = await usersCollection().authRefresh()
    user.value = toUserRecord(fresh.record)
  }

  // 获取用户头像 URL
  const getAvatarUrl = () => {
    if (!user.value?.avatar) return null
    return pb.files.getURL(user.value, user.value.avatar)
  }

  // 更新用户主题偏好
  const updateTheme = async (theme: Theme) => {
    if (!user.value) return
    const payload: UserUpdate = { theme: toUserThemeOption(theme) }
    await usersCollection().update(user.value.id, payload)
  }

  return {
    user,
    isLoggedIn,
    login,
    register,
    logout,
    refresh,
    getAvatarUrl,
    updateTheme
  }
})

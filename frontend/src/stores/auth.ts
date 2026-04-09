import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RecordService } from 'pocketbase'
import { pb, usersCollection } from '@/lib/pocketbase'
import { useThemeStore } from '@/stores/theme'
import { isUser, toUserThemeOption, type Theme, type User, type UserCreate, type UserUpdate } from '@/types/pocketbase'

const toUserRecord = (value: unknown): User | null => {
  return isUser(value) ? value : null
}

type OAuthRecordService = RecordService<User> & {
  authWithOAuth2: (options: { provider: string }) => Promise<{ record?: unknown }>
}

const syncThemeFromUser = (user: User | null) => {
  const themeStore = useThemeStore()
  themeStore.initFromUser(user?.theme)
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)

  if (pb.authStore.isValid && pb.authStore.record) {
    user.value = toUserRecord(pb.authStore.record)
    syncThemeFromUser(user.value)
  }

  const isLoggedIn = computed(() => !!user.value && pb.authStore.isValid)
  const displayName = computed(() => user.value?.name || user.value?.email || '运动用户')

  pb.authStore.onChange((_token, model) => {
    user.value = toUserRecord(model)
    syncThemeFromUser(user.value)
  })

  // 预留给后续账号密码登录
  const login = async (email: string, password: string) => {
    const auth = await usersCollection().authWithPassword(email, password)
    user.value = toUserRecord(auth.record)
    syncThemeFromUser(user.value)
    return auth
  }

  // 预留给后续账号密码注册
  const register = async (email: string, password: string, name?: string) => {
    const payload: UserCreate = {
      email,
      password,
      passwordConfirm: password,
    }
    if (name) payload.name = name

    const newUser = await usersCollection().create(payload)
    await login(email, password)
    return newUser
  }

  const loginWithGitHub = async () => {
    const collection = usersCollection() as OAuthRecordService
    const auth = await collection.authWithOAuth2({ provider: 'github' })
    user.value = toUserRecord(auth.record ?? pb.authStore.record)
    syncThemeFromUser(user.value)
    return auth
  }

  const logout = () => {
    pb.authStore.clear()
    user.value = null
  }

  const refresh = async () => {
    if (!pb.authStore.isValid) return
    const fresh = await usersCollection().authRefresh()
    user.value = toUserRecord(fresh.record)
    syncThemeFromUser(user.value)
  }

  const getAvatarUrl = () => {
    if (!user.value?.avatar) return null
    return pb.files.getURL(user.value, user.value.avatar)
  }

  const updateTheme = async (theme: Theme) => {
    if (!user.value) return
    const payload: UserUpdate = { theme: toUserThemeOption(theme) }
    await usersCollection().update(user.value.id, payload)
  }

  return {
    user,
    isLoggedIn,
    displayName,
    login,
    register,
    loginWithGitHub,
    logout,
    refresh,
    getAvatarUrl,
    updateTheme,
  }
})

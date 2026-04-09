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
  authWithOAuth2: (options: { provider: string }) => Promise<{ record?: unknown; meta?: Record<string, unknown> }>
}

const syncThemeFromUser = (user: User | null) => {
  const themeStore = useThemeStore()
  themeStore.initFromUser(user?.theme)
}

const usernameAdjectives = [
  'swift',
  'steady',
  'wild',
  'bright',
  'brisk',
  'golden',
  'silent',
  'rapid',
] as const

const usernameNouns = [
  'trail',
  'summit',
  'stride',
  'comet',
  'river',
  'ember',
  'peak',
  'rider',
] as const

const generatedUsernamePattern = new RegExp(
  `^(${usernameAdjectives.join('|')})-(${usernameNouns.join('|')})-[a-z0-9]{4}$`,
)

const generateRandomUsername = (userId: string) => {
  const adjective = usernameAdjectives[Math.floor(Math.random() * usernameAdjectives.length)]
  const noun = usernameNouns[Math.floor(Math.random() * usernameNouns.length)]
  const suffix = userId.slice(-4).toLowerCase()
  return `${adjective}-${noun}-${suffix}`
}

const normalizeUsername = (value: unknown) => {
  if (typeof value !== 'string') return null

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')

  return normalized || null
}

const getOAuthUsername = (meta?: Record<string, unknown>) => {
  return normalizeUsername(
    meta?.username ??
    meta?.login ??
    meta?.preferred_username ??
    meta?.name ??
    meta?.displayName,
  )
}

const shouldReplaceGeneratedName = (name?: string | null) => {
  return !name?.trim() || generatedUsernamePattern.test(name.trim().toLowerCase())
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)

  const ensureUsername = async (candidate: User | null, oauthMeta?: Record<string, unknown>) => {
    if (!candidate) return candidate

    const oauthUsername = getOAuthUsername(oauthMeta)
    const nextName = shouldReplaceGeneratedName(candidate.name)
      ? (oauthUsername ?? generateRandomUsername(candidate.id))
      : null

    if (!nextName || candidate.name === nextName) return candidate

    const payload: UserUpdate = {
      name: nextName,
    }

    const updated = await usersCollection().update(candidate.id, payload)
    user.value = toUserRecord(updated)
    syncThemeFromUser(user.value)
    return user.value
  }

  if (pb.authStore.isValid && pb.authStore.record) {
    user.value = toUserRecord(pb.authStore.record)
    syncThemeFromUser(user.value)
    void ensureUsername(user.value)
  }

  const isLoggedIn = computed(() => !!user.value && pb.authStore.isValid)
  const displayName = computed(() => user.value?.name || user.value?.email || '运动用户')

  pb.authStore.onChange((_token, model) => {
    user.value = toUserRecord(model)
    syncThemeFromUser(user.value)
    void ensureUsername(user.value)
  })

  // 预留给后续账号密码登录
  const login = async (email: string, password: string) => {
    const auth = await usersCollection().authWithPassword(email, password)
    user.value = toUserRecord(auth.record)
    syncThemeFromUser(user.value)
    await ensureUsername(user.value)
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
    await ensureUsername(user.value, auth.meta)
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
    await ensureUsername(user.value)
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

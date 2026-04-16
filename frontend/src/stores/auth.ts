import type { User } from '@/types/api'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, clearAccessToken, setAccessToken } from '@/lib/api'
import { isUser } from '@/types/api'

const toUserRecord = (value: unknown): User | null => {
  return isUser(value) ? value : null
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
  // eslint-disable-next-line regexp/no-unused-capturing-group
  `^(${usernameAdjectives.join('|')})-(${usernameNouns.join('|')})-[a-z0-9]{4}$`,
)

const generateRandomUsername = (userId: string) => {
  const adjective = usernameAdjectives[Math.floor(Math.random() * usernameAdjectives.length)]
  const noun = usernameNouns[Math.floor(Math.random() * usernameNouns.length)]
  const suffix = userId.slice(-4).toLowerCase()
  return `${adjective}-${noun}-${suffix}`
}

const normalizeUsername = (value: unknown) => {
  if (typeof value !== 'string') { return null }

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
    meta?.username
    ?? meta?.login
    ?? meta?.preferred_username
    ?? meta?.name
    ?? meta?.displayName,
  )
}

const shouldReplaceGeneratedName = (name?: string | null) => {
  return !name?.trim() || generatedUsernamePattern.test(name.trim().toLowerCase())
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const initialized = ref(false)

  const ensureUsername = async (candidate: User | null, oauthMeta?: Record<string, unknown>) => {
    if (!candidate) { return candidate }

    const oauthUsername = getOAuthUsername(oauthMeta)
    const nextName = shouldReplaceGeneratedName(candidate.name)
      ? (oauthUsername ?? generateRandomUsername(candidate.id))
      : null

    if (!nextName || candidate.name === nextName) { return candidate }

    user.value = {
      ...candidate,
      name: nextName,
    }
    return user.value
  }

  const isLoggedIn = computed(() => !!user.value)
  const isActive = computed(() => user.value?.is_active === true)
  const isAdmin = computed(() => user.value?.is_admin === true)
  const displayName = computed(() => user.value?.name || user.value?.email || '运动用户')

  const initialize = async () => {
    if (initialized.value) { return }

    try {
      const session = await api.auth.getSession()
      if (session.accessToken) {
        setAccessToken(session.accessToken)
      }
      user.value = toUserRecord(session.user)
      await ensureUsername(user.value)
    }
    catch {
      clearAccessToken()
      user.value = null
    }
    finally {
      initialized.value = true
    }
  }

  const refresh = async () => {
    const fresh = await api.auth.getSession()
    if (fresh.accessToken) {
      setAccessToken(fresh.accessToken)
    }
    user.value = toUserRecord(fresh.user)
    await ensureUsername(user.value)
    initialized.value = true
  }

  const consumeAccessToken = async (token: string) => {
    setAccessToken(token)
    initialized.value = false
    await refresh()
  }

  const loginWithGitHub = async (redirectTo?: string) => {
    const result = await api.auth.startGitHub(redirectTo)
    if (typeof window !== 'undefined') {
      window.location.assign(result.url)
    }
  }

  const logout = async () => {
    try {
      await api.auth.logout()
    }
    catch {
      // noop
    }
    clearAccessToken()
    user.value = null
  }

  const getAvatarUrl = () => {
    return user.value?.avatar_url || null
  }

  return {
    user,
    initialized,
    isLoggedIn,
    isActive,
    isAdmin,
    displayName,
    initialize,
    consumeAccessToken,
    loginWithGitHub,
    logout,
    refresh,
    getAvatarUrl,
  }
})

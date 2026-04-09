import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { pb, stravaConnectionsCollection } from '@/lib/pocketbase'
import { useAuthStore } from '@/stores/auth'
import { isStravaConnection, type StravaConnection, type StravaConnectionStatus } from '@/types/pocketbase'

export type StravaUiStatus =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'reauthorization_required'
  | 'error'

const statusLabelMap: Record<StravaUiStatus, string> = {
  not_connected: '未连接 Strava',
  connecting: '连接中',
  connected: '已连接 Strava',
  syncing: '正在同步活动',
  reauthorization_required: '需要重新授权',
  error: '连接异常',
}

const mapRecordStatusToUi = (status: StravaConnectionStatus | undefined): StravaUiStatus => {
  if (!status) return 'not_connected'
  if (status === 'reauthorization_required') return 'reauthorization_required'
  if (status === 'revoked' || status === 'expired') return 'error'
  if (status === 'active') return 'connected'
  return 'not_connected'
}

export const useStravaStore = defineStore('strava', () => {
  const auth = useAuthStore()
  const connection = ref<StravaConnection | null>(null)
  const loading = ref(false)
  const connecting = ref(false)
  const error = ref<string | null>(null)

  const status = computed<StravaUiStatus>(() => {
    if (!auth.isLoggedIn) return 'not_connected'
    if (connecting.value) return 'connecting'
    return mapRecordStatusToUi(connection.value?.status)
  })

  const statusLabel = computed(() => statusLabelMap[status.value])
  const lastSyncAt = computed(() => connection.value?.last_sync_at ?? null)
  const canConnect = computed(() => {
    return status.value === 'not_connected' || status.value === 'error' || status.value === 'reauthorization_required'
  })

  const startConnection = async () => {
    if (typeof window === 'undefined') return

    error.value = null
    connecting.value = true

    try {
      const result = await pb.send<{ url?: string }>('/api/integrations/strava/connect', {
        method: 'POST',
      })

      if (!result?.url) {
        throw new Error('Missing Strava authorize url')
      }

      window.location.assign(result.url)
    } catch (value) {
      console.error(value)
      error.value = '发起 Strava 连接失败'
      connecting.value = false
    }
  }

  const fetchConnection = async () => {
    if (!auth.isLoggedIn) {
      connection.value = null
      return
    }

    loading.value = true
    error.value = null

    try {
      const result = await stravaConnectionsCollection().getList(1, 1, {
        filter: 'provider = "strava"',
        sort: '-created',
      })
      const [firstConnection] = result.items
      connection.value = firstConnection && isStravaConnection(firstConnection) ? firstConnection : null
    } catch (value) {
      console.error(value)
      connection.value = null
      error.value = '读取 Strava 连接状态失败'
    } finally {
      loading.value = false
    }
  }

    return {
    connection,
    loading,
    connecting,
    error,
    status,
    statusLabel,
    lastSyncAt,
    canConnect,
    startConnection,
    fetchConnection,
  }
})

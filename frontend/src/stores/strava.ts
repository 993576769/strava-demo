import type { StravaConnection, StravaConnectionStatus } from '@/types/pocketbase'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { pb } from '@/lib/pocketbase'
import { useAuthStore } from '@/stores/auth'
import { isStravaConnection } from '@/types/pocketbase'

export type StravaUiStatus
  = | 'not_connected'
    | 'connecting'
    | 'connected'
    | 'syncing'
    | 'reauthorization_required'
    | 'error'

interface StravaSyncStats {
  fetched: number
  created: number
  updated: number
  ready: number
  partial: number
  generatable: number
  failed: number
}

const statusLabelMap: Record<StravaUiStatus, string> = {
  not_connected: '未连接 Strava',
  connecting: '连接中',
  connected: '已连接 Strava',
  syncing: '正在同步活动',
  reauthorization_required: '需要重新授权',
  error: '连接异常',
}

const mapRecordStatusToUi = (status: StravaConnectionStatus | undefined): StravaUiStatus => {
  if (!status) { return 'not_connected' }
  if (status === 'reauthorization_required') { return 'reauthorization_required' }
  if (status === 'revoked' || status === 'expired') { return 'error' }
  if (status === 'active') { return 'connected' }
  return 'not_connected'
}

export const useStravaStore = defineStore('strava', () => {
  const auth = useAuthStore()
  const queryCache = useQueryCache()
  const syncSummary = ref<StravaSyncStats | null>(null)
  const connecting = ref(false)

  const connectionQuery = useQuery<StravaConnection | null, Error>({
    key: () => ['strava', 'connection', auth.user?.id ?? '__guest__'],
    enabled: computed(() => auth.isLoggedIn),
    query: async () => {
      const result = await pb.send<{ connection?: unknown }>('/api/integrations/strava/status', {
        method: 'GET',
      })

      return result.connection && isStravaConnection(result.connection) ? result.connection : null
    },
    refetchOnWindowFocus: false,
  })

  const syncMutation = useMutation<{ connection: StravaConnection | null, stats: StravaSyncStats | null }, void, Error>({
    mutation: async () => {
      const result = await pb.send<{
        connection?: unknown
        stats?: StravaSyncStats
      }>('/api/integrations/strava/sync', {
        method: 'POST',
      })

      return {
        connection: result.connection && isStravaConnection(result.connection) ? result.connection : null,
        stats: result.stats ?? null,
      }
    },
    onSuccess: ({ connection, stats }) => {
      syncSummary.value = stats

      if (connection !== null) {
        queryCache.setQueryData(['strava', 'connection', auth.user?.id ?? '__guest__'], connection)
      }
      else {
        void connectionQuery.refetch()
      }
    },
  })

  const disconnectMutation = useMutation<boolean, void, Error>({
    mutation: async () => {
      await pb.send('/api/integrations/strava/disconnect', {
        method: 'POST',
      })
      return true
    },
    onSuccess: () => {
      queryCache.setQueryData(['strava', 'connection', auth.user?.id ?? '__guest__'], null)
      syncSummary.value = null
    },
  })

  const connection = computed(() => (auth.isLoggedIn ? (connectionQuery.data.value ?? null) : null))
  const loading = computed(() => auth.isLoggedIn && connectionQuery.isLoading.value)
  const syncing = computed(() => syncMutation.isLoading.value)
  const disconnecting = computed(() => disconnectMutation.isLoading.value)
  const error = computed(() => {
    if (disconnectMutation.error.value) { return disconnectMutation.error.value.message || '断开 Strava 连接失败' }

    if (syncMutation.error.value) { return syncMutation.error.value.message || '同步 Strava 活动失败' }

    if (connectionQuery.error.value) { return '读取 Strava 连接状态失败' }

    return null
  })

  const status = computed<StravaUiStatus>(() => {
    if (!auth.isLoggedIn) { return 'not_connected' }
    if (connecting.value) { return 'connecting' }
    if (syncing.value) { return 'syncing' }
    return mapRecordStatusToUi(connection.value?.status)
  })

  const statusLabel = computed(() => statusLabelMap[status.value])
  const lastSyncAt = computed(() => connection.value?.last_sync_at ?? null)
  const athleteLabel = computed(() => connection.value?.strava_username || connection.value?.strava_athlete_id || '')
  const lastErrorMessage = computed(() => connection.value?.last_error_message || '')
  const needsReauthorization = computed(() => status.value === 'reauthorization_required')
  const hasConnectionIssue = computed(() => status.value === 'error' || status.value === 'reauthorization_required')
  const canConnect = computed(() => {
    return status.value === 'not_connected' || status.value === 'error' || status.value === 'reauthorization_required'
  })
  const canSync = computed(() => {
    return !!connection.value && connection.value.status === 'active' && !syncing.value && !connecting.value
  })
  const canDisconnect = computed(() => !!connection.value && !disconnecting.value && !connecting.value && !syncing.value)

  const startConnection = async () => {
    if (typeof window === 'undefined') { return }

    connecting.value = true

    try {
      const result = await pb.send<{ url?: string }>('/api/integrations/strava/connect', {
        method: 'POST',
      })

      if (!result?.url) { throw new Error('Missing Strava authorize url') }

      window.location.assign(result.url)
    }
    catch (value) {
      console.error(value)
      connecting.value = false
    }
  }

  const fetchConnection = async () => {
    if (!auth.isLoggedIn) { return }
    await connectionQuery.refetch()
  }

  const runSync = async () => {
    if (!auth.isLoggedIn) { return null }

    syncSummary.value = null

    try {
      const result = await syncMutation.mutateAsync()
      return result.stats
    }
    catch (value) {
      console.error(value)
      return null
    }
  }

  const disconnect = async () => {
    if (!auth.isLoggedIn) { return false }

    try {
      return await disconnectMutation.mutateAsync()
    }
    catch (value) {
      console.error(value)
      return false
    }
  }

  return {
    connection,
    loading,
    connecting,
    syncing,
    disconnecting,
    error,
    syncSummary,
    status,
    statusLabel,
    athleteLabel,
    lastErrorMessage,
    needsReauthorization,
    hasConnectionIssue,
    lastSyncAt,
    canConnect,
    canSync,
    canDisconnect,
    startConnection,
    fetchConnection,
    runSync,
    disconnect,
  }
})

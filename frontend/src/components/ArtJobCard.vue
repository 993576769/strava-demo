<script setup lang="ts">
import type { ArtJobWithResult } from '@/stores/art-jobs'
import { formatArtPromptTemplateLabel } from '@/lib/art-prompt-templates'
import { cn } from '@/lib/utils'

defineProps<{
  job: ArtJobWithResult
  isActive?: boolean
}>()

const emit = defineEmits<{
  openResult: [id: string]
}>()

const formatDateTime = (value: string) => {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const jobStatusLabel = (status: string) => {
  switch (status) {
    case 'pending':
      return '排队中'
    case 'processing':
      return '生成中'
    case 'succeeded':
      return '已完成'
    case 'failed':
      return '失败'
    case 'canceled':
      return '已取消'
    default:
      return status
  }
}

const jobStatusClass = (status: string) => {
  switch (status) {
    case 'succeeded':
      return cn('bg-emerald-500/12 text-emerald-600')
    case 'failed':
      return cn('bg-red-500/12 text-red-500')
    default:
      return cn('bg-primary/10 text-primary')
  }
}

const getJobTimestamp = (job: { queued_at?: string, started_at?: string, finished_at?: string }) => {
  return job.queued_at || job.started_at || job.finished_at || ''
}
</script>

<template>
  <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-4">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="min-w-0 text-sm font-semibold break-words text-[var(--color-text)]">{{ formatArtPromptTemplateLabel(job.style_preset) }}</span>
          <span
            class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
            :class="jobStatusClass(job.status)"
          >
            {{ jobStatusLabel(job.status) }}
          </span>
          <span v-if="isActive" class="inline-flex items-center rounded-full bg-amber-500/12 px-2.5 py-1 text-xs font-medium text-amber-600">
            当前活动中的任务
          </span>
        </div>
        <p class="mt-2 text-sm text-[var(--color-text-muted)]">
          排队时间：{{ getJobTimestamp(job) ? formatDateTime(getJobTimestamp(job)) : '暂无时间信息' }}
        </p>
        <p v-if="job.error_message" class="mt-2 text-sm text-red-500">
          {{ job.error_message }}
        </p>
      </div>

      <div class="flex w-full flex-col gap-3 sm:w-auto sm:max-w-56 sm:min-w-56">
        <button
          v-if="job.result"
          type="button"
          class="overflow-hidden rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] text-left transition hover:border-primary/40"
          @click="emit('openResult', job.result.id)"
        >
          <img
            :src="job.result.thumbnail_data_uri || job.result.image_data_uri"
            :alt="job.result.title_snapshot || 'Job result preview'"
            class="h-36 w-full object-cover"
          >
          <div class="border-t border-[var(--color-border)]/60 px-3 py-2 text-xs text-[var(--color-text-muted)]">
            查看生成图片
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

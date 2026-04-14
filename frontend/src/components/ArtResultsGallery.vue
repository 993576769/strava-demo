<script setup lang="ts">
import type { ArtResult } from '@/types/pocketbase'
import { ExternalLink, Loader2 } from 'lucide-vue-next'
import { formatArtPromptTemplateLabel } from '@/lib/art-prompt-templates'

withDefaults(defineProps<{
  results: ArtResult[]
  loading?: boolean
  loadingMore?: boolean
  emptyMessage?: string
  showViewAll?: boolean
  canLoadMore?: boolean
  viewAllLabel?: string
  loadMoreLabel?: string
}>(), {
  loading: false,
  loadingMore: false,
  emptyMessage: '还没有成品结果。',
  showViewAll: false,
  canLoadMore: false,
  viewAllLabel: '查看更多',
  loadMoreLabel: '加载更多',
})

const emit = defineEmits<{
  open: [id: string]
  viewAll: []
  loadMore: []
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
</script>

<template>
  <div v-if="loading && results.length === 0" class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/50 px-4 py-4 text-sm text-[var(--color-text-muted)]">
    正在读取结果列表...
  </div>

  <div v-else-if="results.length === 0" class="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-elevated)]/35 px-4 py-5 text-sm text-[var(--color-text-muted)]">
    {{ emptyMessage }}
  </div>

  <div v-else class="grid gap-5">
    <div class="grid gap-4 md:grid-cols-2">
      <button
        v-for="result in results"
        :key="result.id"
        type="button"
        class="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-4 text-left transition hover:border-primary/40"
        @click="emit('open', result.id)"
      >
        <img
          :src="result.thumbnail_data_uri || result.image_data_uri"
          :alt="result.title_snapshot || 'Art result thumbnail'"
          class="h-52 w-full rounded-[18px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] object-cover"
        >

        <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-[var(--color-text)]">
              {{ result.title_snapshot || 'Untitled result' }}
            </p>
            <p class="mt-2 line-clamp-2 text-sm text-[var(--color-text-muted)]">
              {{ result.subtitle_snapshot || '暂无副标题' }}
            </p>
            <p class="mt-3 text-xs text-[var(--color-text-muted)]">
              {{ formatDateTime(result.created) }}
            </p>
          </div>
          <span class="inline-flex max-w-full items-center self-start rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium break-all text-primary">
            {{ formatArtPromptTemplateLabel(result.style_preset) }}
          </span>
        </div>

        <div class="mt-4 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          查看详情
          <ExternalLink class="h-4 w-4" />
        </div>
      </button>
    </div>

    <div v-if="showViewAll || canLoadMore" class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <button
        v-if="showViewAll"
        type="button"
        class="btn btn-ghost w-full justify-center sm:w-auto"
        @click="emit('viewAll')"
      >
        {{ viewAllLabel }}
      </button>

      <button
        v-if="canLoadMore"
        type="button"
        class="btn btn-primary w-full justify-center sm:ml-auto sm:w-auto"
        :disabled="loadingMore"
        @click="emit('loadMore')"
      >
        <Loader2 v-if="loadingMore" class="mr-2 h-4 w-4 animate-spin" />
        {{ loadingMore ? '正在加载...' : loadMoreLabel }}
      </button>
    </div>
  </div>
</template>

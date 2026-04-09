<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Download, Image as ImageIcon, Sparkles } from 'lucide-vue-next'
import { useArtResultsStore } from '@/stores/art-results'

const route = useRoute()
const router = useRouter()
const artResultsStore = useArtResultsStore()

const resultId = computed(() => String(route.params.id ?? ''))
const result = computed(() => artResultsStore.currentResult)
const providerLabel = computed(() => {
  const metadata = result.value?.metadata_json
  if (!metadata || typeof metadata !== 'object') return '生成结果'

  const provider = 'provider' in metadata ? metadata.provider : undefined
  if (provider === 'jimeng46') return '即梦 4.6'

  const renderer = 'renderer' in metadata ? metadata.renderer : undefined
  if (renderer === 'mock-svg-v1') return 'Mock SVG'

  return '生成结果'
})
const downloadLabel = computed(() => {
  if (providerLabel.value === '即梦 4.6')
    return '下载结果图'

  return '下载 Mock SVG'
})

const formatDateTime = (value: string) => {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const downloadImage = () => {
  if (typeof window === 'undefined' || !result.value?.image_data_uri) return

  const link = document.createElement('a')
  link.href = result.value.image_data_uri
  const extension = result.value.mime_type === 'image/svg+xml' ? 'svg' : 'png'
  link.download = `${result.value.style_preset}-${result.value.id}.${extension}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

watch(resultId, async () => {
  if (resultId.value) {
    await artResultsStore.fetchResultById(resultId.value)
  }
}, { immediate: true })

onUnmounted(() => {
  artResultsStore.clear()
})
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(180deg,_rgba(79,70,229,0.06),_transparent_24%),var(--bg)]">
    <main class="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <button class="btn btn-ghost" @click="router.back()">
          <ArrowLeft class="w-4 h-4 mr-2" />
          返回上一页
        </button>

        <button v-if="result?.image_data_uri" class="btn btn-primary" @click="downloadImage">
          <Download class="w-4 h-4 mr-2" />
          {{ downloadLabel }}
        </button>
      </div>

      <section v-if="artResultsStore.detailLoading" class="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-6 text-sm text-[var(--color-text-muted)]">
        正在读取结果详情...
      </section>

      <section v-else-if="!result" class="rounded-[28px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-card)]/80 p-8 text-center">
        <h1 class="text-xl font-semibold text-[var(--color-text)]">未找到生成结果</h1>
        <p class="mt-3 text-[var(--color-text-muted)]">这条结果可能还没生成成功，或者记录不存在。</p>
      </section>

      <section v-else class="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
        <article class="rounded-[32px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-4 sm:p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <img
            :src="result.image_data_uri"
            :alt="result.title_snapshot || 'Art result'"
            class="w-full rounded-[24px] border border-[var(--color-border)]/60 bg-[var(--color-surface-elevated)] object-cover"
          />
        </article>

        <aside class="grid gap-4">
          <section class="rounded-[28px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div class="flex items-start gap-3">
              <ImageIcon class="w-5 h-5 mt-1 text-primary shrink-0" />
              <div>
                <h1 class="text-xl font-semibold text-[var(--color-text)]">{{ result.title_snapshot || 'Art Result' }}</h1>
                <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                  {{ result.subtitle_snapshot || '暂无副标题' }}
                </p>
              </div>
            </div>

            <div class="mt-6 grid gap-3">
              <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-4">
                <p class="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Renderer</p>
                <p class="mt-2 text-sm font-medium text-[var(--color-text)]">{{ providerLabel }}</p>
              </div>

              <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-4">
                <p class="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">尺寸</p>
                <p class="mt-2 text-sm font-medium text-[var(--color-text)]">{{ result.width }} × {{ result.height }}</p>
              </div>

              <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-4">
                <p class="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">创建时间</p>
                <p class="mt-2 text-sm font-medium text-[var(--color-text)]">{{ formatDateTime(result.created) }}</p>
              </div>
            </div>
          </section>

          <section class="rounded-[28px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div class="flex items-start gap-3">
              <Sparkles class="w-5 h-5 mt-1 text-primary shrink-0" />
              <div>
                <h2 class="text-base font-semibold text-[var(--color-text)]">当前阶段说明</h2>
                <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                  当前结果页会复用同一套任务与详情结构。如果后端已配置即梦 4.6，这里展示的就是远端生成结果；否则会自动回退到 mock SVG。
                </p>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  </div>
</template>

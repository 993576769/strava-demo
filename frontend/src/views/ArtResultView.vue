<script setup lang="ts">
import { Download, Image as ImageIcon, Sparkles } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { formatArtPromptTemplateLabel } from '@/lib/art-prompt-templates'
import { useArtResultsStore } from '@/stores/art-results'

const route = useRoute()
const artResultsStore = useArtResultsStore()

const resultId = computed(() => String(route.params.id ?? ''))
const result = computed(() => artResultsStore.currentResult)
const providerLabel = computed(() => {
  const metadata = result.value?.metadata_json
  if (!metadata || typeof metadata !== 'object') { return '生成结果' }

  const provider = 'provider' in metadata ? metadata.provider : undefined
  if (provider === 'doubao-seedream') { return 'Doubao Seedream 5.0' }

  return '生成结果'
})
const downloadLabel = computed(() => {
  return '下载结果图'
})
const isPreviewOpen = ref(false)
const previewTitle = computed(() => result.value?.title_snapshot || 'Art result')

const downloadImage = () => {
  if (typeof window === 'undefined' || !result.value?.image_data_uri) { return }

  const link = document.createElement('a')
  link.href = result.value.image_data_uri
  const extension = result.value.mime_type === 'image/svg+xml' ? 'svg' : 'png'
  link.download = `${formatArtPromptTemplateLabel(result.value.style_preset)}-${result.value.id}.${extension}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const openPreview = () => {
  if (!result.value?.image_data_uri) { return }
  isPreviewOpen.value = true
}

const closePreview = () => {
  isPreviewOpen.value = false
}

const handleWindowKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closePreview()
  }
}

watch(resultId, async () => {
  if (resultId.value) {
    await artResultsStore.fetchResultById(resultId.value)
  }
}, { immediate: true })

watch(resultId, () => {
  closePreview()
})

watch(result, () => {
  closePreview()
})

watch(isPreviewOpen, (open) => {
  if (typeof document === 'undefined') { return }
  document.body.style.overflow = open ? 'hidden' : ''
})

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleWindowKeydown)
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleWindowKeydown)
  }
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
  }
  artResultsStore.clearDetail()
})
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(180deg,_rgba(79,70,229,0.06),_transparent_24%),var(--bg)]">
    <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div class="mb-6 flex flex-wrap items-center justify-end gap-4">
        <button v-if="result?.image_data_uri" class="btn btn-primary" @click="downloadImage">
          <Download class="mr-2 h-4 w-4" />
          {{ downloadLabel }}
        </button>
      </div>

      <section v-if="artResultsStore.detailLoading" class="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-6 text-sm text-[var(--color-text-muted)]">
        正在读取结果详情...
      </section>

      <section v-else-if="!result" class="rounded-[28px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-card)]/80 p-8 text-center">
        <h1 class="text-xl font-semibold text-[var(--color-text)]">
          未找到生成结果
        </h1>
        <p class="mt-3 text-[var(--color-text-muted)]">
          这条结果可能还没生成成功，或者记录不存在。
        </p>
      </section>

      <section v-else class="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
        <article class="rounded-4xl border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
          <button
            type="button"
            class="group block w-full cursor-zoom-in text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            @click="openPreview"
          >
            <img
              :src="result.image_data_uri"
              :alt="result.title_snapshot || 'Art result'"
              class="w-full rounded-3xl border border-[var(--color-border)]/60 bg-[var(--color-surface-elevated)] object-cover transition group-hover:border-primary/40"
            >
            <p class="mt-3 text-sm text-[var(--color-text-muted)]">
              点击图片可放大预览
            </p>
          </button>
        </article>

        <aside class="grid gap-4">
          <section class="rounded-[28px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div class="flex items-start gap-3">
              <ImageIcon class="mt-1 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h1 class="text-xl font-semibold text-[var(--color-text)]">
                  {{ result.title_snapshot || 'Art Result' }}
                </h1>
                <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                  {{ result.subtitle_snapshot || '暂无副标题' }}
                </p>
              </div>
            </div>

            <div class="mt-6 grid gap-3">
              <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-4">
                <p class="text-xs tracking-[0.2em] text-[var(--color-text-muted)] uppercase">
                  Renderer
                </p>
                <p class="mt-2 text-sm font-medium text-[var(--color-text)]">
                  {{ providerLabel }}
                </p>
              </div>

              <div class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/45 p-4">
                <p class="text-xs tracking-[0.2em] text-[var(--color-text-muted)] uppercase">
                  尺寸
                </p>
                <p class="mt-2 text-sm font-medium text-[var(--color-text)]">
                  {{ result.width }} × {{ result.height }}
                </p>
              </div>
            </div>
          </section>

          <section class="rounded-[28px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div class="flex items-start gap-3">
              <Sparkles class="mt-1 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h2 class="text-base font-semibold text-[var(--color-text)]">
                  当前阶段说明
                </h2>
                <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                  当前结果页会复用同一套任务与详情结构。这里展示的是 Doubao Seedream 5.0 产出的最终结果图。
                </p>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>

    <Teleport to="body">
      <div
        v-if="isPreviewOpen && result?.image_data_uri"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/88 px-4 py-6"
        @click.self="closePreview"
      >
        <div class="relative flex max-h-full w-full max-w-7xl flex-col gap-3">
          <div class="flex items-center justify-between gap-3 text-white">
            <p class="min-w-0 truncate text-sm font-medium">
              {{ previewTitle }}
            </p>
            <button
              type="button"
              class="rounded-full border border-white/20 px-3 py-1.5 text-sm transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              @click="closePreview"
            >
              关闭
            </button>
          </div>

          <div class="flex min-h-0 items-center justify-center overflow-auto rounded-[28px] border border-white/10 bg-black/20 p-2 sm:p-4">
            <img
              :src="result.image_data_uri"
              :alt="previewTitle"
              class="max-h-[82vh] w-auto max-w-full rounded-2xl object-contain"
            >
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

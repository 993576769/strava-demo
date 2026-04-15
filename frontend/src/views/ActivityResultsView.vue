<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ArtResultsGallery from '@/components/ArtResultsGallery.vue'
import { useActivitiesStore } from '@/stores/activities'
import { useArtResultsStore } from '@/stores/art-results'

const route = useRoute()
const router = useRouter()
const activitiesStore = useActivitiesStore()
const artResultsStore = useArtResultsStore()

const activityId = computed(() => String(route.params.id ?? ''))
const activity = computed(() => activitiesStore.currentActivity)
const pageSize = 12

const loadResults = async () => {
  if (!activityId.value) { return }

  await Promise.all([
    activitiesStore.fetchActivityById(activityId.value),
    artResultsStore.fetchResultsForActivity(activityId.value, {
      page: 1,
      perPage: pageSize,
    }),
  ])
}

const loadMore = async () => {
  if (!activityId.value || !artResultsStore.hasMore) { return }

  await artResultsStore.fetchResultsForActivity(activityId.value, {
    page: artResultsStore.currentPage + 1,
    perPage: pageSize,
    append: true,
  })
}

const openResult = (id: string) => {
  router.push({ name: 'art-result-detail', params: { id } })
}

watch(activityId, () => {
  void loadResults()
}, { immediate: true })

onMounted(() => {
  void loadResults()
})

onUnmounted(() => {
  activitiesStore.clearCurrentActivity()
  artResultsStore.clearList()
})
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(180deg,_rgba(79,70,229,0.06),_transparent_24%),var(--bg)]">
    <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <section class="rounded-4xl border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-8">
        <div class="flex items-start gap-3">
          <Sparkles class="mt-1 h-5 w-5 shrink-0 text-primary" />
          <div class="min-w-0 flex-1">
            <h1 class="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
              {{ activity?.name || '活动生成结果' }}
            </h1>
            <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
              这里会按时间倒序展示当前活动的全部生成结果，支持分页继续加载。
            </p>

            <div v-if="artResultsStore.error" class="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
              {{ artResultsStore.error }}
            </div>

            <div class="mt-6">
              <ArtResultsGallery
                :results="artResultsStore.results"
                :loading="artResultsStore.loading"
                :loading-more="artResultsStore.loadingMore"
                :can-load-more="artResultsStore.hasMore"
                empty-message="还没有成品结果。返回活动详情后创建一个任务，这里就会逐页展示出来。"
                load-more-label="加载下一页"
                @open="openResult"
                @load-more="loadMore"
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

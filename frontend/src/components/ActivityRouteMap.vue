<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, Route } from 'lucide-vue-next'

type Point = [number, number]

const props = withDefaults(defineProps<{
  points: unknown
  title?: string
  subtitle?: string
  filename?: string
}>(), {
  title: '',
  subtitle: '',
  filename: 'activity-route',
})

const svgRef = ref<SVGSVGElement | null>(null)
const exporting = ref(false)
const exportError = ref<string | null>(null)

const canvasWidth = 1200
const canvasHeight = 820
const framePaddingX = 120
const framePaddingTop = 180
const framePaddingBottom = 120

const coercePoints = (value: unknown): Point[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((point) => {
      if (Array.isArray(point) && point.length >= 2) {
        const x = Number(point[0])
        const y = Number(point[1])
        if (Number.isFinite(x) && Number.isFinite(y))
          return [x, y] satisfies Point
      }

      if (point && typeof point === 'object' && 'x' in point && 'y' in point) {
        const x = Number(point.x)
        const y = Number(point.y)
        if (Number.isFinite(x) && Number.isFinite(y))
          return [x, y] satisfies Point
      }

      return null
    })
    .filter((point): point is Point => Array.isArray(point))
}

const rawPoints = computed(() => coercePoints(props.points))
const hasEnoughPoints = computed(() => rawPoints.value.length >= 2)

const scaledPoints = computed<Point[]>(() => {
  if (!hasEnoughPoints.value) return []

  const xs = rawPoints.value.map(point => point[0])
  const ys = rawPoints.value.map(point => point[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const dx = Math.max(maxX - minX, 1)
  const dy = Math.max(maxY - minY, 1)
  const usableWidth = canvasWidth - framePaddingX * 2
  const usableHeight = canvasHeight - framePaddingTop - framePaddingBottom

  return rawPoints.value.map(([x, y]) => {
    const scaledX = framePaddingX + ((x - minX) / dx) * usableWidth
    const scaledY = framePaddingTop + ((y - minY) / dy) * usableHeight
    return [scaledX, scaledY]
  })
})

const pathData = computed(() => scaledPoints.value
  .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
  .join(' '))

const startPoint = computed(() => scaledPoints.value[0] ?? null)
const endPoint = computed(() => scaledPoints.value[scaledPoints.value.length - 1] ?? null)
const pointCount = computed(() => rawPoints.value.length)

const waitImageLoad = (image: HTMLImageElement, url: string) => new Promise<void>((resolve, reject) => {
  image.onload = () => resolve()
  image.onerror = () => reject(new Error('Failed to load route image'))
  image.src = url
})

const exportMapImage = async () => {
  if (!svgRef.value || !hasEnoughPoints.value || typeof window === 'undefined')
    return

  exporting.value = true
  exportError.value = null

  try {
    const svgMarkup = new XMLSerializer().serializeToString(svgRef.value)
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()
    await waitImageLoad(image, objectUrl)

    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = canvasWidth * scale
    canvas.height = canvasHeight * scale

    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('Canvas context not available')

    context.scale(scale, scale)
    context.drawImage(image, 0, 0, canvasWidth, canvasHeight)
    URL.revokeObjectURL(objectUrl)

    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `${props.filename}.png`
    link.click()
  } catch (error) {
    console.error(error)
    exportError.value = '导出轨迹图失败'
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <section class="rounded-[32px] border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="flex items-start gap-3">
        <Route class="w-5 h-5 mt-1 text-primary shrink-0" />
        <div>
          <h2 class="text-base font-semibold text-[var(--color-text)]">轨迹图预览</h2>
          <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
            这张图直接基于本地 `activity_streams.normalized_path_json` 绘制，后面可以继续作为即梦风格化的底稿。
          </p>
        </div>
      </div>

      <button class="btn btn-ghost" :disabled="!hasEnoughPoints || exporting" @click="exportMapImage">
        <Download class="w-4 h-4 mr-2" />
        {{ exporting ? '正在导出...' : '导出轨迹图 PNG' }}
      </button>
    </div>

    <div v-if="!hasEnoughPoints" class="mt-5 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-elevated)]/35 px-4 py-5 text-sm text-[var(--color-text-muted)]">
      当前活动还没有足够的轨迹点，暂时无法绘制轨迹图。
    </div>

    <div v-else class="mt-5">
      <svg
        ref="svgRef"
        :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`"
        class="w-full rounded-[28px] border border-[var(--color-border)]/60 bg-[linear-gradient(180deg,_#f8f2e7,_#f1e7d7)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
        role="img"
        :aria-label="title || 'Activity route map'"
      >
        <defs>
          <pattern id="route-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(122,91,52,0.08)" stroke-width="1" />
          </pattern>
          <filter id="paper-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0 0.05" />
            </feComponentTransfer>
          </filter>
        </defs>

        <rect width="100%" height="100%" fill="#f7eddc" />
        <rect width="100%" height="100%" fill="url(#route-grid)" />
        <rect width="100%" height="100%" fill="#f3ebde" filter="url(#paper-noise)" />
        <rect x="52" y="52" width="1096" height="716" rx="40" fill="rgba(255,250,241,0.78)" stroke="rgba(122,91,52,0.14)" />

        <text x="120" y="110" fill="#b17a3e" font-size="28" font-family="Georgia, serif" letter-spacing="6">
          ROUTE STUDY
        </text>
        <text x="120" y="160" fill="#2c241c" font-size="42" font-family="Georgia, serif" font-weight="700">
          {{ title || 'Untitled Activity' }}
        </text>
        <text x="120" y="196" fill="#6d6358" font-size="24" font-family="ui-sans-serif, system-ui, sans-serif">
          {{ subtitle || `${pointCount} points` }}
        </text>

        <path
          :d="pathData"
          fill="none"
          stroke="rgba(186,126,56,0.2)"
          stroke-width="20"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          :d="pathData"
          fill="none"
          stroke="#2f2924"
          stroke-width="7"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <circle
          v-if="startPoint"
          :cx="startPoint[0]"
          :cy="startPoint[1]"
          r="12"
          fill="#c68a3f"
        />
        <circle
          v-if="endPoint"
          :cx="endPoint[0]"
          :cy="endPoint[1]"
          r="10"
          fill="#2f2924"
        />

        <text x="120" y="726" fill="#786f63" font-size="20" font-family="ui-sans-serif, system-ui, sans-serif">
          Export-ready route base for stylization
        </text>
      </svg>
    </div>

    <p v-if="exportError" class="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
      {{ exportError }}
    </p>
  </section>
</template>

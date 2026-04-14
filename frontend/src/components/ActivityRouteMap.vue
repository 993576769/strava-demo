<script setup lang="ts">
import { Download, Route } from 'lucide-vue-next'

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'

type LatLngTuple = [number, number]

const props = withDefaults(defineProps<{
  encodedPolyline?: string
  points?: unknown | null
  title?: string
  subtitle?: string
  filename?: string
}>(), {
  encodedPolyline: '',
  title: '',
  subtitle: '',
  filename: 'activity-route',
})

const exportMimeType = 'image/png'
const exportFileExtension = 'png'

const mapContainer = ref<HTMLDivElement | null>(null)
const exporting = ref(false)
const exportError = ref<string | null>(null)

let map: any = null
let leaflet: any = null
let polylineCodec: any = null
let leafletImage: any = null
let polylineLayer: any = null
let librariesLoaded = false

const parsePointSource = (value: unknown): unknown[] => {
  if (Array.isArray(value)) { return value }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    }
    catch {
      return []
    }
  }

  return []
}

const normalizePointTuple = (value: unknown): LatLngTuple | null => {
  if (!Array.isArray(value) || value.length < 2) { return null }

  const first = Number(value[0])
  const second = Number(value[1])
  if (!Number.isFinite(first) || !Number.isFinite(second)) { return null }

  const firstLooksLikeLatitude = Math.abs(first) <= 90
  const secondLooksLikeLatitude = Math.abs(second) <= 90
  const firstLooksLikeLongitude = Math.abs(first) <= 180
  const secondLooksLikeLongitude = Math.abs(second) <= 180

  if (firstLooksLikeLatitude && secondLooksLikeLongitude && (!firstLooksLikeLongitude || Math.abs(second) > 90)) { return [first, second] }

  if (secondLooksLikeLatitude && firstLooksLikeLongitude) { return [second, first] }

  return [first, second]
}

const fallbackLatLngs = computed<LatLngTuple[]>(() => {
  return parsePointSource(props.points)
    .map(normalizePointTuple)
    .filter((point): point is LatLngTuple => Array.isArray(point))
})

const pointCount = computed(() => fallbackLatLngs.value.length)
const hasFallbackPoints = computed(() => fallbackLatLngs.value.length >= 2)
const hasEncodedPolyline = computed(() => props.encodedPolyline.trim().length > 0)
const canRenderRoute = computed(() => hasEncodedPolyline.value || hasFallbackPoints.value)

const decodePolyline = (encoded: string): LatLngTuple[] => {
  if (!polylineCodec) { return [] }

  return polylineCodec.decode(encoded) as LatLngTuple[]
}

const getLatLngs = (): LatLngTuple[] => {
  if (hasEncodedPolyline.value) {
    try {
      const decoded = decodePolyline(props.encodedPolyline.trim())
      if (decoded.length >= 2) { return decoded }
    }
    catch {
      // fall through to fallback points
    }
  }

  return fallbackLatLngs.value
}

const loadLibraries = async () => {
  if (librariesLoaded) { return }

  const [leafletModule, polylineModule, leafletImageModule] = await Promise.all([
    import('leaflet'),
    import('@mapbox/polyline'),
    import('leaflet-image'),
  ])

  leaflet = leafletModule.default ?? leafletModule
  polylineCodec = polylineModule.default ?? polylineModule
  leafletImage = leafletImageModule.default ?? leafletImageModule
  librariesLoaded = true
}

const ensureMap = async () => {
  if (map || !mapContainer.value) { return }

  await loadLibraries()

  map = leaflet.map(mapContainer.value, {
    attributionControl: false,
    dragging: false,
    preferCanvas: true,
    scrollWheelZoom: false,
    zoomControl: false,
  })

  leaflet.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    crossOrigin: true,
    maxZoom: 19,
  }).addTo(map)
}

const renderRoute = async () => {
  if (!mapContainer.value || typeof window === 'undefined') { return }

  exportError.value = null
  await ensureMap()

  if (!map) { return }

  const latLngs = getLatLngs()
  if (latLngs.length < 2) {
    if (polylineLayer) {
      map.removeLayer(polylineLayer)
      polylineLayer = null
    }
    return
  }

  if (!polylineLayer) {
    polylineLayer = leaflet.polyline(latLngs, {
      color: '#111827',
      lineCap: 'round',
      lineJoin: 'round',
      opacity: 0.9,
      renderer: leaflet.canvas(),
      weight: 5,
    }).addTo(map)
  }
  else {
    polylineLayer.setLatLngs(latLngs)
  }

  map.fitBounds(polylineLayer.getBounds(), {
    padding: [24, 24],
  })
}

const buildImageDataUrl = async () => {
  if (!canRenderRoute.value) { return null }

  await renderRoute()

  if (!map || !leafletImage) { return null }

  return new Promise<string | null>((resolve, reject) => {
    leafletImage(map, (error: unknown, canvas: HTMLCanvasElement) => {
      if (error) {
        reject(error)
        return
      }

      const scale = 2
      const hdCanvas = document.createElement('canvas')
      hdCanvas.width = canvas.width * scale
      hdCanvas.height = canvas.height * scale
      const context = hdCanvas.getContext('2d')

      if (!context) {
        reject(new Error('Canvas context not available'))
        return
      }

      context.scale(scale, scale)
      context.drawImage(canvas, 0, 0)
      resolve(hdCanvas.toDataURL(exportMimeType))
    })
  })
}

const exportMapImage = async () => {
  exporting.value = true
  exportError.value = null

  try {
    const dataUrl = await buildImageDataUrl()
    if (!dataUrl) { return }

    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${props.filename}.${exportFileExtension}`
    link.click()
  }
  catch (error) {
    console.error(error)
    exportError.value = '导出轨迹图失败'
  }
  finally {
    exporting.value = false
  }
}

onMounted(() => {
  void renderRoute()
})

watch(() => [props.encodedPolyline, props.points], () => {
  void renderRoute()
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})

defineExpose({
  exportPngDataUrl: buildImageDataUrl,
  exportJpgDataUrl: buildImageDataUrl,
})
</script>

<template>
  <section class="rounded-4xl border border-(--color-border)/60 bg-(--color-surface-card) p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
    <div class="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
      <div class="flex items-start gap-3">
        <Route class="mt-1 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 class="text-base font-semibold text-(--color-text)">
            轨迹图预览
          </h2>
          <p class="mt-2 text-sm leading-7 text-(--color-text-muted)">
            这张图会优先基于 Strava `summary_polyline` 绘制为地图预览，并导出 PNG 底稿。
          </p>
        </div>
      </div>

      <button class="btn btn-ghost w-full justify-center sm:w-auto" :disabled="!canRenderRoute || exporting" @click="exportMapImage">
        <Download class="mr-2 h-4 w-4" />
        {{ exporting ? '正在导出...' : '导出轨迹图 PNG' }}
      </button>
    </div>

    <div v-if="!canRenderRoute" class="mt-5 rounded-2xl border border-dashed border-(--color-border) bg-(--color-surface-elevated)/35 px-4 py-5 text-sm text-(--color-text-muted)">
      当前活动还没有可用的 `summary_polyline` 或轨迹点，暂时无法绘制轨迹图。
    </div>

    <div v-else class="mt-5">
      <div ref="mapContainer" class="h-80 w-full rounded-[28px] border border-(--color-border)/60" />
      <p class="mt-3 text-sm text-(--color-text-muted)">
        {{ subtitle || `${pointCount} points` }}
      </p>
    </div>

    <p v-if="exportError" class="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
      {{ exportError }}
    </p>
  </section>
</template>

<style scoped>
:deep(.leaflet-control-attribution),
:deep(.leaflet-control-zoom) {
  display: none;
}
</style>

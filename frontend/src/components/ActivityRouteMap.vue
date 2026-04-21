<script setup lang="ts">
import type { GeoJSONSource, LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl'
import { Download, Route } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'maplibre-gl/dist/maplibre-gl.css'

type LatLngTuple = [number, number]
type LngLatTuple = [number, number]
type AltitudeValue = number | null
interface SegmentFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: {
      type: 'LineString'
      coordinates: LngLatTuple[]
    }
    properties: {
      altitudeEnd: AltitudeValue
      altitudeStart: AltitudeValue
      color: string
    }
  }>
}

interface ExportImageOptions {
  format?: 'png' | 'jpeg'
  scale?: number
  quality?: number
}

const props = defineProps<{
  encodedPolyline?: string
  points?: unknown | null
  altitudes?: unknown | null
  title?: string
  subtitle?: string
  filename?: string
}>()
const BASEMAP_SOURCE_ID = 'basemap'
const BASEMAP_LAYER_ID = 'basemap-layer'
const TERRAIN_SOURCE_ID = 'terrain-source'
const HILLSHADE_SOURCE_ID = 'hillshade-source'
const HILLSHADE_LAYER_ID = 'hillshade-layer'
const ROUTE_SOURCE_ID = 'activity-route'
const ROUTE_LAYER_ID = 'activity-route-line'
const ROUTE_COLOR = '#ea580c'
const EXPORT_SCALE = 3
const UPLOAD_EXPORT_SCALE = 2
const JPEG_EXPORT_QUALITY = 0.84
const MAPTILER_KEY = (import.meta.env.VITE_MAPTILER_KEY || '').trim()
const MAPTILER_STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(MAPTILER_KEY)}`
  : ''
const EXPORT_SAFE_AREA = {
  top: 0.16,
  right: 0.12,
  bottom: 0.08,
  left: 0.12,
} as const
const PITCH_TOP_COMPENSATION = 0.08
const CAMERA_DOWNWARD_OFFSET = 0.06
const MIN_3D_ELEVATION_RANGE_METERS = 60
const MIN_3D_ELEVATION_PER_KM_METERS = 18

const createMapStyle = () => ({
  version: 8 as const,
  sources: {
    [BASEMAP_SOURCE_ID]: {
      type: 'raster' as const,
      tiles: ['https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}@2x.png'],
      tileSize: 512,
      attribution: '&copy; Stadia Maps &copy; OpenMapTiles &copy; OpenStreetMap contributors',
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: BASEMAP_LAYER_ID,
      type: 'raster' as const,
      source: BASEMAP_SOURCE_ID,
      paint: {
        'raster-resampling': 'nearest' as const,
      },
    },
  ],
})

const PNG_EXPORT_MIME_TYPE = 'image/png'
const JPEG_EXPORT_MIME_TYPE = 'image/jpeg'
const exportFileExtension = 'png'

const mapContainer = ref<HTMLDivElement | null>(null)
const exporting = ref(false)
const exportError = ref<string | null>(null)

let map: MapLibreMap | null = null
let maplibre: typeof import('maplibre-gl') | null = null
let polylineCodec: any = null
let librariesLoaded = false

const parseJsonArray = (value: unknown): unknown[] => {
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

const normalizePointTuple = (value: unknown): LngLatTuple | null => {
  if (!Array.isArray(value) || value.length < 2) { return null }

  const first = Number(value[0])
  const second = Number(value[1])
  if (!Number.isFinite(first) || !Number.isFinite(second)) { return null }

  const firstLooksLikeLatitude = Math.abs(first) <= 90
  const secondLooksLikeLatitude = Math.abs(second) <= 90
  const firstLooksLikeLongitude = Math.abs(first) <= 180
  const secondLooksLikeLongitude = Math.abs(second) <= 180

  if (firstLooksLikeLatitude && secondLooksLikeLongitude && (!firstLooksLikeLongitude || Math.abs(second) > 90)) {
    return [second, first]
  }

  if (secondLooksLikeLatitude && firstLooksLikeLongitude) {
    return [first, second]
  }

  return [second, first]
}

const fallbackCoordinates = computed<LngLatTuple[]>(() => {
  return parseJsonArray(props.points)
    .map(normalizePointTuple)
    .filter((point): point is LngLatTuple => Array.isArray(point))
})

const altitudeValues = computed<AltitudeValue[]>(() => {
  return parseJsonArray(props.altitudes).map((value) => {
    const altitude = Number(value)
    return Number.isFinite(altitude) ? altitude : null
  })
})

const toRadians = (value: number) => (value * Math.PI) / 180

const getDistanceMeters = (start: LngLatTuple, end: LngLatTuple) => {
  const earthRadius = 6371000
  const [startLng, startLat] = start
  const [endLng, endLat] = end
  const deltaLat = toRadians(endLat - startLat)
  const deltaLng = toRadians(endLng - startLng)
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(startLat)) * Math.cos(toRadians(endLat)) * Math.sin(deltaLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadius * c
}

const elevationRange = computed(() => {
  const numericAltitudes = altitudeValues.value.filter((value): value is number => Number.isFinite(value))
  if (numericAltitudes.length < 2) { return 0 }

  return Math.max(...numericAltitudes) - Math.min(...numericAltitudes)
})

const pointCount = computed(() => fallbackCoordinates.value.length)
const hasFallbackPoints = computed(() => fallbackCoordinates.value.length >= 2)
const encodedPolyline = computed(() => props.encodedPolyline ?? '')
const exportFilename = computed(() => props.filename || 'activity-route')
const hasEncodedPolyline = computed(() => encodedPolyline.value.trim().length > 0)
const canRenderRoute = computed(() => hasEncodedPolyline.value || hasFallbackPoints.value)

const decodePolyline = (encoded: string): LatLngTuple[] => {
  if (!polylineCodec) { return [] }

  return polylineCodec.decode(encoded) as LatLngTuple[]
}

const getCoordinates = (): LngLatTuple[] => {
  if (hasEncodedPolyline.value) {
    try {
      const decoded = decodePolyline(encodedPolyline.value.trim())
      if (decoded.length >= 2) {
        return decoded.map(([lat, lng]) => [lng, lat])
      }
    }
    catch {
      // fall through to fallback points
    }
  }

  return fallbackCoordinates.value
}

const routeDistanceKm = computed(() => {
  const coordinates = getCoordinates()
  if (coordinates.length < 2) { return 0 }

  let totalMeters = 0
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index]
    const end = coordinates[index + 1]
    if (!start || !end) { continue }

    totalMeters += getDistanceMeters(start, end)
  }

  return totalMeters / 1000
})

const terrainThreshold = computed(() => {
  return Math.max(
    MIN_3D_ELEVATION_RANGE_METERS,
    routeDistanceKm.value * MIN_3D_ELEVATION_PER_KM_METERS,
  )
})

const shouldUseTerrain = computed(() => elevationRange.value >= terrainThreshold.value)

const buildBounds = (coordinates: LngLatTuple[]): LngLatBoundsLike => {
  const firstCoordinate = coordinates[0]
  if (!firstCoordinate) {
    return [
      [0, 0],
      [0, 0],
    ]
  }

  const [firstLng, firstLat] = firstCoordinate
  let minLng = firstLng
  let maxLng = firstLng
  let minLat = firstLat
  let maxLat = firstLat

  for (const [lng, lat] of coordinates.slice(1)) {
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}

const buildSegmentCollection = (coordinates: LngLatTuple[], altitudes: AltitudeValue[]): SegmentFeatureCollection => {
  const features = coordinates.slice(0, -1).flatMap((start, index) => {
    const end = coordinates[index + 1]
    if (!end) { return [] }

    const altitudeStart = altitudes[index] ?? null
    const altitudeEnd = altitudes[index + 1] ?? altitudeStart

    return [{
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: [start, end],
      },
      properties: {
        altitudeStart,
        altitudeEnd,
        color: ROUTE_COLOR,
      },
    }]
  })

  return {
    type: 'FeatureCollection',
    features,
  }
}

const getSafeAreaPadding = () => {
  const width = mapContainer.value?.clientWidth ?? 0
  const height = mapContainer.value?.clientHeight ?? 0
  const topCompensation = shouldUseTerrain.value ? PITCH_TOP_COMPENSATION : 0

  return {
    top: Math.round(height * (EXPORT_SAFE_AREA.top + topCompensation)),
    right: Math.round(width * EXPORT_SAFE_AREA.right),
    bottom: Math.round(height * EXPORT_SAFE_AREA.bottom),
    left: Math.round(width * EXPORT_SAFE_AREA.left),
  }
}

const getSafeAreaOffset = (): [number, number] => {
  const height = mapContainer.value?.clientHeight ?? 0
  return [0, Math.round(height * (shouldUseTerrain.value ? CAMERA_DOWNWARD_OFFSET : 0))]
}

const waitForMapStyle = async () => {
  if (!map) { return }

  if (map.isStyleLoaded()) { return }

  await new Promise<void>((resolve) => {
    map?.once('load', () => resolve())
  })
}

const ensureTerrainStyle = () => {
  if (!map) { return }

  if (!map.getSource(TERRAIN_SOURCE_ID)) {
    map.addSource(TERRAIN_SOURCE_ID, {
      type: 'raster-dem',
      tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256,
      encoding: 'terrarium',
      maxzoom: 15,
    })
  }

  if (!map.getSource(HILLSHADE_SOURCE_ID)) {
    map.addSource(HILLSHADE_SOURCE_ID, {
      type: 'raster-dem',
      tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256,
      encoding: 'terrarium',
      maxzoom: 15,
    })
  }

  if (!map.getLayer(HILLSHADE_LAYER_ID)) {
    map.addLayer({
      id: HILLSHADE_LAYER_ID,
      type: 'hillshade',
      source: HILLSHADE_SOURCE_ID,
      paint: {
        'hillshade-shadow-color': '#475569',
        'hillshade-highlight-color': '#f8fafc',
        'hillshade-accent-color': '#94a3b8',
        'hillshade-exaggeration': 0.35,
      },
    })
  }
}

const loadLibraries = async () => {
  if (librariesLoaded) { return }

  const [maplibreModule, polylineModule] = await Promise.all([
    import('maplibre-gl'),
    import('@mapbox/polyline'),
  ])

  maplibre = maplibreModule
  polylineCodec = polylineModule.default ?? polylineModule
  librariesLoaded = true
}

const ensureMap = async () => {
  if (map || !mapContainer.value) { return }

  await loadLibraries()
  if (!maplibre) { return }

  map = new maplibre.Map({
    container: mapContainer.value,
    style: MAPTILER_STYLE_URL || createMapStyle(),
    attributionControl: false,
    interactive: false,
    pitch: 0,
    bearing: 0,
    zoom: 12,
    canvasContextAttributes: {
      preserveDrawingBuffer: true,
    },
  })
}

const renderRoute = async () => {
  if (!mapContainer.value || typeof window === 'undefined') { return }

  exportError.value = null
  await ensureMap()
  await waitForMapStyle()

  if (!map) { return }
  ensureTerrainStyle()
  map.setPitch(shouldUseTerrain.value ? 34 : 0)
  map.setTerrain(shouldUseTerrain.value
    ? {
        source: TERRAIN_SOURCE_ID,
        exaggeration: 1.35,
      }
    : null)
  map.setLayoutProperty(HILLSHADE_LAYER_ID, 'visibility', shouldUseTerrain.value ? 'visible' : 'none')

  const coordinates = getCoordinates()
  const segments = buildSegmentCollection(coordinates, altitudeValues.value)

  if (coordinates.length < 2 || segments.features.length === 0) {
    if (map.getLayer(ROUTE_LAYER_ID)) {
      map.removeLayer(ROUTE_LAYER_ID)
    }

    if (map.getSource(ROUTE_SOURCE_ID)) {
      map.removeSource(ROUTE_SOURCE_ID)
    }

    return
  }

  const source = map.getSource(ROUTE_SOURCE_ID)
  if (!source) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: segments,
      lineMetrics: true,
    })

    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-opacity': 0.96,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          3,
          12,
          3.75,
          15,
          5,
        ],
      },
    })
  }
  else {
    ;(source as GeoJSONSource).setData(segments)
  }

  map.fitBounds(buildBounds(coordinates), {
    padding: getSafeAreaPadding(),
    offset: getSafeAreaOffset(),
    maxZoom: 13.8,
    duration: 0,
  })

  map.setZoom(Math.max(map.getZoom() - 0.12, 0))
}

const buildImageDataUrl = async (options: ExportImageOptions = {}) => {
  if (!canRenderRoute.value) { return null }

  await renderRoute()
  if (!map) { return null }

  const format = options.format ?? 'png'
  const canvas = map.getCanvas()
  const squareSide = Math.max(canvas.width, canvas.height)
  const hdCanvas = document.createElement('canvas')
  const scale = options.scale ?? EXPORT_SCALE
  hdCanvas.width = squareSide * scale
  hdCanvas.height = squareSide * scale
  const context = hdCanvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas context not available')
  }

  context.scale(scale, scale)
  context.fillStyle = '#f8fafc'
  context.fillRect(0, 0, squareSide, squareSide)
  context.drawImage(
    canvas,
    Math.round((squareSide - canvas.width) / 2),
    Math.round((squareSide - canvas.height) / 2),
  )

  const mimeType = format === 'jpeg' ? JPEG_EXPORT_MIME_TYPE : PNG_EXPORT_MIME_TYPE
  const quality = format === 'jpeg' ? (options.quality ?? JPEG_EXPORT_QUALITY) : undefined
  return hdCanvas.toDataURL(mimeType, quality)
}

const exportMapImage = async () => {
  exporting.value = true
  exportError.value = null

  try {
    const dataUrl = await buildImageDataUrl()
    if (!dataUrl) { return }

    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${exportFilename.value}.${exportFileExtension}`
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

watch(() => [props.encodedPolyline, props.points, props.altitudes], () => {
  void renderRoute()
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})

defineExpose({
  exportPngDataUrl: () => buildImageDataUrl({
    format: 'png',
    scale: EXPORT_SCALE,
  }),
  exportJpgDataUrl: () => buildImageDataUrl({
    format: 'jpeg',
    scale: UPLOAD_EXPORT_SCALE,
    quality: JPEG_EXPORT_QUALITY,
  }),
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
            这张图会基于 Strava 轨迹流绘制地形底图，并导出 PNG 底稿。
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
      <div class="overflow-hidden rounded-[28px] border border-(--color-border)/60">
        <div ref="mapContainer" class="h-80 w-full" />
      </div>
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
:deep(.maplibregl-ctrl-bottom-right),
:deep(.maplibregl-ctrl-bottom-left),
:deep(.maplibregl-ctrl-top-right),
:deep(.maplibregl-ctrl-top-left) {
  display: none;
}
</style>

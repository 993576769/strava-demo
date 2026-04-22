import type { StyleSpecification } from 'maplibre-gl'

export const BASEMAP_SOURCE_ID = 'basemap'
export const BASEMAP_LAYER_ID = 'basemap-layer'
export const TIANDITU_IMAGE_SOURCE_ID = 'tianditu-image'
export const TIANDITU_IMAGE_ANNOTATION_SOURCE_ID = 'tianditu-image-annotation'
export const TIANDITU_VECTOR_SOURCE_ID = 'tianditu-vector'
export const TIANDITU_VECTOR_ANNOTATION_SOURCE_ID = 'tianditu-vector-annotation'
export const TIANDITU_IMAGE_LAYER_ID = 'tianditu-image-layer'
export const TIANDITU_IMAGE_ANNOTATION_LAYER_ID = 'tianditu-image-annotation-layer'
export const TIANDITU_VECTOR_LAYER_ID = 'tianditu-vector-layer'
export const TIANDITU_VECTOR_ANNOTATION_LAYER_ID = 'tianditu-vector-annotation-layer'

type TiandituMode = 'imagery' | 'vector'
export const DEFAULT_MAP_PREVIEW_MODE: TiandituMode = 'vector'

interface CreateMapPreviewStyleOptions {
  mode: TiandituMode
  tiandituKey: string
}

const createFallbackStyle = (): StyleSpecification => ({
  version: 8,
  sources: {
    [BASEMAP_SOURCE_ID]: {
      type: 'raster',
      tiles: ['https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}@2x.png'],
      tileSize: 512,
      attribution: '&copy; Stadia Maps &copy; OpenMapTiles &copy; OpenStreetMap contributors',
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: BASEMAP_LAYER_ID,
      type: 'raster',
      source: BASEMAP_SOURCE_ID,
      paint: {
        'raster-resampling': 'nearest',
      },
    },
  ],
})

const createTiandituTiles = (layer: string, key: string) => {
  return Array.from({ length: 8 }, (_, index) => {
    return `https://t${index}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${encodeURIComponent(key)}`
  })
}

export const createMapPreviewStyle = ({
  mode,
  tiandituKey,
}: CreateMapPreviewStyleOptions): StyleSpecification => {
  const normalizedKey = tiandituKey.trim()
  if (!normalizedKey) {
    return createFallbackStyle()
  }

  if (mode === 'vector') {
    return {
      version: 8,
      sources: {
        [TIANDITU_VECTOR_SOURCE_ID]: {
          type: 'raster',
          tiles: createTiandituTiles('vec', normalizedKey),
          tileSize: 256,
          attribution: 'Map data &copy; 天地图',
          maxzoom: 18,
        },
        [TIANDITU_VECTOR_ANNOTATION_SOURCE_ID]: {
          type: 'raster',
          tiles: createTiandituTiles('cva', normalizedKey),
          tileSize: 256,
          attribution: 'Labels &copy; 天地图',
          maxzoom: 18,
        },
      },
      layers: [
        {
          id: TIANDITU_VECTOR_LAYER_ID,
          type: 'raster',
          source: TIANDITU_VECTOR_SOURCE_ID,
        },
        {
          id: TIANDITU_VECTOR_ANNOTATION_LAYER_ID,
          type: 'raster',
          source: TIANDITU_VECTOR_ANNOTATION_SOURCE_ID,
        },
      ],
    }
  }

  return {
    version: 8,
    sources: {
      [TIANDITU_IMAGE_SOURCE_ID]: {
        type: 'raster',
        tiles: createTiandituTiles('img', normalizedKey),
        tileSize: 256,
        attribution: 'Imagery &copy; 天地图',
        maxzoom: 18,
      },
      [TIANDITU_IMAGE_ANNOTATION_SOURCE_ID]: {
        type: 'raster',
        tiles: createTiandituTiles('cia', normalizedKey),
        tileSize: 256,
        attribution: 'Labels &copy; 天地图',
        maxzoom: 18,
      },
    },
    layers: [
      {
        id: TIANDITU_IMAGE_LAYER_ID,
        type: 'raster',
        source: TIANDITU_IMAGE_SOURCE_ID,
      },
      {
        id: TIANDITU_IMAGE_ANNOTATION_LAYER_ID,
        type: 'raster',
        source: TIANDITU_IMAGE_ANNOTATION_SOURCE_ID,
      },
    ],
  }
}

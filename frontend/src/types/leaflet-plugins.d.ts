declare module '@mapbox/polyline' {
  interface PolylineCodec {
    decode(encoded: string, precision?: number): Array<[number, number]>
  }

  const polyline: PolylineCodec
  export default polyline
}

declare module 'leaflet-image' {
  import type { Map } from 'leaflet'

  type LeafletImageCallback = (error: unknown, canvas: HTMLCanvasElement) => void

  function leafletImage(map: Map, callback: LeafletImageCallback): void

  export default leafletImage
}

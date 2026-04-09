export type StylePreset = 'sketch' | 'watercolor' | 'poster'
export type AspectRatio = 'portrait' | 'square' | 'landscape'

export type ArtPresetDefinition = {
  id: StylePreset
  label: string
  description: string
  accentClass: string
}

export const artPresetDefinitions: ArtPresetDefinition[] = [
  {
    id: 'sketch',
    label: 'Sketch',
    description: '铅笔线稿感最强，最适合 MVP 首版，轨迹轮廓也最稳定。',
    accentClass: 'bg-stone-500/12 text-stone-700',
  },
  {
    id: 'watercolor',
    label: 'Watercolor',
    description: '更柔和的色块和晕染感，适合做偏纪念感的运动作品。',
    accentClass: 'bg-sky-500/12 text-sky-700',
  },
  {
    id: 'poster',
    label: 'Poster',
    description: '强调版式和标题信息，更像一张运动海报。',
    accentClass: 'bg-orange-500/12 text-orange-700',
  },
]

export const aspectRatioDefinitions: Array<{
  id: AspectRatio
  label: string
  description: string
}> = [
  {
    id: 'portrait',
    label: '竖版',
    description: '更像海报和装饰画，适合路线较长的活动。',
  },
  {
    id: 'square',
    label: '方版',
    description: '适合社交分享，视觉最均衡。',
  },
  {
    id: 'landscape',
    label: '横版',
    description: '适合更宽的路线和桌面展示。',
  },
]

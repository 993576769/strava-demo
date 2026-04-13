export type AspectRatio = 'portrait' | 'square' | 'landscape'

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

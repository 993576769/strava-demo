import type { ArtPromptTemplate } from '@/types/pocketbase'

export interface ArtPromptTemplateOption {
  id: string
  label: string
  description: string
  accentClass: string
}

const accentClasses = [
  'bg-stone-500/12 text-stone-700',
  'bg-sky-500/12 text-sky-700',
  'bg-orange-500/12 text-orange-700',
  'bg-emerald-500/12 text-emerald-700',
  'bg-rose-500/12 text-rose-700',
] as const

const fallbackDescription = '来自 `art_prompt_templates` 的可用生成模板。'

const humanizeSegment = (value: string) => {
  return value
    .split(/[_-]+/g)
    .filter(Boolean)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export const formatArtPromptTemplateLabel = (templateKey: string) => {
  const normalized = templateKey
    .replace(/^doubao-seedream-?/i, '')
    .replace(/-default$/i, '')
    .trim()

  if (!normalized) {
    return 'Default Template'
  }

  return humanizeSegment(normalized)
}

const hashTemplateKey = (templateKey: string) => {
  let hash = 0
  for (const char of templateKey) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0)
    hash |= 0
  }
  return Math.abs(hash)
}

export const toArtPromptTemplateOption = (template: ArtPromptTemplate): ArtPromptTemplateOption => {
  const accentClass = accentClasses[hashTemplateKey(template.template_key) % accentClasses.length] ?? accentClasses[0]

  return {
    id: template.template_key,
    label: formatArtPromptTemplateLabel(template.template_key),
    description: template.notes?.trim() || fallbackDescription,
    accentClass,
  }
}

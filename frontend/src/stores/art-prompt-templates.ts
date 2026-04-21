import type { ArtPromptTemplate } from '@/types/api'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/lib/api'
import { toArtPromptTemplateOption } from '@/lib/art-prompt-templates'
import { isArtPromptTemplate } from '@/types/api'

type SaveTemplatePayload = Partial<Pick<ArtPromptTemplate, 'prompt_template' | 'reference_image_url' | 'notes' | 'is_active'>>

interface UploadReferenceImagePayload {
  templateId: string
  dataUrl: string
  fileName: string
}

const listTemplates = async (includeInactive: boolean) => {
  const result = await api.art.listPromptTemplates(includeInactive)

  return result.items.filter(isArtPromptTemplate).filter(template => template.provider === 'doubao-seedream')
}

export const useArtPromptTemplatesStore = defineStore('artPromptTemplates', () => {
  const queryCache = useQueryCache()
  const includeInactive = ref(false)

  const templatesQuery = useQuery<ArtPromptTemplate[], Error>({
    key: () => ['art-prompt-templates', { includeInactive: includeInactive.value }],
    query: () => listTemplates(includeInactive.value),
    refetchOnWindowFocus: false,
  })

  const saveTemplateMutation = useMutation<ArtPromptTemplate, { id: string, payload: SaveTemplatePayload }, Error>({
    mutation: async ({ id, payload }) => {
      const response = await api.art.updatePromptTemplate(id, payload)
      const updated = response.template
      if (!isArtPromptTemplate(updated)) { throw new Error('Invalid template response') }

      return updated
    },
    onSuccess: (updated) => {
      const keys = [
        ['art-prompt-templates', { includeInactive: false }],
        ['art-prompt-templates', { includeInactive: true }],
      ] as const

      for (const key of keys) {
        queryCache.setQueryData(key, (previous) => {
          if (!Array.isArray(previous)) { return previous }
          return previous.map(template => template.id === updated.id ? updated : template)
        })
      }
    },
  })

  const uploadReferenceImageMutation = useMutation<{ template: ArtPromptTemplate, referenceImageUrl: string }, UploadReferenceImagePayload, Error>({
    mutation: async ({ templateId, dataUrl, fileName }) => {
      const response = await api.art.uploadPromptReferenceImage(templateId, {
        dataUrl,
        fileName,
      })

      const template = isArtPromptTemplate(response.template) ? response.template : null
      if (!template) { throw new Error('Invalid template response') }

      return {
        template,
        referenceImageUrl: response.referenceImageUrl ?? template.reference_image_url ?? '',
      }
    },
    onSuccess: ({ template }) => {
      const keys = [
        ['art-prompt-templates', { includeInactive: false }],
        ['art-prompt-templates', { includeInactive: true }],
      ] as const

      for (const key of keys) {
        queryCache.setQueryData(key, (previous) => {
          if (!Array.isArray(previous)) { return previous }
          return previous.map(item => item.id === template.id ? template : item)
        })
      }
    },
  })

  const templates = computed(() => templatesQuery.data.value ?? [])
  const options = computed(() => templates.value.map(toArtPromptTemplateOption))
  const loading = computed(() => templatesQuery.isLoading.value)
  const uploadingReferenceImage = computed(() => uploadReferenceImageMutation.isLoading.value)
  const error = computed(() => {
    if (uploadReferenceImageMutation.error.value) { return uploadReferenceImageMutation.error.value.message || '上传参考图失败' }

    if (saveTemplateMutation.error.value) { return saveTemplateMutation.error.value.message || '保存模板失败' }

    if (templatesQuery.error.value) { return '读取生成模板失败' }

    return null
  })
  const defaultTemplateKey = computed(() => options.value[0]?.id ?? '')

  const fetchTemplates = async (options?: { includeInactive?: boolean }) => {
    includeInactive.value = !!options?.includeInactive
    await templatesQuery.refetch()
  }

  const saveTemplate = async (id: string, payload: SaveTemplatePayload) => {
    try {
      return await saveTemplateMutation.mutateAsync({ id, payload })
    }
    catch (value) {
      console.error(value)
      return null
    }
  }

  const uploadReferenceImage = async (templateId: string, dataUrl: string, fileName: string) => {
    try {
      return await uploadReferenceImageMutation.mutateAsync({
        templateId,
        dataUrl,
        fileName,
      })
    }
    catch (value) {
      console.error(value)
      return null
    }
  }

  const clear = () => {
    includeInactive.value = false
    saveTemplateMutation.reset()
    uploadReferenceImageMutation.reset()
  }

  return {
    templates,
    options,
    loading,
    uploadingReferenceImage,
    error,
    defaultTemplateKey,
    fetchTemplates,
    saveTemplate,
    uploadReferenceImage,
    clear,
  }
})

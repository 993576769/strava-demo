import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { artPromptTemplatesCollection, pb } from '@/lib/pocketbase'
import { toArtPromptTemplateOption } from '@/lib/art-prompt-templates'
import { isArtPromptTemplate, type ArtPromptTemplate } from '@/types/pocketbase'

export const useArtPromptTemplatesStore = defineStore('artPromptTemplates', () => {
  const templates = ref<ArtPromptTemplate[]>([])
  const loading = ref(false)
  const uploadingReferenceImage = ref(false)
  const error = ref<string | null>(null)

  const options = computed(() => templates.value.map(toArtPromptTemplateOption))
  const defaultTemplateKey = computed(() => options.value[0]?.id ?? '')

  const fetchTemplates = async (options?: { includeInactive?: boolean }) => {
    loading.value = true
    error.value = null

    try {
      const filter = options?.includeInactive
        ? 'provider = "doubao-seedream"'
        : 'provider = "doubao-seedream" && is_active = true'
      const result = await artPromptTemplatesCollection().getFullList({
        filter,
        sort: 'template_key',
      })

      templates.value = result.filter(isArtPromptTemplate)
    } catch (value) {
      console.error(value)
      templates.value = []
      error.value = '读取生成模板失败'
    } finally {
      loading.value = false
    }
  }

  const saveTemplate = async (id: string, payload: Partial<Pick<ArtPromptTemplate, 'prompt_template' | 'reference_image_url' | 'notes' | 'is_active'>>) => {
    error.value = null

    try {
      const updated = await artPromptTemplatesCollection().update(id, payload)
      if (!isArtPromptTemplate(updated)) {
        throw new Error('Invalid template response')
      }

      templates.value = templates.value.map(template => template.id === updated.id ? updated : template)
      return updated
    } catch (value) {
      console.error(value)
      error.value = value instanceof Error ? value.message : '保存模板失败'
      return null
    }
  }

  const uploadReferenceImage = async (templateId: string, dataUrl: string, fileName: string) => {
    uploadingReferenceImage.value = true
    error.value = null

    try {
      const response = await pb.send<{ template?: unknown, referenceImageUrl?: string }>(`/api/admin/art-prompt-templates/${templateId}/reference-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          dataUrl,
          fileName,
        },
      })

      const template = isArtPromptTemplate(response.template) ? response.template : null
      if (!template) {
        throw new Error('Invalid template response')
      }

      templates.value = templates.value.map(item => item.id === template.id ? template : item)
      return {
        template,
        referenceImageUrl: response.referenceImageUrl ?? template.reference_image_url ?? '',
      }
    } catch (value) {
      console.error(value)
      error.value = value instanceof Error ? value.message : '上传参考图失败'
      return null
    } finally {
      uploadingReferenceImage.value = false
    }
  }

  const clear = () => {
    templates.value = []
    error.value = null
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

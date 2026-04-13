import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { artPromptTemplatesCollection } from '@/lib/pocketbase'
import { toArtPromptTemplateOption } from '@/lib/art-prompt-templates'
import { isArtPromptTemplate, type ArtPromptTemplate } from '@/types/pocketbase'

export const useArtPromptTemplatesStore = defineStore('artPromptTemplates', () => {
  const templates = ref<ArtPromptTemplate[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const options = computed(() => templates.value.map(toArtPromptTemplateOption))
  const defaultTemplateKey = computed(() => options.value[0]?.id ?? '')

  const fetchTemplates = async () => {
    loading.value = true
    error.value = null

    try {
      const result = await artPromptTemplatesCollection().getFullList({
        filter: 'provider = "doubao-seedream" && is_active = true',
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

  const clear = () => {
    templates.value = []
    error.value = null
  }

  return {
    templates,
    options,
    loading,
    error,
    defaultTemplateKey,
    fetchTemplates,
    clear,
  }
})

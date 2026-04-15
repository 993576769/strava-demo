<script setup lang="ts">
import { ImageUp, Loader2, Save, ShieldCheck } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useArtPromptTemplatesStore } from '@/stores/art-prompt-templates'

const artPromptTemplatesStore = useArtPromptTemplatesStore()

const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedTemplateId = ref('')
const draftPrompt = ref('')
const draftReferenceImageUrl = ref('')
const draftNotes = ref('')
const draftIsActive = ref(false)
const saveFeedback = ref('')
const saving = ref(false)

const readFileAsDataUrl = (file: File) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('读取图片失败'))
    }
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

const selectedTemplate = computed(() => {
  return artPromptTemplatesStore.templates.find(template => template.id === selectedTemplateId.value) ?? null
})

const syncDraft = () => {
  const template = selectedTemplate.value
  draftPrompt.value = template?.prompt_template ?? ''
  draftReferenceImageUrl.value = template?.reference_image_url ?? ''
  draftNotes.value = template?.notes ?? ''
  draftIsActive.value = template?.is_active ?? false
}

const selectTemplate = (id: string) => {
  selectedTemplateId.value = id
  saveFeedback.value = ''
  syncDraft()
}

const loadTemplates = async () => {
  await artPromptTemplatesStore.fetchTemplates({ includeInactive: true })
  if (!selectedTemplateId.value && artPromptTemplatesStore.templates.length > 0) {
    selectedTemplateId.value = artPromptTemplatesStore.templates[0]?.id ?? ''
  }
  syncDraft()
}

const saveTemplate = async () => {
  if (!selectedTemplate.value) { return }

  saving.value = true
  saveFeedback.value = ''

  const updated = await artPromptTemplatesStore.saveTemplate(selectedTemplate.value.id, {
    prompt_template: draftPrompt.value,
    reference_image_url: draftReferenceImageUrl.value,
    notes: draftNotes.value,
    is_active: draftIsActive.value,
  })

  saving.value = false

  if (!updated) {
    return
  }

  saveFeedback.value = '模板已保存。'
  selectTemplate(updated.id)
}

const triggerFilePicker = () => {
  fileInputRef.value?.click()
}

const handleReferenceImageSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file || !selectedTemplate.value) {
    return
  }

  saveFeedback.value = ''

  const dataUrl = await readFileAsDataUrl(file)
  const uploaded = await artPromptTemplatesStore.uploadReferenceImage(selectedTemplate.value.id, dataUrl, file.name)
  if (!uploaded) {
    if (input) {
      input.value = ''
    }
    return
  }

  draftReferenceImageUrl.value = uploaded.referenceImageUrl
  saveFeedback.value = '参考图已上传并更新 URL。'
  selectTemplate(uploaded.template.id)

  if (input) {
    input.value = ''
  }
}

onMounted(() => {
  void loadTemplates()
})
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(180deg,_rgba(79,70,229,0.06),_transparent_24%),var(--bg)]">
    <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <section class="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article class="rounded-4xl border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div class="flex items-start gap-3">
            <ShieldCheck class="mt-1 h-5 w-5 shrink-0 text-primary" />
            <div class="min-w-0 flex-1">
              <h1 class="text-xl font-semibold text-[var(--color-text)]">
                Prompt 模板管理
              </h1>
              <p class="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                这里直接编辑 `art_prompt_templates`。普通用户只读，管理员可修改 prompt、参考图和启用状态。
              </p>
            </div>
          </div>

          <div v-if="artPromptTemplatesStore.loading" class="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/50 px-4 py-4 text-sm text-[var(--color-text-muted)]">
            正在读取模板...
          </div>

          <div v-else-if="artPromptTemplatesStore.error" class="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            {{ artPromptTemplatesStore.error }}
          </div>

          <div v-else class="mt-5 grid gap-3">
            <button
              v-for="template in artPromptTemplatesStore.templates"
              :key="template.id"
              type="button"
              class="rounded-2xl border p-4 text-left transition"
              :class="selectedTemplateId === template.id ? 'border-primary bg-primary/8 shadow-[0_12px_30px_rgba(79,70,229,0.12)]' : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)]/55'"
              @click="selectTemplate(template.id)"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm font-semibold text-[var(--color-text)]">{{ template.template_key }}</span>
                <span class="rounded-full px-2.5 py-1 text-xs font-medium" :class="template.is_active ? 'bg-emerald-500/12 text-emerald-700' : 'bg-stone-500/12 text-stone-700'">
                  {{ template.is_active ? 'active' : 'inactive' }}
                </span>
              </div>
              <p class="mt-2 text-xs tracking-[0.18em] text-[var(--color-text-muted)] uppercase">
                {{ template.provider }}
              </p>
              <p class="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
                {{ template.notes || '暂无备注' }}
              </p>
            </button>
          </div>
        </article>

        <article class="rounded-4xl border border-[var(--color-border)]/60 bg-[var(--color-surface-card)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div v-if="!selectedTemplate" class="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-elevated)]/35 px-4 py-5 text-sm text-[var(--color-text-muted)]">
            先从左侧选择一个模板。
          </div>

          <div v-else class="grid gap-5">
            <div>
              <p class="text-xs tracking-[0.2em] text-[var(--color-text-muted)] uppercase">
                Template Key
              </p>
              <p class="mt-2 text-sm font-semibold text-[var(--color-text)]">
                {{ selectedTemplate.template_key }}
              </p>
            </div>

            <label class="grid gap-2">
              <span class="text-sm font-medium text-[var(--color-text)]">参考图 URL</span>
              <input
                ref="fileInputRef"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                class="hidden"
                @change="handleReferenceImageSelected"
              >
              <input
                v-model="draftReferenceImageUrl"
                type="text"
                class="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/55 px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-primary"
                placeholder="https://..."
              >
              <div class="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  class="btn btn-ghost"
                  :disabled="artPromptTemplatesStore.uploadingReferenceImage"
                  @click="triggerFilePicker"
                >
                  <Loader2 v-if="artPromptTemplatesStore.uploadingReferenceImage" class="mr-2 h-4 w-4 animate-spin" />
                  <ImageUp v-else class="mr-2 h-4 w-4" />
                  {{ artPromptTemplatesStore.uploadingReferenceImage ? '正在上传参考图...' : '上传图片并自动更新 URL' }}
                </button>
                <p class="text-sm text-[var(--color-text-muted)]">
                  选择本地图片后会自动上传，并把可访问 URL 回填到这里。
                </p>
              </div>
              <img
                v-if="draftReferenceImageUrl"
                :src="draftReferenceImageUrl"
                alt="Reference preview"
                class="mt-2 h-40 w-full rounded-[20px] border border-[var(--color-border)]/60 bg-[var(--color-surface-elevated)] object-cover"
              >
            </label>

            <label class="grid gap-2">
              <span class="text-sm font-medium text-[var(--color-text)]">备注</span>
              <input
                v-model="draftNotes"
                type="text"
                class="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/55 px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-primary"
                placeholder="模板说明"
              >
            </label>

            <label class="grid gap-2">
              <span class="text-sm font-medium text-[var(--color-text)]">Prompt Template</span>
              <textarea
                v-model="draftPrompt"
                rows="16"
                class="w-full rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]/55 px-4 py-4 text-sm leading-7 text-[var(--color-text)] outline-none focus:border-primary"
              />
            </label>

            <label class="inline-flex items-center gap-3 text-sm text-[var(--color-text)]">
              <input v-model="draftIsActive" type="checkbox" class="h-4 w-4 rounded border-[var(--color-border)]">
              设为启用模板
            </label>

            <div v-if="saveFeedback" class="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
              {{ saveFeedback }}
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <button class="btn btn-primary" :disabled="saving" @click="saveTemplate">
                <Loader2 v-if="saving" class="mr-2 h-4 w-4 animate-spin" />
                <Save v-else class="mr-2 h-4 w-4" />
                {{ saving ? '正在保存...' : '保存模板' }}
              </button>
              <p class="text-sm text-[var(--color-text-muted)]">
                保存会直接更新 `art_prompt_templates` 当前记录。
              </p>
            </div>
          </div>
        </article>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

type DropdownAlign = 'start' | 'center' | 'end'

const props = withDefaults(defineProps<{
  align?: DropdownAlign
  offset?: number
  minWidth?: number
  panelClass?: string
}>(), {
  align: 'end',
  offset: 8,
  minWidth: 224,
  panelClass: '',
})

const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

const close = () => {
  isOpen.value = false
}

const updatePosition = () => {
  const trigger = triggerRef.value
  const panel = panelRef.value
  if (!trigger || !panel) { return }

  const viewportPadding = 12
  const triggerRect = trigger.getBoundingClientRect()
  const panelRect = panel.getBoundingClientRect()

  let left = triggerRect.left
  if (props.align === 'center') {
    left = triggerRect.left + (triggerRect.width / 2) - (panelRect.width / 2)
  }
  else if (props.align === 'end') {
    left = triggerRect.right - panelRect.width
  }

  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - panelRect.width - viewportPadding))

  let top = triggerRect.bottom + props.offset
  const canOpenBelow = top + panelRect.height <= window.innerHeight - viewportPadding
  if (!canOpenBelow) {
    const aboveTop = triggerRect.top - panelRect.height - props.offset
    top = aboveTop >= viewportPadding
      ? aboveTop
      : Math.max(viewportPadding, window.innerHeight - panelRect.height - viewportPadding)
  }

  panelStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    minWidth: `${Math.max(props.minWidth, Math.round(triggerRect.width))}px`,
  }
}

const toggle = async () => {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    await nextTick()
    updatePosition()
  }
}

const handlePointerDown = (event: MouseEvent | TouchEvent) => {
  const target = event.target as Node | null
  if (!target) { return }

  if (triggerRef.value?.contains(target) || panelRef.value?.contains(target)) {
    return
  }

  close()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    close()
  }
}

watch(isOpen, (value) => {
  if (!value) {
    return
  }

  const reposition = () => updatePosition()
  window.addEventListener('resize', reposition)
  window.addEventListener('scroll', reposition, true)
  document.addEventListener('mousedown', handlePointerDown)
  document.addEventListener('touchstart', handlePointerDown)
  document.addEventListener('keydown', handleKeydown)

  const stop = watch(isOpen, (nextValue) => {
    if (nextValue) { return }
    window.removeEventListener('resize', reposition)
    window.removeEventListener('scroll', reposition, true)
    document.removeEventListener('mousedown', handlePointerDown)
    document.removeEventListener('touchstart', handlePointerDown)
    document.removeEventListener('keydown', handleKeydown)
    stop()
  })
}, { flush: 'post' })

onBeforeUnmount(() => {
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  document.removeEventListener('mousedown', handlePointerDown)
  document.removeEventListener('touchstart', handlePointerDown)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="triggerRef" class="inline-flex">
    <slot name="trigger" :is-open="isOpen" :toggle="toggle" :close="close" />
  </div>

  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="panelRef"
      class="fixed z-[70] flex flex-col gap-1 rounded-3xl border border-[var(--color-border)]/70 bg-[var(--color-surface-card)] p-2 shadow-[0_20px_45px_rgba(15,23,42,0.12)]"
      :class="panelClass"
      :style="panelStyle"
    >
      <slot :close="close" />
    </div>
  </Teleport>
</template>

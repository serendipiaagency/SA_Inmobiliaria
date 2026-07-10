<template>
  <div ref="root" class="cs-root" @pointerdown="onDown">
    <img :src="afterSrc" :alt="afterLabel" class="cs-img" draggable="false" />
    <div class="cs-clip" :style="{ clipPath: `inset(0 ${100 - pos}% 0 0)` }">
      <img :src="beforeSrc" :alt="beforeLabel" class="cs-img" draggable="false" />
    </div>
    <div class="cs-handle" :style="{ left: `${pos}%` }">
      <div
        class="cs-grip"
        role="slider"
        tabindex="0"
        :aria-label="`${t('compareSlider.compare', 'Comparar')} ${beforeLabel} ${t('compareSlider.and', 'y')} ${afterLabel}`"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(pos)"
        @keydown="onKeydown"
      >
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></svg>
      </div>
    </div>
    <span class="cs-tag cs-tag-left">{{ beforeLabel }}</span>
    <span class="cs-tag cs-tag-right">{{ afterLabel }}</span>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
const props = defineProps<{
  beforeSrc: string
  afterSrc: string
  beforeLabel?: string
  afterLabel?: string
}>()

const beforeLabel = computed(() => props.beforeLabel ?? t('compareSlider.before', 'Antes'))
const afterLabel = computed(() => props.afterLabel ?? t('compareSlider.after', 'Después'))

const root = ref<HTMLElement | null>(null)
const pos = ref(50)
let dragging = false

function setFromClientX(clientX: number) {
  const el = root.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const pct = ((clientX - rect.left) / rect.width) * 100
  pos.value = Math.max(0, Math.min(100, pct))
}

function onDown(e: PointerEvent) {
  dragging = true
  setFromClientX(e.clientX)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
function onMove(e: PointerEvent) {
  if (!dragging) return
  setFromClientX(e.clientX)
}
function onUp() {
  dragging = false
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
}
onBeforeUnmount(onUp)

function onKeydown(e: KeyboardEvent) {
  const step = e.shiftKey ? 20 : 5
  if (e.key === 'ArrowLeft') pos.value = Math.max(0, pos.value - step)
  else if (e.key === 'ArrowRight') pos.value = Math.min(100, pos.value + step)
  else if (e.key === 'Home') pos.value = 0
  else if (e.key === 'End') pos.value = 100
  else return
  e.preventDefault()
}
</script>

<style scoped>
.cs-root {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
  cursor: ew-resize;
  user-select: none;
  touch-action: none;
}
.cs-img {
  position: absolute;
  inset: 0;
  height: 100%;
  width: 100%;
  object-fit: cover;
  pointer-events: none;
}
.cs-clip {
  position: absolute;
  inset: 0;
}
.cs-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #fff;
  transform: translateX(-50%);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
}
.cs-grip {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  height: 2.25rem;
  width: 2.25rem;
  transform: translate(-50%, -50%);
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: #fff;
  color: #16150f;
  box-shadow: 0 8px 20px -6px rgba(0, 0, 0, 0.4);
  transition: transform 0.2s var(--ease-out);
  cursor: ew-resize;
}
.cs-grip:hover {
  transform: translate(-50%, -50%) scale(1.1);
}
.cs-grip:focus-visible {
  outline: 2px solid #16150f;
  outline-offset: 3px;
}
.cs-tag {
  position: absolute;
  top: 1rem;
  border-radius: 9999px;
  background: rgba(22, 21, 15, 0.7);
  padding: 0.35rem 0.85rem;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fff;
  backdrop-filter: blur(4px);
}
.cs-tag-left {
  left: 1rem;
}
.cs-tag-right {
  right: 1rem;
}
</style>

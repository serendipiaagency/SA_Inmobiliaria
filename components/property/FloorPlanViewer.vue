<template>
  <Teleport to="body">
    <div class="fpv" role="dialog" aria-modal="true" :aria-label="current?.title" data-testid="floor-plan-viewer" @keydown="onKey">
      <header class="fpv-bar">
        <p class="min-w-0 truncate text-sm font-semibold text-white">
          {{ current?.title }}
          <span v-if="plans.length > 1" class="ml-2 font-normal text-white/60">{{ index + 1 }} / {{ plans.length }}</span>
        </p>
        <div class="flex items-center gap-1.5">
          <button type="button" class="fpv-btn" :aria-label="t('floorPlans.zoomOut', 'Alejar')" :disabled="scale <= MIN" data-testid="floor-plan-zoom-out" @click="zoomBy(1 / STEP)">−</button>
          <button type="button" class="fpv-btn w-auto px-2.5 text-[12px]" :aria-label="t('floorPlans.zoomReset', 'Tamaño original')" data-testid="floor-plan-zoom-level" @click="reset">{{ Math.round(scale * 100) }} %</button>
          <button type="button" class="fpv-btn" :aria-label="t('floorPlans.zoomIn', 'Acercar')" :disabled="scale >= MAX" data-testid="floor-plan-zoom-in" @click="zoomBy(STEP)">+</button>
          <button ref="closeBtn" type="button" class="fpv-btn ml-2" :aria-label="t('common.close', 'Cerrar')" data-testid="floor-plan-close" @click="emit('close')">✕</button>
        </div>
      </header>

      <div
        class="fpv-stage"
        :class="{ 'cursor-grab': scale > 1, 'cursor-grabbing': dragging }"
        @wheel.prevent="onWheel"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @dblclick="scale > 1 ? reset() : zoomBy(2)"
      >
        <img
          v-if="current"
          :src="mediaUrl(current.image)"
          :alt="current.title"
          class="fpv-img"
          draggable="false"
          :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }"
          data-testid="floor-plan-viewer-image"
        >
      </div>

      <template v-if="plans.length > 1">
        <button type="button" class="fpv-nav left-3" :aria-label="t('floorPlans.prev', 'Plano anterior')" @click="go(-1)">‹</button>
        <button type="button" class="fpv-nav right-3" :aria-label="t('floorPlans.next', 'Plano siguiente')" data-testid="floor-plan-next" @click="go(1)">›</button>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { PublicFloorPlan } from '~/utils/floorPlans'

/**
 * Visor a pantalla completa de los planos (#110): sin recortes, con zoom
 * (botones, rueda, doble clic y pellizco), arrastre cuando está ampliado y
 * paso de un plano a otro. Esc cierra; ← → cambian de plano; + − amplían.
 */
const props = defineProps<{ plans: PublicFloorPlan[]; start?: number }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const MIN = 1
const MAX = 5
const STEP = 1.5
const index = ref(Math.min(Math.max(props.start || 0, 0), Math.max(props.plans.length - 1, 0)))
const current = computed(() => props.plans[index.value])
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const closeBtn = ref<HTMLButtonElement | null>(null)

function reset() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}
function zoomBy(f: number) {
  scale.value = Math.min(MAX, Math.max(MIN, scale.value * f))
  if (scale.value === 1) reset()
}
function go(d: number) {
  const n = props.plans.length
  index.value = (index.value + d + n) % n
  reset()
}
function onWheel(e: WheelEvent) {
  zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)
}

// Arrastre (un dedo o ratón) y pellizco (dos dedos).
const pointers = new Map<number, { x: number; y: number }>()
const dragging = ref(false)
let last: { x: number; y: number } | null = null
let pinchDist = 0
function onDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
  } else {
    dragging.value = scale.value > 1
    last = { x: e.clientX, y: e.clientY }
  }
}
function onMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2 && pinchDist) {
    const [a, b] = [...pointers.values()]
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    zoomBy(d / pinchDist)
    pinchDist = d
    return
  }
  if (dragging.value && last) {
    tx.value += e.clientX - last.x
    ty.value += e.clientY - last.y
    last = { x: e.clientX, y: e.clientY }
  }
}
function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinchDist = 0
  if (!pointers.size) {
    dragging.value = false
    last = null
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowRight' && props.plans.length > 1) go(1)
  else if (e.key === 'ArrowLeft' && props.plans.length > 1) go(-1)
  else if (e.key === '+' || e.key === '=') zoomBy(STEP)
  else if (e.key === '-') zoomBy(1 / STEP)
}

// Mientras está abierto, la página de debajo no se desplaza; el foco va al visor.
onMounted(() => {
  document.documentElement.style.overflow = 'hidden'
  nextTick(() => closeBtn.value?.focus())
})
onBeforeUnmount(() => {
  document.documentElement.style.overflow = ''
})
</script>

<style scoped>
.fpv {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: flex;
  flex-direction: column;
  background: rgba(15, 14, 12, 0.94);
}
.fpv-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
}
.fpv-btn {
  display: inline-flex;
  height: 36px;
  min-width: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 18px;
  line-height: 1;
}
.fpv-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.22);
}
.fpv-btn:disabled {
  opacity: 0.35;
}
.fpv-stage {
  position: relative;
  flex: 1;
  overflow: hidden;
  touch-action: none;
}
.fpv-img {
  position: absolute;
  inset: 0;
  margin: auto;
  max-height: calc(100% - 24px);
  max-width: calc(100% - 24px);
  background: #fff;
  border-radius: 6px;
  object-fit: contain;
  transform-origin: center;
  transition: transform 0.08s linear;
  user-select: none;
}
.fpv-nav {
  position: absolute;
  top: 50%;
  display: flex;
  height: 44px;
  width: 44px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.92);
  color: #1c1b19;
  font-size: 26px;
  transform: translateY(-50%);
}
</style>

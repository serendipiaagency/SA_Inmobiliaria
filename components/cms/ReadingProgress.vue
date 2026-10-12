<template>
  <div class="cms-progress" role="progressbar" aria-label="Progreso de lectura" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100" data-testid="cms-reading-progress">
    <div class="cms-progress-bar" :style="{ transform: `scaleX(${pct / 100})` }" />
  </div>
</template>

<script setup lang="ts">
/** Barra fina en la parte superior con el avance de lectura del artículo (`target` = selector del cuerpo). */
const props = defineProps<{ target: string }>()
const pct = ref(0)
let raf = 0
function measure() {
  raf = 0
  const el = document.querySelector(props.target) as HTMLElement | null
  if (!el) return
  const rect = el.getBoundingClientRect()
  const total = rect.height - window.innerHeight
  const done = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1
  pct.value = Math.round(done * 100)
}
function onScroll() {
  if (!raf) raf = requestAnimationFrame(measure)
}
onMounted(() => {
  measure()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
  if (raf) cancelAnimationFrame(raf)
})
</script>

<style scoped>
.cms-progress {
  position: fixed;
  inset: 0 0 auto 0;
  height: 3px;
  z-index: 60;
  background: transparent;
  pointer-events: none;
}
.cms-progress-bar {
  height: 100%;
  width: 100%;
  transform-origin: left;
  background: var(--cms-accent, #1f4e5f);
  transition: transform 0.1s linear;
}
@media (prefers-reduced-motion: reduce) {
  .cms-progress-bar {
    transition: none;
  }
}
</style>

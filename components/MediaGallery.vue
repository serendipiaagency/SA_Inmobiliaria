<template>
  <div>
    <!-- Tabs -->
    <div class="mb-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        class="gtab"
        :class="{ 'gtab-on': tab === t.key }"
        @click="tab = t.key"
      >
        <span v-html="t.icon" class="mr-1.5" />{{ t.label }}
      </button>
    </div>

    <!-- FOTOS: mosaic -->
    <div v-show="tab === 'fotos'" class="grid gap-2 lg:grid-cols-5">
      <button class="relative col-span-3 block aspect-[4/3] w-full overflow-hidden rounded-l-2xl bg-stone-100 lg:aspect-auto lg:h-[540px]" @click="openFull(0)">
        <img :src="photos[0]" :alt="name" class="h-full w-full object-cover transition duration-700 hover:scale-105" />
      </button>
      <div v-if="photos.length > 1" class="col-span-2 hidden grid-cols-2 grid-rows-2 gap-2 lg:grid">
        <button v-for="(p, i) in photos.slice(1, 5)" :key="i" class="relative block h-[266px] overflow-hidden bg-stone-100" :class="{ 'rounded-tr-2xl': i === 1, 'rounded-br-2xl': i === 3 }" @click="openFull(i + 1)">
          <img :src="p" :alt="`${name} ${i + 2}`" class="h-full w-full object-cover transition duration-700 hover:scale-105" loading="lazy" />
          <span v-if="i === 3 && photos.length > 5" class="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold uppercase tracking-widest2 text-white">
            +{{ photos.length - 5 }} fotos
          </span>
        </button>
      </div>
    </div>

    <!-- 360 -->
    <div v-show="tab === '360'" class="relative h-[540px] overflow-hidden rounded-2xl bg-ink">
      <div
        ref="pano"
        class="h-full w-[300%] cursor-grab bg-cover bg-center active:cursor-grabbing"
        :style="{ backgroundImage: `url(${photos[0]})`, transform: `translateX(${panoX}px)` }"
        @pointerdown="startPan"
      />
      <div class="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-[11px] uppercase tracking-widest2 text-white backdrop-blur">
        ◐ Arrastra para mirar alrededor
      </div>
    </div>

    <!-- Vídeo -->
    <div v-show="tab === 'video'" class="flex h-[540px] items-center justify-center rounded-2xl bg-ink text-center">
      <video v-if="videoUrl" :src="videoUrl" controls class="h-full w-full rounded-2xl object-cover" />
      <div v-else class="max-w-sm px-6 text-white/80">
        <p class="font-serif text-2xl text-white">Vídeo profesional</p>
        <p class="mt-2 text-sm">Solicita el vídeo tour de esta propiedad y te lo enviamos en menos de 24 h.</p>
        <NuxtLink to="/contact-us" class="mt-5 inline-flex bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink">Solicitar vídeo</NuxtLink>
      </div>
    </div>

    <!-- Drone -->
    <div v-show="tab === 'drone'" class="relative h-[540px] overflow-hidden rounded-2xl bg-stone-100">
      <img :src="photos[photos.length - 1] || photos[0]" :alt="`${name} vista aérea`" class="h-full w-full object-cover" />
      <span class="absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1.5 text-[11px] uppercase tracking-widest2 text-white backdrop-blur">Vista aérea</span>
    </div>

    <!-- Plano -->
    <div v-show="tab === 'plano'" class="flex h-[540px] items-center justify-center overflow-hidden rounded-2xl border border-line bg-white">
      <img v-if="masterPlan" :src="masterPlan" :alt="`${name} plano`" class="max-h-full max-w-full cursor-zoom-in object-contain p-4" @click="openFull(-1)" />
      <p v-else class="text-stone-400">Plano no disponible</p>
    </div>

    <!-- Fullscreen viewer -->
    <Teleport to="body">
      <div v-if="full !== null" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/95" @click.self="full = null">
        <button class="absolute right-6 top-6 text-3xl text-white/70 hover:text-white" @click="full = null">×</button>
        <button v-if="full >= 0" class="absolute left-4 p-4 text-4xl text-white/60 hover:text-white" @click.stop="fstep(-1)">‹</button>
        <img :src="full === -1 ? masterPlan : photos[full]" class="max-h-[88vh] max-w-[92vw] object-contain" />
        <button v-if="full >= 0" class="absolute right-4 p-4 text-4xl text-white/60 hover:text-white" @click.stop="fstep(1)">›</button>
        <p v-if="full >= 0" class="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs uppercase tracking-widest2 text-white/60">{{ full + 1 }} / {{ photos.length }}</p>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  photos: string[]
  name: string
  hasTour?: boolean
  masterPlan?: string | null
  videoUrl?: string | null
}>()

const tabs = computed(() => {
  const t: { key: string; label: string; icon: string }[] = [
    { key: 'fotos', label: 'Fotos', icon: ic('grid') },
  ]
  t.push({ key: 'video', label: 'Vídeo', icon: ic('play') })
  if (props.hasTour) t.push({ key: '360', label: '360°', icon: ic('globe') })
  t.push({ key: 'drone', label: 'Drone', icon: ic('drone') })
  if (props.masterPlan) t.push({ key: 'plano', label: 'Plano', icon: ic('plan') })
  return t
})
const tab = ref('fotos')

// 360 pan
const pano = ref<HTMLElement | null>(null)
const panoX = ref(0)
let dragging = false
let startX = 0
let startVal = 0
function startPan(e: PointerEvent) {
  dragging = true
  startX = e.clientX
  startVal = panoX.value
  window.addEventListener('pointermove', onPan)
  window.addEventListener('pointerup', endPan)
}
function onPan(e: PointerEvent) {
  if (!dragging) return
  const w = pano.value?.clientWidth || 900
  const min = -(w - (pano.value?.parentElement?.clientWidth || 300))
  panoX.value = Math.max(min, Math.min(0, startVal + (e.clientX - startX)))
}
function endPan() {
  dragging = false
  window.removeEventListener('pointermove', onPan)
  window.removeEventListener('pointerup', endPan)
}
onBeforeUnmount(endPan)

// Fullscreen
const full = ref<number | null>(null)
function openFull(i: number) {
  full.value = i
}
function fstep(d: number) {
  if (full.value === null || full.value < 0) return
  const n = props.photos.length
  full.value = (full.value + d + n) % n
}
function onKey(e: KeyboardEvent) {
  if (full.value === null) return
  if (e.key === 'Escape') full.value = null
  if (e.key === 'ArrowRight') fstep(1)
  if (e.key === 'ArrowLeft') fstep(-1)
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

function ic(k: string) {
  const p: Record<string, string> = {
    grid: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    play: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 4l14 8-14 8z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    drone: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h4M16 6h4M6 6v3M18 6v3M8 12h8l-1 6H9z"/>',
    plan: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 4h16v16H4zM4 10h6M10 4v16M14 14h6"/>',
  }
  return `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24" style="display:inline;vertical-align:-2px">${p[k] || ''}</svg>`
}
</script>

<style scoped>
.gtab {
  flex-shrink: 0;
  white-space: nowrap;
  border: 1px solid #e7e4de;
  border-radius: 9999px;
  padding: 0.5rem 1rem;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #57534e;
  background: #fff;
  transition: all 0.18s;
}
.gtab:hover {
  border-color: #16150f;
  color: #16150f;
}
.gtab-on {
  background: #16150f;
  border-color: #16150f;
  color: #fff;
}
</style>

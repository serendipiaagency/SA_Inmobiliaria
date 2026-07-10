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
      <button class="relative col-span-3 block aspect-[4/3] w-full overflow-hidden rounded-l-2xl bg-stone-100 lg:aspect-auto lg:h-[540px]" @click="openFull('photo', 0)">
        <img :src="photos[0]" :alt="name" class="h-full w-full object-cover transition duration-700 hover:scale-105" />
      </button>
      <div v-if="photos.length > 1" class="col-span-2 hidden grid-cols-2 grid-rows-2 gap-2 lg:grid">
        <button v-for="(p, i) in photos.slice(1, 5)" :key="i" class="relative block h-[266px] overflow-hidden bg-stone-100" :class="{ 'rounded-tr-2xl': i === 1, 'rounded-br-2xl': i === 3 }" @click="openFull('photo', i + 1)">
          <img :src="p" :alt="`${name} ${i + 2}`" class="h-full w-full object-cover transition duration-700 hover:scale-105" loading="lazy" />
          <span v-if="i === 3 && photos.length > 5" class="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold uppercase tracking-widest2 text-white">
            +{{ photos.length - 5 }} {{ t('mediaGallery.photos.more', 'fotos') }}
          </span>
        </button>
      </div>
    </div>

    <!-- Redes sociales -->
    <div v-show="tab === 'redes'" class="h-[540px] overflow-hidden rounded-2xl bg-ink">
      <div v-if="socialMedia?.length" class="flex h-full items-center gap-6 overflow-x-auto px-6 py-6 [scrollbar-width:thin]">
        <SocialEmbed v-for="s in socialMedia" :key="s.url" :platform="s.platform" :url="s.url" :caption="s.caption" />
      </div>
      <div v-else class="flex h-full items-center justify-center text-center">
        <div class="max-w-sm px-6 text-white/80">
          <p class="font-serif text-2xl text-white">{{ t('mediaGallery.social.title', 'Vídeos en Instagram y TikTok') }}</p>
          <p class="mt-2 text-sm">{{ t('mediaGallery.social.desc', 'Solicita que añadamos los vídeos de esta propiedad en redes sociales.') }}</p>
          <NuxtLink to="/contact-us" class="mt-5 inline-flex bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink">{{ t('mediaGallery.social.cta', 'Solicitar vídeos') }}</NuxtLink>
        </div>
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
        ◐ {{ t('mediaGallery.tour360.hint', 'Arrastra para mirar alrededor') }}
      </div>
    </div>

    <!-- Vídeo -->
    <div v-show="tab === 'video'" class="flex h-[540px] items-center justify-center rounded-2xl bg-ink text-center">
      <video v-if="videoUrl" :src="videoUrl" controls class="h-full w-full rounded-2xl object-cover" />
      <div v-else class="max-w-sm px-6 text-white/80">
        <p class="font-serif text-2xl text-white">{{ t('mediaGallery.video.title', 'Vídeo profesional') }}</p>
        <p class="mt-2 text-sm">{{ t('mediaGallery.video.desc', 'Solicita el vídeo tour de esta propiedad y te lo enviamos en menos de 24 h.') }}</p>
        <NuxtLink to="/contact-us" class="mt-5 inline-flex bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink">{{ t('mediaGallery.video.cta', 'Solicitar vídeo') }}</NuxtLink>
      </div>
    </div>

    <!-- Drone -->
    <div v-show="tab === 'drone'" class="relative flex h-[540px] items-center justify-center overflow-hidden rounded-2xl bg-ink text-center">
      <img v-if="dronePhoto" :src="dronePhoto" :alt="`${name} ${t('mediaGallery.drone.alt', 'vista aérea')}`" class="h-full w-full cursor-zoom-in object-cover" @click="openFull('drone')" />
      <div v-else class="max-w-sm px-6 text-white/80">
        <p class="font-serif text-2xl text-white">{{ t('mediaGallery.drone.title', 'Vista aérea con drone') }}</p>
        <p class="mt-2 text-sm">{{ t('mediaGallery.drone.desc', 'Solicita una toma aérea profesional de esta propiedad y su entorno.') }}</p>
        <NuxtLink to="/contact-us" class="mt-5 inline-flex bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink">{{ t('mediaGallery.drone.cta', 'Solicitar vista aérea') }}</NuxtLink>
      </div>
    </div>

    <!-- Noche -->
    <div v-show="tab === 'noche'" class="relative flex h-[540px] items-center justify-center overflow-hidden rounded-2xl bg-ink text-center">
      <img v-if="nightPhoto" :src="nightPhoto" :alt="`${name} ${t('mediaGallery.night.alt', 'vista nocturna')}`" class="h-full w-full cursor-zoom-in object-cover" @click="openFull('night')" />
      <div v-else class="max-w-sm px-6 text-white/80">
        <p class="font-serif text-2xl text-white">{{ t('mediaGallery.night.title', 'Fotografía nocturna') }}</p>
        <p class="mt-2 text-sm">{{ t('mediaGallery.night.desc', 'Solicita una sesión al atardecer o de noche para resaltar la iluminación de esta propiedad.') }}</p>
        <NuxtLink to="/contact-us" class="mt-5 inline-flex bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink">{{ t('mediaGallery.night.cta', 'Solicitar sesión nocturna') }}</NuxtLink>
      </div>
    </div>

    <!-- Antes / Después -->
    <div v-if="beforePhoto && afterPhoto" v-show="tab === 'antes-despues'" class="h-[540px] overflow-hidden rounded-2xl">
      <CompareSlider :before-src="beforePhoto" :after-src="afterPhoto" />
    </div>

    <!-- Decoración IA -->
    <div v-show="tab === 'decoracion-ia'" class="h-[540px] overflow-hidden rounded-2xl bg-ink">
      <CompareSlider v-if="aiStagedPhoto" :before-src="photos[0]" :after-src="aiStagedPhoto" :before-label="t('mediaGallery.compare.emptyBefore', 'Vacío')" :after-label="t('mediaGallery.compare.withAi', 'Con IA')" />
      <div v-else class="flex h-full items-center justify-center text-center">
        <div class="max-w-sm px-6 text-white/80">
          <p class="font-serif text-2xl text-white">{{ t('mediaGallery.aiDecor.title', 'Decoración virtual con IA') }}</p>
          <p class="mt-2 text-sm">{{ t('mediaGallery.aiDecor.desc', 'Solicita una simulación de decoración con inteligencia artificial para visualizar el potencial de esta propiedad amueblada.') }}</p>
          <NuxtLink to="/contact-us" class="mt-5 inline-flex bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink">{{ t('mediaGallery.aiDecor.cta', 'Solicitar decoración IA') }}</NuxtLink>
        </div>
      </div>
    </div>

    <!-- Plano -->
    <div v-show="tab === 'plano'" class="flex h-[540px] items-center justify-center overflow-hidden rounded-2xl border border-line bg-white">
      <img v-if="masterPlan" :src="masterPlan" :alt="`${name} ${t('mediaGallery.plan.alt', 'plano')}`" class="max-h-full max-w-full cursor-zoom-in object-contain p-4" @click="openFull('plano')" />
      <p v-else class="text-stone-400">{{ t('mediaGallery.plan.unavailable', 'Plano no disponible') }}</p>
    </div>

    <!-- Fullscreen viewer -->
    <Teleport to="body">
      <div v-if="full" class="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/95" @click.self="closeFull">
        <button class="absolute right-6 top-6 z-10 text-3xl text-white/70 hover:text-white" :aria-label="t('mediaGallery.viewer.close', 'Cerrar')" @click="closeFull">×</button>
        <button v-if="full.kind === 'photo' && !zoomed" class="absolute left-4 top-1/2 z-10 -translate-y-1/2 p-4 text-4xl text-white/60 hover:text-white" :aria-label="t('mediaGallery.viewer.prev', 'Anterior')" @click.stop="fstep(-1)">‹</button>
        <div class="relative flex flex-1 items-center justify-center overflow-hidden" style="width: 92vw; max-height: 80vh">
          <img
            ref="fullImgEl"
            :src="fullSrc"
            class="fs-img max-h-[80vh] max-w-[92vw] object-contain"
            :class="{ 'fs-zoomed': zoomed, 'cursor-zoom-in': !zoomed, 'cursor-move': zoomed }"
            :style="{ transformOrigin: zoomOrigin, transform: zoomed ? `scale(2.2) translate(${panX / 2.2}px, ${panY / 2.2}px)` : 'scale(1)' }"
            draggable="false"
            @pointerdown.stop="onImgPointerDown"
          />
        </div>
        <button v-if="full.kind === 'photo' && !zoomed" class="absolute right-4 top-1/2 z-10 -translate-y-1/2 p-4 text-4xl text-white/60 hover:text-white" :aria-label="t('mediaGallery.viewer.next', 'Siguiente')" @click.stop="fstep(1)">›</button>
        <p v-if="full.kind === 'photo'" class="mt-2 text-xs uppercase tracking-widest2 text-white/60">{{ full.index + 1 }} / {{ photos.length }}</p>

        <!-- Thumbnail strip -->
        <div v-if="full.kind === 'photo' && photos.length > 1" class="fs-thumbs">
          <button
            v-for="(p, i) in photos"
            :key="i"
            type="button"
            class="fs-thumb"
            :class="{ 'fs-thumb-on': i === full.index }"
            :aria-label="`${t('mediaGallery.viewer.viewPhoto', 'Ver foto')} ${i + 1}`"
            @click.stop="jumpTo(i)"
          >
            <img :src="p" :alt="`${t('mediaGallery.viewer.thumbnail', 'Miniatura')} ${i + 1}`" loading="lazy" />
          </button>
        </div>
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
  dronePhoto?: string | null
  nightPhoto?: string | null
  beforePhoto?: string | null
  afterPhoto?: string | null
  aiStagedPhoto?: string | null
  socialMedia?: { platform: 'instagram' | 'tiktok'; url: string; caption?: string | null }[]
}>()

const { t } = useI18n()

const tabs = computed(() => {
  const tb: { key: string; label: string; icon: string }[] = [
    { key: 'fotos', label: t('mediaGallery.tabs.photos', 'Fotos'), icon: ic('grid') },
  ]
  tb.push({ key: 'redes', label: t('mediaGallery.tabs.social', 'Redes'), icon: ic('social') })
  tb.push({ key: 'video', label: t('mediaGallery.tabs.video', 'Vídeo'), icon: ic('play') })
  if (props.hasTour) tb.push({ key: '360', label: t('mediaGallery.tabs.tour360', '360°'), icon: ic('globe') })
  tb.push({ key: 'drone', label: t('mediaGallery.tabs.drone', 'Drone'), icon: ic('drone') })
  tb.push({ key: 'noche', label: t('mediaGallery.tabs.night', 'Noche'), icon: ic('night') })
  if (props.beforePhoto && props.afterPhoto) tb.push({ key: 'antes-despues', label: t('mediaGallery.tabs.beforeAfter', 'Antes / Después'), icon: ic('compare') })
  tb.push({ key: 'decoracion-ia', label: t('mediaGallery.tabs.aiDecor', 'Decoración IA'), icon: ic('sparkle') })
  if (props.masterPlan) tb.push({ key: 'plano', label: t('mediaGallery.tabs.plan', 'Plano'), icon: ic('plan') })
  return tb
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

// --- Fullscreen viewer: single/multi image, zoom, pan, swipe, thumbnails ---
type FullKind = 'photo' | 'plano' | 'night' | 'drone'
const full = ref<{ kind: FullKind; index: number } | null>(null)
const zoomed = ref(false)
const zoomOrigin = ref('50% 50%')
const panX = ref(0)
const panY = ref(0)

function openFull(kind: FullKind, index = 0) {
  full.value = { kind, index }
  resetZoom()
}
function closeFull() {
  full.value = null
  resetZoom()
}
function resetZoom() {
  zoomed.value = false
  panX.value = 0
  panY.value = 0
}
function jumpTo(i: number) {
  if (!full.value) return
  full.value = { kind: 'photo', index: i }
  resetZoom()
}
function fstep(d: number) {
  if (!full.value || full.value.kind !== 'photo') return
  const n = props.photos.length
  full.value = { kind: 'photo', index: (full.value.index + d + n) % n }
  resetZoom()
}
const fullSrc = computed(() => {
  if (!full.value) return ''
  switch (full.value.kind) {
    case 'photo':
      return props.photos[full.value.index] || ''
    case 'plano':
      return props.masterPlan || ''
    case 'night':
      return props.nightPhoto || ''
    case 'drone':
      return props.dronePhoto || ''
    default:
      return ''
  }
})

// Pointer handling on the fullscreen image: click toggles zoom, drag pans
// while zoomed, horizontal swipe navigates between photos when not zoomed.
let downX = 0
let downY = 0
let moved = false
let panning = false
let panStartX = 0
let panStartY = 0
let panOrigX = 0
let panOrigY = 0
const fullImgEl = ref<HTMLImageElement | null>(null)

function onImgPointerDown(e: PointerEvent) {
  downX = e.clientX
  downY = e.clientY
  moved = false
  if (zoomed.value) {
    panning = true
    panStartX = e.clientX
    panStartY = e.clientY
    panOrigX = panX.value
    panOrigY = panY.value
  }
  window.addEventListener('pointermove', onImgPointerMove)
  window.addEventListener('pointerup', onImgPointerUp)
}
function onImgPointerMove(e: PointerEvent) {
  const dx = e.clientX - downX
  const dy = e.clientY - downY
  if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true
  if (zoomed.value && panning) {
    panX.value = Math.max(-320, Math.min(320, panOrigX + (e.clientX - panStartX)))
    panY.value = Math.max(-320, Math.min(320, panOrigY + (e.clientY - panStartY)))
  }
}
function onImgPointerUp(e: PointerEvent) {
  window.removeEventListener('pointermove', onImgPointerMove)
  window.removeEventListener('pointerup', onImgPointerUp)
  panning = false
  if (!moved) {
    toggleZoom(e.clientX, e.clientY)
    return
  }
  if (!zoomed.value && full.value?.kind === 'photo') {
    const dx = e.clientX - downX
    if (Math.abs(dx) > 60) fstep(dx < 0 ? 1 : -1)
  }
}
function toggleZoom(clientX: number, clientY: number) {
  if (zoomed.value) {
    resetZoom()
    return
  }
  const rect = fullImgEl.value?.getBoundingClientRect()
  if (!rect) return
  const ox = ((clientX - rect.left) / rect.width) * 100
  const oy = ((clientY - rect.top) / rect.height) * 100
  zoomOrigin.value = `${ox}% ${oy}%`
  zoomed.value = true
}

function onKey(e: KeyboardEvent) {
  if (!full.value) return
  if (e.key === 'Escape') closeFull()
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
    night: '<path stroke-linecap="round" stroke-linejoin="round" d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/>',
    compare: '<path stroke-linecap="round" stroke-linejoin="round" d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
    sparkle: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/>',
    social: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/>',
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

.fs-img {
  transition: transform 0.25s var(--ease-out, ease-out);
  touch-action: none;
}
.fs-zoomed {
  transition: none;
}

.fs-thumbs {
  display: flex;
  max-width: 92vw;
  gap: 0.5rem;
  overflow-x: auto;
  padding: 0.75rem 0.5rem 0;
  scrollbar-width: none;
}
.fs-thumbs::-webkit-scrollbar {
  display: none;
}
.fs-thumb {
  flex-shrink: 0;
  height: 3rem;
  width: 4rem;
  overflow: hidden;
  border-radius: 0.5rem;
  opacity: 0.5;
  transition: opacity 0.15s, box-shadow 0.15s;
}
.fs-thumb img {
  height: 100%;
  width: 100%;
  object-fit: cover;
}
.fs-thumb-on {
  opacity: 1;
  box-shadow: 0 0 0 2px #fff;
}
.fs-thumb:hover {
  opacity: 0.85;
}
</style>

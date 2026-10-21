<template>
  <Teleport to="body">
    <div
      ref="root"
      class="gv"
      :class="[`gv-font-${options.font}`]"
      :style="cssVars"
      role="dialog"
      aria-modal="true"
      :aria-label="`${name} — ${t('gallery.viewer', 'Galería')}`"
      data-testid="gallery-viewer"
    >
      <!-- Cabecera: volver, categorías, contador y cerrar -->
      <header class="gv-bar">
        <button type="button" class="gv-btn gv-back" data-testid="gallery-viewer-back" @click="back">
          <span v-html="icon('back', 18)" /><span class="gv-back-label">{{ mode === 'item' && activeCategory.count > 1 ? t('gallery.backToGrid', 'Ver todas') : t('gallery.backToProperty', 'Volver a la propiedad') }}</span>
        </button>
        <div class="gv-tabs" role="tablist" :aria-label="t('gallery.categories', 'Categorías de la galería')" data-testid="gallery-viewer-tabs">
          <button
            v-for="c in model.categories"
            :key="c.key"
            type="button"
            class="gv-tab"
            :class="{ 'gv-tab-on': c.key === category }"
            role="tab"
            :aria-selected="c.key === category"
            :data-gallery-category="c.key"
            @click="selectCategory(c.key)"
          >
            <span class="gv-tab-thumb" aria-hidden="true"><img v-if="c.thumb" :src="c.thumb" alt="" loading="lazy" decoding="async"></span>
            <span class="gv-tab-ic" v-html="icon(c.icon, 15)" />
            <span class="gv-tab-label">{{ c.label }}</span>
            <span class="gv-tab-n">{{ c.count }}</span>
          </button>
        </div>
        <p class="gv-counter" aria-live="polite" data-testid="gallery-viewer-counter">
          <template v-if="mode === 'item'">{{ index + 1 }} / {{ list.length }}</template>
          <template v-else>{{ list.length }}</template>
        </p>
        <button ref="closeBtn" type="button" class="gv-btn" :aria-label="t('common.close', 'Cerrar')" data-testid="gallery-viewer-close" @click="emit('close')">
          <span v-html="icon('close', 18)" />
        </button>
      </header>

      <!-- Filtros por estancia (sólo en fotos, sólo las estancias con fotos) -->
      <div v-if="category === 'photos' && model.rooms.length" class="gv-rooms" role="group" :aria-label="t('gallery.rooms', 'Estancias')" data-testid="gallery-viewer-rooms">
        <button type="button" class="gv-room" :class="{ 'gv-room-on': !room }" :aria-pressed="!room" data-gallery-room="" @click="selectRoom(null)">
          <span v-html="icon('photos', 14)" />{{ t('gallery.allRooms', 'Todas') }} <span class="gv-room-n">{{ model.photos.length }}</span>
        </button>
        <button v-for="r in model.rooms" :key="r.key" type="button" class="gv-room" :class="{ 'gv-room-on': room === r.key }" :aria-pressed="room === r.key" :data-gallery-room="r.key" @click="selectRoom(r.key)">
          <span v-html="icon(MEDIA_ROOM_ICON[r.key], 14)" />{{ r.label }} <span class="gv-room-n">{{ r.count }}</span>
        </button>
      </div>

      <!-- Cuadrícula de la categoría -->
      <div v-if="mode === 'grid'" ref="gridEl" class="gv-grid-wrap" data-testid="gallery-viewer-grid">
        <div class="gv-grid" :class="{ 'gv-grid-cards': category !== 'photos' }">
          <button
            v-for="(item, i) in list"
            :key="item.key"
            type="button"
            class="gv-card"
            :data-gallery-key="item.key"
            :aria-label="item.title || item.alt"
            @click="openItem(i)"
          >
            <span class="gv-card-media">
              <img v-if="item.thumb" :src="category === 'photos' ? item.src : item.thumb" :alt="item.alt" :width="item.width || undefined" :height="item.height || undefined" loading="lazy" decoding="async">
              <span v-else class="gv-card-empty" v-html="icon(GALLERY_CATEGORY_ICON[item.category], 28)" />
              <span v-if="item.kind === 'video' || item.kind === 'embed' || item.kind === 'link'" class="gv-play" v-html="icon(item.category === 'tour' ? 'tour' : 'play', 34)" />
              <span v-else-if="item.kind === 'pano'" class="gv-play" v-html="icon('pano360', 34)" />
            </span>
            <span v-if="item.title || item.room" class="gv-card-caption">
              <span v-if="item.title">{{ item.title }}</span>
              <span v-if="item.room" class="gv-card-room">{{ roomLabel(item.room) }}</span>
            </span>
          </button>
        </div>
      </div>

      <!-- Un elemento: foto grande, vídeo, plano, 360°, tour… -->
      <div v-else class="gv-stage-wrap">
        <button v-if="list.length > 1" type="button" class="gv-nav gv-nav-prev" :aria-label="t('mediaGallery.viewer.prev', 'Anterior')" data-testid="gallery-viewer-prev" @click="step(-1)"><span v-html="icon('prev', 26)" /></button>
        <div class="gv-stage" :data-kind="current?.kind" @pointerdown="onSwipeStart" @pointerup="onSwipeEnd">
          <template v-if="current">
            <img v-if="current.kind === 'image'" :key="current.key" :src="current.src" :alt="current.alt" class="gv-img" decoding="async" data-testid="gallery-viewer-image">

            <video v-else-if="current.kind === 'video'" :key="current.key" :src="current.src" :poster="current.thumb !== current.src ? current.thumb : undefined" controls playsinline class="gv-video" data-testid="gallery-viewer-video" />

            <ConsentGate v-else-if="current.kind === 'embed' && current.embed" :key="current.key" :provider="providerName(current.embed.provider)" :href="current.src" tone="dark" class="gv-embed-gate">
              <iframe
                :src="current.embed.src"
                :title="current.title || current.alt"
                class="gv-embed"
                loading="lazy"
                referrerpolicy="strict-origin-when-cross-origin"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen; xr-spatial-tracking"
                allowfullscreen
                data-testid="gallery-viewer-embed"
              />
            </ConsentGate>

            <div v-else-if="current.kind === 'link'" :key="current.key" class="gv-link" data-testid="gallery-viewer-link">
              <span v-html="icon(current.category === 'tour' ? 'tour' : 'external', 40)" />
              <p class="gv-link-title">{{ current.title || (current.category === 'tour' ? t('gallery.cat.tour', 'Tour virtual') : t('mediaGallery.video.open', 'Ver el vídeo')) }}</p>
              <p class="gv-link-hint">{{ t('gallery.externalHint', 'Se abre en el sitio del proveedor, en una pestaña nueva.') }}</p>
              <a :href="current.href || current.src" target="_blank" rel="noopener" class="gv-cta">{{ current.category === 'tour' ? t('mediaGallery.tour360.open', 'Abrir el tour virtual') : t('mediaGallery.video.open', 'Ver el vídeo') }} ↗</a>
            </div>

            <div v-else-if="current.kind === 'plan'" :key="current.key" class="gv-plan" data-testid="gallery-viewer-plan">
              <img :src="current.src" :alt="current.alt" class="gv-plan-img" decoding="async">
              <div class="gv-plan-tools">
                <button type="button" class="gv-cta" data-testid="gallery-viewer-plan-zoom" @click="planViewer = true"><span v-html="icon('zoomIn', 16)" />{{ t('floorPlans.expand', 'Ampliar') }}</button>
                <a :href="current.src" download class="gv-cta gv-cta-quiet" data-testid="gallery-viewer-plan-download"><span v-html="icon('download', 16)" />{{ t('gallery.download', 'Descargar') }}</a>
              </div>
              <PropertyFloorPlanViewer v-if="planViewer && current.plan" :plans="[current.plan]" :start="0" @close="closePlanViewer" />
            </div>

            <div v-else-if="current.kind === 'pano'" :key="current.key" class="gv-pano" data-testid="gallery-viewer-pano">
              <Pano360Viewer :src="current.src" :alt="current.alt" />
            </div>

            <div v-else-if="current.kind === 'compare' && current.compare" :key="current.key" class="gv-compare" data-testid="gallery-viewer-compare">
              <CompareSlider :before-src="current.compare.before" :after-src="current.compare.after" :before-label="current.compare.beforeLabel || undefined" :after-label="current.compare.afterLabel || undefined" />
            </div>

            <div v-else-if="current.kind === 'social' && current.social" :key="current.key" class="gv-social" data-testid="gallery-viewer-social">
              <SocialEmbed :platform="current.social.platform" :url="current.social.url" :caption="current.social.caption" />
            </div>
          </template>
        </div>
        <button v-if="list.length > 1" type="button" class="gv-nav gv-nav-next" :aria-label="t('mediaGallery.viewer.next', 'Siguiente')" data-testid="gallery-viewer-next" @click="step(1)"><span v-html="icon('next', 26)" /></button>

        <!-- Pie: título, estancia y descripción; y la tira de miniaturas -->
        <footer class="gv-foot">
          <div v-if="current && (current.title || current.description || current.room)" class="gv-caption" data-testid="gallery-viewer-caption">
            <p v-if="current.title || current.room" class="gv-caption-title">
              <span v-if="current.title">{{ current.title }}</span>
              <span v-if="current.room" class="gv-caption-room">{{ roomLabel(current.room) }}</span>
            </p>
            <p v-if="current.description" class="gv-caption-desc">{{ current.description }}</p>
          </div>
          <div v-if="list.length > 1" ref="stripEl" class="gv-thumbs" data-testid="gallery-viewer-thumbs">
            <button
              v-for="(item, i) in list"
              :key="item.key"
              type="button"
              class="gv-thumb"
              :class="{ 'gv-thumb-on': i === index }"
              :aria-label="`${t('mediaGallery.viewer.viewPhoto', 'Ver foto')} ${i + 1}`"
              :aria-current="i === index ? 'true' : undefined"
              :data-gallery-key="item.key"
              @click="goTo(i)"
            >
              <img v-if="item.thumb" :src="item.thumb" :alt="item.alt" loading="lazy" decoding="async">
              <span v-else class="gv-card-empty" v-html="icon(GALLERY_CATEGORY_ICON[item.category], 18)" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { GALLERY_CATEGORY_ICON, galleryRoomLabel, type GalleryCategoryKey, type GalleryDisplayOptions, type GalleryItem, type GalleryModel } from '~/utils/mediaGallery'
import { galleryIconSvg } from '~/utils/mediaGalleryIcons'
import { MEDIA_ROOM_ICON, type MediaRoom } from '~/utils/mediaRooms'

/**
 * Visor inmersivo de la galería (Cola 5): toda la ventana, con la navegación
 * arriba (volver, categorías, contador, cerrar), una cuadrícula por categoría
 * (con filtros por estancia en las fotos) y el modo de un elemento (foto
 * grande, vídeo con su reproductor, plano con zoom y descarga, 360° en su
 * visor, tour incrustado o enlace, antes/después, redes). Cambiar de
 * categoría no recarga nada. Esc cierra; ← → navegan; Tab se queda dentro.
 * Volver de un elemento a la cuadrícula conserva la posición; cerrar devuelve
 * a la ficha donde estaba (es una capa, no una página).
 */
const props = defineProps<{
  model: GalleryModel
  options: GalleryDisplayOptions
  name: string
  start: { category: GalleryCategoryKey; key?: string; room?: string }
  accent?: string | null
}>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const icon = (key: string, size: number) => galleryIconSvg(key, size, props.options.iconStyle)
const roomLabel = (room: MediaRoom) => galleryRoomLabel(room, t)
const providerName = (p: 'youtube' | 'vimeo' | 'matterport' | 'kuula' | 'floorfy') => ({ youtube: 'YouTube', vimeo: 'Vimeo', matterport: 'Matterport', kuula: 'Kuula', floorfy: 'Floorfy' })[p]

const category = ref<GalleryCategoryKey>(props.model.categories.some((c) => c.key === props.start.category) ? props.start.category : props.model.categories[0]?.key || 'photos')
const room = ref<MediaRoom | null>((props.start.room as MediaRoom) || null)
const activeCategory = computed(() => props.model.categories.find((c) => c.key === category.value) || { key: category.value, items: [] as GalleryItem[], count: 0, label: '', icon: 'photos', thumb: null })
const list = computed<GalleryItem[]>(() => (category.value === 'photos' && room.value ? props.model.photos.filter((x) => x.room === room.value) : activeCategory.value.items))

const mode = ref<'grid' | 'item'>('grid')
const index = ref(0)
const current = computed(() => list.value[index.value] || null)
const planViewer = ref(false)
const gridScroll = ref(0)
const gridEl = ref<HTMLElement | null>(null)
const stripEl = ref<HTMLElement | null>(null)
const root = ref<HTMLElement | null>(null)
const closeBtn = ref<HTMLButtonElement | null>(null)

function openItem(i: number) {
  gridScroll.value = gridEl.value?.scrollTop || 0
  index.value = Math.min(Math.max(i, 0), Math.max(list.value.length - 1, 0))
  mode.value = 'item'
  planViewer.value = false
  nextTick(scrollThumbIntoView)
}
function back() {
  if (mode.value === 'item' && activeCategory.value.count > 1) {
    mode.value = 'grid'
    nextTick(() => {
      if (gridEl.value) gridEl.value.scrollTop = gridScroll.value
    })
    return
  }
  emit('close')
}
function selectCategory(key: GalleryCategoryKey) {
  if (key === category.value) return
  category.value = key
  room.value = null
  index.value = 0
  gridScroll.value = 0
  mode.value = list.value.length === 1 ? 'item' : 'grid'
}
function selectRoom(key: MediaRoom | null) {
  room.value = key
  index.value = 0
  mode.value = 'grid'
}
function step(d: number) {
  const n = list.value.length
  if (n < 2) return
  index.value = (index.value + d + n) % n
  planViewer.value = false
  nextTick(scrollThumbIntoView)
}
function goTo(i: number) {
  index.value = i
  planViewer.value = false
  nextTick(scrollThumbIntoView)
}
function scrollThumbIntoView() {
  const el = stripEl.value?.querySelector<HTMLElement>('.gv-thumb-on')
  el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
}
function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
// El visor de planos (zoom) se abre encima; al cerrarlo, la página sigue bloqueada mientras este visor esté abierto.
function closePlanViewer() {
  planViewer.value = false
  nextTick(() => (document.documentElement.style.overflow = 'hidden'))
}

// Deslizar en el móvil para pasar de elemento (sólo fotos y planos: el vídeo y el 360 usan el gesto).
let swipeX = 0
let swipeAt = 0
function onSwipeStart(e: PointerEvent) {
  swipeX = e.clientX
  swipeAt = Date.now()
}
function onSwipeEnd(e: PointerEvent) {
  if (!current.value || (current.value.kind !== 'image' && current.value.kind !== 'plan')) return
  const dx = e.clientX - swipeX
  if (Math.abs(dx) > 60 && Date.now() - swipeAt < 800) step(dx < 0 ? 1 : -1)
}

// El teclado se escucha en todo el documento: al pasar de la cuadrícula a un elemento el botón pulsado
// desaparece y el foco cae al <body>, fuera del visor. El visor de planos (zoom) tiene su propio teclado.
function onKey(e: KeyboardEvent) {
  if (planViewer.value || (e.target as HTMLElement | null)?.closest?.('[data-testid="floor-plan-viewer"]')) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  } else if (e.key === 'ArrowRight' && mode.value === 'item') step(1)
  else if (e.key === 'ArrowLeft' && mode.value === 'item') step(-1)
  else if (e.key === 'Tab') trapFocus(e)
}
// El foco se queda dentro del visor mientras está abierto.
function trapFocus(e: KeyboardEvent) {
  const el = root.value
  if (!el) return
  const focusables = [...el.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, iframe, video, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled') && x.offsetParent !== null)
  if (!focusables.length) return
  const first = focusables[0]!
  const last = focusables[focusables.length - 1]!
  if (!el.contains(document.activeElement)) {
    e.preventDefault()
    first.focus()
  } else if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

// Arranque: en la foto pedida (modo elemento) o en la cuadrícula de la categoría.
onMounted(() => {
  const i = props.start.key ? list.value.findIndex((x) => x.key === props.start.key) : -1
  if (i >= 0) openItem(i)
  else mode.value = list.value.length === 1 ? 'item' : 'grid'
  document.documentElement.style.overflow = 'hidden'
  document.addEventListener('keydown', onKey)
  nextTick(() => closeBtn.value?.focus())
})
onBeforeUnmount(() => {
  document.documentElement.style.overflow = ''
  document.removeEventListener('keydown', onKey)
})

const cssVars = computed(() => ({
  '--gv-accent': props.accent || props.options.accent || '#ffffff',
  '--gv-radius': `${Math.min(props.options.radius, 12)}px`,
}))
</script>

<style scoped>
.gv {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  flex-direction: column;
  background: #0f0e0c;
  color: #fff;
  overscroll-behavior: contain;
}
.gv-font-display .gv-tab,
.gv-font-display .gv-room,
.gv-font-display .gv-counter,
.gv-font-display .gv-caption-title {
  font-family: var(--gm-font-display, inherit);
}
.gv-bar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.gv-btn {
  display: inline-flex;
  height: 40px;
  min-width: 40px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 9999px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.gv-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}
.gv-btn:focus-visible,
.gv-tab:focus-visible,
.gv-room:focus-visible,
.gv-card:focus-visible,
.gv-thumb:focus-visible,
.gv-nav:focus-visible,
.gv-cta:focus-visible {
  outline: 2px solid var(--gv-accent, #fff);
  outline-offset: 2px;
}
.gv-back-label {
  display: none;
}
.gv-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}
.gv-tabs::-webkit-scrollbar {
  display: none;
}
.gv-tab {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 7px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  padding: 5px 11px 5px 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.82);
  white-space: nowrap;
}
.gv-tab:hover {
  border-color: rgba(255, 255, 255, 0.4);
  color: #fff;
}
.gv-tab-on {
  background: #fff;
  border-color: #fff;
  color: #1c1b19;
}
.gv-tab-thumb {
  display: none;
  height: 26px;
  width: 36px;
  overflow: hidden;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.1);
}
.gv-tab-thumb img {
  height: 100%;
  width: 100%;
  object-fit: cover;
}
.gv-tab-ic {
  display: inline-flex;
}
.gv-tab-n {
  opacity: 0.7;
  font-size: 11px;
}
.gv-counter {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.75);
  white-space: nowrap;
}
.gv-rooms {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 8px 12px;
  scrollbar-width: none;
}
.gv-rooms::-webkit-scrollbar {
  display: none;
}
.gv-room {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  border-radius: 9999px;
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.75);
  white-space: nowrap;
}
.gv-room:hover {
  color: #fff;
}
.gv-room-on {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}
.gv-room-n {
  opacity: 0.6;
  font-size: 11px;
}
.gv-grid-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}
.gv-grid {
  display: grid;
  max-width: 1200px;
  margin: 0 auto;
  gap: 10px;
  grid-template-columns: 1fr;
}
.gv-grid-cards {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.gv-card {
  display: block;
  overflow: hidden;
  border-radius: var(--gv-radius, 12px);
  background: rgba(255, 255, 255, 0.06);
  text-align: left;
}
.gv-card-media {
  position: relative;
  display: block;
  aspect-ratio: 3 / 2;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
}
.gv-grid-cards .gv-card-media {
  aspect-ratio: 16 / 10;
}
.gv-card-media img {
  height: 100%;
  width: 100%;
  object-fit: cover;
}
.gv-card-empty {
  display: flex;
  height: 100%;
  width: 100%;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
}
.gv-play {
  position: absolute;
  left: 50%;
  top: 50%;
  display: flex;
  height: 56px;
  width: 56px;
  transform: translate(-50%, -50%);
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  backdrop-filter: blur(3px);
}
.gv-card-caption {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  padding: 8px 10px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.85);
}
.gv-card-room {
  opacity: 0.6;
}
.gv-stage-wrap {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}
.gv-stage {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  touch-action: pan-y;
}
.gv-img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
  border-radius: 4px;
  user-select: none;
}
.gv-video {
  max-height: 100%;
  width: 100%;
  max-width: 1100px;
  background: #000;
  border-radius: var(--gv-radius, 12px);
}
.gv-embed-gate {
  width: 100%;
  max-width: 1100px;
  height: 100%;
}
.gv-embed {
  display: block;
  height: 100%;
  width: 100%;
  min-height: 240px;
  border-radius: var(--gv-radius, 12px);
  background: #000;
}
.gv-link,
.gv-plan {
  display: flex;
  height: 100%;
  width: 100%;
  max-width: 1100px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
}
.gv-link-title {
  font-size: 20px;
  font-weight: 600;
}
.gv-link-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
}
.gv-cta {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  gap: 8px;
  border-radius: 9999px;
  background: #fff;
  padding: 0 18px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1c1b19;
}
.gv-cta-quiet {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
.gv-plan-img {
  min-height: 0;
  flex: 1;
  max-width: 100%;
  object-fit: contain;
  background: #fff;
  border-radius: 6px;
}
.gv-plan-tools {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.gv-pano,
.gv-compare,
.gv-social {
  height: 100%;
  width: 100%;
  max-width: 1100px;
  overflow: hidden;
  border-radius: var(--gv-radius, 12px);
}
.gv-social {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
}
.gv-nav {
  position: absolute;
  top: 50%;
  z-index: 2;
  display: none;
  height: 48px;
  width: 48px;
  transform: translateY(-50%);
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.92);
  color: #1c1b19;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}
.gv-nav-prev {
  left: 16px;
}
.gv-nav-next {
  right: 16px;
}
.gv-foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px 12px;
}
.gv-caption {
  text-align: center;
}
.gv-caption-title {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 10px;
  font-size: 14px;
  font-weight: 600;
}
.gv-caption-room {
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
}
.gv-caption-desc {
  margin: 4px auto 0;
  max-width: 720px;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.75);
}
.gv-thumbs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 2px;
  scrollbar-width: none;
}
.gv-thumbs::-webkit-scrollbar {
  display: none;
}
.gv-thumb {
  position: relative;
  flex: 0 0 auto;
  height: 54px;
  width: 78px;
  overflow: hidden;
  border-radius: 8px;
  border: 2px solid transparent;
  background: rgba(255, 255, 255, 0.06);
  opacity: 0.7;
}
.gv-thumb img {
  height: 100%;
  width: 100%;
  object-fit: cover;
}
.gv-thumb-on {
  border-color: var(--gv-accent, #fff);
  opacity: 1;
}
@media (min-width: 768px) {
  .gv-bar {
    padding: 12px 20px;
  }
  .gv-back-label {
    display: inline;
  }
  .gv-tab-thumb {
    display: block;
  }
  .gv-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .gv-grid-cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .gv-nav {
    display: flex;
  }
  .gv-stage {
    padding: 12px 80px;
  }
  .gv-thumb {
    height: 60px;
    width: 88px;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .gv-btn,
  .gv-tab,
  .gv-room,
  .gv-thumb {
    transition: background 0.18s, color 0.18s, border-color 0.18s, opacity 0.18s;
  }
}
</style>

<template>
  <div>
    <!-- Pestañas: sólo con más de un tipo de contenido (#111), en la esquina superior derecha de la
         foto para no mover la galería; con sólo fotos, la galería sin más. -->
    <div class="relative">
      <div v-if="tabs.length > 1" class="absolute right-3 top-3 z-10 flex max-w-[calc(100%-10.5rem)] gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="gallery-tabs">
        <button
          v-for="tabItem in tabs"
          :key="tabItem.key"
          type="button"
          class="gtab"
          :class="{ 'gtab-on': tab === tabItem.key }"
          :data-gallery-tab="tabItem.key"
          :aria-pressed="tab === tabItem.key"
          @click="tab = tabItem.key"
        >
          <span class="mr-1.5" v-html="tabItem.icon" />{{ tabItem.label }}
        </button>
      </div>

      <!-- FOTOS (#111): la foto principal panorámica con su etiqueta de estado, flechas y contador,
           y debajo cinco casillas: miniaturas y, si hay más, «+N fotos», que abre la galería completa. -->
      <div v-show="tab === 'fotos'" data-testid="gallery-photos">
        <div class="g-main" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
          <button type="button" class="block h-full w-full" :aria-label="t('mediaGallery.viewer.open', 'Ver la foto a pantalla completa')" data-testid="gallery-main" @click="openFull('photo', current)">
            <img :src="photos[current]" :alt="altFor(current)" class="h-full w-full object-cover" >
          </button>
          <span v-if="statusLabel" class="pointer-events-none absolute left-4 top-4 rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-ink shadow-sm" data-testid="gallery-status">{{ statusLabel }}</span>
          <template v-if="photos.length > 1">
            <button type="button" class="g-arrow left-4" :aria-label="t('mediaGallery.viewer.prev', 'Anterior')" data-testid="gallery-prev" @click="step(-1)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <button type="button" class="g-arrow right-4" :aria-label="t('mediaGallery.viewer.next', 'Siguiente')" data-testid="gallery-next" @click="step(1)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </template>
          <span v-if="photos.length" class="pointer-events-none absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur" data-testid="gallery-counter">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.2" /></svg>
            {{ current + 1 }} / {{ photos.length }}
          </span>
        </div>
        <div v-if="photos.length > 1" class="mt-2.5 grid grid-cols-5 gap-2 sm:gap-2.5" data-testid="gallery-thumbs">
          <button
            v-for="i in thumbIndexes"
            :key="i"
            type="button"
            class="g-thumb"
            :class="{ 'g-thumb-on': i === current }"
            :aria-label="`${t('mediaGallery.viewer.viewPhoto', 'Ver foto')} ${i + 1}`"
            :aria-current="i === current ? 'true' : undefined"
            data-testid="gallery-thumb"
            @click="current = i"
          >
            <img :src="photos[i]" :alt="altFor(i)" class="h-full w-full object-cover" loading="lazy" >
          </button>
          <button v-if="morePhotos > 0" type="button" class="g-more" data-testid="gallery-more" @click="openFull('photo', current)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01" /></svg>
            <span>+ {{ morePhotos }} {{ t('mediaGallery.photos.more', 'fotos') }}</span>
          </button>
        </div>
      </div>

      <!-- Redes sociales -->
      <div v-show="tab === 'redes'" class="min-h-[540px] overflow-hidden rounded-[14px] bg-ink">
        <div v-if="socialMedia?.length" class="flex h-full items-center gap-6 overflow-x-auto px-6 py-6 [scrollbar-width:thin]">
          <SocialEmbed v-for="s in socialMedia" :key="s.url" :platform="s.platform" :url="s.url" :caption="s.caption" />
        </div>
        <div v-else class="flex h-full items-center justify-center text-center">
          <div class="max-w-sm px-6 text-white/80">
            <p class="font-serif text-2xl text-white">{{ t('mediaGallery.social.title', 'Vídeos en Instagram y TikTok') }}</p>
            <p class="mt-2 text-sm">{{ t('mediaGallery.social.desc', 'Solicita que añadamos los vídeos de esta propiedad en redes sociales.') }}</p>
            <NuxtLink to="/contacto" class="mt-5 inline-flex bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink">{{ t('mediaGallery.social.cta', 'Solicitar vídeos') }}</NuxtLink>
          </div>
        </div>
      </div>

      <!-- 360: sólo con un tour virtual o una foto 360 reales (FASE 7). Antes
           simulaba el tour arrastrando la primera foto aunque no hubiera ninguno. -->
      <div v-if="hasReal360" v-show="tab === '360'" class="g-stage relative bg-ink" data-testid="gallery-360">
        <template v-if="panoramas.length">
          <!-- Visor esférico (WebGL); sin WebGL, la foto se recorre en horizontal. -->
          <Pano360Viewer :key="panoramas[panoIndex].url" :src="panoramas[panoIndex].url" :alt="panoramas[panoIndex].alt || panoramas[panoIndex].title || `${name} 360°`" />
          <div class="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-[11px] uppercase tracking-widest2 text-white backdrop-blur">
            ◐ {{ t('mediaGallery.tour360.hint', 'Arrastra para mirar alrededor') }}
          </div>
          <div v-if="panoramas.length > 1" class="absolute left-4 top-4 flex gap-1.5">
            <button v-for="(p, i) in panoramas" :key="p.url" type="button" class="rounded-full px-3 py-1 text-[11px] font-semibold" :class="i === panoIndex ? 'bg-white text-ink' : 'bg-black/50 text-white'" @click="panoIndex = i">{{ p.title || `360° ${i + 1}` }}</button>
          </div>
        </template>
        <div v-if="tours.length" class="flex flex-wrap gap-2" :class="panoramas.length ? 'absolute bottom-4 right-4' : 'h-full items-center justify-center'">
          <a v-for="tour in tours" :key="tour.url" :href="tour.url" target="_blank" rel="noopener" class="inline-flex bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink">
            {{ tour.title || t('mediaGallery.tour360.open', 'Abrir el tour virtual') }} ↗
          </a>
        </div>
      </div>

      <!-- Vídeo: todos los publicables (FASE 7). Un vídeo subido se reproduce
           aquí; YouTube y Vimeo, con su reproductor sin cookies incrustado
           (utils/videoEmbed.ts); cualquier otro enlace externo se abre aparte. -->
      <div v-show="tab === 'video'" class="g-stage flex flex-col items-center justify-center gap-3 bg-ink text-center" data-testid="gallery-videos">
        <template v-if="videos.length">
          <video v-if="!isExternal(videos[videoIndex].url)" :key="videos[videoIndex].url" :src="videos[videoIndex].url" controls class="min-h-0 w-full flex-1 rounded-2xl object-cover" />
          <!-- Reproductor de un tercero: sólo con el consentimiento de «Contenido de terceros» (ConsentGate). -->
          <ConsentGate
            v-else-if="currentEmbed"
            :key="currentEmbed.src"
            :provider="currentEmbed.provider === 'youtube' ? 'YouTube' : 'Vimeo'"
            :href="videos[videoIndex].url"
            tone="dark"
            class="min-h-0 w-full flex-1"
          >
            <iframe
              :src="currentEmbed.src"
              :title="videos[videoIndex].title || `${name} — ${t('mediaGallery.tabs.video', 'Vídeo')}`"
              class="min-h-0 w-full flex-1 rounded-2xl"
              loading="lazy"
              referrerpolicy="strict-origin-when-cross-origin"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowfullscreen
              data-testid="gallery-video-embed"
            />
          </ConsentGate>
          <div v-else class="flex flex-1 items-center justify-center">
            <a :href="videos[videoIndex].url" target="_blank" rel="noopener" class="inline-flex bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink">{{ videos[videoIndex].title || t('mediaGallery.video.open', 'Ver el vídeo') }} ↗</a>
          </div>
          <div v-if="videos.length > 1" class="flex flex-wrap justify-center gap-1.5 pb-3">
            <button v-for="(v, i) in videos" :key="v.url" type="button" class="rounded-full px-3 py-1 text-[11px] font-semibold" :class="i === videoIndex ? 'bg-white text-ink' : 'bg-white/20 text-white'" @click="videoIndex = i">{{ v.title || `${t('mediaGallery.tabs.video', 'Vídeo')} ${i + 1}` }}</button>
          </div>
        </template>
        <div v-else class="max-w-sm px-6 text-white/80">
          <p class="font-serif text-2xl text-white">{{ t('mediaGallery.video.title', 'Vídeo profesional') }}</p>
          <p class="mt-2 text-sm">{{ t('mediaGallery.video.desc', 'Solicita el vídeo tour de esta propiedad y te lo enviamos en menos de 24 h.') }}</p>
          <NuxtLink to="/contacto" class="mt-5 inline-flex bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink">{{ t('mediaGallery.video.cta', 'Solicitar vídeo') }}</NuxtLink>
        </div>
      </div>

      <!-- Renders (FASE 7) -->
      <div v-if="renders.length" v-show="tab === 'renders'" class="g-stage grid grid-cols-2 gap-2 !overflow-y-auto lg:grid-cols-3" data-testid="gallery-renders">
        <figure v-for="r in renders" :key="r.url" class="relative overflow-hidden rounded-xl bg-stone-100">
          <img :src="r.url" :alt="r.alt || r.title || name" class="h-full w-full object-cover" loading="lazy" >
          <figcaption v-if="r.caption || r.title" class="absolute inset-x-0 bottom-0 bg-black/50 px-3 py-1.5 text-[11px] text-white">{{ r.caption || r.title }}</figcaption>
        </figure>
      </div>

      <!-- Drone -->
      <div v-show="tab === 'drone'" class="g-stage relative flex items-center justify-center bg-ink text-center">
        <template v-if="drones.length">
          <video v-if="drones[droneIndex].isVideo" :key="drones[droneIndex].url" :src="drones[droneIndex].url" controls class="h-full w-full object-cover" />
          <img v-else :src="drones[droneIndex].url" :alt="drones[droneIndex].alt || `${name} ${t('mediaGallery.drone.alt', 'vista aérea')}`" class="h-full w-full cursor-zoom-in object-cover" @click="openFull('drone')" >
          <div v-if="drones.length > 1" class="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
            <button v-for="(d, i) in drones" :key="d.url" type="button" class="h-2.5 w-2.5 rounded-full" :class="i === droneIndex ? 'bg-white' : 'bg-white/40'" :aria-label="`Toma aérea ${i + 1}`" @click="droneIndex = i" />
          </div>
        </template>
        <div v-else class="max-w-sm px-6 text-white/80">
          <p class="font-serif text-2xl text-white">{{ t('mediaGallery.drone.title', 'Vista aérea con drone') }}</p>
          <p class="mt-2 text-sm">{{ t('mediaGallery.drone.desc', 'Solicita una toma aérea profesional de esta propiedad y su entorno.') }}</p>
          <NuxtLink to="/contacto" class="mt-5 inline-flex bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink">{{ t('mediaGallery.drone.cta', 'Solicitar vista aérea') }}</NuxtLink>
        </div>
      </div>

      <!-- Noche -->
      <div v-show="tab === 'noche'" class="g-stage relative flex items-center justify-center bg-ink text-center">
        <img v-if="nightPhoto" :src="nightPhoto" :alt="`${name} ${t('mediaGallery.night.alt', 'vista nocturna')}`" class="h-full w-full cursor-zoom-in object-cover" @click="openFull('night')" >
        <div v-else class="max-w-sm px-6 text-white/80">
          <p class="font-serif text-2xl text-white">{{ t('mediaGallery.night.title', 'Fotografía nocturna') }}</p>
          <p class="mt-2 text-sm">{{ t('mediaGallery.night.desc', 'Solicita una sesión al atardecer o de noche para resaltar la iluminación de esta propiedad.') }}</p>
          <NuxtLink to="/contacto" class="mt-5 inline-flex bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink">{{ t('mediaGallery.night.cta', 'Solicitar sesión nocturna') }}</NuxtLink>
        </div>
      </div>

      <!-- Antes / Después -->
      <div v-if="beforePhoto && afterPhoto" v-show="tab === 'antes-despues'" class="g-stage">
        <CompareSlider :before-src="beforePhoto" :after-src="afterPhoto" />
      </div>

      <!-- Decoración IA -->
      <div v-show="tab === 'decoracion-ia'" class="g-stage bg-ink">
        <CompareSlider v-if="aiStagedPhoto" :before-src="photos[0]" :after-src="aiStagedPhoto" :before-label="t('mediaGallery.compare.emptyBefore', 'Vacío')" :after-label="t('mediaGallery.compare.withAi', 'Con IA')" />
        <div v-else class="flex h-full items-center justify-center text-center">
          <div class="max-w-sm px-6 text-white/80">
            <p class="font-serif text-2xl text-white">{{ t('mediaGallery.aiDecor.title', 'Decoración virtual con IA') }}</p>
            <p class="mt-2 text-sm">{{ t('mediaGallery.aiDecor.desc', 'Solicita una simulación de decoración con inteligencia artificial para visualizar el potencial de esta propiedad amueblada.') }}</p>
            <NuxtLink to="/contacto" class="mt-5 inline-flex bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink">{{ t('mediaGallery.aiDecor.cta', 'Solicitar decoración IA') }}</NuxtLink>
          </div>
        </div>
      </div>

      <!-- Plano: los planos de la vivienda (#110) y el de la promoción; el visor amplía sin recortar. -->
      <div v-show="tab === 'plano'" class="g-stage relative flex flex-col border border-line bg-white" data-testid="gallery-plans">
        <div v-if="planItems.length > 1" class="flex flex-wrap gap-1.5 border-b border-line p-3" :class="{ 'pr-48': tabs.length > 1 }">
          <button v-for="(pl, i) in planItems" :key="pl.id" type="button" class="rounded-full border px-3 py-1 text-[12px]" :class="i === planIndex ? 'border-ink bg-ink text-white' : 'border-line text-stone-600'" @click="planIndex = i">{{ pl.title }}</button>
        </div>
        <button v-if="planItems[planIndex]" type="button" class="flex min-h-0 flex-1 items-center justify-center p-4" :aria-label="t('floorPlans.openFull', 'Ver el plano a pantalla completa')" @click="planViewer = true">
          <img :src="mediaUrl(planItems[planIndex].image)" :alt="`${name} — ${planItems[planIndex].title}`" class="max-h-full max-w-full cursor-zoom-in object-contain" >
        </button>
        <PropertyFloorPlanViewer v-if="planViewer" :plans="planItems" :start="planIndex" @close="planViewer = false" />
      </div>

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
          >
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
            <img :src="p" :alt="`${t('mediaGallery.viewer.thumbnail', 'Miniatura')} ${i + 1}`" loading="lazy" >
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { PublicFloorPlan } from '~/utils/floorPlans'
interface PublicMediaItem {
  id?: number
  mediaType: string
  url: string
  isFile?: boolean
  title?: string | null
  alt?: string | null
  caption?: string | null
  isMain?: boolean
}

const props = defineProps<{
  photos: string[]
  /** Texto alternativo de cada foto (mismo orden que `photos`). */
  photoAlts?: string[]
  name: string
  /** Ya no decide nada: el 360 sólo aparece con un tour o una foto 360 reales. Se conserva por compatibilidad. */
  hasTour?: boolean
  masterPlan?: string | null
  videoUrl?: string | null
  dronePhoto?: string | null
  nightPhoto?: string | null
  beforePhoto?: string | null
  afterPhoto?: string | null
  aiStagedPhoto?: string | null
  socialMedia?: { platform: 'instagram' | 'tiktok'; url: string; caption?: string | null }[]
  /** Multimedia publicable de la propiedad (FASE 7): vídeos, tours, renders, drone y 360. */
  media?: PublicMediaItem[]
  /** Enlace del tour virtual de la ficha ampliada (si lo hay). */
  virtualTourUrl?: string | null
  /** Planos de la vivienda (#110, paso «Planos» del editor): el mismo recurso que la sección «Plano de la vivienda». */
  floorPlans?: PublicFloorPlan[]
  /** Etiqueta de estado sobre la foto principal (#111), p. ej. «Obra nueva». */
  statusLabel?: string | null
}>()

function isExternal(url: string) {
  return /^https?:\/\//i.test(url)
}
function altFor(i: number) {
  return props.photoAlts?.[i] || (i === 0 ? props.name : `${props.name} ${i + 1}`)
}
const byType = (type: string) => (props.media || []).filter((m) => m.mediaType === type).sort((a, b) => Number(!!b.isMain) - Number(!!a.isMain))
const videos = computed(() => {
  const list: { url: string; title?: string | null }[] = []
  if (props.videoUrl) list.push({ url: isExternal(props.videoUrl) ? props.videoUrl : mediaUrl(props.videoUrl), title: null })
  for (const v of byType('video')) if (!list.some((x) => x.url === v.url)) list.push({ url: v.url, title: v.title })
  return list
})
const videoIndex = ref(0)
const currentEmbed = computed(() => videoEmbed(videos.value[videoIndex.value]?.url))
const tours = computed(() => {
  const list: { url: string; title?: string | null }[] = byType('virtual_tour').map((m) => ({ url: m.url, title: m.title }))
  if (props.virtualTourUrl && !list.some((x) => x.url === props.virtualTourUrl)) list.push({ url: props.virtualTourUrl, title: null })
  return list
})
const panoramas = computed(() => byType('pano360').map((m) => ({ url: m.url, title: m.title, alt: m.alt })))
const panoIndex = ref(0)
const hasReal360 = computed(() => panoramas.value.length > 0 || tours.value.length > 0)
const renders = computed(() => byType('render').map((m) => ({ url: m.url, title: m.title, alt: m.alt, caption: m.caption })))
const drones = computed(() => {
  const list: { url: string; alt?: string | null; isVideo: boolean }[] = []
  if (props.dronePhoto) list.push({ url: props.dronePhoto, alt: null, isVideo: false })
  for (const d of byType('drone')) list.push({ url: d.url, alt: d.alt, isVideo: /\.(mp4|webm)$/i.test(d.url) })
  return list
})
const droneIndex = ref(0)

const { t } = useI18n()

// Sólo las pestañas con contenido de verdad (#110): antes Redes, Vídeo, Drone,
// Noche y Decoración salían siempre y, vacías, invitaban a «Solicitar…».
const tabs = computed(() => {
  const tb: { key: string; label: string; icon: string }[] = [
    { key: 'fotos', label: t('mediaGallery.tabs.photos', 'Fotos'), icon: ic('grid') },
  ]
  if (props.socialMedia?.length) tb.push({ key: 'redes', label: t('mediaGallery.tabs.social', 'Redes'), icon: ic('social') })
  if (videos.value.length) tb.push({ key: 'video', label: videos.value.length > 1 ? `${t('mediaGallery.tabs.videos', 'Vídeos')} (${videos.value.length})` : t('mediaGallery.tabs.video', 'Vídeo'), icon: ic('play') })
  if (hasReal360.value) tb.push({ key: '360', label: t('mediaGallery.tabs.tour360', '360°'), icon: ic('globe') })
  if (planItems.value.length) tb.push({ key: 'plano', label: planItems.value.length > 1 ? `${t('mediaGallery.tabs.plans', 'Planos')} (${planItems.value.length})` : t('mediaGallery.tabs.plan', 'Plano'), icon: ic('plan') })
  if (renders.value.length) tb.push({ key: 'renders', label: t('mediaGallery.tabs.renders', 'Renders'), icon: ic('sparkle') })
  if (drones.value.length) tb.push({ key: 'drone', label: t('mediaGallery.tabs.drone', 'Drone'), icon: ic('drone') })
  if (props.nightPhoto) tb.push({ key: 'noche', label: t('mediaGallery.tabs.night', 'Noche'), icon: ic('night') })
  if (props.beforePhoto && props.afterPhoto) tb.push({ key: 'antes-despues', label: t('mediaGallery.tabs.beforeAfter', 'Antes / Después'), icon: ic('compare') })
  if (props.aiStagedPhoto) tb.push({ key: 'decoracion-ia', label: t('mediaGallery.tabs.aiDecor', 'Decoración IA'), icon: ic('sparkle') })
  return tb
})
// Pestaña «Plano»: los planos de la vivienda y, al final, el plano de la promoción.
const planItems = computed<PublicFloorPlan[]>(() => [
  ...(props.floorPlans || []),
  ...(props.masterPlan ? [{ id: -1, title: t('mediaGallery.plan.masterPlan', 'Plano de la promoción'), image: props.masterPlan, sizes: null, floorDetails: null }] : []),
])
const planIndex = ref(0)
const planViewer = ref(false)
const tab = ref('fotos')


// --- Foto principal (#111): la actual, sus flechas, el deslizamiento en el móvil y las casillas ---
const current = ref(0)
watch(
  () => props.photos.length,
  (n) => {
    if (current.value >= n) current.value = 0
  },
)
function step(d: number) {
  const n = props.photos.length
  if (n > 1) current.value = (current.value + d + n) % n
}
// Cinco casillas: con más de cinco fotos, cuatro miniaturas y «+N fotos» (N = las que no se ven).
const THUMB_CELLS = 5
const visibleThumbs = computed(() => (props.photos.length > THUMB_CELLS ? THUMB_CELLS - 1 : props.photos.length))
const morePhotos = computed(() => (props.photos.length > THUMB_CELLS ? props.photos.length - visibleThumbs.value : 0))
// La ventana de miniaturas sigue a la foto actual para que siempre se vea marcada.
const thumbIndexes = computed(() => {
  const n = props.photos.length
  const v = visibleThumbs.value
  const startAt = current.value < v ? 0 : Math.min(current.value - v + 1, n - v)
  return Array.from({ length: v }, (_, k) => startAt + k)
})
let touchX = 0
function onTouchStart(e: TouchEvent) {
  touchX = e.changedTouches[0]?.clientX ?? 0
}
function onTouchEnd(e: TouchEvent) {
  const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX
  if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1)
}

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
  if (full.value?.kind === 'photo') current.value = full.value.index
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
      return drones.value[droneIndex.value]?.url || props.dronePhoto || ''
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
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  white-space: nowrap;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.92);
  padding: 0.4rem 0.8rem;
  font-size: 12px;
  font-weight: 600;
  color: #44403c;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(4px);
  transition: background 0.18s, color 0.18s;
}
.gtab:hover {
  background: #fff;
  color: #16150f;
}
.gtab-on {
  background: #16150f;
  color: #fff;
}
.gtab-on:hover {
  background: #16150f;
  color: #fff;
}

.g-main {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 14px;
  background: #f1eee8;
}
.g-stage {
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 14px;
}
@media (min-width: 640px) {
  .g-main,
  .g-stage {
    aspect-ratio: 16 / 9;
  }
}
@media (min-width: 1024px) {
  .g-main,
  .g-stage {
    aspect-ratio: 2.2 / 1;
  }
}
.g-arrow {
  position: absolute;
  top: 50%;
  display: flex;
  height: 44px;
  width: 44px;
  transform: translateY(-50%);
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.92);
  color: #1c1b19;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  transition: background 0.15s, transform 0.15s;
}
.g-arrow:hover {
  background: #fff;
}
.g-arrow:active {
  transform: translateY(-50%) scale(0.95);
}
.g-thumb,
.g-more {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 9px;
  background: #f1eee8;
}
.g-thumb {
  border: 2px solid transparent;
  transition: border-color 0.15s, opacity 0.15s;
}
.g-thumb:hover {
  opacity: 0.9;
}
.g-thumb-on {
  border-color: #bcd3e8;
  box-shadow: 0 0 0 1px #8fb3d6;
}
.g-more {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: #1f3a30;
  padding: 4px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  color: #fff;
  text-align: center;
  transition: background 0.15s;
}
.g-more:hover {
  background: #183027;
}
.g-arrow:focus-visible,
.g-thumb:focus-visible,
.g-more:focus-visible {
  outline: 2px solid #1c1b19;
  outline-offset: 2px;
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

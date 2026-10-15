<template>
  <section data-testid="ficha-gallery">
    <PropertyGalleryMosaic :model="model" :options="options" :status-label="statusLabel" :accent="accent" @open="open" />
    <LazyPropertyGalleryViewer v-if="viewer" :model="model" :options="options" :name="name" :start="viewer" :accent="accent" @close="close" />
  </section>
</template>

<script setup lang="ts">
import { buildGalleryModel, type GalleryCategoryKey, type GalleryDisplayOptions, type GalleryInput } from '~/utils/mediaGallery'

/**
 * El bloque de galería de la ficha (Cola 5): construye el modelo una vez a
 * partir de la respuesta de la ficha y pone el mosaico; el visor se monta
 * sólo al abrirlo. «Atrás» del navegador cierra el visor (se apunta una
 * entrada en el historial al abrirlo) y la ficha sigue donde estaba.
 */
const props = defineProps<{
  data: GalleryInput
  options: GalleryDisplayOptions
  statusLabel?: string | null
  accent?: string | null
}>()
const { t } = useI18n()
const model = computed(() => buildGalleryModel(props.data, t))
const name = computed(() => String(props.data.project?.name || ''))

type Target = { category: GalleryCategoryKey; key?: string; room?: string }
const viewer = ref<Target | null>(null)
let opener: HTMLElement | null = null
let pushed = false
let readingY = 0

function open(target: Target) {
  opener = (document.activeElement as HTMLElement | null) || null
  readingY = window.scrollY
  viewer.value = target
  try {
    window.history.pushState({ ...(window.history.state || {}), galleryViewer: true }, '')
    pushed = true
  } catch {
    pushed = false
  }
}
function close() {
  if (!viewer.value) return
  if (pushed && window.history.state?.galleryViewer) {
    // La entrada del historial se consume: popstate hace el resto.
    window.history.back()
    return
  }
  finishClose()
}
function finishClose() {
  pushed = false
  viewer.value = null
  // La ficha sigue exactamente donde se estaba leyendo (el historial no debe moverla).
  nextTick(() => {
    opener?.focus?.({ preventScroll: true })
    if (Math.abs(window.scrollY - readingY) > 1) window.scrollTo(0, readingY)
  })
}
function onPop() {
  if (viewer.value) finishClose()
}
onMounted(() => window.addEventListener('popstate', onPop))
onBeforeUnmount(() => window.removeEventListener('popstate', onPop))

defineExpose({ model })
</script>

<template>
  <div class="gm-wrap" :class="[`gm-font-${options.font}`]" :style="cssVars" data-testid="gallery-mosaic">
    <!-- Mosaico (Cola 5): la portada grande a la izquierda y las secundarias en rejilla a la derecha; en el móvil,
         la principal al ancho y el resto en un carrusel. Cualquier foto abre el visor en esa foto. -->
    <div v-if="model.total" class="gm" :data-layout="layout.layout" :data-shown="layout.shown">
      <button
        v-for="(item, i) in shownPhotos"
        :key="item.key"
        type="button"
        class="gm-cell"
        :class="{ 'gm-main': i === 0 }"
        :aria-label="i === 0 ? t('gallery.openPhoto', 'Ver la foto en grande') : `${t('gallery.openPhoto', 'Ver la foto en grande')} ${i + 1}`"
        :data-testid="i === 0 ? 'gallery-main' : 'gallery-cell'"
        :data-gallery-key="item.key"
        @click="emit('open', { category: 'photos', key: item.key })"
      >
        <img
          :src="i === 0 ? item.src : item.thumb"
          :alt="item.alt"
          :width="item.width || undefined"
          :height="item.height || undefined"
          :loading="i === 0 ? 'eager' : 'lazy'"
          :fetchpriority="i === 0 ? 'high' : undefined"
          decoding="async"
          class="gm-img"
        >
      </button>

      <span v-if="statusLabel" class="gm-status" data-testid="gallery-status">{{ statusLabel }}</span>
      <span v-if="options.showCounter" class="gm-counter" data-testid="gallery-counter">
        <span class="gm-ic" v-html="icon('photos', 14)" />1 / {{ model.total }}
      </span>
      <button v-if="options.showAllButton" type="button" class="gm-all" data-testid="gallery-see-all" @click="emit('open', { category: 'photos' })">
        <span class="gm-ic" v-html="icon('images', 16)" />
        {{ t('gallery.seeAll', 'Ver todas las fotos') }} ({{ model.total }})
      </button>
    </div>

    <!-- Sin fotos pero con otro contenido (vídeo, planos…): la primera categoría que tenga miniatura. -->
    <div v-else-if="model.categories.length" class="gm gm-empty" data-layout="one">
      <button type="button" class="gm-cell gm-main" :aria-label="model.categories[0].label" data-testid="gallery-main" @click="emit('open', { category: model.categories[0].key })">
        <img v-if="model.categories[0].thumb" :src="model.categories[0].thumb" :alt="model.categories[0].label" class="gm-img" loading="eager" decoding="async">
        <span v-else class="gm-placeholder"><span v-html="icon(model.categories[0].icon, 28)" /></span>
      </button>
    </div>

    <!-- Móvil: carrusel con el resto de fotos (el mosaico sólo pinta la principal). -->
    <div v-if="model.total > 1" class="gm-strip" data-testid="gallery-strip">
      <button
        v-for="(item, i) in model.photos.slice(1, 13)"
        :key="item.key"
        type="button"
        class="gm-strip-cell"
        :aria-label="`${t('gallery.openPhoto', 'Ver la foto en grande')} ${i + 2}`"
        @click="emit('open', { category: 'photos', key: item.key })"
      >
        <img :src="item.thumb" :alt="item.alt" class="gm-img" loading="lazy" decoding="async">
      </button>
      <button v-if="model.total > 13 && options.showAllButton" type="button" class="gm-strip-cell gm-strip-more" @click="emit('open', { category: 'photos' })">+{{ model.total - 13 }}</button>
    </div>

    <!-- Categorías: sólo las que tienen contenido real (backend) y las estancias con fotos. -->
    <div v-if="options.categories !== 'hidden' && chips.length > 1" class="gm-cats" :class="`gm-cats-${options.categories}`" role="list" :aria-label="t('gallery.categories', 'Categorías de la galería')" data-testid="gallery-categories">
      <button
        v-for="c in chips"
        :key="c.id"
        type="button"
        class="gm-cat"
        role="listitem"
        :data-gallery-category="c.category"
        :data-gallery-room="c.room || undefined"
        @click="emit('open', { category: c.category, room: c.room || undefined })"
      >
        <span v-if="options.categories === 'cards'" class="gm-cat-thumb" aria-hidden="true">
          <img v-if="c.thumb" :src="c.thumb" alt="" loading="lazy" decoding="async">
        </span>
        <span class="gm-cat-ic" v-html="icon(c.icon, options.categories === 'cards' ? 16 : 15)" />
        <span class="gm-cat-label">{{ c.label }}</span>
        <span class="gm-cat-n">{{ c.count }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { mosaicLayout, galleryNavChips, GALLERY_COVER_RATIO, type GalleryCategoryKey, type GalleryDisplayOptions, type GalleryModel } from '~/utils/mediaGallery'
import { galleryIconSvg } from '~/utils/mediaGalleryIcons'

const props = defineProps<{
  model: GalleryModel
  options: GalleryDisplayOptions
  statusLabel?: string | null
  /** Color de los estados activos: el de la opción o el de la marca. */
  accent?: string | null
}>()
const emit = defineEmits<{ open: [target: { category: GalleryCategoryKey; key?: string; room?: string }] }>()
const { t } = useI18n()

const layout = computed(() => mosaicLayout(props.model.total))
const shownPhotos = computed(() => props.model.photos.slice(0, layout.value.shown))
const icon = (key: string, size: number) => galleryIconSvg(key, size, props.options.iconStyle)

// Categorías y, después, las estancias con fotos (misma fila, como en la referencia).
// Cuando hay barra de navegación propia (options.navBar), el mosaico no pinta
// su fila interna: la barra la sustituye para no duplicar la navegación.
const chips = computed(() => (props.options.navBar !== 'off' ? [] : galleryNavChips(props.model)))

// La proporción del mosaico entero en escritorio: la portada ocupa la mitad (o dos tercios), así
// que la proporción del contenedor es la de la portada por lo que ésta no ocupa.
const containerRatio = computed(() => {
  const cover = GALLERY_COVER_RATIO[props.options.height]
  switch (layout.value.layout) {
    case 'one':
      return cover * 1.25
    case 'three':
      return cover * 1.5
    default:
      return cover * 2
  }
})
const cssVars = computed(() => ({
  '--gm-gap': `${props.options.gap}px`,
  '--gm-radius': `${props.options.radius}px`,
  '--gm-ratio': String(containerRatio.value),
  '--gm-accent': props.accent || props.options.accent || '#1c1b19',
}))
</script>

<style scoped>
.gm-wrap {
  position: relative;
}
.gm-font-display .gm-all,
.gm-font-display .gm-cat,
.gm-font-display .gm-counter {
  font-family: var(--gm-font-display, inherit);
}
.gm {
  position: relative;
  display: grid;
  gap: var(--gm-gap, 4px);
  overflow: hidden;
  border-radius: var(--gm-radius, 14px);
  background: #f1eee8;
  aspect-ratio: 4 / 3;
}
.gm-cell {
  position: relative;
  display: none;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #e9e5de;
}
.gm-cell.gm-main {
  display: block;
}
.gm-img {
  display: block;
  height: 100%;
  width: 100%;
  object-fit: cover;
}
.gm-cell:hover .gm-img {
  transform: scale(1.03);
}
.gm-cell:focus-visible {
  outline: 3px solid #fff;
  outline-offset: -4px;
}
.gm-placeholder {
  display: flex;
  height: 100%;
  width: 100%;
  align-items: center;
  justify-content: center;
  color: #a8a29e;
}
.gm-status {
  pointer-events: none;
  position: absolute;
  left: 14px;
  top: 14px;
  border-radius: 9999px;
  background: #fff;
  padding: 6px 14px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #1c1b19;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}
.gm-counter {
  pointer-events: none;
  position: absolute;
  bottom: 14px;
  left: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.55);
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  backdrop-filter: blur(4px);
}
.gm-ic {
  display: inline-flex;
}
.gm-all {
  position: absolute;
  bottom: 14px;
  right: 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 9999px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #fff;
  padding: 9px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #1c1b19;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.14);
}
.gm-all:hover {
  background: var(--gm-accent, #1c1b19);
  border-color: var(--gm-accent, #1c1b19);
  color: #fff;
}
.gm-all:focus-visible,
.gm-cat:focus-visible,
.gm-strip-cell:focus-visible {
  outline: 2px solid var(--gm-accent, #1c1b19);
  outline-offset: 2px;
}

/* Carrusel del móvil */
.gm-strip {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.gm-strip::-webkit-scrollbar {
  display: none;
}
.gm-strip-cell {
  position: relative;
  flex: 0 0 38%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: calc(var(--gm-radius, 14px) * 0.6);
  background: #e9e5de;
  scroll-snap-align: start;
}
.gm-strip-more {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gm-accent, #1c1b19);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
}

/* Categorías */
.gm-cats {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.gm-cats::-webkit-scrollbar {
  display: none;
}
.gm-cat {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 7px;
  border: 1px solid #e7e2da;
  border-radius: 9999px;
  background: #fff;
  padding: 7px 12px 7px 10px;
  font-size: 12.5px;
  font-weight: 600;
  color: #44403c;
  white-space: nowrap;
}
.gm-cat:hover {
  border-color: var(--gm-accent, #1c1b19);
  color: #1c1b19;
}
.gm-cat-ic {
  display: inline-flex;
  color: #78716c;
}
.gm-cat:hover .gm-cat-ic {
  color: var(--gm-accent, #1c1b19);
}
.gm-cat-n {
  border-radius: 9999px;
  background: #f1eee8;
  padding: 1px 7px;
  font-size: 11px;
  color: #57534e;
}
.gm-cats-cards .gm-cat {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 128px;
  border-radius: calc(var(--gm-radius, 14px) * 0.7);
  padding: 6px;
}
.gm-cat-thumb {
  display: block;
  aspect-ratio: 16 / 10;
  width: 100%;
  overflow: hidden;
  border-radius: calc(var(--gm-radius, 14px) * 0.5);
  background: #e9e5de;
}
.gm-cat-thumb img {
  height: 100%;
  width: 100%;
  object-fit: cover;
}
.gm-cats-cards .gm-cat-label {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* Escritorio: el mosaico de verdad */
@media (min-width: 768px) {
  .gm {
    aspect-ratio: var(--gm-ratio, 2.8);
    grid-template-columns: 2fr 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  .gm-cell {
    display: block;
  }
  .gm-main {
    grid-column: 1;
    grid-row: 1 / span 2;
  }
  .gm[data-layout='one'] {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
  }
  .gm[data-layout='two'] {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr;
  }
  .gm[data-layout='two'] .gm-main {
    grid-row: 1;
  }
  .gm[data-layout='three'] {
    grid-template-columns: 2fr 1fr;
  }
  .gm[data-layout='four'] .gm-cell:nth-child(4) {
    grid-column: 2 / span 2;
  }
  .gm-strip {
    display: none;
  }
  .gm-status {
    left: 18px;
    top: 18px;
  }
  .gm-counter {
    left: 18px;
    bottom: 18px;
  }
  .gm-all {
    right: 18px;
    bottom: 18px;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .gm-img {
    transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .gm-all,
  .gm-cat {
    transition: background 0.18s, color 0.18s, border-color 0.18s;
  }
}
</style>

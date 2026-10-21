<template>
  <nav
    class="gnav"
    :class="[`gnav-${options.navBar}`, `gnav-font-${options.font}`]"
    :style="cssVars"
    :aria-label="t('gallery.categories', 'Categorías de la galería')"
    data-testid="gallery-nav"
  >
    <div class="gnav-row" role="list">
      <button
        v-for="c in chips"
        :key="c.id"
        type="button"
        class="gnav-chip"
        role="listitem"
        :data-gallery-category="c.category"
        :data-gallery-room="c.room || undefined"
        :data-testid="`gallery-nav-chip-${c.room ? `room-${c.room}` : c.category}`"
        @click="emit('open', { category: c.category, room: c.room || undefined })"
      >
        <span class="gnav-ic" v-html="icon(c.icon, 15)" />
        <span class="gnav-label">{{ c.label }}</span>
        <span class="gnav-n">{{ c.count }}</span>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { galleryNavChips, type GalleryCategoryKey, type GalleryDisplayOptions, type GalleryModel } from '~/utils/mediaGallery'
import { galleryIconSvg } from '~/utils/mediaGalleryIcons'

/**
 * Barra de navegación propia de la galería (Cola 21): las mismas categorías y
 * estancias que el mosaico, pero como elemento aparte, siempre visible y
 * opcionalmente anclada (sticky) al desplazar la ficha. Cada chip abre el
 * visor en esa categoría/estancia (reutiliza el evento `open` del bloque). No
 * se pinta si no hay al menos dos destinos (una sola categoría no es
 * navegación).
 */
const props = defineProps<{
  model: GalleryModel
  options: GalleryDisplayOptions
  /** Color de los estados activos; el de la opción o el de la marca. */
  accent?: string | null
}>()
const emit = defineEmits<{ open: [target: { category: GalleryCategoryKey; key?: string; room?: string }] }>()
const { t } = useI18n()

const chips = computed(() => galleryNavChips(props.model))
const icon = (key: string, size: number) => galleryIconSvg(key, size, props.options.iconStyle)
const cssVars = computed(() => ({
  '--gnav-radius': `${props.options.radius}px`,
  '--gnav-accent': props.accent || props.options.accent || '#1c1b19',
}))
</script>

<style scoped>
.gnav {
  margin-bottom: 12px;
}
.gnav-sticky {
  position: sticky;
  top: 0;
  z-index: 20;
  /* Un fondo propio para que al anclarse no se solape con el contenido que pasa por debajo. */
  margin-left: -4px;
  margin-right: -4px;
  padding: 8px 4px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
}
.gnav-font-display .gnav-chip {
  font-family: var(--gm-font-display, inherit);
}
.gnav-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.gnav-row::-webkit-scrollbar {
  display: none;
}
.gnav-chip {
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
.gnav-chip:hover {
  border-color: var(--gnav-accent, #1c1b19);
  color: #1c1b19;
}
.gnav-chip:focus-visible {
  outline: 2px solid var(--gnav-accent, #1c1b19);
  outline-offset: 2px;
}
.gnav-ic {
  display: inline-flex;
  color: #78716c;
}
.gnav-chip:hover .gnav-ic {
  color: var(--gnav-accent, #1c1b19);
}
.gnav-n {
  border-radius: 9999px;
  background: #f1eee8;
  padding: 1px 7px;
  font-size: 11px;
  color: #57534e;
}
@media (prefers-reduced-motion: no-preference) {
  .gnav-chip {
    transition: background 0.18s, color 0.18s, border-color 0.18s;
  }
}
</style>

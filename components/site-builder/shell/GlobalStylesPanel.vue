<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" data-testid="global-styles-panel" @click.self="$emit('close')">
    <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <p class="text-lg font-serif">Estilos globales</p>
          <p class="mt-0.5 text-[12px] text-stone-500">Lo que hereda toda la página. Un elemento con estilo propio lo conserva.</p>
        </div>
        <button type="button" class="text-stone-300 hover:text-ink" aria-label="Cerrar estilos globales" @click="$emit('close')">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <FontFamilyField label="Tipografía de los títulos" :model-value="styles.fontHeading" inherited="Inter, la del sitio" :brand-fonts="brandFonts" :overridden="!!styles.fontHeading" @update:model-value="set('fontHeading', $event)" />
      <FontFamilyField label="Tipografía del texto" :model-value="styles.fontBody" inherited="Inter, la del sitio" :brand-fonts="brandFonts" :overridden="!!styles.fontBody" @update:model-value="set('fontBody', $event)" />
      <NumberField label="Radio de los botones" :model-value="styles.buttonRadius" :min="0" :max="BUTTON_RADIUS_MAX" :overridden="styles.buttonRadius !== undefined" test-id="global-button-radius" @update:model-value="set('buttonRadius', $event)" />

      <p v-if="brandFonts.length" class="text-[11px] text-stone-400">Las fuentes de tu Brand Kit aparecen primero en cada lista.</p>
      <p v-else class="text-[11px] text-stone-400">
        Sin fuentes de marca todavía — defínelas en <NuxtLink to="/admin/asset-export/brand-kit" target="_blank" class="underline">Brand Kit</NuxtLink> y saldrán aquí primero.
      </p>
      <p class="mt-3 text-[11px] text-stone-400">Se guarda con el resto de la página y se publica al pulsar "Publicar cambios".</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BUTTON_RADIUS_MAX, type SiteGlobalStyles } from '~/utils/siteBuilder/globalStyles'
import FontFamilyField from '../inspector/fields/FontFamilyField.vue'
import NumberField from '../inspector/fields/NumberField.vue'

/**
 * Panel de estilos globales de la página (utils/siteBuilder/globalStyles.ts):
 * las tipografías que heredan títulos y texto y el radio de los botones.
 * Muta el objeto `styles` del shell directamente, como los inspectores
 * mutan `content`; `sbBeginEdit` deja el estado anterior en la pila de
 * deshacer.
 */
const props = defineProps<{ styles: SiteGlobalStyles; brandFonts: string[] }>()
defineEmits<{ close: [] }>()
const beginEdit = inject<() => void>('sbBeginEdit', () => {})

function set<K extends keyof SiteGlobalStyles>(key: K, value: SiteGlobalStyles[K] | undefined) {
  beginEdit()
  if (value === undefined || value === '') {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete props.styles[key]
  } else {
    props.styles[key] = value
  }
}
</script>

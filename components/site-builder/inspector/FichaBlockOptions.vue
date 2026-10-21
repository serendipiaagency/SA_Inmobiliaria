<template>
  <div data-testid="ficha-block-options">
    <!-- Tarjeta principal: lo que acompaña al título. La referencia y la descripción son de cada propiedad; aquí sólo si se enseñan. -->
    <InspectorSection v-if="has('b.summary')" title="Tarjeta principal">
      <ToggleField label="Referencia («Ref.»)" :model-value="ficha.showReference" data-testid="page-core-show-reference" @update:model-value="(v) => set('showReference', v)" />
      <ToggleField label="Descripción bajo el título" :model-value="ficha.showDescription" data-testid="page-core-show-description" @update:model-value="(v) => set('showDescription', v)" />
      <p class="mt-1 text-[11px] leading-relaxed text-stone-400">La referencia es el «Código comercial» de cada propiedad y sólo sale si lo tiene. La descripción larga se recorta con «Ver más».</p>
    </InspectorSection>

    <InspectorSection v-if="has('b.description')" title="Descripción">
      <SegmentedField
        label="Líneas visibles antes de «Ver más»"
        :model-value="String(ficha.descriptionLines)"
        :options="FICHA_CHOICES.descriptionLines.values.map((n) => ({ value: String(n), label: String(n) }))"
        data-testid="page-core-description-lines"
        @update:model-value="(v) => set('descriptionLines', Number(v))"
      />
      <ToggleField label="Mostrar la descripción" :model-value="ficha.showDescription" data-testid="page-core-description-visible" @update:model-value="(v) => set('showDescription', v)" />
      <p class="mt-1 text-[11px] leading-relaxed text-stone-400">El texto es el de cada propiedad (Propiedades → Descripción). Si cabe en las líneas elegidas, no sale «Ver más». El título «Descripción» se reescribe en el lienzo.</p>
    </InspectorSection>

    <InspectorSection v-if="has('b.keyfacts')" title="Datos clave">
      <SegmentedField
        label="Columnas en escritorio"
        :model-value="String(ficha.factsColumns)"
        :options="[{ value: 'auto', label: 'En fila' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }]"
        data-testid="page-core-facts-columns"
        @update:model-value="(v) => set('factsColumns', v === 'auto' ? 'auto' : Number(v))"
      />
      <p class="mt-1 text-[11px] leading-relaxed text-stone-400">Habitaciones, baños, superficie… salen de los datos de la propiedad: sólo los que tiene. «En fila» es la disposición de siempre, con separadores; en tableta y móvil se adapta sola.</p>
    </InspectorSection>

    <!-- Galería multimedia (Cola 5): sólo presentación. Las categorías (fotos, vídeos, planos, 360°, tour…) las decide cada propiedad. -->
    <InspectorSection v-if="has('b.gallery')" title="Galería" data-testid="page-core-gallery">
      <SegmentedField label="Altura del mosaico" :model-value="gallery.height" :options="[{ value: 'compact', label: 'Compacta' }, { value: 'standard', label: 'Normal' }, { value: 'tall', label: 'Alta' }]" data-testid="page-core-gallery-height" @update:model-value="(v) => setGallery('height', v)" />
      <SelectField label="Separación entre fotos" :model-value="String(gallery.gap)" :options="GALLERY_GAPS.map((g) => ({ value: String(g), label: g === 0 ? 'Sin separación' : `${g} px` }))" data-testid="page-core-gallery-gap" @update:model-value="(v) => setGallery('gap', Number(v))" />
      <SliderField label="Esquinas" :model-value="gallery.radius" :min="0" :max="GALLERY_RADIUS_MAX" :step="2" unit="px" data-testid="page-core-gallery-radius" @update:model-value="(v) => setGallery('radius', v)" />
      <ToggleField label="Contador «1 / N»" :model-value="gallery.showCounter" data-testid="page-core-gallery-counter" @update:model-value="(v) => setGallery('showCounter', v)" />
      <ToggleField label="Botón «Ver todas las fotos»" :model-value="gallery.showAllButton" data-testid="page-core-gallery-see-all" @update:model-value="(v) => setGallery('showAllButton', v)" />
      <SegmentedField label="Categorías bajo el mosaico" :model-value="gallery.categories" :options="[{ value: 'chips', label: 'Etiquetas' }, { value: 'cards', label: 'Tarjetas' }, { value: 'hidden', label: 'Ocultas' }]" data-testid="page-core-gallery-categories" @update:model-value="(v) => setGallery('categories', v)" />
      <SegmentedField label="Barra de navegación propia" :model-value="gallery.navBar" :options="[{ value: 'off', label: 'No' }, { value: 'top', label: 'Fija arriba' }, { value: 'sticky', label: 'Anclada' }]" data-testid="page-core-gallery-navbar" @update:model-value="(v) => setGallery('navBar', v)" />
      <SegmentedField label="Iconos" :model-value="gallery.iconStyle" :options="[{ value: 'outline', label: 'Trazo' }, { value: 'solid', label: 'Marcado' }]" data-testid="page-core-gallery-icons" @update:model-value="(v) => setGallery('iconStyle', v)" />
      <SegmentedField label="Tipografía de etiquetas" :model-value="gallery.font" :options="[{ value: 'inherit', label: 'Texto' }, { value: 'display', label: 'Títulos' }]" data-testid="page-core-gallery-font" @update:model-value="(v) => setGallery('font', v)" />
      <SegmentedField label="Color de acento" :model-value="galleryAccentMode" :options="[{ value: 'brand', label: 'Color de marca' }, { value: 'custom', label: 'Otro color' }]" data-testid="page-core-gallery-accent-mode" @update:model-value="setGalleryAccentMode" />
      <ColorField v-if="galleryAccentMode === 'custom'" label="Color" :model-value="gallery.accent || undefined" test-id="page-core-gallery-accent" @update:model-value="(v) => setGallery('accent', v && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null)" />
      <p class="mt-1 text-[11px] leading-relaxed text-stone-400">El mosaico (portada grande y secundarias), «Ver todas las fotos (n)» y las categorías del visor se rellenan con la multimedia real de cada propiedad: fotos clasificadas por estancia, vídeos, planos, 360° y tour virtual. Una categoría sin contenido no aparece. Esto sólo cambia cómo se ve.</p>
    </InspectorSection>

    <EnergyOptionsFields v-if="has('s.energia')" :value="content.energy" content-title="Eficiencia energética" :design-tab="designTab" @set="setEnergy" />

    <!-- Exposición solar: la puntuación la da un proveedor con licencia y no se edita; aquí, su estado. -->
    <InspectorSection v-if="has('s.exposicion')" title="Exposición solar" data-testid="page-core-solar">
      <p class="rounded-lg bg-stone-100 px-3 py-2 text-[12px] leading-relaxed text-stone-600" data-testid="page-core-solar-status">{{ SOLAR_PROVIDER_STATUS.name }} · {{ SOLAR_PROVIDER_STATUS.message }}</p>
      <p class="mt-2 text-[11px] leading-relaxed text-stone-400">La puntuación (SunScore), las horas de sol y el enlace al visor 3D son los del proveedor para cada propiedad: no se escriben ni se editan aquí. Con el acceso pendiente, la sección no sale en la web publicada. Aquí se ve con datos de demostración rotulados, para diseñarla. Se oculta o se reordena en «Avanzado» y el título se reescribe en el lienzo.</p>
    </InspectorSection>

    <InspectorSection v-if="has('s.ubicacion')" title="Mapa de la ubicación">
      <SegmentedField
        label="Altura del mapa"
        :model-value="ficha.mapHeight"
        :options="[{ value: 'compact', label: 'Baja' }, { value: 'standard', label: 'Normal' }, { value: 'tall', label: 'Alta' }]"
        data-testid="page-core-map-height"
        @update:model-value="(v) => set('mapHeight', v)"
      />
      <p class="mt-1 text-[11px] leading-relaxed text-stone-400">El mapa y su punto salen de la propiedad: sin coordenadas, la sección enseña su aviso. El nivel de zoom no se puede cambiar: así una propiedad con ubicación aproximada no revela la exacta.</p>
    </InspectorSection>

    <InspectorSection v-if="has('b.contact')" title="Atendido por">
      <SegmentedField
        label="Fondo de la tarjeta"
        :model-value="toneMode"
        :options="[{ value: 'brand', label: 'Color de marca' }, { value: 'white', label: 'Blanco' }, { value: 'custom', label: 'Otro color' }]"
        data-testid="page-core-contact-tone"
        @update:model-value="setToneMode"
      />
      <ColorField v-if="toneMode === 'custom'" label="Color" :model-value="ficha.contactTone.startsWith('#') ? ficha.contactTone : undefined" test-id="page-core-contact-color" @update:model-value="setToneColor" />
      <p class="mt-1 text-[11px] leading-relaxed text-stone-400">Un tono suave para que destaque: el de tu color de marca o el que elijas, aclarado lo necesario para que se lea bien. En escritorio la tarjeta se queda a la vista al bajar por la ficha.</p>
      <p class="mt-2 text-[11px] leading-relaxed text-stone-400" data-testid="contact-form-note">
        El comercial y el formulario son los reales: cada mensaje crea un lead de esa propiedad. Los textos («Atendido por», el título, la frase y el botón) se reescriben en el lienzo; los campos, las validaciones, el consentimiento y la protección antispam no se tocan.
      </p>
    </InspectorSection>

    <InspectorSection v-if="has('b.similar')" title="Propiedades destacadas">
      <p class="mb-3 text-[12px] leading-relaxed text-stone-500">
        Debajo de «Propiedades similares», las que marcas como <strong>Exclusiva</strong> en Propiedades (web), sin repetir la que se está viendo ni las similares. Si no hay ninguna, la sección no aparece.
      </p>
      <ToggleField label="Mostrar en la ficha" :model-value="content.showFeatured !== false" data-testid="page-core-show-featured" @update:model-value="(v) => set('showFeatured', v)" />
      <TextField v-if="content.showFeatured !== false" label="Título" :model-value="content.featuredTitle || ''" placeholder="Propiedades destacadas" @update:model-value="(v) => set('featuredTitle', v)" />
    </InspectorSection>

    <!-- Avanzado: visibilidad y orden de una sección. Los bloques que la ficha necesita para funcionar no se ocultan. -->
    <InspectorSection v-if="advanced && sectionKey" title="Visibilidad y orden" tab="advanced">
      <ToggleField label="Mostrar en la ficha" :model-value="sectionVisible" :data-testid="`ficha-section-visible`" @update:model-value="toggleSection" />
      <div class="mt-2 flex gap-2">
        <button type="button" class="btn-quiet flex-1 !py-1.5 !text-[11px]" :disabled="sectionIndex <= 0" data-testid="ficha-section-up" @click="moveSection(-1)">↑ Subir</button>
        <button type="button" class="btn-quiet flex-1 !py-1.5 !text-[11px]" :disabled="sectionIndex < 0 || sectionIndex >= sectionCount - 1" data-testid="ficha-section-down" @click="moveSection(1)">↓ Bajar</button>
      </div>
      <p class="mt-2 text-[11px] leading-relaxed text-stone-400">Vale para todas las fichas. Ocultarla no borra nada: los datos siguen en cada propiedad. Con «Ocultar automáticamente si no hay datos», una sección sin datos en una propiedad no sale aunque esté visible.</p>
    </InspectorSection>
    <InspectorSection v-else-if="advanced && required" title="Visibilidad y orden" tab="advanced">
      <p class="text-[12px] leading-relaxed text-stone-500" data-testid="ficha-required-note">Este bloque no se puede ocultar ni mover: sin él la ficha dejaría de funcionar. Sí puedes cambiar su aspecto en «Diseño» y, por tamaño de pantalla, sus espaciados.</p>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import { SOLAR_PROVIDER_STATUS } from '~/utils/solarExposure'
import InspectorSection from './InspectorSection.vue'
import ToggleField from './fields/ToggleField.vue'
import TextField from './fields/TextField.vue'
import SegmentedField from './fields/SegmentedField.vue'
import ColorField from './fields/ColorField.vue'
import SelectField from './fields/SelectField.vue'
import SliderField from './fields/SliderField.vue'
import EnergyOptionsFields from './EnergyOptionsFields.vue'
import { GALLERY_GAPS, GALLERY_RADIUS_MAX } from '~/utils/mediaGallery'
import { FICHA_CHOICES, fichaDisplayOptions, normalizeFichaSections } from '~/utils/siteBuilder/pages'
import { fichaNodeRequired } from '~/utils/siteBuilder/fichaNodes'

/**
 * Las opciones propias de cada bloque de la ficha editable (Cola 7), todas
 * sólo de presentación: los datos siguen saliendo de la propiedad. Con
 * `field` enseña las del bloque seleccionado (el inspector de un nodo); sin
 * él, todas seguidas (el inspector de la zona entera, sin nodo elegido).
 *
 * Cada control cambia una opción de `block.content` que la web ya lee
 * (PAGE_CORE_OPTIONS, utils/siteBuilder/pages.ts): lo que se cambia aquí se
 * ve en el lienzo y en la web publicada. No hay controles sin efecto.
 */
const props = withDefaults(defineProps<{ content: Record<string, any>; field?: string | null; designTab?: boolean; advanced?: boolean }>(), {
  field: null,
  designTab: false,
  advanced: false,
})
const beginEdit = inject<() => void>('sbBeginEdit', () => {})

const has = (f: string) => !props.field || props.field === f
const ficha = computed(() => fichaDisplayOptions(props.content))

function set(key: string, value: unknown) {
  beginEdit()
  props.content[key] = value
}

// «Atendido por»: marca, blanco u otro color.
const customTone = ref(false)
const toneMode = computed(() => (customTone.value || ficha.value.contactTone.startsWith('#') ? 'custom' : ficha.value.contactTone))
function setToneMode(v: string) {
  customTone.value = v === 'custom'
  if (v === 'brand' || v === 'white') set('contactTone', v)
}
function setToneColor(v: string | undefined) {
  if (v && /^#[0-9a-f]{6}$/i.test(v)) set('contactTone', v.toLowerCase())
  else if (!v) set('contactTone', 'brand')
}

// Galería: se guarda el objeto `gallery` con sólo lo que difiere de lo de partida (el servidor lo compacta).
const gallery = computed(() => ficha.value.gallery)
const customGalleryAccent = ref(false)
const galleryAccentMode = computed(() => (customGalleryAccent.value || gallery.value.accent ? 'custom' : 'brand'))
function setGallery(key: string, value: unknown) {
  set('gallery', { ...(props.content.gallery && typeof props.content.gallery === 'object' ? props.content.gallery : {}), [key]: value })
}
function setGalleryAccentMode(v: string) {
  customGalleryAccent.value = v === 'custom'
  if (v === 'brand') setGallery('accent', null)
}
function setEnergy(key: string, value: unknown) {
  set('energy', { ...(props.content.energy && typeof props.content.energy === 'object' ? props.content.energy : {}), [key]: value })
}

// Visibilidad y orden de una sección de la lista (`sections`). Los bloques fijos no figuran en ella.
const sectionKey = computed(() => (props.field && props.field.startsWith('s.') ? props.field.slice(2) : null))
const required = computed(() => !!props.field && fichaNodeRequired(props.field))
const sections = computed(() => normalizeFichaSections(props.content.sections))
const sectionIndex = computed(() => sections.value.findIndex((x) => x.key === sectionKey.value))
const sectionCount = computed(() => sections.value.length)
const sectionVisible = computed(() => sections.value[sectionIndex.value]?.visible !== false)
function saveSections(next: { key: string; visible: boolean; open?: boolean }[]) {
  beginEdit()
  props.content.sections = next
}
function toggleSection() {
  saveSections(sections.value.map((x) => (x.key === sectionKey.value ? { ...x, visible: !x.visible } : x)))
}
function moveSection(dir: -1 | 1) {
  const next = sections.value.map((x) => ({ ...x }))
  const i = sectionIndex.value
  const j = i + dir
  if (i < 0 || j < 0 || j >= next.length) return
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  saveSections(next)
}
</script>

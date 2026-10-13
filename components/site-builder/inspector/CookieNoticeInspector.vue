<template>
  <div data-testid="cookie-inspector">
    <div v-if="tab === 'content'" class="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-[12px] text-violet-900">
      <p class="font-semibold">Aviso de cookies — elemento global</p>
      <p class="mt-1 text-violet-800">
        Sale igual en todas las páginas de tu web. Lo que cambies aquí se ve en la muestra del lienzo al momento y llega a la web al pulsar «Publicar».
        La lógica del consentimiento no cambia: nada opcional se carga antes de decidir, Rechazar y Aceptar tienen el mismo peso y los enlaces legales
        salen siempre.
      </p>
    </div>

    <!-- Estado de la muestra: en las tres pestañas -->
    <div class="mb-4 rounded-lg border border-line bg-stone-50 p-2.5">
      <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Muestra del lienzo</p>
      <div class="flex gap-1 rounded-lg bg-white p-1" data-testid="cookie-preview-state">
        <button v-for="s in PREVIEW_STATES" :key="s.key" type="button" class="flex-1 rounded-md px-2 py-1.5 text-[12px] font-semibold transition" :class="previewState === s.key ? 'bg-ink text-white' : 'text-stone-500 hover:text-ink'" :data-testid="`cookie-preview-${s.key}`" @click="setPreview(s.key)">
          {{ s.label }}
        </button>
      </div>
      <p class="mt-1.5 text-[11px] text-stone-500">No registra ningún consentimiento: puedes pulsar Configurar, Rechazar o Aceptar sin que se guarde nada. Escritorio, tableta y móvil, con los botones de arriba.</p>
    </div>

    <!-- ===================== Contenido ===================== -->
    <InspectorSection title="Idioma de los textos">
      <SelectField label="Editar los textos en" :model-value="lang" :options="CONSENT_LOCALES.map((l) => ({ value: l, label: CONSENT_LOCALE_LABELS[l] }))" hint="Cada idioma tiene su texto; el que dejes vacío usa el de la web en ese idioma." data-testid="cookie-text-locale" @update:model-value="(v) => (lang = v as ConsentLocale)" />
    </InspectorSection>

    <InspectorSection v-for="group in TEXT_GROUPS" :key="group.key" :title="group.label" :default-open="group.key === 'main'">
      <TextField
        v-for="def in textsOf(group.key)"
        :key="def.key"
        :label="def.label"
        :multiline="def.multiline"
        :rows="3"
        :placeholder="t(def.i18nKey)"
        :model-value="config.texts[lang][def.key]"
        :data-testid="`cookie-text-${def.key}`"
        @update:model-value="(v) => (config.texts[lang][def.key] = v)"
      />
      <p v-if="group.key === 'categories'" class="text-[11px] text-stone-500">
        Las categorías son las que la web usa de verdad: aquí cambias cómo se llaman y cómo se describen, no qué contiene cada una. «Publicidad» sólo sale
        si tu web tiene un píxel de Meta (Cookies de la web → servicios).
      </p>
      <p v-if="group.key === 'legal'" class="text-[11px] text-stone-500">Los enlaces van a /cookies y /privacidad de tu web y salen siempre; aquí sólo se cambia su texto.</p>
    </InspectorSection>

    <InspectorSection title="Qué se enseña">
      <ToggleField label="Descripción de cada categoría en el resumen" :model-value="config.behavior.showCategoryDescriptions" data-testid="cookie-show-descriptions" @update:model-value="(v) => (config.behavior.showCategoryDescriptions = v)" />
      <ToggleField label="Cómo cambiar la decisión («Configurar cookies» al pie)" :model-value="config.behavior.showChangeText" data-testid="cookie-show-change" @update:model-value="(v) => (config.behavior.showChangeText = v)" />
      <ToggleField label="«Responsable: razón social»" :model-value="config.behavior.showController" data-testid="cookie-show-controller" @update:model-value="(v) => (config.behavior.showController = v)" />
    </InspectorSection>

    <InspectorSection title="Datos legales">
      <div v-if="profile?.legalMissing.length" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900" data-testid="cookie-legal-warning">
        <p class="font-semibold">Configuración pendiente</p>
        <p class="mt-0.5">
          La ficha de tu empresa no tiene {{ profile.legalMissing.map((k) => LEGAL_FIELD_LABELS[k]).join(', ') }}: la política de cookies y la de privacidad lo
          ponen «por confirmar». Un super admin lo completa en Sistema → Empresas.
        </p>
      </div>
      <p v-else class="text-[12px] text-stone-500" data-testid="cookie-legal-ok">La política de cookies y la de privacidad se generan con los datos legales de tu empresa, que están completos.</p>
    </InspectorSection>

    <!-- ===================== Diseño ===================== -->
    <InspectorSection title="Logo" tab="design">
      <ToggleField label="Mostrar el logo" :model-value="config.design.showLogo" data-testid="cookie-show-logo" @update:model-value="(v) => (config.design.showLogo = v)" />
      <template v-if="config.design.showLogo">
        <p class="mb-2 text-[12px] text-stone-500">
          <template v-if="profile?.logo">Sin elegir otro, el logo del Brand Kit.</template>
          <template v-else>Tu Brand Kit no tiene logo: el aviso no enseña ninguno hasta que lo subas aquí o en el Brand Kit.</template>
        </p>
        <ImageField label="Logo propio (opcional)" folder="site-builder" aspect="auto" fit="contain" :model-value="config.design.logo" @update:model-value="(v) => (config.design.logo = v)" />
        <SegmentedField label="Tamaño" :model-value="config.design.logoSize" :options="[{ value: 'sm', label: 'Pequeño' }, { value: 'md', label: 'Normal' }, { value: 'lg', label: 'Grande' }]" data-testid="cookie-logo-size" @update:model-value="(v) => (config.design.logoSize = v as any)" />
      </template>
    </InspectorSection>

    <InspectorSection title="Colores" tab="design">
      <p class="mb-3 text-[11px] text-stone-500">Sin elegir: blanco cálido, texto gris cálido y el color de tu marca en el botón principal y los interruptores (oscurecido si hace falta para que el blanco se lea).</p>
      <ColorField label="Fondo" :model-value="config.design.background || undefined" :brand-colors="brandColors" :inherited="palette.background" test-id="cookie-color-background" @update:model-value="(v) => (config.design.background = v || '')" />
      <ColorField label="Título" :model-value="config.design.title || undefined" :brand-colors="brandColors" :inherited="palette.title" test-id="cookie-color-title" @update:model-value="(v) => (config.design.title = v || '')" />
      <ColorField label="Texto" :model-value="config.design.text || undefined" :brand-colors="brandColors" :inherited="palette.text" test-id="cookie-color-text" @update:model-value="(v) => (config.design.text = v || '')" />
      <ColorField label="Botón principal e interruptores" :model-value="config.design.accent || undefined" :brand-colors="brandColors" :inherited="palette.accent" test-id="cookie-color-accent" @update:model-value="(v) => (config.design.accent = v || '')" />
      <ColorField label="Texto del botón principal" :model-value="config.design.accentText || undefined" :brand-colors="brandColors" :inherited="palette.accentText" test-id="cookie-color-accent-text" @update:model-value="(v) => (config.design.accentText = v || '')" />
      <ColorField label="Bordes" :model-value="config.design.border || undefined" :brand-colors="brandColors" :inherited="palette.border" test-id="cookie-color-border" @update:model-value="(v) => (config.design.border = v || '')" />
      <ColorField label="Enlaces" :model-value="config.design.link || undefined" :brand-colors="brandColors" :inherited="palette.link" test-id="cookie-color-link" @update:model-value="(v) => (config.design.link = v || '')" />
      <ColorField label="Fondo oscurecido" :model-value="config.design.overlay || undefined" :brand-colors="brandColors" :inherited="palette.overlay" test-id="cookie-color-overlay" @update:model-value="(v) => (config.design.overlay = v || '')" />
      <SliderField label="Opacidad del fondo oscurecido" :min="0" :max="80" :step="5" :model-value="config.design.overlayOpacity" data-testid="cookie-overlay-opacity" @update:model-value="(v) => (config.design.overlayOpacity = v)" />
    </InspectorSection>

    <InspectorSection title="Forma" tab="design">
      <SliderField label="Radio de las esquinas" :min="0" :max="32" :step="2" unit=" px" :model-value="config.design.radius" data-testid="cookie-radius" @update:model-value="(v) => (config.design.radius = v)" />
      <SegmentedField label="Sombra" :model-value="config.design.shadow" :options="[{ value: 'none', label: 'Sin' }, { value: 'soft', label: 'Suave' }, { value: 'strong', label: 'Marcada' }]" data-testid="cookie-shadow" @update:model-value="(v) => (config.design.shadow = v as any)" />
      <SegmentedField label="Botones" :model-value="config.design.buttonShape" :options="[{ value: 'pill', label: 'Píldora' }, { value: 'rounded', label: 'Redondeados' }, { value: 'square', label: 'Rectos' }]" data-testid="cookie-button-shape" @update:model-value="(v) => (config.design.buttonShape = v as any)" />
    </InspectorSection>

    <InspectorSection title="Tipografía y espacios" tab="design">
      <SegmentedField label="Fuente del título" :model-value="config.design.titleFont" :options="[{ value: 'serif', label: 'Títulos' }, { value: 'sans', label: 'Texto' }]" data-testid="cookie-title-font" @update:model-value="(v) => (config.design.titleFont = v as any)" />
      <SegmentedField label="Tamaño del título" :model-value="config.design.titleSize" :options="[{ value: 'sm', label: 'Pequeño' }, { value: 'md', label: 'Normal' }, { value: 'lg', label: 'Grande' }]" data-testid="cookie-title-size" @update:model-value="(v) => (config.design.titleSize = v as any)" />
      <SegmentedField label="Peso del título" :model-value="config.design.titleWeight" :options="[{ value: 'normal', label: 'Normal' }, { value: 'semibold', label: 'Medio' }, { value: 'bold', label: 'Negrita' }]" data-testid="cookie-title-weight" @update:model-value="(v) => (config.design.titleWeight = v as any)" />
      <SegmentedField label="Alineación del título" :model-value="config.design.titleAlign" :options="[{ value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centro' }]" data-testid="cookie-title-align" @update:model-value="(v) => (config.design.titleAlign = v as any)" />
      <SegmentedField label="Tamaño del texto" :model-value="config.design.fontSize" :options="[{ value: 'sm', label: 'Pequeño' }, { value: 'md', label: 'Normal' }, { value: 'lg', label: 'Grande' }]" data-testid="cookie-font-size" @update:model-value="(v) => (config.design.fontSize = v as any)" />
      <SegmentedField label="Espaciado" :model-value="config.design.spacing" :options="[{ value: 'compact', label: 'Compacto' }, { value: 'normal', label: 'Normal' }, { value: 'airy', label: 'Amplio' }]" data-testid="cookie-spacing" @update:model-value="(v) => (config.design.spacing = v as any)" />
    </InspectorSection>

    <!-- ===================== Avanzado ===================== -->
    <InspectorSection title="Posición" tab="advanced">
      <SelectField label="Dónde sale" :model-value="config.layout.position" :options="COOKIE_POSITIONS" data-testid="cookie-position" @update:model-value="(v) => (config.layout.position = v as any)" />
      <SliderField v-if="config.layout.position !== 'bottom'" label="Anchura máxima" :min="360" :max="960" :step="20" unit=" px" :model-value="config.layout.maxWidth" data-testid="cookie-max-width" @update:model-value="(v) => (config.layout.maxWidth = v)" />
      <SliderField label="Separación de los bordes" :min="0" :max="48" :step="4" unit=" px" :model-value="config.layout.edgeOffset" data-testid="cookie-edge-offset" @update:model-value="(v) => (config.layout.edgeOffset = v)" />
      <SliderField label="Altura máxima" :min="50" :max="95" :step="5" unit=" % de la pantalla" :model-value="config.layout.maxHeight" data-testid="cookie-max-height" @update:model-value="(v) => (config.layout.maxHeight = v)" />
      <p class="text-[11px] text-stone-500">Si el contenido no cabe, la parte central se desplaza; los botones siempre quedan a la vista.</p>
    </InspectorSection>

    <InspectorSection title="Móvil" tab="advanced">
      <SegmentedField label="En pantallas pequeñas" :model-value="config.layout.mobile" :options="[{ value: 'sheet', label: 'Hoja abajo' }, { value: 'full', label: 'Pantalla completa' }]" data-testid="cookie-mobile" @update:model-value="(v) => (config.layout.mobile = v as any)" />
      <p class="text-[11px] text-stone-500">En el móvil el aviso ocupa el ancho de la pantalla, con scroll interno y botones apilados y pulsables; nunca queda fuera de alcance.</p>
    </InspectorSection>

    <InspectorSection title="Animación" tab="advanced">
      <SegmentedField label="Entrada y salida" :model-value="config.behavior.animation" :options="[{ value: 'fade', label: 'Fundido' }, { value: 'slide', label: 'Deslizar' }, { value: 'none', label: 'Ninguna' }]" data-testid="cookie-animation" @update:model-value="(v) => (config.behavior.animation = v as any)" />
      <p class="text-[11px] text-stone-500">Quien tiene «reducir movimiento» en su dispositivo no ve ninguna animación, elijas lo que elijas.</p>
    </InspectorSection>

    <InspectorSection title="Lo que no se puede cambiar" tab="advanced">
      <ul class="list-disc space-y-1 pl-4 text-[12px] text-stone-600">
        <li>Los tres botones, en este orden, con Rechazar tan visible como Aceptar.</li>
        <li>Nada opcional premarcado ni cargado antes de decidir; «Configurar cookies» siempre al pie.</li>
        <li>Los enlaces a la política de cookies y a la de privacidad.</li>
        <li>No se puede cerrar sin decidir (la X sólo aparece cuando ya hay una decisión).</li>
        <li>Teclado, foco encerrado y lectores de pantalla.</li>
      </ul>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from './InspectorSection.vue'
import TextField from './fields/TextField.vue'
import ToggleField from './fields/ToggleField.vue'
import SegmentedField from './fields/SegmentedField.vue'
import SelectField from './fields/SelectField.vue'
import SliderField from './fields/SliderField.vue'
import ColorField from './fields/ColorField.vue'
import ImageField from './fields/ImageField.vue'
import {
  CONSENT_LOCALES,
  CONSENT_LOCALE_LABELS,
  COOKIE_POSITIONS,
  COOKIE_TEXTS,
  LEGAL_FIELD_LABELS,
  cookiePalette,
  type ConsentLocale,
  type ConsentProfile,
  type CookieNoticeConfig,
  type CookieTextDef,
} from '~/utils/siteConsent'

/**
 * El inspector del aviso de cookies (utils/siteConsent.ts) en el Constructor:
 * se abre desde «Cookies de la web» o al pulsar la muestra en el lienzo.
 * Edita el borrador en sitio (el shell lo autoguarda y lo publica con
 * «Publicar»), en las tres pestañas de siempre: Contenido (textos por
 * idioma, qué se enseña, datos legales), Diseño (logo, colores, forma,
 * tipografía) y Avanzado (posición, móvil, animación). Lo que afecta a la
 * validez del consentimiento no está aquí a propósito.
 */
export type CookiePreviewState = 'summary' | 'settings' | 'saved'

const props = defineProps<{
  config: CookieNoticeConfig
  profile: ConsentProfile | null
  brandColors: { label: string; value: string }[]
  brandColor: string | null
  previewState: CookiePreviewState
}>()
const emit = defineEmits<{ preview: [state: CookiePreviewState] }>()

const tab = inject<Ref<'content' | 'design' | 'advanced'>>('inspectorTab', ref('content'))
const { t } = useI18n()
const lang = ref<ConsentLocale>('es')

const PREVIEW_STATES: { key: CookiePreviewState; label: string }[] = [
  { key: 'summary', label: 'Inicial' },
  { key: 'settings', label: 'Preferencias' },
  { key: 'saved', label: 'Guardado' },
]
const TEXT_GROUPS: { key: CookieTextDef['group']; label: string }[] = [
  { key: 'main', label: 'Textos del aviso' },
  { key: 'settings', label: 'Textos de las preferencias' },
  { key: 'categories', label: 'Categorías' },
  { key: 'buttons', label: 'Botones' },
  { key: 'legal', label: 'Enlaces legales' },
]
const textsOf = (group: CookieTextDef['group']) => COOKIE_TEXTS.filter((d) => d.group === group)
const palette = computed(() => cookiePalette({ ...props.config.design, background: '', text: '', title: '', accent: '', accentText: '', border: '', link: '', overlay: '' }, props.brandColor || props.profile?.brandColor))
const setPreview = (s: CookiePreviewState) => emit('preview', s)
</script>

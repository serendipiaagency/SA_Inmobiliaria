<template>
  <div data-testid="demo-inspector">
    <div v-if="tab === 'content'" class="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-[12px] text-violet-900">
      <p class="font-semibold">Aviso de demostración — elemento global</p>
      <p class="mt-1 text-violet-800">
        Sólo existe en la web de una cuenta de demostración: lo decide la plataforma, no este ajuste.
        <template v-if="profile?.isDemo">Esta empresa es una demo: el aviso sale en su web tal cual lo veas aquí.</template>
        <template v-else>Esta empresa no es una demo: en su web no sale nunca. Lo que configures aquí es la muestra del lienzo.</template>
      </p>
    </div>

    <!-- ===================== Contenido ===================== -->
    <InspectorSection title="Aviso">
      <ToggleField label="Activo" :model-value="config.enabled" data-testid="demo-enabled" @update:model-value="(v) => (config.enabled = v)" />
      <p class="text-[11px] text-stone-500">No es un aviso legal: se puede desactivar. El aviso de cookies no depende de él.</p>
    </InspectorSection>

    <InspectorSection title="Textos">
      <SelectField label="Editar los textos en" :model-value="lang" :options="CONSENT_LOCALES.map((l) => ({ value: l, label: CONSENT_LOCALE_LABELS[l] }))" hint="El que dejes vacío usa el texto de la web en ese idioma." data-testid="demo-text-locale" @update:model-value="(v) => (lang = v as ConsentLocale)" />
      <TextField label="Título" :placeholder="t('demo.notice.title')" :model-value="config.texts[lang].title" data-testid="demo-text-title" @update:model-value="(v) => (config.texts[lang].title = v)" />
      <TextField label="Descripción" multiline :rows="3" :placeholder="t('demo.notice.text')" :model-value="config.texts[lang].text" data-testid="demo-text-body" @update:model-value="(v) => (config.texts[lang].text = v)" />
      <p class="text-[11px] text-stone-500">Di la verdad: en una demo nada se envía fuera de la plataforma (ni emails, ni mensajes, ni llamadas). Si activas integraciones reales, ajusta el texto.</p>
    </InspectorSection>

    <!-- ===================== Diseño ===================== -->
    <InspectorSection title="Colores e icono" tab="design">
      <p class="mb-3 text-[11px] text-stone-500">Sin elegir: verde petróleo oscuro con texto blanco.</p>
      <ColorField label="Fondo" :model-value="config.design.background || undefined" :brand-colors="brandColors" :inherited="palette.background" test-id="demo-color-background" @update:model-value="(v) => (config.design.background = v || '')" />
      <ColorField label="Texto" :model-value="config.design.text || undefined" :brand-colors="brandColors" :inherited="palette.text" test-id="demo-color-text" @update:model-value="(v) => (config.design.text = v || '')" />
      <ColorField label="Icono" :model-value="config.design.icon || undefined" :brand-colors="brandColors" :inherited="palette.icon" test-id="demo-color-icon" @update:model-value="(v) => (config.design.icon = v || '')" />
      <SelectField label="Icono" :model-value="config.icon" :options="DEMO_ICONS" data-testid="demo-icon" @update:model-value="(v) => (config.icon = v as any)" />
    </InspectorSection>

    <InspectorSection title="Forma y tamaño" tab="design">
      <SegmentedField label="Tamaño" :model-value="config.design.size" :options="[{ value: 'sm', label: 'Compacto' }, { value: 'md', label: 'Normal' }]" data-testid="demo-size" @update:model-value="(v) => (config.design.size = v as any)" />
      <SliderField label="Anchura máxima" :min="240" :max="480" :step="20" unit=" px" :model-value="config.design.maxWidth" data-testid="demo-max-width" @update:model-value="(v) => (config.design.maxWidth = v)" />
      <SliderField label="Radio de las esquinas" :min="0" :max="32" :step="2" unit=" px" :model-value="config.design.radius" data-testid="demo-radius" @update:model-value="(v) => (config.design.radius = v)" />
      <SegmentedField label="Sombra" :model-value="config.design.shadow" :options="[{ value: 'none', label: 'Sin' }, { value: 'soft', label: 'Suave' }, { value: 'strong', label: 'Marcada' }]" data-testid="demo-shadow" @update:model-value="(v) => (config.design.shadow = v as any)" />
    </InspectorSection>

    <!-- ===================== Avanzado ===================== -->
    <InspectorSection title="Posición" tab="advanced">
      <SelectField label="Esquina" :model-value="config.position" :options="DEMO_POSITIONS" data-testid="demo-position" @update:model-value="(v) => (config.position = v as any)" />
      <SliderField label="Separación de los bordes" :min="8" :max="48" :step="4" unit=" px" :model-value="config.offset" data-testid="demo-offset" @update:model-value="(v) => (config.offset = v)" />
      <p class="text-[11px] text-stone-500">Arriba se coloca debajo de la cabecera, nunca encima del menú. En el móvil ocupa el ancho de la pantalla menos la separación. Queda por debajo del aviso de cookies y por encima del chat.</p>
    </InspectorSection>

    <InspectorSection title="Cierre y animación" tab="advanced">
      <ToggleField label="Botón de cerrar" :model-value="config.closable" data-testid="demo-closable" @update:model-value="(v) => (config.closable = v)" />
      <SegmentedField v-if="config.closable" label="Recordar el cierre" :model-value="config.rememberClose" :options="[{ value: 'session', label: 'Esta visita' }, { value: 'always', label: 'Siempre' }, { value: 'never', label: 'No' }]" data-testid="demo-remember" @update:model-value="(v) => (config.rememberClose = v as any)" />
      <SegmentedField label="Animación" :model-value="config.animation" :options="[{ value: 'fade', label: 'Fundido' }, { value: 'slide', label: 'Deslizar' }, { value: 'none', label: 'Ninguna' }]" data-testid="demo-animation" @update:model-value="(v) => (config.animation = v as any)" />
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
import { CONSENT_LOCALES, CONSENT_LOCALE_LABELS, DEMO_ICONS, DEMO_POSITIONS, demoPalette, type ConsentLocale, type ConsentProfile, type DemoNoticeConfig } from '~/utils/siteConsent'

/**
 * El inspector del aviso de demostración (utils/siteConsent.ts): textos por
 * idioma, colores, icono, forma, posición, cierre y animación. Edita el
 * borrador en sitio; el shell lo autoguarda y lo publica con «Publicar».
 */
const props = defineProps<{
  config: DemoNoticeConfig
  profile: ConsentProfile | null
  brandColors: { label: string; value: string }[]
}>()

const tab = inject<Ref<'content' | 'design' | 'advanced'>>('inspectorTab', ref('content'))
const { t } = useI18n()
const lang = ref<ConsentLocale>('es')
const palette = computed(() => demoPalette({ ...props.config.design, background: '', text: '', icon: '' }))
</script>

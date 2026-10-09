<template>
  <div data-testid="footer-inspector">
    <div v-if="tab === 'content'" class="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-[12px] text-violet-900">
      <p class="font-semibold">Pie de página — elemento global</p>
      <p class="mt-1 text-violet-800">Es el mismo en todas las páginas de tu web. Lo que cambies aquí se ve en el lienzo al momento y llega a la web al pulsar «Publicar».</p>
    </div>

    <!-- ===================== Contenido ===================== -->
    <InspectorSection title="Identidad">
      <p class="mb-3 text-[12px] text-stone-500">
        El logo y el nombre son los de tu empresa (Brand Kit).
        <NuxtLink to="/admin/asset-export/brand-kit" target="_blank" class="font-semibold text-ink underline">Brand Kit →</NuxtLink>
      </p>
      <TextField label="Descripción" multiline :rows="3" :placeholder="defaultDescription" hint="Vacía = la frase de presentación de siempre." :model-value="config.description" data-testid="footer-description-input" @update:model-value="(v) => (config.description = v)" />
      <ToggleField label="Usar las redes del Brand Kit" :model-value="config.social === null" data-testid="footer-social-from-kit" @update:model-value="toggleSocialSource" />
      <div v-if="config.social === null" class="mb-3 text-[12px] text-stone-500" data-testid="footer-social-kit-list">
        <template v-if="profile?.social.length">
          <p v-for="s in profile.social" :key="s.network" class="truncate">{{ networkLabel(s.network) }} · {{ s.url }}</p>
        </template>
        <p v-else>El Brand Kit no tiene redes con una dirección válida: no se enseña ninguna.</p>
      </div>
      <div v-else class="mb-3 space-y-2" data-testid="footer-social-list">
        <div v-for="(s, i) in config.social" :key="i" class="rounded-lg border border-line p-2" :data-network="s.network">
          <div class="flex items-center gap-2">
            <select class="input !py-1 text-[12px]" :value="s.network" :aria-label="`Red ${i + 1}`" @change="s.network = ($event.target as HTMLSelectElement).value as FooterSocialNetwork">
              <option v-for="n in FOOTER_SOCIAL_NETWORKS" :key="n.key" :value="n.key">{{ n.label }}</option>
            </select>
            <button type="button" class="shrink-0 text-[11px] font-semibold text-rose-600" :data-testid="`footer-social-remove-${i}`" @click="config.social!.splice(i, 1)">Quitar</button>
          </div>
          <input v-model="s.url" class="input mt-1.5 !py-1 text-[12px]" placeholder="https://…" :data-testid="`footer-social-url-${i}`" >
          <p v-if="s.url && !validSocialUrl(s.network, s.url)" class="mt-1 text-[11px] text-amber-700" data-testid="footer-social-invalid">Tiene que ser una dirección https de {{ networkLabel(s.network) }}: mientras no lo sea, no se enseña.</p>
        </div>
        <button v-if="config.social.length < FOOTER_LIMITS.social" type="button" class="text-[12px] font-semibold text-ink underline" data-testid="footer-social-add" @click="addSocial">+ Añadir red</button>
      </div>
    </InspectorSection>

    <InspectorSection v-for="col in FOOTER_LINK_COLUMNS" :key="col.key" :title="`Columna «${col.label}»`">
      <TextField label="Título" :placeholder="col.label" :model-value="config.columns[col.key].title" :data-testid="`footer-title-${col.key}`" @update:model-value="(v) => (config.columns[col.key].title = v)" />
      <ul class="mb-2 space-y-2" :data-testid="`footer-links-${col.key}`">
        <li v-for="(link, i) in config.columns[col.key].links" :key="link.id" class="rounded-lg border border-line p-2" :data-link-id="link.id">
          <div class="flex items-center gap-1.5">
            <input v-model="link.visible" type="checkbox" class="h-3.5 w-3.5 shrink-0" :aria-label="`Mostrar enlace ${i + 1}`" data-testid="footer-link-visible" >
            <select class="input min-w-0 flex-1 !py-1 text-[12px]" :value="link.kind === 'url' ? URL_OPTION : link.target" aria-label="Destino" data-testid="footer-link-target" @change="setTarget(link, ($event.target as HTMLSelectElement).value)">
              <option v-if="link.kind === 'page' && !footerTarget(link.target)" :value="link.target">Página que ya no existe</option>
              <optgroup v-for="g in TARGET_GROUPS" :key="g.key" :label="g.label">
                <option v-for="tg in targetsOf(g.key)" :key="tg.id" :value="tg.id">{{ tg.label }}</option>
              </optgroup>
              <option :value="URL_OPTION">Enlace externo…</option>
            </select>
            <button type="button" class="hf-move" :disabled="i === 0" aria-label="Subir" data-testid="footer-link-up" @click="move(config.columns[col.key].links, i, -1)">↑</button>
            <button type="button" class="hf-move" :disabled="i === config.columns[col.key].links.length - 1" aria-label="Bajar" data-testid="footer-link-down" @click="move(config.columns[col.key].links, i, 1)">↓</button>
            <button type="button" class="hf-move !text-rose-600" aria-label="Quitar" data-testid="footer-link-remove" @click="config.columns[col.key].links.splice(i, 1)">×</button>
          </div>
          <input v-if="link.kind === 'url'" v-model="link.target" class="input mt-1.5 !py-1 text-[12px]" placeholder="https://… · mailto:… · tel:…" data-testid="footer-link-url" >
          <input v-model="link.label" class="input mt-1.5 !py-1 text-[12px]" :placeholder="linkPlaceholder(link)" maxlength="60" data-testid="footer-link-label" >
          <p v-if="problemOf(link)" class="mt-1 text-[11px] text-amber-700" data-testid="footer-link-problem">{{ FOOTER_LINK_PROBLEMS[problemOf(link)!] }}</p>
        </li>
      </ul>
      <div v-if="config.columns[col.key].links.length < FOOTER_LIMITS.links" class="flex gap-3">
        <button type="button" class="text-[12px] font-semibold text-ink underline" :data-testid="`footer-add-page-${col.key}`" @click="addPage(col.key)">+ Página de la web</button>
        <button type="button" class="text-[12px] font-semibold text-ink underline" :data-testid="`footer-add-url-${col.key}`" @click="addUrl(col.key)">+ Enlace externo</button>
      </div>
    </InspectorSection>

    <InspectorSection title="Suscríbete">
      <TextField label="Título" placeholder="Suscríbete" :model-value="config.newsletter.title" data-testid="footer-newsletter-title" @update:model-value="(v) => (config.newsletter.title = v)" />
      <TextField label="Texto" multiline :rows="2" :placeholder="defaultNewsletterText" :model-value="config.newsletter.text" data-testid="footer-newsletter-text-input" @update:model-value="(v) => (config.newsletter.text = v)" />
      <p class="text-[11px] text-stone-500">
        Las suscripciones se guardan en
        <NuxtLink to="/admin/suscriptores" target="_blank" class="font-semibold text-ink underline">Portal Web → Suscriptores</NuxtLink>. No se envía ningún email automático.
      </p>
    </InspectorSection>

    <InspectorSection title="Contacto">
      <TextField label="Teléfono" :placeholder="profile?.phone || 'Sin teléfono en los datos de la empresa'" :model-value="config.contact.phone" data-testid="footer-contact-phone-input" @update:model-value="(v) => (config.contact.phone = v)" />
      <TextField label="Horario" placeholder="Lun - Vie 9:00 - 18:00" hint="Sólo se enseña si lo escribes." :model-value="config.contact.hours" data-testid="footer-contact-hours-input" @update:model-value="(v) => (config.contact.hours = v)" />
      <TextField label="Ubicación" :placeholder="profile?.location || 'Sin oficina con ciudad'" :model-value="config.contact.location" data-testid="footer-contact-location-input" @update:model-value="(v) => (config.contact.location = v)" />
      <ToggleField label="Enlace «Ver en el mapa»" :model-value="config.contact.showMap" data-testid="footer-contact-map" @update:model-value="(v) => (config.contact.showMap = v)" />
      <p class="text-[11px] text-stone-500">Vacíos = los de tu empresa (Brand Kit, datos legales y oficina principal). Lo que no exista no se enseña: nada inventado.</p>
    </InspectorSection>

    <InspectorSection title="Barra inferior">
      <TextField label="Nombre en el copyright" :placeholder="companyName" :model-value="config.bottom.copyright" data-testid="footer-copyright-input" @update:model-value="(v) => (config.bottom.copyright = v)" />
      <ToggleField label="Política de privacidad" :model-value="config.bottom.showPrivacy" @update:model-value="(v) => (config.bottom.showPrivacy = v)" />
      <ToggleField label="Términos y condiciones" :model-value="config.bottom.showTerms" @update:model-value="(v) => (config.bottom.showTerms = v)" />
      <ToggleField label="Política de cookies" :model-value="config.bottom.showCookies" @update:model-value="(v) => (config.bottom.showCookies = v)" />
      <p class="mb-3 text-[11px] text-stone-500">«Configurar cookies» sale siempre: el visitante tiene que poder cambiar o retirar su consentimiento desde cualquier página.</p>
      <ToggleField label="Selector de idioma" :model-value="config.bottom.showLanguage" data-testid="footer-show-language" @update:model-value="(v) => (config.bottom.showLanguage = v)" />
      <ToggleField label="Botón «volver arriba»" :model-value="config.bottom.showBackToTop" data-testid="footer-show-top" @update:model-value="(v) => (config.bottom.showBackToTop = v)" />
    </InspectorSection>

    <!-- ===================== Diseño ===================== -->
    <InspectorSection title="Colores" tab="design">
      <p class="mb-3 text-[11px] text-stone-500">Sin elegir: blanco cálido, etiquetas melocotón suave y el color de tu marca en el botón, los iconos y la barra inferior.</p>
      <ColorField label="Fondo" :model-value="config.design.background || undefined" :brand-colors="brandColors" :inherited="FOOTER_DEFAULT_COLORS.background" test-id="footer-color-background" @update:model-value="(v) => (config.design.background = v || '')" />
      <ColorField label="Texto" :model-value="config.design.text || undefined" :brand-colors="brandColors" :inherited="FOOTER_DEFAULT_COLORS.text" test-id="footer-color-text" @update:model-value="(v) => (config.design.text = v || '')" />
      <ColorField label="Fondo de las etiquetas" :model-value="config.design.headingBackground || undefined" :brand-colors="brandColors" :inherited="FOOTER_DEFAULT_COLORS.headingBackground" test-id="footer-color-heading-bg" @update:model-value="(v) => (config.design.headingBackground = v || '')" />
      <ColorField label="Texto de las etiquetas" :model-value="config.design.headingText || undefined" :brand-colors="brandColors" :inherited="FOOTER_DEFAULT_COLORS.headingText" test-id="footer-color-heading-text" @update:model-value="(v) => (config.design.headingText = v || '')" />
      <ColorField label="Botón e iconos" :model-value="config.design.accent || undefined" :brand-colors="brandColors" :inherited="palette.accent" test-id="footer-color-accent" @update:model-value="(v) => (config.design.accent = v || '')" />
      <ColorField label="Barra inferior" :model-value="config.design.bottomBackground || undefined" :brand-colors="brandColors" :inherited="palette.bottomBackground" test-id="footer-color-bottom" @update:model-value="(v) => (config.design.bottomBackground = v || '')" />
      <ColorField label="Texto de la barra inferior" :model-value="config.design.bottomText || undefined" :brand-colors="brandColors" :inherited="palette.bottomText" test-id="footer-color-bottom-text" @update:model-value="(v) => (config.design.bottomText = v || '')" />
    </InspectorSection>

    <InspectorSection title="Tipografía y espacios" tab="design">
      <SegmentedField label="Tamaño del texto" :model-value="config.design.fontSize" :options="[{ value: 'sm', label: 'Pequeño' }, { value: 'md', label: 'Normal' }, { value: 'lg', label: 'Grande' }]" data-testid="footer-font-size" @update:model-value="(v) => (config.design.fontSize = v as any)" />
      <SegmentedField label="Márgenes" :model-value="config.design.spacing" :options="[{ value: 'compact', label: 'Compactos' }, { value: 'normal', label: 'Normales' }, { value: 'airy', label: 'Amplios' }]" data-testid="footer-spacing" @update:model-value="(v) => (config.design.spacing = v as any)" />
      <SegmentedField label="Separación de columnas" :model-value="config.design.columnGap" :options="[{ value: 'sm', label: 'Estrecha' }, { value: 'md', label: 'Normal' }, { value: 'lg', label: 'Ancha' }]" data-testid="footer-column-gap" @update:model-value="(v) => (config.design.columnGap = v as any)" />
      <SegmentedField label="Etiquetas de columna" :model-value="config.design.headingStyle" :options="[{ value: 'pill', label: 'Píldora' }, { value: 'plain', label: 'Texto' }]" data-testid="footer-heading-style" @update:model-value="(v) => (config.design.headingStyle = v as any)" />
      <SegmentedField label="Iconos sociales" :model-value="config.design.socialStyle" :options="[{ value: 'soft', label: 'Suaves' }, { value: 'outline', label: 'Contorno' }, { value: 'solid', label: 'Color' }]" data-testid="footer-social-style" @update:model-value="(v) => (config.design.socialStyle = v as any)" />
    </InspectorSection>

    <InspectorSection title="Paisaje" tab="design">
      <SegmentedField label="Fondo inferior" :model-value="config.landscape.mode" :options="[{ value: 'none', label: 'Liso' }, { value: 'preset', label: 'Dibujo' }, { value: 'image', label: 'Imagen' }]" data-testid="footer-landscape-mode" @update:model-value="(v) => (config.landscape.mode = v as any)" />
      <template v-if="config.landscape.mode !== 'none'">
        <SelectField v-if="config.landscape.mode === 'preset'" label="Dibujo" :model-value="config.landscape.preset" :options="FOOTER_LANDSCAPE_PRESETS.map((p) => ({ value: p.key, label: p.label }))" data-testid="footer-landscape-preset" @update:model-value="(v) => (config.landscape.preset = v as any)" />
        <template v-else>
          <ImageField label="Imagen" folder="site-builder" aspect="wide" :model-value="config.landscape.image" @update:model-value="(v) => (config.landscape.image = v)" />
          <SegmentedField label="Encuadre" :model-value="config.landscape.position" :options="[{ value: 'top', label: 'Arriba' }, { value: 'center', label: 'Centro' }, { value: 'bottom', label: 'Abajo' }]" @update:model-value="(v) => (config.landscape.position = v as any)" />
        </template>
        <SliderField label="Opacidad" :min="5" :max="60" :model-value="config.landscape.opacity" data-testid="footer-landscape-opacity" @update:model-value="(v) => (config.landscape.opacity = v)" />
        <SliderField label="Altura" :min="80" :max="320" :step="10" unit=" px" :model-value="config.landscape.height" data-testid="footer-landscape-height" @update:model-value="(v) => (config.landscape.height = v)" />
      </template>
    </InspectorSection>

    <!-- ===================== Avanzado ===================== -->
    <InspectorSection title="Columnas: orden y visibilidad" tab="advanced">
      <ul class="space-y-1.5" data-testid="footer-sections">
        <li v-for="(key, i) in config.order" :key="key" class="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5" :data-section="key">
          <input type="checkbox" class="h-3.5 w-3.5" :checked="config.show[key]" :aria-label="`Mostrar ${sectionLabel(key)}`" data-testid="footer-section-toggle" @change="config.show[key] = ($event.target as HTMLInputElement).checked" >
          <span class="flex-1 text-[12px]">{{ sectionLabel(key) }}</span>
          <button type="button" class="hf-move" :disabled="i === 0" aria-label="Subir" data-testid="footer-section-up" @click="move(config.order, i, -1)">↑</button>
          <button type="button" class="hf-move" :disabled="i === config.order.length - 1" aria-label="Bajar" data-testid="footer-section-down" @click="move(config.order, i, 1)">↓</button>
        </li>
      </ul>
      <p class="mt-2 text-[11px] text-stone-500">«Suscríbete» oculta el formulario; si el contacto sigue visible, la columna se queda con él.</p>
    </InspectorSection>

    <InspectorSection title="Bloques" tab="advanced">
      <ToggleField label="Redes sociales" :model-value="config.show.social" data-testid="footer-show-social" @update:model-value="(v) => (config.show.social = v)" />
      <ToggleField label="Contacto (teléfono y ubicación)" :model-value="config.show.contact" data-testid="footer-show-contact" @update:model-value="(v) => (config.show.contact = v)" />
    </InspectorSection>

    <InspectorSection title="Móvil" tab="advanced">
      <ToggleField label="Explorar, Empresa y Servicios plegables" :model-value="config.mobileAccordions" data-testid="footer-accordions" @update:model-value="(v) => (config.mobileAccordions = v)" />
      <p class="mb-2 text-[12px] font-semibold text-stone-600">Ocultar en el móvil</p>
      <label v-for="h in MOBILE_OPTIONS" :key="h.key" class="mb-1.5 flex items-center gap-2 text-[12px]">
        <input type="checkbox" class="h-3.5 w-3.5" :checked="config.hideOnMobile.includes(h.key)" :data-testid="`footer-hide-mobile-${h.key}`" @change="toggleMobile(h.key, ($event.target as HTMLInputElement).checked)" >
        {{ h.label }}
      </label>
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
  FOOTER_DEFAULT_COLORS,
  FOOTER_LANDSCAPE_PRESETS,
  FOOTER_LIMITS,
  FOOTER_LINK_COLUMNS,
  FOOTER_LINK_PROBLEMS,
  FOOTER_SECTIONS,
  FOOTER_SOCIAL_NETWORKS,
  FOOTER_TARGETS,
  footerLinkProblem,
  footerPalette,
  footerTarget,
  newFooterLinkId,
  validSocialUrl,
  type FooterAvailability,
  type FooterConfig,
  type FooterLink,
  type FooterLinkColumnKey,
  type FooterMobileHideable,
  type FooterProfile,
  type FooterSectionKey,
  type FooterSocialNetwork,
  type FooterTargetGroup,
} from '~/utils/siteFooter'

/**
 * El inspector del pie global (utils/siteFooter.ts) en el Constructor: se
 * abre al pulsar el pie en el lienzo. Edita el borrador en sitio (el shell
 * lo autoguarda y lo publica con «Publicar»), repartido en las tres
 * pestañas de siempre: Contenido, Diseño y Avanzado. Los enlaces se eligen
 * entre las páginas reales de la web (identificadores estables) o son
 * externos validados; lo que no tiene destino se señala, no se borra.
 */
const props = defineProps<{
  config: FooterConfig
  profile: FooterProfile | null
  available: FooterAvailability | null
  brandColors: { label: string; value: string }[]
  brandColor: string | null
  companyName: string
}>()

const tab = inject<Ref<'content' | 'design' | 'advanced'>>('inspectorTab', ref('content'))
const { t } = useI18n()

const URL_OPTION = '__url__'
const TARGET_GROUPS: { key: Exclude<FooterTargetGroup, 'legal'>; label: string }[] = [
  { key: 'explore', label: 'Explorar' },
  { key: 'company', label: 'Empresa' },
  { key: 'services', label: 'Servicios' },
]
const targetsOf = (group: FooterTargetGroup) => FOOTER_TARGETS.filter((tg) => tg.group === group)
const MOBILE_OPTIONS: { key: FooterMobileHideable; label: string }[] = [
  { key: 'social', label: 'Redes sociales' },
  { key: 'explore', label: 'Explorar' },
  { key: 'company', label: 'Empresa' },
  { key: 'services', label: 'Servicios' },
  { key: 'newsletter', label: 'Suscríbete' },
  { key: 'contact', label: 'Contacto' },
  { key: 'landscape', label: 'Paisaje' },
]

const defaultDescription = computed(() => t('footer.tagline'))
const defaultNewsletterText = computed(() =>
  props.companyName ? t('footer.newsletter.text', 'Recibe las últimas novedades, propiedades y oportunidades de {name}.').replace('{name}', props.companyName) : t('footer.newsletter.textGeneric', 'Recibe las últimas novedades, propiedades y oportunidades.'),
)
const palette = computed(() => footerPalette({ ...props.config.design, accent: '', bottomBackground: '', bottomText: '' }, props.brandColor))
const networkLabel = (key: string) => FOOTER_SOCIAL_NETWORKS.find((n) => n.key === key)?.label || key
const sectionLabel = (key: FooterSectionKey) => FOOTER_SECTIONS.find((s) => s.key === key)?.label || key
const problemOf = (link: FooterLink) => footerLinkProblem(link, props.available)
function linkPlaceholder(link: FooterLink) {
  if (link.kind === 'url') return 'Texto del enlace'
  const tg = footerTarget(link.target)
  return tg ? t(tg.i18nKey, tg.label) : 'Texto del enlace'
}

function move<T>(list: T[], i: number, delta: number) {
  const j = i + delta
  if (j < 0 || j >= list.length) return
  const [item] = list.splice(i, 1)
  list.splice(j, 0, item!)
}

function setTarget(link: FooterLink, value: string) {
  if (value === URL_OPTION) {
    if (link.kind !== 'url') {
      link.kind = 'url'
      link.target = 'https://'
    }
  } else {
    link.kind = 'page'
    link.target = value
  }
}

function addPage(col: FooterLinkColumnKey) {
  const used = new Set(FOOTER_LINK_COLUMNS.flatMap((c) => props.config.columns[c.key].links.filter((l) => l.kind === 'page').map((l) => l.target)))
  const first = FOOTER_TARGETS.find((tg) => tg.group === col && !used.has(tg.id)) || FOOTER_TARGETS.find((tg) => tg.group !== 'legal' && !used.has(tg.id)) || FOOTER_TARGETS[0]!
  props.config.columns[col].links.push({ id: newFooterLinkId(), kind: 'page', target: first.id, label: '', visible: true })
}
function addUrl(col: FooterLinkColumnKey) {
  props.config.columns[col].links.push({ id: newFooterLinkId(), kind: 'url', target: 'https://', label: '', visible: true })
}

function toggleSocialSource(useKit: boolean) {
  // Al dejar de usar el Brand Kit se parte de sus redes, para no reescribirlas.
  props.config.social = useKit ? null : (props.profile?.social || []).map((s) => ({ ...s }))
}
function addSocial() {
  const used = new Set((props.config.social || []).map((s) => s.network))
  const next = FOOTER_SOCIAL_NETWORKS.find((n) => !used.has(n.key))?.key || 'instagram'
  props.config.social = [...(props.config.social || []), { network: next, url: '' }]
}

function toggleMobile(key: FooterMobileHideable, hide: boolean) {
  const list = props.config.hideOnMobile.filter((k) => k !== key)
  if (hide) list.push(key)
  props.config.hideOnMobile = list
}
</script>

<style scoped>
.hf-move {
  display: flex;
  height: 1.5rem;
  width: 1.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  font-size: 12px;
  color: #78716c;
}
.hf-move:hover:not(:disabled) {
  background: #f5f5f4;
  color: #1c1917;
}
.hf-move:disabled {
  opacity: 0.3;
}
</style>

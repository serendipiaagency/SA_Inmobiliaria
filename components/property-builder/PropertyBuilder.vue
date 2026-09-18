<template>
  <!-- El editor ocupa todo el ancho del panel: los márgenes negativos anulan
       exactamente el relleno de <main> en layouts/admin.vue (px-5 py-6, y
       lg:px-8 lg:py-8 a partir de 1024px). Con un `-mx-6` fijo se pasaba 4px
       por lado por debajo de lg — suficiente para que el panel se desplazara
       en horizontal en el móvil — y se quedaba 8px corto por encima. -->
  <div class="-mx-5 -my-6 min-h-screen bg-surface lg:-mx-8 lg:-my-8" data-testid="property-editor" :data-resource="resource" :data-mode="isNew ? 'new' : 'edit'">
    <div v-if="loading" class="p-16 text-center text-sm text-stone-400">Cargando…</div>

    <!-- Una ficha que no se puede leer (no existe, o es de otra inmobiliaria y
         el servidor la rechaza) tiene que decirlo. Sin esto el editor se
         quedaba en «Cargando…» para siempre y parecía una caída. -->
    <div v-else-if="loadError" class="mx-auto max-w-lg p-16 text-center" data-testid="property-editor-load-error">
      <p class="text-[15px] font-medium text-ink">{{ loadError }}</p>
      <NuxtLink :to="`/admin/${resource}`" class="pe-btn-quiet mt-5 inline-flex">← Volver al listado</NuxtLink>
    </div>

    <template v-else>
      <PropertyEditorHeader
        :title="headerTitle"
        :back-to="`/admin/${resource}`"
        :status-label="statusLabel"
        :status-tone="statusTone"
        :save-label="saveStateLabel"
        :save-state="saveState"
        :saving="saving"
        :save-cta-label="isNew ? 'Crear propiedad' : 'Guardar cambios'"
        :can-edit="canEdit"
        @save="save"
      >
        <template #actions>
          <!-- Generar contenido y el exportador escriben (crean un proyecto de
               export, guardan textos): fuera si la cuenta no puede escribir.
               «Vista previa» se queda: sólo abre la ficha pública. -->
          <NuxtLink v-if="resource === 'developer-properties' && !isNew && canEdit" :to="`/admin/ai?id=${recordId}`" class="pe-btn-quiet">
            <span class="rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-bold text-white">IA</span>
            Generar contenido
          </NuxtLink>
          <AdminAssetExportButton v-if="resource === 'developer-properties' && !isNew && canEdit" :asset-id="recordId!" :property-type="form.propertyType" variant="quiet" />
          <a v-if="resource === 'developer-properties' && !isNew" :href="`/propiedades/${form.slug || recordId}`" target="_blank" rel="noopener" class="pe-btn-quiet">Vista previa</a>
        </template>
      </PropertyEditorHeader>

      <div class="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <!-- Móvil y tablet: los pasos pasan a una tira horizontal. La columna
             de progreso y la vista previa no caben a esos anchos sin
             estrangular el formulario, que es lo que se viene a usar. -->
        <div class="mb-4 xl:hidden">
          <div class="mb-3 flex items-center gap-3">
            <div class="h-1 flex-1 overflow-hidden rounded-full bg-line">
              <div class="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-400 transition-all duration-500" :style="{ width: progressPercent + '%' }" />
            </div>
            <span class="shrink-0 text-[12px] font-semibold tabular-nums text-ink">{{ progressPercent }}%</span>
          </div>
          <div class="thin-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <button
              v-for="(s, i) in sections"
              :key="s.key"
              type="button"
              :data-testid="`property-editor-step-${s.key}`"
              class="flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-medium transition"
              :class="activeKey === s.key ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600'"
              @click="goTo(s.key)"
            >
              <span class="tabular-nums opacity-60">{{ pad2(i + 1) }}</span>
              {{ s.label }}
              <span v-if="sectionStates[s.key] === 'error'" class="h-1.5 w-1.5 rounded-full" :class="activeKey === s.key ? 'bg-amber-300' : 'bg-red-500'" />
              <svg v-else-if="sectionStates[s.key] === 'complete'" class="h-3 w-3" :class="activeKey === s.key ? 'text-white' : 'text-emerald-500'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="m5 13 4 4L19 7" /></svg>
            </button>
          </div>
        </div>

        <div class="flex items-start gap-5">
          <!-- Columna de progreso -->
          <aside class="sticky top-24 hidden w-[232px] shrink-0 xl:block">
            <PropertyEditorSteps
              :sections="sections"
              :active="activeKey"
              :percent="progressPercent"
              :states="sectionStates"
              :pending="sectionPending"
              @select="goTo"
            />
          </aside>

          <!-- Formulario -->
          <!-- `scroll-mt-24` porque la cabecera es `sticky`: al cambiar de paso
               se hace scroll hasta esta tarjeta, y sin margen de scroll el
               título del paso quedaba justo debajo de la barra, medio tapado. -->
          <div ref="formCardEl" class="pe-card min-w-0 flex-1 scroll-mt-24 overflow-hidden">
            <!-- Sólo lectura: el panel ya deja ver una ficha a quien tiene
                 acceso de lectura al área, pero guardar lo rechaza el
                 servidor (server/middleware/01.admin-rbac.ts). Antes se veía
                 un formulario entero y un botón que siempre fallaba; ahora el
                 `fieldset` deshabilita de verdad todos los controles nativos
                 que cuelgan de él y el aviso dice por qué. Esto no protege
                 nada — lo que protege es el middleware. -->
            <p v-if="!canEdit" class="border-b border-line bg-amber-50 px-6 py-3 text-[13px] text-amber-800 sm:px-8" data-testid="property-editor-readonly">
              Solo lectura: tu cuenta puede consultar esta ficha, pero no modificarla.
            </p>

            <template v-for="(s, i) in sections" :key="s.key">
              <div v-show="activeKey === s.key">
                <PropertySectionHeader :index="i" :total="sections.length" :label="s.label" :description="s.description" :icon="ICONS[s.icon] || ICONS.doc" />

                <!-- El `fieldset` envuelve sólo el cuerpo de la sección, no el
                     pie: quien tiene lectura debe poder seguir recorriendo los
                     pasos con Anterior/Siguiente, que quedarían muertos dentro
                     de un fieldset deshabilitado. -->
                <fieldset class="block border-t border-line px-6 py-6 sm:px-8" :disabled="!canEdit">
                  <div v-if="s.kind === 'fields'" class="space-y-7">
                    <div v-for="(g, gi) in groupFields(s.fields)" :key="gi">
                      <!-- Un grupo de un solo campo que se llama igual que él
                           («Plan de pagos») escribía el mismo texto dos veces
                           seguidas. El rótulo del campo se queda, porque es su
                           nombre accesible; el del grupo sobra. -->
                      <p v-if="g.label && !groupLabelIsRedundant(g)" class="mb-4 text-[15px] font-medium text-ink">{{ g.label }}</p>

                      <!-- Un grupo que es todo casillas se dibuja como
                           interruptores en píldora: leer ocho casillas en
                           columna es mucho más lento que ver ocho chips. -->
                      <div v-if="allCheckboxes(g.fields)" class="flex flex-wrap gap-2">
                        <button
                          v-for="f in g.fields"
                          :key="f.key"
                          type="button"
                          class="pe-chip"
                          :class="form[f.key] ? 'pe-chip-on' : 'pe-chip-off'"
                          :aria-pressed="!!form[f.key]"
                          @click="form[f.key] = !form[f.key]"
                        >
                          <svg v-if="form[f.key]" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="m5 13 4 4L19 7" /></svg>
                          {{ f.label }}
                        </button>
                      </div>

                      <div v-else class="grid gap-4 sm:grid-cols-2">
                        <PropertyBuilderField
                          v-for="f in g.fields"
                          :key="f.key"
                          :spec="f"
                          :model-value="form[f.key]"
                          :upload-folder="resource"
                          @update:model-value="(v) => (form[f.key] = v)"
                        />
                      </div>
                    </div>
                  </div>

                  <LocationSection
                    v-else-if="s.kind === 'location'"
                    :fields="s.fields"
                    :form="form"
                    :lat-field="s.latField"
                    :lng-field="s.lngField"
                    :upload-folder="resource"
                  />
                  <TranslationsEditor v-else-if="s.kind === 'translations'" v-model="translations" />
                  <GalleryManager
                    v-else-if="s.kind === 'gallery'"
                    :child-resource="s.childResource"
                    :parent-field="s.parentField"
                    :parent-id="recordId"
                    :cover-value="form[s.coverField || 'coverImage']"
                    @use-as-cover="(key) => (form[s.coverField || 'coverImage'] = key)"
                  />
                  <ChildCardManager v-else-if="s.kind === 'child-table'" :child-resource="s.childResource" :parent-field="s.parentField" :parent-id="recordId" :columns="s.columns" />
                  <SocialLinksManager v-else-if="s.kind === 'social'" :child-resource="s.childResource" :parent-field="s.parentField" :parent-id="recordId" />
                </fieldset>

                <PropertyEditorFooter
                  :has-prev="i > 0"
                  :has-next="i < sections.length - 1"
                  :saving="saving"
                  :hint="footerHint"
                  :can-edit="canEdit"
                  @prev="goTo(sections[i - 1].key)"
                  @next="goTo(sections[i + 1].key)"
                  @finish="save"
                />
              </div>
            </template>
          </div>

          <!-- Vista previa -->
          <aside class="sticky top-24 hidden w-[232px] shrink-0 xl:block">
            <PropertyEditorPreview
              :title="previewTitle"
              :reference="previewReference"
              :image="previewImage"
              :rows="previewRows"
              :done="completedSections"
              :total="trackedSections"
              :complete="progressPercent === 100"
            />
          </aside>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { PROPERTY_BUILDER_SECTIONS, groupFields, type BuilderSection, type FieldSpec, type FieldsSection } from '~/composables/usePropertyBuilderConfig'
import PropertyBuilderField from './PropertyBuilderField.vue'
import PropertyEditorHeader from './PropertyEditorHeader.vue'
import PropertyEditorSteps from './PropertyEditorSteps.vue'
import PropertyEditorPreview from './PropertyEditorPreview.vue'
import PropertyEditorFooter from './PropertyEditorFooter.vue'
import PropertySectionHeader from './PropertySectionHeader.vue'
import LocationSection from './LocationSection.vue'
import TranslationsEditor from './TranslationsEditor.vue'
import GalleryManager from './GalleryManager.vue'
import ChildCardManager from './ChildCardManager.vue'
import SocialLinksManager from './SocialLinksManager.vue'

/**
 * El Property Editor: **uno solo** para los cuatro recorridos — alta y
 * edición, obra nueva y segunda mano.
 *
 * `resource` elige la configuración (`PROPERTY_BUILDER_SECTIONS`) y `id`
 * decide el modo: `'new'` crea, cualquier otro edita. No hay ni una rama
 * visual por catálogo ni por modo; lo único que cambia son las secciones y
 * los campos que declara la configuración, que es donde deben estar las
 * diferencias de negocio.
 *
 * Este componente es el armazón: cabecera, progreso, sección activa, pie y
 * vista previa. Lo que sabe rellenar cada tipo de sección sigue viviendo en
 * los mismos gestores de antes (galería, planos, redes, ubicación,
 * traducciones), que no se han tocado: funcionaban.
 */
const props = withDefaults(
  defineProps<{
    resource: 'developer-properties' | 'properties'
    id: string
    /**
     * Permiso de escritura sobre el área del recurso, calculado por la página
     * con el sistema de permisos de siempre (`useAdminPermissions`). No hay
     * aquí un segundo sistema de roles: esto sólo alinea la interfaz con lo
     * que el servidor ya decide en `server/middleware/01.admin-rbac.ts`.
     */
    canEdit?: boolean
  }>(),
  { canEdit: true },
)

const router = useRouter()
const toast = useToast()
const { format: formatCurrency } = useCurrency()

const sections = PROPERTY_BUILDER_SECTIONS[props.resource] as BuilderSection[]
const activeKey = ref(sections[0].key)
const formCardEl = ref<HTMLElement | null>(null)

// The url's prop stays the route's original id; recordId is the component's
// own source of truth so a freshly-created record can unlock its
// gallery/child-table sections immediately, without waiting for the
// post-create navigation to remount this component.
const isNew = computed(() => props.id === 'new')
const recordId = ref<number | null>(isNew.value ? null : Number(props.id))

const loading = ref(true)
const loadError = ref('')
const form = reactive<Record<string, any>>({})
const translations = ref([
  { locale: 'en', title: '', description: '' },
  { locale: 'ar', title: '', description: '' },
])
const hasTranslationsSection = sections.some((s) => s.kind === 'translations')

// A ref, not a plain variable: isDirty must re-evaluate the instant a save
// updates the baseline, not just when form/translations change again.
const savedSnapshot = ref('')
const isDirty = computed(() => JSON.stringify({ form, translations: hasTranslationsSection ? translations.value : undefined }) !== savedSnapshot.value)

const saving = ref(false)
const saved = ref(false)
const error = ref('')

const saveState = computed<'idle' | 'saving' | 'saved' | 'dirty' | 'error'>(() => {
  if (error.value) return 'error'
  if (saving.value) return 'saving'
  if (isDirty.value) return 'dirty'
  if (saved.value || !isNew.value) return 'saved'
  return 'idle'
})
const saveStateLabel = computed(() => {
  switch (saveState.value) {
    case 'error':
      return error.value
    case 'saving':
      return 'Guardando…'
    case 'dirty':
      return 'Cambios sin guardar'
    case 'saved':
      return 'Guardado'
    default:
      return 'Sin guardar todavía'
  }
})

/**
 * Este editor **no autoguarda**. El pie lo dice tal cual en vez de copiar el
 * "se guarda automáticamente como borrador" de la referencia: sería la
 * frase más cómoda de poner y la que más caro sale cuando alguien cierra la
 * pestaña creyéndosela.
 */
const footerHint = computed(() => {
  if (!props.canEdit) return 'Estás viendo la ficha en modo consulta.'
  return isDirty.value ? 'Tienes cambios sin guardar — pulsa Guardar antes de salir.' : 'Los cambios se guardan al pulsar Guardar.'
})

function snapshot() {
  savedSnapshot.value = JSON.stringify({ form, translations: hasTranslationsSection ? translations.value : undefined })
}

onMounted(async () => {
  if (!isNew.value) {
    try {
      const res = await $fetch<{ row: Record<string, any>; translations: any[] }>(`/api/admin/${props.resource}/${props.id}`)
      for (const key of Object.keys(res.row)) form[key] = res.row[key]
      if (hasTranslationsSection) {
        for (const tr of res.translations || []) {
          const slot = translations.value.find((t) => t.locale === tr.locale)
          if (slot) {
            slot.title = tr.title
            slot.description = tr.description || ''
          }
        }
      }
    } catch (e: any) {
      // Una ficha de otra inmobiliaria responde 404 aquí (el servidor filtra
      // por organización antes de mirar el id): se enseña el aviso, nunca un
      // editor a medio rellenar con datos ajenos.
      loadError.value = e?.data?.statusMessage || e?.statusMessage || 'No se ha podido cargar esta propiedad.'
      loading.value = false
      return
    }
  }
  snapshot()
  loading.value = false
})

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/** Cambiar de paso devuelve el formulario arriba: sin esto se llega a la sección nueva por su mitad. */
function goTo(key: string) {
  activeKey.value = key
  nextTick(() => formCardEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

function allCheckboxes(fields: FieldSpec[]): boolean {
  return fields.length > 1 && fields.every((f) => f.type === 'checkbox')
}

function groupLabelIsRedundant(g: { label: string | null; fields: FieldSpec[] }): boolean {
  return g.fields.length === 1 && g.fields[0].label === g.label
}

function isFilled(f: { key: string; type: string }): boolean {
  if (f.type === 'checkbox') return form[f.key] !== null && form[f.key] !== undefined
  const v = form[f.key]
  return v !== null && v !== undefined && v !== ''
}

function trackedFields(s: BuilderSection): FieldSpec[] {
  if (s.kind !== 'fields' && s.kind !== 'location') return []
  return (s as FieldsSection).fields.filter((f) => f.required || f.recommended)
}

/**
 * El estado de una sección sale de sus campos, nunca de si alguien la ha
 * abierto. Las secciones sin campos que seguir (galería, planos, redes,
 * traducciones) se quedan neutras a propósito: no hay forma honesta de decir
 * que una galería está "completa".
 */
const sectionStates = computed<Record<string, 'complete' | 'error' | 'neutral'>>(() => {
  const out: Record<string, 'complete' | 'error' | 'neutral'> = {}
  for (const s of sections) {
    if (s.kind !== 'fields' && s.kind !== 'location') {
      out[s.key] = 'neutral'
      continue
    }
    const fields = (s as FieldsSection).fields
    if (fields.some((f) => f.required && !isFilled(f))) out[s.key] = 'error'
    else {
      const tracked = trackedFields(s)
      out[s.key] = tracked.length > 0 && tracked.every(isFilled) ? 'complete' : 'neutral'
    }
  }
  return out
})

/** Cuántos campos obligatorios faltan en cada sección — lo que enseña el aviso del paso. */
const sectionPending = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {}
  for (const s of sections) {
    if (s.kind !== 'fields' && s.kind !== 'location') {
      out[s.key] = 0
      continue
    }
    out[s.key] = (s as FieldsSection).fields.filter((f) => f.required && !isFilled(f)).length
  }
  return out
})

const trackedSections = computed(() => sections.filter((s) => trackedFields(s).length > 0).length)
const completedSections = computed(() => sections.filter((s) => sectionStates.value[s.key] === 'complete').length)

/** Porcentaje sobre campos reales obligatorios/recomendados — nunca un recuento de secciones visitadas. */
const progressPercent = computed(() => {
  let total = 0
  let filled = 0
  for (const s of sections) {
    for (const f of trackedFields(s)) {
      total++
      if (isFilled(f)) filled++
    }
  }
  return total > 0 ? Math.round((filled / total) * 100) : 100
})

// ---------------------------------------------------------------------------
// Cabecera y vista previa
// ---------------------------------------------------------------------------
const STATUS_LABELS: Record<string, string> = {
  new: 'Obra nueva',
  under_construction: 'En construcción',
  ready: 'Lista',
  available: 'Disponible',
  sold: 'Vendida',
}
const TRANSACTION_LABELS: Record<string, string> = { sale: 'Venta', rent: 'Alquiler' }

const isSecondHand = computed(() => props.resource === 'properties')

/** Una vivienda de 2ª mano no tiene nombre propio: se identifica por tipo y referencia. */
const headerTitle = computed(() => {
  if (isNew.value) return isSecondHand.value ? 'Nueva propiedad de 2ª mano' : 'Nueva propiedad'
  return form.name || translations.value.find((t) => t.title)?.title || form.propertyType || form.slug || `Propiedad #${recordId.value}`
})
const previewTitle = computed(() => (headerTitle.value === 'Nueva propiedad' || headerTitle.value === 'Nueva propiedad de 2ª mano' ? 'Sin título todavía' : headerTitle.value))
const previewReference = computed(() => (recordId.value ? `Ref. #${recordId.value}` : 'Sin referencia hasta guardar'))
const previewImage = computed(() => form.coverImage || form.mainImage || null)

const statusLabel = computed(() => {
  if (isNew.value) return 'Sin guardar'
  return STATUS_LABELS[form.status] || form.status || 'Sin estado'
})
const statusTone = computed<'draft' | 'published' | 'neutral'>(() => {
  if (isNew.value) return 'draft'
  if (isSecondHand.value) return form.status === 'sold' ? 'neutral' : 'published'
  return form.publishedAt ? 'published' : 'draft'
})

/**
 * Las filas de la vista previa no son las mismas en los dos catálogos: una
 * promoción tiene entrega y promotora donde una vivienda de reventa tiene
 * operación. Se declaran aquí en vez de esconder una condición en la
 * plantilla de la tarjeta.
 */
const previewRows = computed(() => {
  const rows: { label: string; value: string }[] = []
  rows.push({ label: 'Estado', value: STATUS_LABELS[form.status] || form.status || '—' })
  if (isSecondHand.value) {
    rows.push({ label: 'Operación', value: TRANSACTION_LABELS[form.transactionType] || '—' })
  } else if (form.handoverDate) {
    rows.push({ label: 'Entrega', value: String(form.handoverDate) })
  }
  rows.push({ label: 'Precio', value: typeof form.price === 'number' ? formatCurrency(form.price) : '—' })
  return rows
})

// ---------------------------------------------------------------------------
// Guardado
// ---------------------------------------------------------------------------
async function save() {
  if (!props.canEdit) return
  saving.value = true
  error.value = ''
  try {
    const body: Record<string, any> = { ...form }
    if (hasTranslationsSection) body.translations = translations.value.filter((t) => t.title)
    if (isNew.value) {
      const res = await $fetch<{ id: number }>(`/api/admin/${props.resource}`, { method: 'POST', body })
      recordId.value = res.id
      router.replace(`/admin/${props.resource}/${res.id}`)
    } else {
      await $fetch(`/api/admin/${props.resource}/${recordId.value}`, { method: 'PUT', body })
    }
    snapshot()
    saved.value = true
    toast.success('Guardado')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'No se pudo guardar'
    toast.error(error.value)
  } finally {
    saving.value = false
  }
}

/**
 * Salir con cambios sin guardar pide confirmación. No hay autoguardado, así
 * que perderlos es una pérdida real.
 */
onBeforeRouteLeave(() => {
  if (!isDirty.value || saving.value) return true
  return window.confirm('Tienes cambios sin guardar en esta propiedad. ¿Salir de todas formas?')
})

// Same icon set as layouts/admin.vue's sidebar — kept local since that map
// isn't exported, but the paths are copied verbatim for visual consistency.
const ICONS: Record<string, string> = {
  doc: '<path stroke-linecap="round" stroke-linejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8" />',
  building: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />',
  invoice: '<path stroke-linecap="round" stroke-linejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4" />',
  layers: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />',
  widget: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z" />',
  badge: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2l2.4 2.4L18 4l.6 3.4L22 9l-1.8 3 1.8 3-3.4 1.6L18 20l-3.6-.4L12 22l-2.4-2.4L6 20l-.6-3.4L2 15l1.8-3L2 9l3.4-1.6L6 4l3.6.4z" />',
  sparkles: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />',
  chart: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 3v18h18M7 15l4-5 3 3 5-7" />',
}
</script>

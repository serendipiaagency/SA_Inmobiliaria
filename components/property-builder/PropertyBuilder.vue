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
          <!-- En la papelera no se exporta, no hay ficha pública que previsualizar
               y no se envía: el servidor lo rechazaría igualmente (422/404). -->
          <AdminAssetExportButton v-if="resource === 'developer-properties' && !isNew && canEdit && !trashedAt" :asset-id="recordId!" :property-type="form.propertyType" variant="quiet" />
          <a v-if="resource === 'developer-properties' && !isNew && !trashedAt" :href="`/propiedades/${form.slug || recordId}`" target="_blank" rel="noopener" class="pe-btn-quiet">Vista previa</a>
          <button v-if="!isNew && !trashedAt" type="button" class="pe-btn-quiet" data-testid="property-share-whatsapp" @click="shareOpen = true">Compartir por WhatsApp</button>
        </template>
      </PropertyEditorHeader>
      <AdminCommsSharePropertyModal
        v-if="shareOpen && recordId"
        :property="{ id: recordId, name: headerTitle, slug: form.slug || null, kind: resource === 'developer-properties' ? 'developer' : 'agent' }"
        @close="shareOpen = false"
      />

      <div class="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <!-- Papelera (deleted_at, migración 0086): la ficha se puede abrir y
             editar para revisarla, pero sólo «Restaurar» la saca de ahí. -->
        <div
          v-if="!isNew && trashedAt"
          class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800"
          data-testid="property-editor-trashed"
        >
          <span class="min-w-0 flex-1 basis-64">
            Esta propiedad está en la papelera: no aparece en el listado, en la web, en las búsquedas ni en el matching. Puedes revisarla y editarla; sólo «Restaurar» la devuelve al catálogo.
          </span>
          <button v-if="canEdit" type="button" class="pe-btn-quiet shrink-0" data-testid="property-editor-restore" :disabled="restoring" @click="restoreFromTrash">
            {{ restoring ? 'Restaurando…' : 'Restaurar' }}
          </button>
        </div>

        <PropertySummaryHeader v-if="!isNew && recordId" :resource="resource" :record-id="recordId" :refresh-key="summaryKey" />

        <!-- Búsqueda de campos (FASE 25): con decenas de campos repartidos en
             pasos, escribir «IBI» o «catastral» lleva directo al campo. -->
        <div class="relative mb-4 max-w-md" data-testid="property-field-search">
          <input
            v-model="fieldQuery"
            type="search"
            class="pe-input w-full"
            placeholder="Buscar un campo (p. ej. IBI, fianza, calefacción)…"
            aria-label="Buscar un campo de la ficha"
            @keydown.enter.prevent="fieldMatches[0] && jumpToField(fieldMatches[0])"
            @keydown.esc="fieldQuery = ''"
          >
          <ul v-if="fieldQuery.trim() && fieldMatches.length" class="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-lg">
            <li v-for="m in fieldMatches" :key="m.section + m.field.key">
              <button type="button" class="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-stone-50" @click="jumpToField(m)">
                <span class="font-medium text-ink">{{ m.field.label }}</span>
                <span class="shrink-0 text-[11px] text-stone-400">{{ m.sectionLabel }}</span>
              </button>
            </li>
          </ul>
          <p v-else-if="fieldQuery.trim()" class="absolute z-30 mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-[12px] text-stone-400 shadow-lg">Ningún campo coincide con «{{ fieldQuery }}».</p>
        </div>

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
              <div v-show="activeKey === s.key" :data-testid="`property-editor-section-${s.key}`">
                <PropertySectionHeader :index="i" :total="sections.length" :label="s.label" :description="s.description" :icon="ICONS[s.icon] || ICONS.doc" />

                <!-- El `fieldset` envuelve sólo el cuerpo de la sección, no el
                     pie: quien tiene lectura debe poder seguir recorriendo los
                     pasos con Anterior/Siguiente, que quedarían muertos dentro
                     de un fieldset deshabilitado. -->
                <!-- «Compradores compatibles» no edita la ficha: no se deshabilita
                     en modo consulta (sus acciones ya miran el permiso de CRM). -->
                <fieldset class="block border-t border-line px-6 py-6 sm:px-8" :disabled="!canEdit && s.kind !== 'buyer-matches'">
                  <div v-if="s.kind === 'fields'" class="space-y-7">
                    <div v-for="(g, gi) in groupFields(s.fields)" :key="gi">
                      <!-- Un grupo de un solo campo que se llama igual que él
                           («Plan de pagos») escribía el mismo texto dos veces
                           seguidas. El rótulo del campo se queda, porque es su
                           nombre accesible; el del grupo sobra. Cada grupo con
                           rótulo se puede plegar (FASE 25: colapsables). -->
                      <button
                        v-if="g.label && !groupLabelIsRedundant(g)"
                        type="button"
                        class="mb-4 flex w-full items-center justify-between gap-2 text-left text-[15px] font-medium text-ink"
                        :aria-expanded="!isCollapsed(s.key, g.label)"
                        :data-testid="`property-group-toggle-${s.key}`"
                        @click="toggleGroup(s.key, g.label)"
                      >
                        <span>{{ g.label }}</span>
                        <svg class="h-4 w-4 shrink-0 text-stone-400 transition" :class="isCollapsed(s.key, g.label) ? '-rotate-90' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" /></svg>
                      </button>
                      <template v-if="!g.label || groupLabelIsRedundant(g) || !isCollapsed(s.key, g.label)">

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
                          :model-value="f.type === 'computed' && f.compute ? f.compute(form) : form[f.key]"
                          :upload-folder="resource"
                          :class="highlightKey === f.key ? 'rounded-xl ring-2 ring-amber-300 ring-offset-4' : ''"
                          @update:model-value="(v) => (form[f.key] = v)"
                        />
                      </div>
                      </template>
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
                    :can-edit="canEdit"
                    :trashed="!!trashedAt"
                    @use-as-cover="(key) => (form[s.coverField || 'coverImage'] = key)"
                  />
                  <ChildCardManager v-else-if="s.kind === 'child-table'" :child-resource="s.childResource" :parent-field="s.parentField" :parent-id="recordId" :columns="s.columns" />
                  <SocialLinksManager v-else-if="s.kind === 'social'" :child-resource="s.childResource" :parent-field="s.parentField" :parent-id="recordId" />
                  <PropertyRoomManager v-else-if="s.kind === 'rooms'" :child-resource="s.childResource" :parent-field="s.parentField" :parent-id="recordId" />
                  <PropertyContactsManager v-else-if="s.kind === 'owners'" :parent-id="recordId" :kind="resource === 'developer-properties' ? 'developer' : 'agent'" :can-edit="canEdit" />
                  <PropertyDocumentsManager v-else-if="s.kind === 'panel' && s.panel === 'documents'" :parent-id="recordId" :kind="resource === 'developer-properties' ? 'developer' : 'agent'" :can-edit="canEdit" :trashed="!!trashedAt" @changed="summaryKey++" />
                  <PropertyPortalsPanel v-else-if="s.kind === 'panel' && s.panel === 'portals'" :parent-id="recordId" :kind="resource === 'developer-properties' ? 'developer' : 'agent'" :active="activeKey === s.key" />
                  <PropertyBuyerMatches
                    v-else-if="s.kind === 'buyer-matches'"
                    :parent-id="recordId"
                    :kind="resource === 'developer-properties' ? 'developer' : 'agent'"
                    :property-name="headerTitle"
                    :active="activeKey === s.key"
                  />
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

        <PropertyPriceHistory v-if="!isNew && recordId" :rows="priceHistory" />
        <PropertyCommunications v-if="!isNew && recordId" :property-id="recordId" :kind="resource === 'developer-properties' ? 'developer' : 'agent'" />
        <PropertyExtraPanels v-if="!isNew && recordId" :property-id="recordId" :kind="resource === 'developer-properties' ? 'developer' : 'agent'" />
        <PropertyCrmPanels v-if="!isNew && recordId" :property-id="recordId" :kind="resource === 'developer-properties' ? 'developer' : 'agent'" :name="previewTitle" :trashed="!!trashedAt" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { PROPERTY_BUILDER_SECTIONS, groupFields, type BuilderSection, type FieldSpec, type FieldsSection, type LocationSection as LocationSectionSpec } from '~/composables/usePropertyBuilderConfig'
import { usePropertySchemaRegistry } from '~/composables/usePropertySchemaRegistry'
import { PROPERTY_SUBTYPES, propertyTypeLabel } from '~/utils/propertySheet'
import { CATALOG_STATUS_TITLES, commercialStatusForAvailability, commercialStatusLabel, rowChangesForCommercialStatus } from '~/utils/propertyCommercialStatus'
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
import PropertyRoomManager from './PropertyRoomManager.vue'
import PropertyContactsManager from './PropertyContactsManager.vue'
import PropertyBuyerMatches from './PropertyBuyerMatches.vue'
import PropertyCommunications from './PropertyCommunications.vue'
import PropertyPriceHistory from './PropertyPriceHistory.vue'
import PropertyCrmPanels from '~/components/admin/property/PropertyCrmPanels.vue'
// Bloque N7a: resumen de la ficha, gestor documental y estado de publicación.
import PropertySummaryHeader from '~/components/admin/property/PropertySummaryHeader.vue'
import PropertyDocumentsManager from '~/components/admin/property/PropertyDocumentsManager.vue'
import PropertyPortalsPanel from '~/components/admin/property/PropertyPortalsPanel.vue'
import PropertyExtraPanels from '~/components/admin/property/PropertyExtraPanels.vue'

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
// Panel: moneda de la agencia, sin convertir (utils/currency.ts) — no el selector del visitante de la web.
const { format: formatCurrency } = useAgencyCurrency()

const staticSections = PROPERTY_BUILDER_SECTIONS[props.resource] as BuilderSection[]
const activeKey = ref(staticSections[0].key)
const formCardEl = ref<HTMLElement | null>(null)

// PropertySchemaRegistry (FASE 26): en los DOS catálogos, un campo que el
// schema resuelto (según form.propertyType) no declara se oculta — sin esto
// no hay forma de que "Terreno" deje de mostrar habitaciones/baños (§27 del
// encargo). En obra nueva el schema es newDevelopment o, para suelo, local,
// nave y garaje, su variante de obra nueva (bloque N7a, ver registry.ts).
const { getSchemaFor, isFieldApplicable } = usePropertySchemaRegistry()
const catalog = props.resource === 'properties' ? 'agent' : 'developer'
/** Sube cuando cambia algo que el resumen de la cabecera cuenta (p. ej. un documento). */
const summaryKey = ref(0)

function filterFieldsForSchema(fields: FieldSpec[]): FieldSpec[] {
  const visible = fields.filter(isShownByCondition).map(withDynamicOptions)
  const schema = getSchemaFor(catalog, form.propertyType)
  return visible.filter((f) => f.virtual || isFieldApplicable(catalog, schema, f.key))
}

/** Campos condicionales (FASE 25): p. ej. fianza y depósito sólo en alquiler. */
function isShownByCondition(f: FieldSpec): boolean {
  // Campo heredado (cierre D1p): sólo si la ficha lo traía relleno al abrirla.
  if (f.legacyOnly) {
    const v = loadedValues[f.key]
    if (v === null || v === undefined || v === '' || v === 0 || v === false) return false
  }
  if (!f.showWhen) return true
  const raw = form[f.showWhen.key]
  const value = raw === null || raw === undefined || raw === '' ? (f.showWhen.emptyAs ?? '') : String(raw)
  if (f.showWhen.in && !f.showWhen.in.includes(value)) return false
  if (f.showWhen.notIn && f.showWhen.notIn.includes(value)) return false
  return true
}

/** El subtipo ofrece sólo los subtipos del tipo elegido (utils/propertySheet.ts); un rótulo que depende de la ficha («Renta mensual» en alquiler) se resuelve aquí. */
function withDynamicOptions(spec: FieldSpec): FieldSpec {
  const f = spec.labelFor ? { ...spec, label: spec.labelFor(form) } : spec
  if (f.key !== 'subtype') return f
  const labels = PROPERTY_SUBTYPES[form.propertyType] || {}
  return { ...f, options: Object.keys(labels), optionLabels: labels, hint: form.propertyType ? f.hint : 'Elige primero el tipo de propiedad.' }
}

const sections = computed<BuilderSection[]>(() =>
  staticSections
    .map((s) => {
      if (s.kind === 'fields') return { ...s, fields: filterFieldsForSchema(s.fields) } as FieldsSection
      if (s.kind === 'location') return { ...s, fields: filterFieldsForSchema(s.fields) } as LocationSectionSpec
      return s
    })
    // Salvaguarda: ninguna combinación real deja hoy una sección de campos
    // vacía (todo schema declara al menos algo en cada grupo de FASE 26),
    // pero si algún día lo hiciera, una sección sin ni un campo que mostrar
    // no debe aparecer en el asistente.
    .filter((s) => (s.kind === 'fields' || s.kind === 'location' ? (s as FieldsSection | LocationSectionSpec).fields.length > 0 : true)),
)

// The url's prop stays the route's original id; recordId is the component's
// own source of truth so a freshly-created record can unlock its
// gallery/child-table sections immediately, without waiting for the
// post-create navigation to remount this component.
const isNew = computed(() => props.id === 'new')
const recordId = ref<number | null>(isNew.value ? null : Number(props.id))

const loading = ref(true)
const loadError = ref('')
const form = reactive<Record<string, any>>({})
/** Los valores con los que se abrió la ficha: deciden si un campo heredado (`legacyOnly`) se enseña. */
const loadedValues: Record<string, any> = {}
const translations = ref([
  { locale: 'en', title: '', description: '' },
  { locale: 'ar', title: '', description: '' },
])
const hasTranslationsSection = staticSections.some((s) => s.kind === 'translations')

// A ref, not a plain variable: isDirty must re-evaluate the instant a save
// updates the baseline, not just when form/translations change again.
const savedSnapshot = ref('')
const isDirty = computed(() => JSON.stringify({ form, translations: hasTranslationsSection ? translations.value : undefined }) !== savedSnapshot.value)

const saving = ref(false)
const shareOpen = ref(false)
/**
 * Fecha de borrado si la ficha está en la papelera. Va aparte de `form` a
 * propósito: no es un campo editable (el PUT lo ignora) y cambiarlo dentro de
 * `form` dispararía un autoguardado sin nada que guardar.
 */
const trashedAt = ref<string | null>(null)
const restoring = ref(false)

async function restoreFromTrash() {
  if (!recordId.value) return
  restoring.value = true
  try {
    await $fetch<{ ok: true }>(`/api/admin/${props.resource}/${recordId.value}/restore`, { method: 'POST' })
    trashedAt.value = null
    toast.success('Propiedad restaurada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo restaurar la propiedad')
  } finally {
    restoring.value = false
  }
}
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
 * Sólo en modo edición: crear exige un submit explícito (no hay id al que
 * hacer PUT hasta que exista la fila), pero una vez creada, autoguarda igual
 * que el Constructor Web (pages/admin/site-builder/index.vue —
 * watch+debounce+PUT, mismo patrón, no uno inventado para este editor).
 */
const footerHint = computed(() => {
  if (!props.canEdit) return 'Estás viendo la ficha en modo consulta.'
  if (isNew.value) return 'Pulsa "Crear propiedad" para empezar a guardar — a partir de ahí, los cambios se guardan solos.'
  if (saveState.value === 'error') return 'No se ha podido guardar el último cambio — sigue intentándolo o pulsa Guardar.'
  return 'Los cambios se guardan automáticamente.'
})

function snapshot() {
  savedSnapshot.value = JSON.stringify({ form, translations: hasTranslationsSection ? translations.value : undefined })
}

// Marca cuándo la carga inicial (onMounted) ya rellenó `form` — antes de eso,
// el watch de autoguardado no debe dispararse contra datos a medio cargar.
let loaded = false
/** Las reglas del estado comercial reaccionan sólo a cambios de quien edita, no a la carga (ver los `watch` de más abajo). */
let mirrorArmed = false
// FASE 28 §94 — histórico de precios de la ficha (ver PropertyPriceHistory.vue).
type PriceHistoryRow = { price: number; previousPrice?: number | null; reason?: string | null; changedByName?: string | null; recordedAt: string }
const priceHistory = ref<PriceHistoryRow[]>([])
let persistedPrice: number | null = null
let autosaveTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  if (!isNew.value) {
    try {
      const res = await $fetch<{ row: Record<string, any>; translations: any[]; priceHistory?: PriceHistoryRow[] }>(`/api/admin/${props.resource}/${props.id}`)
      for (const key of Object.keys(res.row)) form[key] = res.row[key]
      Object.assign(loadedValues, res.row)
      trashedAt.value = res.row.deletedAt ?? null
      priceHistory.value = res.priceHistory || []
      persistedPrice = typeof res.row.price === 'number' ? res.row.price : null
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
  // Defaults inteligentes (FASE 25, bloque N7a): operación, privacidad, país y
  // localidad habituales de la agencia y el comercial vinculado a la cuenta.
  if (isNew.value) await applyPropertyDefaults(props.resource, form)
  snapshot()
  loading.value = false
  loaded = true
  // Las reglas del estado comercial (abajo) sólo reaccionan a cambios de quien
  // edita: los de la propia carga ya se han procesado cuando esto se cumple.
  nextTick(() => (mirrorArmed = true))
})

/**
 * Igual criterio que el Constructor Web: cualquier cambio en el formulario
 * reprograma el guardado (debounce de 1s, cada tecla nueva lo reinicia) —
 * nunca antes de la carga inicial, nunca en modo 'new' (no hay id todavía;
 * crear sigue siendo el submit manual de siempre) ni en modo consulta.
 */
watch(
  [form, translations],
  () => {
    if (!loaded || isNew.value || !props.canEdit) return
    scheduleAutosave()
  },
  { deep: true },
)

/**
 * Estado comercial ↔ casilla «Reservada» y disponibilidad de 2ª mano (cierre
 * D1p): las MISMAS reglas que aplica el servidor al guardar
 * (utils/propertyCommercialStatus.ts), aplicadas también al formulario. Si
 * no, el siguiente autoguardado reenviaría la disponibilidad o la casilla de
 * antes y desharía lo que el servidor acababa de ajustar.
 */
watch(
  () => form.commercialStatus,
  (next, prev) => {
    if (!mirrorArmed || next === prev) return
    Object.assign(form, rowChangesForCommercialStatus(catalog, next || null))
  },
)
watch(
  () => form.status,
  (next, prev) => {
    if (!mirrorArmed || catalog !== 'agent' || next === prev) return
    const derived = commercialStatusForAvailability(next, form.commercialStatus)
    if (derived !== undefined) form.commercialStatus = derived
  },
)

function scheduleAutosave() {
  saving.value = false
  error.value = ''
  saved.value = false
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(async () => {
    autosaveTimer = null
    saving.value = true
    try {
      await putPropertyBody()
      snapshot()
      saved.value = true
    } catch (e: any) {
      // Nunca se pierde lo escrito: `form` sigue igual, y saveState pasa a
      // 'error' (footerHint lo explica) en vez de mentir con "Guardado".
      error.value = e?.data?.statusMessage || e?.statusMessage || 'No se pudo guardar'
    } finally {
      saving.value = false
    }
  }, 1000)
}

// ---------------------------------------------------------------------------
// Búsqueda de campos y grupos plegables (FASE 25)
// ---------------------------------------------------------------------------
const fieldQuery = ref('')
const highlightKey = ref<string | null>(null)
type FieldMatch = { section: string; sectionLabel: string; field: FieldSpec }

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Busca por rótulo, grupo y pista en los campos que se ven ahora (los que el tipo de inmueble no admite no aparecen). */
const fieldMatches = computed<FieldMatch[]>(() => {
  const q = normalize(fieldQuery.value.trim())
  if (!q) return []
  const out: FieldMatch[] = []
  for (const s of sections.value) {
    if (s.kind !== 'fields' && s.kind !== 'location') continue
    for (const f of (s as FieldsSection).fields) {
      if (normalize(`${f.label} ${f.group || ''} ${f.hint || ''}`).includes(q)) out.push({ section: s.key, sectionLabel: s.label, field: f })
    }
  }
  return out.slice(0, 12)
})

function jumpToField(m: FieldMatch) {
  fieldQuery.value = ''
  if (m.field.group) collapsed[`${m.section}:${m.field.group}`] = false
  activeKey.value = m.section
  highlightKey.value = m.field.key
  nextTick(() => {
    const el = formCardEl.value?.querySelector<HTMLElement>(`[data-field="${m.field.key}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.querySelector<HTMLElement>('input, select, textarea, button')?.focus({ preventScroll: true })
  })
  setTimeout(() => {
    if (highlightKey.value === m.field.key) highlightKey.value = null
  }, 2500)
}

const collapsed = reactive<Record<string, boolean>>({})
function isCollapsed(section: string, group: string): boolean {
  return !!collapsed[`${section}:${group}`]
}
function toggleGroup(section: string, group: string) {
  const k = `${section}:${group}`
  collapsed[k] = !collapsed[k]
}

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
  for (const s of sections.value) {
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
  for (const s of sections.value) {
    if (s.kind !== 'fields' && s.kind !== 'location') {
      out[s.key] = 0
      continue
    }
    out[s.key] = (s as FieldsSection).fields.filter((f) => f.required && !isFilled(f)).length
  }
  return out
})

const trackedSections = computed(() => sections.value.filter((s) => trackedFields(s).length > 0).length)
const completedSections = computed(() => sections.value.filter((s) => sectionStates.value[s.key] === 'complete').length)

/** Porcentaje sobre campos reales obligatorios/recomendados — nunca un recuento de secciones visitadas. */
const progressPercent = computed(() => {
  let total = 0
  let filled = 0
  for (const s of sections.value) {
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
  return form.name || translations.value.find((t) => t.title)?.title || (form.propertyType ? propertyTypeLabel(form.propertyType) : '') || form.slug || `Propiedad #${recordId.value}`
})
const previewTitle = computed(() => (headerTitle.value === 'Nueva propiedad' || headerTitle.value === 'Nueva propiedad de 2ª mano' ? 'Sin título todavía' : headerTitle.value))
const previewReference = computed(() => (recordId.value ? `Ref. #${recordId.value}` : 'Sin referencia hasta guardar'))
const previewImage = computed(() => form.coverImage || form.mainImage || null)

const statusLabel = computed(() => {
  if (isNew.value) return 'Sin guardar'
  // Cierre D1p: el estado comercial común si está indicado; si no, el del catálogo.
  if (form.commercialStatus) return commercialStatusLabel(form.commercialStatus)
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
  rows.push({ label: 'Estado comercial', value: commercialStatusLabel(form.commercialStatus) })
  rows.push({ label: CATALOG_STATUS_TITLES[catalog], value: STATUS_LABELS[form.status] || form.status || '—' })
  if (isSecondHand.value) {
    rows.push({ label: 'Operación', value: TRANSACTION_LABELS[form.transactionType] || '—' })
  } else if (form.handoverDate) {
    rows.push({ label: 'Entrega', value: String(form.handoverDate) })
  }
  const rent = form.transactionType === 'rent'
  rows.push({ label: rent ? 'Renta mensual' : 'Precio', value: typeof form.price === 'number' ? `${formatCurrency(form.price)}${rent ? ' /mes' : ''}` : '—' })
  return rows
})

// ---------------------------------------------------------------------------
// Guardado
// ---------------------------------------------------------------------------
function requestBody(): Record<string, any> {
  const body: Record<string, any> = { ...form }
  if (hasTranslationsSection) body.translations = translations.value.filter((t) => t.title)
  return body
}

/** El único sitio que hace el PUT real — tanto el autoguardado como el botón "Guardar cambios" pasan por aquí. */
async function putPropertyBody() {
  await $fetch(`/api/admin/${props.resource}/${recordId.value}`, { method: 'PUT', body: requestBody() })
  // Un cambio real de precio acaba de dejar su fila en el histórico del
  // servidor: se relee de allí (nunca se fabrica en el cliente).
  if (typeof form.price === 'number' && form.price !== persistedPrice) {
    persistedPrice = form.price
    // El motivo ya está en el histórico: no debe acompañar al siguiente cambio de precio.
    form.priceChangeReason = ''
    const res = await $fetch<{ priceHistory?: PriceHistoryRow[] }>(`/api/admin/${props.resource}/${recordId.value}`).catch(() => null)
    if (res?.priceHistory) priceHistory.value = res.priceHistory
  }
}

/**
 * Botón "Crear propiedad" / "Guardar cambios". En modo edición ya no es la
 * única forma de guardar (el autoguardado lo hace solo) — sirve para
 * confirmar de inmediato en vez de esperar el debounce, con el mismo aviso
 * de éxito/error de siempre. Igual que `publish()` en el Constructor Web,
 * primero descarta cualquier autoguardado pendiente: nunca deja una versión
 * a medio escribir compitiendo con este guardado explícito.
 */
async function save() {
  if (!props.canEdit) return
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }
  saving.value = true
  error.value = ''
  try {
    if (isNew.value) {
      const res = await $fetch<{ id: number }>(`/api/admin/${props.resource}`, { method: 'POST', body: requestBody() })
      recordId.value = res.id
      router.replace(`/admin/${props.resource}/${res.id}`)
    } else {
      await putPropertyBody()
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
 * Salir con un guardado todavía pendiente (dentro de la ventana de debounce,
 * en curso, o en error) pide confirmación — con autoguardado real esto sólo
 * ocurre en el segundo escaso tras la última tecla, o si el último intento
 * falló de verdad.
 */
onBeforeRouteLeave(() => {
  if (!isDirty.value || saving.value) return true
  return window.confirm('Tienes cambios sin guardar en esta propiedad. ¿Salir de todas formas?')
})

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (autosaveTimer || saving.value || saveState.value === 'error') {
    e.preventDefault()
    e.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload))

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

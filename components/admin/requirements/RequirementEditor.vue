<template>
  <form class="space-y-6" data-testid="requirement-editor" :data-mode="requirement ? 'edit' : 'new'" @submit.prevent="save">
    <!-- 1. La búsqueda -->
    <section>
      <h4 class="rq-h">La búsqueda</h4>
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="rq-label">Título</span>
          <input v-model="form.title" class="rq-input" maxlength="200" placeholder="Vivienda habitual, inversión, local…" data-testid="req-title">
        </label>
        <label class="block">
          <span class="rq-label">Operación <span class="font-normal text-stone-400">· siempre filtra</span></span>
          <select v-model="form.operation" class="rq-input" data-testid="req-operation">
            <option v-for="o in REQUIREMENT_OPERATIONS" :key="o" :value="o">{{ REQUIREMENT_OPERATION_LABELS[o] }}</option>
          </select>
        </label>
        <label class="block">
          <span class="rq-label">Urgencia</span>
          <select v-model="form.urgency" class="rq-input" data-testid="req-urgency">
            <option :value="null">Sin especificar</option>
            <option v-for="u in URGENCIES" :key="u" :value="u">{{ URGENCY_LABELS[u] }}</option>
          </select>
        </label>
        <label class="block">
          <span class="rq-label">Fecha deseada</span>
          <input v-model="form.desiredDate" type="date" class="rq-input" data-testid="req-desired-date">
          <span class="rq-hint">Cuándo quiere comprar o entrar a vivir — no es la fecha de alta.</span>
        </label>
      </div>
    </section>

    <!-- 2. Tipo de inmueble -->
    <section>
      <div class="rq-row">
        <h4 class="rq-h !mb-0">Tipo de inmueble</h4>
        <ImportanceSelect v-model="form.importances.propertyType" criterion="propertyType" />
      </div>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <label
          v-for="t in PROPERTY_TYPES"
          :key="t"
          class="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs"
          :class="form.propertyTypes.includes(t) ? 'border-amber-300 bg-amber-50 text-ink' : 'border-line text-stone-600'"
        >
          <input v-model="form.propertyTypes" type="checkbox" :value="t" class="sr-only" :data-testid="`req-type-${t}`"> {{ PROPERTY_TYPE_LABELS[t] }}
        </label>
      </div>
      <p class="rq-hint">Sin marcar ninguno, cualquier tipo vale. Imprescindible por defecto: si lo bajas a preferible o indiferente, también aparecen otros tipos.</p>
    </section>

    <!-- 3. Presupuesto -->
    <section>
      <div class="rq-row">
        <h4 class="rq-h !mb-0">Presupuesto</h4>
        <ImportanceSelect v-model="form.importances.price" criterion="price" />
      </div>
      <div class="mt-2 grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="rq-label">Precio mínimo ({{ currencyLabel }})</span>
          <input v-model.number="form.priceMin" type="number" min="0" step="1000" class="rq-input" data-testid="req-price-min">
        </label>
        <label class="block">
          <span class="rq-label">Precio máximo ({{ currencyLabel }})</span>
          <input v-model.number="form.priceMax" type="number" min="0" step="1000" class="rq-input" data-testid="req-price-max">
        </label>
      </div>
      <p class="rq-hint">En blanco = no lo ha dicho (nunca «cero»). Lo que se pase en más de un 10 % del máximo no aparece nunca; dentro de ese margen sale como «casi» (△).</p>
      <div v-if="requirement" class="mt-2 flex flex-wrap items-center gap-3 text-xs" data-testid="req-budget">
        <span :class="budget.validated ? 'text-emerald-700' : 'text-stone-500'">
          <template v-if="budget.validated">✓ Presupuesto validado{{ budget.at ? ` el ${dt.date(budget.at)}` : '' }}{{ budget.by ? ` por ${budget.by}` : '' }}</template>
          <template v-else>Presupuesto sin validar</template>
        </span>
        <button v-if="canEdit" type="button" class="font-medium text-ink hover:underline" :disabled="budgetBusy" data-testid="req-validate-budget" @click="toggleBudget">
          {{ budget.validated ? 'Retirar validación' : 'Validar presupuesto' }}
        </button>
      </div>
    </section>

    <!-- 4. Superficie y distribución -->
    <section>
      <h4 class="rq-h">Superficie y distribución</h4>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <div class="rq-row"><span class="rq-label !mb-0">Superficie (m²)</span><ImportanceSelect v-model="form.importances.area" criterion="area" /></div>
          <div class="mt-1.5 grid grid-cols-2 gap-2">
            <input v-model.number="form.areaMin" type="number" min="0" class="rq-input" placeholder="Mín." aria-label="Superficie mínima" data-testid="req-area-min">
            <input v-model.number="form.areaMax" type="number" min="0" class="rq-input" placeholder="Máx." aria-label="Superficie máxima" data-testid="req-area-max">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <div class="rq-row"><span class="rq-label !mb-0">Dorm. mín.</span><ImportanceSelect v-model="form.importances.bedrooms" criterion="bedrooms" /></div>
            <input v-model.number="form.bedroomsMin" type="number" min="0" step="1" class="rq-input mt-1.5" aria-label="Dormitorios mínimos" data-testid="req-bedrooms">
          </div>
          <div>
            <div class="rq-row"><span class="rq-label !mb-0">Baños mín.</span><ImportanceSelect v-model="form.importances.bathrooms" criterion="bathrooms" /></div>
            <input v-model.number="form.bathroomsMin" type="number" min="0" step="1" class="rq-input mt-1.5" aria-label="Baños mínimos" data-testid="req-bathrooms">
          </div>
        </div>
      </div>
    </section>

    <!-- 5. Zonas y radio -->
    <section>
      <div class="rq-row">
        <h4 class="rq-h !mb-0">Zona</h4>
        <ImportanceSelect v-model="form.importances.zone" criterion="zone" />
      </div>
      <p class="rq-hint !mt-1">Zonas deseadas y radio se suman: basta con estar en una zona deseada o dentro del radio.</p>
      <div class="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <span class="rq-label">Zonas deseadas</span>
          <ZoneListEditor v-model="form.desiredZones" title="Zona deseada" test-prefix="req-zone" />
        </div>
        <div>
          <span class="rq-label">Zonas excluidas <span class="font-normal text-rose-700">· descartan siempre</span></span>
          <ZoneListEditor v-model="form.excludedZones" title="Zona excluida" test-prefix="req-exzone" tone="exclude" />
        </div>
      </div>

      <div class="mt-4 rounded-xl border border-line p-3">
        <div class="rq-row">
          <span class="rq-label !mb-0">Radio de búsqueda</span>
          <button v-if="!useRadius" type="button" class="text-[12px] font-medium text-ink hover:underline" data-testid="req-radius-enable" @click="useRadius = true">Buscar en un radio</button>
          <button v-else type="button" class="text-[12px] font-medium text-stone-500 hover:underline" data-testid="req-radius-clear" @click="clearRadius">Quitar radio</button>
        </div>
        <template v-if="useRadius">
          <div class="mt-2 flex flex-wrap gap-2">
            <input v-model="placeQuery" class="rq-input min-w-0 flex-1" placeholder="Un lugar: «Colegio Alemán, Madrid», «Plaza de Olavide»…" aria-label="Lugar del centro" @keydown.enter.prevent="geocode">
            <button type="button" class="rounded-lg border border-line px-3 py-2 text-[13px] font-medium hover:bg-stone-50 disabled:opacity-50" :disabled="!placeQuery.trim() || geocoding" @click="geocode">
              {{ geocoding ? 'Buscando…' : 'Situar en el mapa' }}
            </button>
          </div>
          <p v-if="geocodeError" class="mt-1 text-[12px] text-red-600">{{ geocodeError }}</p>
          <div class="mt-2 grid gap-2 sm:grid-cols-3">
            <label class="block"><span class="rq-label">Centro: latitud</span><input v-model.number="form.centerLat" type="number" step="0.000001" class="rq-input" data-testid="req-center-lat"></label>
            <label class="block"><span class="rq-label">Centro: longitud</span><input v-model.number="form.centerLng" type="number" step="0.000001" class="rq-input" data-testid="req-center-lng"></label>
            <label class="block"><span class="rq-label">Radio (km)</span><input v-model.number="form.radiusKm" type="number" min="0" step="0.5" class="rq-input" data-testid="req-radius"></label>
          </div>
          <ClientOnly>
            <div class="mt-2">
              <LocationPicker :lat="numOrNull(form.centerLat)" :lng="numOrNull(form.centerLng)" @update:lat="(v: number) => (form.centerLat = v)" @update:lng="(v: number) => (form.centerLng = v)" />
            </div>
          </ClientOnly>
          <p class="rq-hint">Haz clic en el mapa o arrastra el marcador para fijar el centro. La distancia la calcula el servidor; un inmueble sin coordenadas sale como «no se sabe», nunca como fuera del radio.</p>
        </template>
      </div>
    </section>

    <!-- 6. Estado y obra -->
    <section>
      <h4 class="rq-h">Estado y obra</h4>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <div class="rq-row"><span class="rq-label !mb-0">Estado del inmueble</span><ImportanceSelect v-model="form.importances.condition" criterion="condition" /></div>
          <select v-model="form.conditionPref" class="rq-input mt-1.5" data-testid="req-condition">
            <option :value="null">Sin preferencia</option>
            <option v-for="c in CONDITION_PREFS" :key="c" :value="c">{{ CONDITION_PREF_LABELS[c] }}</option>
          </select>
        </div>
        <div>
          <div class="rq-row"><span class="rq-label !mb-0">Obra nueva / 2ª mano / reformado</span><ImportanceSelect v-model="form.importances.build" criterion="build" /></div>
          <select v-model="form.buildPref" class="rq-input mt-1.5" data-testid="req-build">
            <option :value="null">Sin preferencia</option>
            <option v-for="b in BUILD_PREFS" :key="b" :value="b">{{ BUILD_PREF_LABELS[b] }}</option>
          </select>
        </div>
      </div>
      <p class="rq-hint">Se compara con el «Estado físico», el año de construcción y «Reformado» / «Año de reforma» de la ficha del inmueble. Si la ficha no lo dice, la línea sale como «no consta», nunca como cumplida.</p>
    </section>

    <!-- 7. Características -->
    <section>
      <h4 class="rq-h">Características</h4>
      <p class="rq-hint !mt-0 mb-2">«Indiferente» es no declararla: que no pida garaje no significa que lo rechace. Si la marcas, elige si la quiere o la quiere sin.</p>
      <div class="grid gap-2 sm:grid-cols-2">
        <div v-for="f in FEATURE_CRITERIA" :key="f" class="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2" :data-testid="`req-feature-${f}`">
          <span class="w-36 text-sm">{{ CRITERION_LABELS[f] }}</span>
          <ImportanceSelect v-model="form.features[f].importance" :criterion="f" />
          <select v-if="form.features[f].importance !== 'indifferent'" v-model="form.features[f].wanted" class="rounded-lg border border-line bg-white px-2 py-1.5 text-[12px]" :aria-label="`${CRITERION_LABELS[f]}: la quiere o la quiere sin`" :data-testid="`req-feature-want-${f}`">
            <option :value="true">La quiere</option>
            <option :value="false">La quiere sin</option>
          </select>
        </div>
      </div>
    </section>

    <!-- 8. Financiación -->
    <section>
      <h4 class="rq-h">Financiación</h4>
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="rq-label">¿Necesita hipoteca?</span>
          <select v-model="form.needsMortgage" class="rq-input" data-testid="req-needs-mortgage">
            <option :value="null">Sin especificar</option>
            <option :value="1">Sí</option>
            <option :value="0">No</option>
          </select>
        </label>
        <label class="block">
          <span class="rq-label">Estado de la hipoteca</span>
          <select v-model="form.mortgageStatus" class="rq-input" data-testid="req-mortgage-status">
            <option :value="null">Sin especificar</option>
            <option v-for="m in MORTGAGE_STATUSES" :key="m" :value="m">{{ MORTGAGE_STATUS_LABELS[m] }}</option>
          </select>
        </label>
        <label class="block sm:col-span-2">
          <span class="rq-label">Notas de financiación</span>
          <textarea v-model="form.financingNotes" rows="2" class="rq-input" maxlength="2000" placeholder="Banco, importe preaprobado, ahorro aportado…" data-testid="req-financing-notes" />
        </label>
      </div>
    </section>

    <section>
      <label class="block">
        <span class="rq-label">Notas</span>
        <textarea v-model="form.notes" rows="2" class="rq-input" maxlength="4000" data-testid="req-notes" />
      </label>
    </section>

    <details class="rounded-lg bg-stone-50 px-3 py-2 text-[12px] text-stone-600">
      <summary class="cursor-pointer font-medium">Qué filtra siempre, sea cual sea la importancia</summary>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        <li v-for="n in HARD_FILTER_NOTES" :key="n.key">{{ n.text }}</li>
      </ul>
    </details>

    <div class="flex flex-wrap items-center gap-3 border-t border-line pt-4">
      <button type="submit" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="saving || !canEdit" data-testid="req-save">
        {{ saving ? 'Guardando…' : requirement ? 'Guardar cambios' : 'Guardar necesidad' }}
      </button>
      <button type="button" class="text-[13px] text-stone-500 hover:underline" @click="emit('cancel')">Cancelar</button>
      <span v-if="error" class="text-sm font-medium text-red-600" data-testid="req-error">{{ error }}</span>
    </div>
  </form>
</template>

<script setup lang="ts">
import ImportanceSelect from '~/components/admin/requirements/ImportanceSelect.vue'
import ZoneListEditor from '~/components/admin/requirements/ZoneListEditor.vue'
import LocationPicker from '~/components/property-builder/LocationPicker.client.vue'
import {
  BUILD_PREFS,
  BUILD_PREF_LABELS,
  CONDITION_PREFS,
  CONDITION_PREF_LABELS,
  CRITERION_LABELS,
  FEATURE_CRITERIA,
  HARD_FILTER_NOTES,
  MORTGAGE_STATUSES,
  MORTGAGE_STATUS_LABELS,
  REQUIREMENT_OPERATIONS,
  REQUIREMENT_OPERATION_LABELS,
  URGENCIES,
  URGENCY_LABELS,
  VALUE_CRITERIA,
  defaultImportanceOf,
  type FeatureCriterion,
  type Importance,
  type ValueCriterion,
  type ZoneRefLike,
} from '~/utils/buyerRequirementCatalog'
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from '~/utils/propertySheet'

/**
 * Editor completo de una necesidad del comprador (FASE 10), para crearla y
 * para editarla desde la pestaña «Necesidades» del contacto. Todos los campos
 * del modelo (`buyer_requirements`) y la importancia de cada preferencia
 * (`buyer_requirement_criteria`). Guarda con el POST o el PATCH de siempre:
 * el servidor vuelve a validarlo todo (server/utils/buyerRequirements/service.ts).
 */
const props = withDefaults(defineProps<{ contactId: number; requirement?: any | null }>(), { requirement: null })
const emit = defineEmits<{ saved: [row: any]; cancel: [] }>()
const dt = useDash()
// Los precios de una necesidad están en la moneda de la agencia (utils/currency.ts).
const { symbol: currencyLabel } = useAgencyCurrency()
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => canWrite('crm'))

type FeatureState = { importance: Importance; wanted: boolean }
interface FormState {
  title: string
  operation: string
  urgency: string | null
  desiredDate: string
  propertyTypes: string[]
  priceMin: number | '' | null
  priceMax: number | '' | null
  areaMin: number | '' | null
  areaMax: number | '' | null
  bedroomsMin: number | '' | null
  bathroomsMin: number | '' | null
  desiredZones: ZoneRefLike[]
  excludedZones: ZoneRefLike[]
  centerLat: number | '' | null
  centerLng: number | '' | null
  radiusKm: number | '' | null
  conditionPref: string | null
  buildPref: string | null
  needsMortgage: number | null
  mortgageStatus: string | null
  financingNotes: string
  notes: string
  importances: Record<ValueCriterion, Importance>
  features: Record<FeatureCriterion, FeatureState>
}

function initialForm(r: any | null): FormState {
  const criteria: { criterionType: string; importance: Importance; valueBool: number | null }[] = r?.criteria || []
  const rowOf = (key: string) => criteria.find((c) => c.criterionType === key)
  const importances = Object.fromEntries(VALUE_CRITERIA.map((k) => [k, rowOf(k)?.importance || defaultImportanceOf(k)])) as Record<ValueCriterion, Importance>
  const features = Object.fromEntries(
    FEATURE_CRITERIA.map((f) => {
      const row = rowOf(f)
      return [f, row ? { importance: row.importance, wanted: row.valueBool !== 0 } : { importance: 'indifferent' as Importance, wanted: true }]
    }),
  ) as Record<FeatureCriterion, FeatureState>
  return {
    title: r?.title || '',
    operation: r?.operation || 'sale',
    urgency: r?.urgency ?? null,
    desiredDate: r?.desiredDate || '',
    propertyTypes: [...(r?.propertyTypes || [])],
    priceMin: r?.priceMin ?? null,
    priceMax: r?.priceMax ?? null,
    areaMin: r?.areaMin ?? null,
    areaMax: r?.areaMax ?? null,
    bedroomsMin: r?.bedroomsMin ?? null,
    bathroomsMin: r?.bathroomsMin ?? null,
    desiredZones: [...(r?.desiredZones || [])],
    excludedZones: [...(r?.excludedZones || [])],
    centerLat: r?.centerLat ?? null,
    centerLng: r?.centerLng ?? null,
    radiusKm: r?.radiusKm ?? null,
    conditionPref: r?.conditionPref ?? null,
    buildPref: r?.buildPref ?? null,
    needsMortgage: r?.needsMortgage ?? null,
    mortgageStatus: r?.mortgageStatus ?? null,
    financingNotes: r?.financingNotes || '',
    notes: r?.notes || '',
    importances,
    features,
  }
}

const form = reactive<FormState>(initialForm(props.requirement))
const useRadius = ref(props.requirement?.radiusKm != null)
const saving = ref(false)
const error = ref('')

/** `v-model.number` deja '' en un campo vaciado: eso es «sin especificar», nunca 0. */
function numOrNull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function clearRadius() {
  useRadius.value = false
  form.centerLat = null
  form.centerLng = null
  form.radiusKm = null
}

// --- Centro del radio a partir de un lugar (el mismo geocodificador que el mapa del editor de propiedad) ---
const placeQuery = ref('')
const geocoding = ref(false)
const geocodeError = ref('')
async function geocode() {
  geocoding.value = true
  geocodeError.value = ''
  try {
    const res = await $fetch<{ results: { lat: number; lng: number }[] }>('/api/admin/geocode', { query: { city: placeQuery.value } })
    const first = res.results[0]
    if (!first) geocodeError.value = 'No se ha encontrado ese lugar. Prueba con otra forma de escribirlo o fija el centro en el mapa.'
    else {
      form.centerLat = Math.round(first.lat * 1e6) / 1e6
      form.centerLng = Math.round(first.lng * 1e6) / 1e6
    }
  } catch {
    geocodeError.value = 'No se pudo buscar el lugar ahora mismo. Fija el centro en el mapa.'
  } finally {
    geocoding.value = false
  }
}

// --- Presupuesto validado: acción con autor y fecha (endpoint propio, no un campo del formulario) ---
const budget = reactive({
  validated: !!props.requirement?.budgetValidated,
  at: (props.requirement?.budgetValidatedAt as string | null) || null,
  by: (props.requirement?.budgetValidatedByName as string | null) || null,
})
const budgetBusy = ref(false)
async function toggleBudget() {
  if (!props.requirement) return
  budgetBusy.value = true
  try {
    const row = await $fetch<any>(`/api/admin/saas/buyer-requirements/${props.requirement.id}/validate-budget`, { method: 'POST', body: { validated: !budget.validated } })
    budget.validated = !!row.budgetValidated
    budget.at = row.budgetValidatedAt || null
    budget.by = row.budgetValidated ? 'ti' : null
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'No se pudo actualizar la validación del presupuesto'
  } finally {
    budgetBusy.value = false
  }
}

/** ¿El criterio tiene algún valor? Sólo entonces se guarda su importancia (sin valor no hay nada que pesar). */
function hasValue(criterion: ValueCriterion, body: Record<string, any>): boolean {
  switch (criterion) {
    case 'propertyType':
      return body.propertyTypes.length > 0
    case 'price':
      return body.priceMin != null || body.priceMax != null
    case 'area':
      return body.areaMin != null || body.areaMax != null
    case 'bedrooms':
      return body.bedroomsMin != null
    case 'bathrooms':
      return body.bathroomsMin != null
    case 'zone':
      return body.desiredZones.length > 0 || body.excludedZones.length > 0 || body.radiusKm != null
    case 'condition':
      return !!body.conditionPref && body.conditionPref !== 'any'
    case 'build':
      return !!body.buildPref
  }
}

function payload() {
  const radiusKm = useRadius.value ? numOrNull(form.radiusKm) : null
  const body: Record<string, any> = {
    title: form.title.trim(),
    operation: form.operation,
    urgency: form.urgency,
    desiredDate: form.desiredDate || null,
    propertyTypes: [...form.propertyTypes],
    priceMin: numOrNull(form.priceMin),
    priceMax: numOrNull(form.priceMax),
    areaMin: numOrNull(form.areaMin),
    areaMax: numOrNull(form.areaMax),
    bedroomsMin: numOrNull(form.bedroomsMin),
    bathroomsMin: numOrNull(form.bathroomsMin),
    desiredZones: form.desiredZones,
    excludedZones: form.excludedZones,
    radiusKm,
    centerLat: radiusKm != null ? numOrNull(form.centerLat) : null,
    centerLng: radiusKm != null ? numOrNull(form.centerLng) : null,
    conditionPref: form.conditionPref,
    buildPref: form.buildPref,
    needsMortgage: form.needsMortgage,
    mortgageStatus: form.mortgageStatus,
    financingNotes: form.financingNotes.trim() || null,
    notes: form.notes.trim() || null,
  }
  const importances: Record<string, Importance> = {}
  for (const c of VALUE_CRITERIA) if (hasValue(c, body)) importances[c] = form.importances[c]
  const features: Record<string, boolean> = {}
  for (const f of FEATURE_CRITERIA) {
    const state = form.features[f]
    if (state.importance === 'indifferent') continue
    importances[f] = state.importance
    features[f] = state.wanted
  }
  body.importances = importances
  body.features = features
  return body
}

/** Lo mismo que comprueba el servidor, dicho antes de enviar. El servidor lo vuelve a validar igual. */
function clientError(body: Record<string, any>): string {
  if (body.priceMin != null && body.priceMax != null && body.priceMin > body.priceMax) return 'El precio mínimo no puede superar al máximo'
  if (body.areaMin != null && body.areaMax != null && body.areaMin > body.areaMax) return 'La superficie mínima no puede superar a la máxima'
  for (const [label, v] of [['dormitorios', body.bedroomsMin], ['baños', body.bathroomsMin]] as const) {
    if (v != null && (!Number.isInteger(v) || v < 0)) return `El número de ${label} debe ser un entero no negativo`
  }
  if (useRadius.value && body.radiusKm == null) return 'Indica el radio en km o quita el radio'
  if (body.radiusKm != null && (body.centerLat == null || body.centerLng == null)) return 'Un radio de búsqueda necesita el centro: sitúalo en el mapa'
  return ''
}

async function save() {
  error.value = ''
  const body = payload()
  const problem = clientError(body)
  if (problem) {
    error.value = problem
    return
  }
  saving.value = true
  try {
    const row = props.requirement
      ? await $fetch<any>(`/api/admin/saas/buyer-requirements/${props.requirement.id}`, { method: 'PATCH', body })
      : await $fetch<any>('/api/admin/saas/buyer-requirements', { method: 'POST', body: { ...body, contactId: props.contactId } })
    emit('saved', row)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'No se pudo guardar'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.rq-h {
  @apply mb-3 text-[13px] font-semibold text-ink;
}
.rq-row {
  @apply flex flex-wrap items-center justify-between gap-2;
}
.rq-label {
  @apply mb-1.5 block text-[12px] font-medium text-stone-600;
}
.rq-hint {
  @apply mt-1.5 block text-[11px] text-stone-400;
}
.rq-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
</style>

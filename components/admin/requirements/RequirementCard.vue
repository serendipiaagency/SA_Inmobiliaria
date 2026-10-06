<template>
  <AdminPanel :data-testid="`requirement-card-${requirement.id}`">
    <RequirementEditor v-if="editing" :contact-id="contact.id" :requirement="requirement" @saved="onSaved" @cancel="editing = false" />

    <template v-else>
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ requirement.title || 'Necesidad' }}</p>
          <p class="mt-1 text-sm text-stone-600" :data-testid="`requirement-summary-${requirement.id}`">{{ requirement.summary }}</p>
          <p v-if="details.length" class="mt-1 text-xs text-stone-400">{{ details.join(' · ') }}</p>
        </div>
        <select
          class="shrink-0 rounded-full border-0 px-2 py-0.5 text-[11px] font-medium"
          :class="statusClass(requirement.status)"
          :value="requirement.status"
          :disabled="!canEdit"
          :data-testid="`requirement-status-${requirement.id}`"
          @change="setStatus(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="s in REQUIREMENT_STATUSES" :key="s" :value="s">{{ REQUIREMENT_STATUS_LABELS[s] }}</option>
        </select>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs">
        <span :class="requirement.budgetValidated ? 'text-emerald-700' : 'text-stone-400'">
          <template v-if="requirement.budgetValidated">
            ✓ Presupuesto validado{{ requirement.budgetValidatedAt ? ` el ${dt.date(requirement.budgetValidatedAt)}` : '' }}{{ requirement.budgetValidatedByName ? ` por ${requirement.budgetValidatedByName}` : '' }}
          </template>
          <template v-else>Presupuesto sin validar</template>
        </span>
        <button v-if="canEdit" type="button" class="font-medium text-ink hover:underline" @click="toggleBudget">
          {{ requirement.budgetValidated ? 'Retirar validación' : 'Validar presupuesto' }}
        </button>
        <button v-if="canEdit" type="button" class="font-medium text-ink hover:underline" :data-testid="`requirement-edit-${requirement.id}`" @click="editing = true">Editar</button>
        <button type="button" class="font-medium text-ink hover:underline" :data-testid="`match-search-${requirement.id}`" @click="toggleSearch">
          {{ matches ? 'Ocultar propiedades' : 'Buscar propiedades' }}
        </button>
      </div>

      <!-- Necesidad → inmuebles compatibles. El score y su explicación vienen
           del motor; esta tarjeta sólo los enseña y ofrece las acciones. -->
      <div v-if="matches || loading" class="mt-3 border-t border-line pt-3" :data-testid="`match-results-${requirement.id}`">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <label class="flex items-center gap-1.5 text-stone-500">
            <input v-model="includeIneligible" type="checkbox" @change="search"> Incluir los descartados por un imprescindible
          </label>
          <button
            v-if="canEdit && picked.length"
            type="button"
            class="rounded-lg bg-ink px-3 py-1.5 font-medium text-white"
            :data-testid="`requirement-selection-${requirement.id}`"
            @click="selectionOpen = true"
          >
            Crear selección con {{ picked.length }} {{ picked.length === 1 ? 'propiedad' : 'propiedades' }}
          </button>
        </div>
        <p v-if="loading" class="text-xs text-stone-400">Buscando…</p>
        <p v-else-if="!matches?.results.length" class="text-xs text-stone-500">Ningún inmueble disponible encaja con esta necesidad ahora mismo.</p>
        <ul v-else class="space-y-3">
          <li v-for="m in matches.results" :key="`${m.propertyKind}-${m.property.id}`" class="rounded-lg border border-line p-3" :data-testid="`match-property-${m.propertyKind}-${m.property.id}`">
            <div class="flex items-start gap-3">
              <input
                v-if="canEdit"
                v-model="picked"
                type="checkbox"
                class="mt-1"
                :value="`${m.propertyKind}:${m.property.id}`"
                :aria-label="`Elegir ${propertyName(m)} para una selección`"
              >
              <div class="min-w-0 flex-1">
                <NuxtLink :to="propertyLink(m)" class="block truncate text-sm font-medium hover:underline">{{ propertyName(m) }}</NuxtLink>
                <p class="text-xs text-stone-400">
                  {{ m.propertyKind === 'developer' ? 'Propiedades (web)' : 'Propiedades 2ª mano' }} ·
                  {{ propertyTypeLabel(m.property.propertyType) }} · {{ m.property.price != null ? money(m.property.price) : 'Sin precio' }}
                </p>
              </div>
            </div>
            <AdminMatchBreakdown :result="m.result" class="mt-2" />
            <p v-if="m.persisted?.discardedReason" class="mt-1 text-[11px] text-stone-400">Motivo del descarte: {{ m.persisted.discardedReason }}</p>
            <MatchActions
              class="mt-2"
              :requirement-id="requirement.id"
              :requirement-title="requirement.title"
              :contact="contact"
              :property="{ id: m.property.id, kind: m.propertyKind, name: propertyName(m) }"
              :persisted="m.persisted"
              :default-agent-id="requirement.assignedCommercialId"
              @update:persisted="(v) => onPersisted(m, v)"
            />
          </li>
        </ul>
      </div>

      <SelectionModal
        v-if="selectionOpen"
        :requirement-id="requirement.id"
        :contact-id="contact.id"
        :contact-name="contact.name"
        :requirement-title="requirement.title"
        :items="pickedItems"
        @close="selectionOpen = false"
        @saved="onSelectionSaved"
      />
    </template>
  </AdminPanel>
</template>

<script setup lang="ts">
import AdminMatchBreakdown from '~/components/admin/MatchBreakdown.vue'
import AdminPanel from '~/components/admin/Panel.vue'
import MatchActions from '~/components/admin/matching/MatchActions.vue'
import SelectionModal from '~/components/admin/matching/SelectionModal.vue'
import RequirementEditor from '~/components/admin/requirements/RequirementEditor.vue'
import {
  BUILD_PREF_LABELS,
  CONDITION_PREF_LABELS,
  MORTGAGE_STATUS_LABELS,
  REQUIREMENT_STATUSES,
  REQUIREMENT_STATUS_LABELS,
  URGENCY_LABELS,
} from '~/utils/buyerRequirementCatalog'
import { propertyTypeLabel } from '~/utils/propertySheet'

/**
 * Una necesidad en la pestaña «Necesidades» del contacto: su resumen, su
 * estado, el presupuesto validado (con autor y fecha), «Editar» con el editor
 * completo y «Buscar propiedades» (Necesidad → inmuebles) con las acciones de
 * cada compatibilidad y la selección de varias a la vez.
 */
const props = defineProps<{
  requirement: any
  contact: { id: number; name: string; email?: string | null; phone?: string | null; whatsapp?: string | null }
}>()
const emit = defineEmits<{ changed: [] }>()
const dt = useDash()
const toast = useToast()
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => canWrite('crm'))

const editing = ref(false)
const matches = ref<any>(null)
const loading = ref(false)
const includeIneligible = ref(false)
const picked = ref<string[]>([])
const selectionOpen = ref(false)

/** Lo que el resumen no cuenta: m², baños, estado, obra, fecha, financiación, urgencia. */
const details = computed(() => {
  const r = props.requirement
  const out: string[] = []
  if (r.areaMin != null || r.areaMax != null) out.push([r.areaMin != null ? `≥ ${r.areaMin}` : null, r.areaMax != null ? `≤ ${r.areaMax}` : null].filter(Boolean).join(' y ') + ' m²')
  if (r.bathroomsMin != null) out.push(`≥ ${r.bathroomsMin} baños`)
  if (r.conditionPref && r.conditionPref !== 'any') out.push(CONDITION_PREF_LABELS[r.conditionPref] || r.conditionPref)
  if (r.buildPref) out.push(BUILD_PREF_LABELS[r.buildPref] || r.buildPref)
  if (r.desiredDate) out.push(`Para ${dt.date(r.desiredDate)}`)
  if (r.needsMortgage === 1) out.push(`Hipoteca: ${r.mortgageStatus ? MORTGAGE_STATUS_LABELS[r.mortgageStatus] : 'la necesita'}`)
  else if (r.needsMortgage === 0) out.push('Sin hipoteca')
  else if (r.mortgageStatus) out.push(`Hipoteca: ${MORTGAGE_STATUS_LABELS[r.mortgageStatus] || r.mortgageStatus}`)
  if (r.urgency) out.push(`Urgencia ${(URGENCY_LABELS[r.urgency] || r.urgency).toLowerCase()}`)
  return out
})

/** Importe en la moneda de la agencia (utils/currency.ts) — antes «€» fijo. */
function money(n: number) {
  return dt.money(n)
}
function propertyName(m: any): string {
  return m.property.name || m.property.reference || m.property.location || [m.property.street, m.property.city].filter(Boolean).join(', ') || `Inmueble #${m.property.id}`
}
function propertyLink(m: any): string {
  return `/admin/${m.propertyKind === 'developer' ? 'developer-properties' : 'properties'}/${m.property.id}`
}
function statusClass(s: string) {
  return { active: 'bg-emerald-100 text-emerald-700', paused: 'bg-amber-100 text-amber-700', fulfilled: 'bg-sky-100 text-sky-700', archived: 'bg-stone-200 text-stone-500' }[s] || 'bg-stone-100 text-stone-600'
}

const pickedItems = computed(() =>
  (matches.value?.results || [])
    .filter((m: any) => picked.value.includes(`${m.propertyKind}:${m.property.id}`))
    .map((m: any) => ({ propertyId: m.property.id, propertyKind: m.propertyKind, name: propertyName(m) })),
)

/** Consultar compatibilidades no guarda nada: el match sólo se persiste cuando alguien decide algo sobre él. */
async function search() {
  loading.value = true
  try {
    matches.value = await $fetch<any>(`/api/admin/saas/matching/requirement/${props.requirement.id}`, { query: { includeIneligible: includeIneligible.value ? '1' : undefined } })
    picked.value = picked.value.filter((key) => matches.value.results.some((m: any) => `${m.propertyKind}:${m.property.id}` === key))
  } catch {
    matches.value = null
    toast.error('No se pudo buscar propiedades')
  } finally {
    loading.value = false
  }
}

function toggleSearch() {
  if (matches.value) {
    matches.value = null
    picked.value = []
    return
  }
  search()
}

function onPersisted(m: any, value: any) {
  m.persisted = value
}

async function onSelectionSaved() {
  selectionOpen.value = false
  picked.value = []
  emit('changed')
  await search()
}

async function onSaved() {
  editing.value = false
  toast.success('Necesidad guardada')
  emit('changed')
  if (matches.value) await search()
}

async function setStatus(status: string) {
  try {
    await $fetch(`/api/admin/saas/buyer-requirements/${props.requirement.id}`, { method: 'PATCH', body: { status } })
    emit('changed')
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo actualizar el estado')
    emit('changed')
  }
}

async function toggleBudget() {
  try {
    await $fetch(`/api/admin/saas/buyer-requirements/${props.requirement.id}/validate-budget`, { method: 'POST', body: { validated: !props.requirement.budgetValidated } })
    emit('changed')
  } catch {
    toast.error('No se pudo actualizar')
  }
}
</script>

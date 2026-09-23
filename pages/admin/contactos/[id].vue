<template>
  <div class="max-w-4xl">
    <NuxtLink to="/admin/contactos" class="mb-4 inline-block text-sm text-stone-500 hover:text-ink">← Contactos</NuxtLink>

    <div v-if="!data?.contact" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
      Contacto no encontrado.
    </div>

    <template v-else>
      <div class="mb-6">
        <h1 class="text-2xl font-semibold tracking-tight">{{ data.contact.name }}</h1>
        <p class="mt-1 text-sm text-stone-500">
          <span v-if="data.contact.email">{{ data.contact.email }}</span>
          <span v-if="data.contact.email && data.contact.phone" class="text-stone-300"> · </span>
          <span v-if="data.contact.phone">{{ data.contact.phone }}</span>
        </p>
      </div>

      <div class="mb-5 flex flex-wrap gap-2">
        <button
          v-for="t in tabs"
          :key="t.key"
          type="button"
          :data-testid="`contact-tab-${t.key}`"
          class="rounded-full border px-3 py-1.5 text-[12px] font-medium transition"
          :class="tab === t.key ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:bg-stone-50'"
          @click="tab = t.key"
        >
          {{ t.label }}<span v-if="t.count" class="ml-1.5 opacity-70">{{ t.count }}</span>
        </button>
      </div>

      <!-- NECESIDADES -->
      <section v-show="tab === 'necesidades'">
        <div class="mb-4 flex items-center justify-between">
          <p class="text-sm text-stone-500">
            Una persona puede buscar varias cosas a la vez: vivienda habitual, inversión, local… cada una con sus propios criterios.
          </p>
          <button type="button" class="dash-btn-primary shrink-0" @click="showNew = !showNew">
            {{ showNew ? 'Cancelar' : 'Nueva necesidad' }}
          </button>
        </div>

        <AdminPanel v-if="showNew" title="Nueva necesidad" class="mb-5">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="cfg-label">Título</span>
              <input v-model="form.title" class="cfg-input" placeholder="Vivienda habitual" >
            </label>
            <label class="block">
              <span class="cfg-label">Operación</span>
              <select v-model="form.operation" class="cfg-input">
                <option value="sale">Compra</option>
                <option value="rent">Alquiler</option>
              </select>
            </label>
          </div>

          <p class="cfg-label mt-4">Tipo de inmueble</p>
          <div class="flex flex-wrap gap-2">
            <label v-for="t in PROPERTY_TYPES" :key="t" class="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs">
              <input v-model="form.propertyTypes" type="checkbox" :value="t" > {{ t }}
            </label>
          </div>

          <div class="mt-4 grid gap-4 sm:grid-cols-4">
            <label class="block">
              <span class="cfg-label">Precio mín. (€)</span>
              <input v-model.number="form.priceMin" type="number" min="0" class="cfg-input" >
            </label>
            <label class="block">
              <span class="cfg-label">Precio máx. (€)</span>
              <input v-model.number="form.priceMax" type="number" min="0" class="cfg-input" >
            </label>
            <label class="block">
              <span class="cfg-label">Dormitorios mín.</span>
              <input v-model.number="form.bedroomsMin" type="number" min="0" class="cfg-input" >
            </label>
            <label class="block">
              <span class="cfg-label">Superficie mín. (m²)</span>
              <input v-model.number="form.areaMin" type="number" min="0" class="cfg-input" >
            </label>
          </div>

          <label class="mt-4 block">
            <span class="cfg-label">Zonas deseadas</span>
            <input v-model="zonesText" class="cfg-input" placeholder="Chamberí, Salamanca" >
            <span class="mt-1 block text-[11px] text-stone-400">Separadas por comas. Se guardan como zonas estructuradas, no como texto suelto.</span>
          </label>

          <p class="cfg-label mt-4">Características</p>
          <p class="mb-2 text-[11px] text-stone-400">
            Lo que no marques queda sin declarar — que no pidas garaje no significa que lo rechaces.
          </p>
          <div class="space-y-2">
            <div v-for="f in FEATURES" :key="f.key" class="flex flex-wrap items-center gap-3">
              <label class="flex w-32 items-center gap-1.5 text-sm">
                <input v-model="form.features[f.key]" type="checkbox" > {{ f.label }}
              </label>
              <select v-if="form.features[f.key]" v-model="form.importances[f.key]" class="cfg-input max-w-[190px]">
                <option value="required">Imprescindible</option>
                <option value="preferred">Preferible</option>
                <option value="indifferent">Indiferente</option>
              </select>
            </div>
          </div>

          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="cfg-label">Urgencia</span>
              <select v-model="form.urgency" class="cfg-input">
                <option :value="null">Sin especificar</option>
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </label>
            <label class="block">
              <span class="cfg-label">Hipoteca</span>
              <select v-model="form.mortgageStatus" class="cfg-input">
                <option :value="null">Sin especificar</option>
                <option value="not_needed">No la necesita</option>
                <option value="required">La necesita</option>
                <option value="requested">Solicitada</option>
                <option value="preapproved">Preaprobada</option>
                <option value="approved">Aprobada</option>
              </select>
            </label>
          </div>

          <div class="mt-4 flex items-center gap-3">
            <button type="button" class="dash-btn-primary" :disabled="saving" @click="createRequirement">
              {{ saving ? 'Guardando…' : 'Guardar necesidad' }}
            </button>
            <span v-if="formError" class="text-sm font-medium text-red-600">{{ formError }}</span>
          </div>
        </AdminPanel>

        <div v-if="!data.requirements.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
          Sin necesidades registradas.
        </div>
        <div v-else class="space-y-3">
          <AdminPanel v-for="r in data.requirements" :key="r.id">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ r.title || 'Necesidad' }}</p>
                <p class="mt-1 text-sm text-stone-600">{{ r.summary }}</p>
              </div>
              <select
                class="shrink-0 rounded-full border-0 px-2 py-0.5 text-[11px] font-medium"
                :class="statusClass(r.status)"
                :value="r.status"
                :data-testid="`requirement-status-${r.id}`"
                @change="setRequirementStatus(r, ($event.target as HTMLSelectElement).value)"
              >
                <option value="active">Activa</option>
                <option value="paused">En pausa</option>
                <option value="fulfilled">Cubierta</option>
                <option value="archived">Archivada</option>
              </select>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs">
              <span :class="r.budgetValidated ? 'text-emerald-700' : 'text-stone-400'">
                {{ r.budgetValidated ? '✓ Presupuesto validado' : 'Presupuesto sin validar' }}
              </span>
              <button type="button" class="font-medium text-ink hover:underline" @click="toggleBudget(r)">
                {{ r.budgetValidated ? 'Retirar validación' : 'Validar presupuesto' }}
              </button>
              <button type="button" class="font-medium text-ink hover:underline" :data-testid="`match-search-${r.id}`" @click="searchProperties(r)">
                {{ matches[r.id] ? 'Ocultar propiedades' : 'Buscar propiedades' }}
              </button>
            </div>

            <!-- Necesidad → inmuebles compatibles. El score y su explicación
                 vienen del motor; esta pantalla sólo los enseña. -->
            <div v-if="matches[r.id]" class="mt-3 border-t border-line pt-3" :data-testid="`match-results-${r.id}`">
              <p v-if="matchLoading[r.id]" class="text-xs text-stone-400">Buscando…</p>
              <p v-else-if="!matches[r.id].results.length" class="text-xs text-stone-500">
                Ningún inmueble disponible encaja con esta necesidad ahora mismo.
              </p>
              <ul v-else class="space-y-3">
                <li v-for="m in matches[r.id].results" :key="m.property.id" class="rounded-lg border border-line p-3">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium">{{ m.property.name || m.property.location || `Inmueble #${m.property.id}` }}</p>
                      <p class="text-xs text-stone-400">
                        {{ m.propertyKind === 'developer' ? 'Propiedades (web)' : 'Propiedades 2ª mano' }} ·
                        {{ m.property.propertyType || 'Sin tipo' }} · {{ m.property.price != null ? money(m.property.price) : 'Sin precio' }}
                      </p>
                    </div>
                    <div class="flex shrink-0 gap-2 text-xs">
                      <button
                        type="button"
                        class="rounded-lg border border-line px-2 py-1 font-medium hover:bg-stone-50"
                        :class="m.persisted?.status === 'selected' ? 'border-emerald-300 text-emerald-700' : ''"
                        @click="decide(r, m, 'selected')"
                      >
                        {{ m.persisted?.status === 'selected' ? 'Seleccionado' : 'Seleccionar' }}
                      </button>
                      <button
                        type="button"
                        class="rounded-lg border border-line px-2 py-1 font-medium hover:bg-stone-50"
                        :class="m.persisted?.status === 'discarded' ? 'border-rose-300 text-rose-700' : ''"
                        @click="decide(r, m, 'discarded')"
                      >
                        {{ m.persisted?.status === 'discarded' ? 'Descartado' : 'Descartar' }}
                      </button>
                    </div>
                  </div>
                  <AdminMatchBreakdown :result="m.result" class="mt-2" />
                  <p v-if="m.persisted?.discardedReason" class="mt-1 text-[11px] text-stone-400">
                    Motivo: {{ m.persisted.discardedReason }}
                  </p>
                </li>
              </ul>
            </div>
          </AdminPanel>
        </div>
      </section>

      <!-- LEADS -->
      <section v-show="tab === 'leads'">
        <p v-if="!data.leads.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
          Esta persona no tiene ningún lead.
        </p>
        <AdminPanel v-else :pad="false">
          <ul class="divide-y divide-line text-sm">
            <li v-for="l in data.leads" :key="l.id" class="flex items-center justify-between px-4 py-3">
              <div>
                <p class="font-medium">{{ l.propertyName || 'Consulta general' }}</p>
                <p class="text-xs text-stone-400">{{ l.source }} · {{ dt.date(l.createdAt) }}</p>
              </div>
              <AdminStatusPill v-if="l.status" :status="l.status" />
            </li>
          </ul>
        </AdminPanel>
      </section>

      <!-- FICHA -->
      <section v-show="tab === 'ficha'">
        <AdminPanel title="Datos del contacto">
          <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt class="text-stone-400">Nombre</dt><dd>{{ data.contact.name }}</dd></div>
            <div><dt class="text-stone-400">Tipo</dt><dd>{{ data.contact.kind === 'company' ? 'Empresa' : 'Persona' }}</dd></div>
            <div><dt class="text-stone-400">Email</dt><dd>{{ data.contact.email || '—' }}</dd></div>
            <div><dt class="text-stone-400">Teléfono</dt><dd>{{ data.contact.phone || '—' }}</dd></div>
            <div><dt class="text-stone-400">Alta</dt><dd>{{ dt.date(data.contact.createdAt) }}</dd></div>
            <div v-if="data.clients.length"><dt class="text-stone-400">Ficha de cliente</dt><dd>{{ data.clients.map((c: any) => c.type).join(', ') }}</dd></div>
          </dl>
        </AdminPanel>

        <!-- Deduplicación (FASE 14): sólo detecta y ofrece fusionar — nunca automático. -->
        <AdminPanel title="Posibles duplicados" class="mt-4">
          <button v-if="!dupChecked" type="button" class="dash-btn-primary" :disabled="dupLoading" @click="checkDuplicates">
            {{ dupLoading ? 'Buscando…' : 'Buscar duplicados' }}
          </button>
          <template v-else>
            <p v-if="!duplicates.length" class="text-sm text-stone-500">No se ha encontrado ningún posible duplicado dentro de tu organización.</p>
            <ul v-else class="space-y-2">
              <li v-for="c in duplicates" :key="c.contactId" class="flex items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm">
                <div class="min-w-0">
                  <p class="font-medium">{{ c.name }}</p>
                  <p class="text-xs text-stone-400">{{ c.email || c.phone || '—' }} · coincide por {{ c.matchedOn }} ({{ c.level === 'exact' ? 'exacto' : 'posible' }})</p>
                </div>
                <button type="button" class="shrink-0 font-medium text-ink hover:underline" @click="openMergePreview(c.contactId)">Revisar y fusionar</button>
              </li>
            </ul>
          </template>

          <!-- Preview de fusión: nunca se fusiona sin ver antes qué se pierde/gana. -->
          <div v-if="mergePreview" class="mt-4 rounded-xl border border-line bg-stone-50 p-4">
            <p class="text-sm font-medium">Fusionar «{{ mergePreview.duplicate.name }}» en «{{ mergePreview.master.name }}»</p>
            <p class="mt-1 text-xs text-stone-500">
              Se moverán {{ mergePreview.relations.buyerRequirements }} necesidad(es), {{ mergePreview.relations.leads }} lead(s) y
              {{ mergePreview.relations.clients }} ficha(s) de cliente. «{{ mergePreview.duplicate.name }}» quedará archivado, nunca borrado.
            </p>
            <div v-if="mergePreview.conflicts.length" class="mt-3 space-y-2">
              <p class="text-xs font-medium text-stone-600">Estos campos no coinciden — elige cuál se queda:</p>
              <div v-for="conflict in mergePreview.conflicts" :key="conflict.field" class="text-xs">
                <p class="mb-1 capitalize text-stone-500">{{ conflict.field }}</p>
                <label class="mr-4 inline-flex items-center gap-1.5">
                  <input v-model="mergeFields[conflict.field]" type="radio" :value="conflict.masterValue" > {{ conflict.masterValue }} (actual)
                </label>
                <label class="inline-flex items-center gap-1.5">
                  <input v-model="mergeFields[conflict.field]" type="radio" :value="conflict.duplicateValue" > {{ conflict.duplicateValue }} (duplicado)
                </label>
              </div>
            </div>
            <div class="mt-3 flex items-center gap-2">
              <button type="button" class="dash-btn-primary" :disabled="merging" @click="confirmMerge">{{ merging ? 'Fusionando…' : 'Confirmar fusión' }}</button>
              <button type="button" class="text-xs font-medium text-stone-500 hover:underline" @click="mergePreview = null">Cancelar</button>
            </div>
          </div>
        </AdminPanel>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
const route = useRoute()
const dt = useDash()
const toast = useToast()

const PROPERTY_TYPES = ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio']
const FEATURES = [
  { key: 'terrace', label: 'Terraza' },
  { key: 'elevator', label: 'Ascensor' },
  { key: 'garage', label: 'Garaje' },
  { key: 'pool', label: 'Piscina' },
  { key: 'garden', label: 'Jardín' },
]

const { data, refresh } = await useFetch<any>(`/api/admin/saas/contacts/${route.params.id}`)
useHead({ title: () => `${data.value?.contact?.name || 'Contacto'} — M&M Real Estate` })

const tab = ref<'necesidades' | 'leads' | 'ficha'>('necesidades')
const tabs = computed(() => [
  { key: 'necesidades' as const, label: 'Necesidades', count: data.value?.requirements?.length || 0 },
  { key: 'leads' as const, label: 'Leads', count: data.value?.leads?.length || 0 },
  { key: 'ficha' as const, label: 'Ficha', count: 0 },
])

const showNew = ref(false)
const saving = ref(false)
const formError = ref('')
const zonesText = ref('')
const form = reactive<any>({
  title: '',
  operation: 'sale',
  propertyTypes: [] as string[],
  priceMin: null,
  priceMax: null,
  bedroomsMin: null,
  areaMin: null,
  urgency: null,
  mortgageStatus: null,
  features: {} as Record<string, boolean>,
  importances: {} as Record<string, string>,
})

async function createRequirement() {
  formError.value = ''
  saving.value = true
  try {
    const desiredZones = zonesText.value
      .split(',')
      .map((z) => z.trim())
      .filter(Boolean)
      .map((label) => ({ label }))

    await $fetch('/api/admin/saas/buyer-requirements', {
      method: 'POST',
      body: { ...form, contactId: Number(route.params.id), desiredZones },
    })
    showNew.value = false
    zonesText.value = ''
    Object.assign(form, { title: '', propertyTypes: [], priceMin: null, priceMax: null, bedroomsMin: null, areaMin: null, urgency: null, mortgageStatus: null, features: {}, importances: {} })
    await refresh()
    toast.success('Necesidad guardada')
  } catch (err: any) {
    formError.value = err?.data?.statusMessage || 'No se pudo guardar'
  } finally {
    saving.value = false
  }
}

async function toggleBudget(r: any) {
  try {
    await $fetch(`/api/admin/saas/buyer-requirements/${r.id}/validate-budget`, {
      method: 'POST',
      body: { validated: !r.budgetValidated },
    })
    await refresh()
  } catch {
    toast.error('No se pudo actualizar')
  }
}

/** El estado de la necesidad (activa/pausada/cubierta/archivada) — no confundir con el estado comercial de un match concreto. */
async function setRequirementStatus(r: any, status: string) {
  const previous = r.status
  r.status = status
  try {
    await $fetch(`/api/admin/saas/buyer-requirements/${r.id}`, { method: 'PATCH', body: { status } })
  } catch (err: any) {
    r.status = previous
    toast.error(err?.data?.statusMessage || 'No se pudo actualizar el estado')
  }
}

// --- Matching (FASE 11) ----------------------------------------------------
// Consultar compatibilidades no guarda nada: el match se persiste sólo cuando
// alguien decide algo sobre él (seleccionar / descartar).
const matches = reactive<Record<number, any>>({})
const matchLoading = reactive<Record<number, boolean>>({})

function money(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

async function searchProperties(r: any) {
  if (matches[r.id]) {
    matches[r.id] = null
    return
  }
  matches[r.id] = { results: [] }
  matchLoading[r.id] = true
  try {
    matches[r.id] = await $fetch<any>(`/api/admin/saas/matching/requirement/${r.id}`)
  } catch {
    matches[r.id] = null
    toast.error('No se pudo buscar propiedades')
  } finally {
    matchLoading[r.id] = false
  }
}

async function decide(r: any, m: any, status: 'selected' | 'discarded') {
  // Descartar pide motivo: un match descartado sin explicación vuelve a
  // aparecer mañana sin que nadie recuerde por qué se cayó.
  let discardedReason: string | undefined
  if (status === 'discarded') {
    discardedReason = window.prompt('Motivo del descarte (opcional)') || undefined
  }
  try {
    const saved = await $fetch<any>('/api/admin/saas/matching/matches', {
      method: 'POST',
      body: { buyerRequirementId: r.id, propertyId: m.property.id, propertyKind: m.propertyKind, status, discardedReason },
    })
    m.persisted = { id: saved.id, status: saved.status, discardedReason: saved.discardedReason }
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo guardar la decisión')
  }
}

function statusClass(s: string) {
  return { active: 'bg-emerald-100 text-emerald-700', paused: 'bg-amber-100 text-amber-700', fulfilled: 'bg-sky-100 text-sky-700', archived: 'bg-stone-200 text-stone-500' }[s] || 'bg-stone-100 text-stone-600'
}

// --- Deduplicación de Contact (FASE 14) -------------------------------------
const dupChecked = ref(false)
const dupLoading = ref(false)
const duplicates = ref<any[]>([])

async function checkDuplicates() {
  dupLoading.value = true
  try {
    duplicates.value = (
      await $fetch<any>('/api/admin/saas/contacts/check-duplicates', {
        method: 'POST',
        body: { name: data.value.contact.name, email: data.value.contact.email, phone: data.value.contact.phone, excludeContactId: Number(route.params.id) },
      })
    ).duplicates
    dupChecked.value = true
  } catch {
    toast.error('No se pudo buscar duplicados')
  } finally {
    dupLoading.value = false
  }
}

const mergePreview = ref<any>(null)
const mergeFields = reactive<Record<string, string>>({})
const merging = ref(false)

async function openMergePreview(duplicateId: number) {
  try {
    mergePreview.value = await $fetch<any>('/api/admin/saas/contacts/merge-preview', {
      query: { masterId: Number(route.params.id), duplicateId },
    })
    Object.keys(mergeFields).forEach((k) => { mergeFields[k] = undefined as any })
    for (const c of mergePreview.value.conflicts) mergeFields[c.field] = c.masterValue
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo cargar la comparación')
  }
}

async function confirmMerge() {
  if (!mergePreview.value) return
  merging.value = true
  try {
    await $fetch('/api/admin/saas/contacts/merge', {
      method: 'POST',
      body: { masterId: Number(route.params.id), duplicateId: mergePreview.value.duplicate.id, fields: { ...mergeFields } },
    })
    mergePreview.value = null
    dupChecked.value = false
    duplicates.value = []
    await refresh()
    toast.success('Contactos fusionados')
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo fusionar')
  } finally {
    merging.value = false
  }
}
</script>

<style scoped>
.cfg-label {
  @apply mb-1.5 block text-[12px] font-medium text-stone-600;
}
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50;
}
</style>

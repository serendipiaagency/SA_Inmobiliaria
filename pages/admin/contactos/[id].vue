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
              <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass(r.status)">{{ statusLabel(r.status) }}</span>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs">
              <span :class="r.budgetValidated ? 'text-emerald-700' : 'text-stone-400'">
                {{ r.budgetValidated ? '✓ Presupuesto validado' : 'Presupuesto sin validar' }}
              </span>
              <button type="button" class="font-medium text-ink hover:underline" @click="toggleBudget(r)">
                {{ r.budgetValidated ? 'Retirar validación' : 'Validar presupuesto' }}
              </button>
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

function statusLabel(s: string) {
  return { active: 'Activa', paused: 'En pausa', fulfilled: 'Cubierta', archived: 'Archivada' }[s] || s
}
function statusClass(s: string) {
  return { active: 'bg-emerald-100 text-emerald-700', paused: 'bg-amber-100 text-amber-700', fulfilled: 'bg-sky-100 text-sky-700', archived: 'bg-stone-200 text-stone-500' }[s] || 'bg-stone-100 text-stone-600'
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

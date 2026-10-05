<template>
  <AdminCommsModal
    :title="lead ? 'Editar lead' : 'Nuevo lead'"
    :sub="lead ? 'Datos de captación del lead. La fase, el resultado y el comercial se cambian desde la ficha.' : 'Alta manual. Antes de crear se comprueba si ya existe por email, teléfono, WhatsApp o id externo.'"
    wide
    test-id="lead-form-modal"
    @close="emit('close')"
  >
    <form class="space-y-5" @submit.prevent="save()">
      <section>
        <p class="lf-section">Persona</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block sm:col-span-2">
            <span class="lf-label">Nombre <span class="text-red-500">*</span></span>
            <input v-model="form.name" class="lf-input" data-testid="lead-form-name" required >
          </label>
          <label class="block">
            <span class="lf-label">Email</span>
            <input v-model="form.email" type="email" class="lf-input" data-testid="lead-form-email" >
          </label>
          <label class="block">
            <span class="lf-label">Teléfono</span>
            <input v-model="form.phone" class="lf-input" data-testid="lead-form-phone" >
          </label>
          <label class="block">
            <span class="lf-label">WhatsApp</span>
            <input v-model="form.whatsapp" class="lf-input" placeholder="Si es distinto del teléfono" data-testid="lead-form-whatsapp" >
          </label>
          <label class="block">
            <span class="lf-label">Idioma</span>
            <select v-model="form.language" class="lf-input" data-testid="lead-form-language">
              <option :value="null">—</option>
              <option v-for="l in LANGUAGE_OPTIONS" :key="l" :value="l">{{ LANGUAGE_LABELS[l] }}</option>
            </select>
          </label>
        </div>
      </section>

      <section>
        <p class="lf-section">Origen y captación</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="lf-label">Origen <span class="text-red-500">*</span></span>
            <select v-model="form.source" class="lf-input" data-testid="lead-form-source">
              <option v-for="s in LEAD_SOURCES" :key="s" :value="s">{{ LEAD_SOURCE_LABELS[s] }}</option>
            </select>
          </label>
          <label class="block">
            <span class="lf-label">Detalle del origen</span>
            <input v-model="form.sourceDetail" class="lf-input" placeholder="Idealista, feria de marzo…" data-testid="lead-form-source-detail" >
          </label>
          <label class="block">
            <span class="lf-label">Portal</span>
            <input v-model="form.portal" class="lf-input" data-testid="lead-form-portal" >
          </label>
          <label class="block">
            <span class="lf-label">Id externo (en el portal o sistema de origen)</span>
            <input v-model="form.externalId" class="lf-input" data-testid="lead-form-external-id" >
          </label>
          <label class="block">
            <span class="lf-label">Campaña</span>
            <input v-model="form.campaign" class="lf-input" >
          </label>
          <label class="block">
            <span class="lf-label">Página de entrada</span>
            <input v-model="form.landingPage" class="lf-input" placeholder="https://…" >
          </label>
          <label class="block">
            <span class="lf-label">Referrer</span>
            <input v-model="form.referrer" class="lf-input" >
          </label>
          <details class="sm:col-span-2">
            <summary class="cursor-pointer text-[12px] font-medium text-stone-500">Parámetros UTM</summary>
            <div class="mt-2 grid gap-3 sm:grid-cols-3">
              <label v-for="k in UTM_KEYS" :key="k" class="block">
                <span class="lf-label">{{ k }}</span>
                <input v-model="(form as any)[k]" class="lf-input" >
              </label>
            </div>
          </details>
          <label v-if="!lead" class="block sm:col-span-2">
            <span class="lf-label">Mensaje original</span>
            <textarea v-model="form.originalMessage" class="lf-input" rows="3" placeholder="Lo que pidió, tal cual. No se podrá reescribir después." data-testid="lead-form-original-message" />
          </label>
        </div>
      </section>

      <section>
        <p class="lf-section">Oportunidad</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="lf-label">Prioridad</span>
            <select v-model="form.priority" class="lf-input" data-testid="lead-form-priority">
              <option :value="null">—</option>
              <option v-for="p in LEAD_PRIORITIES" :key="p" :value="p">{{ LEAD_PRIORITY_LABELS[p] }}</option>
            </select>
          </label>
          <label class="block">
            <span class="lf-label">Presupuesto (€)</span>
            <input v-model="form.budget" type="number" min="0" step="1000" class="lf-input" data-testid="lead-form-budget" >
          </label>
          <label class="block">
            <span class="lf-label">Oficina</span>
            <select v-model="form.officeId" class="lf-input" data-testid="lead-form-office">
              <option :value="null">—</option>
              <option v-for="o in offices" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span class="lf-label">Equipo</span>
            <select v-model="form.teamId" class="lf-input" data-testid="lead-form-team">
              <option :value="null">—</option>
              <option v-for="o in teams" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </label>
          <label v-if="!lead" class="block">
            <span class="lf-label">Comercial</span>
            <select v-model="form.agentId" class="lf-input" data-testid="lead-form-agent">
              <option :value="null">Que lo decida el enrutado</option>
              <option v-for="o in commercials" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span class="lf-label">Propiedad de interés (id)</span>
            <div class="flex gap-2">
              <select v-model="form.propertyKind" class="lf-input !w-36">
                <option value="developer">Web / obra nueva</option>
                <option value="agent">2ª mano</option>
              </select>
              <input v-model="form.propertyId" type="number" min="1" class="lf-input" placeholder="Id de la propiedad" data-testid="lead-form-property-id" >
            </div>
          </label>
          <label class="block sm:col-span-2">
            <span class="lf-label">Notas internas</span>
            <textarea v-model="form.notes" class="lf-input" rows="2" />
          </label>
        </div>
      </section>

      <div v-if="duplicates.length" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900" data-testid="lead-form-duplicates">
        <p class="font-medium">{{ lead ? 'Ese dato ya es de otro lead de tu agencia:' : 'Puede que este lead ya exista:' }}</p>
        <ul class="mt-2 space-y-1.5">
          <li v-for="d in duplicates" :key="d.leadId" class="flex flex-wrap items-center gap-2" :data-testid="`lead-duplicate-${d.leadId}`">
            <NuxtLink :to="`/admin/leads/${d.leadId}`" class="font-medium underline" target="_blank">{{ d.name }}</NuxtLink>
            <span class="text-amber-800">{{ d.email || d.phone || '' }} · {{ LEAD_STAGE_LABELS[d.status === 'lost' ? 'lost' : d.stage] || d.stage }} · coincide por {{ d.matchedOn }}</span>
            <button v-if="!lead" type="button" class="rounded border border-amber-400 bg-white px-2 py-0.5 text-[12px] font-medium" :disabled="saving" :data-testid="`lead-duplicate-merge-${d.leadId}`" @click="save({ mergeIntoLeadId: d.leadId })">
              Unificar con este
            </button>
          </li>
        </ul>
        <p class="mt-2">{{ lead ? 'Si de verdad son oportunidades distintas, guarda igualmente.' : '«Unificar» completa ese lead con lo que falte y no crea otro. Si es otra oportunidad, créalo igualmente.' }}</p>
      </div>
      <p v-if="error" class="text-sm text-red-600" data-testid="lead-form-error">{{ error }}</p>
    </form>

    <template #footer>
      <button type="button" class="text-[13px] text-stone-500 hover:underline" @click="emit('close')">Cancelar</button>
      <button v-if="duplicates.length" type="button" class="rounded-lg border border-amber-400 px-3 py-2 text-[13px] font-medium text-amber-800" :disabled="saving" data-testid="lead-form-force" @click="save({ force: true })">
        {{ lead ? 'Guardar igualmente' : 'Crear igualmente' }}
      </button>
      <button type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="saving || !form.name.trim()" data-testid="lead-form-save" @click="save()">
        {{ saving ? 'Guardando…' : lead ? 'Guardar' : 'Crear lead' }}
      </button>
    </template>
  </AdminCommsModal>
</template>

<script setup lang="ts">
import { LEAD_PRIORITIES, LEAD_PRIORITY_LABELS, LEAD_SOURCES, LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS } from '~/utils/leadCatalog'
import { LANGUAGE_LABELS, LANGUAGE_OPTIONS } from '~/utils/crmCatalog'
import { loadRelationOptions, type RelationOption } from '~/composables/useRelationOptions'

/**
 * Alta manual y edición de un lead (FASES 12 y 14). Crea con
 * POST /api/admin/leads y edita con PUT /api/admin/leads/:id; un 409 trae
 * los posibles duplicados, y desde aquí se elige unificar (alta) o seguir
 * igualmente. El servidor (server/utils/leads/admin.ts) vuelve a validar
 * todo: catálogos, y que oficina, equipo, comercial y propiedad son de la
 * agencia.
 */
const props = defineProps<{ lead?: Record<string, any> | null }>()
const emit = defineEmits<{ close: []; saved: [id: number] }>()
const toast = useToast()

const UTM_KEYS = ['utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm'] as const
const l = props.lead || {}
const form = reactive({
  name: l.name || '',
  email: l.email || '',
  phone: l.phone || '',
  whatsapp: l.whatsapp || '',
  language: l.language || null,
  source: l.source || 'call',
  sourceDetail: l.sourceDetail || '',
  portal: l.portal || '',
  externalId: l.externalId || '',
  campaign: l.campaign || '',
  landingPage: l.landingPage || '',
  referrer: l.referrer || '',
  utmSource: l.utmSource || '',
  utmMedium: l.utmMedium || '',
  utmCampaign: l.utmCampaign || '',
  utmContent: l.utmContent || '',
  utmTerm: l.utmTerm || '',
  originalMessage: '',
  priority: l.priority || null,
  budget: l.budget ?? '',
  officeId: l.officeId ?? null,
  teamId: l.teamId ?? null,
  agentId: null as number | null,
  propertyId: l.propertyId ?? '',
  propertyKind: 'developer' as 'agent' | 'developer',
  notes: l.notes || '',
})

const offices = ref<RelationOption[]>([])
const teams = ref<RelationOption[]>([])
const commercials = ref<RelationOption[]>([])
onMounted(() => {
  loadRelationOptions('offices').then((r) => (offices.value = r))
  loadRelationOptions('teams').then((r) => (teams.value = r))
  loadRelationOptions('team').then((r) => (commercials.value = r))
})

const saving = ref(false)
const error = ref('')
const duplicates = ref<any[]>([])

function payload() {
  const body: Record<string, any> = { ...form, budget: form.budget === '' ? null : Number(form.budget), propertyId: form.propertyId === '' ? null : Number(form.propertyId) }
  if (props.lead) {
    delete body.originalMessage
    delete body.agentId
    // Sin cambio de propiedad, ni se toca ni se revalida.
    if (body.propertyId === (props.lead.propertyId ?? null)) {
      delete body.propertyId
      delete body.propertyKind
    }
  }
  return body
}

async function save(extra: Record<string, any> = {}) {
  saving.value = true
  error.value = ''
  try {
    const res = props.lead
      ? await $fetch<{ id: number }>(`/api/admin/leads/${props.lead.id}`, { method: 'PUT', body: { ...payload(), ...extra } })
      : await $fetch<{ id: number; merged?: boolean }>('/api/admin/leads', { method: 'POST', body: { ...payload(), ...extra } })
    toast.success(props.lead ? 'Lead guardado' : (res as any).merged ? 'Unificado con el lead existente' : 'Lead creado')
    emit('saved', res.id)
  } catch (e: any) {
    if (e?.statusCode === 409 || e?.status === 409) duplicates.value = e?.data?.data?.duplicates || []
    else error.value = e?.data?.statusMessage || e?.statusMessage || 'No se pudo guardar'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.lf-section {
  @apply mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400;
}
.lf-label {
  @apply mb-1 block text-[12px] font-medium text-stone-600;
}
.lf-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
</style>

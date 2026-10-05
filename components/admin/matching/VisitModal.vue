<template>
  <AdminCommsModal title="Crear visita" :sub="`${contact.name} · ${property.name}`" test-id="match-visit-modal" @close="emit('close')">
    <p v-if="!contact.email && !contact.phone && !contact.whatsapp" class="mb-3 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800">
      {{ contact.name }} no tiene email ni teléfono: añádelos en su ficha para poder agendarle una visita (la confirmación y los recordatorios salen por ahí).
    </p>
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="block sm:col-span-2">
        <span class="mb-1 block text-[12px] font-medium text-stone-600">Comercial</span>
        <select v-model="agentId" class="w-full rounded-lg border border-line px-3 py-2 text-sm" data-testid="match-visit-agent">
          <option :value="null">Elige quién hará la visita…</option>
          <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}{{ a.officeName ? ` · ${a.officeName}` : '' }}</option>
        </select>
      </label>
      <label class="block">
        <span class="mb-1 block text-[12px] font-medium text-stone-600">Fecha y hora</span>
        <input v-model="when" type="datetime-local" class="w-full rounded-lg border border-line px-3 py-2 text-sm" data-testid="match-visit-when">
      </label>
      <label class="block">
        <span class="mb-1 block text-[12px] font-medium text-stone-600">Canal</span>
        <select v-model="channel" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
          <option value="in_person">Presencial</option>
          <option value="video">Videollamada</option>
          <option value="phone">Teléfono</option>
        </select>
      </label>
    </div>
    <p class="mt-3 text-[11px] text-stone-400">
      Se crea como cualquier cita de Calendar: se comprueba que el comercial no tenga otra a esa hora, aparece en Visitas y en la ficha de {{ contact.name }}, y la compatibilidad pasa a «Seleccionado» si estaba sin decidir.
    </p>
    <p v-if="error" class="mt-3 text-[12px] font-medium text-red-600">{{ error }}</p>

    <template #footer>
      <button type="button" class="text-[13px] text-stone-500 hover:underline" @click="emit('close')">Cancelar</button>
      <button type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="saving || !agentId || !when" data-testid="match-visit-confirm" @click="save">
        {{ saving ? 'Agendando…' : 'Agendar visita' }}
      </button>
    </template>
  </AdminCommsModal>
</template>

<script setup lang="ts">
import AdminCommsModal from '~/components/admin/comms/Modal.vue'

/**
 * «Crear visita» desde el matching: POST /api/admin/saas/matching/matches con
 * `action: 'visit'`, que llama a `createAdminAppointment()` — la misma
 * validación que «+ Nueva cita» de Calendar. Nombre, email y teléfono del
 * cliente salen de su ficha en el servidor.
 */
const props = defineProps<{
  requirementId: number
  contact: { id: number; name: string; email?: string | null; phone?: string | null; whatsapp?: string | null }
  property: { id: number; kind: 'agent' | 'developer'; name: string }
  defaultAgentId?: number | null
}>()
const emit = defineEmits<{ close: []; saved: [result: { visit: any; matchStatus: string }] }>()
const toast = useToast()
const dt = useDash()

const agents = ref<any[]>([])
const agentId = ref<number | null>(props.defaultAgentId ?? null)
const when = ref('')
const channel = ref('in_person')
const saving = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    agents.value = (await $fetch<{ rows: any[] }>('/api/admin/saas/agents')).rows || []
  } catch {
    error.value = 'No se pudo cargar la lista de comerciales.'
  }
})

async function save() {
  if (!agentId.value || !when.value) return
  saving.value = true
  error.value = ''
  try {
    const res = await $fetch<{ visit: any; matchStatus: string }>('/api/admin/saas/matching/matches', {
      method: 'POST',
      body: {
        action: 'visit',
        buyerRequirementId: props.requirementId,
        propertyId: props.property.id,
        propertyKind: props.property.kind,
        agentId: agentId.value,
        scheduledAt: `${when.value.replace('T', ' ')}:00`,
        channel: channel.value,
      },
    })
    toast.success(`Visita agendada: ${dt.dateTime(res.visit.scheduledAt)}`)
    emit('saved', res)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'No se pudo agendar la visita'
  } finally {
    saving.value = false
  }
}
</script>

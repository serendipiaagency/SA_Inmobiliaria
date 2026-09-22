<template>
  <AdminCommsModal :title="callId ? 'Resultado de la llamada' : 'Registrar llamada'" :sub="`Con ${contactName}`" test-id="comms-call-log" @close="emit('close')">
    <div class="space-y-4">
      <div v-if="!callId">
        <span class="label">Dirección</span>
        <div class="flex gap-1 rounded-lg bg-stone-100 p-1">
          <button type="button" class="flex-1 rounded-md px-2 py-1.5 text-xs font-medium" :class="direction === 'outbound' ? 'bg-white text-ink shadow-sm' : 'text-stone-500'" @click="direction = 'outbound'">He llamado yo</button>
          <button type="button" class="flex-1 rounded-md px-2 py-1.5 text-xs font-medium" :class="direction === 'inbound' ? 'bg-white text-ink shadow-sm' : 'text-stone-500'" @click="direction = 'inbound'">Me han llamado</button>
        </div>
      </div>
      <div>
        <span class="label">Resultado</span>
        <div class="grid grid-cols-2 gap-1.5">
          <button v-for="o in OUTCOMES" :key="o.key" type="button" class="rounded-lg border px-2.5 py-2 text-left text-[12px] font-medium transition" :class="outcome === o.key ? 'border-ink bg-ink text-white' : 'border-line text-stone-600 hover:border-ink'" :data-testid="`call-outcome-${o.key}`" @click="outcome = o.key">
            {{ o.label }}
          </button>
        </div>
      </div>
      <label class="block">
        <span class="label">Duración (minutos)</span>
        <input v-model.number="minutes" type="number" min="0" step="1" class="input rounded-lg" placeholder="0">
      </label>
      <label class="block">
        <span class="label">Notas</span>
        <textarea v-model="notes" rows="3" class="input rounded-lg" placeholder="Qué se habló, qué pidió, qué queda pendiente…" data-testid="call-notes" />
      </label>
      <div class="rounded-lg border border-line p-3">
        <label class="flex items-center gap-2 text-[13px] font-medium">
          <input v-model="withFollowUp" type="checkbox" class="h-4 w-4 rounded border-line">
          Programar seguimiento en la agenda
        </label>
        <div v-if="withFollowUp" class="mt-3 space-y-3">
          <label class="block">
            <span class="label">Comercial</span>
            <select v-model.number="followUp.agentId" class="input rounded-lg">
              <option :value="0" disabled>Elige un comercial</option>
              <option v-for="a in team" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </label>
          <label class="block">
            <span class="label">Cuándo</span>
            <input v-model="followUp.when" type="datetime-local" class="input rounded-lg">
          </label>
          <label class="block">
            <span class="label">Tipo</span>
            <select v-model="followUp.channel" class="input rounded-lg">
              <option value="phone">Llamada</option>
              <option value="video">Videollamada</option>
              <option value="in_person">Visita presencial</option>
            </select>
          </label>
        </div>
      </div>
      <p v-if="error" class="text-[12px] text-red-600">{{ error }}</p>
    </div>
    <template #footer>
      <button type="button" class="btn-quiet !py-2" @click="emit('close')">Cancelar</button>
      <button type="button" class="btn-primary !px-5 !py-2" :disabled="saving || !outcome" data-testid="call-log-save" @click="save">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
    </template>
  </AdminCommsModal>
</template>

<script setup lang="ts">
/**
 * Anota una llamada: la que se acaba de hacer por WhatsApp (callId) o una
 * telefónica normal hecha a mano (contactId). Resultado, duración, notas
 * y, si procede, el seguimiento en la agenda del comercial.
 */
const props = withDefaults(defineProps<{ callId?: number | null; contactId?: number | null; conversationId?: number | null; contactName: string; team?: { id: number; name: string }[] }>(), {
  callId: null,
  contactId: null,
  conversationId: null,
  team: undefined,
})
const emit = defineEmits<{ close: []; saved: [call: any] }>()

const OUTCOMES = [
  { key: 'answered', label: 'Contestó' },
  { key: 'interested', label: 'Interesado' },
  { key: 'callback', label: 'Pide que le llamen' },
  { key: 'no_answer', label: 'No contesta' },
  { key: 'busy', label: 'Comunica' },
  { key: 'voicemail', label: 'Buzón de voz' },
  { key: 'wrong_number', label: 'Número equivocado' },
  { key: 'not_interested', label: 'No interesado' },
]

const direction = ref<'outbound' | 'inbound'>('outbound')
const outcome = ref<string>('')
const minutes = ref<number | null>(null)
const notes = ref('')
const withFollowUp = ref(false)
const followUp = reactive({ agentId: 0, when: '', channel: 'phone' })
const saving = ref(false)
const error = ref('')

const team = ref<{ id: number; name: string }[]>(props.team || [])
onMounted(async () => {
  if (!team.value.length) {
    const r = await $fetch<{ rows: { id: number; name: string }[] }>('/api/admin/saas/agents').catch(() => null)
    team.value = r?.rows || []
  }
})

function scheduledAt(): string {
  // datetime-local es hora local; la agenda guarda 'YYYY-MM-DD HH:MM:SS'.
  return followUp.when ? `${followUp.when.replace('T', ' ')}:00`.slice(0, 19) : ''
}

async function save() {
  error.value = ''
  saving.value = true
  try {
    const fu = withFollowUp.value ? { agentId: followUp.agentId, scheduledAt: scheduledAt(), channel: followUp.channel } : null
    if (fu && (!fu.agentId || !fu.scheduledAt)) throw new Error('Elige comercial y fecha para el seguimiento.')
    let call: any
    if (props.callId) {
      const r = await $fetch<{ call: any }>(`/api/admin/comms/calls/${props.callId}`, {
        method: 'PATCH',
        body: { outcome: outcome.value, notes: notes.value || null, ...(fu ? { followUp: fu } : {}) },
      })
      call = r.call
    } else {
      const r = await $fetch<{ call: any }>('/api/admin/comms/calls/log', {
        method: 'POST',
        body: { contactId: props.contactId || undefined, conversationId: props.conversationId || undefined, direction: direction.value, outcome: outcome.value, notes: notes.value || null, durationSeconds: minutes.value ? Math.round(minutes.value * 60) : null },
      })
      call = r.call
      if (fu) await $fetch(`/api/admin/comms/calls/${call.id}`, { method: 'PATCH', body: { followUp: fu } })
    }
    emit('saved', call)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || e?.message || 'No se pudo guardar'
  } finally {
    saving.value = false
  }
}
</script>

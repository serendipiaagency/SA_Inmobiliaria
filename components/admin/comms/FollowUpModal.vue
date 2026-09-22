<template>
  <AdminCommsModal title="Programar seguimiento" :sub="`Con ${contactName} · queda en la agenda del comercial`" test-id="comms-follow-up" @close="emit('close')">
    <div class="space-y-3">
      <label class="block">
        <span class="label">Comercial</span>
        <select v-model.number="form.agentId" class="input rounded-lg" data-testid="follow-up-agent">
          <option :value="0" disabled>Elige un comercial</option>
          <option v-for="a in team" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
      <label class="block">
        <span class="label">Cuándo</span>
        <input v-model="form.when" type="datetime-local" class="input rounded-lg" data-testid="follow-up-when">
      </label>
      <label class="block">
        <span class="label">Tipo</span>
        <select v-model="form.channel" class="input rounded-lg">
          <option value="phone">Llamada</option>
          <option value="video">Videollamada</option>
          <option value="in_person">Visita presencial</option>
        </select>
      </label>
      <label class="block">
        <span class="label">Notas</span>
        <textarea v-model="form.notes" rows="2" class="input rounded-lg" placeholder="Opcional" />
      </label>
      <p v-if="error" class="text-[12px] text-red-600">{{ error }}</p>
    </div>
    <template #footer>
      <button type="button" class="btn-quiet !py-2" @click="emit('close')">Cancelar</button>
      <button type="button" class="btn-primary !px-5 !py-2" :disabled="saving" data-testid="follow-up-save" @click="save">{{ saving ? 'Guardando…' : 'Programar' }}</button>
    </template>
  </AdminCommsModal>
</template>

<script setup lang="ts">
const props = defineProps<{ conversationId: number; contactName: string; team: { id: number; name: string }[]; propertyId?: number | null }>()
const emit = defineEmits<{ close: []; saved: [visit: any] }>()
const form = reactive({ agentId: props.team[0]?.id || 0, when: '', channel: 'phone', notes: '' })
const saving = ref(false)
const error = ref('')

async function save() {
  error.value = ''
  if (!form.agentId || !form.when) {
    error.value = 'Elige comercial y fecha.'
    return
  }
  saving.value = true
  try {
    const r = await $fetch<{ visit: any }>(`/api/admin/comms/conversations/${props.conversationId}/follow-up`, {
      method: 'POST',
      body: { agentId: form.agentId, scheduledAt: `${form.when.replace('T', ' ')}:00`.slice(0, 19), channel: form.channel, propertyId: props.propertyId || undefined, notes: form.notes || undefined },
    })
    emit('saved', r.visit)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'No se pudo programar'
  } finally {
    saving.value = false
  }
}
</script>

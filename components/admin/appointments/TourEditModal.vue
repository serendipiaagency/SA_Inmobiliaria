<template>
  <CommsModal title="Editar tour" :sub="`${tour.stops.length} paradas`" wide test-id="tour-edit" @close="emit('close')">
    <div class="space-y-5">
      <section class="grid gap-3 sm:grid-cols-2">
        <div>
          <span class="te-label">Contacto (cliente)</span>
          <EntityPicker v-model="contact" kind="contact" placeholder="Buscar contacto…" test-id="tour-edit-contact" />
        </div>
        <div>
          <span class="te-label">Lead</span>
          <EntityPicker v-model="lead" kind="lead" placeholder="Buscar lead…" test-id="tour-edit-lead" />
        </div>
        <label class="block sm:col-span-2"><span class="te-label">Nombre del cliente</span><input v-model="form.clientName" class="te-input" data-testid="tour-edit-client-name"></label>
        <label class="block"><span class="te-label">Email</span><input v-model="form.clientEmail" type="email" class="te-input"></label>
        <label class="block"><span class="te-label">Teléfono</span><input v-model="form.clientPhone" type="tel" class="te-input"></label>
        <label class="block sm:col-span-2"><span class="te-label">Notas del tour</span><textarea v-model="form.notes" rows="2" class="te-input" data-testid="tour-edit-notes" /></label>
      </section>

      <section>
        <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Ruta</p>
        <ol class="space-y-1.5">
          <li v-for="(s, i) in order" :key="s.id" class="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm" :data-testid="`tour-edit-stop-${i}`">
            <span class="min-w-0 truncate">
              <span class="font-medium">{{ i + 1 }}. {{ s.propertyName || 'Sin inmueble' }}</span>
              <span class="text-xs text-stone-400"> · {{ s.scheduledAt.slice(11, 16) }}–{{ (s.endsAt || s.scheduledAt).slice(11, 16) }} · {{ s.agentName }}<span v-if="s.status !== 'scheduled'"> · {{ appointmentStatusLabel(s.status) }}</span></span>
            </span>
            <span class="flex shrink-0 gap-1">
              <button type="button" class="btn-quiet !px-2 !py-0.5 text-xs" :disabled="i === 0" title="Subir" @click="move(i, -1)">↑</button>
              <button type="button" class="btn-quiet !px-2 !py-0.5 text-xs" :disabled="i === order.length - 1" title="Bajar" @click="move(i, 1)">↓</button>
            </span>
          </li>
        </ol>
        <div class="mt-3 grid gap-2 rounded-lg border border-line bg-stone-50/60 p-2.5 sm:grid-cols-3">
          <label class="flex items-center gap-2 text-sm text-stone-600 sm:col-span-3"><input v-model="recalc" type="checkbox" :disabled="started" data-testid="tour-edit-recalculate">Recalcular las horas en este orden (cada parada conserva su duración)</label>
          <template v-if="recalc">
            <label class="block"><span class="te-label">Empieza</span><input v-model="startAt" type="datetime-local" class="te-input !py-1.5 text-xs"></label>
            <label class="block"><span class="te-label">Desplazamiento</span><select v-model.number="gap" class="te-input !py-1.5 text-xs"><option v-for="m in [0, 5, 10, 15, 20, 30, 45, 60]" :key="m" :value="m">{{ m }} min</option></select></label>
          </template>
          <p class="text-[11px] text-stone-400 sm:col-span-3">{{ started ? 'El tour ya ha empezado: el orden se puede cambiar, pero las horas se mueven parada a parada.' : 'Mover las horas comprueba la agenda de cada comercial y avisa al cliente de cada parada que cambia.' }}</p>
        </div>
      </section>
      <p v-if="error" class="text-sm font-medium text-red-600" data-testid="tour-edit-error">{{ error }}</p>
    </div>
    <template #footer>
      <button type="button" class="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-stone-600 hover:border-stone-400" @click="emit('close')">Cancelar</button>
      <button type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="saving" data-testid="tour-edit-save" @click="save">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
    </template>
  </CommsModal>
</template>

<script setup lang="ts">
import CommsModal from '~/components/admin/comms/Modal.vue'
import EntityPicker from '~/components/admin/appointments/EntityPicker.vue'
import { appointmentStatusLabel, type PickedEntity } from '~/utils/appointmentCatalog'

/**
 * Editar un tour (FASE 18): cliente, lead, contacto y notas
 * (POST /api/admin/saas/tours, `action: 'update'`) y el orden de la ruta,
 * recalculando las horas si se pide (`action: 'reorder'`). El servidor
 * vuelve a comprobar la agenda de cada comercial.
 */
const props = defineProps<{ tour: Record<string, any> }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const t = props.tour

const form = reactive({ clientName: t.clientName || '', clientEmail: t.clientEmail || '', clientPhone: t.clientPhone || '', notes: t.notes || '' })
const contact = ref<PickedEntity | null>(t.contactId ? { id: t.contactId, label: t.contactName || `Contacto #${t.contactId}` } : null)
const lead = ref<PickedEntity | null>(t.leadId ? { id: t.leadId, label: t.leadName || `Lead #${t.leadId}` } : null)
const order = ref<any[]>([...t.stops])
const recalc = ref(false)
const gap = ref(15)
const active = computed(() => t.stops.filter((s: any) => s.status !== 'cancelled'))
const started = computed(() => active.value.some((s: any) => s.status !== 'scheduled'))
const startAt = ref(([...active.value].map((s: any) => s.scheduledAt).sort()[0] || '').slice(0, 16).replace(' ', 'T'))

function move(i: number, delta: number) {
  const [item] = order.value.splice(i, 1)
  order.value.splice(i + delta, 0, item)
}

const saving = ref(false)
const error = ref('')
async function save() {
  error.value = ''
  saving.value = true
  try {
    const header: Record<string, any> = { action: 'update', tourId: t.id }
    if (form.clientName.trim() !== (t.clientName || '')) header.clientName = form.clientName.trim()
    if (form.clientEmail.trim() !== (t.clientEmail || '')) header.clientEmail = form.clientEmail.trim() || null
    if (form.clientPhone.trim() !== (t.clientPhone || '')) header.clientPhone = form.clientPhone.trim() || null
    if (form.notes.trim() !== (t.notes || '')) header.notes = form.notes.trim() || null
    if ((contact.value?.id ?? null) !== (t.contactId ?? null)) header.contactId = contact.value?.id ?? null
    if ((lead.value?.id ?? null) !== (t.leadId ?? null)) header.leadId = lead.value?.id ?? null
    if (Object.keys(header).length > 2) await $fetch('/api/admin/saas/tours', { method: 'POST', body: header })

    const reordered = order.value.some((s, i) => s.id !== t.stops[i]?.id)
    if (reordered || recalc.value) {
      await $fetch('/api/admin/saas/tours', {
        method: 'POST',
        body: { action: 'reorder', tourId: t.id, stopIds: order.value.map((s) => s.id), recalculate: recalc.value, gapMinutes: gap.value, startAt: recalc.value && startAt.value ? `${startAt.value.replace('T', ' ')}:00` : null },
      })
    }
    emit('saved')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo guardar el tour'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.te-label {
  @apply mb-1 block text-[12px] font-medium text-stone-600;
}
.te-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
</style>

<template>
  <CommsModal title="Nuevo tour" sub="Varias visitas del mismo cliente en una salida. Cada parada es una cita real con su hora, su duración y su inmueble (obra nueva o 2ª mano)." wide test-id="tour-form" @close="emit('close')">
    <form class="space-y-5" @submit.prevent="save">
      <section class="grid gap-3 sm:grid-cols-2">
        <div>
          <span class="tf-label">Contacto (cliente)</span>
          <EntityPicker v-model="contact" kind="contact" placeholder="Buscar contacto…" test-id="tour-form-contact" />
        </div>
        <div>
          <span class="tf-label">Lead</span>
          <EntityPicker v-model="lead" kind="lead" placeholder="Buscar lead…" test-id="tour-form-lead" />
        </div>
        <label class="block sm:col-span-2">
          <span class="tf-label">Nombre del cliente <span v-if="!contact && !lead" class="text-red-500">*</span></span>
          <input v-model="form.clientName" class="tf-input" :placeholder="contact || lead ? 'Vacío = el del contacto o el lead' : ''" data-testid="tour-form-client-name">
        </label>
        <label class="block"><span class="tf-label">Email</span><input v-model="form.clientEmail" type="email" class="tf-input" data-testid="tour-form-client-email"></label>
        <label class="block"><span class="tf-label">Teléfono</span><input v-model="form.clientPhone" type="tel" class="tf-input" data-testid="tour-form-client-phone"></label>
        <label class="block sm:col-span-2"><span class="tf-label">Notas del tour</span><textarea v-model="form.notes" rows="2" class="tf-input" placeholder="Qué busca, a quién acompaña…" data-testid="tour-form-notes" /></label>
      </section>

      <section>
        <div class="mb-2 flex flex-wrap items-end justify-between gap-2">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Paradas, en orden de ruta</p>
          <div class="flex items-end gap-2 text-xs">
            <label class="block"><span class="tf-label !text-[11px]">Desplazamiento entre paradas</span><select v-model.number="gap" class="tf-input !py-1 text-xs"><option v-for="m in [0, 5, 10, 15, 20, 30, 45, 60]" :key="m" :value="m">{{ m }} min</option></select></label>
            <button type="button" class="btn-quiet !px-2.5 !py-1.5 text-xs" :disabled="!stops[0]?.scheduledAt" data-testid="tour-form-recalculate" @click="recalculate">Recalcular horas</button>
          </div>
        </div>
        <div class="space-y-2.5">
          <div v-for="(s, i) in stops" :key="s.key" class="rounded-lg border border-line p-2.5" :data-testid="`tour-form-stop-${i}`">
            <div class="mb-2 flex items-center justify-between gap-2">
              <span class="text-xs font-semibold text-stone-500">Parada {{ i + 1 }}<span v-if="endOf(s)" class="font-normal text-stone-400"> · de {{ s.scheduledAt.slice(11, 16) }} a {{ endOf(s) }}</span></span>
              <span class="flex gap-1">
                <button type="button" class="btn-quiet !px-2 !py-0.5 text-xs" :disabled="i === 0" title="Subir" @click="move(i, -1)">↑</button>
                <button type="button" class="btn-quiet !px-2 !py-0.5 text-xs" :disabled="i === stops.length - 1" title="Bajar" @click="move(i, 1)">↓</button>
                <button type="button" class="btn-quiet !px-2 !py-0.5 text-xs text-red-600" :disabled="stops.length <= 1" @click="stops.splice(i, 1)">Quitar</button>
              </span>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <EntityPicker v-model="s.property" kind="property" compact placeholder="Inmueble (obra nueva o 2ª mano)…" :test-id="`tour-form-stop-${i}-property`" />
              <select v-model="s.agentId" class="tf-input !py-1.5 text-xs" :data-testid="`tour-form-stop-${i}-agent`">
                <option :value="null">Comercial…</option>
                <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <input v-model="s.scheduledAt" type="datetime-local" class="tf-input !py-1.5 text-xs" :data-testid="`tour-form-stop-${i}-start`">
              <select v-model.number="s.durationMinutes" class="tf-input !py-1.5 text-xs" :data-testid="`tour-form-stop-${i}-duration`">
                <option v-for="m in DURATIONS" :key="m" :value="m">{{ m }} min</option>
              </select>
              <input v-model="s.meetingPoint" class="tf-input !py-1.5 text-xs sm:col-span-2" placeholder="Punto de encuentro (opcional)">
            </div>
          </div>
        </div>
        <button type="button" class="btn-quiet mt-2.5 !px-3 !py-1.5 text-xs" data-testid="tour-form-add-stop" @click="addStop">+ Añadir parada</button>
        <p class="mt-2 text-[11px] text-stone-400">«Recalcular horas» encadena las paradas en este orden: cada una empieza al acabar la anterior más el desplazamiento. No estima trayectos: el desplazamiento lo decides tú.</p>
      </section>
      <p v-if="error" class="text-sm font-medium text-red-600" data-testid="tour-form-error">{{ error }}</p>
    </form>
    <template #footer>
      <button type="button" class="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-stone-600 hover:border-stone-400" @click="emit('close')">Cancelar</button>
      <button type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="saving" data-testid="tour-form-save" @click="save">{{ saving ? 'Creando…' : 'Crear tour' }}</button>
    </template>
  </CommsModal>
</template>

<script setup lang="ts">
import CommsModal from '~/components/admin/comms/Modal.vue'
import EntityPicker from '~/components/admin/appointments/EntityPicker.vue'
import type { PickedEntity } from '~/utils/appointmentCatalog'
import { planSequentialSchedule, shiftWallTime } from '~/utils/tourPlanning'

/**
 * Alta de un tour (FASE 18) — POST /api/admin/saas/tours. Cada parada con su
 * hora y su duración, su inmueble de cualquiera de los dos catálogos y su
 * comercial; el orden se cambia con ↑/↓ y «Recalcular horas» encadena la
 * ruta (utils/tourPlanning.ts, el mismo cálculo que usa el servidor).
 */
const props = defineProps<{ agents: Array<{ id: number; name: string; slotDurationMinutes?: number }>; defaultAgentId?: number | null }>()
const emit = defineEmits<{ close: []; saved: [id: number] }>()
const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120]

interface StopForm {
  key: number
  property: PickedEntity | null
  agentId: number | null
  scheduledAt: string
  durationMinutes: number
  meetingPoint: string
}
let keySeq = 0
const slotOf = (agentId: number | null) => props.agents.find((a) => a.id === agentId)?.slotDurationMinutes || 60
const newStop = (agentId: number | null, scheduledAt = ''): StopForm => ({ key: ++keySeq, property: null, agentId, scheduledAt, durationMinutes: DURATIONS.includes(slotOf(agentId)) ? slotOf(agentId) : 60, meetingPoint: '' })

const form = reactive({ clientName: '', clientEmail: '', clientPhone: '', notes: '' })
const contact = ref<PickedEntity | null>(null)
const lead = ref<PickedEntity | null>(null)
const stops = ref<StopForm[]>([newStop(props.defaultAgentId ?? null)])
const gap = ref(15)

const toWall = (local: string) => `${local.replace('T', ' ')}:00`
const toLocal = (wall: string) => wall.slice(0, 16).replace(' ', 'T')
function endOf(s: StopForm) {
  return s.scheduledAt ? shiftWallTime(toWall(s.scheduledAt), s.durationMinutes).slice(11, 16) : ''
}
function move(i: number, delta: number) {
  const list = stops.value
  const [item] = list.splice(i, 1)
  list.splice(i + delta, 0, item)
}
function addStop() {
  const last = stops.value[stops.value.length - 1]
  const next = newStop(last?.agentId ?? props.defaultAgentId ?? null)
  if (last?.scheduledAt) next.scheduledAt = toLocal(shiftWallTime(toWall(last.scheduledAt), last.durationMinutes + gap.value))
  stops.value.push(next)
}
function recalculate() {
  const first = stops.value[0]
  if (!first?.scheduledAt) return
  const plan = planSequentialSchedule(stops.value.map((s) => ({ durationMinutes: s.durationMinutes })), { startAt: toWall(first.scheduledAt), gapMinutes: gap.value })
  stops.value.forEach((s, i) => (s.scheduledAt = toLocal(plan[i].scheduledAt)))
}

const saving = ref(false)
const error = ref('')
async function save() {
  error.value = ''
  if (!form.clientName.trim() && !contact.value && !lead.value) return (error.value = 'Indica el cliente: un nombre, un contacto o un lead')
  if (stops.value.some((s) => !s.agentId || !s.scheduledAt)) return (error.value = 'Cada parada necesita comercial y fecha/hora')
  saving.value = true
  try {
    const res = await $fetch<{ id: number }>('/api/admin/saas/tours', {
      method: 'POST',
      body: {
        clientName: form.clientName.trim() || null,
        clientEmail: form.clientEmail.trim() || null,
        clientPhone: form.clientPhone.trim() || null,
        contactId: contact.value?.id ?? null,
        leadId: lead.value?.id ?? null,
        notes: form.notes.trim() || null,
        stops: stops.value.map((s) => ({
          propertyId: s.property?.id ?? null,
          propertyKind: s.property?.kind ?? null,
          agentId: s.agentId,
          scheduledAt: toWall(s.scheduledAt),
          durationMinutes: s.durationMinutes,
          meetingPoint: s.meetingPoint.trim() || null,
        })),
      },
    })
    emit('saved', res.id)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo crear el tour'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.tf-label {
  @apply mb-1 block text-[12px] font-medium text-stone-600;
}
.tf-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
</style>

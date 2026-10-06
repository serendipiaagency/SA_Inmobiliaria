<template>
  <CommsModal title="Añadir parada" :sub="`${tour.clientName} · ${activeStops.length} ${activeStops.length === 1 ? 'parada activa' : 'paradas activas'}`" test-id="tour-add-stop" @close="emit('close')">
    <div class="space-y-3">
      <div>
        <span class="ta-label">Inmueble (obra nueva o 2ª mano)</span>
        <EntityPicker v-model="property" kind="property" placeholder="Buscar inmueble…" test-id="tour-add-stop-property" />
      </div>
      <label class="block">
        <span class="ta-label">Comercial</span>
        <select v-model="agentId" class="ta-input" data-testid="tour-add-stop-agent">
          <option :value="null">Comercial…</option>
          <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>

      <fieldset class="rounded-lg border border-line p-2.5">
        <legend class="px-1 text-[12px] font-medium text-stone-600">Cuándo</legend>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="mode" type="radio" value="end" :disabled="!activeStops.length" data-testid="tour-add-stop-mode-end">
          Al final de la ruta, con un desplazamiento de
          <select v-model.number="gap" class="ta-input !w-auto !py-1 text-xs" :disabled="mode !== 'end'" data-testid="tour-add-stop-gap">
            <option v-for="m in GAPS" :key="m" :value="m">{{ m }} min</option>
          </select>
        </label>
        <p v-if="mode === 'end' && endPreview" class="ml-6 mt-1 text-[11px] text-stone-500" data-testid="tour-add-stop-preview">Empezará a las {{ endPreview.slice(11, 16) }} del {{ endPreview.slice(0, 10) }}, al acabar la última parada activa.</p>
        <label class="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <input v-model="mode" type="radio" value="at" data-testid="tour-add-stop-mode-at">
          A una hora concreta
          <input v-model="startAt" type="datetime-local" class="ta-input !w-auto !py-1 text-xs" :disabled="mode !== 'at'" data-testid="tour-add-stop-start">
        </label>
      </fieldset>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="ta-label">Duración</span>
          <select v-model.number="durationMinutes" class="ta-input" data-testid="tour-add-stop-duration">
            <option v-for="m in DURATIONS" :key="m" :value="m">{{ m }} min</option>
          </select>
        </label>
        <label class="block">
          <span class="ta-label">Punto de encuentro (opcional)</span>
          <input v-model="meetingPoint" class="ta-input" maxlength="300" data-testid="tour-add-stop-meeting-point">
        </label>
      </div>
      <p class="text-[11px] text-stone-400">
        La parada nueva es una cita real del mismo cliente, lead y contacto que el resto del tour, y va al final de la ruta (luego puedes reordenarla). Se comprueba la agenda del comercial y se avisa al cliente.
      </p>
      <p v-if="error" class="text-sm font-medium text-red-600" data-testid="tour-add-stop-error">{{ error }}</p>
    </div>
    <template #footer>
      <button type="button" class="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-stone-600 hover:border-stone-400" @click="emit('close')">Cancelar</button>
      <button type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="saving" data-testid="tour-add-stop-save" @click="save">{{ saving ? 'Añadiendo…' : 'Añadir parada' }}</button>
    </template>
  </CommsModal>
</template>

<script setup lang="ts">
import CommsModal from '~/components/admin/comms/Modal.vue'
import EntityPicker from '~/components/admin/appointments/EntityPicker.vue'
import type { PickedEntity } from '~/utils/appointmentCatalog'
import { DEFAULT_TOUR_GAP_MINUTES, shiftWallTime } from '~/utils/tourPlanning'

/**
 * Añadir una parada a un tour ya creado (FASE 18) — POST
 * /api/admin/saas/tours con `action: 'add_stop'`. El inmueble se elige con
 * el mismo buscador que el alta (los dos catálogos); la hora es una concreta
 * o «al final» (el servidor la calcula: fin de la última parada activa más el
 * desplazamiento). El servidor vuelve a validar todo: inmueble de la
 * agencia y fuera de la papelera, solapes con el tour y con la agenda.
 */
const props = defineProps<{ tour: Record<string, any>; agents: Array<{ id: number; name: string; slotDurationMinutes?: number }> }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120]
const GAPS = [0, 5, 10, 15, 20, 30, 45, 60]

const activeStops = computed<any[]>(() => (props.tour.stops || []).filter((s: any) => s.status !== 'cancelled'))
const lastActive = computed(() => [...activeStops.value].sort((a, b) => String(a.endsAt || a.scheduledAt).localeCompare(String(b.endsAt || b.scheduledAt))).pop() || null)

const property = ref<PickedEntity | null>(null)
const agentId = ref<number | null>(lastActive.value?.agentId ?? props.agents[0]?.id ?? null)
const mode = ref<'end' | 'at'>(activeStops.value.length ? 'end' : 'at')
const gap = ref(DEFAULT_TOUR_GAP_MINUTES)
const slotOf = (id: number | null) => props.agents.find((a) => a.id === id)?.slotDurationMinutes || 60
const durationMinutes = ref(DURATIONS.includes(slotOf(agentId.value)) ? slotOf(agentId.value) : 60)
const meetingPoint = ref('')
const endPreview = computed(() => (lastActive.value ? shiftWallTime(lastActive.value.endsAt || lastActive.value.scheduledAt, gap.value) : ''))
const startAt = ref((endPreview.value || '').slice(0, 16).replace(' ', 'T'))

const saving = ref(false)
const error = ref('')
async function save() {
  error.value = ''
  if (!agentId.value) return (error.value = 'Elige el comercial de la parada')
  if (mode.value === 'at' && !startAt.value) return (error.value = 'Indica la fecha y la hora de la parada')
  saving.value = true
  try {
    await $fetch('/api/admin/saas/tours', {
      method: 'POST',
      body: {
        action: 'add_stop',
        tourId: props.tour.id,
        gapMinutes: mode.value === 'end' ? gap.value : null,
        stop: {
          propertyId: property.value?.id ?? null,
          propertyKind: property.value?.kind ?? null,
          agentId: agentId.value,
          scheduledAt: mode.value === 'at' ? `${startAt.value.replace('T', ' ')}:00` : null,
          durationMinutes: durationMinutes.value,
          meetingPoint: meetingPoint.value.trim() || null,
        },
      },
    })
    emit('saved')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo añadir la parada'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.ta-label {
  @apply mb-1 block text-[12px] font-medium text-stone-600;
}
.ta-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
</style>

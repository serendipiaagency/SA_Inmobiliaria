<template>
  <div class="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-16">
    <div v-if="pending" class="text-center text-stone-400">Cargando…</div>

    <div v-else-if="!visit" class="card p-8 text-center">
      <p class="font-serif text-2xl">Cita no encontrada</p>
      <p class="mt-2 text-sm text-stone-500">El enlace no es válido o ha caducado.</p>
    </div>

    <div v-else class="card space-y-5 p-8">
      <div>
        <p class="eyebrow">{{ statusLabel }}</p>
        <h1 class="mt-1 font-serif text-2xl">{{ visit.clientName }}</h1>
        <p class="mt-2 text-sm text-stone-500">
          {{ visit.agentName }}<span v-if="visit.propertyName"> — {{ visit.propertyName }}</span>
        </p>
        <p class="mt-1 text-sm font-medium">{{ visit.scheduledAt }}</p>
        <a v-if="visit.videoLink && visit.status === 'scheduled'" :href="visit.videoLink" target="_blank" rel="noopener" class="mt-2 inline-block text-sm text-blue-600 underline">
          Unirse a la videollamada
        </a>
      </div>

      <template v-if="visit.status === 'scheduled' && !rescheduling">
        <div class="flex gap-2.5">
          <button class="btn-secondary flex-1" :disabled="acting" @click="rescheduling = true">Reprogramar</button>
          <button class="btn-secondary flex-1 text-red-600" :disabled="acting" @click="cancelAppointment">Cancelar cita</button>
        </div>
        <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
      </template>

      <template v-else-if="rescheduling">
        <button class="text-xs font-medium text-stone-400 hover:text-ink" @click="rescheduling = false">← Volver</button>
        <div v-if="loadingDays" class="py-6 text-center text-sm text-stone-400">Cargando disponibilidad…</div>
        <template v-else>
          <div class="flex gap-1.5 overflow-x-auto pb-1">
            <button
              v-for="d in days"
              :key="d.date"
              class="flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-xs transition"
              :class="[selectedDate === d.date ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:border-stone-300', !d.slots.length ? 'opacity-40' : '']"
              :disabled="!d.slots.length"
              @click="selectedDate = d.date"
            >
              <span class="font-semibold">{{ weekdayLabel(d.date) }}</span>
              <span>{{ dayLabel(d.date) }}</span>
            </button>
          </div>
          <div v-if="selectedDaySlots.length" class="grid grid-cols-3 gap-2 sm:grid-cols-4">
            <button v-for="s in selectedDaySlots" :key="s.start" class="rounded-lg border border-line px-2 py-2 text-[13px] font-medium transition hover:border-ink" :disabled="acting" @click="confirmReschedule(s.start)">
              {{ s.start.slice(11, 16) }}
            </button>
          </div>
          <p v-else class="py-6 text-center text-sm text-stone-400">Sin huecos disponibles ese día.</p>
        </template>
        <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Gestionar cita' })

const route = useRoute()
const token = String(route.params.token)

const { data, pending, refresh } = await useFetch<any>(`/api/public/appointments/${token}`)
const visit = computed(() => data.value?.visit || null)

const statusLabel = computed(() => {
  const map: Record<string, string> = { scheduled: 'Cita confirmada', completed: 'Cita completada', cancelled: 'Cita cancelada', no_show: 'No asististe' }
  return map[visit.value?.status] || visit.value?.status
})

const acting = ref(false)
const error = ref('')

async function cancelAppointment() {
  if (!confirm('¿Seguro que quieres cancelar esta cita?')) return
  acting.value = true
  error.value = ''
  try {
    await $fetch(`/api/public/appointments/${token}/cancel`, { method: 'POST' })
    await refresh()
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo cancelar la cita'
  } finally {
    acting.value = false
  }
}

const rescheduling = ref(false)
const loadingDays = ref(false)
const days = ref<{ date: string; slots: { start: string; end: string }[] }[]>([])
const selectedDate = ref('')
const selectedDaySlots = computed(() => days.value.find((d) => d.date === selectedDate.value)?.slots || [])

function weekdayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' })
}
function dayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

watch(rescheduling, async (v) => {
  if (!v || !visit.value?.agentSlug) return
  loadingDays.value = true
  try {
    const res = await $fetch<any>(`/api/public/agents/${visit.value.agentSlug}/availability`, { query: { days: 14 } })
    days.value = res.days
    selectedDate.value = res.days.find((d: any) => d.slots.length)?.date || res.days[0]?.date || ''
  } finally {
    loadingDays.value = false
  }
})

async function confirmReschedule(startAt: string) {
  acting.value = true
  error.value = ''
  try {
    await $fetch(`/api/public/appointments/${token}/reschedule`, { method: 'POST', body: { startAt } })
    rescheduling.value = false
    await refresh()
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo reprogramar'
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <div v-if="agent">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <NuxtLink to="/admin/team" class="text-xs font-medium text-stone-400 hover:text-ink">← Equipo</NuxtLink>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">{{ agent.name }}</h1>
        <p class="mt-1 text-sm text-stone-500">Horario de disponibilidad para la agenda de citas pública</p>
      </div>
      <button class="dash-btn-primary" :disabled="saving" @click="save">{{ saving ? 'Guardando…' : 'Guardar horario' }}</button>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
      <AdminPanel title="Horario semanal" sub="Un único rango por día. Fuera de este horario no se ofrecerán citas." class="lg:col-span-2">
        <div class="space-y-2">
          <div v-for="d in days" :key="d.dayOfWeek" class="flex items-center gap-3 rounded-lg border border-line/60 px-3 py-2">
            <button
              class="relative h-5 w-9 shrink-0 rounded-full transition"
              :class="d.active ? 'bg-ink' : 'bg-stone-300'"
              role="switch"
              :aria-checked="d.active"
              @click="d.active = !d.active"
            >
              <span class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition" :class="d.active ? 'left-4' : 'left-0.5'" />
            </button>
            <span class="w-24 shrink-0 text-sm font-medium">{{ d.label }}</span>
            <template v-if="d.active">
              <input v-model="d.startTime" type="time" class="input !w-32" />
              <span class="text-stone-400">a</span>
              <input v-model="d.endTime" type="time" class="input !w-32" />
            </template>
            <span v-else class="text-sm text-stone-400">Sin horario</span>
          </div>
        </div>
      </AdminPanel>

      <div class="space-y-6">
        <AdminPanel title="Duración de cita">
          <label class="label">Minutos por cita</label>
          <input v-model.number="slotDurationMinutes" type="number" min="5" max="480" step="5" class="input" />
          <p class="mt-2 text-xs text-stone-500">Cada hueco de la agenda pública durará exactamente esto — se usa tanto para calcular los huecos disponibles como para reservar.</p>
        </AdminPanel>

        <AdminPanel title="Margen entre citas" sub="Minutos de descanso/desplazamiento antes y después de cada cita">
          <label class="label">Buffer (min)</label>
          <input v-model.number="bufferMinutes" type="number" min="0" max="240" step="5" class="input" />
        </AdminPanel>

        <AdminPanel title="Tope diario" sub="Máximo de citas al día, aunque queden huecos libres en el horario">
          <div class="flex items-center gap-2">
            <input v-model="maxPerDayEnabled" type="checkbox" class="h-4 w-4" />
            <input v-model.number="maxAppointmentsPerDay" type="number" min="1" max="100" class="input !w-24" :disabled="!maxPerDayEnabled" />
            <span class="text-xs text-stone-500">citas/día</span>
          </div>
        </AdminPanel>

        <AdminPanel v-if="icalUrl" title="Exportar calendario" sub="Suscríbete a esta URL en Google Calendar/Outlook ('Añadir por URL') para ver estas citas en tu calendario personal">
          <div class="flex items-center gap-2">
            <input :value="icalUrl" readonly class="input flex-1 text-xs" @click="($event.target as HTMLInputElement).select()" />
            <button class="btn-quiet !px-3 !py-1.5 text-xs" @click="copyIcalUrl">{{ copied ? 'Copiado' : 'Copiar' }}</button>
          </div>
          <p class="mt-2 text-xs text-stone-500">Solo exporta — para que un cambio en tu Google Calendar bloquee huecos aquí haría falta conectar OAuth de Google/Microsoft, no disponible en este despliegue.</p>
        </AdminPanel>
      </div>
    </div>

    <AdminPanel title="Bloqueos puntuales" sub="Días concretos en los que este agente no está disponible (vacaciones, baja, etc.)" class="mt-6">
      <div class="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label class="label">Fecha</label>
          <input v-model="timeOffForm.date" type="date" class="input !w-40" />
        </div>
        <div class="flex-1">
          <label class="label">Motivo (opcional)</label>
          <input v-model="timeOffForm.reason" class="input" placeholder="Vacaciones, formación…" />
        </div>
        <button class="btn-secondary" :disabled="!timeOffForm.date || addingTimeOff" @click="addTimeOff">Bloquear día</button>
      </div>
      <div class="flex flex-wrap gap-2">
        <span v-for="t in timeOff" :key="t.id" class="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1.5 text-xs">
          <span class="font-medium">{{ t.date }}</span>
          <span v-if="t.reason" class="text-stone-500">— {{ t.reason }}</span>
          <button class="text-stone-400 hover:text-red-600" @click="removeTimeOff(t.id)">✕</button>
        </span>
        <span v-if="!timeOff.length" class="text-sm text-stone-400">Sin bloqueos próximos</span>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
const route = useRoute()
const toast = useToast()
const agentId = Number(route.params.id)

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const { data } = await useFetch<any>(`/api/admin/saas/agents/${agentId}/availability`)
const agent = computed(() => data.value?.agent || null)
useHead({ title: () => `${agent.value?.name || 'Agente'} — Horario` })

const slotDurationMinutes = ref(60)
const bufferMinutes = ref(0)
const maxPerDayEnabled = ref(false)
const maxAppointmentsPerDay = ref(8)
const icalUrl = ref('')
const copied = ref(false)
const days = ref(DAY_LABELS.map((label, dayOfWeek) => ({ dayOfWeek, label, active: false, startTime: '09:00', endTime: '18:00' })))
const timeOff = ref<any[]>([])

watch(
  data,
  (d) => {
    if (!d) return
    slotDurationMinutes.value = d.agent?.slotDurationMinutes || 60
    bufferMinutes.value = d.agent?.bufferMinutes || 0
    maxPerDayEnabled.value = d.agent?.maxAppointmentsPerDay != null
    maxAppointmentsPerDay.value = d.agent?.maxAppointmentsPerDay || 8
    if (d.agent?.icalToken) icalUrl.value = `${window.location.origin}/calendar/${d.agent.icalToken}.ics`
    for (const day of days.value) {
      const rule = (d.rules || []).find((r: any) => r.dayOfWeek === day.dayOfWeek)
      day.active = !!rule
      if (rule) {
        day.startTime = rule.startTime
        day.endTime = rule.endTime
      }
    }
    timeOff.value = d.timeOff || []
  },
  { immediate: true },
)

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const rules = days.value.filter((d) => d.active).map((d) => ({ dayOfWeek: d.dayOfWeek, startTime: d.startTime, endTime: d.endTime }))
    await $fetch(`/api/admin/saas/agents/${agentId}/availability`, {
      method: 'PUT',
      body: {
        slotDurationMinutes: slotDurationMinutes.value,
        bufferMinutes: bufferMinutes.value,
        maxAppointmentsPerDay: maxPerDayEnabled.value ? maxAppointmentsPerDay.value : null,
        rules,
      },
    })
    toast.success('Horario guardado')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo guardar el horario')
  } finally {
    saving.value = false
  }
}

async function copyIcalUrl() {
  await navigator.clipboard.writeText(icalUrl.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

const timeOffForm = reactive({ date: '', reason: '' })
const addingTimeOff = ref(false)
async function addTimeOff() {
  addingTimeOff.value = true
  try {
    const res = await $fetch<any>(`/api/admin/saas/agents/${agentId}/time-off`, { method: 'POST', body: { ...timeOffForm } })
    timeOff.value.push(res.data)
    timeOff.value.sort((a, b) => a.date.localeCompare(b.date))
    timeOffForm.date = ''
    timeOffForm.reason = ''
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo bloquear el día')
  } finally {
    addingTimeOff.value = false
  }
}
async function removeTimeOff(id: number) {
  try {
    await $fetch(`/api/admin/saas/agents/${agentId}/time-off/${id}`, { method: 'DELETE' })
    timeOff.value = timeOff.value.filter((t) => t.id !== id)
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo eliminar el bloqueo')
  }
}
</script>

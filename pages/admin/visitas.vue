<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Visitas</h1>
      <p class="mt-1 text-sm text-stone-500">Agenda de citas: visitas, llamadas, reuniones, tasaciones, captaciones, firmas y open house</p>
    </div>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div v-if="view === 'list'" class="flex flex-wrap gap-1.5">
        <button v-for="f in filters" :key="f.key" class="rounded-lg border px-3 py-1.5 text-xs font-medium transition" :class="status === f.key ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:border-stone-300'" @click="status = f.key">
          {{ f.label }} <span class="ml-1 opacity-60">{{ f.key === 'all' ? totalCount : (counts[f.key] || 0) }}</span>
        </button>
      </div>
      <div v-else />
      <div class="flex items-center gap-2">
        <div class="flex gap-1 rounded-lg border border-line p-0.5">
          <button class="rounded-md px-3 py-1 text-xs font-medium transition" :class="view === 'list' ? 'bg-ink text-white' : 'text-stone-500'" @click="view = 'list'">Lista</button>
          <button class="rounded-md px-3 py-1 text-xs font-medium transition" :class="view === 'calendar' ? 'bg-ink text-white' : 'text-stone-500'" @click="view = 'calendar'">Calendario</button>
          <button class="rounded-md px-3 py-1 text-xs font-medium transition" :class="view === 'tours' ? 'bg-ink text-white' : 'text-stone-500'" @click="view = 'tours'">Tours</button>
        </div>
        <button v-if="view === 'tours'" class="btn-quiet !px-3 !py-1.5" data-testid="visitas-new-tour" @click="tourForm = true">+ Nuevo tour</button>
        <button v-else class="btn-quiet !px-3 !py-1.5" data-testid="visitas-new-appointment" @click="openNewAppointment()">+ Nueva cita</button>
      </div>
    </div>

    <!-- CALENDARIO -->
    <div v-if="view === 'calendar'">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div class="flex gap-1 rounded-lg border border-line p-0.5">
          <button v-for="sv in CAL_SUBVIEWS" :key="sv.key" class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="calSubView === sv.key ? 'bg-ink text-white' : 'text-stone-500'" @click="calSubView = sv.key">{{ sv.label }}</button>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <button class="btn-quiet !px-2.5 !py-1" @click="shiftCursor(-1)">←</button>
          <button class="btn-quiet !px-2.5 !py-1 text-xs" @click="calCursor = new Date()">Hoy</button>
          <span class="min-w-[10rem] text-center font-semibold">{{ calRangeLabel }}</span>
          <button class="btn-quiet !px-2.5 !py-1" @click="shiftCursor(1)">→</button>
        </div>
      </div>

      <div class="mb-4 grid grid-cols-2 gap-2.5 rounded-lg border border-line bg-stone-50/60 p-2.5 sm:grid-cols-3 lg:grid-cols-6" data-testid="calendar-filters">
        <label class="text-xs"><span class="label !mb-1">Comercial</span>
          <select v-model="calFilters.agentId" class="input !py-1.5 text-xs">
            <option :value="null">Todos</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label class="text-xs"><span class="label !mb-1">Oficina</span>
          <select v-model="calFilters.officeId" class="input !py-1.5 text-xs" data-testid="calendar-filter-office">
            <option :value="null">Todas</option>
            <option v-for="o in offices" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>
        <label class="text-xs"><span class="label !mb-1">Tipo</span>
          <select v-model="calFilters.type" class="input !py-1.5 text-xs" data-testid="calendar-filter-type">
            <option :value="null">Todos</option>
            <option v-for="t in APPOINTMENT_TYPES" :key="t" :value="t">{{ APPOINTMENT_TYPE_LABELS[t] }}</option>
          </select>
        </label>
        <label class="text-xs"><span class="label !mb-1">Estado</span>
          <select v-model="calFilters.status" class="input !py-1.5 text-xs">
            <option :value="null">Todos</option>
            <option v-for="s in APPOINTMENT_STATUSES" :key="s" :value="s">{{ APPOINTMENT_STATUS_LABELS[s] }}</option>
          </select>
        </label>
        <div class="text-xs">
          <span class="label !mb-1">Propiedad</span>
          <EntityPicker v-model="calProperty" kind="property" compact placeholder="Buscar…" test-id="calendar-filter-property" />
        </div>
        <div class="text-xs">
          <span class="label !mb-1">Cliente (contacto)</span>
          <EntityPicker v-model="calContact" kind="contact" compact placeholder="Buscar cliente…" test-id="calendar-filter-contact" />
        </div>
      </div>

      <!-- Mes -->
      <div v-if="calSubView === 'month'" class="grid grid-cols-7 gap-1.5 text-xs">
        <div v-for="d in weekdayLabels" :key="d" class="pb-1 text-center font-semibold uppercase text-stone-400">{{ d }}</div>
        <div
          v-for="(cell, i) in calendarCells" :key="i" class="min-h-[84px] rounded-lg border border-line p-1.5"
          :class="cell.inMonth ? 'bg-white' : 'bg-stone-50 text-stone-300'"
          @dragover.prevent
          @drop="cell.inMonth && onDropOnDate(cell.date)"
          @click="cell.inMonth && !cell.visits.length && openNewAppointment(cell.date)"
        >
          <div class="mb-1 text-right font-medium">{{ cell.day }}</div>
          <div class="space-y-0.5">
            <button
              v-for="v in cell.visits.slice(0, 3)" :key="v.id" draggable="true" class="block w-full truncate rounded px-1 py-0.5 text-left text-[10px]"
              :class="visitDotClass(v.status)" :title="`${v.clientName} · ${appointmentTypeLabel(v.type)} · ${v.agentName || ''} · ${appointmentStatusLabel(v.status)}`"
              @dragstart="onDragStart(v)" @click.stop="detailId = v.id"
            >
              {{ v.scheduledAt.slice(11, 16) }} {{ v.clientName }}<span v-if="v.tourId" title="Parada de un tour"> 🧭</span>
            </button>
            <div v-if="cell.visits.length > 3" class="text-[10px] text-stone-400">+{{ cell.visits.length - 3 }} más</div>
          </div>
        </div>
      </div>

      <!-- Semana / Día: misma cuadrícula por horas, 1 o 7 columnas -->
      <div v-else-if="calSubView === 'week' || calSubView === 'day'" class="overflow-x-auto">
        <div class="grid gap-1.5 text-xs" :style="{ gridTemplateColumns: `3.5rem repeat(${calDayColumns.length}, minmax(9rem, 1fr))` }">
          <div />
          <div v-for="d in calDayColumns" :key="d.date" class="pb-1 text-center font-semibold text-stone-500">{{ d.label }}</div>
          <template v-for="hour in CAL_HOURS" :key="hour">
            <div class="pr-1 pt-1 text-right text-[10px] text-stone-400">{{ String(hour).padStart(2, '0') }}:00</div>
            <div
              v-for="d in calDayColumns" :key="`${d.date}-${hour}`" class="min-h-[46px] rounded border border-line/70 bg-white p-1"
              @dragover.prevent
              @drop="onDropOnSlot(d.date, hour)"
              @click="openNewAppointment(d.date, hour)"
            >
              <button
                v-for="v in eventsAt(d.date, hour)" :key="v.id" draggable="true" class="mb-0.5 block w-full truncate rounded px-1 py-0.5 text-left text-[10px]"
                :class="visitDotClass(v.status)" @dragstart.stop="onDragStart(v)" @click.stop="detailId = v.id"
              >
                {{ v.scheduledAt.slice(11, 16) }}–{{ (v.endsAt || v.scheduledAt).slice(11, 16) }} {{ v.clientName }}<span v-if="v.tourId"> 🧭</span>
              </button>
            </div>
          </template>
        </div>
      </div>

      <!-- Agenda: lista cronológica, optimizada para móvil -->
      <div v-else class="space-y-2">
        <p v-if="!calRows.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Sin citas en este rango.</p>
        <div v-for="v in calRows" :key="v.id" class="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-3 active:bg-stone-50" @click="detailId = v.id">
          <div class="min-w-0">
            <p class="text-xs font-semibold text-stone-500">{{ dt.dateTime(v.scheduledAt) }} · {{ appointmentTypeLabel(v.type) }}<span v-if="v.tourId" title="Parada de un tour"> · 🧭 Tour</span></p>
            <p class="truncate text-sm font-medium">{{ v.clientName }}</p>
            <p class="truncate text-xs text-stone-400">{{ [v.propertyName, v.agentName, v.officeName].filter(Boolean).join(' · ') || '—' }}</p>
          </div>
          <AdminStatusPill :status="v.status" />
        </div>
      </div>

      <AdminPanel class="mt-5" data-testid="external-calendars">
        <p class="text-sm font-semibold">Calendarios externos</p>
        <ul class="mt-2 space-y-1.5 text-sm">
          <li class="flex flex-wrap items-center justify-between gap-2">
            <span>Google Calendar</span>
            <span class="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-500" data-testid="external-calendar-google">No conectado · próximamente</span>
          </li>
          <li class="flex flex-wrap items-center justify-between gap-2">
            <span>Outlook / Microsoft 365</span>
            <span class="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-500" data-testid="external-calendar-outlook">No conectado · próximamente</span>
          </li>
          <li class="flex flex-wrap items-center justify-between gap-2">
            <span>Suscripción iCal (solo lectura, por comercial)</span>
            <span class="text-xs text-emerald-700">Disponible en Comerciales → ficha → Horario</span>
          </li>
        </ul>
        <p class="mt-2 text-xs text-stone-400">La sincronización en los dos sentidos con Google u Outlook todavía no existe: hace falta conectar cada cuenta con su permiso (OAuth). Mientras tanto, el enlace iCal de cada comercial muestra sus citas en cualquier calendario, con la hora correcta de su zona.</p>
      </AdminPanel>
    </div>

    <!-- TOURS -->
    <div v-else-if="view === 'tours'" class="space-y-3">
      <p v-if="!tours.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
        Sin tours todavía — "+ Nuevo tour" para agendar varias paradas de una vez.
      </p>
      <AdminPanel v-for="t in tours" :key="t.id" class="!p-0" :data-testid="`tour-${t.id}`">
        <div class="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div class="min-w-0">
            <p class="font-medium">{{ t.clientName }}</p>
            <p class="text-xs text-stone-400">
              {{ [t.clientEmail, t.clientPhone].filter(Boolean).join(' · ') || '—' }}
              <NuxtLink v-if="t.contactId" :to="`/admin/contactos/${t.contactId}`" class="ml-1 hover:underline">· Contacto: {{ t.contactName || `#${t.contactId}` }}</NuxtLink>
              <NuxtLink v-if="t.leadId" :to="`/admin/leads/${t.leadId}`" class="ml-1 hover:underline">· Lead: {{ t.leadName || `#${t.leadId}` }}</NuxtLink>
            </p>
            <p v-if="t.notes" class="mt-0.5 text-xs text-stone-500">{{ t.notes }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span class="text-xs text-stone-400">{{ t.stops.length }} paradas</span>
            <button class="btn-quiet !px-2.5 !py-1 text-xs" :data-testid="`tour-${t.id}-edit`" @click="tourEdit = t">Editar / reordenar</button>
          </div>
        </div>
        <div class="divide-y divide-line/60">
          <div v-for="(s, i) in t.stops" :key="s.id" class="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <div class="min-w-0">
              <p class="truncate font-medium">{{ Number(i) + 1 }}. {{ s.propertyName || 'Sin inmueble' }} <span v-if="s.propertyKind" class="text-xs font-normal text-stone-400">· {{ s.propertyKind === 'agent' ? '2ª mano' : 'obra nueva' }}</span></p>
              <p class="truncate text-xs text-stone-400">
                {{ s.agentName }} · {{ dt.dateTime(s.scheduledAt) }}–{{ (s.endsAt || s.scheduledAt).slice(11, 16) }} ({{ s.durationMinutes }} min)
                <span v-if="s.status === 'scheduled' && s.confirmationStatus !== 'pending'" class="text-emerald-600">· ✓ {{ confirmationLabel(s.confirmationStatus).toLowerCase() }}</span>
                <span v-if="s.status === 'cancelled' && s.cancellationReason"> · {{ s.cancellationReason }}</span>
              </p>
              <OutcomeSummary :v="s" compact class="mt-1" />
            </div>
            <div class="flex shrink-0 flex-wrap items-center gap-1.5">
              <AdminStatusPill :status="s.status" />
              <button class="btn-quiet !px-2 !py-1 text-xs" @click="detailId = s.id">Ver</button>
              <button v-if="s.status === 'scheduled'" class="btn-quiet !px-2 !py-1 text-xs" :disabled="busyId === s.id" @click="setStatus(s, 'completed')">Completada</button>
              <button v-if="s.status === 'scheduled'" class="btn-quiet !px-2 !py-1 text-xs text-red-600" @click="cancelTarget = s">Cancelar</button>
              <button v-if="s.status === 'completed'" class="btn-quiet !px-2 !py-1 text-xs" :class="s.outcome ? 'text-emerald-600' : ''" @click="outcomeTarget = s">{{ s.outcome ? 'Editar resultado' : 'Anotar resultado' }}</button>
            </div>
          </div>
        </div>
      </AdminPanel>
    </div>

    <!-- LISTA -->
    <AdminPanel v-else :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Cliente</th>
              <th class="px-4 py-2.5 font-semibold">Tipo</th>
              <th class="px-4 py-2.5 font-semibold">Propiedad</th>
              <th class="px-4 py-2.5 font-semibold">Comercial</th>
              <th class="px-4 py-2.5 font-semibold">Fecha</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
              <th class="px-4 py-2.5 font-semibold">Resultado</th>
              <th class="px-4 py-2.5 font-semibold"/>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in rows" :key="v.id" class="border-b border-line/60 align-top last:border-0 hover:bg-stone-50" :data-testid="`visit-row-${v.id}`">
              <td class="px-4 py-3">
                <button class="font-medium hover:underline" @click="detailId = v.id">{{ v.clientName }}</button>
                <p v-if="v.contactName || v.leadName" class="text-xs text-stone-400">{{ v.contactName || v.leadName }}</p>
              </td>
              <td class="px-4 py-3 text-stone-600">
                {{ appointmentTypeLabel(v.type) }}
                <span class="mt-0.5 flex items-center gap-1 text-xs text-stone-400">
                  <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path :d="channelIcon(v.channel)" /></svg>
                  {{ appointmentChannelLabel(v.channel) }}
                </span>
              </td>
              <td class="px-4 py-3 text-stone-600">{{ v.propertyName || '—' }}</td>
              <td class="px-4 py-3 text-stone-600">
                <NuxtLink v-if="v.agentId" :to="`/admin/comerciales/${v.agentId}`" class="hover:underline">{{ v.agentName }}</NuxtLink>
                <span v-else>{{ v.agentName || '—' }}</span>
                <p v-if="v.officeName" class="text-xs text-stone-400">{{ v.officeName }}</p>
              </td>
              <td class="px-4 py-3 text-stone-600">{{ dt.dateTime(v.scheduledAt) }}<p v-if="v.endsAt" class="text-xs text-stone-400">hasta {{ v.endsAt.slice(11, 16) }}</p></td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-1.5">
                  <AdminStatusPill :status="v.status" />
                  <span v-if="v.status === 'scheduled' && v.confirmationStatus !== 'pending'" class="text-xs text-emerald-600" :title="confirmationLabel(v.confirmationStatus)">✓</span>
                </div>
                <p v-if="v.status === 'cancelled' && v.cancellationReason" class="mt-0.5 max-w-[12rem] truncate text-xs text-stone-400" :title="v.cancellationReason">{{ v.cancellationReason }}</p>
              </td>
              <td class="px-4 py-3"><OutcomeSummary :v="v" compact /></td>
              <td class="px-4 py-3 text-right">
                <div class="flex flex-wrap justify-end gap-1.5">
                  <button class="btn-quiet !px-2.5 !py-1 text-xs" @click="formAppointment = v">Editar</button>
                  <button v-if="v.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs" :disabled="busyId === v.id" @click="setStatus(v, 'completed')">Completada</button>
                  <button v-if="v.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs" :disabled="busyId === v.id" @click="setStatus(v, 'no_show')">No asistió</button>
                  <button v-if="v.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs text-red-600" :data-testid="`visit-row-${v.id}-cancel`" @click="cancelTarget = v">Cancelar</button>
                  <button v-if="v.status === 'completed'" class="btn-quiet !px-2.5 !py-1 text-xs" :class="v.outcome ? 'text-emerald-600' : ''" :data-testid="`visit-row-${v.id}-outcome`" @click="outcomeTarget = v">{{ v.outcome ? 'Editar resultado' : 'Anotar resultado' }}</button>
                </div>
              </td>
            </tr>
            <tr v-if="!rows.length"><td colspan="8" class="px-4 py-10 text-center text-stone-400">Sin visitas</td></tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>

    <AppointmentDetailModal
      v-if="detailId" :id="detailId" :resizable="view === 'calendar'" :refresh-key="detailKey"
      @close="detailId = null" @changed="refreshAll" @edit="(r) => (formAppointment = r)" @outcome="(r) => (outcomeTarget = r)" @cancel="(r) => (cancelTarget = r)"
    />
    <AppointmentFormModal
      v-if="formAppointment" :key="formAppointment.id || 'new'" :appointment="formAppointment.id ? formAppointment : null" :defaults="formAppointment.id ? null : formAppointment" :agents="agents"
      @close="formAppointment = null" @saved="onSaved('Cita guardada')"
    />
    <CancelAppointmentModal v-if="cancelTarget" :appointment="cancelTarget" @close="cancelTarget = null" @cancelled="cancelTarget = null; onSaved('Cita cancelada')" />
    <VisitOutcomeModal v-if="outcomeTarget" :visit="outcomeTarget" @close="outcomeTarget = null" @saved="onOutcomeSaved" />
    <TourFormModal v-if="tourForm" :agents="agents" :default-agent-id="calFilters.agentId" @close="tourForm = false" @saved="tourForm = false; onSaved('Tour creado')" />
    <TourEditModal v-if="tourEdit" :tour="tourEdit" @close="tourEdit = null" @saved="tourEdit = null; onSaved('Tour guardado')" />
  </div>
</template>

<script setup lang="ts">
import AdminPanel from '~/components/admin/Panel.vue'
import AdminStatusPill from '~/components/admin/StatusPill.vue'
import EntityPicker from '~/components/admin/appointments/EntityPicker.vue'
import OutcomeSummary from '~/components/admin/appointments/OutcomeSummary.vue'
import AppointmentDetailModal from '~/components/admin/appointments/AppointmentDetailModal.vue'
import AppointmentFormModal from '~/components/admin/appointments/AppointmentFormModal.vue'
import CancelAppointmentModal from '~/components/admin/appointments/CancelAppointmentModal.vue'
import VisitOutcomeModal from '~/components/admin/appointments/VisitOutcomeModal.vue'
import TourFormModal from '~/components/admin/appointments/TourFormModal.vue'
import TourEditModal from '~/components/admin/appointments/TourEditModal.vue'
import { loadRelationOptions, type RelationOption } from '~/composables/useRelationOptions'
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_LABELS,
  appointmentChannelLabel,
  appointmentStatusLabel,
  appointmentTypeLabel,
  confirmationLabel,
  type PickedEntity,
} from '~/utils/appointmentCatalog'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Visitas — M&M Real Estate' })
const dt = useDash()
const toast = useToast()

const status = ref('all')
const { data, refresh } = await useFetch<any>('/api/admin/saas/visits', { query: { status } })
const rows = computed<any[]>(() => data.value?.rows || [])
const counts = ref<Record<string, number>>({})
watch(data, (d) => { if (d?.counts) counts.value = d.counts }, { immediate: true })
const totalCount = computed(() => Object.values(counts.value).reduce((a, b) => a + b, 0))

const { data: toursData, refresh: refreshTours } = await useFetch<any>('/api/admin/saas/tours')
const tours = computed<any[]>(() => toursData.value?.rows || [])
const { data: agentsData } = await useFetch<any>('/api/admin/saas/agents')
const agents = computed<any[]>(() => agentsData.value?.rows || [])
const offices = ref<RelationOption[]>([])
onMounted(() => loadRelationOptions('offices').then((r) => (offices.value = r)))

const filters = [
  { key: 'all', label: 'Todas' },
  { key: 'scheduled', label: 'Agendadas' },
  { key: 'completed', label: 'Completadas' },
  { key: 'cancelled', label: 'Canceladas' },
  { key: 'no_show', label: 'No asistió' },
]
const view = ref<'list' | 'calendar' | 'tours'>('list')
const weekdayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

// Ventanas abiertas: ficha, formulario (alta o edición), cancelar, resultado y tours.
const detailId = ref<number | null>(null)
const detailKey = ref(0)
const formAppointment = ref<Record<string, any> | null>(null)
const cancelTarget = ref<any>(null)
const outcomeTarget = ref<any>(null)
const tourForm = ref(false)
const tourEdit = ref<any>(null)

/**
 * FASE 20 — Calendar. No es una segunda agenda: sólo visualiza `visits`
 * (Appointment sigue siendo la fuente de verdad) a través de
 * /api/admin/saas/calendar, que soporta rango de fechas y los filtros del
 * megaprompt (comercial, oficina, tipo, estado, propiedad y cliente).
 */
const CAL_SUBVIEWS = [
  { key: 'day', label: 'Día' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'agenda', label: 'Agenda' },
] as const
const calSubView = ref<'day' | 'week' | 'month' | 'agenda'>('month')
const calCursor = ref(new Date())
const CAL_HOURS = Array.from({ length: 14 }, (_, i) => i + 7) // 07:00–20:00

function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function dateStr(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function addDays(d: Date, n: number) {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}
function startOfWeek(d: Date) {
  const offset = (d.getDay() + 6) % 7 // Monday-first
  return addDays(d, -offset)
}

const calFilters = reactive<{ agentId: number | null; officeId: number | null; type: string | null; status: string | null }>({
  agentId: null,
  officeId: null,
  type: null,
  status: null,
})
const calProperty = ref<PickedEntity | null>(null)
const calContact = ref<PickedEntity | null>(null)

const calRangeFrom = computed(() => {
  if (calSubView.value === 'day') return dateStr(calCursor.value)
  if (calSubView.value === 'week') return dateStr(startOfWeek(calCursor.value))
  if (calSubView.value === 'agenda') return dateStr(calCursor.value)
  return dateStr(new Date(calCursor.value.getFullYear(), calCursor.value.getMonth(), 1))
})
const calRangeTo = computed(() => {
  if (calSubView.value === 'day') return dateStr(calCursor.value)
  if (calSubView.value === 'week') return dateStr(addDays(startOfWeek(calCursor.value), 6))
  if (calSubView.value === 'agenda') return dateStr(addDays(calCursor.value, 13))
  return dateStr(new Date(calCursor.value.getFullYear(), calCursor.value.getMonth() + 1, 0))
})
const calRangeLabel = computed(() => {
  if (calSubView.value === 'month') return calCursor.value.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  if (calSubView.value === 'day') return calCursor.value.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  return `${calRangeFrom.value} — ${calRangeTo.value}`
})
function shiftCursor(delta: number) {
  if (calSubView.value === 'day') calCursor.value = addDays(calCursor.value, delta)
  else if (calSubView.value === 'week') calCursor.value = addDays(calCursor.value, delta * 7)
  else if (calSubView.value === 'agenda') calCursor.value = addDays(calCursor.value, delta * 14)
  else calCursor.value = new Date(calCursor.value.getFullYear(), calCursor.value.getMonth() + delta, 1)
}

const calRows = ref<any[]>([])
const calLoaded = ref(false)
async function loadCalendar() {
  const query: Record<string, any> = { from: calRangeFrom.value, to: calRangeTo.value }
  if (calFilters.agentId) query.agentId = calFilters.agentId
  if (calFilters.officeId) query.officeId = calFilters.officeId
  if (calFilters.type) query.type = calFilters.type
  if (calFilters.status) query.status = calFilters.status
  if (calProperty.value) {
    query.propertyId = calProperty.value.id
    query.propertyKind = calProperty.value.kind
  }
  if (calContact.value) query.contactId = calContact.value.id
  const res = await $fetch<{ rows: any[] }>('/api/admin/saas/calendar', { query })
  calRows.value = res.rows
  calLoaded.value = true
}
watch([calRangeFrom, calRangeTo, () => ({ ...calFilters }), calProperty, calContact], loadCalendar, { immediate: false, deep: true })
watch(view, (v) => { if (v === 'calendar' && !calLoaded.value) loadCalendar() })

const calendarCells = computed(() => {
  const y = calCursor.value.getFullYear()
  const m = calCursor.value.getMonth()
  const firstDay = new Date(y, m, 1)
  const startOffset = (firstDay.getDay() + 6) % 7 // Monday-first grid
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells: { day: number; inMonth: boolean; date: string; visits: any[] }[] = []
  for (let i = 0; i < startOffset; i++) cells.push({ day: 0, inMonth: false, date: '', visits: [] })
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${pad2(m + 1)}-${pad2(d)}`
    cells.push({ day: d, inMonth: true, date: ds, visits: calRows.value.filter((v) => v.scheduledAt.slice(0, 10) === ds) })
  }
  return cells
})
const calDayColumns = computed(() => {
  if (calSubView.value === 'day') return [{ date: dateStr(calCursor.value), label: calCursor.value.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }) }]
  const start = startOfWeek(calCursor.value)
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i)
    return { date: dateStr(d), label: d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }) }
  })
})
function eventsAt(date: string, hour: number) {
  return calRows.value.filter((v) => v.scheduledAt.slice(0, 10) === date && Number(v.scheduledAt.slice(11, 13)) === hour)
}

// Drag & drop — mover una cita usa el mismo servicio que «Editar»
// (PATCH /api/admin/saas/visits/:id): valida conflictos, invalida la
// confirmación y notifica, no sólo mueve el bloque visual.
const dragging = ref<any>(null)
function onDragStart(v: any) {
  dragging.value = v
}
async function moveAppointment(v: any, newScheduledAt: string) {
  try {
    await $fetch(`/api/admin/saas/visits/${v.id}`, { method: 'PATCH', body: { scheduledAt: newScheduledAt } })
    await refreshAll()
    toast.success('Cita movida')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo mover la cita')
  }
}
function onDropOnDate(date: string) {
  if (!dragging.value) return
  moveAppointment(dragging.value, `${date} ${dragging.value.scheduledAt.slice(11)}`)
  dragging.value = null
}
function onDropOnSlot(date: string, hour: number) {
  if (!dragging.value) return
  moveAppointment(dragging.value, `${date} ${pad2(hour)}:${dragging.value.scheduledAt.slice(14, 16)}:00`)
  dragging.value = null
}

// Crear desde hueco (sección 17) — abre el formulario con la hora preseleccionada.
function openNewAppointment(date?: string, hour?: number) {
  const d = date || dateStr(new Date())
  const h = hour !== undefined ? pad2(hour) : '09'
  formAppointment.value = { scheduledAt: `${d}T${h}:00`, agentId: calFilters.agentId }
}

function visitDotClass(s: string) {
  return (
    {
      scheduled: 'bg-blue-50 text-blue-700',
      completed: 'bg-emerald-50 text-emerald-700',
      cancelled: 'bg-stone-100 text-stone-400',
      no_show: 'bg-red-50 text-red-700',
    }[s] || 'bg-stone-100 text-stone-500'
  )
}
function channelIcon(c: string) {
  if (c === 'video') return 'M23 7l-7 5 7 5V7zM1 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H1V5z'
  if (c === 'phone') return 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'
  return 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8'
}

async function refreshAll() {
  await Promise.all([refresh(), refreshTours(), calLoaded.value ? loadCalendar() : Promise.resolve()])
  detailKey.value += 1
}
async function onSaved(message: string) {
  formAppointment.value = null
  toast.success(message)
  await refreshAll()
}
async function onOutcomeSaved(res: Record<string, any>) {
  outcomeTarget.value = null
  const extras = [res.taskId && 'tarea de seguimiento', res.secondVisitId && 'segunda visita', res.offerId && 'oferta en borrador'].filter(Boolean)
  toast.success(extras.length ? `Resultado guardado (+ ${extras.join(', ')})` : 'Resultado guardado')
  await refreshAll()
}

const busyId = ref<number | null>(null)
async function setStatus(v: any, next: string) {
  busyId.value = v.id
  try {
    await $fetch(`/api/admin/saas/visits/${v.id}`, { method: 'PATCH', body: { status: next } })
    await refreshAll()
    toast.success('Visita actualizada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo actualizar la visita')
  } finally {
    busyId.value = null
  }
}
</script>

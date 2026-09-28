<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Visitas</h1>
      <p class="mt-1 text-sm text-stone-500">Agenda de visitas y citas con comerciales</p>
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
        <button v-if="view === 'tours'" class="btn-quiet !px-3 !py-1.5" @click="openNewTour">+ Nuevo tour</button>
        <button v-if="view === 'calendar'" class="btn-quiet !px-3 !py-1.5" @click="openNewAppointment()">+ Nueva cita</button>
      </div>
    </div>

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

      <div class="mb-4 flex flex-wrap items-end gap-2.5 rounded-lg border border-line bg-stone-50/60 p-2.5">
        <label class="text-xs"><span class="label !mb-1">Comercial</span>
          <select v-model="calFilters.agentId" class="input !py-1.5 text-xs">
            <option :value="null">Todos</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label class="text-xs"><span class="label !mb-1">Office</span>
          <select v-model="calFilters.office" class="input !py-1.5 text-xs">
            <option :value="null">Todas</option>
            <option v-for="o in officeOptions" :key="o" :value="o">{{ o }}</option>
          </select>
        </label>
        <label class="text-xs"><span class="label !mb-1">Tipo</span>
          <select v-model="calFilters.type" class="input !py-1.5 text-xs">
            <option :value="null">Todos</option>
            <option v-for="t in ['property_viewing', 'call', 'other']" :key="t" :value="t">{{ typeLabel(t) }}</option>
          </select>
        </label>
        <label class="text-xs"><span class="label !mb-1">Estado</span>
          <select v-model="calFilters.status" class="input !py-1.5 text-xs">
            <option :value="null">Todos</option>
            <option v-for="s in ['scheduled', 'completed', 'cancelled', 'no_show']" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>
        <div class="relative text-xs">
          <span class="label !mb-1">Propiedad</span>
          <input v-model="propertyQuery" type="search" class="input !py-1.5 text-xs" placeholder="Buscar…" @focus="propertyResultsOpen = true">
          <button v-if="calFilters.propertyId" type="button" class="ml-1 text-[11px] text-stone-400 hover:text-stone-600" @click="calFilters.propertyId = null; calFilters.propertyKind = null; propertyQuery = ''">✕ quitar</button>
          <ul v-if="propertyResultsOpen && propertySearchResults.length" class="absolute z-10 mt-1 w-56 rounded-lg border border-line bg-white py-1 shadow-lg">
            <li v-for="p in propertySearchResults" :key="`${p.kind}-${p.id}`">
              <button type="button" class="block w-full truncate px-2.5 py-1.5 text-left text-xs hover:bg-stone-50" @click="pickPropertyFilter(p)">{{ p.name }} <span class="text-stone-400">· {{ p.kind === 'agent' ? '2ª mano' : 'web' }}</span></button>
            </li>
          </ul>
        </div>
        <div class="relative text-xs">
          <span class="label !mb-1">Contacto</span>
          <input v-model="contactQuery" type="search" class="input !py-1.5 text-xs" placeholder="Buscar…" @focus="contactResultsOpen = true">
          <button v-if="calFilters.contactId" type="button" class="ml-1 text-[11px] text-stone-400 hover:text-stone-600" @click="calFilters.contactId = null; contactQuery = ''">✕ quitar</button>
          <ul v-if="contactResultsOpen && contactSearchResults.length" class="absolute z-10 mt-1 w-56 rounded-lg border border-line bg-white py-1 shadow-lg">
            <li v-for="c in contactSearchResults" :key="c.id">
              <button type="button" class="block w-full truncate px-2.5 py-1.5 text-left text-xs hover:bg-stone-50" @click="pickContactFilter(c)">{{ c.name }}</button>
            </li>
          </ul>
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
              :class="visitDotClass(v.status)" :title="`${v.clientName} · ${v.agentName || ''} · ${v.status}`"
              @dragstart="onDragStart(v)" @click.stop="openEventDetail(v)"
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
                :class="visitDotClass(v.status)" @dragstart.stop="onDragStart(v)" @click.stop="openEventDetail(v)"
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
        <div v-for="v in calRows" :key="v.id" class="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-3 active:bg-stone-50" @click="openEventDetail(v)">
          <div class="min-w-0">
            <p class="text-xs font-semibold text-stone-500">{{ dt.dateTime(v.scheduledAt) }}<span v-if="v.tourId" title="Parada de un tour"> · 🧭 Tour</span></p>
            <p class="truncate text-sm font-medium">{{ v.clientName }}</p>
            <p class="truncate text-xs text-stone-400">{{ [v.propertyName, v.agentName].filter(Boolean).join(' · ') || '—' }}</p>
          </div>
          <AdminStatusPill :status="v.status" />
        </div>
      </div>
    </div>

    <div v-else-if="view === 'tours'" class="space-y-3">
      <p v-if="!tours.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
        Sin tours todavía — "+ Nuevo tour" para agendar varias paradas de una vez.
      </p>
      <AdminPanel v-for="t in tours" :key="t.id" class="!p-0">
        <div class="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <p class="font-medium">{{ t.clientName }}</p>
            <p class="text-xs text-stone-400">{{ [t.clientEmail, t.clientPhone].filter(Boolean).join(' · ') || '—' }}{{ t.notes ? ` · ${t.notes}` : '' }}</p>
          </div>
          <span class="text-xs text-stone-400">{{ t.stops.length }} paradas</span>
        </div>
        <div class="divide-y divide-line/60">
          <div v-for="(s, i) in t.stops" :key="s.id" class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <div class="min-w-0">
              <p class="truncate font-medium">{{ i + 1 }}. {{ s.propertyName || 'Sin inmueble' }}</p>
              <p class="truncate text-xs text-stone-400">
                {{ s.agentName }} · {{ dt.dateTime(s.scheduledAt) }}
                <span v-if="s.status === 'scheduled' && s.confirmationStatus === 'confirmed'" class="text-emerald-600">· ✓ confirmada</span>
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <AdminStatusPill :status="s.status" />
              <button v-if="s.status === 'scheduled'" class="btn-quiet !px-2 !py-1 text-xs" :disabled="busyId === s.id" @click="setStatus(s, 'completed')">Completada</button>
              <button v-if="s.status === 'scheduled'" class="btn-quiet !px-2 !py-1 text-xs text-red-600" :disabled="busyId === s.id" @click="setStatus(s, 'cancelled')">Cancelar</button>
              <button v-if="s.status === 'completed'" class="btn-quiet !px-2 !py-1 text-xs" :class="s.outcome ? 'text-emerald-600' : ''" @click="openOutcome(s)">{{ s.outcome ? outcomeLabel(s.outcome) : 'Anotar resultado' }}</button>
            </div>
          </div>
        </div>
      </AdminPanel>
    </div>

    <AdminPanel v-else :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Cliente</th>
              <th class="px-4 py-2.5 font-semibold">Tipo</th>
              <th class="px-4 py-2.5 font-semibold">Propiedad</th>
              <th class="px-4 py-2.5 font-semibold">Comercial</th>
              <th class="px-4 py-2.5 font-semibold">Canal</th>
              <th class="px-4 py-2.5 font-semibold">Fecha</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
              <th class="px-4 py-2.5 font-semibold"/>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in rows" :key="v.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3 font-medium">{{ v.clientName }}</td>
              <td class="px-4 py-3 text-stone-600">{{ typeLabel(v.type) }}</td>
              <td class="px-4 py-3 text-stone-600">{{ v.propertyName || '—' }}</td>
              <td class="px-4 py-3 text-stone-600">
                <NuxtLink v-if="v.agentId" :to="`/admin/comerciales/${v.agentId}`" class="hover:underline">{{ v.agentName }}</NuxtLink>
                <span v-else>{{ v.agentName || '—' }}</span>
              </td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center gap-1.5 text-stone-600">
                  <svg class="h-3.5 w-3.5 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path :d="channelIcon(v.channel)" /></svg>
                  {{ channelLabel(v.channel) }}
                </span>
              </td>
              <td class="px-4 py-3 text-stone-600">{{ dt.dateTime(v.scheduledAt) }}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-1.5">
                  <AdminStatusPill :status="v.status" />
                  <span v-if="v.status === 'scheduled' && v.confirmationStatus === 'confirmed'" class="text-xs text-emerald-600" title="El cliente ha confirmado su asistencia">✓</span>
                </div>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex justify-end gap-1.5">
                  <button v-if="v.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs" @click="openReschedule(v)">Reprogramar</button>
                  <button v-if="v.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs" :disabled="busyId === v.id" @click="setStatus(v, 'completed')">Completada</button>
                  <button v-if="v.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs" :disabled="busyId === v.id" @click="setStatus(v, 'no_show')">No asistió</button>
                  <button v-if="v.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs text-red-600" :disabled="busyId === v.id" @click="setStatus(v, 'cancelled')">Cancelar</button>
                  <button v-if="v.status === 'completed'" class="btn-quiet !px-2.5 !py-1 text-xs" :class="v.outcome ? 'text-emerald-600' : ''" @click="openOutcome(v)">{{ v.outcome ? outcomeLabel(v.outcome) : 'Anotar resultado' }}</button>
                </div>
              </td>
            </tr>
            <tr v-if="!rows.length"><td colspan="8" class="px-4 py-10 text-center text-stone-400">Sin visitas</td></tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>

    <div v-if="reschedule" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="reschedule = null">
      <div class="w-full max-w-sm rounded-xl bg-white p-6">
        <h2 class="mb-4 text-lg font-semibold">Reprogramar visita</h2>
        <p class="mb-3 text-sm text-stone-500">{{ reschedule.clientName }}{{ reschedule.agentName ? ` — ${reschedule.agentName}` : '' }}</p>
        <label class="label">Nueva fecha/hora</label>
        <input v-model="rescheduleAt" type="datetime-local" class="input mb-4" >
        <div class="flex justify-end gap-2">
          <button class="btn-secondary" @click="reschedule = null">Cancelar</button>
          <button class="btn-primary" :disabled="!rescheduleAt || busyId === reschedule.id" @click="confirmReschedule">Guardar</button>
        </div>
      </div>
    </div>

    <div v-if="newTour" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="newTour = false">
      <div class="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6">
        <h2 class="mb-4 text-lg font-semibold">Nuevo tour</h2>

        <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label class="text-sm"><span class="label">Cliente</span><input v-model="tourForm.clientName" type="text" class="input" ></label>
          <label class="text-sm"><span class="label">Email</span><input v-model="tourForm.clientEmail" type="email" class="input" ></label>
          <label class="text-sm"><span class="label">Teléfono</span><input v-model="tourForm.clientPhone" type="tel" class="input" ></label>
        </div>

        <p class="label mb-2">Paradas</p>
        <div class="space-y-2.5">
          <div v-for="(s, i) in tourForm.stops" :key="i" class="grid grid-cols-1 gap-2 rounded-lg border border-line p-2.5 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <select v-model="s.propertyId" class="input !py-1.5 text-xs">
              <option :value="null">Sin inmueble</option>
              <option v-for="p in developerProperties" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <select v-model="s.agentId" class="input !py-1.5 text-xs">
              <option :value="null">Comercial…</option>
              <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
            <input v-model="s.scheduledAt" type="datetime-local" class="input !py-1.5 text-xs" >
            <button type="button" class="btn-quiet !px-2 !py-1 text-xs text-red-600" :disabled="tourForm.stops.length <= 1" @click="tourForm.stops.splice(i, 1)">Quitar</button>
          </div>
        </div>
        <button type="button" class="btn-quiet mt-2.5 !px-3 !py-1.5 text-xs" @click="tourForm.stops.push({ propertyId: null, agentId: null, scheduledAt: '' })">+ Añadir parada</button>

        <p v-if="tourError" class="mt-3 text-sm font-medium text-red-600">{{ tourError }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button class="btn-secondary" @click="newTour = false">Cancelar</button>
          <button class="btn-primary" :disabled="creatingTour" @click="submitNewTour">{{ creatingTour ? 'Creando…' : 'Crear tour' }}</button>
        </div>
      </div>
    </div>

    <div v-if="outcomeVisit" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="outcomeVisit = null">
      <div class="w-full max-w-sm rounded-xl bg-white p-6">
        <h2 class="mb-1 text-lg font-semibold">Resultado de la visita</h2>
        <p class="mb-4 text-sm text-stone-500">{{ outcomeVisit.clientName }}{{ outcomeVisit.propertyName ? ` — ${outcomeVisit.propertyName}` : '' }}</p>
        <p class="mb-4 text-xs text-stone-400">Es tu impresión de esta visita concreta — no cambia las características del inmueble ni lo que el cliente dice buscar.</p>
        <label class="label">¿Cómo quedó?</label>
        <select v-model="outcomeForm.outcome" class="input mb-3">
          <option value="" disabled>Elige una opción…</option>
          <option v-for="o in OUTCOME_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <label class="label">Notas (opcional)</label>
        <textarea v-model="outcomeForm.notes" rows="3" class="input mb-4" placeholder="Qué dijo, qué observaste…" />
        <p v-if="outcomeError" class="mb-3 text-sm font-medium text-red-600">{{ outcomeError }}</p>
        <div class="flex justify-end gap-2">
          <button class="btn-secondary" @click="outcomeVisit = null">Cancelar</button>
          <button class="btn-primary" :disabled="!outcomeForm.outcome || savingOutcome" @click="submitOutcome">{{ savingOutcome ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </div>
    </div>

    <div v-if="newAppt" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="newAppt = false">
      <div class="w-full max-w-sm rounded-xl bg-white p-6">
        <h2 class="mb-4 text-lg font-semibold">Nueva cita</h2>
        <div class="space-y-3">
          <label class="text-sm"><span class="label">Cliente</span><input v-model="newApptForm.clientName" type="text" class="input" ></label>
          <div class="grid grid-cols-2 gap-2">
            <label class="text-sm"><span class="label">Email</span><input v-model="newApptForm.clientEmail" type="email" class="input" ></label>
            <label class="text-sm"><span class="label">Teléfono</span><input v-model="newApptForm.clientPhone" type="tel" class="input" ></label>
          </div>
          <label class="text-sm"><span class="label">Comercial</span>
            <select v-model="newApptForm.agentId" class="input">
              <option :value="null">Elegir…</option>
              <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </label>
          <div class="relative text-sm">
            <span class="label">Propiedad (opcional)</span>
            <input v-model="newApptPropertyQuery" type="search" class="input" placeholder="Buscar por nombre o zona…" @focus="newApptPropertyResultsOpen = true">
            <p v-if="newApptForm.propertyId" class="mt-1 text-xs text-stone-500">{{ newApptPropertyQuery }} <button type="button" class="text-stone-400 hover:text-stone-600" @click="newApptForm.propertyId = null; newApptForm.propertyKind = null; newApptPropertyQuery = ''">✕</button></p>
            <ul v-if="newApptPropertyResultsOpen && newApptPropertySearchResults.length" class="absolute z-10 mt-1 w-full rounded-lg border border-line bg-white py-1 shadow-lg">
              <li v-for="p in newApptPropertySearchResults" :key="`${p.kind}-${p.id}`">
                <button type="button" class="block w-full truncate px-2.5 py-1.5 text-left text-xs hover:bg-stone-50" @click="pickNewApptProperty(p)">{{ p.name }} <span class="text-stone-400">· {{ p.kind === 'agent' ? '2ª mano' : 'web' }}</span></button>
              </li>
            </ul>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <label class="text-sm"><span class="label">Tipo</span>
              <select v-model="newApptForm.type" class="input">
                <option v-for="t in ['property_viewing', 'call', 'other']" :key="t" :value="t">{{ typeLabel(t) }}</option>
              </select>
            </label>
            <label class="text-sm"><span class="label">Canal</span>
              <select v-model="newApptForm.channel" class="input">
                <option value="in_person">Presencial</option>
                <option value="video">Videollamada</option>
                <option value="phone">Teléfono</option>
              </select>
            </label>
          </div>
          <label class="text-sm"><span class="label">Fecha y hora</span><input v-model="newApptForm.scheduledAt" type="datetime-local" class="input" ></label>
        </div>
        <p v-if="newApptError" class="mt-3 text-sm font-medium text-red-600">{{ newApptError }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button class="btn-secondary" @click="newAppt = false">Cancelar</button>
          <button class="btn-primary" :disabled="creatingAppt" @click="submitNewAppointment">{{ creatingAppt ? 'Creando…' : 'Crear cita' }}</button>
        </div>
      </div>
    </div>

    <div v-if="eventDetail" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="eventDetail = null">
      <div class="w-full max-w-sm rounded-xl bg-white p-6">
        <div class="mb-1 flex items-center justify-between">
          <h2 class="text-lg font-semibold">{{ eventDetail.clientName }}</h2>
          <AdminStatusPill :status="eventDetail.status" />
        </div>
        <p class="text-sm text-stone-500">{{ dt.dateTime(eventDetail.scheduledAt) }}{{ eventDetail.endsAt ? ` – ${eventDetail.endsAt.slice(11, 16)}` : '' }}</p>
        <p class="mt-2 text-sm text-stone-600">{{ typeLabel(eventDetail.type) }} · {{ channelLabel(eventDetail.channel) }}</p>
        <p v-if="eventDetail.propertyName" class="text-sm text-stone-600">🏠 {{ eventDetail.propertyName }}</p>
        <p v-if="eventDetail.agentName" class="text-sm text-stone-600">🧑‍💼 {{ eventDetail.agentName }}<span v-if="eventDetail.office"> · {{ eventDetail.office }}</span></p>
        <p v-if="eventDetail.tourId" class="text-sm text-stone-600">🧭 Parada {{ (eventDetail.tourStopOrder ?? 0) + 1 }} de un tour</p>
        <p v-if="eventDetail.outcome" class="text-sm text-emerald-600">Resultado: {{ outcomeLabel(eventDetail.outcome) }}</p>
        <div class="mt-4 flex flex-wrap gap-1.5">
          <NuxtLink v-if="eventDetail.leadId" :to="`/admin/leads/${eventDetail.leadId}`" class="btn-quiet !px-2.5 !py-1 text-xs">Ver lead</NuxtLink>
          <button v-if="eventDetail.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs" @click="openReschedule(eventDetail); eventDetail = null">Reprogramar</button>
          <button v-if="eventDetail.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs" @click="resizeEvent(eventDetail, -15)">-15 min</button>
          <button v-if="eventDetail.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs" @click="resizeEvent(eventDetail, 15)">+15 min</button>
          <button v-if="eventDetail.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs" @click="quickStatus(eventDetail, 'completed')">Completada</button>
          <button v-if="eventDetail.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs text-red-600" @click="quickStatus(eventDetail, 'cancelled')">Cancelar</button>
          <button v-if="eventDetail.status === 'completed'" class="btn-quiet !px-2.5 !py-1 text-xs" @click="openOutcome(eventDetail); eventDetail = null">{{ eventDetail.outcome ? 'Editar resultado' : 'Anotar resultado' }}</button>
        </div>
        <div class="mt-4 text-right"><button class="btn-secondary" @click="eventDetail = null">Cerrar</button></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
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

interface TourStop {
  id: number
  propertyName: string | null
  agentName: string
  scheduledAt: string
  status: string
  confirmationStatus: string
  outcome: string | null
}
interface Tour {
  id: number
  clientName: string
  clientEmail: string | null
  clientPhone: string | null
  notes: string | null
  stops: TourStop[]
}
const { data: toursData, refresh: refreshTours } = await useFetch<any>('/api/admin/saas/tours')
const tours = computed<Tour[]>(() => toursData.value?.rows || [])
const { data: devPropsData } = await useFetch<any>('/api/admin/developer-properties', { query: { perPage: 100 } })
const developerProperties = computed<any[]>(() => devPropsData.value?.items || devPropsData.value?.rows || [])
const { data: agentsData } = await useFetch<any>('/api/admin/saas/agents')
const agents = computed<any[]>(() => agentsData.value?.rows || [])

const filters = [
  { key: 'all', label: 'Todas' },
  { key: 'scheduled', label: 'Agendadas' },
  { key: 'completed', label: 'Completadas' },
  { key: 'cancelled', label: 'Canceladas' },
  { key: 'no_show', label: 'No asistió' },
]
const view = ref<'list' | 'calendar' | 'tours'>('list')
const weekdayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/**
 * FASE 20 — Calendar. No es una segunda agenda: sólo visualiza `visits`
 * (Appointment sigue siendo la fuente de verdad) a través de
 * /api/admin/saas/calendar, que sí soporta rango de fechas y los filtros del
 * megaprompt — a diferencia de /api/admin/saas/visits (Lista), que devuelve
 * como mucho las últimas 200 sin rango.
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

const calFilters = reactive<{ agentId: number | null; office: string | null; type: string | null; status: string | null; propertyId: number | null; propertyKind: 'agent' | 'developer' | null; contactId: number | null }>({
  agentId: null,
  office: null,
  type: null,
  status: null,
  propertyId: null,
  propertyKind: null,
  contactId: null,
})
const officeOptions = computed(() => [...new Set(agents.value.map((a) => a.officeName).filter(Boolean))] as string[])

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
async function loadCalendar() {
  const query: Record<string, any> = { from: calRangeFrom.value, to: calRangeTo.value }
  if (calFilters.agentId) query.agentId = calFilters.agentId
  if (calFilters.office) query.office = calFilters.office
  if (calFilters.type) query.type = calFilters.type
  if (calFilters.status) query.status = calFilters.status
  if (calFilters.propertyId) { query.propertyId = calFilters.propertyId; query.propertyKind = calFilters.propertyKind }
  if (calFilters.contactId) query.contactId = calFilters.contactId
  const res = await $fetch<{ rows: any[] }>('/api/admin/saas/calendar', { query })
  calRows.value = res.rows
}
watch([calRangeFrom, calRangeTo, () => ({ ...calFilters })], loadCalendar, { immediate: false, deep: true })
watch(view, (v) => { if (v === 'calendar' && !calRows.value.length) loadCalendar() })

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

// Propiedad — búsqueda unificada web + 2ª mano (server/utils/properties/search.ts).
const propertyQuery = ref('')
const propertyResultsOpen = ref(false)
const propertySearchResults = ref<any[]>([])
watch(propertyQuery, async (q) => {
  if (!q.trim()) { propertySearchResults.value = []; return }
  const res = await $fetch<{ rows: any[] }>('/api/admin/saas/properties/search', { query: { q } })
  propertySearchResults.value = res.rows
})
function pickPropertyFilter(p: any) {
  calFilters.propertyId = p.id
  calFilters.propertyKind = p.kind
  propertyQuery.value = p.name
  propertyResultsOpen.value = false
}

// Contacto — /api/admin/saas/contacts ya soporta `search`.
const contactQuery = ref('')
const contactResultsOpen = ref(false)
const contactSearchResults = ref<any[]>([])
watch(contactQuery, async (q) => {
  if (!q.trim()) { contactSearchResults.value = []; return }
  const res = await $fetch<any[]>('/api/admin/saas/contacts', { query: { search: q, limit: 8 } })
  contactSearchResults.value = res
})
function pickContactFilter(c: any) {
  calFilters.contactId = c.id
  contactQuery.value = c.name
  contactResultsOpen.value = false
}

// Drag & drop — mover una cita usa el mismo Appointment Domain Service que
// "Reprogramar" (PATCH /api/admin/saas/visits/:id): valida conflictos,
// invalida la confirmación del cliente y notifica, no sólo mueve el bloque visual.
const dragging = ref<any>(null)
function onDragStart(v: any) {
  dragging.value = v
}
async function moveAppointment(v: any, newScheduledAt: string) {
  try {
    await $fetch(`/api/admin/saas/visits/${v.id}`, { method: 'PATCH', body: { scheduledAt: newScheduledAt } })
    await loadCalendar()
    toast.success('Cita movida')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo mover la cita')
  }
}
function onDropOnDate(date: string) {
  if (!dragging.value) return
  const time = dragging.value.scheduledAt.slice(11)
  moveAppointment(dragging.value, `${date} ${time}`)
  dragging.value = null
}
function onDropOnSlot(date: string, hour: number) {
  if (!dragging.value) return
  const minute = dragging.value.scheduledAt.slice(14, 16)
  moveAppointment(dragging.value, `${date} ${pad2(hour)}:${minute}:00`)
  dragging.value = null
}

// Resize — cambia sólo la duración, mismo servicio (PATCH con durationMinutes), con la misma validación de conflictos.
async function resizeEvent(v: any, deltaMinutes: number) {
  const current = v.endsAt ? (new Date(`${v.endsAt.replace(' ', 'T')}Z`).getTime() - new Date(`${v.scheduledAt.replace(' ', 'T')}Z`).getTime()) / 60000 : 60
  const next = Math.max(15, current + deltaMinutes)
  try {
    await $fetch(`/api/admin/saas/visits/${v.id}`, { method: 'PATCH', body: { durationMinutes: next } })
    eventDetail.value = null
    await loadCalendar()
    toast.success('Duración actualizada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo cambiar la duración')
  }
}
async function quickStatus(v: any, next: string) {
  await setStatus(v, next)
  eventDetail.value = null
  await loadCalendar()
}

// Crear desde hueco (sección 17) — abre el editor con la hora preseleccionada.
const eventDetail = ref<any>(null)
function openEventDetail(v: any) {
  eventDetail.value = v
}
const newAppt = ref(false)
const newApptForm = reactive<{ clientName: string; clientEmail: string; clientPhone: string; agentId: number | null; propertyId: number | null; propertyKind: 'agent' | 'developer' | null; type: string; channel: string; scheduledAt: string }>({
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  agentId: null,
  propertyId: null,
  propertyKind: null,
  type: 'property_viewing',
  channel: 'in_person',
  scheduledAt: '',
})
const newApptError = ref('')
const creatingAppt = ref(false)
const newApptPropertyQuery = ref('')
const newApptPropertyResultsOpen = ref(false)
const newApptPropertySearchResults = ref<any[]>([])
watch(newApptPropertyQuery, async (q) => {
  if (!q.trim() || newApptForm.propertyId) { newApptPropertySearchResults.value = []; return }
  const res = await $fetch<{ rows: any[] }>('/api/admin/saas/properties/search', { query: { q } })
  newApptPropertySearchResults.value = res.rows
})
function pickNewApptProperty(p: any) {
  newApptForm.propertyId = p.id
  newApptForm.propertyKind = p.kind
  newApptPropertyQuery.value = p.name
  newApptPropertyResultsOpen.value = false
}
function openNewAppointment(date?: string, hour?: number) {
  newApptForm.clientName = ''
  newApptForm.clientEmail = ''
  newApptForm.clientPhone = ''
  newApptForm.agentId = calFilters.agentId
  newApptForm.propertyId = null
  newApptForm.propertyKind = null
  newApptForm.type = 'property_viewing'
  newApptForm.channel = 'in_person'
  newApptPropertyQuery.value = ''
  const d = date || dateStr(new Date())
  const h = hour !== undefined ? pad2(hour) : '09'
  newApptForm.scheduledAt = `${d}T${h}:00`
  newApptError.value = ''
  newAppt.value = true
}
async function submitNewAppointment() {
  newApptError.value = ''
  if (!newApptForm.clientName.trim()) { newApptError.value = 'Falta el nombre del cliente'; return }
  if (!newApptForm.clientEmail.trim() && !newApptForm.clientPhone.trim()) { newApptError.value = 'Falta un email o un teléfono de contacto'; return }
  if (!newApptForm.agentId) { newApptError.value = 'Falta el comercial'; return }
  if (!newApptForm.scheduledAt) { newApptError.value = 'Falta la fecha y hora'; return }
  creatingAppt.value = true
  try {
    await $fetch('/api/admin/saas/visits', {
      method: 'POST',
      body: {
        clientName: newApptForm.clientName,
        clientEmail: newApptForm.clientEmail || null,
        clientPhone: newApptForm.clientPhone || null,
        agentId: newApptForm.agentId,
        propertyId: newApptForm.propertyId,
        propertyKind: newApptForm.propertyKind,
        type: newApptForm.type,
        channel: newApptForm.channel,
        scheduledAt: `${newApptForm.scheduledAt.replace('T', ' ')}:00`,
      },
    })
    newAppt.value = false
    await Promise.all([loadCalendar(), refresh()])
    toast.success('Cita creada')
  } catch (e: any) {
    newApptError.value = e?.data?.statusMessage || 'No se pudo crear la cita'
  } finally {
    creatingAppt.value = false
  }
}
function visitDotClass(status: string) {
  return (
    {
      scheduled: 'bg-blue-50 text-blue-700',
      completed: 'bg-emerald-50 text-emerald-700',
      cancelled: 'bg-stone-100 text-stone-400',
      no_show: 'bg-red-50 text-red-700',
    }[status] || 'bg-stone-100 text-stone-500'
  )
}
function channelLabel(c: string) {
  return { in_person: 'Presencial', video: 'Videollamada', phone: 'Teléfono' }[c] || c
}
function typeLabel(t: string) {
  return { property_viewing: 'Visita a inmueble', call: 'Llamada de seguimiento', other: 'Otro' }[t] || t
}
const OUTCOME_OPTIONS = [
  { value: 'interested', label: 'Interesado — sigue adelante' },
  { value: 'wants_to_think', label: 'Se lo piensa' },
  { value: 'not_interested', label: 'No le convenció' },
]
function outcomeLabel(o: string) {
  return OUTCOME_OPTIONS.find((x) => x.value === o)?.label || o
}
function channelIcon(c: string) {
  if (c === 'video') return 'M23 7l-7 5 7 5V7zM1 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H1V5z'
  if (c === 'phone') return 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'
  return 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8'
}

const busyId = ref<number | null>(null)
async function setStatus(v: any, next: string) {
  busyId.value = v.id
  try {
    await $fetch(`/api/admin/saas/visits/${v.id}`, { method: 'PATCH', body: { status: next } })
    await Promise.all([refresh(), refreshTours()])
    toast.success('Visita actualizada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo actualizar la visita')
  } finally {
    busyId.value = null
  }
}

const reschedule = ref<any>(null)
const rescheduleAt = ref('')
function openReschedule(v: any) {
  reschedule.value = v
  rescheduleAt.value = v.scheduledAt.slice(0, 16).replace(' ', 'T')
}
async function confirmReschedule() {
  if (!reschedule.value) return
  busyId.value = reschedule.value.id
  try {
    await $fetch(`/api/admin/saas/visits/${reschedule.value.id}`, { method: 'PATCH', body: { scheduledAt: `${rescheduleAt.value.replace('T', ' ')}:00` } })
    reschedule.value = null
    await Promise.all([refresh(), refreshTours()])
    toast.success('Visita reprogramada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo reprogramar')
  } finally {
    busyId.value = null
  }
}

interface NewTourStop {
  propertyId: number | null
  agentId: number | null
  scheduledAt: string
}
const newTour = ref(false)
const tourForm = reactive<{ clientName: string; clientEmail: string; clientPhone: string; stops: NewTourStop[] }>({
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  stops: [{ propertyId: null, agentId: null, scheduledAt: '' }],
})
const tourError = ref('')
const creatingTour = ref(false)
function openNewTour() {
  tourForm.clientName = ''
  tourForm.clientEmail = ''
  tourForm.clientPhone = ''
  tourForm.stops = [{ propertyId: null, agentId: null, scheduledAt: '' }]
  tourError.value = ''
  newTour.value = true
}
async function submitNewTour() {
  tourError.value = ''
  if (!tourForm.clientName.trim()) { tourError.value = 'Falta el nombre del cliente'; return }
  if (!tourForm.clientEmail.trim() && !tourForm.clientPhone.trim()) { tourError.value = 'Falta un email o un teléfono de contacto'; return }
  if (tourForm.stops.some((s) => !s.agentId || !s.scheduledAt)) { tourError.value = 'Cada parada necesita comercial y fecha/hora'; return }

  creatingTour.value = true
  try {
    await $fetch('/api/admin/saas/tours', {
      method: 'POST',
      body: {
        clientName: tourForm.clientName,
        clientEmail: tourForm.clientEmail || null,
        clientPhone: tourForm.clientPhone || null,
        stops: tourForm.stops.map((s) => ({ propertyId: s.propertyId, agentId: s.agentId, scheduledAt: `${s.scheduledAt.replace('T', ' ')}:00` })),
      },
    })
    newTour.value = false
    await Promise.all([refreshTours(), refresh()])
    toast.success('Tour creado')
  } catch (e: any) {
    tourError.value = e?.data?.statusMessage || 'No se pudo crear el tour'
  } finally {
    creatingTour.value = false
  }
}

const outcomeVisit = ref<any>(null)
const outcomeForm = reactive<{ outcome: string; notes: string }>({ outcome: '', notes: '' })
const outcomeError = ref('')
const savingOutcome = ref(false)
function openOutcome(v: any) {
  outcomeVisit.value = v
  outcomeForm.outcome = v.outcome || ''
  outcomeForm.notes = v.outcomeNotes || ''
  outcomeError.value = ''
}
async function submitOutcome() {
  if (!outcomeVisit.value || !outcomeForm.outcome) return
  outcomeError.value = ''
  savingOutcome.value = true
  try {
    await $fetch(`/api/admin/saas/visits/${outcomeVisit.value.id}/outcome`, { method: 'POST', body: { outcome: outcomeForm.outcome, notes: outcomeForm.notes || null } })
    outcomeVisit.value = null
    await Promise.all([refresh(), refreshTours()])
    toast.success('Resultado guardado')
  } catch (e: any) {
    outcomeError.value = e?.data?.statusMessage || 'No se pudo guardar el resultado'
  } finally {
    savingOutcome.value = false
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-testid="comms-conversation-list">
    <div class="space-y-2 border-b border-line p-3">
      <input v-model="search" type="search" class="w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] focus:border-ink" placeholder="Buscar por nombre, teléfono o mensaje…" data-testid="comms-search">
      <div class="flex gap-1 rounded-lg bg-stone-100 p-0.5 text-[11px] font-medium">
        <button v-for="s in STATUSES" :key="s.key" type="button" class="flex-1 rounded-md px-2 py-1 transition" :class="status === s.key ? 'bg-white text-ink shadow-sm' : 'text-stone-500 hover:text-ink'" :data-testid="`comms-filter-${s.key}`" @click="status = s.key">
          {{ s.label }}<span v-if="counts[s.key]" class="ml-1 text-stone-400">{{ counts[s.key] }}</span>
        </button>
      </div>
      <div class="flex gap-1.5">
        <select v-model="assigned" class="min-w-0 flex-1 rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] text-stone-600 focus:border-ink">
          <option value="all">Todos los comerciales</option>
          <option value="unassigned">Sin asignar</option>
          <option v-for="a in team" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
        </select>
        <select v-if="channels.length > 1" v-model="channel" class="min-w-0 flex-1 rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] text-stone-600 focus:border-ink" data-testid="comms-filter-channel">
          <option value="all">Todos los números</option>
          <option v-for="c in channels" :key="c.id" :value="String(c.id)">{{ c.label }}</option>
        </select>
      </div>
      <!-- Núcleo N8a: canal — WhatsApp, formularios de la web o chat de la web -->
      <select v-model="source" class="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] text-stone-600 focus:border-ink" data-testid="comms-filter-source">
        <option value="all">Todos los canales</option>
        <option value="whatsapp">WhatsApp</option>
        <option value="web_form">Formulario web</option>
        <option value="web_chat">Chat web</option>
      </select>
      <div class="flex items-center justify-between gap-2">
        <label class="flex items-center gap-1.5 text-[12px] text-stone-600">
          <input v-model="unreadOnly" type="checkbox" class="rounded border-line" data-testid="comms-filter-unread">
          Sólo no leídas
        </label>
        <button v-if="!propertyFilter" type="button" class="text-[11px] text-stone-500 hover:text-ink" data-testid="comms-filter-property-open" @click="propertyPickerOpen = true">Filtrar por propiedad</button>
        <span v-else class="flex min-w-0 items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600" data-testid="comms-filter-property-chip">
          <span class="truncate">{{ propertyFilter.name }}</span>
          <button type="button" class="text-stone-400 hover:text-ink" aria-label="Quitar filtro de propiedad" @click="propertyFilter = null">×</button>
        </span>
      </div>
    </div>
    <AdminCommsPropertyPickerModal v-if="propertyPickerOpen" title="Filtrar por propiedad" @close="propertyPickerOpen = false" @pick="onPropertyFilterPicked" />

    <div class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="pending && !rows.length" class="py-10 text-center text-xs text-stone-400">Cargando…</p>
      <div v-else-if="!rows.length" class="px-6 py-12 text-center" data-testid="comms-list-empty">
        <p class="text-sm font-medium text-stone-600">Sin conversaciones</p>
        <p class="mt-1 text-xs text-stone-400">{{ search ? 'Nada coincide con la búsqueda.' : 'Aparecerán aquí en cuanto alguien escriba al número de la agencia, envíe un formulario o el chat de la web, o cuando abras un hilo desde una ficha.' }}</p>
      </div>
      <button
        v-for="c in rows"
        :key="c.id"
        type="button"
        class="flex w-full items-start gap-3 border-b border-line/60 px-3 py-3 text-left transition hover:bg-stone-50"
        :class="String(c.id) === String(selectedId) ? 'bg-stone-100' : ''"
        :data-testid="`comms-conversation-${c.id}`"
        @click="emit('select', c.id)"
      >
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold" :class="c.contact.known ? 'bg-paper text-stone-600 ring-1 ring-line' : 'bg-amber-100 text-amber-800'">{{ dt.initials(c.contact.name) }}</span>
        <span class="min-w-0 flex-1">
          <span class="flex items-baseline justify-between gap-2">
            <span class="truncate text-[13px] font-semibold text-ink">{{ c.contact.name }}</span>
            <span class="shrink-0 text-[10px] text-stone-400">{{ dt.relative(c.lastMessageAt) }}</span>
          </span>
          <span class="mt-0.5 flex items-center justify-between gap-2">
            <span class="truncate text-[12px]" :class="c.unreadCount ? 'font-medium text-ink' : 'text-stone-500'">{{ c.lastMessagePreview || '—' }}</span>
            <span v-if="c.unreadCount" class="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white" :data-testid="`comms-unread-${c.id}`">{{ c.unreadCount }}</span>
          </span>
          <span class="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-stone-400">
            <span v-if="c.source && c.source !== 'whatsapp'" class="rounded bg-sky-50 px-1 py-px font-semibold text-sky-700" :data-testid="`comms-source-${c.id}`">{{ c.channel?.label }}</span>
            <span v-if="!c.contact.known" class="rounded bg-amber-50 px-1 py-px font-semibold text-amber-700">{{ c.source && c.source !== 'whatsapp' ? 'Sin lead' : 'Desconocido' }}</span>
            <span v-if="c.assignedAgentName" class="truncate">{{ c.assignedAgentName }}</span>
            <span v-if="c.status !== 'open'" class="rounded bg-stone-100 px-1 py-px">{{ c.status === 'pending' ? 'Pendiente' : 'Cerrada' }}</span>
            <span v-if="c.window && !c.window.open" class="rounded bg-stone-100 px-1 py-px" title="Fuera de la ventana de 24 h: sólo plantillas">24 h</span>
          </span>
        </span>
      </button>
      <button v-if="nextBefore" type="button" class="w-full py-3 text-center text-xs text-stone-500 hover:text-ink" @click="loadMore">Cargar más</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ selectedId: number | string | null; team: { id: number; name: string }[]; channels?: { id: number; label: string }[]; refreshKey: number }>(), { channels: () => [] })
const emit = defineEmits<{ select: [id: number | string]; loaded: [rows: any[]] }>()
const dt = useDash()

const STATUSES = [
  { key: 'open', label: 'Abiertas' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'closed', label: 'Cerradas' },
  { key: 'all', label: 'Todas' },
]
const status = ref('open')
const assigned = ref('all')
const channel = ref('all')
/** Núcleo N8a: all | whatsapp | web_form | web_chat (los hilos web tienen id `w<n>`). */
const source = ref('all')
const unreadOnly = ref(false)
const propertyPickerOpen = ref(false)
const propertyFilter = ref<{ id: number; kind: 'agent' | 'developer'; name: string } | null>(null)
function onPropertyFilterPicked(p: any) {
  propertyFilter.value = { id: p.id, kind: p.kind, name: p.name }
  propertyPickerOpen.value = false
}
const search = ref('')
const debounced = ref('')
let timer: ReturnType<typeof setTimeout> | null = null
watch(search, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => (debounced.value = v), 250)
})

const rows = ref<any[]>([])
const counts = ref<Record<string, number>>({})
const nextBefore = ref<string | null>(null)
const pending = ref(false)

async function load(append = false) {
  pending.value = true
  try {
    const r = await $fetch<{ rows: any[]; counts: Record<string, number>; nextBefore: string | null }>('/api/admin/comms/conversations', {
      query: {
        status: status.value,
        assigned: assigned.value,
        channel: channel.value !== 'all' ? channel.value : undefined,
        source: source.value !== 'all' ? source.value : undefined,
        unread: unreadOnly.value ? '1' : undefined,
        propertyId: propertyFilter.value?.id,
        propertyKind: propertyFilter.value?.kind,
        q: debounced.value || undefined,
        before: append ? nextBefore.value || undefined : undefined,
      },
    })
    rows.value = append ? [...rows.value, ...r.rows] : r.rows
    counts.value = r.counts
    nextBefore.value = r.nextBefore
    emit('loaded', rows.value)
  } catch {
    // la siguiente actualización lo reintenta
  } finally {
    pending.value = false
  }
}
function loadMore() {
  load(true)
}
watch([status, assigned, channel, source, unreadOnly, propertyFilter, debounced], () => load(), { immediate: true })
watch(
  () => props.refreshKey,
  () => load(),
)

/** Una conversación cambiada (por el sondeo o por el propio hilo) se actualiza en sitio, y sube arriba si tiene mensaje nuevo. */
function upsert(conv: any) {
  const idx = rows.value.findIndex((r) => r.id === conv.id)
  // El servidor también cuenta como "de esta propiedad" un hilo donde se envió alguna vez
  // (comms_messages.property_id), que aquí no se ve: una fila que ya listó se respeta.
  const matchesProperty = !propertyFilter.value || idx >= 0 || (conv.propertyId === propertyFilter.value.id && conv.propertyKind === propertyFilter.value.kind)
  const matchesFilter =
    (status.value === 'all' || conv.status === status.value) &&
    (assigned.value === 'all' || (assigned.value === 'unassigned' ? !conv.assignedAgentId : String(conv.assignedAgentId) === assigned.value)) &&
    (channel.value === 'all' || String(conv.channel?.id) === channel.value) &&
    (source.value === 'all' || (conv.source || 'whatsapp') === source.value) &&
    (!unreadOnly.value || conv.unreadCount > 0) &&
    matchesProperty
  if (!matchesFilter) {
    if (idx >= 0) rows.value.splice(idx, 1)
    return
  }
  if (idx >= 0) rows.value.splice(idx, 1)
  if (!conv.lastMessageAt) return
  const pos = rows.value.findIndex((r) => (r.lastMessageAt || '') < (conv.lastMessageAt || ''))
  if (pos === -1) rows.value.push(conv)
  else rows.value.splice(pos, 0, conv)
}
defineExpose({ upsert, reload: () => load() })
</script>

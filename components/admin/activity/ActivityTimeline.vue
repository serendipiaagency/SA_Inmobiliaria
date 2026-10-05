<template>
  <div data-testid="activity-timeline">
    <div class="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar la actividad por tipo">
      <button
        type="button"
        class="rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition"
        :class="!group ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:bg-stone-50'"
        data-testid="activity-group-all"
        @click="setGroup('')"
      >
        Todo
      </button>
      <button
        v-for="g in ACTIVITY_GROUPS"
        :key="g.key"
        type="button"
        class="rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition"
        :class="group === g.key ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:bg-stone-50'"
        :data-testid="`activity-group-${g.key}`"
        @click="setGroup(g.key)"
      >
        {{ g.label }}
      </button>
    </div>

    <p v-if="error" class="rounded-xl border border-dashed border-red-200 px-6 py-6 text-center text-sm text-red-600">{{ error }}</p>
    <p v-else-if="loading && !rows.length" class="py-8 text-center text-sm text-stone-400">Cargando actividad…</p>
    <p v-else-if="!rows.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
      {{ group ? 'Sin actividad de este tipo.' : emptyText }}
    </p>
    <ol v-else class="relative space-y-3 border-l border-line pl-4" data-testid="activity-rows">
      <li v-for="a in rows" :key="a.id" class="relative text-sm" :data-testid="`activity-row-${a.eventType}`">
        <span class="absolute -left-[21px] mt-1.5 h-2 w-2 rounded-full" :class="dotClass(a.eventType)" />
        <p class="font-medium">{{ renderActivity(a).title }}</p>
        <p v-if="renderActivity(a).detail" class="text-stone-600">{{ renderActivity(a).detail }}</p>
        <p class="text-[11px] text-stone-400">
          {{ formatDateTime(a.createdAt) }}<template v-if="activityActor(a)"> · {{ activityActor(a) }}</template>
          <NuxtLink v-if="showLinks && activityLink(a)" :to="activityLink(a)!.to" class="ml-1 underline hover:text-ink">{{ activityLink(a)!.label }}</NuxtLink>
        </p>
      </li>
    </ol>
    <div v-if="nextBefore" class="mt-3 text-center">
      <button type="button" class="btn-quiet !px-3 !py-1 text-xs" :disabled="loading" data-testid="activity-more" @click="load(true)">{{ loading ? 'Cargando…' : 'Ver más antigua' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatDateTime } from '~/composables/useClientConfig'
import { activityActor, activityLink, renderActivity, type ActivityRow } from '~/composables/useActivityRenderer'
import { ACTIVITY_GROUPS } from '~/utils/pipelineCatalog'

/**
 * Cronología reutilizable (FASE 21, bloque N6) — la misma en la ficha de
 * Contacto, Lead, Propiedad (los dos catálogos) y Operación. Enseña TODOS
 * los tipos de evento (los filtros sólo acotan), con quién lo hizo y un
 * enlace a lo que lo originó. Pagina hacia atrás con «Ver más antigua»
 * (cursor `before` de GET /api/admin/saas/activity).
 *
 * `filter` lleva exactamente la entidad: { contactId } | { leadId } |
 * { propertyId, propertyKind } | { appointmentId } | { dealId }.
 */
const props = withDefaults(
  defineProps<{
    filter: { contactId?: number; leadId?: number; propertyId?: number; propertyKind?: 'agent' | 'developer'; appointmentId?: number; dealId?: number }
    emptyText?: string
    showLinks?: boolean
    /** Cambia este número para volver a cargar (p. ej. tras una acción en la misma ficha). */
    refreshKey?: number
  }>(),
  { emptyText: 'Sin actividad registrada.', showLinks: true, refreshKey: 0 },
)

const rows = ref<ActivityRow[]>([])
const nextBefore = ref<number | null>(null)
const loading = ref(false)
const error = ref('')
const group = ref('')

const eventTypes = computed(() => ACTIVITY_GROUPS.find((g) => g.key === group.value)?.types.join(',') || undefined)

async function load(more = false) {
  loading.value = true
  error.value = ''
  try {
    const res = await $fetch<{ rows: ActivityRow[]; nextBefore: number | null }>('/api/admin/saas/activity', {
      query: { ...props.filter, eventTypes: eventTypes.value, before: more ? nextBefore.value || undefined : undefined, limit: 30 },
    })
    rows.value = more ? [...rows.value, ...res.rows] : res.rows
    nextBefore.value = res.nextBefore
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo cargar la actividad.'
  } finally {
    loading.value = false
  }
}

function setGroup(key: string) {
  group.value = key
  load()
}

function dotClass(eventType: string) {
  if (eventType.startsWith('DEAL_')) return 'bg-emerald-500'
  if (eventType.startsWith('OFFER_')) return 'bg-amber-500'
  if (eventType.startsWith('TASK_')) return 'bg-blue-500'
  if (eventType.startsWith('APPOINTMENT_') || eventType.startsWith('VIEWING_') || eventType === 'VISIT_OUTCOME_RECORDED') return 'bg-violet-500'
  return 'bg-stone-300'
}

onMounted(() => load())
// Clave en texto: la ficha suele pasar `filter` como un objeto nuevo en cada
// render, y vigilarlo tal cual recargaría la cronología sin que nada cambie.
watch(
  () => `${JSON.stringify(props.filter)}|${props.refreshKey}`,
  () => load(),
)
</script>

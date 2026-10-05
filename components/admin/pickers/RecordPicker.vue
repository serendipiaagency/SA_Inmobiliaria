<template>
  <div class="relative" :data-testid="`picker-${kind}`">
    <div v-if="modelValue" class="flex items-center justify-between gap-2 rounded-lg border border-line bg-stone-50 px-3 py-2 text-sm">
      <span class="min-w-0 truncate">
        {{ modelValue.label || `#${modelValue.id}` }}
        <span v-if="kind === 'property' && modelValue.kind" class="text-[11px] text-stone-400">· {{ modelValue.kind === 'agent' ? '2ª mano' : 'obra nueva' }}</span>
      </span>
      <button v-if="!locked" type="button" class="shrink-0 text-[11px] text-stone-500 underline hover:text-ink" :data-testid="`picker-${kind}-clear`" @click="clear">Quitar</button>
    </div>
    <template v-else>
      <input
        v-model="query"
        type="search"
        class="input"
        :placeholder="placeholder || PLACEHOLDERS[kind]"
        :aria-label="placeholder || PLACEHOLDERS[kind]"
        :data-testid="`picker-${kind}-input`"
        @input="onInput"
        @focus="onFocus"
      >
      <ul v-if="open && (results.length || searching || query.trim())" class="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-line bg-white shadow-lg">
        <li v-if="searching" class="px-3 py-2 text-xs text-stone-400">Buscando…</li>
        <li v-else-if="!results.length" class="px-3 py-2 text-xs text-stone-400">Sin resultados.</li>
        <li v-for="r in results" :key="`${r.kind || ''}-${r.id}`">
          <button type="button" class="block w-full px-3 py-2 text-left text-xs hover:bg-stone-50" :data-testid="`picker-${kind}-option-${r.id}`" @click="pick(r)">
            <span class="font-medium">{{ r.label }}</span>
            <span v-if="r.sub" class="ml-1 text-stone-400">· {{ r.sub }}</span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Selector de un registro del CRM por búsqueda (bloque N6): contacto, lead,
 * inmueble (los dos catálogos), cita u operación. Sólo ofrece lo que el
 * servidor devuelve para esta organización — y el servidor vuelve a validar
 * cada id al guardar (404 si no es de la agencia), así que esto es ayuda,
 * no control de acceso.
 *
 * Fuentes: contactos y leads del motor genérico (`/api/admin/contacts|leads?q=`),
 * inmuebles de `/api/admin/saas/properties/search` (sólo vivos: nada nuevo
 * sobre la papelera), citas de `/api/admin/saas/visits` y operaciones de
 * `/api/admin/saas/deal-operations` (filtradas aquí por texto).
 */
import type { PickedRecord } from '~/utils/pipelineCatalog'

const props = defineProps<{
  kind: 'contact' | 'lead' | 'property' | 'appointment' | 'deal'
  modelValue: PickedRecord | null
  placeholder?: string
  /** Fijado por la pantalla (p. ej. la operación desde su propia ficha): se ve, no se cambia. */
  locked?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: PickedRecord | null): void }>()

const PLACEHOLDERS: Record<string, string> = {
  contact: 'Buscar contacto por nombre, email o teléfono…',
  lead: 'Buscar lead por nombre, email o teléfono…',
  property: 'Buscar inmueble por nombre, referencia o zona…',
  appointment: 'Buscar cita por cliente o inmueble…',
  deal: 'Buscar operación por comprador, inmueble o nº…',
}

const query = ref('')
const results = ref<PickedRecord[]>([])
const searching = ref(false)
const open = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
let cache: PickedRecord[] | null = null

async function loadAll(): Promise<PickedRecord[]> {
  if (cache) return cache
  if (props.kind === 'appointment') {
    const res = await $fetch<{ rows: any[] }>('/api/admin/saas/visits', { query: { status: 'all' } }).catch(() => ({ rows: [] as any[] }))
    cache = (res.rows || []).map((v) => ({ id: v.id, label: `${v.clientName}${v.propertyName ? ` · ${v.propertyName}` : ''}`, sub: String(v.scheduledAt || '').slice(0, 16) }))
  } else {
    const res = await $fetch<{ rows: any[] }>('/api/admin/saas/deal-operations').catch(() => ({ rows: [] as any[] }))
    cache = (res.rows || []).map((d) => ({ id: d.id, label: `Operación #${d.id} · ${d.buyerName || 'Comprador'}`, sub: d.propertyName || null }))
  }
  return cache
}

async function search() {
  const q = query.value.trim()
  searching.value = true
  try {
    if (props.kind === 'contact' || props.kind === 'lead') {
      if (!q) {
        results.value = []
        return
      }
      const res = await $fetch<{ rows: any[] }>(`/api/admin/${props.kind === 'contact' ? 'contacts' : 'leads'}`, { query: { q, perPage: 15 } })
      results.value = (res.rows || []).map((r) => ({ id: r.id, label: r.name || `#${r.id}`, sub: r.email || r.phone || null }))
    } else if (props.kind === 'property') {
      if (!q) {
        results.value = []
        return
      }
      const res = await $fetch<{ rows: any[] }>('/api/admin/saas/properties/search', { query: { q } })
      results.value = (res.rows || []).map((p) => ({ id: p.id, kind: p.kind, label: p.name, sub: `${p.kind === 'agent' ? '2ª mano' : 'obra nueva'}${p.subtitle ? ` · ${p.subtitle}` : ''}` }))
    } else {
      const all = await loadAll()
      const needle = q.toLowerCase()
      results.value = (needle ? all.filter((r) => `${r.id} ${r.label} ${r.sub || ''}`.toLowerCase().includes(needle)) : all).slice(0, 20)
    }
  } catch {
    results.value = []
  } finally {
    searching.value = false
  }
}

function onInput() {
  open.value = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(search, 250)
}
function onFocus() {
  open.value = true
  if (props.kind === 'appointment' || props.kind === 'deal') search()
}
function pick(r: PickedRecord) {
  emit('update:modelValue', r)
  open.value = false
  query.value = ''
  results.value = []
}
function clear() {
  emit('update:modelValue', null)
}
</script>

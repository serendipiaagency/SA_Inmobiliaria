<template>
  <div class="relative" :data-testid="testId">
    <div v-if="modelValue" class="flex items-center justify-between gap-2 rounded-lg border border-line bg-stone-50 px-3 py-2 text-sm">
      <span class="min-w-0 truncate">
        {{ modelValue.label }}
        <span v-if="kind === 'property' && modelValue.kind" class="text-xs text-stone-400">· {{ modelValue.kind === 'agent' ? '2ª mano' : 'obra nueva' }}</span>
      </span>
      <button type="button" class="shrink-0 text-xs text-stone-400 hover:text-stone-700" :data-testid="testId ? `${testId}-clear` : undefined" @click="emit('update:modelValue', null)">✕ quitar</button>
    </div>
    <template v-else>
      <input v-model="query" type="search" class="input" :class="compact ? '!py-1.5 text-xs' : ''" :placeholder="placeholder" :data-testid="testId ? `${testId}-input` : undefined" @focus="open = true" @blur="closeSoon">
      <ul v-if="open && results.length" class="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg">
        <li v-for="r in results" :key="`${r.kind || ''}-${r.id}`">
          <button type="button" class="block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-stone-50" @mousedown.prevent="pick(r)">
            {{ r.label }}
            <span v-if="r.sub" class="text-stone-400">· {{ r.sub }}</span>
          </button>
        </li>
      </ul>
      <p v-else-if="open && query.trim() && searched && !results.length" class="absolute z-20 mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-stone-400 shadow-lg">Sin resultados</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { PickedEntity } from '~/utils/appointmentCatalog'

/**
 * Buscador para elegir un contacto, un lead o un inmueble (de los dos
 * catálogos a la vez) en los formularios de citas y tours. Sólo busca: quién
 * puede ver qué lo decide el servidor (todo acotado por agencia), y el
 * servidor vuelve a validar el id elegido al guardar.
 */
const props = withDefaults(defineProps<{ kind: 'contact' | 'lead' | 'property'; modelValue: PickedEntity | null; placeholder?: string; compact?: boolean; testId?: string }>(), {
  placeholder: 'Buscar…',
  compact: false,
  testId: undefined,
})
const emit = defineEmits<{ 'update:modelValue': [value: PickedEntity | null] }>()

const query = ref('')
const open = ref(false)
const searched = ref(false)
const results = ref<Array<PickedEntity & { sub?: string }>>([])
let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0

watch(query, (q) => {
  if (timer) clearTimeout(timer)
  if (!q.trim()) {
    results.value = []
    searched.value = false
    return
  }
  timer = setTimeout(() => search(q.trim()), 250)
})

async function search(q: string) {
  const mine = ++seq
  try {
    let rows: Array<PickedEntity & { sub?: string }> = []
    if (props.kind === 'contact') {
      const res = await $fetch<any[]>('/api/admin/saas/contacts', { query: { search: q, limit: 8 } })
      rows = (res || []).map((c) => ({ id: c.id, label: c.name, sub: c.email || c.phone || undefined }))
    } else if (props.kind === 'lead') {
      const res = await $fetch<{ rows: any[] }>('/api/admin/saas/leads', { query: { search: q } })
      rows = (res.rows || []).slice(0, 8).map((l) => ({ id: l.id, label: l.name, sub: l.email || l.phone || undefined }))
    } else {
      const res = await $fetch<{ rows: any[] }>('/api/admin/saas/properties/search', { query: { q } })
      rows = (res.rows || []).map((p) => ({ id: p.id, label: p.name, kind: p.kind, sub: [p.kind === 'agent' ? '2ª mano' : 'obra nueva', p.subtitle].filter(Boolean).join(' · ') }))
    }
    if (mine === seq) {
      results.value = rows
      searched.value = true
    }
  } catch {
    if (mine === seq) results.value = []
  }
}

function pick(r: PickedEntity) {
  emit('update:modelValue', { id: r.id, label: r.label, ...(r.kind ? { kind: r.kind } : {}) })
  query.value = ''
  results.value = []
  open.value = false
}
function closeSoon() {
  setTimeout(() => (open.value = false), 150)
}
</script>

<template>
  <AdminCommsModal :title="title" sub="Propiedades de la web (obra nueva) con su enlace público" test-id="comms-property-picker" @close="emit('close')">
    <input v-model="q" type="search" class="input rounded-lg" placeholder="Buscar por nombre o zona…" data-testid="property-picker-search" autofocus>
    <p v-if="pending" class="py-6 text-center text-xs text-stone-400">Buscando…</p>
    <p v-else-if="!rows.length" class="py-6 text-center text-xs text-stone-400">Sin resultados.</p>
    <ul v-else class="mt-3 divide-y divide-line">
      <li v-for="p in rows" :key="p.id">
        <button type="button" class="flex w-full items-center gap-3 py-2.5 text-left transition hover:bg-stone-50" :data-testid="`property-picker-item-${p.id}`" @click="emit('pick', p)">
          <img :src="mediaUrl(p.coverImage)" alt="" class="h-12 w-16 shrink-0 rounded-md object-cover bg-stone-100">
          <div class="min-w-0">
            <p class="truncate text-[13px] font-medium text-ink">{{ p.name }}</p>
            <p class="truncate text-[11px] text-stone-500">{{ [p.community, p.propertyType, p.bedrooms ? `${p.bedrooms} dorm.` : null].filter(Boolean).join(' · ') }}</p>
          </div>
          <span v-if="p.price" class="ml-auto shrink-0 text-[12px] font-semibold tabular-nums text-stone-700">{{ price(p.price) }}</span>
        </button>
      </li>
    </ul>
  </AdminCommsModal>
</template>

<script setup lang="ts">
import { mediaUrl } from '~/composables/useMedia'

withDefaults(defineProps<{ title?: string }>(), { title: 'Elegir propiedad' })
const emit = defineEmits<{ close: []; pick: [property: any] }>()
const q = ref('')
const debounced = ref('')
let timer: ReturnType<typeof setTimeout> | null = null
watch(q, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => (debounced.value = v), 250)
})
const { data, pending } = await useFetch<{ rows: any[] }>('/api/admin/comms/properties', { query: { q: debounced }, watch: [debounced] })
const rows = computed(() => data.value?.rows || [])
function price(v: number) {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(v)} €`
}
</script>

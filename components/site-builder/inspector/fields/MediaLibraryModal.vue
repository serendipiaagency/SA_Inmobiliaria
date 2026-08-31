<template>
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6" @click.self="$emit('close')">
    <div class="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div class="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
        <p class="text-sm font-semibold text-ink">Biblioteca de medios</p>
        <button type="button" class="text-stone-300 hover:text-ink" @click="$emit('close')">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div class="border-b border-line px-5 py-2.5">
        <input v-model="q" class="input" placeholder="Buscar por nombre de archivo…" @input="debouncedLoad" >
      </div>
      <div class="flex-1 overflow-y-auto p-5">
        <p v-if="loading" class="py-10 text-center text-sm text-stone-400">Cargando…</p>
        <p v-else-if="!rows.length" class="py-10 text-center text-sm text-stone-400">Sin imágenes todavía. Sube una desde "Subir imagen".</p>
        <div v-else class="grid grid-cols-3 gap-3 sm:grid-cols-4">
          <button
            v-for="row in rows"
            :key="row.id"
            type="button"
            class="group aspect-square overflow-hidden rounded-lg border border-line bg-stone-50 transition hover:border-ink"
            @click="$emit('select', row.url)"
          >
            <img :src="row.url" :alt="row.altText || row.filename" class="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" >
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{ close: []; select: [url: string] }>()

const rows = ref<any[]>([])
const loading = ref(true)
const q = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function load() {
  loading.value = true
  try {
    const res = await $fetch<{ rows: any[] }>('/api/admin/cms/media', { query: { type: 'image', perPage: 60, q: q.value || undefined } })
    rows.value = res.rows
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}
function debouncedLoad() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(load, 300)
}
onMounted(load)
</script>

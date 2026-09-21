<template>
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6" data-testid="media-picker" @click.self="$emit('close')">
    <div class="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div class="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
        <div>
          <p class="text-sm font-semibold text-ink">Cambiar imagen</p>
          <p class="text-[11px] text-stone-500">{{ label }}</p>
        </div>
        <div class="flex items-center gap-3">
          <label class="btn-primary cursor-pointer !px-4 !py-2 !text-[11px]">
            {{ uploading ? 'Subiendo…' : 'Subir imagen' }}
            <input type="file" accept="image/*" class="hidden" :disabled="uploading" @change="onUpload" >
          </label>
          <button type="button" class="text-stone-300 hover:text-ink" aria-label="Cerrar selector de imagen" @click="$emit('close')">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <div class="border-b border-line px-5 py-2.5">
        <input v-model="q" class="input" placeholder="Buscar en la biblioteca por nombre de archivo…" @input="debouncedLoad" >
      </div>
      <div class="flex-1 overflow-y-auto p-5">
        <p v-if="error" class="mb-3 text-[12px] text-red-600">{{ error }}</p>
        <p v-if="loading" class="py-10 text-center text-sm text-stone-400">Cargando…</p>
        <p v-else-if="!rows.length" class="py-10 text-center text-sm text-stone-400">Sin imágenes en la biblioteca todavía. Sube una con "Subir imagen".</p>
        <div v-else class="grid grid-cols-3 gap-3 sm:grid-cols-4">
          <button
            v-for="row in rows"
            :key="row.id"
            type="button"
            class="group aspect-square overflow-hidden rounded-lg border border-line bg-stone-50 transition hover:border-ink"
            :title="row.filename"
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
/**
 * "Cambiar imagen" desde el lienzo (doble clic o barra del nodo): subir una
 * nueva o elegir de la Biblioteca de medios, sin pasar por el inspector ni
 * escribir URLs. Usa los mismos endpoints que ImageField —
 * `POST /api/admin/upload` y `GET /api/admin/cms/media` — y devuelve la
 * misma referencia que ese campo guardaría.
 */
defineProps<{ label: string }>()
const emit = defineEmits<{ close: []; select: [key: string] }>()

const rows = ref<any[]>([])
const loading = ref(true)
const uploading = ref(false)
const error = ref('')
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
async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  error.value = ''
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', 'site-builder')
    const res = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
    emit('select', res.key)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'No se pudo subir la imagen'
  } finally {
    uploading.value = false
    input.value = ''
  }
}
onMounted(load)
</script>

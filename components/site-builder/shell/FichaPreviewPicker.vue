<template>
  <div ref="root" class="relative" data-testid="ficha-preview-picker">
    <button
      type="button"
      class="flex max-w-[17rem] items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-[11px] text-stone-600 transition hover:text-ink"
      :aria-expanded="open"
      aria-haspopup="listbox"
      data-testid="ficha-preview-button"
      @click="toggle"
    >
      <span class="shrink-0 font-semibold uppercase tracking-wide text-stone-400">Previsualizar con</span>
      <span class="min-w-0 truncate font-semibold text-ink" data-testid="ficha-preview-current">{{ currentLabel }}</span>
      <svg class="h-3 w-3 shrink-0 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" /></svg>
    </button>
    <div v-if="open" class="absolute left-1/2 top-full z-50 mt-2 w-80 -translate-x-1/2 rounded-xl border border-line bg-white p-2 shadow-xl" data-testid="ficha-preview-panel">
      <input
        ref="searchEl"
        v-model="q"
        type="search"
        class="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-ink"
        placeholder="Buscar por nombre o zona…"
        aria-label="Buscar propiedad"
        data-testid="ficha-preview-search"
      />
      <ul class="mt-2 max-h-72 space-y-0.5 overflow-y-auto" role="listbox" aria-label="Propiedades de tu inmobiliaria">
        <li>
          <button type="button" role="option" :aria-selected="modelValue === null" class="opt" :class="{ 'opt-on': modelValue === null }" data-testid="ficha-preview-option-latest" @click="choose(null)">
            <span class="font-semibold">La más reciente</span>
            <span class="text-stone-400">la de partida</span>
          </button>
        </li>
        <li v-for="p in options" :key="p.id">
          <button type="button" role="option" :aria-selected="modelValue === p.id" class="opt" :class="{ 'opt-on': modelValue === p.id }" :data-testid="`ficha-preview-option-${p.id}`" @click="choose(p)">
            <span class="min-w-0 truncate font-semibold">{{ p.name }}</span>
            <span class="shrink-0 text-stone-400">{{ p.community || statusLabel(p.status) }}</span>
          </button>
        </li>
      </ul>
      <p v-if="loaded && !options.length" class="px-2 py-3 text-center text-[12px] text-stone-400" data-testid="ficha-preview-empty">{{ q ? 'Ninguna propiedad coincide.' : 'Aún no hay propiedades: se enseña una ficha vacía.' }}</p>
      <p class="mt-2 border-t border-line px-2 pt-2 text-[11px] leading-snug text-stone-400">Sólo cambia la propiedad que se enseña aquí: la plantilla es la misma para todas.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * «Previsualizar con: [propiedad]» de la página «Ficha de propiedad»: elige,
 * entre las propiedades de la inmobiliaria activa (el servidor no lista ni
 * sirve otras), con cuál se pinta el lienzo. Es una preferencia de la sesión
 * del editor, no del borrador: cambiarla no cambia la plantilla ni crea
 * cambios pendientes.
 */
interface Option {
  id: number
  name: string
  community: string | null
  status: string
}
const props = defineProps<{ modelValue: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

const root = ref<HTMLElement | null>(null)
const searchEl = ref<HTMLInputElement | null>(null)
const open = ref(false)
const q = ref('')
const options = ref<Option[]>([])
const loaded = ref(false)
// Lo elegido se recuerda con su nombre aunque salga de los 30 resultados de la búsqueda.
const picked = ref<Option | null>(null)

const STATUS: Record<string, string> = { new: 'Nueva', under_construction: 'En construcción', ready: 'Lista' }
const statusLabel = (s: string) => STATUS[s] || s
const currentLabel = computed(() => (props.modelValue === null ? 'La más reciente' : picked.value?.id === props.modelValue ? picked.value.name : 'Propiedad elegida'))

let seq = 0
async function load() {
  const mine = ++seq
  try {
    const query: Record<string, string | number> = {}
    if (q.value.trim()) query.q = q.value.trim()
    if (props.modelValue !== null) query.id = props.modelValue
    const res = await $fetch<{ properties: Option[]; selected: Option | null }>('/api/admin/site-pages/ficha-properties', { query })
    if (mine !== seq) return
    options.value = res.properties
    if (res.selected) picked.value = res.selected
  } catch {
    if (mine === seq) options.value = []
  } finally {
    if (mine === seq) loaded.value = true
  }
}
let timer: ReturnType<typeof setTimeout> | null = null
watch(q, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(load, 220)
})
onBeforeUnmount(() => timer && clearTimeout(timer))

function toggle() {
  open.value = !open.value
  if (open.value) {
    load()
    nextTick(() => searchEl.value?.focus())
  }
}
function choose(p: Option | null) {
  picked.value = p
  open.value = false
  emit('update:modelValue', p ? p.id : null)
}
function onDocClick(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false
}
onMounted(() => {
  document.addEventListener('mousedown', onDocClick)
  document.addEventListener('keydown', onKey)
})
// Una elección recordada de la sesión (el shell la lee tras montarse): se busca su nombre para enseñarlo.
watch(
  () => props.modelValue,
  (id) => {
    if (id !== null && picked.value?.id !== id) load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<style scoped>
.opt {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-radius: 0.5rem;
  padding: 0.4rem 0.6rem;
  text-align: left;
  font-size: 12px;
  color: #1c1b19;
}
.opt:hover {
  background: #f5f3ee;
}
.opt-on {
  background: #f1eee8;
}
</style>

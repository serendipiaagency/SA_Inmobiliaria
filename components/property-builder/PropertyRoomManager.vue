<template>
  <div>
    <p v-if="!parentId" class="text-sm text-stone-400">Guarda la ficha primero para poder añadir estancias.</p>
    <template v-else>
      <p v-if="!rows.length" class="mb-3 text-sm text-stone-400">Todavía no hay estancias personalizadas.</p>

      <div class="space-y-2">
        <div
          v-for="(row, i) in rows"
          :key="row.id"
          class="flex items-start gap-2 rounded-lg border bg-white p-3 transition"
          :class="dragOverIndex === i ? 'border-ink ring-2 ring-ink/30' : 'border-line'"
          draggable="true"
          @dragstart="dragFrom = i"
          @dragover.prevent="dragOverIndex = i"
          @dragleave="dragOverIndex === i && (dragOverIndex = null)"
          @drop="onDrop(i)"
        >
          <span class="mt-2 shrink-0 cursor-grab text-stone-300" title="Arrastrar para reordenar">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.4" /><circle cx="8" cy="12" r="1.4" /><circle cx="8" cy="18" r="1.4" /><circle cx="16" cy="6" r="1.4" /><circle cx="16" cy="12" r="1.4" /><circle cx="16" cy="18" r="1.4" /></svg>
          </span>

          <div class="grid flex-1 grid-cols-2 gap-2.5 sm:grid-cols-3">
            <div>
              <span class="pe-label">Tipo</span>
              <input :value="row.type ?? ''" class="pe-input" aria-label="Tipo de estancia" placeholder="Dormitorio, despacho…" @change="onFieldChange(row, 'type', ($event.target as HTMLInputElement).value)" >
            </div>
            <div>
              <span class="pe-label">Nombre</span>
              <input :value="row.name ?? ''" class="pe-input" aria-label="Nombre de la estancia" placeholder="Dormitorio principal" @change="onFieldChange(row, 'name', ($event.target as HTMLInputElement).value)" >
            </div>
            <div>
              <span class="pe-label">Superficie (m²)</span>
              <input :value="row.area ?? ''" type="number" step="any" class="pe-input" aria-label="Superficie de la estancia" @change="onFieldChange(row, 'area', numOrNull(($event.target as HTMLInputElement).value))" >
            </div>
            <div>
              <span class="pe-label">Planta</span>
              <input :value="row.floor ?? ''" class="pe-input" aria-label="Planta de la estancia" @change="onFieldChange(row, 'floor', ($event.target as HTMLInputElement).value)" >
            </div>
            <div>
              <span class="pe-label">Orientación</span>
              <select :value="row.orientation ?? ''" class="pe-input" aria-label="Orientación de la estancia" @change="onFieldChange(row, 'orientation', ($event.target as HTMLSelectElement).value || null)">
                <option value="">—</option>
                <option v-for="opt in ORIENTATION_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
              </select>
            </div>
            <div class="col-span-2 sm:col-span-3">
              <span class="pe-label">Notas</span>
              <textarea :value="row.notes ?? ''" class="pe-input" rows="2" aria-label="Notas de la estancia" @change="onFieldChange(row, 'notes', ($event.target as HTMLTextAreaElement).value)" />
            </div>
          </div>

          <button type="button" class="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-300 hover:bg-red-50 hover:text-red-600" title="Eliminar" @click="remove(row.id)">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <button type="button" class="pe-btn-quiet mt-3" @click="add">+ Añadir estancia</button>
      <p v-if="error" class="mt-2 text-[11px] font-medium text-red-600">{{ error }}</p>
      <p v-if="rows.length > 1" class="mt-2 text-[11px] text-stone-400">Arrastra una estancia para reordenarla.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Row-list twin of GalleryManager for `'rooms'` sections: same immediate-
 * persist pattern (no tie to the parent form's Guardar), but inline text/
 * number/select fields instead of an image grid — a room has no natural
 * thumbnail. Each field commits on change/blur, not on every keystroke, to
 * avoid a PUT per character.
 */
const props = defineProps<{ childResource: string; parentField: string; parentId: number | null }>()
const { confirm } = useConfirm()
const toast = useToast()

const ORIENTATION_OPTIONS = ['N', 'S', 'E', 'W', 'SE', 'SW', 'NE', 'NW']

const rows = ref<Record<string, any>[]>([])
const error = ref('')

async function load() {
  if (!props.parentId) {
    rows.value = []
    return
  }
  const res = await $fetch<{ rows: any[] }>(`/api/admin/${props.childResource}`, { query: { perPage: 100 } })
  rows.value = res.rows
    .filter((r) => r[props.parentField] === props.parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
}

function numOrNull(v: string) {
  if (v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

async function add() {
  if (!props.parentId) return
  error.value = ''
  try {
    const created = await $fetch<{ id: number }>(`/api/admin/${props.childResource}`, {
      method: 'POST',
      body: { [props.parentField]: props.parentId, sortOrder: rows.value.length },
    })
    rows.value.push({ id: created.id, [props.parentField]: props.parentId, sortOrder: rows.value.length, type: null, name: null, area: null, floor: null, orientation: null, notes: null })
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'No se pudo añadir la estancia'
  }
}

async function onFieldChange(row: Record<string, any>, key: string, value: any) {
  row[key] = value
  try {
    await $fetch(`/api/admin/${props.childResource}/${row.id}`, { method: 'PUT', body: { [key]: value } })
  } catch {
    toast.error('No se pudo guardar el cambio')
  }
}

async function remove(id: number) {
  const ok = await confirm('Esta estancia se eliminará.', { title: '¿Eliminar estancia?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  try {
    await $fetch<{ ok: true }>(`/api/admin/${props.childResource}/${id}`, { method: 'DELETE' })
    rows.value = rows.value.filter((r) => r.id !== id)
  } catch {
    toast.error('No se pudo eliminar la estancia')
  }
}

const dragFrom = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

async function onDrop(to: number) {
  const from = dragFrom.value
  dragFrom.value = null
  dragOverIndex.value = null
  if (from === null || from === to) return

  const [moved] = rows.value.splice(from, 1)
  rows.value.splice(to, 0, moved)

  const updates = rows.value.map((r, i) => ({ r, sortOrder: i })).filter(({ r, sortOrder }) => r.sortOrder !== sortOrder)
  try {
    await Promise.all(
      updates.map(({ r, sortOrder }) => {
        r.sortOrder = sortOrder
        return $fetch(`/api/admin/${props.childResource}/${r.id}`, { method: 'PUT', body: { sortOrder } })
      }),
    )
  } catch {
    toast.error('No se pudo guardar el nuevo orden')
    await load()
  }
}

watch(() => props.parentId, load, { immediate: true })
</script>

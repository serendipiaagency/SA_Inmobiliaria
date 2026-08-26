<template>
  <div class="space-y-3">
    <p v-if="!rows.length" class="rounded-lg border border-dashed border-line bg-stone-50 px-4 py-6 text-center text-sm text-stone-400">
      Sin fases todavía. Añade la primera con el botón de abajo.
    </p>

    <div v-for="(row, i) in rows" :key="row._id" class="flex items-start gap-2 rounded-lg border border-line bg-white p-3" draggable="true" @dragstart="dragFrom = i" @dragover.prevent @drop="onDrop(i)">
      <span class="mt-2.5 shrink-0 cursor-grab text-stone-300 hover:text-stone-500" title="Arrastra para reordenar" aria-hidden="true">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></svg>
      </span>
      <div class="grid flex-1 gap-2 sm:grid-cols-3">
        <label class="block">
          <span class="label">Concepto</span>
          <input v-model="row.label" class="input" placeholder="Ej. Reserva, A la entrega…" @input="emitUpdate" />
        </label>
        <label class="block">
          <span class="label">Importe o %</span>
          <input v-model="row.value" class="input" placeholder="Ej. 10% o 25.000 €" @input="emitUpdate" />
        </label>
        <label class="block">
          <span class="label">Descripción <em class="font-normal normal-case text-stone-400">opcional</em></span>
          <input v-model="row.description" class="input" placeholder="Ej. Al firmar el contrato" @input="emitUpdate" />
        </label>
      </div>
      <button type="button" class="mt-6 shrink-0 text-[12px] font-semibold text-red-600 hover:underline" @click="remove(i)">Eliminar</button>
    </div>

    <button type="button" class="btn-quiet" @click="add">+ Añadir fase</button>
  </div>
</template>

<script setup lang="ts">
interface PlanRow {
  _id: number
  label: string
  value: string
  description: string
}

const props = defineProps<{ modelValue: string | null | undefined }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

let nextId = 0
function normalize(raw: string | null | undefined): PlanRow[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((s: any) => ({
      _id: nextId++,
      label: s.label ?? s.name ?? '',
      value: s.value ?? s.percentage ?? '',
      description: s.description ?? '',
    }))
  } catch {
    return []
  }
}

const rows = ref<PlanRow[]>(normalize(props.modelValue))

// The parent reloads `form` wholesale on mount (see PropertyBuilder.vue) —
// this syncs that one-time load without fighting our own edits afterwards
// (rows.value already matches what we last emitted, so no loop).
watch(
  () => props.modelValue,
  (v) => {
    if (JSON.stringify(rows.value.map(stripId)) !== JSON.stringify(normalize(v).map(stripId))) rows.value = normalize(v)
  },
)

function stripId(r: PlanRow) {
  const { _id, ...rest } = r
  return rest
}

function emitUpdate() {
  emit('update:modelValue', JSON.stringify(rows.value.map(stripId)))
}

function add() {
  rows.value.push({ _id: nextId++, label: '', value: '', description: '' })
  emitUpdate()
}
function remove(i: number) {
  rows.value.splice(i, 1)
  emitUpdate()
}

const dragFrom = ref<number | null>(null)
function onDrop(to: number) {
  if (dragFrom.value === null || dragFrom.value === to) return
  const [moved] = rows.value.splice(dragFrom.value, 1)
  rows.value.splice(to, 0, moved)
  dragFrom.value = null
  emitUpdate()
}
</script>

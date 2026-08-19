<template>
  <div>
    <p v-if="!parentId" class="text-sm text-stone-400">Guarda la ficha primero para poder añadir filas aquí.</p>
    <template v-else>
      <div v-if="rows.length" class="space-y-3">
        <div v-for="row in rows" :key="row.id" class="rounded-lg border border-line p-3">
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <PropertyBuilderField
              v-for="col in columns"
              :key="col.key"
              :spec="col"
              :model-value="row[col.key]"
              :upload-folder="childResource"
              @update:model-value="(v) => updateField(row, col.key, v)"
            />
          </div>
          <div class="mt-2 flex items-center justify-end gap-2">
            <span v-if="rowSaving === row.id" class="text-[11px] text-stone-400">Guardando…</span>
            <button type="button" class="text-[12px] font-semibold text-red-600 hover:underline" @click="remove(row.id)">Eliminar</button>
          </div>
        </div>
      </div>
      <p v-else class="text-sm text-stone-400">Todavía no hay filas.</p>

      <div v-if="newRowOpen" class="mt-3 rounded-lg border border-dashed border-line p-3">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <PropertyBuilderField
            v-for="col in columns"
            :key="col.key"
            :spec="col"
            :model-value="newRow[col.key]"
            :upload-folder="childResource"
            @update:model-value="(v) => (newRow[col.key] = v)"
          />
        </div>
        <p v-if="newRowError" class="mt-2 text-[12px] text-red-500">{{ newRowError }}</p>
        <div class="mt-2 flex items-center gap-2">
          <button type="button" class="inline-flex items-center rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-white transition hover:bg-black" @click="createRow">Añadir</button>
          <button type="button" class="text-[12px] text-stone-500 hover:underline" @click="newRowOpen = false">Cancelar</button>
        </div>
      </div>
      <button v-else type="button" class="mt-3 text-[12px] font-semibold text-ink underline" @click="openNewRow">+ Añadir fila</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { FieldSpec } from '~/composables/usePropertyBuilderConfig'
import PropertyBuilderField from './PropertyBuilderField.vue'

const props = defineProps<{ childResource: string; parentField: string; parentId: number | null; columns: FieldSpec[] }>()
const { confirm } = useConfirm()
const toast = useToast()

const rows = ref<Record<string, any>[]>([])
const rowSaving = ref<number | null>(null)
const newRowOpen = ref(false)
const newRow = reactive<Record<string, any>>({})
const newRowError = ref('')

async function load() {
  if (!props.parentId) {
    rows.value = []
    return
  }
  const res = await $fetch<{ rows: any[] }>(`/api/admin/${props.childResource}`, { query: { perPage: 100 } })
  rows.value = res.rows.filter((r) => r[props.parentField] === props.parentId)
}

function openNewRow() {
  for (const col of props.columns) newRow[col.key] = col.type === 'checkbox' ? false : null
  newRowError.value = ''
  newRowOpen.value = true
}

async function createRow() {
  const missing = props.columns.find((c) => c.required && (newRow[c.key] === null || newRow[c.key] === ''))
  if (missing) {
    newRowError.value = `Falta "${missing.label}"`
    return
  }
  try {
    await $fetch(`/api/admin/${props.childResource}`, { method: 'POST', body: { [props.parentField]: props.parentId, ...newRow } })
    newRowOpen.value = false
    await load()
  } catch (err: any) {
    newRowError.value = err?.data?.statusMessage || err?.statusMessage || 'No se pudo añadir la fila'
  }
}

async function updateField(row: Record<string, any>, key: string, value: any) {
  const previous = row[key]
  row[key] = value
  rowSaving.value = row.id
  try {
    await $fetch(`/api/admin/${props.childResource}/${row.id}`, { method: 'PUT', body: { [key]: value } })
  } catch {
    row[key] = previous
    toast.error('No se pudo guardar el cambio')
  } finally {
    rowSaving.value = null
  }
}

async function remove(id: number) {
  const ok = await confirm('Esta fila se eliminará.', { title: '¿Eliminar esta fila?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  try {
    await $fetch<{ ok: true }>(`/api/admin/${props.childResource}/${id}`, { method: 'DELETE' })
    rows.value = rows.value.filter((r) => r.id !== id)
  } catch {
    toast.error('No se pudo eliminar la fila')
  }
}

watch(() => props.parentId, load, { immediate: true })
</script>

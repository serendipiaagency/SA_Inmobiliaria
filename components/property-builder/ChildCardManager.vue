<template>
  <div>
    <p v-if="!parentId" class="text-sm text-stone-400">Guarda la ficha primero para poder añadir aquí.</p>
    <template v-else>
      <p v-if="!rows.length" class="mb-3 text-sm text-stone-400">Todavía no hay elementos.</p>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <div v-for="row in rows" :key="row.id" class="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-white transition hover:border-ink">
          <div class="relative aspect-[4/3] w-full overflow-hidden bg-stone-50">
            <img v-if="imageField && row[imageField]" :src="mediaUrl(row[imageField])" class="h-full w-full object-cover" loading="lazy" >
            <div v-else class="flex h-full w-full items-center justify-center text-stone-300">
              <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
            </div>
            <div class="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
              <button type="button" class="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink hover:bg-white" @click="openEdit(row)">Editar</button>
              <button type="button" class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600" title="Eliminar" @click="remove(row.id)">
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
          <div class="px-2.5 py-2">
            <p class="truncate text-[13px] font-semibold text-ink">{{ cardTitle(row) }}</p>
            <p v-if="cardSubtitle(row)" class="truncate text-[11px] text-stone-450">{{ cardSubtitle(row) }}</p>
          </div>
        </div>

        <button
          type="button"
          class="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-line text-stone-400 transition hover:border-ink hover:text-ink"
          @click="openCreate"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" /></svg>
          <span class="text-[11px] font-semibold">Añadir</span>
        </button>
      </div>

      <div v-if="editing" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6" @click.self="editing = null">
        <div class="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div class="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
            <p class="text-sm font-semibold text-ink">{{ editing.id ? 'Editar' : 'Añadir' }}</p>
            <button type="button" class="text-stone-300 hover:text-ink" @click="editing = null">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-5">
            <div class="grid grid-cols-2 gap-3">
              <PropertyBuilderField
                v-for="col in columns"
                :key="col.key"
                :spec="col"
                :model-value="editing.draft[col.key]"
                :upload-folder="childResource"
                @update:model-value="(v) => (editing!.draft[col.key] = v)"
              />
            </div>
            <p v-if="editError" class="mt-2 text-[12px] text-red-500">{{ editError }}</p>
          </div>
          <div class="flex shrink-0 items-center justify-between gap-2 border-t border-line px-5 py-3.5">
            <button v-if="editing.id" type="button" class="text-[12px] font-semibold text-red-600 hover:underline" @click="removeFromModal">Eliminar</button>
            <span v-else />
            <div class="flex items-center gap-2">
              <button type="button" class="btn-quiet" @click="editing = null">Cancelar</button>
              <button type="button" class="btn-primary" :disabled="saving" @click="saveEditing">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Visual replacement for the old plain repeatable-rows form (redesign
 * megaprompt) — a card grid like GalleryManager's, image-forward with a
 * compact summary line, edit-in-modal instead of every row's fields shown
 * open at once. Used for any 'child-table' section: floor plans, unit
 * types, agent-property-floor-plans — same generic /api/admin/<childResource>
 * CRUD the old ChildTable used, just a different presentation.
 */
import type { FieldSpec } from '~/composables/usePropertyBuilderConfig'
import PropertyBuilderField from './PropertyBuilderField.vue'

const props = defineProps<{ childResource: string; parentField: string; parentId: number | null; columns: FieldSpec[] }>()
const { confirm } = useConfirm()
const toast = useToast()

const rows = ref<Record<string, any>[]>([])
const imageField = computed(() => props.columns.find((c) => c.type === 'image')?.key ?? null)
const titleField = computed(() => props.columns.find((c) => c.type !== 'image')?.key ?? props.columns[0]?.key)

async function load() {
  if (!props.parentId) {
    rows.value = []
    return
  }
  const res = await $fetch<{ rows: any[] }>(`/api/admin/${props.childResource}`, { query: { perPage: 100 } })
  rows.value = res.rows.filter((r) => r[props.parentField] === props.parentId)
}

function cardTitle(row: Record<string, any>): string {
  const key = titleField.value
  return (key && row[key]) || 'Sin nombre'
}
function cardSubtitle(row: Record<string, any>): string {
  return props.columns
    .filter((c) => c.type !== 'image' && c.key !== titleField.value && row[c.key])
    .map((c) => row[c.key])
    .join(' · ')
}

interface EditState {
  id: number | null
  draft: Record<string, any>
}
const editing = ref<EditState | null>(null)
const editError = ref('')
const saving = ref(false)

function openCreate() {
  const draft: Record<string, any> = {}
  for (const col of props.columns) draft[col.key] = col.type === 'checkbox' ? false : null
  editing.value = { id: null, draft }
  editError.value = ''
}
function openEdit(row: Record<string, any>) {
  editing.value = { id: row.id, draft: { ...row } }
  editError.value = ''
}

async function saveEditing() {
  if (!editing.value) return
  const draft = editing.value.draft
  const missing = props.columns.find((c) => c.required && (draft[c.key] === null || draft[c.key] === ''))
  if (missing) {
    editError.value = `Falta "${missing.label}"`
    return
  }
  saving.value = true
  editError.value = ''
  try {
    if (editing.value.id) {
      await $fetch(`/api/admin/${props.childResource}/${editing.value.id}`, { method: 'PUT', body: draft })
    } else {
      await $fetch(`/api/admin/${props.childResource}`, { method: 'POST', body: { [props.parentField]: props.parentId, ...draft } })
    }
    editing.value = null
    await load()
  } catch (err: any) {
    editError.value = err?.data?.statusMessage || err?.statusMessage || 'No se pudo guardar'
  } finally {
    saving.value = false
  }
}

/** Returns whether the row was actually deleted — false on cancel, so a caller like removeFromModal knows not to also close its own UI. */
async function remove(id: number): Promise<boolean> {
  const ok = await confirm('Este elemento se eliminará.', { title: '¿Eliminar este elemento?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return false
  try {
    await $fetch<{ ok: true }>(`/api/admin/${props.childResource}/${id}`, { method: 'DELETE' })
    rows.value = rows.value.filter((r) => r.id !== id)
    return true
  } catch {
    toast.error('No se pudo eliminar')
    return false
  }
}

async function removeFromModal() {
  if (!editing.value?.id) return
  if (await remove(editing.value.id)) editing.value = null
}

watch(() => props.parentId, load, { immediate: true })
</script>

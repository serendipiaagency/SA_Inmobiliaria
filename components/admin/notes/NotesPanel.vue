<template>
  <div data-testid="notes-panel" :data-entity="`${entityType}-${entityId}`">
    <form v-if="canEdit" class="mb-4" @submit.prevent="add">
      <textarea
        v-model="draft"
        class="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink"
        rows="3"
        placeholder="Escribe una nota interna (sólo la ve tu equipo)…"
        aria-label="Nueva nota"
        data-testid="note-draft"
      />
      <div class="mt-2 flex items-center justify-between gap-2">
        <p class="text-[11px] text-stone-400">Las notas son internas: nunca se envían al cliente ni salen en la web.</p>
        <button type="submit" class="rounded-lg bg-ink px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50" :disabled="!draft.trim() || saving" data-testid="note-add">
          {{ saving ? 'Guardando…' : 'Añadir nota' }}
        </button>
      </div>
    </form>

    <p v-if="loading" class="py-6 text-center text-xs text-stone-400">Cargando notas…</p>
    <p v-else-if="!notes.length" class="rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-stone-500">Todavía no hay notas.</p>
    <ul v-else class="space-y-2">
      <li v-for="n in notes" :key="n.id" class="rounded-xl border border-line bg-white p-3" :class="n.isPinned ? 'border-amber-300 bg-amber-50/40' : ''" data-testid="note-item">
        <div class="mb-1 flex items-center justify-between gap-2 text-[11px] text-stone-400">
          <span>
            <span v-if="n.isPinned" class="mr-1 font-semibold text-amber-700">Fijada ·</span>
            {{ n.authorName || 'Alguien del equipo' }} · {{ formatDateTime(n.createdAt) }}
            <span v-if="n.updatedAt && n.updatedAt !== n.createdAt"> · editada</span>
          </span>
          <span v-if="canEdit" class="flex shrink-0 gap-3">
            <button type="button" class="hover:text-ink" @click="togglePin(n)">{{ n.isPinned ? 'Desfijar' : 'Fijar' }}</button>
            <button type="button" class="hover:text-ink" @click="startEdit(n)">Editar</button>
            <button type="button" class="hover:text-red-600" @click="remove(n)">Eliminar</button>
          </span>
        </div>
        <template v-if="editingId === n.id">
          <textarea v-model="editText" class="w-full rounded-lg border border-line px-3 py-2 text-sm" rows="3" aria-label="Editar nota" />
          <div class="mt-2 flex justify-end gap-2 text-[12px]">
            <button type="button" class="text-stone-500 hover:underline" @click="editingId = null">Cancelar</button>
            <button type="button" class="rounded-lg bg-ink px-3 py-1 font-medium text-white disabled:opacity-50" :disabled="!editText.trim()" @click="saveEdit(n)">Guardar</button>
          </div>
        </template>
        <p v-else class="whitespace-pre-wrap break-words text-sm text-ink">{{ n.body }}</p>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { formatDateTime } from '~/composables/useClientConfig'

/**
 * Notas internas de una entidad (Note, núcleo inmobiliario FASE 0): contacto,
 * lead, propiedad, cita u operación. Usa el recurso genérico `notes`
 * (/api/admin/notes), que valida en el servidor que la entidad exista y sea
 * de esta agencia. Borrar una nota la manda a la papelera.
 */
const props = withDefaults(
  defineProps<{ entityType: 'contact' | 'lead' | 'property' | 'appointment' | 'deal'; entityId: number; propertyKind?: 'agent' | 'developer'; canEdit?: boolean }>(),
  { propertyKind: undefined, canEdit: true },
)
const emit = defineEmits<{ count: [n: number] }>()
const toast = useToast()
const { confirm } = useConfirm()

const notes = ref<any[]>([])
const loading = ref(true)
const draft = ref('')
const saving = ref(false)
const editingId = ref<number | null>(null)
const editText = ref('')

async function load() {
  loading.value = true
  try {
    const query: Record<string, any> = { entityType: props.entityType, entityId: props.entityId, perPage: 100 }
    if (props.propertyKind) query.propertyKind = props.propertyKind
    const res = await $fetch<{ rows: any[] }>('/api/admin/notes', { query })
    notes.value = res.rows
    emit('count', res.rows.length)
  } catch {
    notes.value = []
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => [props.entityType, props.entityId], load)

async function add() {
  if (!draft.value.trim()) return
  saving.value = true
  try {
    await $fetch('/api/admin/notes', { method: 'POST', body: { entityType: props.entityType, entityId: props.entityId, propertyKind: props.propertyKind ?? null, body: draft.value.trim() } })
    draft.value = ''
    await load()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo guardar la nota')
  } finally {
    saving.value = false
  }
}

function startEdit(n: any) {
  editingId.value = n.id
  editText.value = n.body
}

async function saveEdit(n: any) {
  try {
    await $fetch<{ ok: true }>(`/api/admin/notes/${n.id}`, { method: 'PUT', body: { body: editText.value.trim() } })
    editingId.value = null
    await load()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo guardar la nota')
  }
}

async function togglePin(n: any) {
  try {
    await $fetch<{ ok: true }>(`/api/admin/notes/${n.id}`, { method: 'PUT', body: { isPinned: n.isPinned ? 0 : 1 } })
    await load()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo fijar la nota')
  }
}

async function remove(n: any) {
  const ok = await confirm('La nota irá a la papelera.', { title: '¿Eliminar esta nota?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  try {
    await $fetch<{ ok: true }>(`/api/admin/notes/${n.id}`, { method: 'DELETE' })
    await load()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo eliminar la nota')
  }
}
</script>

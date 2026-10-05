<template>
  <AdminCommsModal title="Crear selección" :sub="`Para ${contactName} · ${items.length} ${items.length === 1 ? 'propiedad' : 'propiedades'}`" test-id="match-selection-modal" @close="emit('close')">
    <ul class="mb-3 space-y-1 text-[13px] text-stone-600">
      <li v-for="it in items" :key="`${it.propertyKind}-${it.propertyId}`">· {{ it.name }} <span class="text-[11px] text-stone-400">({{ it.propertyKind === 'developer' ? 'Web' : '2ª mano' }})</span></li>
    </ul>

    <p v-if="loading" class="text-[12px] text-stone-400">Cargando sus selecciones…</p>
    <template v-else>
      <div v-if="existing.length" class="mb-3 space-y-1.5 text-[13px]">
        <label class="flex items-center gap-2">
          <input v-model="mode" type="radio" value="new" > Nueva selección
        </label>
        <label class="flex items-center gap-2">
          <input v-model="mode" type="radio" value="existing" data-testid="match-selection-mode-existing"> Añadir a una selección que ya tiene
        </label>
      </div>

      <template v-if="mode === 'new'">
        <label class="block">
          <span class="mb-1 block text-[12px] font-medium text-stone-600">Título</span>
          <input v-model="title" class="w-full rounded-lg border border-line px-3 py-2 text-sm" maxlength="200" data-testid="match-selection-title">
        </label>
        <label class="mt-3 block">
          <span class="mb-1 block text-[12px] font-medium text-stone-600">Notas (opcional)</span>
          <textarea v-model="notes" rows="2" class="w-full rounded-lg border border-line px-3 py-2 text-sm" maxlength="2000" />
        </label>
      </template>
      <label v-else class="block">
        <span class="mb-1 block text-[12px] font-medium text-stone-600">Selección</span>
        <select v-model="selectionId" class="w-full rounded-lg border border-line px-3 py-2 text-sm" data-testid="match-selection-existing">
          <option v-for="s in existing" :key="s.id" :value="s.id">{{ s.title }} ({{ s.items.length }})</option>
        </select>
      </label>
      <p class="mt-3 text-[11px] text-stone-400">
        La selección queda en la ficha de {{ contactName }} (pestaña «Necesidades» → «Selecciones») y las compatibilidades que estaban sin decidir pasan a «Seleccionado».
      </p>
    </template>
    <p v-if="error" class="mt-3 text-[12px] font-medium text-red-600">{{ error }}</p>

    <template #footer>
      <button type="button" class="text-[13px] text-stone-500 hover:underline" @click="emit('close')">Cancelar</button>
      <button type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="saving || loading || (mode === 'existing' && !selectionId)" data-testid="match-selection-confirm" @click="save">
        {{ saving ? 'Guardando…' : mode === 'new' ? 'Crear selección' : 'Añadir' }}
      </button>
    </template>
  </AdminCommsModal>
</template>

<script setup lang="ts">
import AdminCommsModal from '~/components/admin/comms/Modal.vue'

/**
 * «Crear selección» desde el matching: guarda una selección persistente de
 * propiedades para el contacto de la necesidad (el mismo servicio que la
 * tool `create_property_selection` de INMO), o las añade a una suya que ya
 * existía. POST /api/admin/saas/matching/matches con `action: 'selection'`.
 */
const props = defineProps<{
  requirementId: number
  contactId: number
  contactName: string
  requirementTitle?: string | null
  items: { propertyId: number; propertyKind: 'agent' | 'developer'; name: string }[]
}>()
const emit = defineEmits<{ close: []; saved: [result: { selection: any; added: number; created: boolean }] }>()
const toast = useToast()

const loading = ref(true)
const existing = ref<any[]>([])
const mode = ref<'new' | 'existing'>('new')
const selectionId = ref<number | null>(null)
const title = ref(props.items.length === 1 ? `${props.items[0].name} para ${props.contactName}` : `Selección para ${props.contactName}${props.requirementTitle ? ` — ${props.requirementTitle}` : ''}`)
const notes = ref('')
const saving = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    const res = await $fetch<any>(`/api/admin/saas/contacts/${props.contactId}`)
    existing.value = res?.selections || []
    selectionId.value = existing.value[0]?.id ?? null
  } catch {
    existing.value = []
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  error.value = ''
  try {
    const res = await $fetch<{ selection: any; added: number; created: boolean }>('/api/admin/saas/matching/matches', {
      method: 'POST',
      body: {
        action: 'selection',
        buyerRequirementId: props.requirementId,
        items: props.items.map((i) => ({ propertyId: i.propertyId, propertyKind: i.propertyKind })),
        ...(mode.value === 'existing' ? { selectionId: selectionId.value } : { title: title.value, notes: notes.value || undefined }),
      },
    })
    toast.success(res.created ? `Selección «${res.selection?.title}» creada` : res.added ? `Añadida a «${res.selection?.title}»` : 'Ya estaba en esa selección')
    emit('saved', res)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'No se pudo guardar la selección'
  } finally {
    saving.value = false
  }
}
</script>

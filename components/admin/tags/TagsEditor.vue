<template>
  <div class="flex flex-wrap items-center gap-1.5" data-testid="tags-editor" :data-entity="`${entityType}-${entityId}`">
    <span
      v-for="t in tags"
      :key="t.linkId"
      class="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
      data-testid="tags-editor-chip"
    >
      {{ t.name }}
      <button
        v-if="canEdit"
        type="button"
        class="text-indigo-400 hover:text-red-600"
        :aria-label="`Quitar la etiqueta ${t.name}`"
        :title="`Quitar «${t.name}»`"
        :disabled="busy"
        data-testid="tags-editor-remove"
        @click="remove(t)"
      >
        ×
      </button>
    </span>
    <span v-if="!tags.length && !canEdit" class="text-[11px] text-stone-400">Sin etiquetas</span>

    <form v-if="canEdit" class="inline-flex items-center gap-1" @submit.prevent="add">
      <input
        v-model="draft"
        :list="listId"
        class="w-36 rounded-full border border-line bg-white px-2.5 py-0.5 text-[11px] focus:border-ink"
        placeholder="+ Etiqueta"
        aria-label="Añadir etiqueta"
        maxlength="60"
        data-testid="tags-editor-input"
        @focus="loadCatalog"
      >
      <datalist :id="listId">
        <option v-for="c in suggestions" :key="c.id" :value="c.name" />
      </datalist>
      <button v-if="draft.trim()" type="submit" class="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-50" :disabled="busy" data-testid="tags-editor-add">
        Añadir
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
/**
 * Etiquetas de una ficha (FASE 0, bloque N7b): verlas, añadir (una existente
 * de la agencia o una nueva, por nombre) y quitar. Usa los recursos
 * genéricos `property-tags` (propiedades, área Portal Web) y `crm-tags`
 * (leads y contactos, área CRM); el servidor comprueba que el registro y la
 * etiqueta son de esta agencia. Es el mismo Tag que pone la acción masiva.
 */
const props = withDefaults(defineProps<{ entityType: 'agent' | 'developer' | 'lead' | 'contact'; entityId: number; canEdit?: boolean }>(), { canEdit: true })
const emit = defineEmits<{ changed: [tags: { id: number; name: string }[]] }>()
const toast = useToast()

const resource = computed(() => (props.entityType === 'agent' || props.entityType === 'developer' ? 'property-tags' : 'crm-tags'))
const listId = computed(() => `tags-catalog-${props.entityType}-${props.entityId}`)
const tags = ref<{ id: number; linkId: number; name: string }[]>([])
const catalog = ref<{ id: number; name: string }[]>([])
const catalogLoaded = ref(false)
const draft = ref('')
const busy = ref(false)

const suggestions = computed(() => {
  const mine = new Set(tags.value.map((t) => t.id))
  return catalog.value.filter((c) => !mine.has(c.id))
})

async function load() {
  try {
    const res = await $fetch<{ rows: any[] }>(`/api/admin/${resource.value}`, { query: { entityType: props.entityType, entityId: props.entityId } })
    tags.value = res.rows
  } catch {
    tags.value = []
  }
}
onMounted(load)
watch(() => [props.entityType, props.entityId], load)

async function loadCatalog() {
  if (catalogLoaded.value) return
  catalogLoaded.value = true
  try {
    catalog.value = (await $fetch<{ rows: any[] }>(`/api/admin/${resource.value}`)).rows
  } catch {
    catalog.value = []
  }
}

async function add() {
  const name = draft.value.trim()
  if (!name) return
  busy.value = true
  try {
    const res = await $fetch<{ tags: any[]; tag: { id: number; name: string } }>(`/api/admin/${resource.value}`, {
      method: 'POST',
      body: { entityType: props.entityType, entityId: props.entityId, name },
    })
    tags.value = res.tags
    draft.value = ''
    if (!catalog.value.some((c) => c.id === res.tag.id)) catalog.value.push(res.tag)
    emit('changed', tags.value)
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo añadir la etiqueta')
  } finally {
    busy.value = false
  }
}

async function remove(t: { linkId: number; name: string }) {
  busy.value = true
  try {
    await $fetch(`/api/admin/${resource.value}/${t.linkId}`, { method: 'DELETE' })
    tags.value = tags.value.filter((x) => x.linkId !== t.linkId)
    emit('changed', tags.value)
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo quitar la etiqueta')
  } finally {
    busy.value = false
  }
}
</script>

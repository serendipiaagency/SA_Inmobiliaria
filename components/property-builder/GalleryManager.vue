<template>
  <div>
    <p v-if="!parentId" class="text-sm text-stone-400">Guarda la ficha primero para poder añadir imágenes a la galería.</p>
    <template v-else>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <div v-for="row in rows" :key="row.id" class="group relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-stone-50">
          <img :src="mediaUrl(row.image)" class="h-full w-full object-cover" loading="lazy" />
          <button
            type="button"
            class="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100"
            title="Eliminar"
            @click="remove(row.id)"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <label class="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-line text-stone-400 transition hover:border-ink hover:text-ink">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" /></svg>
          <span class="text-[11px] font-semibold">Añadir imagen</span>
          <input type="file" accept="image/*" class="hidden" @change="add($event)" />
        </label>
      </div>
      <p v-if="uploading" class="mt-2 text-[11px] text-stone-400">Subiendo…</p>
      <p v-if="error" class="mt-2 text-[11px] text-red-500">{{ error }}</p>
      <p class="mt-3 text-[11px] text-stone-400">
        Las imágenes se muestran en el orden en que se añaden — este catálogo todavía no admite reordenarlas a mano.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ childResource: string; parentField: string; parentId: number | null }>()
const { confirm } = useConfirm()
const toast = useToast()

const rows = ref<any[]>([])
const uploading = ref(false)
const error = ref('')

async function load() {
  if (!props.parentId) {
    rows.value = []
    return
  }
  const res = await $fetch<{ rows: any[] }>(`/api/admin/${props.childResource}`, { query: { perPage: 100 } })
  rows.value = res.rows.filter((r) => r[props.parentField] === props.parentId)
}

async function add(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !props.parentId) return
  uploading.value = true
  error.value = ''
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', props.childResource)
    const uploaded = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
    await $fetch(`/api/admin/${props.childResource}`, { method: 'POST', body: { [props.parentField]: props.parentId, image: uploaded.key } })
    await load()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'No se pudo añadir la imagen'
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function remove(id: number) {
  const ok = await confirm('Esta imagen se eliminará de la galería.', { title: '¿Eliminar imagen?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  try {
    await $fetch<{ ok: true }>(`/api/admin/${props.childResource}/${id}`, { method: 'DELETE' })
    rows.value = rows.value.filter((r) => r.id !== id)
  } catch {
    toast.error('No se pudo eliminar la imagen')
  }
}

watch(() => props.parentId, load, { immediate: true })
</script>

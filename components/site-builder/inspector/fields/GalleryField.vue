<template>
  <div class="mb-3">
    <span class="label">{{ label }}</span>
    <p v-if="hint" class="mb-2 text-[11px] text-stone-400">{{ hint }}</p>
    <div class="grid grid-cols-3 gap-2">
      <div
        v-for="(img, i) in modelValue"
        :key="i"
        draggable="true"
        class="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border bg-stone-50"
        :class="dragOver === i ? 'border-dashed border-blue-400' : focused === i ? 'border-ink' : 'border-line'"
        @click="focused = focused === i ? null : i"
        @dragstart="dragFrom = i"
        @dragover.prevent="dragOver = i"
        @dragleave="dragOver === i && (dragOver = null)"
        @drop="onDrop(i)"
      >
        <img :src="mediaUrl(img)" class="h-full w-full object-cover" loading="lazy" />
        <button
          type="button"
          class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100"
          title="Eliminar"
          @click="remove(i)"
        >
          <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <span v-if="i === 0" class="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">Portada</span>
      </div>

      <label class="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line text-stone-400 transition hover:border-ink hover:text-ink">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" /></svg>
        <span class="text-[10px] font-semibold">Añadir</span>
        <input type="file" accept="image/*" class="hidden" @change="onUpload" />
      </label>
    </div>
    <div class="mt-1.5 flex items-center gap-3">
      <button type="button" class="text-[12px] font-semibold text-ink underline" @click="libraryOpen = true">+ Desde biblioteca</button>
      <p v-if="uploading" class="text-[11px] text-stone-400">Subiendo…</p>
    </div>
    <p v-if="error" class="mt-1 text-[11px] text-red-500">{{ error }}</p>
    <div v-if="focused !== null && modelValue[focused]" class="mt-2 flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-[12px] text-stone-600">
      <span class="font-medium text-ink">{{ label }} &gt; Imagen {{ focused + 1 }}</span>
      <button type="button" class="font-semibold text-red-600 underline" @click="remove(focused); focused = null">Eliminar esta imagen</button>
    </div>

    <MediaLibraryModal v-if="libraryOpen" @close="libraryOpen = false" @select="onLibrarySelect" />
  </div>
</template>

<script setup lang="ts">
import MediaLibraryModal from './MediaLibraryModal.vue'

const props = withDefaults(defineProps<{ label: string; modelValue: string[]; hint?: string; folder?: string }>(), { folder: 'site-builder' })
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const uploading = ref(false)
const error = ref('')
const libraryOpen = ref(false)
const dragFrom = ref<number | null>(null)
const dragOver = ref<number | null>(null)
const focused = ref<number | null>(null)

function set(list: string[]) {
  emit('update:modelValue', list)
}
function remove(i: number) {
  set(props.modelValue.filter((_, idx) => idx !== i))
}
function onDrop(i: number) {
  dragOver.value = null
  if (dragFrom.value === null || dragFrom.value === i) return
  const list = [...props.modelValue]
  const [moved] = list.splice(dragFrom.value, 1)
  list.splice(i, 0, moved)
  dragFrom.value = null
  set(list)
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
    fd.append('folder', props.folder)
    const res = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
    set([...props.modelValue, res.key])
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'No se pudo subir la imagen'
  } finally {
    uploading.value = false
    input.value = ''
  }
}
function onLibrarySelect(url: string) {
  set([...props.modelValue, url])
  libraryOpen.value = false
}
</script>

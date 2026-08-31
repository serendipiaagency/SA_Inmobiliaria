<template>
  <div class="mb-3">
    <span class="label">{{ label }}</span>
    <div class="overflow-hidden rounded-lg border border-line bg-stone-50" :class="aspectClass">
      <img v-if="modelValue" :src="mediaUrl(modelValue)" :alt="alt || ''" class="h-full w-full" :class="fit === 'contain' ? 'object-contain' : 'object-cover'" >
      <label v-else class="flex h-full min-h-[6rem] w-full cursor-pointer flex-col items-center justify-center gap-1 text-stone-400 transition hover:text-ink">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" /></svg>
        <span class="text-[11px] font-semibold">+ Añadir imagen</span>
        <input type="file" accept="image/*" class="hidden" @change="onUpload" >
      </label>
    </div>
    <div class="mt-2 flex flex-wrap gap-2">
      <label class="cursor-pointer text-[12px] font-semibold text-ink underline">
        {{ modelValue ? 'Sustituir' : 'Subir imagen' }}
        <input type="file" accept="image/*" class="hidden" @change="onUpload" >
      </label>
      <button type="button" class="text-[12px] font-semibold text-ink underline" @click="libraryOpen = true">Biblioteca</button>
      <button v-if="modelValue" type="button" class="text-[12px] font-semibold text-red-600 underline" @click="$emit('update:modelValue', '')">Eliminar</button>
    </div>
    <p v-if="uploading" class="mt-1 text-[11px] text-stone-400">Subiendo…</p>
    <p v-if="error" class="mt-1 text-[11px] text-red-500">{{ error }}</p>

    <label v-if="showAlt" class="mt-2 block">
      <span class="mb-1 block text-[11px] text-stone-400">Texto alternativo</span>
      <input :value="alt" class="input" placeholder="Describe la imagen…" @input="$emit('update:alt', ($event.target as HTMLInputElement).value)" >
    </label>

    <MediaLibraryModal v-if="libraryOpen" @close="libraryOpen = false" @select="onLibrarySelect" />
  </div>
</template>

<script setup lang="ts">
import MediaLibraryModal from './MediaLibraryModal.vue'

const props = withDefaults(
  defineProps<{
    label: string
    modelValue: string
    alt?: string
    showAlt?: boolean
    folder?: string
    fit?: 'cover' | 'contain'
    aspect?: 'square' | 'video' | 'wide' | 'auto'
  }>(),
  { folder: 'site-builder', fit: 'cover', aspect: 'video', showAlt: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'update:alt': [value: string] }>()

const aspectClass = computed(
  () => ({ square: 'aspect-square', video: 'aspect-video', wide: 'aspect-[21/9]', auto: '' })[props.aspect],
)

const uploading = ref(false)
const error = ref('')
const libraryOpen = ref(false)

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
    emit('update:modelValue', res.key)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'No se pudo subir la imagen'
  } finally {
    uploading.value = false
    input.value = ''
  }
}
function onLibrarySelect(url: string) {
  emit('update:modelValue', url)
  libraryOpen.value = false
}
</script>

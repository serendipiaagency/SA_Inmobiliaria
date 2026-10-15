<template>
  <div class="mb-3" data-testid="image-list-field">
    <span class="label">{{ label }}</span>
    <p v-if="hint" class="mb-2 text-[11px] leading-relaxed text-stone-400">{{ hint }}</p>

    <ul v-if="modelValue.length" class="mb-2 space-y-2">
      <li v-for="(img, i) in modelValue" :key="`${img.src}-${i}`" class="rounded-lg border border-line bg-white p-2" data-testid="image-list-item">
        <div class="flex gap-2">
          <img :src="mediaUrl(img.src)" :alt="img.alt || ''" class="h-16 w-20 shrink-0 rounded-md border border-line bg-stone-50 object-contain" loading="lazy" >
          <div class="min-w-0 flex-1 space-y-1.5">
            <input :value="img.alt" class="input" placeholder="Texto alternativo (describe la imagen)" maxlength="200" :aria-label="`Texto alternativo de la imagen ${i + 1}`" :data-testid="`image-list-alt-${i}`" @input="patch(i, { alt: ($event.target as HTMLInputElement).value })" >
            <input :value="img.caption" class="input" placeholder="Pie de imagen (opcional)" maxlength="240" :aria-label="`Pie de la imagen ${i + 1}`" :data-testid="`image-list-caption-${i}`" @input="patch(i, { caption: ($event.target as HTMLInputElement).value })" >
          </div>
        </div>
        <div class="mt-1.5 flex items-center gap-3 text-[12px] font-semibold">
          <button type="button" class="text-ink underline disabled:cursor-not-allowed disabled:opacity-30 disabled:no-underline" :disabled="i === 0" :aria-label="`Subir la imagen ${i + 1}`" :data-testid="`image-list-up-${i}`" @click="move(i, -1)">Subir</button>
          <button type="button" class="text-ink underline disabled:cursor-not-allowed disabled:opacity-30 disabled:no-underline" :disabled="i === modelValue.length - 1" :aria-label="`Bajar la imagen ${i + 1}`" :data-testid="`image-list-down-${i}`" @click="move(i, 1)">Bajar</button>
          <button type="button" class="ml-auto text-red-600 underline" :aria-label="`Quitar la imagen ${i + 1}`" :data-testid="`image-list-remove-${i}`" @click="remove(i)">Quitar</button>
        </div>
      </li>
    </ul>

    <div v-if="modelValue.length < max" class="flex flex-wrap items-center gap-3">
      <label class="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-line px-3 py-2 text-[12px] font-semibold text-ink transition hover:border-ink">
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" /></svg>
        Subir imagen
        <input type="file" accept="image/*" multiple class="hidden" data-testid="image-list-file" @change="onUpload" >
      </label>
      <button type="button" class="text-[12px] font-semibold text-ink underline" data-testid="image-list-library" @click="libraryOpen = true">Desde la biblioteca</button>
      <span v-if="uploading" class="text-[11px] text-stone-400" role="status">Subiendo…</span>
    </div>
    <p v-else class="text-[11px] text-stone-400">Máximo {{ max }} imágenes: quita alguna para añadir otra.</p>
    <p v-if="error" class="mt-1 text-[11px] text-red-500" role="alert" data-testid="image-list-error">{{ error }}</p>

    <MediaLibraryModal v-if="libraryOpen" @close="libraryOpen = false" @select="onLibrarySelect" />
  </div>
</template>

<script setup lang="ts">
import MediaLibraryModal from './MediaLibraryModal.vue'

/**
 * Lista de imágenes de un bloque, cada una con su texto alternativo y su pie:
 * se suben a la biblioteca de medios de la empresa (/api/admin/upload, como
 * el resto de campos de imagen del Constructor) o se eligen de ella. No
 * guarda imágenes vacías: una imagen existe desde que tiene archivo.
 */
export interface ImageListItem {
  src: string
  alt: string
  caption: string
}

const props = withDefaults(defineProps<{ label: string; modelValue: ImageListItem[]; hint?: string; max?: number; folder?: string }>(), { max: 6, folder: 'site-builder' })
const emit = defineEmits<{ 'update:modelValue': [value: ImageListItem[]] }>()

const uploading = ref(false)
const error = ref('')
const libraryOpen = ref(false)

function set(list: ImageListItem[]) {
  emit('update:modelValue', list.slice(0, props.max))
}
function patch(i: number, change: Partial<ImageListItem>) {
  set(props.modelValue.map((img, idx) => (idx === i ? { ...img, ...change } : img)))
}
function remove(i: number) {
  set(props.modelValue.filter((_, idx) => idx !== i))
}
function move(i: number, by: -1 | 1) {
  const j = i + by
  if (j < 0 || j >= props.modelValue.length) return
  const list = [...props.modelValue]
  ;[list[i], list[j]] = [list[j], list[i]]
  set(list)
}
async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) return
  uploading.value = true
  error.value = ''
  let list = [...props.modelValue]
  try {
    for (const file of files) {
      if (list.length >= props.max) {
        error.value = `Sólo caben ${props.max} imágenes: las demás no se han subido.`
        break
      }
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', props.folder)
      const res = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
      list = [...list, { src: res.key, alt: '', caption: '' }]
    }
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'No se pudo subir la imagen'
  } finally {
    // Lo ya subido se conserva aunque una de las siguientes falle.
    if (list.length !== props.modelValue.length) set(list)
    uploading.value = false
    input.value = ''
  }
}
function onLibrarySelect(url: string) {
  libraryOpen.value = false
  if (props.modelValue.length < props.max) set([...props.modelValue, { src: url, alt: '', caption: '' }])
}
</script>

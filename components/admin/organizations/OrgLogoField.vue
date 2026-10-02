<template>
  <div>
    <span :id="`${uid}-label`" class="label">Logo</span>
    <div
      class="flex flex-col gap-4 rounded-2xl border-2 border-dashed p-4 transition sm:flex-row sm:items-center"
      :class="dragging ? 'border-ink bg-paper' : error ? 'border-red-300 bg-red-50/40' : 'border-line bg-white'"
      data-testid="org-logo-dropzone"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <div class="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-paper">
        <img v-if="previewUrl" :src="previewUrl" alt="Vista previa del logo" class="h-full w-full object-contain" data-testid="org-logo-preview">
        <svg v-else class="h-8 w-8 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.6-4.6a2 2 0 0 1 2.8 0L16 16m-2-2 1.6-1.6a2 2 0 0 1 2.8 0L20 14M14 8h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
        </svg>
      </div>
      <div class="min-w-0 flex-1 text-sm">
        <p v-if="busy" class="font-medium text-ink">Subiendo logo…</p>
        <template v-else-if="previewUrl">
          <p class="truncate font-medium text-ink">{{ fileName || 'Logo actual' }}</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button type="button" class="btn-quiet !px-4 !py-2" :disabled="disabled" data-testid="org-logo-replace" @click="openPicker">Reemplazar</button>
            <button type="button" class="btn-quiet !px-4 !py-2 hover:!border-red-500 hover:!text-red-600" :disabled="disabled" data-testid="org-logo-remove" @click="$emit('remove')">Quitar</button>
          </div>
        </template>
        <template v-else>
          <p class="text-ink">
            Arrastra aquí el logo o
            <button type="button" class="font-semibold underline underline-offset-2 hover:text-black" :disabled="disabled" data-testid="org-logo-pick" @click="openPicker">selecciónalo</button>
          </p>
          <p class="mt-1 text-xs text-stone-500">PNG, JPG o WebP · máximo 2 MB. Mejor con fondo transparente.</p>
        </template>
      </div>
      <input
        ref="input"
        type="file"
        class="sr-only"
        accept="image/png,image/jpeg,image/webp"
        :aria-labelledby="`${uid}-label`"
        :disabled="disabled"
        data-testid="org-logo-input"
        @change="onPick"
      >
    </div>
    <p v-if="error" class="mt-1.5 text-xs font-medium text-red-600" role="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Logo de una empresa: arrastrar y soltar o seleccionar, vista previa,
 * reemplazar y quitar. Sólo valida y avisa — quién sube y cuándo lo decide
 * el padre (el asistente de alta lo guarda en memoria hasta crear la
 * empresa; la ficha lo sube al momento). Los límites coinciden con los del
 * servidor (server/api/admin/upload.post.ts, carpeta `organizations`).
 */
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 2 * 1024 * 1024

defineProps<{ previewUrl: string | null; fileName?: string | null; busy?: boolean; disabled?: boolean; error?: string | null }>()
const emit = defineEmits<{ select: [file: File]; remove: []; invalid: [message: string] }>()

const uid = useId()
const input = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
let depth = 0

function openPicker() {
  input.value?.click()
}

function accept(file: File | undefined | null) {
  if (!file) return
  if (!ACCEPTED.includes(file.type)) return emit('invalid', 'Formato no admitido. Usa PNG, JPG o WebP.')
  if (file.size > MAX_BYTES) return emit('invalid', 'El logo pesa más de 2 MB. Reduce su tamaño e inténtalo de nuevo.')
  emit('select', file)
}

function onPick(e: Event) {
  const el = e.target as HTMLInputElement
  accept(el.files?.[0])
  el.value = '' // poder volver a elegir el mismo fichero tras quitarlo
}

function onDragEnter() {
  depth++
  dragging.value = true
}
function onDragLeave() {
  depth = Math.max(0, depth - 1)
  if (!depth) dragging.value = false
}
function onDrop(e: DragEvent) {
  depth = 0
  dragging.value = false
  accept(e.dataTransfer?.files?.[0])
}
</script>

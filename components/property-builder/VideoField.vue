<template>
  <div class="space-y-3">
    <div class="flex w-fit gap-1 rounded-lg border border-line bg-stone-50 p-0.5">
      <button type="button" class="rounded-md px-3 py-1.5 text-[12px] font-semibold transition" :class="mode === 'url' ? 'bg-white text-ink shadow' : 'text-stone-500'" @click="mode = 'url'">
        URL externa
      </button>
      <button type="button" class="rounded-md px-3 py-1.5 text-[12px] font-semibold transition" :class="mode === 'upload' ? 'bg-white text-ink shadow' : 'text-stone-500'" @click="mode = 'upload'">
        Subir archivo
      </button>
    </div>

    <div v-if="mode === 'url'">
      <input v-model="urlDraft" type="url" class="input" placeholder="YouTube, Vimeo o enlace directo .mp4" @change="applyUrl" >
      <p class="mt-1 text-[11px] text-stone-400">Al guardar una URL se sustituye cualquier vídeo subido anteriormente.</p>
    </div>
    <div v-else>
      <input type="file" accept="video/mp4,video/webm" class="block w-full text-xs text-stone-500" @change="onUpload" >
      <p class="mt-1 text-[11px] text-stone-400">MP4 o WebM, hasta 100&nbsp;MB. Al subir un archivo se sustituye cualquier URL guardada.</p>
      <div v-if="uploading" class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
        <div class="h-full bg-ink transition-all" :style="{ width: uploadProgress + '%' }" />
      </div>
      <p v-if="uploading" class="mt-1 text-[11px] text-stone-400">Subiendo… {{ uploadProgress }}%</p>
      <p v-if="uploadError" class="mt-1 text-[11px] font-medium text-red-600">{{ uploadError }}</p>
    </div>

    <div v-if="modelValue" class="rounded-lg border border-line bg-stone-50 p-3">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{{ isExternalUrl ? 'Fuente activa: URL externa' : 'Fuente activa: archivo subido' }}</span>
        <button type="button" class="text-[12px] font-semibold text-red-600 hover:underline" @click="clear">Eliminar vídeo</button>
      </div>
      <iframe v-if="embedUrl" :src="embedUrl" class="aspect-video w-full rounded" frameborder="0" allow="autoplay; fullscreen" allowfullscreen />
      <video v-else :src="previewSrc" controls class="aspect-video w-full rounded bg-black" />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue: string | null | undefined; uploadFolder: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const isExternalUrl = computed(() => !!props.modelValue && /^https?:\/\//.test(props.modelValue))
const mode = ref<'url' | 'upload'>(isExternalUrl.value || !props.modelValue ? 'url' : 'upload')
const urlDraft = ref(isExternalUrl.value ? props.modelValue || '' : '')

watch(
  () => props.modelValue,
  (v) => {
    if (v && /^https?:\/\//.test(v)) urlDraft.value = v
  },
)

function applyUrl() {
  emit('update:modelValue', urlDraft.value.trim() || null)
}

function clear() {
  urlDraft.value = ''
  emit('update:modelValue', null)
}

const previewSrc = computed(() => (isExternalUrl.value ? props.modelValue || '' : mediaUrl(props.modelValue)))

// YouTube/Vimeo need an <iframe> embed, not a plain <video> tag — anything
// else (a direct .mp4/.webm URL, or an uploaded file's own R2 key) plays
// natively through <video>.
const embedUrl = computed(() => {
  const v = props.modelValue
  if (!v) return null
  const yt = v.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vimeo = v.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  return null
})

const uploading = ref(false)
const uploadProgress = ref(0)
const uploadError = ref('')

interface InitResponse {
  uploadId: string
  key: string
  partMaxBytes: number
}
interface PartResponse {
  partNumber: number
  etag: string
}

// Chunked, direct-to-R2 upload (P1-8) — a single request holding the whole
// file (up to 100MB) in memory is exactly what this replaces. The file is
// sliced client-side into parts (server dictates the size via `init`'s
// partMaxBytes) and PUT one at a time to
// /api/admin/upload/multipart/:uploadId/part, then assembled server-side by
// /complete. Progress is coarser than the old XHR-per-byte version (one
// step per part, not per byte) — a fair trade for a request that no longer
// risks the Worker's own memory limit.
async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  uploadProgress.value = 0
  uploadError.value = ''

  let uploadId: string | null = null
  try {
    const init = await $fetch<InitResponse>('/api/admin/upload/multipart/init', {
      method: 'POST',
      body: { folder: props.uploadFolder, mimeType: file.type, filename: file.name, sizeBytes: file.size },
    })
    uploadId = init.uploadId

    const totalParts = Math.max(1, Math.ceil(file.size / init.partMaxBytes))
    const parts: PartResponse[] = []
    for (let i = 0; i < totalParts; i++) {
      const start = i * init.partMaxBytes
      const chunk = file.slice(start, Math.min(start + init.partMaxBytes, file.size))
      const part = await $fetch<PartResponse>(`/api/admin/upload/multipart/${init.uploadId}/part`, {
        method: 'PUT',
        query: { partNumber: i + 1 },
        body: chunk,
      })
      parts.push(part)
      uploadProgress.value = Math.round(((i + 1) / totalParts) * 100)
    }

    const done = await $fetch<{ key: string; url: string }>(`/api/admin/upload/multipart/${init.uploadId}/complete`, {
      method: 'POST',
      body: { parts },
    })
    mode.value = 'upload'
    emit('update:modelValue', done.key)
  } catch (err: any) {
    uploadError.value = err?.data?.statusMessage || err?.statusMessage || 'No se pudo subir el vídeo — revisa tu conexión.'
    if (uploadId) $fetch(`/api/admin/upload/multipart/${uploadId}/abort`, { method: 'POST' }).catch(() => {})
  } finally {
    uploading.value = false
    input.value = ''
  }
}
</script>

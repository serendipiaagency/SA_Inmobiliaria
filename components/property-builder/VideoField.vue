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
      <input v-model="urlDraft" type="url" class="input" placeholder="YouTube, Vimeo o enlace directo .mp4" @change="applyUrl" />
      <p class="mt-1 text-[11px] text-stone-400">Al guardar una URL se sustituye cualquier vídeo subido anteriormente.</p>
    </div>
    <div v-else>
      <input type="file" accept="video/mp4,video/webm" class="block w-full text-xs text-stone-500" @change="onUpload" />
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

function onUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  uploadProgress.value = 0
  uploadError.value = ''

  const fd = new FormData()
  fd.append('file', file)
  fd.append('folder', props.uploadFolder)
  fd.append('kind', 'video')

  // XMLHttpRequest, not $fetch — it's the one that exposes upload progress
  // events, which a multi-minute 100 MB upload genuinely needs.
  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/admin/upload')
  xhr.upload.onprogress = (ev) => {
    if (ev.lengthComputable) uploadProgress.value = Math.round((ev.loaded / ev.total) * 100)
  }
  xhr.onload = () => {
    uploading.value = false
    input.value = ''
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const res = JSON.parse(xhr.responseText)
        mode.value = 'upload'
        emit('update:modelValue', res.key)
      } catch {
        uploadError.value = 'Respuesta inesperada del servidor.'
      }
    } else {
      try {
        uploadError.value = JSON.parse(xhr.responseText)?.statusMessage || `No se pudo subir el vídeo (${xhr.status})`
      } catch {
        uploadError.value = `No se pudo subir el vídeo (${xhr.status})`
      }
    }
  }
  xhr.onerror = () => {
    uploading.value = false
    input.value = ''
    uploadError.value = 'No se pudo subir el vídeo — revisa tu conexión.'
  }
  xhr.send(fd)
}
</script>

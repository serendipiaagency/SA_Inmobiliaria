<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="$emit('close')">
    <div class="w-full max-w-2xl rounded-2xl bg-white p-6">
      <h3 class="mb-4 font-semibold">Editar imagen</h3>
      <div class="flex justify-center rounded-lg bg-stone-100 p-4">
        <canvas ref="canvasEl" class="max-h-96 max-w-full rounded" />
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button class="btn-secondary !py-1.5" @click="rotate(-90)">↺ Rotar izquierda</button>
        <button class="btn-secondary !py-1.5" @click="rotate(90)">↻ Rotar derecha</button>
        <select v-model="cropRatio" class="input !w-40 !py-1.5" @change="draw">
          <option value="original">Sin recorte</option>
          <option value="1:1">Cuadrado 1:1</option>
          <option value="4:3">4:3</option>
          <option value="16:9">16:9</option>
        </select>
      </div>
      <p class="mt-2 text-[11px] text-stone-450">Rotación y recorte real (procesado en tu navegador) — se sube como una imagen nueva.</p>
      <div class="mt-5 flex justify-end gap-2">
        <button class="btn-secondary" @click="$emit('close')">Cancelar</button>
        <button class="btn-primary" :disabled="saving" @click="save">{{ saving ? 'Guardando…' : 'Guardar como nueva imagen' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ src: string }>()
const emit = defineEmits<{ close: []; saved: [{ key: string; url: string }] }>()
const toast = useToast()

const canvasEl = ref<HTMLCanvasElement | null>(null)
const rotation = ref(0)
const cropRatio = ref('original')
const saving = ref(false)
let img: HTMLImageElement | null = null

onMounted(() => {
  img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = draw
  img.src = props.src
})

function rotate(delta: number) {
  rotation.value = (rotation.value + delta + 360) % 360
  draw()
}

function draw() {
  if (!img || !canvasEl.value) return
  const canvas = canvasEl.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const swapped = rotation.value === 90 || rotation.value === 270
  let sw = swapped ? img.height : img.width
  let sh = swapped ? img.width : img.height

  if (cropRatio.value !== 'original') {
    const [rw, rh] = cropRatio.value.split(':').map(Number)
    const targetRatio = rw / rh
    const currentRatio = sw / sh
    if (currentRatio > targetRatio) sw = sh * targetRatio
    else sh = sw / targetRatio
  }

  canvas.width = sw
  canvas.height = sh
  ctx.save()
  ctx.translate(sw / 2, sh / 2)
  ctx.rotate((rotation.value * Math.PI) / 180)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)
  ctx.restore()
}

async function save() {
  if (!canvasEl.value) return
  saving.value = true
  try {
    const blob: Blob = await new Promise((resolve, reject) =>
      canvasEl.value!.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', 0.92),
    )
    const fd = new FormData()
    fd.append('file', blob, 'edited.webp')
    const res = await $fetch<{ key: string; url: string }>('/api/admin/cms/media', { method: 'POST', body: fd })
    toast.success('Imagen guardada')
    emit('saved', res)
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo procesar la imagen')
  } finally {
    saving.value = false
  }
}
</script>

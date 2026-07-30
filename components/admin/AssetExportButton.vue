<template>
  <div>
    <button type="button" class="btn-primary" @click="open">Crear dossier y creatividades</button>

    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="close">
      <div class="w-full max-w-md rounded-xl bg-white p-5">
        <h3 class="mb-1 text-sm font-semibold">Asset Export Studio</h3>
        <p class="mb-4 text-xs text-stone-500">Genera un PDF real para este activo a partir de una plantilla y el Brand Kit de tu inmobiliaria.</p>

        <div v-if="!templates.length" class="rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs text-stone-500">
          No hay plantillas disponibles todavía.
          <NuxtLink to="/admin/asset-export/templates" class="font-medium text-ink hover:underline">Crear una</NuxtLink>
        </div>

        <template v-else>
          <label class="mb-4 block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Plantilla</span>
            <select v-model="selectedTemplateId" class="cfg-input">
              <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </label>

          <button type="button" class="dash-btn-primary w-full justify-center" :disabled="working" @click="generate">
            {{ working ? statusLabel : 'Generar PDF' }}
          </button>
        </template>

        <p v-if="error" class="mt-3 text-xs font-medium text-red-600">{{ error }}</p>
        <div v-if="downloadUrl" class="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ Listo —
          <a :href="downloadUrl" class="font-medium underline" target="_blank">descargar PDF</a>
        </div>

        <button type="button" class="mt-4 text-sm text-stone-500 hover:underline" @click="close">Cerrar</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ assetId: number }>()

interface Template {
  id: number
  name: string
  formatKey: string
  status: string
}

const show = ref(false)
const templates = ref<Template[]>([])
const selectedTemplateId = ref<number | null>(null)
const working = ref(false)
const statusLabel = ref('Generando…')
const error = ref('')
const downloadUrl = ref('')

const RENDER_READY_FORMATS = ['pdf_a4_portrait', 'pdf_a4_landscape', 'pdf_a5_portrait', 'pdf_dossier', 'print_a3_portrait']

async function open() {
  show.value = true
  error.value = ''
  downloadUrl.value = ''
  const all = await $fetch<Template[]>('/api/admin/asset-export/templates')
  templates.value = all.filter((t) => t.status === 'published' && RENDER_READY_FORMATS.includes(t.formatKey))
  selectedTemplateId.value = templates.value[0]?.id ?? null
}

function close() {
  show.value = false
}

async function generate() {
  if (!selectedTemplateId.value) return
  working.value = true
  error.value = ''
  downloadUrl.value = ''
  try {
    statusLabel.value = 'Creando proyecto…'
    const project = await $fetch<{ id: number }>('/api/admin/asset-export/projects', {
      method: 'POST',
      body: { templateId: selectedTemplateId.value, assetKind: 'developer_property', assetId: props.assetId },
    })
    statusLabel.value = 'Renderizando PDF…'
    const render = await $fetch<{ downloadUrl: string }>(`/api/admin/asset-export/projects/${project.id}/render`, { method: 'POST' })
    downloadUrl.value = render.downloadUrl
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'Error al generar el PDF'
  } finally {
    working.value = false
  }
}
</script>

<style scoped>
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50;
}
</style>

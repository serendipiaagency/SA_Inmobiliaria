<template>
  <div>
    <button type="button" :class="variant === 'quiet' ? 'pe-btn-quiet' : 'btn-primary'" @click="open">{{ variant === 'quiet' ? 'Dossier y creatividades' : 'Crear dossier y creatividades' }}</button>

    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="close">
      <div class="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <!-- Cabecera -->
        <div class="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h3 class="text-sm font-semibold">Dossier y creatividades</h3>
            <p class="text-xs text-stone-500">Genera documentos y carteles reales de esta propiedad a partir de tus plantillas y tu Brand Kit.</p>
          </div>
          <button type="button" class="text-sm text-stone-500 hover:underline" @click="close">Cerrar</button>
        </div>

        <!-- Pestañas -->
        <div class="flex gap-1 border-b border-line px-5">
          <button v-for="t in TABS" :key="t.key" type="button" class="-mb-px border-b-2 px-4 py-2 text-sm font-medium transition" :class="tab === t.key ? 'border-ink text-ink' : 'border-transparent text-stone-500 hover:text-ink'" :data-testid="`dossier-tab-${t.key}`" @click="tab = t.key">{{ t.label }}</button>
        </div>

        <!-- Cuerpo: galería de plantillas (izq) + vista previa (der) -->
        <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5 lg:flex-row">
          <!-- Galería -->
          <div class="lg:w-1/2">
            <p class="mb-2 text-[12px] font-medium text-stone-600">{{ tab === 'export' ? 'Plantillas de exportación' : 'Plantillas de cartel' }}</p>
            <div v-if="loading" class="py-8 text-center text-sm text-stone-400">Cargando plantillas…</div>
            <div v-else-if="!current.templates.length" class="rounded-lg border border-dashed border-line px-4 py-8 text-center text-xs text-stone-500">
              No hay plantillas publicadas todavía.
              <NuxtLink to="/admin/plantillas" class="font-medium text-ink hover:underline">Crear una</NuxtLink>
            </div>
            <div v-else class="grid max-h-[55vh] gap-2 overflow-auto pr-1 sm:grid-cols-2">
              <button
                v-for="t in current.templates"
                :key="t.id"
                type="button"
                class="flex items-start gap-2 rounded-lg border p-2 text-left transition"
                :class="current.selectedId === t.id ? 'border-ink ring-1 ring-ink' : 'border-line hover:bg-stone-50'"
                :data-testid="`dossier-template-${tab}-${t.id}`"
                @click="current.selectedId = t.id"
              >
                <AdminTemplateDesignPreview :structure="t.structure" :format-key="t.formatKey" :width="64" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[13px] font-medium text-ink">{{ t.name }}</span>
                  <span class="block text-[11px] text-stone-500">{{ t.formatLabel }}</span>
                </span>
              </button>
            </div>
          </div>

          <!-- Vista previa -->
          <div class="lg:w-1/2">
            <p class="mb-2 text-[12px] font-medium text-stone-600">Vista previa</p>
            <div class="flex min-h-[200px] items-center justify-center rounded-lg bg-stone-100 p-4">
              <AdminTemplateDesignPreview v-if="selectedTemplate" :structure="selectedTemplate.structure" :format-key="selectedTemplate.formatKey" :width="240" />
              <p v-else class="text-xs text-stone-400">Elige una plantilla para ver su diseño.</p>
            </div>
            <p class="mt-2 text-[11px] text-stone-400">
              La miniatura muestra la maqueta de la plantilla. Al descargar se genera el {{ tab === 'export' ? 'PDF' : 'cartel' }} real con los datos de esta propiedad y tu Brand Kit.
            </p>
          </div>
        </div>

        <!-- Acciones -->
        <div class="border-t border-line px-5 py-3">
          <p v-if="error" class="mb-2 text-xs font-medium text-red-600">{{ error }}</p>
          <div v-if="downloadUrl" class="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            ✓ Listo — <a :href="downloadUrl" class="font-medium underline" target="_blank">descargar de nuevo</a>
          </div>
          <div class="flex items-center justify-end gap-3">
            <button type="button" class="dash-btn-primary" :disabled="!selectedTemplate || working" :data-testid="`dossier-download-${tab}`" @click="generate">
              {{ working ? statusLabel : tab === 'export' ? 'Descargar PDF' : 'Descargar cartel' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  assetId: number
  propertyType?: string | null
  /** Catálogo de la propiedad: obra nueva o 2ª mano. */
  assetKind?: 'developer_property' | 'agent_property'
  /** 'quiet' lo integra en la cabecera del Property Editor, donde el CTA principal es Guardar. */
  variant?: 'primary' | 'quiet'
}>()

const assetKind = computed(() => props.assetKind || 'developer_property')

interface TemplateRow {
  id: number
  name: string
  formatKey: string
  formatLabel: string
  // Estructura de la plantilla: JSON (export) u objeto (cartel); la miniatura acepta ambos.
  structure: any
}
interface TabState {
  templates: TemplateRow[]
  selectedId: number | null
}

const FORMAT_LABELS: Record<string, string> = {
  pdf_a4_portrait: 'PDF A4 vertical',
  pdf_a4_landscape: 'PDF A4 horizontal',
  pdf_a5_portrait: 'PDF A5 vertical',
  pdf_dossier: 'Dossier multipágina',
  print_a3_portrait: 'Cartel A3 vertical',
  print_a3_landscape: 'Cartel A3 horizontal',
}
const RENDER_READY_FORMATS = ['pdf_a4_portrait', 'pdf_a4_landscape', 'pdf_a5_portrait', 'pdf_dossier', 'print_a3_portrait', 'print_a3_landscape']

const TABS = [
  { key: 'export' as const, label: 'Export' },
  { key: 'cartel' as const, label: 'Cartel' },
]
const show = ref(false)
const tab = ref<'export' | 'cartel'>('export')
const loading = ref(false)
const working = ref(false)
const statusLabel = ref('Generando…')
const error = ref('')
const downloadUrl = ref('')

const exportState = reactive<TabState>({ templates: [], selectedId: null })
const cartelState = reactive<TabState>({ templates: [], selectedId: null })
const current = computed(() => (tab.value === 'export' ? exportState : cartelState))
const selectedTemplate = computed(() => current.value.templates.find((t) => t.id === current.value.selectedId) || null)

// Al cambiar de pestaña se limpia el resultado anterior, pero NO la selección
// de cada pestaña (cada una conserva la suya durante la sesión).
watch(tab, () => {
  error.value = ''
  downloadUrl.value = ''
})

async function open() {
  show.value = true
  error.value = ''
  downloadUrl.value = ''
  loading.value = true
  try {
    const [exp, car] = await Promise.all([
      $fetch<any[]>('/api/admin/asset-export/templates'),
      $fetch<{ items: any[] }>('/api/admin/carteles/templates'),
    ])
    exportState.templates = exp
      .filter((t) => t.status === 'published' && RENDER_READY_FORMATS.includes(t.formatKey))
      .map((t) => ({ id: t.id, name: t.name, formatKey: t.formatKey, formatLabel: FORMAT_LABELS[t.formatKey] || t.formatKey, structure: t.structureJson }))
    cartelState.templates = (car.items || [])
      .filter((t) => t.status === 'published')
      .map((t) => ({ id: t.id, name: t.name, formatKey: t.formatKey, formatLabel: FORMAT_LABELS[t.formatKey] || t.formatKey, structure: t.structure }))
    if (!exportState.selectedId) exportState.selectedId = exportState.templates[0]?.id ?? null
    if (!cartelState.selectedId) cartelState.selectedId = cartelState.templates[0]?.id ?? null
  } catch {
    error.value = 'No se pudieron cargar las plantillas.'
  } finally {
    loading.value = false
  }
}
function close() {
  show.value = false
}

async function generate() {
  if (!selectedTemplate.value) return
  working.value = true
  error.value = ''
  downloadUrl.value = ''
  const base = tab.value === 'export' ? '/api/admin/asset-export' : '/api/admin/carteles'
  try {
    statusLabel.value = 'Creando…'
    const project = await $fetch<{ id: number }>(`${base}/projects`, {
      method: 'POST',
      body: { templateId: selectedTemplate.value.id, assetKind: assetKind.value, assetId: props.assetId },
    })
    statusLabel.value = tab.value === 'export' ? 'Renderizando PDF…' : 'Generando cartel…'
    const render = await $fetch<{ downloadUrl: string }>(`${base}/projects/${project.id}/render`, { method: 'POST' })
    downloadUrl.value = render.downloadUrl
    // Descarga automática.
    const a = document.createElement('a')
    a.href = render.downloadUrl
    a.setAttribute('download', '')
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'No se pudo generar el documento.'
  } finally {
    working.value = false
  }
}
</script>

<style scoped>
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50;
}
</style>

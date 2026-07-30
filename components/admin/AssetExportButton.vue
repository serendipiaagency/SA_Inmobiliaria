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
          <label class="mb-2 block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Plantilla</span>
            <select v-model="selectedTemplateId" class="cfg-input">
              <option v-for="t in sortedTemplates" :key="t.id" :value="t.id">
                {{ t.name }}{{ t.assetTypeScope === category ? ' (recomendada)' : '' }}
              </option>
            </select>
          </label>
          <p class="mb-4 text-[11px] text-stone-400">
            Para {{ categoryLabel }}, los campos habituales son: {{ preferredFields.join(', ') }}.
          </p>

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
const props = defineProps<{ assetId: number; propertyType?: string | null }>()

interface Template {
  id: number
  name: string
  formatKey: string
  status: string
  assetTypeScope: string | null
}

// Mirrors server/utils/assetExport/presentationSchema.ts (Asset Presentation
// Schema, Fase 7) — duplicated here because server/ code isn't available in
// the client bundle. Keep the two in sync if the field lists change.
const CATEGORY_KEYWORDS: Array<[string, RegExp]> = [
  ['vivienda', /apartment|villa|townhouse|penthouse|studio|piso|casa|chalet|d[uú]plex|[aá]tico/i],
  ['terreno', /terreno|solar|parcela|finca|plot|land/i],
  ['nave', /nave|industrial|almac[eé]n|warehouse/i],
  ['local', /local|oficina|office|comercial|retail/i],
  ['garaje', /garaje|trastero|parking|garage/i],
  ['promocion', /promoci[oó]n|development|obra nueva/i],
]
const PREFERRED_FIELDS: Record<string, string[]> = {
  vivienda: ['habitaciones', 'baños', 'superficie', 'terraza', 'garaje', 'piscina'],
  promocion: ['superficie', 'precio desde', 'entrega estimada', 'zona'],
  generic: ['superficie', 'precio', 'zona', 'descripción'],
}
const CATEGORY_LABELS: Record<string, string> = {
  vivienda: 'vivienda', terreno: 'terreno', local: 'local comercial', nave: 'nave industrial', garaje: 'garaje/trastero', promocion: 'promoción', generic: 'este activo',
}

const category = computed(() => {
  if (!props.propertyType) return 'generic'
  for (const [cat, pattern] of CATEGORY_KEYWORDS) if (pattern.test(props.propertyType)) return cat
  return 'generic'
})
const categoryLabel = computed(() => CATEGORY_LABELS[category.value] || 'este activo')
const preferredFields = computed(() => PREFERRED_FIELDS[category.value] || PREFERRED_FIELDS.generic)

const show = ref(false)
const templates = ref<Template[]>([])
const selectedTemplateId = ref<number | null>(null)
const working = ref(false)
const statusLabel = ref('Generando…')
const error = ref('')
const downloadUrl = ref('')

const RENDER_READY_FORMATS = ['pdf_a4_portrait', 'pdf_a4_landscape', 'pdf_a5_portrait', 'pdf_dossier', 'print_a3_portrait']

// Templates scoped to this asset's category (or universal ones, scope
// null) come first — a real ranking, not just a hint, so the recommended
// option is also the pre-selected default.
const sortedTemplates = computed(() =>
  [...templates.value].sort((a, b) => {
    const scoreOf = (t: Template) => (t.assetTypeScope === category.value ? 0 : t.assetTypeScope == null ? 1 : 2)
    return scoreOf(a) - scoreOf(b)
  }),
)

async function open() {
  show.value = true
  error.value = ''
  downloadUrl.value = ''
  const all = await $fetch<Template[]>('/api/admin/asset-export/templates')
  templates.value = all.filter((t) => t.status === 'published' && RENDER_READY_FORMATS.includes(t.formatKey))
  selectedTemplateId.value = sortedTemplates.value[0]?.id ?? null
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

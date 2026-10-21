<template>
  <div class="max-w-5xl" data-testid="poster-projects">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Carteles</h1>
        <p class="mt-1 max-w-2xl text-sm text-stone-500">
          Un cartel es una plantilla aplicada a una propiedad. Elige la plantilla y la propiedad, y exporta el PDF listo para imprimir o para el escaparate.
        </p>
      </div>
      <button type="button" class="dash-btn-primary" data-testid="poster-new" @click="openCreate">Nuevo cartel</button>
    </div>

    <AdminPanel>
      <div v-if="pending && !data" class="py-10 text-center text-sm text-stone-400">Cargando…</div>
      <div v-else-if="!projects.length" class="py-10 text-center text-sm text-stone-500" data-testid="poster-projects-empty">
        Aún no hay carteles. Crea el primero con «Nuevo cartel».
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-line text-left text-[11px] uppercase tracking-wide text-stone-500">
              <th class="py-2 pr-3 font-semibold">Nombre</th>
              <th class="py-2 pr-3 font-semibold">Formato</th>
              <th class="py-2 pr-3 font-semibold">Estado</th>
              <th class="py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in projects" :key="p.id" class="border-b border-line last:border-0" :data-testid="`poster-project-${p.id}`">
              <td class="py-2.5 pr-3 font-medium">{{ p.name }}</td>
              <td class="py-2.5 pr-3 text-stone-500">{{ p.formatKey }}</td>
              <td class="py-2.5 pr-3 text-stone-500">{{ p.status === 'ready' ? 'Exportado' : 'Borrador' }}</td>
              <td class="py-2.5 text-right">
                <button type="button" class="text-xs font-medium text-ink hover:underline" :data-testid="`poster-edit-${p.id}`" @click="openEditor(p)">Editar diseño</button>
                <button type="button" class="ml-3 text-xs font-medium text-ink hover:underline disabled:opacity-40" :disabled="rendering === p.id" :data-testid="`poster-export-${p.id}`" @click="exportPdf(p)">{{ rendering === p.id ? 'Generando…' : 'Exportar PDF' }}</button>
                <button type="button" class="ml-3 text-xs font-medium text-rose-600 hover:underline" @click="remove(p)">Eliminar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>

    <!-- Descarga lista -->
    <a ref="dl" class="hidden" />

    <!-- Crear cartel -->
    <AdminCommsModal v-if="creating && !picking" title="Nuevo cartel" test-id="poster-create-modal" @close="creating = false">
      <div class="space-y-4">
        <div>
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Plantilla</span>
          <select v-model="form.templateId" class="cfg-input" data-testid="poster-create-template">
            <option :value="0" disabled>Elige una plantilla…</option>
            <option v-for="t in publishedTemplates" :key="t.id" :value="t.id">{{ t.name }} · {{ t.formatKey }}</option>
          </select>
          <p v-if="!publishedTemplates.length" class="mt-1 text-xs text-amber-600">No hay plantillas publicadas. Publica una en «Plantillas de cartel» (o duplica una de muestra y publícala).</p>
        </div>
        <div>
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Propiedad</span>
          <div class="flex items-center gap-3">
            <button type="button" class="dash-btn-secondary" data-testid="poster-pick-property" @click="picking = true">{{ selected ? 'Cambiar propiedad' : 'Elegir propiedad' }}</button>
            <span v-if="selected" class="text-sm text-stone-600" data-testid="poster-selected-property">{{ selected.name }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <button type="button" class="dash-btn-secondary" @click="creating = false">Cancelar</button>
        <button type="button" class="dash-btn-primary" :disabled="!canCreate || saving" data-testid="poster-create-confirm" @click="create">{{ saving ? 'Creando…' : 'Crear cartel' }}</button>
      </template>
    </AdminCommsModal>

    <AdminCommsPropertyPickerModal v-if="picking" title="Elegir propiedad del cartel" @close="picking = false" @pick="onPick" />

    <!-- Editor visual del diseño del cartel -->
    <AdminCommsModal v-if="editing" :title="`Diseño · ${editing.name}`" wide test-id="poster-editor" @close="editing = null">
      <AdminAssetExportCanvasEditor v-if="editStructure" :structure="editStructure" :format-key="editing.formatKey" />
      <template #footer>
        <button type="button" class="dash-btn-secondary" @click="editing = null">Cerrar</button>
        <button type="button" class="dash-btn-primary" :disabled="savingDesign" data-testid="poster-save-design" @click="saveDesign">{{ savingDesign ? 'Guardando…' : 'Guardar diseño' }}</button>
      </template>
    </AdminCommsModal>
  </div>
</template>

<script setup lang="ts">
/**
 * Carteles de escaparate → Carteles (Cola 20). Lista las piezas y permite
 * crear una nueva: una plantilla publicada aplicada a una propiedad (obra
 * nueva o 2ª mano, elegida con el buscador reutilizable), y exportarla a PDF
 * (se genera en el servidor, se guarda en R2 y se descarga). Permiso: Portal
 * Web. El diseño visual de cada cartel se ajusta en un paso posterior.
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Carteles' })

interface PosterProject { id: number; name: string; formatKey: string; status: string; assetKind: string; assetId: number }
interface PosterTemplate { id: number; name: string; formatKey: string; status: string }

const toast = useToast()
const { confirm } = useConfirm()

const { data, pending, refresh } = await useFetch<{ items: PosterProject[] }>('/api/admin/carteles/projects')
const projects = computed(() => data.value?.items || [])

const { data: templatesData } = await useFetch<{ items: PosterTemplate[] }>('/api/admin/carteles/templates')
const publishedTemplates = computed(() => (templatesData.value?.items || []).filter((t) => t.status === 'published'))

const creating = ref(false)
const picking = ref(false)
const saving = ref(false)
const rendering = ref<number | null>(null)
const selected = ref<{ kind: string; id: number; name: string } | null>(null)
const form = reactive({ templateId: 0 })
const canCreate = computed(() => form.templateId > 0 && !!selected.value)
const dl = ref<HTMLAnchorElement | null>(null)

function openCreate() {
  form.templateId = publishedTemplates.value[0]?.id || 0
  selected.value = null
  creating.value = true
}
function onPick(property: any) {
  selected.value = { kind: property.kind, id: property.id, name: property.name || `#${property.id}` }
  picking.value = false
}
async function create() {
  if (!canCreate.value || !selected.value) return
  saving.value = true
  try {
    const assetKind = selected.value.kind === 'developer' ? 'developer_property' : 'agent_property'
    await $fetch('/api/admin/carteles/projects', { method: 'POST', body: { templateId: form.templateId, assetKind, assetId: selected.value.id } })
    toast.success('Cartel creado')
    creating.value = false
    await refresh()
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || err?.statusMessage || 'No se pudo crear')
  } finally {
    saving.value = false
  }
}

async function exportPdf(p: PosterProject) {
  rendering.value = p.id
  try {
    const res = await $fetch<{ downloadUrl: string }>(`/api/admin/carteles/projects/${p.id}/render`, { method: 'POST' })
    toast.success('PDF generado')
    await refresh()
    if (dl.value) {
      dl.value.href = res.downloadUrl
      dl.value.setAttribute('download', '')
      dl.value.click()
    }
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || err?.statusMessage || 'No se pudo generar el PDF')
  } finally {
    rendering.value = null
  }
}

// --- Editor del diseño ---------------------------------------------------
const editing = ref<{ id: number; name: string; formatKey: string } | null>(null)
const editStructure = ref<any>(null)
const savingDesign = ref(false)
async function openEditor(p: PosterProject) {
  try {
    const full = await $fetch<any>(`/api/admin/carteles/projects/${p.id}`)
    editStructure.value = full.structure
    editing.value = { id: p.id, name: p.name, formatKey: p.formatKey }
  } catch {
    toast.error('No se pudo abrir el diseño')
  }
}
async function saveDesign() {
  if (!editing.value) return
  savingDesign.value = true
  try {
    await $fetch(`/api/admin/carteles/projects/${editing.value.id}`, { method: 'PATCH', body: { structure: editStructure.value } })
    toast.success('Diseño guardado')
    editing.value = null
    await refresh()
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || err?.statusMessage || 'No se pudo guardar el diseño')
  } finally {
    savingDesign.value = false
  }
}

async function remove(p: PosterProject) {
  if (!(await confirm(`Se borrará el cartel «${p.name}».`, { title: '¿Eliminar cartel?', confirmLabel: 'Eliminar', danger: true }))) return
  try {
    await $fetch(`/api/admin/carteles/projects/${p.id}`, { method: 'DELETE' })
    toast.success('Cartel eliminado')
    await refresh()
  } catch {
    toast.error('No se pudo eliminar')
  }
}
</script>

<style scoped>
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50;
}
.dash-btn-secondary {
  @apply inline-flex items-center rounded-lg border border-line bg-white px-4 py-2 text-[13px] font-medium text-ink transition hover:bg-stone-50 disabled:opacity-50;
}
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-ink;
}
</style>

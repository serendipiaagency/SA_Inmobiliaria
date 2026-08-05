<template>
  <div class="max-w-5xl">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Piezas generadas</h1>
      <p class="mt-1 text-sm text-stone-500">Historial de dossiers y creatividades exportadas, con versionado y aviso de precio desactualizado.</p>
    </div>

    <div v-if="!projects.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
      Todavía no se ha generado ninguna pieza. Usa "Crear dossier y creatividades" desde la ficha de un activo.
    </div>

    <div v-else class="space-y-3">
      <AdminPanel v-for="p in projects" :key="p.id">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-semibold">{{ p.name }}</p>
            <div class="mt-1.5 flex flex-wrap items-center gap-2">
              <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass(p.status)">{{ statusLabel(p.status) }}</span>
              <span v-if="p.priceChanged" class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                ⚠ El precio ha cambiado desde que se generó
              </span>
            </div>
            <p class="mt-1 text-xs text-stone-400">Actualizado {{ formatDate(p.updatedAt) }}</p>
          </div>
          <div class="flex flex-col items-end gap-2">
            <select class="rounded-lg border border-line px-2 py-1 text-xs" :value="p.status" @change="setStatus(p, ($event.target as HTMLSelectElement).value)">
              <option v-for="s in STATUSES" :key="s" :value="s">{{ statusLabel(s) }}</option>
            </select>
            <div class="flex gap-3">
              <button v-if="p.priceChanged" type="button" class="text-xs font-medium text-ink hover:underline" @click="refreshPrice(p)">Actualizar precio y volver a generar</button>
              <button type="button" class="text-xs font-medium text-ink hover:underline" @click="openEditor(p)">Editar visualmente</button>
              <button type="button" class="text-xs font-medium text-ink hover:underline" @click="render(p)">{{ rendering === p.id ? 'Generando…' : 'Generar PDF' }}</button>
              <button type="button" class="text-xs font-medium text-ink hover:underline" @click="toggleVersions(p)">
                {{ expanded === p.id ? 'Ocultar historial' : 'Ver historial' }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="expanded === p.id" class="mt-3 border-t border-line pt-3">
          <ul v-if="versions[p.id]?.length" class="divide-y divide-line text-sm">
            <li v-for="v in versions[p.id]" :key="v.id" class="flex items-center justify-between py-2">
              <span class="text-stone-600">{{ formatDate(v.createdAt) }} — {{ statusLabel(v.status) }}</span>
              <button type="button" class="text-xs font-medium text-ink hover:underline" @click="restore(p, v.id)">Restaurar</button>
            </li>
          </ul>
          <p v-else class="text-xs text-stone-400">Sin versiones todavía.</p>
        </div>
      </AdminPanel>
    </div>

    <div v-if="editing" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="editing = null">
      <div class="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-5">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold">Editar — {{ editing.name }}</h3>
        </div>

        <AdminAssetExportCanvasEditor v-if="editingStructure" :structure="editingStructure" :format-key="editing.formatKey" />

        <p v-if="editError" class="mt-2 text-xs font-medium text-red-600">{{ editError }}</p>
        <div class="mt-3 flex gap-3">
          <button type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50" :disabled="saving" @click="saveStructure">
            {{ saving ? 'Guardando…' : 'Guardar' }}
          </button>
          <button type="button" class="text-sm text-stone-500 hover:underline" @click="editing = null">Cerrar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Piezas generadas — Asset Export Studio' })

interface Project {
  id: number
  name: string
  status: string
  updatedAt: string
  priceChanged: boolean
  formatKey: string
  structureJson: string
}
interface TemplateStructure {
  pages: Array<{ id: string; elements: any[] }>
}
interface ProjectVersion {
  id: number
  status: string
  createdAt: string
}

const STATUSES = ['draft', 'in_review', 'changes_requested', 'approved', 'exported', 'archived']
const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', in_review: 'Pendiente de revisión', changes_requested: 'Cambios solicitados', approved: 'Aprobado', exported: 'Exportado', archived: 'Archivado',
}
function statusLabel(s: string) {
  return STATUS_LABELS[s] || s
}
function statusClass(s: string) {
  return (
    {
      draft: 'bg-stone-100 text-stone-600',
      in_review: 'bg-sky-100 text-sky-700',
      changes_requested: 'bg-orange-100 text-orange-700',
      approved: 'bg-emerald-100 text-emerald-700',
      exported: 'bg-violet-100 text-violet-700',
      archived: 'bg-stone-200 text-stone-500',
    }[s] || 'bg-stone-100 text-stone-600'
  )
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
}

const { data, refresh } = await useFetch<Project[]>('/api/admin/asset-export/projects')
const projects = computed(() => data.value || [])

async function setStatus(p: Project, status: string) {
  await $fetch(`/api/admin/asset-export/projects/${p.id}`, { method: 'PUT', body: { status } })
  await refresh()
}

async function refreshPrice(p: Project) {
  await $fetch(`/api/admin/asset-export/projects/${p.id}`, { method: 'PUT', body: { refreshPriceSnapshot: true } })
  await $fetch(`/api/admin/asset-export/projects/${p.id}/render`, { method: 'POST' })
  await refresh()
}

const rendering = ref<number | null>(null)
async function render(p: Project) {
  rendering.value = p.id
  try {
    await $fetch(`/api/admin/asset-export/projects/${p.id}/render`, { method: 'POST' })
    await refresh()
  } catch (err: any) {
    alert(err?.data?.statusMessage || err?.statusMessage || 'Error al generar el PDF')
  } finally {
    rendering.value = null
  }
}

const editing = ref<Project | null>(null)
const editingStructure = ref<TemplateStructure | null>(null)
const editError = ref('')
const saving = ref(false)

function openEditor(p: Project) {
  editing.value = p
  editingStructure.value = JSON.parse(p.structureJson)
  editError.value = ''
}

async function saveStructure() {
  if (!editing.value || !editingStructure.value) return
  saving.value = true
  editError.value = ''
  try {
    await $fetch(`/api/admin/asset-export/projects/${editing.value.id}`, { method: 'PUT', body: { structure: editingStructure.value } })
    editing.value = null
    await refresh()
  } catch (err: any) {
    editError.value = err?.data?.statusMessage || err?.statusMessage || 'Error al guardar'
  } finally {
    saving.value = false
  }
}

const expanded = ref<number | null>(null)
const versions = reactive<Record<number, ProjectVersion[]>>({})

async function toggleVersions(p: Project) {
  if (expanded.value === p.id) {
    expanded.value = null
    return
  }
  expanded.value = p.id
  versions[p.id] = await $fetch<ProjectVersion[]>(`/api/admin/asset-export/projects/${p.id}/versions`)
}

async function restore(p: Project, versionId: number) {
  if (!confirm('¿Restaurar esta versión? Se guardará como una nueva versión, así que podrás deshacerlo.')) return
  await $fetch(`/api/admin/asset-export/projects/${p.id}/versions/${versionId}/restore`, { method: 'POST' })
  versions[p.id] = await $fetch<ProjectVersion[]>(`/api/admin/asset-export/projects/${p.id}/versions`)
  await refresh()
}
</script>

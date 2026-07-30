<template>
  <div class="max-w-5xl">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Plantillas de Asset Export Studio</h1>
        <p class="mt-1 text-sm text-stone-500">Plantillas del sistema (no editables) y tus propias plantillas.</p>
      </div>
      <button type="button" class="dash-btn-primary" @click="showCreate = true">Nueva plantilla</button>
    </div>

    <div v-if="showCreate" class="mb-6">
      <AdminPanel title="Nueva plantilla">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Nombre</span>
            <input v-model="createForm.name" class="cfg-input" />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Formato</span>
            <select v-model="createForm.formatKey" class="cfg-input">
              <option v-for="f in formats" :key="f.key" :value="f.key">{{ f.label }}{{ f.renderReady ? '' : ' (renderizado pendiente)' }}</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Categoría</span>
            <input v-model="createForm.category" class="cfg-input" placeholder="moderna, luxury, corporativa…" />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Descripción</span>
            <input v-model="createForm.description" class="cfg-input" />
          </label>
        </div>
        <div class="mt-4 flex items-center gap-3">
          <button type="button" class="dash-btn-primary" :disabled="creating" @click="create">{{ creating ? 'Creando…' : 'Crear' }}</button>
          <button type="button" class="text-sm text-stone-500 hover:underline" @click="showCreate = false">Cancelar</button>
          <span v-if="error" class="text-sm font-medium text-red-600">{{ error }}</span>
        </div>
      </AdminPanel>
    </div>

    <div v-if="!templates.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
      Sin plantillas todavía.
    </div>

    <div v-else class="grid gap-3 sm:grid-cols-2">
      <AdminPanel v-for="t in templates" :key="t.id" :title="t.name" :sub="formatLabel(t.formatKey)">
        <div class="space-y-2 text-sm">
          <p class="text-stone-500">{{ t.description || 'Sin descripción' }}</p>
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">{{ t.category }}</span>
            <span v-if="t.isSystem" class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">Sistema</span>
            <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass(t.status)">{{ statusLabel(t.status) }}</span>
          </div>
          <div class="flex flex-wrap gap-3 pt-2">
            <button type="button" class="text-xs font-medium text-ink hover:underline" @click="duplicate(t.id)">Duplicar</button>
            <template v-if="!t.isSystem">
              <button type="button" class="text-xs font-medium text-ink hover:underline" @click="editStructure(t)">Editar estructura (JSON)</button>
              <button v-if="t.status !== 'published'" type="button" class="text-xs font-medium text-ink hover:underline" @click="setStatus(t, 'published')">Publicar</button>
              <button v-if="t.status !== 'archived'" type="button" class="text-xs font-medium text-stone-500 hover:underline" @click="setStatus(t, 'archived')">Archivar</button>
              <button type="button" class="text-xs font-medium text-red-600 hover:underline" @click="remove(t.id)">Eliminar</button>
            </template>
          </div>
        </div>
      </AdminPanel>
    </div>

    <div v-if="editing" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="editing = null">
      <div class="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5">
        <h3 class="mb-1 text-sm font-semibold">Estructura — {{ editing.name }}</h3>
        <p class="mb-3 text-xs text-stone-500">
          Editor JSON temporal (páginas/elementos con x/y/w/h/binding). El lienzo visual de arrastrar y soltar es la Fase 5-6, todavía no construida.
        </p>
        <textarea v-model="editingJson" class="h-96 w-full rounded-lg border border-line bg-stone-50 p-3 font-mono text-xs" />
        <p v-if="editError" class="mt-2 text-xs font-medium text-red-600">{{ editError }}</p>
        <div class="mt-3 flex gap-3">
          <button type="button" class="dash-btn-primary" @click="saveStructure">Guardar</button>
          <button type="button" class="text-sm text-stone-500 hover:underline" @click="editing = null">Cerrar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Plantillas — Asset Export Studio' })

interface Template {
  id: number
  organizationId: number | null
  name: string
  description: string | null
  category: string
  formatKey: string
  isSystem: number
  status: 'draft' | 'published' | 'archived'
  structureJson: string
}

const { data, refresh } = await useFetch<Template[]>('/api/admin/asset-export/templates')
const templates = computed(() => data.value || [])

const formats = [
  { key: 'pdf_a4_portrait', label: 'PDF A4 vertical', renderReady: true },
  { key: 'pdf_a4_landscape', label: 'PDF A4 horizontal', renderReady: true },
  { key: 'pdf_a5_portrait', label: 'PDF A5 vertical', renderReady: true },
  { key: 'pdf_dossier', label: 'Dossier multipágina', renderReady: true },
  { key: 'print_a3_portrait', label: 'Cartel A3 vertical', renderReady: true },
  { key: 'social_feed_square', label: 'Feed cuadrado 1080×1080', renderReady: false },
  { key: 'social_feed_portrait', label: 'Feed vertical 1080×1350', renderReady: false },
  { key: 'social_story', label: 'Story 1080×1920', renderReady: false },
]
function formatLabel(key: string) {
  return formats.find((f) => f.key === key)?.label || key
}
function statusLabel(status: string) {
  return { draft: 'Borrador', published: 'Publicada', archived: 'Archivada' }[status] || status
}
function statusClass(status: string) {
  return (
    {
      draft: 'bg-stone-100 text-stone-600',
      published: 'bg-emerald-100 text-emerald-700',
      archived: 'bg-stone-200 text-stone-500',
    }[status] || 'bg-stone-100 text-stone-600'
  )
}

const showCreate = ref(false)
const creating = ref(false)
const error = ref('')
const createForm = reactive({ name: '', formatKey: 'pdf_a4_portrait', category: 'moderna', description: '' })

async function create() {
  if (!createForm.name) {
    error.value = 'El nombre es obligatorio'
    return
  }
  creating.value = true
  error.value = ''
  try {
    await $fetch('/api/admin/asset-export/templates', { method: 'POST', body: { ...createForm, structure: { pages: [{ id: 'p1', elements: [] }] } } })
    showCreate.value = false
    createForm.name = ''
    createForm.description = ''
    await refresh()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'Error al crear la plantilla'
  } finally {
    creating.value = false
  }
}

async function duplicate(id: number) {
  await $fetch(`/api/admin/asset-export/templates/${id}/duplicate`, { method: 'POST' })
  await refresh()
}

async function remove(id: number) {
  if (!confirm('¿Eliminar esta plantilla?')) return
  await $fetch(`/api/admin/asset-export/templates/${id}`, { method: 'DELETE' })
  await refresh()
}

async function setStatus(t: Template, status: 'published' | 'archived') {
  await $fetch(`/api/admin/asset-export/templates/${t.id}`, { method: 'PUT', body: { status } })
  await refresh()
}

const editing = ref<Template | null>(null)
const editingJson = ref('')
const editError = ref('')

function editStructure(t: Template) {
  editing.value = t
  editingJson.value = JSON.stringify(JSON.parse(t.structureJson), null, 2)
  editError.value = ''
}

async function saveStructure() {
  if (!editing.value) return
  editError.value = ''
  let structure: unknown
  try {
    structure = JSON.parse(editingJson.value)
  } catch {
    editError.value = 'JSON inválido'
    return
  }
  try {
    await $fetch(`/api/admin/asset-export/templates/${editing.value.id}`, { method: 'PUT', body: { structure } })
    editing.value = null
    await refresh()
  } catch (err: any) {
    editError.value = err?.data?.statusMessage || err?.statusMessage || 'Error al guardar'
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

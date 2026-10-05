<template>
  <div class="max-w-5xl">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{{ trashed ? 'Papelera · Campos personalizados' : 'Campos personalizados' }}</h1>
        <p class="mt-1 max-w-2xl text-sm text-stone-500">
          Los datos propios de tu agencia que no están en las fichas: «Cliente VIP», «Fecha de llaves», «Tipo de inversor»… Cada campo aparece en las fichas del tipo de registro que elijas, en su sección y en el orden de esta lista.
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <button type="button" class="btn-quiet" data-testid="custom-fields-trash-toggle" @click="trashed = !trashed">{{ trashed ? '← Volver' : 'Papelera' }}</button>
        <button v-if="canEdit && !trashed" type="button" class="btn-primary" data-testid="custom-field-new" @click="openNew">+ Nuevo campo</button>
      </div>
    </div>

    <div class="thin-scroll -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
      <button
        v-for="t in CUSTOM_FIELD_ENTITY_TYPES"
        :key="t"
        type="button"
        role="tab"
        :aria-selected="entityType === t"
        class="shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition"
        :class="entityType === t ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:bg-stone-50'"
        :data-testid="`custom-fields-tab-${t}`"
        @click="entityType = t"
      >
        {{ CUSTOM_FIELD_ENTITY_LABELS[t] }}
      </button>
    </div>

    <p v-if="pending" class="py-10 text-center text-sm text-stone-400">Cargando…</p>
    <div v-else-if="!rows.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500" data-testid="custom-fields-list-empty">
      {{ trashed ? 'La papelera está vacía.' : `Todavía no hay campos personalizados para ${CUSTOM_FIELD_ENTITY_LABELS[entityType].toLowerCase()}.` }}
    </div>

    <AdminPanel v-else :pad="false">
      <ul class="divide-y divide-line" data-testid="custom-fields-list">
        <li v-for="(f, i) in rows" :key="f.id" class="flex flex-wrap items-center gap-3 px-4 py-3" :data-testid="`custom-field-row-${f.key}`">
          <div v-if="canEdit && !trashed" class="flex shrink-0 flex-col">
            <button type="button" class="text-[11px] leading-3 text-stone-400 hover:text-ink disabled:opacity-30" :disabled="i === 0 || busy" :aria-label="`Subir ${f.label}`" @click="move(i, -1)">▲</button>
            <button type="button" class="text-[11px] leading-3 text-stone-400 hover:text-ink disabled:opacity-30" :disabled="i === rows.length - 1 || busy" :aria-label="`Bajar ${f.label}`" @click="move(i, 1)">▼</button>
          </div>
          <div class="min-w-0 flex-1 basis-60">
            <p class="font-medium text-ink">
              {{ f.label }}
              <span v-if="Number(f.isRequired) === 1" class="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">Obligatorio</span>
              <span v-if="Number(f.isPublic) === 1" class="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Público en la web</span>
              <span v-if="f.status === 'archived'" class="ml-1 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">Archivado</span>
            </p>
            <p class="text-[11px] text-stone-400">
              {{ CUSTOM_FIELD_TYPE_LABELS[f.fieldType as CustomFieldType] || f.fieldType }} · clave «{{ f.key }}» · sección «{{ f.section || 'Campos personalizados' }}»
              <template v-if="optionsOf(f).length"> · {{ optionsOf(f).join(', ') }}</template>
              · {{ f.valuesCount || 0 }} registro{{ f.valuesCount === 1 ? '' : 's' }} con valor
            </p>
          </div>
          <div v-if="canEdit" class="flex shrink-0 flex-wrap items-center gap-3 text-xs">
            <template v-if="!trashed">
              <button type="button" class="font-medium text-stone-600 hover:underline" :data-testid="`custom-field-edit-${f.key}`" @click="openEdit(f)">Editar</button>
              <button type="button" class="font-medium text-stone-600 hover:underline" :data-testid="`custom-field-archive-${f.key}`" @click="toggleArchive(f)">{{ f.status === 'archived' ? 'Activar' : 'Archivar' }}</button>
              <button type="button" class="font-medium text-red-600 hover:underline" @click="remove(f)">Eliminar</button>
            </template>
            <template v-else>
              <button type="button" class="font-medium text-emerald-700 hover:underline" @click="restore(f)">Restaurar</button>
              <button type="button" class="font-medium text-red-600 hover:underline" @click="removeForever(f)">Eliminar definitivamente</button>
            </template>
          </div>
        </li>
      </ul>
    </AdminPanel>

    <AdminCommsModal v-if="editing" :title="editing.id ? 'Editar campo' : 'Nuevo campo'" :sub="CUSTOM_FIELD_ENTITY_LABELS[form.entityType]" wide test-id="custom-field-form" @close="editing = null">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block sm:col-span-2">
          <span class="label">Etiqueta *</span>
          <input v-model="form.label" class="input" maxlength="120" placeholder="p. ej. Fecha de entrega de llaves" data-testid="custom-field-label">
        </label>
        <label class="block">
          <span class="label">Clave interna</span>
          <input v-model="form.key" class="input" :disabled="!!editing.id" placeholder="Se genera de la etiqueta" maxlength="50" data-testid="custom-field-key">
          <span class="mt-0.5 block text-[11px] text-stone-400">Minúsculas, números y _. No cambia una vez creado.</span>
        </label>
        <label class="block">
          <span class="label">Tipo *</span>
          <select v-model="form.fieldType" class="input" :disabled="!!editing.id && (editing.valuesCount || 0) > 0" data-testid="custom-field-type">
            <option v-for="t in CUSTOM_FIELD_TYPES" :key="t" :value="t">{{ CUSTOM_FIELD_TYPE_LABELS[t] }}</option>
          </select>
          <span v-if="editing.id && (editing.valuesCount || 0) > 0" class="mt-0.5 block text-[11px] text-stone-400">Ya hay registros con valor: el tipo no se puede cambiar.</span>
        </label>
        <label v-if="needsOptions" class="block sm:col-span-2">
          <span class="label">Opciones * (una por línea)</span>
          <textarea v-model="form.options" rows="4" class="input" placeholder="Inversor&#10;Primera vivienda&#10;Segunda residencia" data-testid="custom-field-options" />
        </label>
        <label class="block">
          <span class="label">Sección de la ficha</span>
          <input v-model="form.section" class="input" :list="'cf-sections'" maxlength="80" placeholder="Campos personalizados" data-testid="custom-field-section">
          <datalist id="cf-sections">
            <option v-for="s in sections" :key="s" :value="s" />
          </datalist>
        </label>
        <label class="block">
          <span class="label">Estado</span>
          <select v-model="form.status" class="input">
            <option value="active">Activo (sale en las fichas)</option>
            <option value="archived">Archivado (oculto; conserva los valores)</option>
          </select>
        </label>
        <label class="block sm:col-span-2">
          <span class="label">Ayuda (sale debajo del campo)</span>
          <input v-model="form.helpText" class="input" maxlength="500" data-testid="custom-field-help">
        </label>
        <label class="flex items-center gap-2 text-[13px]">
          <input v-model="form.isRequired" type="checkbox" data-testid="custom-field-required">
          Obligatorio (la ficha no guarda sus campos sin él)
        </label>
        <label v-if="form.entityType === 'property'" class="flex items-center gap-2 text-[13px]">
          <input v-model="form.isPublic" type="checkbox" data-testid="custom-field-public">
          Visible en la web pública de la propiedad
        </label>
      </div>
      <p v-if="formError" class="mt-3 text-sm font-medium text-red-600" data-testid="custom-field-form-error">{{ formError }}</p>
      <template #footer>
        <button type="button" class="text-[13px] text-stone-500 hover:underline" @click="editing = null">Cancelar</button>
        <button type="button" class="btn-primary" :disabled="saving || !form.label.trim()" data-testid="custom-field-save" @click="save">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
      </template>
    </AdminCommsModal>
  </div>
</template>

<script setup lang="ts">
import {
  CUSTOM_FIELD_ENTITY_LABELS,
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPES_WITH_OPTIONS,
  CUSTOM_FIELD_TYPE_LABELS,
  type CustomFieldEntityType,
  type CustomFieldType,
} from '~/utils/customFieldCatalog'

/**
 * CRM → Campos personalizados (FASE 0, bloque N7b): las definiciones de los
 * campos extra de la agencia para propiedades (los dos catálogos), contactos,
 * leads, citas y operaciones. Alta, edición, orden, archivar y papelera sobre
 * el recurso genérico `custom-fields`; el servidor
 * (server/utils/customFields/service.ts) valida clave, tipo y opciones. Los
 * valores se rellenan en cada ficha (CustomFieldsPanel).
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Campos personalizados — M&M Real Estate' })
const toast = useToast()
const { confirm } = useConfirm()
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => canWrite('crm'))
const route = useRoute()

const entityType = ref<CustomFieldEntityType>((CUSTOM_FIELD_ENTITY_TYPES as readonly string[]).includes(String(route.query.entity)) ? (route.query.entity as CustomFieldEntityType) : 'property')
const trashed = ref(false)

const { data, pending, refresh } = await useFetch<{ rows: any[] }>('/api/admin/custom-fields', {
  query: computed(() => ({ entityType: entityType.value, perPage: 100, trashed: trashed.value ? 1 : undefined })),
})
const rows = computed<any[]>(() => data.value?.rows || [])
const sections = computed(() => [...new Set(rows.value.map((r) => r.section).filter(Boolean))] as string[])

function optionsOf(f: any): string[] {
  try {
    const list = JSON.parse(f.optionsJson || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

// --- Alta y edición -------------------------------------------------------------
const editing = ref<any | null>(null)
const saving = ref(false)
const formError = ref('')
const form = reactive({
  entityType: 'property' as CustomFieldEntityType,
  label: '',
  key: '',
  fieldType: 'text' as CustomFieldType,
  options: '',
  section: '',
  helpText: '',
  isRequired: false,
  isPublic: false,
  status: 'active' as 'active' | 'archived',
})
const needsOptions = computed(() => CUSTOM_FIELD_TYPES_WITH_OPTIONS.includes(form.fieldType))

function openNew() {
  Object.assign(form, { entityType: entityType.value, label: '', key: '', fieldType: 'text', options: '', section: '', helpText: '', isRequired: false, isPublic: false, status: 'active' })
  formError.value = ''
  editing.value = {}
}
function openEdit(f: any) {
  Object.assign(form, {
    entityType: f.entityType,
    label: f.label,
    key: f.key,
    fieldType: f.fieldType,
    options: optionsOf(f).join('\n'),
    section: f.section || '',
    helpText: f.helpText || '',
    isRequired: Number(f.isRequired) === 1,
    isPublic: Number(f.isPublic) === 1,
    status: f.status === 'archived' ? 'archived' : 'active',
  })
  formError.value = ''
  editing.value = f
}

async function save() {
  saving.value = true
  formError.value = ''
  const body: Record<string, unknown> = {
    label: form.label.trim(),
    fieldType: form.fieldType,
    section: form.section.trim() || null,
    helpText: form.helpText.trim() || null,
    isRequired: form.isRequired ? 1 : 0,
    isPublic: form.entityType === 'property' && form.isPublic ? 1 : 0,
    status: form.status,
    optionsJson: needsOptions.value
      ? form.options
          .split('\n')
          .map((o) => o.trim())
          .filter(Boolean)
      : null,
  }
  try {
    if (editing.value?.id) {
      await $fetch(`/api/admin/custom-fields/${editing.value.id}`, { method: 'PUT', body })
      toast.success('Campo actualizado')
    } else {
      const maxOrder = rows.value.reduce((m, r) => Math.max(m, Number(r.sortOrder) || 0), 0)
      await $fetch('/api/admin/custom-fields', { method: 'POST', body: { ...body, entityType: form.entityType, key: form.key.trim() || null, sortOrder: maxOrder + 10 } })
      toast.success('Campo creado')
    }
    editing.value = null
    await refresh()
  } catch (e: any) {
    formError.value = e?.data?.statusMessage || 'No se pudo guardar el campo'
  } finally {
    saving.value = false
  }
}

// --- Orden, archivar, papelera ---------------------------------------------------
const busy = ref(false)
/** Sube o baja un campo: se reescribe el orden de toda la lista (10, 20, 30…) para que no queden empates. */
async function move(index: number, delta: number) {
  const list = [...rows.value]
  const target = index + delta
  if (target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target], list[index]]
  busy.value = true
  try {
    for (const [i, f] of list.entries()) {
      const sortOrder = (i + 1) * 10
      if (Number(f.sortOrder) !== sortOrder) await $fetch(`/api/admin/custom-fields/${f.id}`, { method: 'PUT', body: { sortOrder } })
    }
    await refresh()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo cambiar el orden')
  } finally {
    busy.value = false
  }
}

async function toggleArchive(f: any) {
  try {
    await $fetch(`/api/admin/custom-fields/${f.id}`, { method: 'PUT', body: { status: f.status === 'archived' ? 'active' : 'archived' } })
    toast.success(f.status === 'archived' ? 'Campo activado' : 'Campo archivado: deja de salir en las fichas y conserva sus valores')
    await refresh()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo cambiar el estado')
  }
}

async function remove(f: any) {
  const ok = await confirm(`«${f.label}» irá a la papelera y dejará de salir en las fichas. Sus ${f.valuesCount || 0} valores se conservan mientras no lo elimines definitivamente.`, {
    title: '¿Mover a la papelera?',
    confirmLabel: 'Mover a la papelera',
    danger: true,
  })
  if (!ok) return
  try {
    await $fetch(`/api/admin/custom-fields/${f.id}`, { method: 'DELETE' })
    toast.success('Campo movido a la papelera')
    await refresh()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo eliminar')
  }
}

async function restore(f: any) {
  try {
    await $fetch(`/api/admin/custom-fields/${f.id}/restore`, { method: 'POST' })
    toast.success('Campo restaurado')
    await refresh()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo restaurar')
  }
}

async function removeForever(f: any) {
  const ok = await confirm(`Se borrarán «${f.label}» y sus ${f.valuesCount || 0} valores en todas las fichas. No se puede deshacer.`, {
    title: '¿Eliminar definitivamente?',
    confirmLabel: 'Eliminar',
    danger: true,
  })
  if (!ok) return
  try {
    await $fetch(`/api/admin/custom-fields/${f.id}?hard=1`, { method: 'DELETE' })
    toast.success('Campo eliminado definitivamente')
    await refresh()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo eliminar')
  }
}
</script>

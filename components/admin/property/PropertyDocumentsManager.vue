<template>
  <div data-testid="property-documents">
    <p v-if="!parentId" class="rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-stone-500">
      Guarda la propiedad primero; después podrás subir sus documentos.
    </p>
    <template v-else>
      <p class="mb-3 text-[13px] text-stone-500">
        Escrituras, notas simples, IBI, certificados, planos, contratos… Cada documento dice quién puede verlo:
        <strong>Interno</strong> (sólo el equipo), <strong>Propietario</strong> (además, los propietarios y copropietarios de esta propiedad),
        <strong>Comprador autorizado</strong> (además, los contactos a los que les des acceso) o <strong>Público</strong> (además, la web, sólo con la propiedad publicada).
        Propietarios y compradores lo descargan desde «Mi cuenta», entrando con el mismo email que tienen en su contacto.
      </p>

      <!-- Avisos de caducidad -->
      <div v-if="expired.length || expiring.length" class="mb-4 space-y-2" data-testid="property-documents-expiry-alert">
        <p v-if="expired.length" class="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-800">
          <strong>{{ expired.length === 1 ? '1 documento caducado' : `${expired.length} documentos caducados` }}:</strong>
          {{ expired.map((d) => `${d.title} (${formatDay(d.expiresAt)})`).join(' · ') }}
        </p>
        <p v-if="expiring.length" class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
          <strong>Caducan en los próximos {{ DOCUMENT_EXPIRY_WARNING_DAYS }} días:</strong>
          {{ expiring.map((d) => `${d.title} (${formatDay(d.expiresAt)})`).join(' · ') }}
        </p>
      </div>

      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex gap-1 rounded-lg border border-line bg-stone-50 p-0.5">
          <button type="button" class="rounded-md px-3 py-1.5 text-[12px] font-semibold" :class="!showTrash ? 'bg-white text-ink shadow' : 'text-stone-500'" @click="setTrash(false)">Documentos</button>
          <button type="button" class="rounded-md px-3 py-1.5 text-[12px] font-semibold" :class="showTrash ? 'bg-white text-ink shadow' : 'text-stone-500'" data-testid="property-documents-trash-toggle" @click="setTrash(true)">Papelera</button>
        </div>
        <span class="text-[12px] text-stone-400">{{ rows.length }} {{ rows.length === 1 ? 'documento' : 'documentos' }}</span>
      </div>

      <p v-if="loading" class="py-6 text-center text-sm text-stone-400">Cargando…</p>
      <p v-else-if="!rows.length" class="mb-4 rounded-xl border border-dashed border-line px-6 py-6 text-center text-sm text-stone-500">
        {{ showTrash ? 'La papelera de documentos está vacía.' : 'Todavía no hay documentos.' }}
      </p>
      <ul v-else class="mb-4 divide-y divide-line rounded-xl border border-line bg-white">
        <li v-for="d in rows" :key="d.id" class="px-4 py-3" data-testid="property-document-row" :data-document-id="d.id">
          <div class="flex flex-wrap items-start gap-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-[14px] font-medium text-ink">{{ d.title }}</p>
              <p class="mt-0.5 text-[11px] text-stone-500">
                {{ d.docTypeLabel }} · {{ d.fileName || 'Sin fichero' }} · {{ formatBytes(d.sizeBytes) }}
                <template v-if="d.issuedAt"> · emitido {{ formatDay(d.issuedAt) }}</template>
                <template v-if="d.createdByName"> · subido por {{ d.createdByName }}</template>
              </p>
              <p v-if="d.notes" class="mt-1 text-[12px] text-stone-600">{{ d.notes }}</p>
            </div>
            <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="VISIBILITY_TONES[d.visibility] || 'bg-stone-100 text-stone-600'" data-testid="property-document-visibility">{{ d.visibilityLabel }}</span>
            <span v-if="d.expiresAt" class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="EXPIRY_TONES[d.expiryState]" data-testid="property-document-expiry">
              {{ d.expiryLabel }} · {{ formatDay(d.expiresAt) }}
            </span>
          </div>

          <div class="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
            <a v-if="d.downloadUrl" :href="d.downloadUrl" class="font-semibold text-ink hover:underline" data-testid="property-document-download">Descargar</a>
            <template v-if="!showTrash">
              <button v-if="canEdit" type="button" class="text-stone-600 hover:text-ink" @click="toggleEdit(d)">{{ editingId === d.id ? 'Cerrar edición' : 'Editar' }}</button>
              <button type="button" class="text-stone-600 hover:text-ink" :data-testid="`property-document-access-${d.id}`" @click="accessId = accessId === d.id ? null : d.id">
                Accesos ({{ d.grants?.length || 0 }})
              </button>
              <button v-if="canEdit" type="button" class="text-red-600 hover:underline" @click="trash(d)">A la papelera</button>
            </template>
            <template v-else-if="canEdit">
              <button type="button" class="font-semibold text-ink hover:underline" @click="restore(d)">Restaurar</button>
              <button type="button" class="text-red-600 hover:underline" @click="purge(d)">Eliminar definitivamente</button>
            </template>
          </div>

          <!-- Edición de metadatos -->
          <div v-if="editingId === d.id" class="mt-3 grid gap-3 rounded-lg border border-line bg-stone-50/60 p-3 sm:grid-cols-2" data-testid="property-document-edit">
            <label class="block"><span class="pe-label">Tipo</span>
              <select v-model="edit.docType" class="pe-input"><option v-for="t in PROPERTY_DOCUMENT_TYPES" :key="t" :value="t">{{ PROPERTY_DOCUMENT_TYPE_LABELS[t] }}</option></select>
            </label>
            <label class="block"><span class="pe-label">Título</span><input v-model="edit.title" class="pe-input" maxlength="200" ></label>
            <label class="block"><span class="pe-label">Quién puede verlo</span>
              <select v-model="edit.visibility" class="pe-input"><option v-for="v in DOCUMENT_VISIBILITIES" :key="v" :value="v">{{ DOCUMENT_VISIBILITY_LABELS[v] }}</option></select>
            </label>
            <div class="grid grid-cols-2 gap-2">
              <label class="block"><span class="pe-label">Emisión</span><input v-model="edit.issuedAt" type="date" class="pe-input" ></label>
              <label class="block"><span class="pe-label">Caducidad</span><input v-model="edit.expiresAt" type="date" class="pe-input" ></label>
            </div>
            <label class="block sm:col-span-2"><span class="pe-label">Notas</span><textarea v-model="edit.notes" rows="2" class="pe-input" maxlength="4000" /></label>
            <p v-if="editError" class="text-[12px] font-medium text-red-600 sm:col-span-2">{{ editError }}</p>
            <div class="sm:col-span-2"><button type="button" class="pe-btn-dark" :disabled="savingEdit" data-testid="property-document-save" @click="saveEdit(d)">{{ savingEdit ? 'Guardando…' : 'Guardar cambios' }}</button></div>
          </div>

          <!-- Accesos concedidos -->
          <div v-if="accessId === d.id" class="mt-3 rounded-lg border border-line bg-stone-50/60 p-3" data-testid="property-document-grants">
            <p v-if="!d.grantsEffective" class="mb-2 text-[12px] text-amber-700">
              Con la visibilidad «{{ d.visibilityLabel }}» los accesos concedidos no dan acceso: cámbiala a «Comprador autorizado» (o «Público») para que cuenten.
            </p>
            <p class="mb-2 text-[12px] text-stone-500">Además de estos contactos, lo ven siempre los propietarios y copropietarios de la propiedad si el documento es «Propietario» o superior.</p>
            <ul v-if="d.grants?.length" class="mb-2 divide-y divide-line rounded-md border border-line bg-white">
              <li v-for="g in d.grants" :key="g.contactId" class="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
                <NuxtLink :to="`/admin/contactos/${g.contactId}`" class="min-w-0 truncate hover:underline">{{ g.name || `Contacto #${g.contactId}` }} <span class="text-[11px] text-stone-400">{{ g.email }}</span></NuxtLink>
                <button v-if="canEdit" type="button" class="text-[12px] text-red-600 hover:underline" :data-testid="`property-document-revoke-${g.contactId}`" @click="revoke(d, g.contactId)">Revocar</button>
              </li>
            </ul>
            <p v-else class="mb-2 text-[12px] text-stone-400">Nadie tiene acceso concedido.</p>
            <div v-if="canEdit && !trashed" class="grid gap-2 sm:grid-cols-[1fr_auto]">
              <RecordPicker v-model="grantContact" kind="contact" placeholder="Buscar el contacto al que dar acceso…" />
              <button type="button" class="pe-btn-dark" :disabled="!grantContact" data-testid="property-document-grant" @click="grant(d)">Dar acceso</button>
            </div>
            <p v-if="grantError" class="mt-1 text-[12px] font-medium text-red-600">{{ grantError }}</p>
          </div>
        </li>
      </ul>

      <!-- Subida -->
      <div v-if="canEdit && !showTrash" class="rounded-xl border border-line bg-stone-50/60 p-4" data-testid="property-document-upload">
        <p class="pe-label">Subir un documento</p>
        <p v-if="trashed" class="text-[12px] text-amber-700">La propiedad está en la papelera: restáurala antes de añadirle documentos.</p>
        <div v-else class="grid gap-3 sm:grid-cols-2">
          <label class="block sm:col-span-2">
            <span class="pe-label">Fichero (PDF o imagen, hasta {{ DOCUMENT_MAX_MB }} MB)</span>
            <input ref="fileInput" type="file" :accept="DOCUMENT_ACCEPT" class="block w-full text-xs text-stone-500" data-testid="property-document-file" @change="onFile" >
          </label>
          <label class="block"><span class="pe-label">Tipo</span>
            <select v-model="form.docType" class="pe-input" data-testid="property-document-type"><option v-for="t in PROPERTY_DOCUMENT_TYPES" :key="t" :value="t">{{ PROPERTY_DOCUMENT_TYPE_LABELS[t] }}</option></select>
          </label>
          <label class="block"><span class="pe-label">Título <span class="text-red-500">*</span></span><input v-model="form.title" class="pe-input" maxlength="200" data-testid="property-document-title" ></label>
          <label class="block"><span class="pe-label">Quién puede verlo</span>
            <select v-model="form.visibility" class="pe-input" data-testid="property-document-new-visibility"><option v-for="v in DOCUMENT_VISIBILITIES" :key="v" :value="v">{{ DOCUMENT_VISIBILITY_LABELS[v] }}</option></select>
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="block"><span class="pe-label">Emisión</span><input v-model="form.issuedAt" type="date" class="pe-input" ></label>
            <label class="block"><span class="pe-label">Caducidad</span><input v-model="form.expiresAt" type="date" class="pe-input" data-testid="property-document-expires" ></label>
          </div>
          <p v-if="dateError" class="text-[12px] font-medium text-red-600 sm:col-span-2">{{ dateError }}</p>
          <label class="block sm:col-span-2"><span class="pe-label">Notas</span><textarea v-model="form.notes" rows="2" class="pe-input" maxlength="4000" /></label>
          <div class="sm:col-span-2">
            <button type="button" class="pe-btn-dark" :disabled="uploading || !file || !form.title.trim() || !!dateError" data-testid="property-document-submit" @click="upload">
              {{ uploading ? 'Subiendo…' : 'Subir documento' }}
            </button>
            <p v-if="uploadError" class="mt-1 text-[12px] font-medium text-red-600">{{ uploadError }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import RecordPicker from '~/components/admin/pickers/RecordPicker.vue'
import { DOCUMENT_VISIBILITIES, DOCUMENT_VISIBILITY_LABELS, PROPERTY_DOCUMENT_TYPES, PROPERTY_DOCUMENT_TYPE_LABELS } from '~/utils/propertySheet'
import { DOCUMENT_ACCEPT, DOCUMENT_EXPIRY_WARNING_DAYS, DOCUMENT_MAX_MB, formatBytes } from '~/utils/propertyMediaCatalog'
import type { PickedRecord } from '~/utils/pipelineCatalog'

/**
 * Paso «Documentos» del editor de propiedad (FASE 6, bloque N7a), igual en los
 * dos catálogos. Sube (multipart a `/api/admin/property-documents/private-upload`),
 * lista, edita metadatos, manda a la papelera, restaura, borra, y concede o
 * revoca el acceso de un contacto. Descargar abre `/api/media/<clave>`, que
 * vuelve a comprobar el permiso del documento en cada descarga: este
 * componente no decide nada de seguridad.
 */
const props = withDefaults(defineProps<{ parentId: number | null; kind: 'agent' | 'developer'; canEdit?: boolean; trashed?: boolean }>(), { canEdit: true, trashed: false })
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()
const { confirm } = useConfirm()

const VISIBILITY_TONES: Record<string, string> = {
  internal: 'bg-stone-100 text-stone-700',
  owner: 'bg-sky-50 text-sky-800',
  authorized_buyer: 'bg-violet-50 text-violet-800',
  public: 'bg-emerald-50 text-emerald-800',
}
const EXPIRY_TONES: Record<string, string> = {
  expired: 'bg-red-50 text-red-700',
  expiring: 'bg-amber-50 text-amber-800',
  valid: 'bg-emerald-50 text-emerald-700',
  none: 'bg-stone-100 text-stone-600',
}

const rows = ref<any[]>([])
const loading = ref(false)
const showTrash = ref(false)

async function load() {
  if (!props.parentId) return
  loading.value = true
  try {
    const res = await $fetch<{ rows: any[] }>('/api/admin/property-documents', {
      query: { propertyKind: props.kind, propertyId: props.parentId, perPage: 100, trashed: showTrash.value ? '1' : undefined },
    })
    rows.value = res.rows
  } catch (e: any) {
    rows.value = []
    toast.error(e?.data?.statusMessage || 'No se pudieron cargar los documentos')
  } finally {
    loading.value = false
  }
}
function setTrash(v: boolean) {
  showTrash.value = v
  load()
}

const expired = computed(() => (showTrash.value ? [] : rows.value.filter((d) => d.expiryState === 'expired')))
const expiring = computed(() => (showTrash.value ? [] : rows.value.filter((d) => d.expiryState === 'expiring')))

function formatDay(v: string | null | undefined) {
  if (!v) return ''
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('es-ES', { timeZone: 'UTC' })
}

// --- Subida ------------------------------------------------------------------
const fileInput = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const uploading = ref(false)
const uploadError = ref('')
const form = reactive({ docType: 'deed', title: '', visibility: 'internal', issuedAt: '', expiresAt: '', notes: '' })
const dateError = computed(() => (form.issuedAt && form.expiresAt && form.expiresAt < form.issuedAt ? 'La caducidad no puede ser anterior a la emisión.' : ''))

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0] || null
  uploadError.value = ''
  if (f && f.size > DOCUMENT_MAX_MB * 1024 * 1024) {
    uploadError.value = `El fichero pesa más de ${DOCUMENT_MAX_MB} MB.`
    file.value = null
    return
  }
  file.value = f
  if (f && !form.title.trim()) form.title = f.name.replace(/\.[^.]+$/, '').slice(0, 200)
}

async function upload() {
  if (!file.value || !props.parentId) return
  uploading.value = true
  uploadError.value = ''
  try {
    const fd = new FormData()
    fd.append('file', file.value)
    fd.append('propertyKind', props.kind)
    fd.append('propertyId', String(props.parentId))
    for (const [k, v] of Object.entries(form)) if (v) fd.append(k, String(v))
    await $fetch('/api/admin/property-documents/private-upload', { method: 'POST', body: fd })
    toast.success('Documento subido')
    Object.assign(form, { docType: 'deed', title: '', visibility: 'internal', issuedAt: '', expiresAt: '', notes: '' })
    file.value = null
    if (fileInput.value) fileInput.value.value = ''
    await load()
    emit('changed')
  } catch (e: any) {
    uploadError.value = e?.data?.statusMessage || e?.statusMessage || 'No se pudo subir el documento'
  } finally {
    uploading.value = false
  }
}

// --- Edición -----------------------------------------------------------------
const editingId = ref<number | null>(null)
const edit = reactive({ docType: '', title: '', visibility: '', issuedAt: '', expiresAt: '', notes: '' })
const editError = ref('')
const savingEdit = ref(false)
function toggleEdit(d: any) {
  editError.value = ''
  if (editingId.value === d.id) {
    editingId.value = null
    return
  }
  editingId.value = d.id
  Object.assign(edit, { docType: d.docType, title: d.title, visibility: d.visibility, issuedAt: d.issuedAt || '', expiresAt: d.expiresAt || '', notes: d.notes || '' })
}
async function saveEdit(d: any) {
  if (edit.issuedAt && edit.expiresAt && edit.expiresAt < edit.issuedAt) {
    editError.value = 'La caducidad no puede ser anterior a la emisión.'
    return
  }
  savingEdit.value = true
  editError.value = ''
  try {
    await $fetch(`/api/admin/property-documents/${d.id}`, { method: 'PUT', body: { ...edit, issuedAt: edit.issuedAt || null, expiresAt: edit.expiresAt || null } })
    editingId.value = null
    toast.success('Documento actualizado')
    await load()
    emit('changed')
  } catch (e: any) {
    editError.value = e?.data?.statusMessage || 'No se pudo guardar'
  } finally {
    savingEdit.value = false
  }
}

// --- Accesos -----------------------------------------------------------------
const accessId = ref<number | null>(null)
const grantContact = ref<PickedRecord | null>(null)
const grantError = ref('')
async function grant(d: any) {
  if (!grantContact.value) return
  grantError.value = ''
  try {
    await $fetch(`/api/admin/property-documents/${d.id}`, { method: 'PUT', body: { action: 'grant', contactId: grantContact.value.id } })
    grantContact.value = null
    toast.success('Acceso concedido')
    await load()
  } catch (e: any) {
    grantError.value = e?.data?.statusMessage || 'No se pudo conceder el acceso'
  }
}
async function revoke(d: any, contactId: number) {
  const ok = await confirm('Esta persona dejará de poder descargar el documento.', { title: '¿Revocar el acceso?', confirmLabel: 'Revocar', danger: true })
  if (!ok) return
  try {
    await $fetch(`/api/admin/property-documents/${d.id}`, { method: 'PUT', body: { action: 'revoke', contactId } })
    toast.success('Acceso revocado')
    await load()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo revocar el acceso')
  }
}

// --- Papelera ----------------------------------------------------------------
async function trash(d: any) {
  const ok = await confirm('El documento deja de poder descargarse. Puedes restaurarlo desde la papelera (su fichero se borra para siempre a los 30 días).', { title: '¿Mover a la papelera?', confirmLabel: 'Mover', danger: true })
  if (!ok) return
  try {
    await $fetch(`/api/admin/property-documents/${d.id}`, { method: 'DELETE' })
    toast.success('Documento en la papelera')
    await load()
    emit('changed')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo mover a la papelera')
  }
}
async function restore(d: any) {
  try {
    await $fetch(`/api/admin/property-documents/${d.id}/restore`, { method: 'POST' })
    toast.success('Documento restaurado')
    await load()
    emit('changed')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo restaurar')
  }
}
async function purge(d: any) {
  const ok = await confirm('Se borran el documento y su fichero. No se puede deshacer.', { title: '¿Eliminar definitivamente?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  try {
    await $fetch(`/api/admin/property-documents/${d.id}`, { method: 'DELETE', query: { hard: '1' } })
    toast.success('Documento eliminado')
    await load()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo eliminar')
  }
}

watch(() => props.parentId, load, { immediate: true })
</script>

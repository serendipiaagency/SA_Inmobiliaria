<!--
  INMO: conocimiento, memoria y perfiles (bloque N8b).

  - Base de conocimiento: documentos de TEXTO de la agencia que INMO consulta
    y cita (recurso genérico `knowledge-documents`, área CRM, borrado lógico).
    «Probar búsqueda» llama a la misma herramienta que usa INMO
    (search_knowledge) y enseña las fuentes tal cual las vería.
  - Memoria: lo que INMO recuerda son notas de las fichas con origen «inmo»
    (recurso `notes?source=inmo`). Se borran aquí o en la ficha.
  - Perfiles (cerebros): ajustes de la agencia sobre los perfiles del código
    (recurso `inmo-brains`, área Sistema): activar, indicaciones propias y
    recortar herramientas — nunca añadir.
-->
<template>
  <div class="mx-auto max-w-5xl">
    <header class="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">INMO: conocimiento, memoria y perfiles</h1>
        <p class="mt-1 text-sm text-stone-500">Lo que INMO puede consultar y citar, lo que recuerda de cada ficha y cómo trabaja cada perfil en tu agencia.</p>
      </div>
      <NuxtLink to="/admin/inmo" class="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-stone-50">← Volver a INMO</NuxtLink>
    </header>

    <nav class="mb-5 flex gap-1 border-b border-line text-sm">
      <button v-for="t in TABS" :key="t.key" type="button" class="-mb-px border-b-2 px-3 py-2" :class="tab === t.key ? 'border-ink font-semibold' : 'border-transparent text-stone-500 hover:text-ink'" :data-testid="`inmo-tab-${t.key}`" @click="tab = t.key">
        {{ t.label }}
      </button>
    </nav>

    <!-- Base de conocimiento -->
    <section v-if="tab === 'knowledge'" class="space-y-5" data-testid="inmo-knowledge">
      <AdminPanel title="Probar búsqueda" sub="Lo mismo que hace INMO: ayuda del panel, documentos, notas y fichas — sólo de tu agencia y con las fuentes que tu usuario puede ver.">
        <form class="flex gap-2" @submit.prevent="testSearch">
          <input v-model="probe" class="cfg-input flex-1" placeholder="p. ej. ¿cómo se reserva un inmueble?" data-testid="knowledge-probe-input">
          <button type="submit" class="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" :disabled="!probe.trim() || probing" data-testid="knowledge-probe-run">Buscar</button>
        </form>
        <div v-if="probeResult" class="mt-3 text-sm" data-testid="knowledge-probe-results">
          <p v-if="probeResult.noSources" class="text-stone-500">Sin fuentes: INMO respondería que no tiene ninguna sobre esto.</p>
          <ul v-else class="space-y-2">
            <li v-for="r in probeResult.results" :key="r.ref" class="rounded-lg border border-line px-3 py-2">
              <p class="text-xs text-stone-500"><span class="font-mono">[{{ r.ref }}]</span> {{ SOURCE_LABELS[r.sourceType] || r.sourceType }}</p>
              <NuxtLink v-if="r.url" :to="r.url" class="font-medium hover:underline">{{ r.title }}</NuxtLink>
              <p v-else class="font-medium">{{ r.title }}</p>
              <p class="mt-0.5 text-xs text-stone-600">{{ r.snippet }}</p>
            </li>
          </ul>
          <p v-if="probeResult.skipped?.length" class="mt-2 text-xs text-stone-500">No consultadas por permisos: {{ probeResult.skipped.map((s: any) => SOURCE_LABELS[s.source] || s.source).join(', ') }}.</p>
        </div>
      </AdminPanel>

      <AdminPanel :title="editingDoc ? 'Editar documento' : 'Nuevo documento'" sub="Pega el texto (procedimientos, argumentarios, políticas internas…). INMO lo cita como «Documento». No se leen PDF ni otros ficheros: sólo texto.">
        <form class="space-y-3" @submit.prevent="saveDoc">
          <input v-model="docForm.title" class="cfg-input" placeholder="Título" maxlength="200" data-testid="knowledge-doc-title">
          <input v-model="docForm.tags" class="cfg-input" placeholder="Etiquetas, separadas por comas (opcional)" maxlength="300" data-testid="knowledge-doc-tags">
          <textarea v-model="docForm.body" rows="8" class="cfg-input" placeholder="Texto del documento" maxlength="60000" data-testid="knowledge-doc-body" />
          <label class="flex items-center gap-2 text-sm"><input v-model="docForm.active" type="checkbox"> Activo (INMO lo consulta)</label>
          <div class="flex gap-2">
            <button type="submit" class="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" :disabled="savingDoc || !docForm.title.trim() || !docForm.body.trim()" data-testid="knowledge-doc-save">{{ savingDoc ? 'Guardando…' : 'Guardar' }}</button>
            <button v-if="editingDoc" type="button" class="rounded-lg border border-line px-4 py-2 text-sm" @click="resetDoc">Cancelar</button>
          </div>
        </form>
      </AdminPanel>

      <AdminPanel title="Documentos" :pad="false">
        <p v-if="!docs.length" class="p-5 text-sm text-stone-400">Todavía no hay documentos. INMO cita entonces la ayuda del panel, tus notas y tus fichas.</p>
        <ul class="divide-y divide-line">
          <li v-for="d in docs" :key="d.id" class="flex items-start gap-3 px-5 py-3 text-sm" :data-testid="`knowledge-doc-${d.id}`">
            <div class="min-w-0 flex-1">
              <p class="font-medium">{{ d.title }} <span v-if="d.status === 'archived'" class="ml-1 rounded bg-stone-100 px-1.5 text-[11px] text-stone-500">archivado</span></p>
              <p class="truncate text-xs text-stone-500">{{ d.tags || 'Sin etiquetas' }} · actualizado {{ dt.relative(d.updatedAt) }}</p>
            </div>
            <button type="button" class="text-xs text-stone-500 hover:text-ink" @click="editDoc(d)">Editar</button>
            <button type="button" class="text-xs text-red-700 hover:underline" :data-testid="`knowledge-doc-delete-${d.id}`" @click="deleteDoc(d)">Eliminar</button>
          </li>
        </ul>
      </AdminPanel>
    </section>

    <!-- Memoria -->
    <section v-else-if="tab === 'memory'" data-testid="inmo-memory">
      <AdminPanel title="Lo que INMO recuerda" sub="Hechos que alguien confirmó en INMO. Son notas de cada ficha (las ves también en su pestaña Notas), de tu agencia y sólo de ella. INMO nunca guarda contraseñas, claves ni datos de pago." :pad="false">
        <p v-if="!memory.length" class="p-5 text-sm text-stone-400">INMO todavía no ha guardado nada. Cuando le pidas que recuerde algo de un contacto, un lead o una propiedad, te pedirá confirmarlo y aparecerá aquí.</p>
        <ul class="divide-y divide-line">
          <li v-for="n in memory" :key="n.id" class="flex items-start gap-3 px-5 py-3 text-sm" :data-testid="`inmo-memory-${n.id}`">
            <div class="min-w-0 flex-1">
              <p class="whitespace-pre-wrap">{{ n.body }}</p>
              <p class="mt-0.5 text-xs text-stone-500">
                <NuxtLink v-if="noteLink(n)" :to="noteLink(n)!" class="hover:underline">{{ ENTITY_NOUN[n.entityType] || n.entityType }} #{{ n.entityId }}</NuxtLink>
                <template v-else>{{ ENTITY_NOUN[n.entityType] || n.entityType }} #{{ n.entityId }}</template>
                · {{ n.authorName || 'Alguien de la agencia' }} · {{ dt.relative(n.createdAt) }}
              </p>
            </div>
            <button type="button" class="text-xs text-red-700 hover:underline" :data-testid="`inmo-memory-delete-${n.id}`" @click="forget(n)">Olvidar</button>
          </li>
        </ul>
      </AdminPanel>
    </section>

    <!-- Perfiles (cerebros) -->
    <section v-else class="space-y-4" data-testid="inmo-brains">
      <p class="text-sm text-stone-500">
        Cada perfil es INMO centrado en una tarea, con sus instrucciones y sólo las herramientas que necesita. Aquí puedes desactivarlo, añadirle indicaciones de tu agencia y quitarle herramientas — nunca darle una que el perfil no tenga. Además, cada persona sólo usa las que su usuario tiene permitidas. Guardar estos ajustes exige permiso de edición en Sistema.
      </p>
      <AdminPanel v-for="b in brainForms" :key="b.key" :title="b.label" :sub="b.description">
        <div class="space-y-3 text-sm" :data-testid="`inmo-brain-${b.key}`">
          <label v-if="b.key !== 'general'" class="flex items-center gap-2"><input v-model="b.enabled" type="checkbox" :data-testid="`inmo-brain-enabled-${b.key}`"> Activo en mi agencia</label>
          <p v-else class="text-xs text-stone-500">El perfil General no se puede desactivar: es el de reserva.</p>
          <div>
            <p class="mb-1 text-xs font-semibold text-stone-600">Herramientas</p>
            <div class="flex flex-wrap gap-x-4 gap-y-1">
              <label v-for="t in b.baseTools" :key="t" class="flex items-center gap-1.5 text-xs">
                <input v-model="b.tools" type="checkbox" :value="t" :data-testid="`inmo-brain-tool-${b.key}-${t}`"> {{ toolLabel(t) }}
                <span v-if="!b.availableTools.includes(t) && b.tools.includes(t)" class="text-stone-400" title="Tu usuario no tiene permiso para esta herramienta">(sin permiso)</span>
              </label>
            </div>
          </div>
          <label class="block">
            <span class="mb-1 block text-xs font-semibold text-stone-600">Indicaciones de la agencia (opcional)</span>
            <textarea v-model="b.agencyInstructions" rows="2" maxlength="2000" class="cfg-input" placeholder="p. ej. Trata de usted a los clientes y menciona siempre la oficina de referencia." :data-testid="`inmo-brain-instructions-${b.key}`" />
          </label>
          <button type="button" class="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white disabled:opacity-50" :disabled="savingBrain === b.key" :data-testid="`inmo-brain-save-${b.key}`" @click="saveBrain(b)">{{ savingBrain === b.key ? 'Guardando…' : 'Guardar perfil' }}</button>
        </div>
      </AdminPanel>
    </section>
  </div>
</template>

<script setup lang="ts">
import AdminPanel from '~/components/admin/Panel.vue'
import { INMO_SOURCE_LABELS, inmoNoteLink, inmoToolLabel } from '~/utils/inmoCatalog'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'INMO: conocimiento, memoria y perfiles' })

const TABS = [
  { key: 'knowledge', label: 'Base de conocimiento' },
  { key: 'memory', label: 'Memoria' },
  { key: 'brains', label: 'Perfiles' },
] as const
const SOURCE_LABELS = INMO_SOURCE_LABELS
const ENTITY_NOUN: Record<string, string> = { contact: 'Contacto', lead: 'Lead', property: 'Propiedad', appointment: 'Cita', deal: 'Operación' }
const toolLabel = inmoToolLabel
const noteLink = (n: any) => inmoNoteLink(n)

const dt = useDash()
const toast = useToast()
const { confirm } = useConfirm()
const route = useRoute()
const tab = ref<(typeof TABS)[number]['key']>((['knowledge', 'memory', 'brains'] as const).find((k) => k === route.query.tab) ?? 'knowledge')

const errMsg = (e: any, fallback: string) => e?.data?.statusMessage || e?.statusMessage || fallback

// --- Base de conocimiento --------------------------------------------------------
const docs = ref<any[]>([])
const editingDoc = ref<any | null>(null)
const docForm = reactive({ title: '', tags: '', body: '', active: true })
const savingDoc = ref(false)
const probe = ref('')
const probing = ref(false)
const probeResult = ref<any | null>(null)

async function loadDocs() {
  const res = await $fetch<any>('/api/admin/knowledge-documents', { params: { perPage: 100 } }).catch(() => null)
  docs.value = res?.rows || []
}
function resetDoc() {
  editingDoc.value = null
  Object.assign(docForm, { title: '', tags: '', body: '', active: true })
}
function editDoc(d: any) {
  editingDoc.value = d
  Object.assign(docForm, { title: d.title, tags: d.tags || '', body: d.body, active: d.status !== 'archived' })
}
async function saveDoc() {
  savingDoc.value = true
  const body = { title: docForm.title, tags: docForm.tags, body: docForm.body, status: docForm.active ? 'active' : 'archived' }
  try {
    if (editingDoc.value) await $fetch(`/api/admin/knowledge-documents/${editingDoc.value.id}`, { method: 'PUT', body })
    else await $fetch('/api/admin/knowledge-documents', { method: 'POST', body })
    toast.success('Documento guardado')
    resetDoc()
    await loadDocs()
  } catch (e: any) {
    toast.error(errMsg(e, 'No se pudo guardar el documento'))
  } finally {
    savingDoc.value = false
  }
}
async function deleteDoc(d: any) {
  if (!(await confirm(`«${d.title}» deja de estar disponible para INMO.`, { title: '¿Eliminar documento?', confirmLabel: 'Eliminar', danger: true }))) return
  try {
    await $fetch(`/api/admin/knowledge-documents/${d.id}`, { method: 'DELETE' })
    await loadDocs()
  } catch (e: any) {
    toast.error(errMsg(e, 'No se pudo eliminar'))
  }
}
async function testSearch() {
  probing.value = true
  try {
    const res = await $fetch<any>('/api/admin/domain-tools', { method: 'POST', body: { tool: 'search_knowledge', input: { query: probe.value, limit: 8 } } })
    probeResult.value = res.output
  } catch (e: any) {
    toast.error(e?.data?.error?.message || 'No se pudo buscar')
  } finally {
    probing.value = false
  }
}

// --- Memoria -----------------------------------------------------------------------
const memory = ref<any[]>([])
async function loadMemory() {
  const res = await $fetch<any>('/api/admin/notes', { params: { source: 'inmo', perPage: 100 } }).catch(() => null)
  memory.value = res?.rows || []
}
async function forget(n: any) {
  if (!(await confirm('La nota pasa a la papelera y INMO deja de recordarla.', { title: '¿Olvidar este dato?', confirmLabel: 'Olvidar', danger: true }))) return
  try {
    await $fetch(`/api/admin/notes/${n.id}`, { method: 'DELETE' })
    await loadMemory()
  } catch (e: any) {
    toast.error(errMsg(e, 'No se pudo borrar'))
  }
}

// --- Perfiles ------------------------------------------------------------------------
interface BrainForm { key: string; label: string; description: string; enabled: boolean; tools: string[]; baseTools: string[]; availableTools: string[]; agencyInstructions: string; settingsId: number | null }
const brainForms = ref<BrainForm[]>([])
const savingBrain = ref<string | null>(null)
async function loadBrains() {
  const res = await $fetch<any>('/api/admin/domain-tools', { params: { view: 'brains' } }).catch(() => null)
  brainForms.value = (res?.brains || []).map((b: any) => ({ key: b.key, label: b.label, description: b.description, enabled: b.enabled, tools: [...b.tools], baseTools: b.baseTools, availableTools: b.availableTools, agencyInstructions: b.agencyInstructions || '', settingsId: b.settingsId }))
}
async function saveBrain(b: BrainForm) {
  savingBrain.value = b.key
  const body = { brainKey: b.key, enabled: b.enabled ? 1 : 0, instructions: b.agencyInstructions, toolsJson: b.baseTools.filter((t) => b.tools.includes(t)) }
  try {
    if (b.settingsId) await $fetch(`/api/admin/inmo-brains/${b.settingsId}`, { method: 'PUT', body })
    else await $fetch('/api/admin/inmo-brains', { method: 'POST', body })
    toast.success(`Perfil «${b.label}» guardado`)
    await loadBrains()
  } catch (e: any) {
    toast.error(errMsg(e, 'No se pudo guardar el perfil'))
  } finally {
    savingBrain.value = null
  }
}

watch(
  tab,
  (t) => {
    if (t === 'knowledge') loadDocs()
    else if (t === 'memory') loadMemory()
    else loadBrains()
  },
  { immediate: true },
)
</script>

<style scoped>
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
</style>

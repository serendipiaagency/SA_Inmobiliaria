<!--
  INMO (FASE 30 + bloque N8b, INMO Intelligence) — el asistente sobre los
  datos estructurados de la agencia. Esta página no decide nada: manda cada
  turno a POST /api/admin/domain-tools { mode: 'inmo', conversationId, brain }
  y pinta lo que vuelve. Las propiedades, contactos y citas salen de las
  Domain Tools (FASE 31) con el RBAC de la sesión; las acciones con efectos
  esperan a «Confirmar».

  N8b: la conversación la guarda el servidor (de este usuario, en esta
  agencia) y se puede reanudar o borrar; el «cerebro» elige el perfil y sus
  herramientas; cada respuesta enseña sus fuentes citables (F1, F2…) y avisa
  si cita una que no existe; y los workflows guiados viven a la derecha.
-->
<template>
  <div class="mx-auto flex max-w-7xl flex-col gap-5 lg:flex-row">
    <!-- Memoria: conversaciones guardadas de este usuario -->
    <aside class="w-full shrink-0 lg:w-56" data-testid="inmo-conversations">
      <button type="button" class="mb-3 w-full rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium hover:border-ink" data-testid="inmo-reset" @click="reset">+ Nueva conversación</button>
      <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Conversaciones</h2>
      <p v-if="!conversations.length" class="text-xs text-stone-400">Se guardan solas al hablar con INMO. Sólo las ves tú.</p>
      <ul class="space-y-1">
        <li v-for="c in conversations" :key="c.id" class="group flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs" :class="c.id === conversationId ? 'bg-ink text-white' : 'hover:bg-stone-100'" :data-testid="`inmo-conversation-${c.id}`">
          <button type="button" class="min-w-0 flex-1 truncate text-left" :title="c.title" @click="resume(c.id)">{{ c.title }}</button>
          <button type="button" class="shrink-0 opacity-60 hover:opacity-100" title="Borrar conversación" :data-testid="`inmo-conversation-delete-${c.id}`" @click="removeConversation(c.id)">✕</button>
        </li>
      </ul>
    </aside>

    <section class="min-w-0 flex-1">
      <header class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold">INMO</h1>
          <p class="mt-1 text-sm text-stone-500">Pregunta por propiedades, contactos, compatibilidades, visitas o cómo se hace algo. Responde sólo con datos reales de tu agencia y cita sus fuentes.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <label class="flex items-center gap-1.5">
            <span class="text-stone-500">Perfil</span>
            <select v-model="brain" class="inmo-input !w-auto" data-testid="inmo-brain-select" :disabled="busy">
              <option v-for="b in enabledBrains" :key="b.key" :value="b.key">{{ b.label }}</option>
            </select>
          </label>
          <NuxtLink to="/admin/inmo-ajustes" class="text-stone-500 hover:text-ink">Conocimiento, memoria y perfiles →</NuxtLink>
        </div>
      </header>
      <p v-if="currentBrain" class="-mt-2 mb-4 text-xs text-stone-500" data-testid="inmo-brain-description">
        {{ currentBrain.description }}
        <template v-if="currentBrain.availableTools?.length"> · Puede usar: {{ currentBrain.availableTools.map(toolLabel).join(', ') }}.</template>
      </p>

      <div v-if="configError" class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="inmo-not-configured">
        {{ configError }}
      </div>

      <div class="space-y-3" data-testid="inmo-thread">
        <div v-if="!turns.length" class="rounded-xl border border-dashed border-line p-5 text-sm text-stone-500">
          <p class="mb-3">Prueba con algo como:</p>
          <div class="flex flex-wrap gap-2">
            <button v-for="s in suggestions" :key="s" type="button" class="rounded-full border border-line bg-white px-3 py-1.5 text-xs text-stone-700 hover:border-ink" @click="ask(s)">{{ s }}</button>
          </div>
        </div>

        <div v-for="(t, i) in turns" :key="i" :class="t.role === 'user' ? 'flex justify-end' : ''">
          <div v-if="t.role === 'user'" class="max-w-[85%] rounded-2xl bg-ink px-4 py-2.5 text-sm text-white" data-testid="inmo-user-msg">{{ t.text }}</div>
          <div v-else class="max-w-[95%] rounded-2xl border border-line bg-white px-4 py-3 text-sm" data-testid="inmo-reply">
            <p v-if="t.text" class="whitespace-pre-wrap leading-relaxed">{{ t.text }}</p>
            <p v-else-if="t.error" class="text-red-700" data-testid="inmo-error">{{ t.error }}</p>
            <!-- Procedencia (§13): qué herramientas produjeron esta respuesta -->
            <div v-if="t.provenance?.length" class="mt-2 flex flex-wrap gap-1.5" data-testid="inmo-provenance">
              <span
                v-for="(p, j) in t.provenance"
                :key="j"
                class="rounded-full px-2 py-0.5 text-[11px]"
                :class="p.ok ? 'bg-stone-100 text-stone-600' : 'bg-red-50 text-red-700'"
                :data-testid="`inmo-source-${p.tool}`"
              >
                {{ toolLabel(p.tool) }}<template v-if="p.results !== undefined"> · {{ p.results }} resultado{{ p.results === 1 ? '' : 's' }}</template><template v-if="!p.ok"> · {{ p.errorCode }}</template>
              </span>
            </div>
            <!-- Fuentes citables (RAG, bloque N8b) -->
            <div v-if="t.citations?.length" class="mt-2 border-t border-line pt-2" data-testid="inmo-citations">
              <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Fuentes</p>
              <ul class="space-y-0.5 text-xs">
                <li v-for="c in t.citations" :key="c.ref" :data-testid="`inmo-citation-${c.ref}`">
                  <span class="font-mono text-stone-500">[{{ c.ref }}]</span>
                  <NuxtLink v-if="c.url" :to="c.url" class="ml-1 hover:underline">{{ c.title }}</NuxtLink>
                  <span v-else class="ml-1">{{ c.title }}</span>
                </li>
              </ul>
            </div>
            <p v-else-if="t.provenance?.some((p) => p.tool === 'search_knowledge' && p.ok && p.results === 0)" class="mt-2 text-xs text-stone-500" data-testid="inmo-no-sources">
              No se encontró ninguna fuente para esta pregunta.
            </p>
            <p v-if="t.unknownRefs?.length" class="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900" data-testid="inmo-unknown-refs">
              Ojo: la respuesta cita {{ t.unknownRefs.map((r) => `[${r}]`).join(', ') }}, que no corresponde a ninguna fuente de esta consulta.
            </p>
          </div>
        </div>

        <!-- Confirmación explícita (§20) -->
        <div v-if="pending" class="rounded-2xl border-2 border-ink bg-white p-4 text-sm" data-testid="inmo-pending">
          <p class="font-medium">INMO quiere {{ toolLabel(pending.tool).toLowerCase() }}:</p>
          <dl class="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            <template v-for="(v, k) in pending.input" :key="k">
              <dt class="text-stone-500">{{ k }}</dt>
              <dd class="break-words font-mono">{{ typeof v === 'object' ? JSON.stringify(v) : v }}</dd>
            </template>
          </dl>
          <p class="mt-2 text-xs text-stone-500">No se hace nada hasta que confirmes.</p>
          <div class="mt-3 flex gap-2">
            <button type="button" class="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white disabled:opacity-50" :disabled="busy" data-testid="inmo-confirm" @click="resolve(true)">Confirmar</button>
            <button type="button" class="rounded-lg border border-line px-4 py-2 text-xs font-medium disabled:opacity-50" :disabled="busy" data-testid="inmo-cancel" @click="resolve(false)">Cancelar</button>
          </div>
        </div>

        <div v-if="busy" class="text-xs text-stone-500" data-testid="inmo-busy">INMO está consultando los datos…</div>
      </div>

      <form class="mt-4 flex gap-2" @submit.prevent="ask(draft)">
        <input
          v-model="draft"
          class="inmo-input flex-1"
          :placeholder="pending ? 'Confirma o cancela la acción pendiente' : 'Escribe tu pregunta…'"
          :disabled="busy || Boolean(pending)"
          maxlength="4000"
          data-testid="inmo-input"
        >
        <button type="submit" class="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" :disabled="busy || Boolean(pending) || !draft.trim()" data-testid="inmo-send">Enviar</button>
      </form>
    </section>

    <aside class="w-full shrink-0 space-y-5 lg:w-64">
      <!-- Contexto de entidades (§16): lo ya resuelto, por id -->
      <div>
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">En contexto</h2>
        <p v-if="!entities.length" class="text-xs text-stone-400">Aquí aparecerán los contactos, leads, propiedades y citas con los que vaya trabajando INMO.</p>
        <ul class="space-y-1.5" data-testid="inmo-entities">
          <li v-for="e in entities" :key="`${e.type}:${e.id}`" class="rounded-lg border border-line bg-white px-3 py-2 text-xs">
            <span class="text-stone-500">{{ entityLabel(e.type) }} #{{ e.id }}</span>
            <NuxtLink v-if="entityLink(e)" :to="entityLink(e)!" class="block truncate font-medium hover:underline">{{ e.label || 'Abrir' }}</NuxtLink>
            <span v-else-if="e.label" class="block truncate font-medium">{{ e.label }}</span>
          </li>
        </ul>
      </div>
      <InmoWorkflowPanel :entities="entities" />
    </aside>
  </div>
</template>

<script setup lang="ts">
import InmoWorkflowPanel from '~/components/admin/inmo/InmoWorkflowPanel.vue'
import { inmoEntityLabel, inmoEntityLink, inmoToolLabel } from '~/utils/inmoCatalog'

definePageMeta({ layout: 'admin', middleware: 'admin' })

interface Provenance { tool: string; ok: boolean; target: { type: string; id: number } | null; errorCode?: string; results?: number }
interface Citation { ref: string; sourceType: string; sourceId: string | number; title: string; url: string | null }
interface Turn { role: 'user' | 'assistant'; text?: string | null; error?: string | null; provenance?: Provenance[]; citations?: Citation[]; unknownRefs?: string[] }
interface Entity { type: string; id: number; label?: string | null }
interface Pending { toolUseId: string; tool: string; description: string; input: Record<string, unknown> }
interface Brain { key: string; label: string; description: string; enabled: boolean; availableTools: string[] }

const suggestions = [
  'Busca pisos en Chamberí con terraza por menos de 650.000 €',
  '¿Qué propiedades de 2ª mano tenemos con piscina?',
  'Busca a María García y dime sus leads',
  '¿Cómo se marca un lead como perdido?',
]

const toolLabel = inmoToolLabel
const entityLabel = inmoEntityLabel
const entityLink = (e: Entity) => inmoEntityLink(e)
const toast = useToast()
const { confirm } = useConfirm()

const turns = ref<Turn[]>([])
const entities = ref<Entity[]>([])
const pending = ref<Pending | null>(null)
const draft = ref('')
const busy = ref(false)
const configError = ref<string | null>(null)
const conversationId = ref<number | null>(null)
const conversations = ref<{ id: number; title: string; updatedAt: string }[]>([])
const brains = ref<Brain[]>([])
const brain = ref('general')

const enabledBrains = computed(() => brains.value.filter((b) => b.enabled))
const currentBrain = computed(() => brains.value.find((b) => b.key === brain.value) || null)

async function loadConversations() {
  const res = await $fetch<any>('/api/admin/domain-tools', { params: { view: 'conversations' } }).catch(() => null)
  conversations.value = res?.rows || []
}
async function loadBrains() {
  const res = await $fetch<any>('/api/admin/domain-tools', { params: { view: 'brains' } }).catch(() => null)
  brains.value = res?.brains || []
}

async function send(body: Record<string, unknown>) {
  busy.value = true
  try {
    const res = await $fetch<any>('/api/admin/domain-tools', { method: 'POST', body: { mode: 'inmo', conversationId: conversationId.value, brain: brain.value, ...body } })
    const isNew = conversationId.value !== res.conversationId
    conversationId.value = res.conversationId
    entities.value = res.entities
    pending.value = res.pending
    if (res.reply || res.provenance?.length || !res.pending) turns.value.push({ role: 'assistant', text: res.reply, provenance: res.provenance, citations: res.citations, unknownRefs: res.unknownRefs })
    if (isNew) loadConversations()
  } catch (e: any) {
    const err = e?.data?.error || e?.data?.data?.error
    if (err?.code === 'AI_NOT_CONFIGURED') configError.value = err.message
    turns.value.push({ role: 'assistant', error: err?.message || e?.data?.statusMessage || 'No se pudo completar la consulta.' })
  } finally {
    busy.value = false
  }
}

async function ask(text: string) {
  const t = text.trim()
  if (!t || busy.value || pending.value) return
  turns.value.push({ role: 'user', text: t })
  draft.value = ''
  await send({ message: t })
}

async function resolve(approve: boolean) {
  if (!pending.value) return
  const toolUseId = pending.value.toolUseId
  turns.value.push({ role: 'user', text: approve ? 'Confirmado.' : 'Cancelado.' })
  await send({ resolve: { toolUseId, approve } })
}

async function resume(id: number) {
  if (busy.value) return
  try {
    const c = await $fetch<any>('/api/admin/domain-tools', { params: { view: 'conversation', id } })
    conversationId.value = c.id
    turns.value = c.turns
    entities.value = c.entities
    pending.value = c.pending
    if (c.brainKey && brains.value.some((b) => b.key === c.brainKey && b.enabled)) brain.value = c.brainKey
    configError.value = null
  } catch {
    toast.error('No se pudo abrir la conversación')
  }
}

async function removeConversation(id: number) {
  if (!(await confirm('Se borra la conversación entera. Las notas que guardaste desde ella siguen en sus fichas.', { title: '¿Borrar conversación?', confirmLabel: 'Borrar', danger: true }))) return
  try {
    await $fetch('/api/admin/domain-tools', { method: 'POST', body: { mode: 'inmo-conversation', action: 'delete', id } })
    if (conversationId.value === id) reset()
    await loadConversations()
  } catch {
    toast.error('No se pudo borrar la conversación')
  }
}

function reset() {
  turns.value = []
  entities.value = []
  pending.value = null
  configError.value = null
  conversationId.value = null
}

onMounted(() => {
  loadConversations()
  loadBrains()
})
</script>

<style scoped>
.inmo-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
</style>

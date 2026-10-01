<!--
  INMO (FASE 30) — el asistente sobre los datos estructurados de la agencia.
  Esta página no decide nada: manda la conversación a
  POST /api/admin/domain-tools { mode: 'inmo' } y pinta lo que vuelve. Las
  propiedades, contactos y citas que aparecen salen de las Domain Tools
  (FASE 31) con el RBAC de la sesión; las acciones con efectos fuera del
  panel esperan a que se pulse «Confirmar».
-->
<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-5 lg:flex-row">
    <section class="min-w-0 flex-1">
      <header class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold">INMO</h1>
          <p class="mt-1 text-sm text-stone-500">Pregunta por propiedades, contactos, compatibilidades o visitas. Responde sólo con datos reales de tu agencia.</p>
        </div>
        <button v-if="turns.length" type="button" class="text-xs font-medium text-stone-500 hover:text-ink" data-testid="inmo-reset" @click="reset">Nueva conversación</button>
      </header>

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
          class="cfg-input flex-1"
          :placeholder="pending ? 'Confirma o cancela la acción pendiente' : 'Escribe tu pregunta…'"
          :disabled="busy || Boolean(pending)"
          maxlength="4000"
          data-testid="inmo-input"
        >
        <button type="submit" class="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" :disabled="busy || Boolean(pending) || !draft.trim()" data-testid="inmo-send">Enviar</button>
      </form>
    </section>

    <!-- Contexto de entidades (§16): lo ya resuelto, por id -->
    <aside class="w-full shrink-0 lg:w-64">
      <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">En contexto</h2>
      <p v-if="!entities.length" class="text-xs text-stone-400">Aquí aparecerán los contactos, leads, propiedades y citas con los que vaya trabajando INMO.</p>
      <ul class="space-y-1.5" data-testid="inmo-entities">
        <li v-for="e in entities" :key="`${e.type}:${e.id}`" class="rounded-lg border border-line bg-white px-3 py-2 text-xs">
          <span class="text-stone-500">{{ entityLabel(e.type) }} #{{ e.id }}</span>
          <NuxtLink v-if="entityLink(e)" :to="entityLink(e)!" class="block truncate font-medium hover:underline">{{ e.label || 'Abrir' }}</NuxtLink>
          <span v-else-if="e.label" class="block truncate font-medium">{{ e.label }}</span>
        </li>
      </ul>
    </aside>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

interface Provenance { tool: string; ok: boolean; target: { type: string; id: number } | null; errorCode?: string; results?: number }
interface Turn { role: 'user' | 'assistant'; text?: string | null; error?: string | null; provenance?: Provenance[] }
interface Entity { type: string; id: number; label?: string | null }
interface Pending { toolUseId: string; tool: string; description: string; input: Record<string, unknown> }

const suggestions = [
  'Busca pisos en Chamberí con terraza por menos de 650.000 €',
  '¿Qué propiedades de 2ª mano tenemos con piscina?',
  'Busca a María García y dime sus leads',
]

const TOOL_LABELS: Record<string, string> = {
  search_properties: 'Buscar propiedades',
  get_property: 'Consultar propiedad',
  create_lead: 'Crear lead',
  update_lead: 'Actualizar lead',
  create_contact: 'Crear contacto',
  find_contacts: 'Buscar contactos',
  update_buyer_requirements: 'Guardar necesidad',
  find_matches: 'Compatibilidades',
  book_viewing: 'Agendar visita',
  reschedule_viewing: 'Mover visita',
  cancel_viewing: 'Cancelar visita',
  create_task: 'Crear tarea',
  send_property: 'Enviar propiedad',
  create_property_selection: 'Guardar selección',
  create_offer: 'Crear oferta',
}
const toolLabel = (name: string) => TOOL_LABELS[name] || name

const ENTITY_LABELS: Record<string, string> = {
  contact: 'Contacto',
  lead: 'Lead',
  agent_property: 'Propiedad 2ª mano',
  developer_property: 'Propiedad (web)',
  appointment: 'Cita',
  task: 'Tarea',
  buyer_requirement: 'Necesidad',
  offer: 'Oferta',
  property_selection: 'Selección',
  comms_message: 'Mensaje',
}
const entityLabel = (type: string) => ENTITY_LABELS[type] || type
function entityLink(e: Entity): string | null {
  switch (e.type) {
    case 'contact': return `/admin/contactos/${e.id}`
    case 'lead': return `/admin/leads?ids=${e.id}`
    case 'agent_property': return `/admin/properties/${e.id}`
    case 'developer_property': return `/admin/developer-properties/${e.id}`
    case 'appointment': return '/admin/visitas'
    case 'task': return '/admin/tareas'
    case 'buyer_requirement': return '/admin/compatibilidades'
    default: return null
  }
}

const turns = ref<Turn[]>([])
const history = ref<unknown[]>([])
const entities = ref<Entity[]>([])
const pending = ref<Pending | null>(null)
const draft = ref('')
const busy = ref(false)
const configError = ref<string | null>(null)

async function send(body: Record<string, unknown>) {
  busy.value = true
  try {
    const res = await $fetch<any>('/api/admin/domain-tools', { method: 'POST', body: { mode: 'inmo', messages: history.value, entities: entities.value, ...body } })
    history.value = res.messages
    entities.value = res.entities
    pending.value = res.pending
    if (res.reply || res.provenance?.length || !res.pending) turns.value.push({ role: 'assistant', text: res.reply, provenance: res.provenance })
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

function reset() {
  turns.value = []
  history.value = []
  entities.value = []
  pending.value = null
  configError.value = null
}
</script>

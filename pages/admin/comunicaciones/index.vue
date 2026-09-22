<template>
  <div class="-mx-5 -my-6 flex h-[calc(100vh-4rem)] flex-col lg:-mx-8 lg:-my-8" data-testid="comms-inbox">
    <!-- Cabecera -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-3">
      <div>
        <h1 class="text-lg font-semibold tracking-tight">Comunicaciones</h1>
        <p class="text-[12px] text-stone-500">
          <template v-if="overview?.configured">WhatsApp · {{ channelLabel }}</template>
          <template v-else>Sin número conectado</template>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <NuxtLink v-if="canWrite('system')" to="/admin/comunicaciones/configuracion" class="btn-quiet !py-2" data-testid="comms-config-link">Configurar</NuxtLink>
      </div>
    </div>

    <!-- Sin canal: se explica, con lo que sí se puede hacer -->
    <div v-if="overview && !overview.configured && !selectedId" class="mx-auto mt-10 max-w-lg px-6 text-center" data-testid="comms-not-configured">
      <p class="text-[15px] font-semibold text-ink">Todavía no hay ningún número de WhatsApp conectado</p>
      <p class="mt-2 text-[13px] leading-relaxed text-stone-500">
        Conecta el número de la agencia (Meta WhatsApp Cloud API o Twilio) para recibir y responder mensajes aquí, compartir propiedades y, con Meta, llamar por WhatsApp desde el panel.
        Mientras tanto, los botones «WhatsApp» de Clientes y Leads abren la app de WhatsApp con el enlace oficial.
      </p>
      <p v-if="!overview.encryptionAvailable" class="mt-3 rounded-lg bg-amber-50 p-3 text-[12px] text-amber-800">
        Este Worker no tiene la clave <code>COMMS_CREDENTIALS_ENCRYPTION_KEY</code>: hasta que se configure no se puede conectar ningún número (Estado del sistema lo indica).
      </p>
      <NuxtLink v-if="canWrite('system')" to="/admin/comunicaciones/configuracion" class="btn-primary mt-5 !px-6 !py-2.5">Conectar un número</NuxtLink>
    </div>

    <div v-else class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_300px]">
      <!-- Lista -->
      <aside class="min-h-0 border-r border-line bg-white" :class="selectedId ? 'hidden lg:block' : ''">
        <AdminCommsConversationList ref="list" :selected-id="selectedId" :team="team" :refresh-key="listKey" @select="select" />
      </aside>

      <!-- Hilo -->
      <section class="flex min-h-0 flex-col bg-[#efeae2]" :class="selectedId ? '' : 'hidden lg:flex'">
        <div v-if="!selectedId" class="flex flex-1 items-center justify-center text-center text-sm text-stone-500" data-testid="comms-empty">
          <div>
            <p class="font-medium">Elige una conversación</p>
            <p class="mt-1 text-xs text-stone-400">O abre una desde la ficha de un cliente o lead con el botón «WhatsApp».</p>
          </div>
        </div>
        <template v-else-if="thread">
          <div class="flex items-center gap-3 border-b border-line bg-white px-4 py-2.5">
            <button type="button" class="rounded-lg p-1 text-stone-500 hover:bg-stone-100 lg:hidden" aria-label="Volver" @click="select(null)">←</button>
            <div class="min-w-0 flex-1">
              <p class="truncate text-[13px] font-semibold text-ink" data-testid="thread-name">{{ thread.conversation.contact.name }}</p>
              <p class="truncate text-[11px] text-stone-500">{{ thread.conversation.contact.phoneDisplay }} · {{ thread.channel.label }}</p>
            </div>
            <button type="button" class="rounded-lg border border-line px-2 py-1 text-[11px] text-stone-600 hover:border-ink xl:hidden" @click="panelOpen = !panelOpen">{{ panelOpen ? 'Ocultar ficha' : 'Ficha' }}</button>
          </div>
          <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="comms-thread">
            <p v-if="!thread.messages.length" class="py-10 text-center text-xs text-stone-500">Todavía no hay mensajes en este hilo.</p>
            <AdminCommsMessageBubble v-for="m in thread.messages" :key="m.id" :m="m" />
          </div>
          <AdminCommsComposer
            ref="composer"
            :conversation-id="thread.conversation.id"
            :window="thread.conversation.window"
            :consent-status="thread.conversation.contact.consentStatus"
            :channel-active="thread.channel.status === 'active'"
            :capabilities="thread.capabilities"
            :templates-count="thread.templates.length"
            @sent="onSent"
            @template="templateOpen = true"
            @property="propertyOpen = 'share'"
          />
        </template>
        <div v-else class="flex flex-1 items-center justify-center text-xs text-stone-400">Cargando…</div>
      </section>

      <!-- Ficha -->
      <aside v-if="thread && selectedId" class="min-h-0 border-l border-line bg-white" :class="panelOpen ? 'fixed inset-y-0 right-0 z-30 w-80 shadow-2xl xl:static xl:z-auto xl:w-auto xl:shadow-none' : 'hidden xl:block'">
        <AdminCommsContactPanel
          :conversation="thread.conversation"
          :contact="thread.conversation.contact"
          :calls="thread.calls"
          :team="thread.team"
          :property="thread.property"
          :capabilities="thread.capabilities"
          @changed="reloadThread"
          @share-property="propertyOpen = 'share'"
          @pick-property="propertyOpen = 'context'"
        />
      </aside>
    </div>

    <AdminCommsTemplatePickerModal v-if="templateOpen && thread" :conversation-id="thread.conversation.id" :templates="thread.templates" @close="templateOpen = false" @sent="onTemplateSent" />
    <AdminCommsPropertyPickerModal v-if="propertyOpen && thread" :title="propertyOpen === 'share' ? 'Compartir propiedad' : 'Propiedad de contexto'" @close="propertyOpen = null" @pick="onPropertyPicked" />
  </div>
</template>

<script setup lang="ts">
/**
 * La bandeja del Centro de Comunicaciones: lista de hilos, el hilo elegido
 * y la ficha del contacto. El "tiempo real" es el sondeo de useComms(): al
 * abrir esta página se acelera a 4 s y cada cambio que llega se aplica en
 * sitio (lista y, si es el hilo abierto, sus mensajes).
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Comunicaciones' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const comms = useComms()
const { canWrite } = useAdminPermissions()
comms.usePollingRate(4000)

const overview = ref<any>(null)
const team = ref<{ id: number; name: string }[]>([])
const list = ref<any>(null)
const listKey = ref(0)
const scroller = ref<HTMLElement | null>(null)
const composer = ref<any>(null)
const panelOpen = ref(false)
const templateOpen = ref(false)
const propertyOpen = ref<'share' | 'context' | null>(null)

const selectedId = computed(() => {
  const v = Number(route.query.conversation)
  return Number.isInteger(v) && v > 0 ? v : null
})
const thread = ref<any>(null)
const channelLabel = computed(() => {
  const ch = overview.value?.channels?.find((c: any) => c.id === overview.value?.defaultChannelId)
  return ch ? `${ch.label} (${ch.phoneE164})` : ''
})

onMounted(async () => {
  overview.value = await comms.loadOverview(true)
  const r = await $fetch<{ rows: { id: number; name: string }[] }>('/api/admin/saas/agents').catch(() => null)
  team.value = r?.rows || []
})

function select(id: number | null) {
  router.replace({ query: { ...route.query, conversation: id ? String(id) : undefined } })
}

async function scrollToBottom() {
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}

async function loadThread(id: number) {
  try {
    const data = await $fetch<any>(`/api/admin/comms/conversations/${id}`)
    thread.value = data
    await scrollToBottom()
    if (data.conversation.unreadCount > 0) {
      await $fetch(`/api/admin/comms/conversations/${id}/read`, { method: 'POST' }).catch(() => null)
      data.conversation.unreadCount = 0
      list.value?.upsert(data.conversation)
      comms.poll()
    }
  } catch (e: any) {
    thread.value = null
    toast.error(e?.statusCode === 404 ? 'Esta conversación no existe o no es de tu agencia.' : 'No se pudo cargar la conversación')
    select(null)
  }
}
async function reloadThread() {
  if (selectedId.value) await loadThread(selectedId.value)
}
watch(selectedId, (id) => {
  thread.value = null
  panelOpen.value = false
  if (id) loadThread(id)
}, { immediate: true })

function onSent(message: any) {
  if (!thread.value) return
  const idx = thread.value.messages.findIndex((m: any) => m.id === message.id)
  if (idx >= 0) thread.value.messages.splice(idx, 1, message)
  else thread.value.messages.push(message)
  thread.value.conversation.lastMessageAt = message.createdAt
  thread.value.conversation.lastMessagePreview = message.preview
  list.value?.upsert(thread.value.conversation)
  scrollToBottom()
}
function onTemplateSent(message: any) {
  templateOpen.value = false
  onSent(message)
  toast.success('Plantilla enviada')
}
async function onPropertyPicked(p: any) {
  const mode = propertyOpen.value
  propertyOpen.value = null
  if (!thread.value) return
  try {
    if (mode === 'share') {
      const r = await $fetch<{ message: any }>(`/api/admin/comms/conversations/${thread.value.conversation.id}/share-property`, { method: 'POST', body: { propertyId: p.id } })
      onSent(r.message)
      toast.success('Propiedad enviada')
    } else {
      await $fetch(`/api/admin/comms/conversations/${thread.value.conversation.id}`, { method: 'PATCH', body: { propertyId: p.id } })
    }
    await reloadThread()
  } catch (e: any) {
    if (e?.data?.message) onSent(e.data.message)
    toast.error(e?.data?.statusMessage || e?.data?.error || 'No se pudo enviar la propiedad', 6000)
  }
}

// Cambios que llegan por el sondeo: la lista se actualiza en sitio; el hilo abierto se recarga si cambió.
watch(
  () => comms.updates.value,
  (u) => {
    if (!u) return
    for (const conv of u.conversations || []) list.value?.upsert(conv)
    if (selectedId.value && (u.conversations || []).some((c: any) => c.id === selectedId.value)) reloadThread()
  },
)
</script>

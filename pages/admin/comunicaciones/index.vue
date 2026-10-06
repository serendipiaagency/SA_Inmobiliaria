<template>
  <div class="-mx-5 -my-6 flex h-[calc(100vh-4rem)] flex-col lg:-mx-8 lg:-my-8" data-testid="comms-inbox">
    <!-- Cabecera -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-3">
      <div>
        <h1 class="text-lg font-semibold tracking-tight">Comunicaciones</h1>
        <p class="text-[12px] text-stone-500">
          <template v-if="overview?.configured">WhatsApp · {{ channelLabel }}</template>
          <template v-else>Sin número de WhatsApp conectado</template>
          · Formularios web<template v-if="overview?.settings?.webChatEnabled"> · Chat web</template>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <NuxtLink v-if="canWrite('system')" to="/admin/comunicaciones/configuracion" class="btn-quiet !py-2" data-testid="comms-config-link">Configurar</NuxtLink>
      </div>
    </div>

    <!-- Sin número de WhatsApp: se explica, pero la bandeja sigue sirviendo para formularios y chat web -->
    <div v-if="overview && !overview.configured && !selectedKey" class="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-[12px] text-amber-900" data-testid="comms-not-configured">
      <span class="font-semibold">Todavía no hay ningún número de WhatsApp conectado.</span>
      Aquí ya llegan los formularios de la web<template v-if="overview.settings?.webChatEnabled"> y el chat</template>, y se responden por email o por el chat.
      Para WhatsApp, conecta el número de la agencia (Meta WhatsApp Cloud API o Twilio); mientras tanto, los botones «WhatsApp» de Clientes y Leads abren la app con el enlace oficial.
      <span v-if="!overview.encryptionAvailable"> Falta además la clave <code>COMMS_CREDENTIALS_ENCRYPTION_KEY</code> del Worker (Estado del sistema lo indica).</span>
      <NuxtLink v-if="canWrite('system')" to="/admin/comunicaciones/configuracion" class="ml-1 font-semibold underline">Conectar un número</NuxtLink>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_300px]">
      <!-- Lista -->
      <aside class="min-h-0 border-r border-line bg-white" :class="selectedKey ? 'hidden lg:block' : ''">
        <AdminCommsConversationList ref="list" :selected-id="selectedKey" :team="team" :channels="overview?.channels || []" :refresh-key="listKey" @select="select" />
      </aside>

      <!-- Hilo -->
      <section class="flex min-h-0 flex-col bg-[#efeae2]" :class="selectedKey ? '' : 'hidden lg:flex'">
        <div v-if="!selectedKey" class="flex flex-1 items-center justify-center text-center text-sm text-stone-500" data-testid="comms-empty">
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
              <p class="truncate text-[11px] text-stone-500">
                <template v-if="isWeb">{{ thread.channel.label }}<template v-if="thread.conversation.formTypeLabel"> · {{ thread.conversation.formTypeLabel }}</template><template v-if="thread.conversation.contact.phoneDisplay"> · {{ thread.conversation.contact.phoneDisplay }}</template></template>
                <template v-else>{{ thread.conversation.contact.phoneDisplay }} · {{ thread.channel.label }}</template>
              </p>
            </div>
            <button type="button" class="rounded-lg border border-line px-2 py-1 text-[11px] text-stone-600 hover:border-ink xl:hidden" @click="panelOpen = !panelOpen">{{ panelOpen ? 'Ocultar ficha' : 'Ficha' }}</button>
          </div>
          <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="comms-thread">
            <p v-if="!thread.messages.length" class="py-10 text-center text-xs text-stone-500">Todavía no hay mensajes en este hilo.</p>
            <template v-if="isWeb">
              <WebMessageBubble v-for="m in thread.messages" :key="m.id" :m="m" />
            </template>
            <template v-else>
              <AdminCommsMessageBubble v-for="m in thread.messages" :key="m.id" :m="m" :retrying="retryingId === m.id" @retry="retryMessage" />
            </template>
          </div>
          <WebComposer v-if="isWeb" :conversation-key="thread.conversation.id" :reply="thread.reply" @sent="onSent" @property="onWebProperty" @whatsapp="continueOnWhatsApp" />
          <AdminCommsComposer
            v-else
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
      <aside v-if="thread && selectedKey" class="min-h-0 border-l border-line bg-white" :class="panelOpen ? 'fixed inset-y-0 right-0 z-30 w-80 shadow-2xl xl:static xl:z-auto xl:w-auto xl:shadow-none' : 'hidden xl:block'">
        <WebThreadPanel
          v-if="isWeb"
          :thread="thread"
          :team="thread.team"
          @changed="reloadThread"
          @pick-property="propertyOpen = 'context'"
          @whatsapp="continueOnWhatsApp"
        />
        <AdminCommsContactPanel
          v-else
          :conversation="thread.conversation"
          :contact="thread.conversation.contact"
          :calls="thread.calls"
          :team="thread.team"
          :property="thread.property"
          :capabilities="thread.capabilities"
          :lead="thread.lead"
          :crm-contact="thread.crmContact"
          :buyer-requirements="thread.buyerRequirements"
          :appointments="thread.appointments"
          @changed="reloadThread"
          @share-property="propertyOpen = 'share'"
          @pick-property="propertyOpen = 'context'"
        />
      </aside>
    </div>

    <AdminCommsTemplatePickerModal v-if="templateOpen && thread && !isWeb" :conversation-id="thread.conversation.id" :templates="thread.templates" @close="templateOpen = false" @sent="onTemplateSent" />
    <AdminCommsPropertyPickerModal v-if="propertyOpen && thread" :title="propertyOpen === 'share' ? 'Compartir propiedad' : 'Propiedad de contexto'" @close="propertyOpen = null" @pick="onPropertyPicked" />
  </div>
</template>

<script setup lang="ts">
import WebComposer from '~/components/admin/comms/WebComposer.vue'
import WebMessageBubble from '~/components/admin/comms/WebMessageBubble.vue'
import WebThreadPanel from '~/components/admin/comms/WebThreadPanel.vue'

/**
 * La bandeja del Centro de Comunicaciones: lista de hilos, el hilo elegido
 * y la ficha del contacto. El "tiempo real" es el sondeo de useComms(): al
 * abrir esta página se acelera a 4 s y cada cambio que llega se aplica en
 * sitio (lista y, si es el hilo abierto, sus mensajes).
 *
 * Núcleo N8a: junto a WhatsApp llegan los hilos web — formularios públicos
 * y chat de la web — con clave `w<n>` (`?conversation=w12`). Se responden
 * por el chat o por email (WebComposer) y, si hay teléfono y número
 * conectado, se continúan por WhatsApp abriendo su hilo real.
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

/** `12` (WhatsApp) o `w12` (hilo web). */
const selectedKey = computed(() => {
  const v = String(route.query.conversation || '')
  return /^w?[1-9]\d*$/.test(v) ? v : null
})
const thread = ref<any>(null)
const isWeb = computed(() => thread.value?.kind === 'web')
const channelLabel = computed(() => {
  const ch = overview.value?.channels?.find((c: any) => c.id === overview.value?.defaultChannelId)
  return ch ? `${ch.label} (${ch.phoneE164})` : ''
})

onMounted(async () => {
  overview.value = await comms.loadOverview(true)
  const r = await $fetch<{ rows: { id: number; name: string }[] }>('/api/admin/saas/agents').catch(() => null)
  team.value = r?.rows || []
})

function select(key: string | number | null) {
  router.replace({ query: { ...route.query, conversation: key ? String(key) : undefined } })
}

async function scrollToBottom() {
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}

async function loadThread(key: string) {
  try {
    const data = await $fetch<any>(`/api/admin/comms/conversations/${key}`)
    thread.value = data
    await scrollToBottom()
    if (data.conversation.unreadCount > 0) {
      await $fetch(`/api/admin/comms/conversations/${key}/read`, { method: 'POST' }).catch(() => null)
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
  if (selectedKey.value) await loadThread(selectedKey.value)
}
watch(
  selectedKey,
  (key) => {
    thread.value = null
    panelOpen.value = false
    if (key) loadThread(key)
  },
  { immediate: true },
)

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
const retryingId = ref<number | null>(null)
async function retryMessage(messageId: number) {
  if (!thread.value || retryingId.value) return
  retryingId.value = messageId
  try {
    const r = await $fetch<{ message: any }>(`/api/admin/comms/conversations/${thread.value.conversation.id}/messages`, { method: 'POST', body: { type: 'retry', messageId } })
    onSent(r.message)
    toast.success('Mensaje reenviado')
  } catch (e: any) {
    if (e?.data?.message) onSent(e.data.message)
    toast.error(e?.data?.statusMessage || e?.data?.error || 'El proveedor volvió a rechazarlo', 6000)
  } finally {
    retryingId.value = null
  }
}
/** Hilo web → su ficha por el canal de respuesta elegido en el compositor. */
const webShareVia = ref<'chat' | 'email' | null>(null)
async function onPropertyPicked(p: any) {
  const mode = propertyOpen.value
  propertyOpen.value = null
  if (!thread.value) return
  const id = thread.value.conversation.id
  try {
    if (mode === 'share') {
      const body = isWeb.value ? { type: 'property', via: webShareVia.value || (thread.value.reply?.chat?.available ? 'chat' : 'email'), propertyId: p.id, propertyKind: p.kind } : { propertyId: p.id, propertyKind: p.kind }
      const url = isWeb.value ? `/api/admin/comms/conversations/${id}/messages` : `/api/admin/comms/conversations/${id}/share-property`
      const r = await $fetch<{ message: any }>(url, { method: 'POST', body })
      onSent(r.message)
      toast.success('Propiedad enviada')
    } else {
      await $fetch(`/api/admin/comms/conversations/${id}`, { method: 'PATCH', body: { propertyId: p.id, propertyKind: p.kind } })
    }
    await reloadThread()
  } catch (e: any) {
    if (e?.data?.message) onSent(e.data.message)
    toast.error(e?.data?.statusMessage || e?.data?.error || 'No se pudo enviar la propiedad', 6000)
  }
}
function onWebProperty(via: 'chat' | 'email') {
  webShareVia.value = via
  propertyOpen.value = 'share'
}

/** Hilo web con teléfono → el hilo real de WhatsApp de esa persona (lo abre o lo encuentra). */
async function continueOnWhatsApp() {
  const t = thread.value
  if (!t?.reply?.whatsapp?.available) return
  try {
    const body = t.conversation.leadId ? { leadId: t.conversation.leadId, phone: t.reply.whatsapp.phone } : { phone: t.reply.whatsapp.phone }
    const r = await $fetch<{ id: number }>('/api/admin/comms/conversations', { method: 'POST', body })
    select(r.id)
    listKey.value++
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo abrir el hilo de WhatsApp', 6000)
  }
}

// Cambios que llegan por el sondeo: la lista se actualiza en sitio; el hilo abierto se recarga si cambió.
watch(
  () => comms.updates.value,
  (u) => {
    if (!u) return
    for (const conv of u.conversations || []) list.value?.upsert(conv)
    if (selectedKey.value && (u.conversations || []).some((c: any) => String(c.id) === selectedKey.value)) reloadThread()
  },
)
</script>

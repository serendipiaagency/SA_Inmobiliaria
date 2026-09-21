<template>
  <div class="flex h-full min-h-0 flex-col overflow-y-auto" data-testid="comms-contact-panel">
    <!-- Identidad -->
    <div class="border-b border-line p-4">
      <div class="flex items-start gap-3">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold" :class="contact.known ? 'bg-paper text-stone-600 ring-1 ring-line' : 'bg-amber-100 text-amber-800'">{{ dt.initials(contact.name) }}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-[14px] font-semibold text-ink" data-testid="contact-panel-name">{{ contact.name }}</p>
          <p class="text-[12px] text-stone-500">{{ contact.phoneDisplay }}</p>
          <p v-if="contact.displayName && contact.displayName !== contact.name" class="text-[11px] text-stone-400">En WhatsApp: {{ contact.displayName }}</p>
        </div>
      </div>

      <div v-if="!contact.known" class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3" data-testid="contact-unknown">
        <p class="text-[12px] font-medium text-amber-900">Contacto desconocido</p>
        <p class="mt-0.5 text-[11px] text-amber-800">Este teléfono no está en ningún cliente ni lead. Vincúlalo para que la conversación cuente en su ficha.</p>
        <button type="button" class="mt-2 rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-white" data-testid="contact-link-button" @click="linkOpen = true">Vincular o crear lead</button>
      </div>
      <div v-else class="mt-3 space-y-1 text-[12px]">
        <p v-if="contact.client">
          Cliente: <NuxtLink :to="`/admin/clientes/${contact.client.id}`" class="font-medium text-ink hover:underline" data-testid="contact-client-link">{{ contact.client.name }}</NuxtLink>
        </p>
        <p v-if="contact.lead">
          Lead: <NuxtLink to="/admin/leads" class="font-medium text-ink hover:underline">{{ contact.lead.name }}</NuxtLink> <span class="text-stone-400">({{ contact.lead.status }})</span>
        </p>
        <button type="button" class="text-[11px] text-stone-400 hover:text-ink hover:underline" @click="linkOpen = true">Cambiar vínculo</button>
      </div>
    </div>

    <!-- Acciones -->
    <div class="border-b border-line p-4">
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Acciones</p>
      <div class="grid grid-cols-2 gap-2">
        <button v-if="capabilities.calling" type="button" class="action-btn" :disabled="voice.active.value" data-testid="contact-call-whatsapp" @click="callWhatsApp">📞 Llamar por WhatsApp</button>
        <a v-else :href="`tel:${contact.phone}`" class="action-btn" data-testid="contact-call-phone">📞 Llamar (teléfono)</a>
        <button type="button" class="action-btn" data-testid="contact-log-call" @click="logOpen = true">📝 Registrar llamada</button>
        <button type="button" class="action-btn" data-testid="contact-follow-up" @click="followUpOpen = true">📅 Programar seguimiento</button>
        <button type="button" class="action-btn" data-testid="contact-share-property" @click="emit('share-property')">🏠 Compartir propiedad</button>
      </div>
      <div v-if="capabilities.callPermissions" class="mt-3 rounded-lg bg-stone-50 p-2.5 text-[11px] text-stone-600">
        <p>
          Permiso de llamada:
          <span class="font-medium" data-testid="contact-call-permission">{{ permissionLabel }}</span>
        </p>
        <div class="mt-1.5 flex gap-2">
          <button type="button" class="text-[11px] font-medium text-ink hover:underline" :disabled="busy" @click="permission('request')">Pedir permiso</button>
          <button type="button" class="text-[11px] text-stone-500 hover:text-ink hover:underline" :disabled="busy" @click="permission('check')">Comprobar</button>
        </div>
      </div>
    </div>

    <!-- Conversación -->
    <div class="border-b border-line p-4">
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Conversación</p>
      <label class="block">
        <span class="text-[11px] text-stone-500">Estado</span>
        <select :value="conversation.status" class="mt-0.5 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] focus:border-ink" data-testid="conversation-status" @change="patch({ status: ($event.target as HTMLSelectElement).value })">
          <option value="open">Abierta</option>
          <option value="pending">Pendiente</option>
          <option value="closed">Cerrada</option>
        </select>
      </label>
      <label class="mt-2 block">
        <span class="text-[11px] text-stone-500">Comercial asignado</span>
        <select :value="conversation.assignedAgentId ?? ''" class="mt-0.5 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] focus:border-ink" data-testid="conversation-agent" @change="patch({ assignedAgentId: ($event.target as HTMLSelectElement).value || null })">
          <option value="">Sin asignar</option>
          <option v-for="a in team" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
      <div class="mt-2">
        <span class="text-[11px] text-stone-500">Propiedad de contexto</span>
        <div v-if="property" class="mt-0.5 flex items-center gap-2 rounded-lg border border-line p-2">
          <img :src="mediaUrl(property.coverImage)" alt="" class="h-9 w-12 shrink-0 rounded object-cover bg-stone-100">
          <NuxtLink :to="`/admin/developer-properties/${property.id}`" class="min-w-0 flex-1 truncate text-[12px] font-medium text-ink hover:underline">{{ property.name }}</NuxtLink>
          <button type="button" class="text-[11px] text-stone-400 hover:text-ink" title="Quitar" @click="patch({ propertyId: null })">✕</button>
        </div>
        <button v-else type="button" class="mt-0.5 text-[12px] text-stone-500 hover:text-ink hover:underline" @click="emit('pick-property')">Elegir propiedad…</button>
      </div>
      <p class="mt-3 text-[11px] text-stone-500">
        Ventana de 24 h:
        <span :class="conversation.window.open ? 'font-medium text-emerald-700' : 'font-medium text-stone-600'" data-testid="conversation-window">{{ conversation.window.open ? `abierta hasta ${dt.dateTime(conversation.window.expiresAt)}` : 'cerrada (sólo plantillas)' }}</span>
      </p>
    </div>

    <!-- Consentimiento -->
    <div class="border-b border-line p-4">
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Consentimiento</p>
      <select :value="contact.consentStatus" class="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] focus:border-ink" data-testid="contact-consent" @change="consent(($event.target as HTMLSelectElement).value)">
        <option value="unknown">Sin registrar</option>
        <option value="opted_in">Acepta mensajes</option>
        <option value="opted_out">Baja: no escribir</option>
      </select>
      <p class="mt-1 text-[11px] text-stone-400">{{ consentHint }}</p>
    </div>

    <!-- Llamadas -->
    <div class="p-4">
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Llamadas recientes</p>
      <p v-if="!calls.length" class="text-[12px] text-stone-400">Ninguna todavía.</p>
      <ul v-else class="space-y-2">
        <li v-for="c in calls.slice(0, 6)" :key="c.id" class="rounded-lg border border-line p-2 text-[12px]" :data-testid="`contact-call-${c.id}`">
          <div class="flex items-center justify-between gap-2">
            <span class="font-medium text-ink">{{ c.direction === 'inbound' ? 'Entrante' : 'Saliente' }} · {{ callStatus(c) }}</span>
            <span class="text-[10px] text-stone-400">{{ dt.dateTime(c.startedAt || c.createdAt) }}</span>
          </div>
          <p v-if="c.outcome || c.notes" class="mt-0.5 text-stone-500">{{ [outcomeLabel(c.outcome), c.notes].filter(Boolean).join(' · ') }}</p>
          <button v-if="!c.outcome && ['completed', 'missed', 'cancelled', 'failed'].includes(c.status)" type="button" class="mt-1 text-[11px] font-medium text-ink hover:underline" @click="logExisting = c">Anotar resultado</button>
        </li>
      </ul>
    </div>

    <AdminCommsLinkContactModal v-if="linkOpen" :contact-id="contact.id" :phone="contact.phoneDisplay" :suggested-name="contact.displayName" @close="linkOpen = false" @linked="onLinked" />
    <AdminCommsCallLogModal v-if="logOpen" :contact-id="contact.id" :conversation-id="conversation.id" :contact-name="contact.name" :team="team" @close="logOpen = false" @saved="onCallSaved" />
    <AdminCommsCallLogModal v-if="logExisting" :call-id="logExisting.id" :conversation-id="conversation.id" :contact-name="contact.name" :team="team" @close="logExisting = null" @saved="onCallSaved" />
    <AdminCommsFollowUpModal v-if="followUpOpen" :conversation-id="conversation.id" :contact-name="contact.name" :team="team" :property-id="conversation.propertyId" @close="followUpOpen = false" @saved="onFollowUp" />
  </div>
</template>

<script setup lang="ts">
import { mediaUrl } from '~/composables/useMedia'

/** La columna de contexto del hilo: quién es, qué se puede hacer, cómo está la conversación, consentimiento y llamadas. */
const props = defineProps<{
  conversation: any
  contact: any
  calls: any[]
  team: { id: number; name: string }[]
  property: any | null
  capabilities: { calling: boolean; callPermissions: boolean }
}>()
const emit = defineEmits<{ changed: []; 'share-property': []; 'pick-property': [] }>()
const dt = useDash()
const toast = useToast()
const voice = useVoiceManager()
const linkOpen = ref(false)
const logOpen = ref(false)
const logExisting = ref<any | null>(null)
const followUpOpen = ref(false)
const busy = ref(false)

const permissionLabel = computed(() => {
  const s = props.contact.callPermissionStatus
  if (s === 'permanent') return 'permanente'
  if (s === 'temporary') return `temporal${props.contact.callPermissionExpiresAt ? ` hasta ${dt.dateTime(props.contact.callPermissionExpiresAt)}` : ''}`
  if (s === 'denied') return 'rechazado'
  return 'sin pedir'
})
const consentHint = computed(() => {
  const c = props.contact
  if (c.consentStatus === 'opted_out') return `Baja registrada${c.consentSource === 'keyword' ? ' (escribió STOP/BAJA)' : ''}. No se envía nada.`
  if (c.consentStatus === 'opted_in') return c.consentSource === 'inbound_message' ? 'Abrió la conversación escribiendo al número.' : 'Registrado a mano.'
  return 'Un mensaje suyo lo pone en «acepta»; STOP o BAJA lo dan de baja.'
})

const OUTCOMES: Record<string, string> = { answered: 'Contestó', interested: 'Interesado', callback: 'Pide que le llamen', no_answer: 'No contesta', busy: 'Comunica', voicemail: 'Buzón', wrong_number: 'Número equivocado', not_interested: 'No interesado' }
function outcomeLabel(o: string | null) {
  return o ? OUTCOMES[o] || o : ''
}
function callStatus(c: any) {
  const map: Record<string, string> = { completed: c.durationSeconds ? `${Math.max(1, Math.round(c.durationSeconds / 60))} min` : 'completada', missed: 'perdida', cancelled: 'sin respuesta', failed: 'fallida', rejected: 'rechazada', ringing: 'sonando', in_progress: 'en curso', accepted: 'en curso', initiated: 'iniciada' }
  return map[c.status] || c.status
}

async function patch(body: Record<string, any>) {
  try {
    await $fetch(`/api/admin/comms/conversations/${props.conversation.id}`, { method: 'PATCH', body })
    emit('changed')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo guardar')
  }
}
async function consent(value: string) {
  try {
    await $fetch(`/api/admin/comms/contacts/${props.contact.id}`, { method: 'PATCH', body: { consentStatus: value } })
    emit('changed')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo guardar')
  }
}
async function permission(action: 'request' | 'check') {
  busy.value = true
  try {
    const r = await $fetch<any>(`/api/admin/comms/conversations/${props.conversation.id}/call-permission`, { method: 'POST', body: action === 'check' ? { action: 'check' } : {} })
    toast.success(action === 'check' ? `Permiso: ${r.status}` : 'Petición de permiso enviada')
    emit('changed')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo')
  } finally {
    busy.value = false
  }
}
async function callWhatsApp() {
  await voice.startCall({ conversationId: props.conversation.id, contactId: props.contact.id, contactName: props.contact.name, contactPhone: props.contact.phone, propertyId: props.conversation.propertyId })
}
function onLinked() {
  linkOpen.value = false
  toast.success('Contacto vinculado')
  emit('changed')
}
function onCallSaved() {
  logOpen.value = false
  logExisting.value = null
  toast.success('Llamada guardada')
  emit('changed')
}
function onFollowUp(visit: any) {
  followUpOpen.value = false
  toast.success(`Seguimiento programado para el ${dt.dateTime(visit.scheduledAt)}`)
  emit('changed')
}
</script>

<style scoped>
.action-btn {
  @apply rounded-lg border border-line px-2.5 py-2 text-left text-[12px] font-medium text-stone-700 transition hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40;
}
</style>

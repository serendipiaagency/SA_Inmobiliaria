<template>
  <div class="flex h-full min-h-0 flex-col overflow-y-auto" data-testid="web-thread-panel">
    <!-- Identidad y vínculos guardados -->
    <div class="border-b border-line p-4">
      <div class="flex items-start gap-3">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold" :class="c.contact.known ? 'bg-paper text-stone-600 ring-1 ring-line' : 'bg-amber-100 text-amber-800'">{{ dt.initials(c.contact.name) }}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-[14px] font-semibold text-ink" data-testid="web-panel-name">{{ c.contact.name }}</p>
          <p v-if="c.contact.email" class="truncate text-[12px] text-stone-500">{{ c.contact.email }}</p>
          <p v-if="c.contact.phone" class="text-[12px] text-stone-500">{{ c.contact.phone }}</p>
          <p class="mt-1 text-[11px] text-stone-400">{{ c.channel.label }}<template v-if="c.formTypeLabel"> · {{ c.formTypeLabel }}</template></p>
        </div>
      </div>
      <div class="mt-3 space-y-1 text-[12px]" data-testid="web-panel-links">
        <p v-if="thread.crmContact">
          Contacto: <NuxtLink :to="`/admin/contactos/${thread.crmContact.id}`" class="font-medium text-ink hover:underline" data-testid="web-panel-contact-link">{{ thread.crmContact.name }}</NuxtLink>
        </p>
        <p v-if="c.contact.lead">
          Lead: <NuxtLink :to="`/admin/leads/${c.contact.lead.id}`" class="font-medium text-ink hover:underline" data-testid="web-panel-lead-link">{{ c.contact.lead.name }}</NuxtLink> <span class="text-stone-400">({{ c.contact.lead.status }})</span>
        </p>
        <p v-if="!thread.crmContact && !c.contact.lead" class="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
          Visitante sin datos de contacto: no hay lead ni contacto en el CRM. Sólo se le puede responder por el chat mientras tenga la sesión abierta.
        </p>
        <p v-if="c.pageUrl" class="truncate text-[11px] text-stone-400" :title="c.pageUrl">Escribió desde {{ c.pageUrl }}</p>
      </div>
    </div>

    <!-- Canales reales para responder -->
    <div class="border-b border-line p-4 text-[12px]" data-testid="web-panel-channels">
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Responder</p>
      <ul class="space-y-1">
        <li v-for="ch in channels" :key="ch.key" class="flex items-start gap-2">
          <span :class="ch.available ? 'text-emerald-600' : 'text-stone-300'">{{ ch.available ? '●' : '○' }}</span>
          <span><span class="font-medium text-ink">{{ ch.label }}</span><span v-if="ch.reason" class="text-stone-500"> — {{ ch.reason }}</span></span>
        </li>
      </ul>
      <button v-if="thread.reply.whatsapp.available" type="button" class="mt-2 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white" data-testid="web-panel-whatsapp" @click="emit('whatsapp')">Continuar por WhatsApp</button>
    </div>

    <!-- Conversación -->
    <div class="border-b border-line p-4">
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Conversación</p>
      <label class="block">
        <span class="text-[11px] text-stone-500">Estado</span>
        <select :value="c.status" class="mt-0.5 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] focus:border-ink" data-testid="web-thread-status" @change="patch({ status: ($event.target as HTMLSelectElement).value })">
          <option value="open">Abierta</option>
          <option value="pending">Pendiente</option>
          <option value="closed">Cerrada</option>
        </select>
      </label>
      <label class="mt-2 block">
        <span class="text-[11px] text-stone-500">Comercial asignado</span>
        <select :value="c.assignedAgentId ?? ''" class="mt-0.5 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] focus:border-ink" data-testid="web-thread-agent" @change="patch({ assignedAgentId: ($event.target as HTMLSelectElement).value || null })">
          <option value="">Sin asignar</option>
          <option v-for="a in team" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
      <div class="mt-2">
        <span class="text-[11px] text-stone-500">Propiedad</span>
        <div v-if="thread.property" class="mt-0.5 flex items-center gap-2 rounded-lg border border-line p-2" data-testid="web-panel-property">
          <img :src="mediaUrl(thread.property.coverImage)" alt="" class="h-9 w-12 shrink-0 rounded bg-stone-100 object-cover">
          <NuxtLink :to="`/admin/${thread.property.kind === 'agent' ? 'properties' : 'developer-properties'}/${thread.property.id}`" class="min-w-0 flex-1 truncate text-[12px] font-medium text-ink hover:underline">{{ thread.property.name }}</NuxtLink>
          <button type="button" class="text-[11px] text-stone-400 hover:text-ink" title="Quitar" @click="patch({ propertyId: null })">✕</button>
        </div>
        <button v-else type="button" class="mt-0.5 text-[12px] text-stone-500 hover:text-ink hover:underline" @click="emit('pick-property')">Elegir propiedad…</button>
      </div>
      <p v-if="c.kind === 'chat'" class="mt-3 text-[11px] text-stone-500">
        Sesión del chat:
        <span :class="c.chatSessionOpen ? 'font-medium text-emerald-700' : 'font-medium text-stone-600'" data-testid="web-panel-chat-session">{{ c.chatSessionOpen ? `activa hasta ${dt.dateTime(c.chatSessionExpiresAt)}` : 'caducada' }}</span>
      </p>
    </div>

    <!-- Contexto: necesidades, próxima acción y citas -->
    <div v-if="thread.lead || thread.buyerRequirements?.length || thread.appointments?.length" class="p-4" data-testid="web-panel-context">
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Contexto</p>
      <p v-if="thread.lead?.nextActionAt" class="text-[12px] text-stone-600">Próxima acción: {{ dt.relative(thread.lead.nextActionAt) }}</p>
      <div v-for="b in thread.buyerRequirements || []" :key="b.id" class="mt-1.5 rounded-lg border border-line p-2 text-[12px]">
        <p class="font-medium text-ink">{{ b.title || (b.operation === 'rent' ? 'Alquiler' : 'Compra') }}</p>
      </div>
      <div v-for="a in thread.appointments || []" :key="a.id" class="mt-1.5 rounded-lg border border-line p-2 text-[12px]">
        <p class="font-medium text-ink">{{ a.propertyName || 'Cita' }}</p>
        <p class="text-stone-500">{{ dt.dateTime(a.scheduledAt) }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { mediaUrl } from '~/composables/useMedia'

/** La ficha de un hilo web (núcleo N8a): quién escribió, sus vínculos guardados (Contact, Lead, Property), por dónde se le puede responder y el estado del hilo. */
const props = defineProps<{ thread: any; team: { id: number; name: string }[] }>()
const emit = defineEmits<{ changed: []; 'pick-property': []; whatsapp: [] }>()
const dt = useDash()
const toast = useToast()
const c = computed(() => props.thread.conversation)
const channels = computed(() => [
  { key: 'chat', label: 'Chat web', ...props.thread.reply.chat },
  { key: 'email', label: 'Email', ...props.thread.reply.email },
  { key: 'whatsapp', label: 'WhatsApp', ...props.thread.reply.whatsapp },
])

async function patch(body: Record<string, any>) {
  try {
    await $fetch(`/api/admin/comms/conversations/${c.value.id}`, { method: 'PATCH', body })
    emit('changed')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo guardar')
  }
}
</script>

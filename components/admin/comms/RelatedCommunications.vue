<template>
  <div class="grid gap-6 lg:grid-cols-3" data-testid="related-communications">
    <AdminPanel title="WhatsApp" sub="Conversaciones vinculadas a esta persona.">
      <p v-if="!conversations.length" class="py-6 text-center text-sm text-stone-400">Ninguna todavía.</p>
      <ul v-else class="divide-y divide-line">
        <li v-for="c in conversations" :key="c.id" class="py-2.5">
          <NuxtLink :to="`/admin/comunicaciones?conversation=${c.id}`" class="block hover:underline" :data-testid="`related-conversation-${c.id}`">
            <span class="text-[13px] font-medium text-ink">{{ c.lastMessagePreview || 'Conversación' }}</span>
            <span class="ml-2 text-[11px] text-stone-400">{{ formatRelative(c.lastMessageAt) }} · {{ CONVERSATION_STATUS[c.status] || c.status }}<span v-if="c.unreadCount"> · {{ c.unreadCount }} sin leer</span></span>
          </NuxtLink>
        </li>
      </ul>
    </AdminPanel>
    <AdminPanel title="Llamadas" sub="Por WhatsApp desde el panel o registradas a mano.">
      <p v-if="!calls.length" class="py-6 text-center text-sm text-stone-400">Ninguna registrada.</p>
      <ul v-else class="divide-y divide-line">
        <li v-for="c in calls" :key="c.id" class="py-2.5 text-[13px]">
          <span class="font-medium text-ink">{{ c.direction === 'inbound' ? 'Recibida' : 'Realizada' }}</span>
          <span class="text-stone-500"> · {{ c.status }}<template v-if="c.outcome"> · {{ c.outcome }}</template><template v-if="c.durationSeconds"> · {{ Math.round(c.durationSeconds / 60) }} min</template></span>
          <span class="ml-2 text-[11px] text-stone-400">{{ formatDateTime(c.startedAt || c.createdAt) }}</span>
          <p v-if="c.notes" class="text-[12px] text-stone-500">{{ c.notes }}</p>
        </li>
      </ul>
    </AdminPanel>
    <AdminPanel title="Emails enviados" sub="Sólo salientes: la plataforma envía correo pero no recibe respuestas.">
      <p v-if="!emails.length" class="py-6 text-center text-sm text-stone-400">Ninguno enviado a sus direcciones.</p>
      <ul v-else class="divide-y divide-line" data-testid="related-emails">
        <li v-for="e in emails" :key="e.id" class="py-2.5 text-[13px]">
          <span class="font-medium text-ink">{{ e.subject }}</span>
          <span class="ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold" :class="EMAIL_STATUS[e.status]?.cls || 'bg-stone-100 text-stone-500'">{{ EMAIL_STATUS[e.status]?.label || e.status }}</span>
          <span class="block text-[11px] text-stone-400">{{ formatDateTime(e.sentAt || e.createdAt) }}</span>
        </li>
      </ul>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
import { formatDateTime, formatRelative } from '~/composables/useClientConfig'

/**
 * WhatsApp, llamadas y emails enviados de una persona (FASE 29 §139-142) —
 * los datos salen de `listPersonCommunications()` (server/utils/comms/related.ts).
 */
withDefaults(defineProps<{ conversations?: any[]; calls?: any[]; emails?: any[] }>(), { conversations: () => [], calls: () => [], emails: () => [] })

const CONVERSATION_STATUS: Record<string, string> = { open: 'abierta', pending: 'pendiente', closed: 'cerrada' }
const EMAIL_STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: 'En cola', cls: 'bg-stone-100 text-stone-500' },
  sent: { label: 'Enviado', cls: 'bg-sky-50 text-sky-700' },
  delivered: { label: 'Entregado', cls: 'bg-emerald-50 text-emerald-700' },
  bounced: { label: 'Rebotado', cls: 'bg-red-50 text-red-700' },
  complained: { label: 'Marcado como spam', cls: 'bg-red-50 text-red-700' },
  failed: { label: 'No se pudo enviar', cls: 'bg-red-50 text-red-700' },
}
</script>

<template>
  <section v-if="canRead('crm')" class="pe-card mt-6 px-6 py-5 sm:px-8" data-testid="property-communications">
    <h2 class="mb-3 text-[15px] font-medium text-ink">Comunicaciones</h2>
    <p v-if="pending" class="py-4 text-center text-sm text-stone-400">Cargando…</p>
    <p v-else-if="!rows.length" class="py-4 text-center text-sm text-stone-400">Ninguna conversación de WhatsApp sobre esta propiedad todavía.</p>
    <ul v-else class="divide-y divide-line">
      <li v-for="c in rows" :key="c.id" class="py-2.5">
        <NuxtLink :to="`/admin/comunicaciones?conversation=${c.id}`" class="block hover:underline" :data-testid="`property-conversation-${c.id}`">
          <span class="text-[13px] font-medium text-ink">{{ c.contact?.name || 'Contacto' }}</span>
          <span class="ml-2 text-[11px] text-stone-400">{{ formatRelative(c.lastMessageAt) }}</span>
          <span class="block truncate text-[12px] text-stone-500">{{ c.lastMessagePreview || '—' }}</span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { formatRelative } from '~/composables/useClientConfig'

/**
 * FASE 29 §141 — conversaciones de WhatsApp donde esta propiedad es el
 * contexto o se envió alguna vez. Mismo endpoint que el filtro por propiedad
 * de la bandeja (área CRM), así que sólo aparece para quien puede leer el CRM.
 */
const props = defineProps<{ propertyId: number; kind: 'agent' | 'developer' }>()
const { canRead } = useAdminPermissions()

const rows = ref<any[]>([])
const pending = ref(false)

onMounted(async () => {
  if (!canRead('crm')) return
  pending.value = true
  try {
    const r = await $fetch<{ rows: any[] }>('/api/admin/comms/conversations', { query: { status: 'all', propertyId: props.propertyId, propertyKind: props.kind } })
    rows.value = r.rows
  } catch {
    rows.value = []
  } finally {
    pending.value = false
  }
})
</script>

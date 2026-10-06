<template>
  <!-- Nota interna: centrada, nunca la ve el visitante -->
  <div v-if="m.direction === 'note'" class="my-2 flex justify-center" :data-testid="`web-message-${m.id}`">
    <div class="max-w-[85%] whitespace-pre-line rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
      <span class="mr-1 text-[10px] font-semibold uppercase tracking-widest text-amber-600">Nota</span>{{ m.body }}
      <span class="ml-2 text-[10px] text-amber-600">{{ dt.dateTime(m.createdAt) }}</span>
    </div>
  </div>

  <div v-else class="my-1 flex" :class="mine ? 'justify-end' : 'justify-start'" :data-testid="`web-message-${m.id}`">
    <div class="max-w-[78%] rounded-2xl px-3 py-2 text-[13px] shadow-sm" :class="mine ? 'rounded-br-sm bg-[#dcf8c6] text-ink' : 'rounded-bl-sm bg-white text-ink ring-1 ring-line'">
      <p class="mb-1 text-[10px] font-semibold uppercase tracking-widest" :class="m.type === 'property_share' ? 'text-emerald-700' : 'text-stone-400'">
        {{ viaLabel }}<template v-if="m.type === 'property_share'"> · Propiedad compartida</template>
      </p>
      <p v-if="m.body" class="whitespace-pre-line break-words">{{ m.body }}</p>
      <dl v-if="fields.length" class="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-lg bg-stone-50 px-2 py-1.5 text-[11px]" :data-testid="`web-message-fields-${m.id}`">
        <template v-for="f in fields" :key="f.key">
          <dt class="text-stone-400">{{ f.label }}</dt>
          <dd class="break-words text-stone-700">{{ f.value }}</dd>
        </template>
      </dl>
      <p class="mt-1 flex items-center justify-end gap-1 text-[10px] text-stone-400">
        <span>{{ dt.dateTime(m.createdAt) }}</span>
        <span v-if="mine" :title="statusTitle" :class="m.status === 'failed' || m.status === 'bounced' ? 'text-red-600' : ''" :data-testid="`web-message-status-${m.id}`">{{ statusIcon }}</span>
      </p>
      <p v-if="mine && m.errorMessage && m.status !== 'sent' && m.status !== 'delivered'" class="mt-1 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">{{ m.errorMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/** Un mensaje de un hilo web (núcleo N8a): formulario, chat o email, con los campos del formulario y el estado real del envío. */
const props = defineProps<{ m: any }>()
const dt = useDash()
const mine = computed(() => props.m.direction === 'out')

const VIA_LABELS: Record<string, string> = { form: 'Formulario web', chat: 'Chat web', email: 'Email' }
const viaLabel = computed(() => VIA_LABELS[props.m.via] || props.m.via)

const FIELD_LABELS: Record<string, string> = {
  subject: 'Asunto',
  startAt: 'Cita solicitada',
  channel: 'Modalidad',
  budget: 'Presupuesto',
  nationality: 'Nacionalidad',
  propertyType: 'Tipo de inmueble',
  preferredLocation: 'Zona preferida',
  budgetRange: 'Presupuesto',
  paymentForRent: 'Pago del alquiler',
  familyMembers: 'Miembros de la familia',
  referrer: 'Recomendado por',
}
const fields = computed(() =>
  Object.entries(props.m.fields || {})
    .filter(([k, v]) => k !== 'formType' && v !== null && v !== '')
    .map(([key, value]) => ({ key, label: FIELD_LABELS[key] || key, value: String(value) })),
)

const statusIcon = computed(() => ({ queued: '🕓', sent: '✓', delivered: '✓✓', failed: '⚠', bounced: '⚠', complained: '⚠' })[props.m.status as string] || '')
const statusTitle = computed(
  () =>
    ({
      queued: 'En cola (el proveedor de email todavía no lo ha aceptado)',
      sent: props.m.via === 'chat' ? 'Guardado en el chat' : 'Aceptado por el proveedor de email',
      delivered: props.m.via === 'chat' ? 'Recibido en el navegador del visitante' : 'Entregado',
      failed: 'No se pudo enviar',
      bounced: 'Rebotado',
      complained: 'Marcado como spam',
    })[props.m.status as string] || '',
)
</script>

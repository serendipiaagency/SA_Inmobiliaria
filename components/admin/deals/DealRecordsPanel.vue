<template>
  <AdminPanel title="Reserva, arras y contratos" sub="Lo que ya existe en Reservas, Depósitos y Contratos, vinculado a esta operación." data-testid="deal-records">
    <div class="space-y-5">
      <div v-for="sec in sections" :key="sec.kind" :data-testid="`deal-records-${sec.kind}`">
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <p class="text-[12px] font-semibold uppercase tracking-wide text-stone-400">{{ sec.title }}</p>
          <NuxtLink :to="sec.page" class="text-[11px] text-stone-400 hover:underline">Ir a {{ sec.pageLabel }} →</NuxtLink>
        </div>
        <p v-if="sec.hidden" class="text-[12px] text-stone-400">Necesitas acceso a Finanzas para ver o vincular {{ sec.title.toLowerCase() }}.</p>
        <template v-else>
          <p v-if="!sec.linked.length" class="text-[12px] text-stone-400">Nada vinculado todavía.</p>
          <ul v-else class="divide-y divide-line">
            <li v-for="r in sec.linked" :key="r.id" class="flex items-center justify-between gap-2 py-2 text-[13px]" :data-testid="`deal-record-${sec.kind}-${r.id}`">
              <span class="min-w-0 truncate">{{ sec.label(r) }}</span>
              <button v-if="canEdit && (sec.kind === 'reservation' || canFinance)" type="button" class="shrink-0 text-[11px] text-stone-500 underline hover:text-red-600" :disabled="busy" @click="unlink(sec.kind, r.id)">Desvincular</button>
            </li>
          </ul>
          <div v-if="canEdit && (sec.kind === 'reservation' || canFinance) && sec.candidates.length" class="mt-2 flex items-center gap-2">
            <select v-model="picks[sec.kind]" class="input !py-1.5 !text-xs" :aria-label="`Vincular ${sec.title.toLowerCase()}`" :data-testid="`deal-records-${sec.kind}-select`">
              <option value="">Vincular {{ sec.one }}…</option>
              <option v-for="c in sec.candidates" :key="c.id" :value="c.id">{{ sec.label(c) }}</option>
            </select>
            <button type="button" class="btn-secondary shrink-0 !px-2.5 !py-1 text-xs" :disabled="!picks[sec.kind] || busy" :data-testid="`deal-records-${sec.kind}-link`" @click="link(sec.kind)">Vincular</button>
          </div>
          <p v-else-if="canEdit && (sec.kind === 'reservation' || canFinance) && !sec.candidates.length" class="mt-1 text-[11px] text-stone-400">No hay {{ sec.title.toLowerCase() }} libres para vincular.</p>
        </template>
      </div>
    </div>
  </AdminPanel>
</template>

<script setup lang="ts">
import { formatDate } from '~/composables/useClientConfig'
import { formatAmount } from '~/utils/pipelineCatalog'

/**
 * Reserva, arras y contratos de una operación (FASE 24, bloque N6): las
 * filas reales de `reservations`, `deposit_payments` y `contracts` con
 * `deal_operation_id` apuntando aquí. Sólo se ofrecen las de esta agencia y
 * todavía sin operación; el servidor lo vuelve a comprobar (404 si es de
 * otra agencia, 409 si ya es de otra operación). Arras y contratos son del
 * área Finanzas: sin permiso de lectura ni siquiera llegan.
 */
type Kind = 'reservation' | 'deposit' | 'contract'
const props = defineProps<{ dealId: number; records: any; canEdit: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()
const toast = useToast()
const { canWrite } = useAdminPermissions()
const canFinance = computed(() => canWrite('finance'))

const RES_STATUS: Record<string, string> = { pending: 'pendiente', confirmed: 'confirmada', cancelled: 'cancelada', completed: 'completada' }
const DEP_STATUS: Record<string, string> = { pending: 'pendiente', not_connected: 'sin pasarela', processing: 'procesando', paid: 'pagado', failed: 'fallido', refunded: 'devuelto' }
const CON_STATUS: Record<string, string> = { draft: 'borrador', sent: 'enviado', accepted: 'firmado', void: 'anulado' }

const sections = computed(() => {
  const r = props.records || {}
  const hiddenFinance = r.financeVisible === false
  return [
    {
      kind: 'reservation' as Kind,
      title: 'Reservas',
      one: 'una reserva',
      page: '/admin/reservas',
      pageLabel: 'Reservas',
      hidden: false,
      linked: r.reservations?.linked || [],
      candidates: r.reservations?.candidates || [],
      label: (x: any) => `${x.reference} · ${x.clientName}${x.propertyName ? ` · ${x.propertyName}` : ''} · ${formatAmount(x.amount)} (${RES_STATUS[x.status] || x.status})`,
    },
    {
      kind: 'deposit' as Kind,
      title: 'Arras / depósitos',
      one: 'unas arras',
      page: '/admin/depositos',
      pageLabel: 'Depósitos',
      hidden: hiddenFinance,
      linked: r.deposits?.linked || [],
      candidates: r.deposits?.candidates || [],
      label: (x: any) => `Depósito #${x.id} · ${formatAmount(x.amount, x.currency)} (${DEP_STATUS[x.status] || x.status})${x.paidAt ? ` · pagado ${formatDate(x.paidAt)}` : ''}`,
    },
    {
      kind: 'contract' as Kind,
      title: 'Contratos',
      one: 'un contrato',
      page: '/admin/contratos',
      pageLabel: 'Contratos',
      hidden: hiddenFinance,
      linked: r.contracts?.linked || [],
      candidates: r.contracts?.candidates || [],
      label: (x: any) => `${x.title} · ${x.clientName} (${CON_STATUS[x.status] || x.status})`,
    },
  ]
})

const picks = reactive<Record<Kind, number | ''>>({ reservation: '', deposit: '', contract: '' })
const busy = ref(false)
async function send(action: 'link' | 'unlink', kind: Kind, recordId: number) {
  busy.value = true
  try {
    await $fetch('/api/admin/saas/deal-operations', { method: 'POST', body: { id: props.dealId, action, kind, recordId } })
    toast.success(action === 'link' ? 'Vinculado a la operación' : 'Desvinculado de la operación')
    picks[kind] = ''
    emit('changed')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo completar')
  } finally {
    busy.value = false
  }
}
function link(kind: Kind) {
  if (picks[kind]) send('link', kind, Number(picks[kind]))
}
function unlink(kind: Kind, id: number) {
  send('unlink', kind, id)
}
</script>

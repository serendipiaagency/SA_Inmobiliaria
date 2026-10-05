<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="$emit('close')">
    <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-label="Detalle de la oferta" data-testid="offer-detail">
      <p v-if="loadError" class="py-8 text-center text-sm text-stone-500">{{ loadError }}</p>
      <p v-else-if="!detail" class="py-8 text-center text-sm text-stone-400">Cargando…</p>
      <template v-else>
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="text-base font-semibold">Oferta #{{ offer.id }} · {{ formatAmount(offer.currentAmount, offer.currency) }}</h3>
            <p class="mt-0.5 text-[13px] text-stone-500">
              <NuxtLink :to="`/admin/${offer.propertyKind === 'agent' ? 'properties' : 'developer-properties'}/${offer.propertyId}`" class="hover:underline">{{ offer.propertyName || `Inmueble #${offer.propertyId}` }}</NuxtLink>
              ({{ offer.propertyKind === 'agent' ? '2ª mano' : 'obra nueva' }})
            </p>
          </div>
          <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold" :class="OFFER_STATUS_CLS[offer.status] || 'bg-stone-100 text-stone-500'" data-testid="offer-detail-status">
            {{ OFFER_STATUS_LABELS[offer.status] || offer.status }}<template v-if="offer.isExpired"> · vencida</template>
          </span>
        </div>

        <dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt class="od-dt">Comprador</dt>
            <dd><NuxtLink :to="`/admin/contactos/${offer.buyerContactId}`" class="hover:underline">{{ offer.buyerName || `Contacto #${offer.buyerContactId}` }}</NuxtLink></dd>
          </div>
          <div>
            <dt class="od-dt">Vendedor(es)</dt>
            <dd>
              <template v-if="offer.sellers?.length">
                <NuxtLink v-for="(s, i) in offer.sellers" :key="s.id" :to="`/admin/contactos/${s.id}`" class="hover:underline">{{ s.name || `Contacto #${s.id}` }}{{ Number(i) < offer.sellers.length - 1 ? ', ' : '' }}</NuxtLink>
              </template>
              <span v-else class="text-stone-400">Sin indicar</span>
            </dd>
          </div>
          <div>
            <dt class="od-dt">Financiación</dt>
            <dd>{{ offerFinanceLabel(offer.currentFinanceCondition) }}</dd>
          </div>
          <div>
            <dt class="od-dt">Vence</dt>
            <dd :class="offer.isExpired ? 'font-medium text-red-600' : ''">{{ offer.expiration ? formatDateTime(offer.expiration) : '—' }}</dd>
          </div>
          <div>
            <dt class="od-dt">Comercial</dt>
            <dd>{{ offer.commercialName || '—' }}</dd>
          </div>
          <div v-if="offer.leadId">
            <dt class="od-dt">Lead</dt>
            <dd><NuxtLink :to="`/admin/leads/${offer.leadId}`" class="hover:underline">Lead #{{ offer.leadId }}</NuxtLink></dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="od-dt">Condiciones actuales</dt>
            <dd class="whitespace-pre-line">{{ offer.currentConditions || '—' }}</dd>
          </div>
        </dl>

        <!-- Acciones -->
        <div v-if="canEdit" class="mt-4 flex flex-wrap gap-2 border-t border-line pt-4" data-testid="offer-detail-actions">
          <template v-if="offer.status === 'draft'">
            <button type="button" class="btn-primary !px-3 !py-1.5 text-xs" :disabled="busy" data-testid="offer-submit" @click="act('submit')">Enviar oferta</button>
          </template>
          <template v-if="offer.status === 'submitted'">
            <button type="button" class="btn-secondary !px-3 !py-1.5 text-xs" :disabled="busy" data-testid="offer-counter-open" @click="openTerms('counter')">Contraoferta del vendedor</button>
            <button type="button" class="btn-quiet !px-3 !py-1.5 text-xs text-emerald-700" :disabled="busy" data-testid="offer-accept" @click="act('accept', 'seller')">El vendedor acepta</button>
            <button type="button" class="btn-quiet !px-3 !py-1.5 text-xs text-red-600" :disabled="busy" data-testid="offer-reject" @click="act('reject', 'seller')">El vendedor rechaza</button>
          </template>
          <template v-if="offer.status === 'countered'">
            <button type="button" class="btn-secondary !px-3 !py-1.5 text-xs" :disabled="busy" data-testid="offer-new-offer-open" @click="openTerms('new_offer')">Nueva oferta del comprador</button>
            <button type="button" class="btn-secondary !px-3 !py-1.5 text-xs" :disabled="busy" @click="openTerms('counter')">Otra contraoferta del vendedor</button>
            <button type="button" class="btn-quiet !px-3 !py-1.5 text-xs text-emerald-700" :disabled="busy" data-testid="offer-accept" @click="act('accept', 'buyer')">El comprador acepta la contraoferta</button>
            <button type="button" class="btn-quiet !px-3 !py-1.5 text-xs text-red-600" :disabled="busy" data-testid="offer-reject" @click="act('reject', 'buyer')">El comprador la rechaza</button>
          </template>
          <button v-if="['draft', 'submitted', 'countered'].includes(offer.status)" type="button" class="btn-quiet !px-3 !py-1.5 text-xs text-stone-500" :disabled="busy" @click="act('withdraw')">Retirar</button>
          <template v-if="offer.status === 'accepted'">
            <NuxtLink v-if="offer.dealId" :to="`/admin/deal-operations/${offer.dealId}`" class="btn-quiet !px-3 !py-1.5 text-xs text-emerald-700">Ver operación →</NuxtLink>
            <button v-else type="button" class="btn-primary !px-3 !py-1.5 text-xs" :disabled="busy" data-testid="offer-create-deal" @click="createDeal">Crear operación</button>
          </template>
        </div>

        <div v-if="termsMode" class="mt-4 rounded-lg border border-line bg-stone-50 p-4" data-testid="offer-terms-form">
          <p class="mb-3 text-[13px] font-semibold">{{ termsMode === 'new_offer' ? 'Nueva oferta del comprador' : 'Contraoferta del vendedor' }}</p>
          <OfferTermsFields v-model="terms" testid="offer-move" />
          <div class="mt-3 flex justify-end gap-2">
            <button type="button" class="btn-secondary !px-3 !py-1.5 text-xs" @click="termsMode = null">Cancelar</button>
            <button type="button" class="btn-primary !px-3 !py-1.5 text-xs" :disabled="!(Number(terms.amount) > 0) || busy" data-testid="offer-move-save" @click="sendTerms">Registrar</button>
          </div>
        </div>
        <p v-if="actionError" class="mt-3 text-sm font-medium text-red-600" data-testid="offer-detail-error">{{ actionError }}</p>

        <!-- Historial inmutable -->
        <h4 class="mb-2 mt-6 text-[13px] font-semibold">Historial de la negociación</h4>
        <p class="mb-2 text-[11px] text-stone-400">Cada movimiento queda con sus términos completos; nada de lo anterior se sobrescribe.</p>
        <ol class="relative space-y-3 border-l border-line pl-4" data-testid="offer-history">
          <li v-for="r in detail.revisions" :key="r.id" class="relative text-sm" :data-testid="`offer-revision-${r.type}`">
            <span class="absolute -left-[21px] mt-1.5 h-2 w-2 rounded-full" :class="REVISION_DOT[r.type] || 'bg-stone-300'" />
            <p class="font-medium">{{ OFFER_REVISION_LABELS[r.type] || r.type }} · {{ formatAmount(r.amount, r.currency) }}</p>
            <p class="text-[12px] text-stone-600">
              {{ offerFinanceLabel(r.financeCondition) }}<template v-if="r.expiration"> · vence {{ formatDateTime(r.expiration) }}</template>
            </p>
            <p v-if="r.conditions" class="whitespace-pre-line text-[12px] text-stone-500">{{ r.conditions }}</p>
            <p class="text-[11px] text-stone-400">{{ formatDateTime(r.createdAt) }} · {{ OFFER_ACTOR_LABELS[r.actorType] || r.actorType }}<template v-if="r.actorName"> ({{ r.actorName }})</template></p>
          </li>
        </ol>
      </template>
      <div class="mt-5 flex justify-end">
        <button type="button" class="btn-secondary" @click="$emit('close')">Cerrar</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatDateTime } from '~/composables/useClientConfig'
import OfferTermsFields from '~/components/admin/offers/OfferTermsFields.vue'
import {
  OFFER_ACTOR_LABELS,
  OFFER_REVISION_LABELS,
  OFFER_STATUS_LABELS,
  formatAmount,
  offerFinanceLabel,
  offerTermsFrom,
  type OfferTerms,
} from '~/utils/pipelineCatalog'

/**
 * Detalle de una oferta (FASE 23, bloque N6): partes, términos actuales,
 * las acciones que su estado permite y el historial inmutable completo
 * (oferta, contraoferta, nueva oferta, aceptada, rechazada…). La
 * contraoferta y la nueva oferta llevan los mismos términos que la oferta
 * (importe, condiciones, financiación, vencimiento). «Aceptar» manda la
 * revisión que se está viendo: si mientras tanto entró otro movimiento, el
 * servidor responde 409 y se recarga en vez de aceptar algo obsoleto.
 */
const props = defineProps<{ offerId: number }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const toast = useToast()
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => canWrite('crm'))

const OFFER_STATUS_CLS: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-600',
  submitted: 'bg-blue-50 text-blue-700',
  countered: 'bg-amber-50 text-amber-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  withdrawn: 'bg-stone-100 text-stone-500',
  expired: 'bg-stone-100 text-stone-500',
}
const REVISION_DOT: Record<string, string> = { countered: 'bg-amber-500', new_offer: 'bg-blue-500', accepted: 'bg-emerald-500', rejected: 'bg-red-500' }

const detail = ref<any>(null)
const loadError = ref('')
const offer = computed<any>(() => detail.value?.offer)
async function load() {
  try {
    detail.value = await $fetch<any>(`/api/admin/saas/offers/${props.offerId}`)
  } catch (e: any) {
    loadError.value = e?.statusCode === 404 || e?.response?.status === 404 ? 'Esta oferta no existe o no es de tu inmobiliaria.' : 'No se pudo cargar la oferta.'
  }
}
onMounted(load)

const busy = ref(false)
const actionError = ref('')
const termsMode = ref<'counter' | 'new_offer' | null>(null)
const terms = ref<OfferTerms>(offerTermsFrom())
function openTerms(mode: 'counter' | 'new_offer') {
  termsMode.value = mode
  terms.value = offerTermsFrom(offer.value)
  actionError.value = ''
}

async function run(fn: () => Promise<unknown>, okMessage: string) {
  busy.value = true
  actionError.value = ''
  try {
    await fn()
    toast.success(okMessage)
    termsMode.value = null
    await load()
    emit('changed')
  } catch (e: any) {
    actionError.value = e?.data?.statusMessage || 'No se pudo completar la acción'
    if (e?.response?.status === 409) await load()
  } finally {
    busy.value = false
  }
}

const ACTION_MESSAGES: Record<string, string> = { submit: 'Oferta enviada', accept: 'Oferta aceptada', reject: 'Oferta rechazada', withdraw: 'Oferta retirada' }
function act(action: 'submit' | 'accept' | 'reject' | 'withdraw', actorType?: 'buyer' | 'seller') {
  const body: Record<string, any> = {}
  if (actorType) body.actorType = actorType
  if (action === 'accept') body.revisionId = offer.value.currentRevisionId
  // Respuesta tipada a mano (un objeto): con la unión de acciones en la URL, el tipado de rutas de Nitro se dispara (TS2321).
  return run(() => $fetch<Record<string, unknown>>(`/api/admin/saas/offers/${props.offerId}/${action}`, { method: 'POST', body }), ACTION_MESSAGES[action])
}

function sendTerms() {
  const mode = termsMode.value
  if (!mode) return
  const body = {
    kind: mode,
    actorType: mode === 'new_offer' ? 'buyer' : 'seller',
    amount: Number(terms.value.amount),
    conditions: terms.value.conditions || null,
    financeCondition: terms.value.financeCondition || null,
    expiration: terms.value.expiration || null,
  }
  return run(() => $fetch<Record<string, unknown>>(`/api/admin/saas/offers/${props.offerId}/counter`, { method: 'POST', body }), mode === 'new_offer' ? 'Nueva oferta registrada' : 'Contraoferta registrada')
}

function createDeal() {
  return run(async () => {
    const deal = await $fetch<any>('/api/admin/saas/deal-operations', { method: 'POST', body: { acceptedOfferId: props.offerId } })
    await navigateTo(`/admin/deal-operations/${deal.id}`)
  }, 'Operación creada')
}
</script>

<style scoped>
.od-dt {
  @apply text-[11px] uppercase tracking-wide text-stone-400;
}
</style>

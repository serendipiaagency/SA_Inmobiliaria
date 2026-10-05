<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Ofertas</h1>
        <p class="mt-1 text-sm text-stone-500">{{ rows.length }} oferta{{ rows.length === 1 ? '' : 's' }} · toda la negociación de la agencia, con su historial completo</p>
      </div>
      <button v-if="canEdit" type="button" class="btn-primary" data-testid="offers-new" @click="creating = true">+ Nueva oferta</button>
    </div>

    <!-- Filtros -->
    <div class="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
      <select v-model="status" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" data-testid="offers-status">
        <option value="">Todos los estados</option>
        <option value="open">Abiertas (borrador, enviada o contraoferta)</option>
        <option v-for="s in OFFER_STATUSES" :key="s" :value="s">{{ OFFER_STATUS_LABELS[s] }}</option>
      </select>
      <select v-model="propertyKind" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" data-testid="offers-kind">
        <option value="">Los dos catálogos</option>
        <option value="developer">Obra nueva</option>
        <option value="agent">2ª mano</option>
      </select>
      <select v-model="commercialId" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" data-testid="offers-commercial">
        <option value="">Todos los comerciales</option>
        <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <RecordPicker v-model="property" kind="property" placeholder="Filtrar por inmueble…" />
      <RecordPicker v-model="buyer" kind="contact" placeholder="Filtrar por comprador…" />
      <RecordPicker v-model="seller" kind="contact" placeholder="Filtrar por vendedor…" />
    </div>

    <AdminPanel :pad="false">
      <div v-if="!rows.length" class="py-16 text-center text-sm text-stone-400">Sin ofertas con estos filtros.</div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm" data-testid="offers-table">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Inmueble</th>
              <th class="px-4 py-2.5 font-semibold">Comprador</th>
              <th class="px-4 py-2.5 font-semibold">Vendedor(es)</th>
              <th class="px-4 py-2.5 text-right font-semibold">Importe actual</th>
              <th class="px-4 py-2.5 font-semibold">Financiación</th>
              <th class="px-4 py-2.5 font-semibold">Vence</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
              <th class="px-4 py-2.5 font-semibold">Comercial</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in rows" :key="o.id" class="cursor-pointer border-b border-line/60 last:border-0 hover:bg-stone-50" :data-testid="`offer-row-${o.id}`" @click="openOffer(o.id)">
              <td class="px-4 py-3">
                <p class="font-medium">{{ o.propertyName || `Inmueble #${o.propertyId}` }}</p>
                <p class="text-[11px] text-stone-400">{{ o.propertyKind === 'agent' ? '2ª mano' : 'Obra nueva' }} · oferta #{{ o.id }}</p>
              </td>
              <td class="px-4 py-3">{{ o.buyerName || `#${o.buyerContactId}` }}</td>
              <td class="px-4 py-3 text-stone-600">{{ o.sellers?.length ? o.sellers.map((s: any) => s.name || `#${s.id}`).join(', ') : '—' }}</td>
              <td class="px-4 py-3 text-right tabular-nums">{{ formatAmount(o.currentAmount, o.currency) }}</td>
              <td class="px-4 py-3 text-xs text-stone-600">{{ offerFinanceLabel(o.currentFinanceCondition) }}</td>
              <td class="px-4 py-3 text-xs" :class="o.isExpired ? 'font-medium text-red-600' : 'text-stone-500'">{{ o.expiration ? formatDate(o.expiration) : '—' }}<template v-if="o.isExpired"> · vencida</template></td>
              <td class="px-4 py-3">
                <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="STATUS_CLS[o.status] || 'bg-stone-100 text-stone-500'">{{ OFFER_STATUS_LABELS[o.status] || o.status }}</span>
                <NuxtLink v-if="o.dealId" :to="`/admin/deal-operations/${o.dealId}`" class="ml-1 text-[11px] text-emerald-700 hover:underline" @click.stop>operación →</NuxtLink>
              </td>
              <td class="px-4 py-3 text-stone-600">{{ o.commercialName || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>

    <OfferFormModal v-if="creating" :agents="agents" @close="creating = false" @saved="onCreated" />
    <OfferDetailModal v-if="openId" :offer-id="openId" @close="closeOffer" @changed="refresh" />
  </div>
</template>

<script setup lang="ts">
import { formatDate } from '~/composables/useClientConfig'
import RecordPicker from '~/components/admin/pickers/RecordPicker.vue'
import OfferFormModal from '~/components/admin/offers/OfferFormModal.vue'
import OfferDetailModal from '~/components/admin/offers/OfferDetailModal.vue'
import { OFFER_STATUSES, OFFER_STATUS_LABELS, formatAmount, offerFinanceLabel, type PickedRecord } from '~/utils/pipelineCatalog'

/**
 * Ofertas (FASE 23, bloque N6) — listado global de la agencia con filtros
 * por estado, catálogo, comercial, inmueble, comprador y vendedor. Una fila
 * abre el detalle: partes, términos, acciones (enviar, contraoferta, nueva
 * oferta, aceptar, rechazar, retirar, crear operación) y el historial
 * inmutable. `?offer=<id>` abre una oferta directamente (lo usan los enlaces
 * de la cronología de actividad).
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Ofertas — M&M Real Estate' })
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => canWrite('crm'))

const STATUS_CLS: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-600',
  submitted: 'bg-blue-50 text-blue-700',
  countered: 'bg-amber-50 text-amber-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  withdrawn: 'bg-stone-100 text-stone-500',
  expired: 'bg-stone-100 text-stone-500',
}

const status = ref('')
const propertyKind = ref('')
const commercialId = ref<number | ''>('')
const property = ref<PickedRecord | null>(null)
const buyer = ref<PickedRecord | null>(null)
const seller = ref<PickedRecord | null>(null)

const query = computed(() => {
  const q: Record<string, any> = {}
  if (status.value) q.status = status.value
  if (property.value) {
    q.propertyId = property.value.id
    q.propertyKind = property.value.kind || 'developer'
  } else if (propertyKind.value) q.propertyKind = propertyKind.value
  if (commercialId.value) q.commercialId = commercialId.value
  if (buyer.value) q.buyerContactId = buyer.value.id
  if (seller.value) q.sellerContactId = seller.value.id
  return q
})
const { data, refresh } = await useFetch<any>('/api/admin/saas/offers', { query })
const rows = computed<any[]>(() => data.value?.rows || [])

const { data: agentsData } = await useFetch<any>('/api/admin/saas/agents')
const agents = computed<any[]>(() => agentsData.value?.rows || [])

const openId = ref<number | null>(Number(route.query.offer) || null)
function openOffer(id: number) {
  openId.value = id
}
function closeOffer() {
  openId.value = null
  if (route.query.offer) router.replace({ query: { ...route.query, offer: undefined } })
}

const creating = ref(false)
function onCreated(offer: any) {
  creating.value = false
  toast.success('Oferta creada en borrador')
  refresh()
  openId.value = offer.id
}
</script>

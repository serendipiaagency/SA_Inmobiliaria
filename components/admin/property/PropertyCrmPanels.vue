<template>
  <div v-if="canRead('crm')">
    <!-- Ofertas sobre esta propiedad (FASE 23, bloque N6) -->
    <section class="pe-card mt-6 px-6 py-5 sm:px-8" data-testid="property-offers">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-[15px] font-medium text-ink">Ofertas</h2>
        <div class="flex items-center gap-2">
          <NuxtLink :to="`/admin/ofertas`" class="text-[12px] text-stone-500 hover:underline">Todas las ofertas →</NuxtLink>
          <button v-if="canWrite('crm') && !trashed" type="button" class="btn-quiet !px-2.5 !py-1 text-xs" data-testid="property-offer-new" @click="creating = true">+ Nueva oferta</button>
        </div>
      </div>
      <p v-if="trashed" class="mb-2 text-[12px] text-stone-500">La propiedad está en la papelera: sus ofertas se conservan, pero no se pueden crear nuevas.</p>
      <p v-if="pending" class="py-4 text-center text-sm text-stone-400">Cargando…</p>
      <p v-else-if="!offers.length" class="py-4 text-center text-sm text-stone-400">Ninguna oferta sobre esta propiedad todavía.</p>
      <ul v-else class="divide-y divide-line">
        <li v-for="o in offers" :key="o.id">
          <button type="button" class="flex w-full flex-wrap items-center justify-between gap-2 py-2.5 text-left hover:bg-stone-50" :data-testid="`property-offer-${o.id}`" @click="openId = o.id">
            <span class="min-w-0">
              <span class="block text-[13px] font-medium text-ink">{{ o.buyerName || `Comprador #${o.buyerContactId}` }} · {{ formatAmount(o.currentAmount, o.currency) }}</span>
              <span class="block text-[11px] text-stone-400">
                {{ offerFinanceLabel(o.currentFinanceCondition) }}<template v-if="o.expiration"> · vence {{ formatDate(o.expiration) }}</template><template v-if="o.isExpired"> (vencida)</template>
              </span>
            </span>
            <span class="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">{{ OFFER_STATUS_LABELS[o.status] || o.status }}</span>
          </button>
        </li>
      </ul>
    </section>

    <!-- Notas del equipo sobre la propiedad (Note, FASE 0, cierre D3a). En la
         papelera también se pueden anotar: es historia interna, no trabajo nuevo. -->
    <section class="pe-card mt-6 px-6 py-5 sm:px-8" data-testid="property-notes">
      <h2 class="mb-1 text-[15px] font-medium text-ink">Notas</h2>
      <p class="mb-3 text-[12px] text-stone-500">Internas: las ve tu equipo, nunca salen en la web ni se envían al cliente.</p>
      <NotesPanel entity-type="property" :entity-id="propertyId" :property-kind="kind" :can-edit="canWrite('crm')" />
    </section>

    <!-- Actividad de la propiedad (FASE 21, bloque N6) -->
    <section class="pe-card mt-6 px-6 py-5 sm:px-8" data-testid="property-activity">
      <h2 class="mb-3 text-[15px] font-medium text-ink">Actividad</h2>
      <ActivityTimeline :filter="{ propertyId, propertyKind: kind }" :refresh-key="refreshKey" empty-text="Sin actividad registrada sobre esta propiedad." />
    </section>

    <OfferFormModal v-if="creating" :fixed-property="fixedProperty" @close="creating = false" @saved="onCreated" />
    <OfferDetailModal v-if="openId" :offer-id="openId" @close="openId = null" @changed="reload" />
  </div>
</template>

<script setup lang="ts">
import { formatDate } from '~/composables/useClientConfig'
import ActivityTimeline from '~/components/admin/activity/ActivityTimeline.vue'
import NotesPanel from '~/components/admin/notes/NotesPanel.vue'
import OfferFormModal from '~/components/admin/offers/OfferFormModal.vue'
import OfferDetailModal from '~/components/admin/offers/OfferDetailModal.vue'
import { OFFER_STATUS_LABELS, formatAmount, offerFinanceLabel, type PickedRecord } from '~/utils/pipelineCatalog'

/**
 * Lo comercial de una propiedad en su ficha (bloque N6), igual en los dos
 * catálogos: el panel de ofertas (crear con vendedor, financiación y
 * vencimiento; abrir una para negociar y ver su historial) y la cronología
 * de actividad. Se monta con una sola línea en PropertyBuilder.vue para no
 * tocar el editor. Sólo para quien puede leer el CRM (las ofertas, las notas
 * y la actividad son de ese área). Cierre D3a: las notas del equipo.
 */
const props = withDefaults(defineProps<{ propertyId: number; kind: 'agent' | 'developer'; name?: string | null; trashed?: boolean }>(), { name: null, trashed: false })
const { canRead, canWrite } = useAdminPermissions()
const toast = useToast()

const offers = ref<any[]>([])
const pending = ref(false)
const refreshKey = ref(0)
const creating = ref(false)
const openId = ref<number | null>(null)
const fixedProperty = computed<PickedRecord>(() => ({ id: props.propertyId, kind: props.kind, label: props.name || `Inmueble #${props.propertyId}` }))

async function loadOffers() {
  pending.value = true
  try {
    const r = await $fetch<{ rows: any[] }>('/api/admin/saas/offers', { query: { propertyId: props.propertyId, propertyKind: props.kind } })
    offers.value = r.rows
  } catch {
    offers.value = []
  } finally {
    pending.value = false
  }
}
function reload() {
  loadOffers()
  refreshKey.value++
}
function onCreated(offer: any) {
  creating.value = false
  toast.success('Oferta creada en borrador')
  reload()
  openId.value = offer.id
}
onMounted(() => {
  if (canRead('crm')) loadOffers()
})
</script>

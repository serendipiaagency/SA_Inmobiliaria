<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="$emit('close')">
    <div class="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-label="Nueva oferta" data-testid="offer-form">
      <h3 class="mb-1 text-sm font-semibold">Nueva oferta</h3>
      <p class="mb-4 text-[12px] text-stone-500">Se crea en borrador: revísala y pulsa «Enviar» cuando el comprador la confirme.</p>
      <div class="space-y-3">
        <div>
          <span class="of-label">Inmueble</span>
          <RecordPicker v-model="property" kind="property" :locked="!!fixedProperty" />
        </div>
        <div>
          <span class="of-label">Comprador</span>
          <RecordPicker v-model="buyer" kind="contact" :locked="!!fixedBuyer" placeholder="Buscar al comprador entre tus contactos…" />
        </div>
        <div>
          <span class="of-label">Vendedor(es)</span>
          <ul v-if="sellers.length" class="mb-1.5 flex flex-wrap gap-1.5">
            <li v-for="s in sellers" :key="s.id" class="flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-[12px]" :data-testid="`offer-form-seller-${s.id}`">
              {{ s.label }}
              <button type="button" class="text-stone-400 hover:text-red-600" :aria-label="`Quitar a ${s.label}`" @click="sellers = sellers.filter((x) => x.id !== s.id)">×</button>
            </li>
          </ul>
          <RecordPicker v-model="sellerPick" kind="contact" placeholder="Añadir vendedor (propietario)…" />
        </div>
        <label class="block">
          <span class="of-label">Comercial</span>
          <select v-model="commercialId" class="input" data-testid="offer-form-commercial">
            <option value="">Sin asignar</option>
            <option v-for="a in agentOptions" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <OfferTermsFields v-model="terms" testid="offer-form" />
      </div>
      <p v-if="error" class="mt-3 text-sm font-medium text-red-600" data-testid="offer-form-error">{{ error }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="$emit('close')">Cancelar</button>
        <button type="button" class="btn-primary" :disabled="!canSave || saving" data-testid="offer-form-save" @click="submit">{{ saving ? 'Guardando…' : 'Crear oferta' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import RecordPicker from '~/components/admin/pickers/RecordPicker.vue'
import OfferTermsFields from '~/components/admin/offers/OfferTermsFields.vue'
import { offerTermsFrom, type OfferTerms, type PickedRecord } from '~/utils/pipelineCatalog'

/**
 * Alta de una oferta (FASE 23, bloque N6) con todo lo que el modelo ya
 * guardaba y la interfaz no pedía: vendedor(es), financiación y
 * vencimiento, además de importe y condiciones. Inmueble y comprador pueden
 * venir fijados por la pantalla (la ficha de la propiedad fija el inmueble).
 * El servidor valida cada referencia en la organización y rechaza un
 * inmueble de la papelera.
 */
const props = withDefaults(
  defineProps<{
    fixedProperty?: PickedRecord | null
    fixedBuyer?: PickedRecord | null
    leadId?: number | null
    agents?: { id: number; name: string }[] | null
  }>(),
  { fixedProperty: null, fixedBuyer: null, leadId: null, agents: null },
)
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved', offer: any): void }>()

const property = ref<PickedRecord | null>(props.fixedProperty)
const buyer = ref<PickedRecord | null>(props.fixedBuyer)
const sellers = ref<PickedRecord[]>([])
const sellerPick = ref<PickedRecord | null>(null)
watch(sellerPick, (v) => {
  if (v && !sellers.value.some((s) => s.id === v.id)) sellers.value = [...sellers.value, v]
  if (v) sellerPick.value = null
})
const commercialId = ref<number | ''>('')
const terms = ref<OfferTerms>(offerTermsFrom())

const agentOptions = ref<{ id: number; name: string }[]>(props.agents || [])
onMounted(async () => {
  if (props.agents) return
  const res = await $fetch<any>('/api/admin/saas/agents').catch(() => null)
  agentOptions.value = res?.rows || []
})

const canSave = computed(() => !!property.value && !!buyer.value && Number(terms.value.amount) > 0)
const saving = ref(false)
const error = ref('')
async function submit() {
  if (!canSave.value) return
  saving.value = true
  error.value = ''
  try {
    const offer = await $fetch<any>('/api/admin/saas/offers', {
      method: 'POST',
      body: {
        propertyId: property.value!.id,
        propertyKind: property.value!.kind || 'developer',
        buyerContactId: buyer.value!.id,
        sellerContactIds: sellers.value.map((s) => s.id),
        commercialId: commercialId.value || null,
        leadId: props.leadId,
        amount: Number(terms.value.amount),
        conditions: terms.value.conditions || null,
        financeCondition: terms.value.financeCondition || null,
        expiration: terms.value.expiration || null,
      },
    })
    emit('saved', offer)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo crear la oferta'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.of-label {
  @apply mb-1 block text-[12px] font-medium text-stone-600;
}
</style>

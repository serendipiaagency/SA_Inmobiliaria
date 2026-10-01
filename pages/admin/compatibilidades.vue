<!--
  Compatibilidades — la dirección Inmueble → compradores del motor de matching
  (FASE 11).

  Es el mismo motor que usa la ficha de contacto para ir al revés: aquí se
  elige un inmueble y se ve qué necesidades registradas encajan, con la
  explicación de por qué. Ningún cálculo se hace en esta pantalla.
-->
<template>
  <div>
    <header class="mb-6">
      <h1 class="text-xl font-semibold">Compatibilidades</h1>
      <p class="mt-1 text-sm text-stone-500">
        Elige un inmueble y verás qué compradores registrados encajan, con el desglose de por qué.
      </p>
    </header>

    <AdminPanel title="Inmueble" class="mb-5">
      <select v-model="selected" class="cfg-input" data-testid="match-property-select">
        <option :value="null">Selecciona un inmueble…</option>
        <optgroup label="Propiedades (web)">
          <option v-for="p in developerProperties" :key="`developer-${p.id}`" :value="`developer:${p.id}`">
            {{ p.name || `Proyecto #${p.id}` }}
            — {{ p.propertyType || 'sin tipo' }}{{ p.price != null ? ` · ${money(p.price)}` : '' }}
          </option>
        </optgroup>
        <optgroup label="Propiedades 2ª mano">
          <option v-for="p in agentProperties" :key="`agent-${p.id}`" :value="`agent:${p.id}`">
            {{ p.location || `Inmueble #${p.id}` }}
            — {{ p.propertyType || 'sin tipo' }}{{ p.price != null ? ` · ${money(p.price)}` : '' }}
          </option>
        </optgroup>
      </select>

      <div v-if="current" class="mt-4 border-t border-line pt-4">
        <p class="text-xs text-stone-500">
          <template v-if="current.featuresReviewedAt">
            ✓ Características revisadas el {{ dt.date(current.featuresReviewedAt) }}. Una característica sin marcar cuenta como «no la tiene».
          </template>
          <template v-else>
            Las características de este inmueble no se han repasado nunca, así que lo que no está marcado cuenta como
            <strong>desconocido</strong>, no como «no la tiene»: el motor no descarta a nadie por un dato que falta.
          </template>
        </p>
        <button
          v-if="!current.featuresReviewedAt"
          type="button"
          class="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-stone-50"
          data-testid="match-mark-reviewed"
          @click="markReviewed"
        >
          He repasado las características
        </button>
      </div>
    </AdminPanel>

    <p v-if="loading" class="text-sm text-stone-400">Buscando compradores…</p>

    <template v-else-if="data">
      <p class="mb-3 text-xs text-stone-400">
        {{ data.results.length }} de {{ data.scanned }} necesidades activas compatibles.
      </p>
      <p v-if="!data.results.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
        Ninguna necesidad registrada encaja con este inmueble.
      </p>
      <div v-else class="space-y-3">
        <AdminPanel v-for="m in data.results" :key="m.requirement.id" :data-testid="`match-requirement-${m.requirement.id}`">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <NuxtLink v-if="m.contact" :to="`/admin/contactos/${m.contact.id}`" class="text-sm font-medium hover:underline">
                {{ m.contact.name }}
              </NuxtLink>
              <p v-else class="text-sm font-medium text-stone-400">Contacto no disponible</p>
              <p class="text-xs text-stone-400">
                {{ m.requirement.title || 'Necesidad' }}
                <span v-if="m.contact?.phone"> · {{ m.contact.phone }}</span>
              </p>
            </div>
            <div class="flex shrink-0 gap-2 text-xs">
              <button
                type="button"
                class="rounded-lg border border-line px-2 py-1 font-medium hover:bg-stone-50"
                :class="m.persisted?.status === 'selected' ? 'border-emerald-300 text-emerald-700' : ''"
                data-testid="match-select"
                @click="decide(m, 'selected')"
              >
                {{ m.persisted?.status === 'selected' ? 'Seleccionado' : 'Seleccionar' }}
              </button>
              <button
                type="button"
                class="rounded-lg border border-line px-2 py-1 font-medium hover:bg-stone-50"
                :class="m.persisted?.status === 'discarded' ? 'border-rose-300 text-rose-700' : ''"
                @click="decide(m, 'discarded')"
              >
                {{ m.persisted?.status === 'discarded' ? 'Descartado' : 'Descartar' }}
              </button>
              <button
                v-if="m.persisted?.status === 'selected' && m.contact"
                type="button"
                class="rounded-lg border border-line px-2 py-1 font-medium hover:bg-stone-50"
                @click="openOfferForm(m)"
              >
                Crear oferta
              </button>
              <button
                v-if="(m.persisted?.status === 'selected' || m.sent) && m.contact?.phone"
                type="button"
                class="rounded-lg border border-line px-2 py-1 font-medium hover:bg-stone-50"
                :class="m.sent ? 'border-emerald-300 text-emerald-700' : ''"
                :disabled="sendingPropertyFor === m"
                data-testid="match-send-property"
                @click="sendPropertyToMatch(m)"
              >
                {{ sendingPropertyFor === m ? 'Enviando…' : m.sent ? 'Propiedad enviada' : 'Enviar propiedad' }}
              </button>
            </div>
          </div>
          <AdminMatchBreakdown :result="m.result" class="mt-3 border-t border-line pt-3" />
          <div v-if="offerFormFor === m" class="mt-3 flex items-center gap-2 border-t border-line pt-3">
            <input v-model.number="offerAmount" type="number" min="1" step="1" class="cfg-input" placeholder="Importe de la oferta (€)" >
            <button type="button" class="btn-primary shrink-0 !px-3 !py-1.5 text-xs" :disabled="!(offerAmount! > 0) || creatingOffer" @click="createOfferFromMatch(m)">
              {{ creatingOffer ? 'Creando…' : 'Crear' }}
            </button>
            <button type="button" class="btn-secondary shrink-0 !px-3 !py-1.5 text-xs" @click="offerFormFor = null">Cancelar</button>
          </div>
        </AdminPanel>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Compatibilidades — M&M Real Estate' })

const dt = useDash()
const toast = useToast()

/** `"developer:12"` / `"agent:7"` — un único v-model para un selector con dos catálogos. */
const selected = ref<string | null>(null)
const propertyKind = computed<'developer' | 'agent' | null>(() => (selected.value ? (selected.value.split(':')[0] as 'developer' | 'agent') : null))
const propertyId = computed<number | null>(() => (selected.value ? Number(selected.value.split(':')[1]) : null))

const data = ref<any>(null)
const loading = ref(false)

const [{ data: devList }, { data: agentList }] = await Promise.all([
  useFetch<any>('/api/admin/developer-properties', { query: { perPage: 100 } }),
  useFetch<any>('/api/admin/properties', { query: { perPage: 100 } }),
])
const developerProperties = computed<any[]>(() => devList.value?.items || devList.value?.rows || [])
const agentProperties = computed<any[]>(() => agentList.value?.items || agentList.value?.rows || [])
const current = computed(() => {
  if (propertyKind.value === 'developer') return developerProperties.value.find((p) => p.id === propertyId.value) || null
  if (propertyKind.value === 'agent') return agentProperties.value.find((p) => p.id === propertyId.value) || null
  return null
})

function money(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

async function fetchMatches() {
  data.value = null
  if (!propertyId.value || !propertyKind.value) return
  loading.value = true
  try {
    data.value = await $fetch<any>(`/api/admin/saas/matching/property/${propertyId.value}`, { query: { kind: propertyKind.value } })
  } catch {
    toast.error('No se pudo buscar compradores')
  } finally {
    loading.value = false
  }
}
watch(selected, fetchMatches)

async function markReviewed() {
  if (!propertyId.value || !propertyKind.value) return
  try {
    await $fetch('/api/admin/saas/matching/features-reviewed', { method: 'POST', body: { propertyId: propertyId.value, propertyKind: propertyKind.value } })
    // Se recarga el listado para que la ficha traiga la fecha, y el matching
    // para que los "no consta" que ahora son "no" se recalculen.
    await refreshNuxtData()
    await fetchMatches()
    toast.success('Características marcadas como revisadas')
  } catch {
    toast.error('No se pudo guardar')
  }
}

// --- Crear oferta desde un match seleccionado (FASE 23 §87) ---
const offerFormFor = ref<any>(null)
const offerAmount = ref<number | null>(null)
function openOfferForm(m: any) {
  offerFormFor.value = m
  offerAmount.value = current.value?.price ?? null
}
const creatingOffer = ref(false)
async function createOfferFromMatch(m: any) {
  if (!(offerAmount.value! > 0) || !propertyId.value || !propertyKind.value) return
  creatingOffer.value = true
  try {
    await $fetch('/api/admin/saas/offers', {
      method: 'POST',
      body: {
        propertyId: propertyId.value,
        propertyKind: propertyKind.value,
        buyerContactId: m.contact.id,
        buyerRequirementId: m.requirement.id,
        matchId: m.persisted.id,
        amount: offerAmount.value,
      },
    })
    offerFormFor.value = null
    toast.success('Oferta creada en borrador — revísala y envíala desde la ficha del cliente')
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo crear la oferta')
  } finally {
    creatingOffer.value = false
  }
}

// --- Enviar propiedad desde un match seleccionado (FASE 29 §126-127) ---
// "Enviar propiedad" en Matching ahora pasa por el Centro de Comunicaciones
// — nunca un envío simulado: PropertyMatch sólo pasa a `sent` cuando
// sendOutbound() confirma que el mensaje salió de verdad (ver
// share-property.post.ts#markMatchSent).
const sendingPropertyFor = ref<any>(null)
async function sendPropertyToMatch(m: any) {
  if (!propertyId.value || !propertyKind.value || !m.contact?.phone) return
  sendingPropertyFor.value = m
  try {
    const conv = await $fetch<{ id: number }>('/api/admin/comms/conversations', { method: 'POST', body: { phone: m.contact.phone } })
    await $fetch(`/api/admin/comms/conversations/${conv.id}/share-property`, {
      method: 'POST',
      body: { propertyId: propertyId.value, propertyKind: propertyKind.value, buyerRequirementId: m.requirement.id },
    })
    m.sent = true
    toast.success('Propiedad enviada por WhatsApp')
  } catch (err: any) {
    const data = err?.data?.data
    if (err?.statusCode === 409 && data?.clickToChatUrl) {
      window.open(data.clickToChatUrl, '_blank', 'noopener')
      toast.info('No hay ningún número de WhatsApp conectado: se abre la app de WhatsApp.', 7000)
    } else {
      toast.error(err?.data?.statusMessage || 'No se pudo enviar la propiedad')
    }
  } finally {
    sendingPropertyFor.value = null
  }
}

async function decide(m: any, status: 'selected' | 'discarded') {
  let discardedReason: string | undefined
  if (status === 'discarded') discardedReason = window.prompt('Motivo del descarte (opcional)') || undefined
  try {
    const saved = await $fetch<any>('/api/admin/saas/matching/matches', {
      method: 'POST',
      body: { buyerRequirementId: m.requirement.id, propertyId: propertyId.value, propertyKind: propertyKind.value, status, discardedReason },
    })
    m.persisted = { id: saved.id, status: saved.status, discardedReason: saved.discardedReason }
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo guardar la decisión')
  }
}
</script>

<style scoped>
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
</style>

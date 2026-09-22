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
      <select v-model="propertyId" class="cfg-input" data-testid="match-property-select">
        <option :value="null">Selecciona un inmueble…</option>
        <option v-for="p in properties" :key="p.id" :value="p.id">
          {{ p.location || `Inmueble #${p.id}` }}
          — {{ p.propertyType || 'sin tipo' }}{{ p.price != null ? ` · ${money(p.price)}` : '' }}
        </option>
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
        <AdminPanel v-for="m in data.results" :key="m.requirement.id">
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
            </div>
          </div>
          <AdminMatchBreakdown :result="m.result" class="mt-3 border-t border-line pt-3" />
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

const propertyId = ref<number | null>(null)
const data = ref<any>(null)
const loading = ref(false)

const { data: list } = await useFetch<any>('/api/admin/properties', { query: { perPage: 100 } })
const properties = computed<any[]>(() => list.value?.items || list.value?.rows || [])
const current = computed(() => properties.value.find((p) => p.id === propertyId.value) || null)

function money(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

watch(propertyId, async (id) => {
  data.value = null
  if (!id) return
  loading.value = true
  try {
    data.value = await $fetch<any>(`/api/admin/saas/matching/property/${id}`)
  } catch {
    toast.error('No se pudo buscar compradores')
  } finally {
    loading.value = false
  }
})

async function markReviewed() {
  if (!propertyId.value) return
  try {
    await $fetch('/api/admin/saas/matching/features-reviewed', { method: 'POST', body: { propertyId: propertyId.value } })
    // Se recarga el listado para que la ficha traiga la fecha, y el matching
    // para que los "no consta" que ahora son "no" se recalculen.
    const id = propertyId.value
    await refreshNuxtData()
    data.value = await $fetch<any>(`/api/admin/saas/matching/property/${id}`)
    toast.success('Características marcadas como revisadas')
  } catch {
    toast.error('No se pudo guardar')
  }
}

async function decide(m: any, status: 'selected' | 'discarded') {
  let discardedReason: string | undefined
  if (status === 'discarded') discardedReason = window.prompt('Motivo del descarte (opcional)') || undefined
  try {
    const saved = await $fetch<any>('/api/admin/saas/matching/matches', {
      method: 'POST',
      body: { buyerRequirementId: m.requirement.id, propertyId: propertyId.value, status, discardedReason },
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

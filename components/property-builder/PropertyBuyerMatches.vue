<template>
  <div data-testid="property-buyer-matches">
    <p v-if="!parentId" class="rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-stone-500">
      Guarda la propiedad primero; después verás aquí qué compradores registrados encajan con ella.
    </p>
    <template v-else>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p class="text-[13px] text-stone-500">
          Las necesidades activas de tus contactos que encajan con este inmueble, con el porqué de cada porcentaje (✓ cumple, △ casi, ✕ no cumple, ? no consta).
          Se calcula con lo último guardado de la ficha.
        </p>
        <div class="flex shrink-0 items-center gap-3 text-[12px]">
          <label class="flex items-center gap-1.5 text-stone-500">
            <input v-model="includeIneligible" type="checkbox" @change="load"> Incluir descartados por un imprescindible
          </label>
          <button type="button" class="pe-btn-quiet !px-3 !py-1.5" :disabled="loading" data-testid="property-buyer-matches-refresh" @click="load">{{ loading ? 'Calculando…' : 'Recalcular' }}</button>
        </div>
      </div>

      <p v-if="error" class="rounded-lg bg-red-50 p-3 text-[13px] text-red-700">{{ error }}</p>
      <p v-else-if="loading && !data" class="py-6 text-center text-sm text-stone-400">Buscando compradores…</p>
      <template v-else-if="data">
        <p class="mb-3 text-xs text-stone-400" data-testid="property-buyer-matches-count">{{ data.results.length }} de {{ data.scanned }} necesidades activas compatibles.</p>
        <p v-if="!data.results.length" class="rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-stone-500">
          Ninguna necesidad registrada encaja con este inmueble ahora mismo.
        </p>
        <ul v-else class="space-y-3">
          <li v-for="m in data.results" :key="m.requirement.id" class="rounded-xl border border-line bg-white p-4" :data-testid="`property-buyer-${m.requirement.id}`">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <NuxtLink v-if="m.contact" :to="`/admin/contactos/${m.contact.id}?tab=necesidades`" class="text-[14px] font-medium text-ink hover:underline">{{ m.contact.name }}</NuxtLink>
                <p v-else class="text-[14px] font-medium text-stone-400">Contacto no disponible</p>
                <p class="text-[12px] text-stone-400">
                  {{ m.requirement.title || 'Necesidad' }}
                  <span v-if="m.contact?.phone || m.contact?.whatsapp"> · {{ m.contact.whatsapp || m.contact.phone }}</span>
                  <span v-if="m.contact?.email"> · {{ m.contact.email }}</span>
                </p>
              </div>
            </div>
            <AdminMatchBreakdown :result="m.result" class="mt-2" />
            <p v-if="m.persisted?.discardedReason" class="mt-1 text-[11px] text-stone-400">Motivo del descarte: {{ m.persisted.discardedReason }}</p>
            <MatchActions
              class="mt-3"
              :requirement-id="m.requirement.id"
              :requirement-title="m.requirement.title"
              :contact="m.contact"
              :property="{ id: Number(parentId), kind, name: propertyName }"
              :persisted="m.persisted"
              :default-agent-id="m.requirement.assignedCommercialId"
              @update:persisted="(v) => (m.persisted = v)"
            />
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import AdminMatchBreakdown from '~/components/admin/MatchBreakdown.vue'
import MatchActions from '~/components/admin/matching/MatchActions.vue'

/**
 * Paso «Compradores compatibles» del editor de propiedad (los dos catálogos):
 * Inmueble → compradores con el mismo motor que Compatibilidades
 * (GET /api/admin/saas/matching/property/:id?kind=…). Se calcula al abrir el
 * paso, no al abrir la ficha: es una consulta que recorre las necesidades
 * activas de la agencia.
 */
const props = defineProps<{ parentId: number | null; kind: 'agent' | 'developer'; propertyName: string; active: boolean }>()

const data = ref<any>(null)
const loading = ref(false)
const error = ref('')
const includeIneligible = ref(false)

async function load() {
  if (!props.parentId) return
  loading.value = true
  error.value = ''
  try {
    data.value = await $fetch<any>(`/api/admin/saas/matching/property/${props.parentId}`, {
      query: { kind: props.kind, includeIneligible: includeIneligible.value ? '1' : undefined },
    })
  } catch (err: any) {
    error.value = err?.statusCode === 403 ? 'Tu cuenta no tiene acceso al CRM, así que no puede ver los compradores.' : err?.data?.statusMessage || 'No se pudo calcular los compradores compatibles.'
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.active, props.parentId] as const,
  ([active, id]) => {
    if (active && id && !data.value && !loading.value) load()
  },
  { immediate: true },
)
</script>

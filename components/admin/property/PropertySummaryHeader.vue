<template>
  <section class="pe-card mb-4 px-5 py-4" data-testid="property-summary">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-[14px] font-medium text-ink">Resumen de la ficha</h2>
      <div class="flex items-center gap-3 text-[12px]">
        <span v-if="summary" class="text-stone-400">{{ summary.schemaLabel }}</span>
        <button type="button" class="text-stone-500 hover:text-ink" :disabled="pending" data-testid="property-summary-refresh" @click="load">{{ pending ? 'Actualizando…' : 'Actualizar' }}</button>
      </div>
    </div>

    <p v-if="error" class="text-[13px] text-red-600">{{ error }}</p>
    <p v-else-if="!summary" class="text-[13px] text-stone-400">Cargando resumen…</p>
    <template v-else>
      <!-- Avisos: lo que hay que mirar ya -->
      <div v-if="alerts.length" class="mb-3 space-y-1.5" data-testid="property-summary-alerts">
        <p v-for="(a, i) in alerts" :key="i" class="rounded-lg px-3 py-2 text-[12px]" :class="a.tone === 'red' ? 'border border-red-200 bg-red-50 text-red-800' : 'border border-amber-200 bg-amber-50 text-amber-800'">
          {{ a.text }}
        </p>
      </div>

      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-4 xl:grid-cols-8">
        <div>
          <dt class="text-[11px] uppercase tracking-wide text-stone-400">Estado</dt>
          <dd class="font-medium text-ink" data-testid="property-summary-status">{{ summary.commercialStatusLabel || summary.statusLabel || '—' }}</dd>
          <dd v-if="flags" class="text-[11px] text-stone-500">{{ flags }}</dd>
        </div>
        <div>
          <dt class="text-[11px] uppercase tracking-wide text-stone-400">Precio</dt>
          <dd class="font-medium text-ink">{{ summary.price != null ? formatCurrency(summary.price) : '—' }}</dd>
          <dd v-if="summary.priceOld" class="text-[11px] text-stone-400 line-through">{{ formatCurrency(summary.priceOld) }}</dd>
        </div>
        <div>
          <dt class="text-[11px] uppercase tracking-wide text-stone-400">Canales</dt>
          <dd class="font-medium text-ink" data-testid="property-summary-channels">{{ channelsText }}</dd>
          <dd class="text-[11px] text-stone-500">Web: {{ summary.channels.web.label }}</dd>
        </div>
        <div>
          <dt class="text-[11px] uppercase tracking-wide text-stone-400">Propietarios</dt>
          <dd v-if="summary.owners === null" class="text-[12px] text-stone-400">Sin acceso al CRM</dd>
          <dd v-else-if="!summary.owners.length" class="text-[12px] text-amber-700">Sin propietario</dd>
          <dd v-else class="truncate font-medium text-ink" :title="ownersText">{{ ownersText }}</dd>
        </div>
        <div>
          <dt class="text-[11px] uppercase tracking-wide text-stone-400">Compatibles</dt>
          <dd v-if="summary.matches === null" class="text-[12px] text-stone-400">—</dd>
          <dd v-else class="font-medium text-ink">{{ summary.matches.total }} <span class="text-[11px] font-normal text-stone-500">({{ summary.matches.eligible }} encajan)</span></dd>
        </div>
        <div>
          <dt class="text-[11px] uppercase tracking-wide text-stone-400">Ofertas</dt>
          <dd v-if="summary.offers === null" class="text-[12px] text-stone-400">—</dd>
          <dd v-else class="font-medium text-ink">{{ summary.offers.open }} abiertas <span class="text-[11px] font-normal text-stone-500">· {{ summary.offers.total }} en total</span></dd>
        </div>
        <div>
          <dt class="text-[11px] uppercase tracking-wide text-stone-400">Documentos</dt>
          <dd class="font-medium" :class="summary.documents.expired.length ? 'text-red-700' : 'text-ink'" data-testid="property-summary-documents">
            {{ summary.documents.total }}<template v-if="summary.documents.expired.length"> · {{ summary.documents.expired.length }} caducados</template>
          </dd>
          <dd v-if="summary.documents.expiring.length" class="text-[11px] text-amber-700">{{ summary.documents.expiring.length }} caducan pronto</dd>
        </div>
        <div>
          <dt class="text-[11px] uppercase tracking-wide text-stone-400">Multimedia</dt>
          <dd class="font-medium text-ink">{{ summary.media.publicPhotos }}/{{ summary.media.photos }} fotos</dd>
          <dd class="text-[11px] text-stone-500">{{ mediaText }}</dd>
        </div>
      </dl>
    </template>
  </section>
</template>

<script setup lang="ts">
import { PROPERTY_MEDIA_TYPE_LABELS } from '~/utils/propertyMediaCatalog'

/**
 * Cabecera «Resumen» de la ficha de propiedad (FASE 25, bloque N7a), igual en
 * los dos catálogos: estado, precio, canales donde está publicada, dueños,
 * compradores compatibles, ofertas, documentos (con caducados y a punto de
 * caducar), multimedia publicable y qué falta para publicar. Los datos salen
 * de `GET /api/admin/<recurso>/:id?view=summary`; lo de CRM sólo aparece si
 * la cuenta puede leer el CRM.
 */
const props = defineProps<{ resource: 'developer-properties' | 'properties'; recordId: number; refreshKey?: number }>()
const { format: formatCurrency } = useCurrency()

const summary = ref<any | null>(null)
const pending = ref(false)
const error = ref('')

async function load() {
  pending.value = true
  error.value = ''
  try {
    const res = await $fetch<{ summary: any }>(`/api/admin/${props.resource}/${props.recordId}`, { query: { view: 'summary' } })
    summary.value = res.summary
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo cargar el resumen'
  } finally {
    pending.value = false
  }
}

const flags = computed(() => [summary.value?.isExclusive ? 'Exclusiva' : '', summary.value?.isReserved ? 'Reservada' : '', summary.value?.transactionType === 'rent' ? 'Alquiler' : summary.value?.transactionType === 'sale' ? 'Venta' : ''].filter(Boolean).join(' · '))
const ownersText = computed(() => (summary.value?.owners || []).map((o: any) => (o.ownershipPct != null ? `${o.name} (${o.ownershipPct} %)` : o.name)).join(', '))
const channelsText = computed(() => {
  const portals: any[] = summary.value?.channels?.portals || []
  const published = portals.filter((p) => p.state === 'published').length
  const scheduled = portals.filter((p) => p.state === 'scheduled').length
  const blocked = portals.filter((p) => p.state === 'blocked' || p.state === 'failed').length
  if (!portals.length) return summary.value?.channels?.web?.state === 'published' ? 'Web' : 'Sólo panel'
  const parts = [published ? `${published} publicada${published === 1 ? '' : 's'}` : '', scheduled ? `${scheduled} programada${scheduled === 1 ? '' : 's'}` : '', blocked ? `${blocked} con incidencia` : ''].filter(Boolean)
  return parts.join(' · ') || 'Sin programar'
})
const mediaText = computed(() => {
  const byType: Record<string, number> = summary.value?.media?.byType || {}
  const parts = Object.entries(byType).map(([k, n]) => `${n} ${PROPERTY_MEDIA_TYPE_LABELS[k]?.split(' ')[0].toLowerCase() || k}`)
  return parts.length ? parts.join(' · ') : 'Sin vídeos ni otros recursos'
})

const alerts = computed(() => {
  const s = summary.value
  if (!s) return []
  const out: { tone: 'red' | 'amber'; text: string }[] = []
  if (s.documents.expired.length) out.push({ tone: 'red', text: `Documentos caducados: ${s.documents.expired.map((d: any) => `${d.title} (${d.docTypeLabel}, ${String(d.expiresAt).slice(0, 10)})`).join(' · ')}` })
  if (s.documents.expiring.length) out.push({ tone: 'amber', text: `Caducan pronto: ${s.documents.expiring.map((d: any) => `${d.title} (${String(d.expiresAt).slice(0, 10)})`).join(' · ')}` })
  if (!s.publishReadiness.ok && !s.deletedAt) out.push({ tone: 'amber', text: `Para publicarla falta: ${s.publishReadiness.missing.map((m: any) => m.label).join(', ')}.` })
  return out
})

watch(() => [props.recordId, props.refreshKey], load, { immediate: true })
</script>

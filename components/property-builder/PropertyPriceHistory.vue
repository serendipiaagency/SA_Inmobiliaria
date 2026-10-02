<template>
  <section class="pe-card mt-6 px-6 py-5 sm:px-8" data-testid="property-price-history">
    <h2 class="mb-1 text-[15px] font-medium text-ink">Histórico de precios</h2>
    <p class="mb-3 text-[12px] text-stone-500">Cada cambio real de precio — desde la ficha o en bloque — deja aquí su fila, con el precio anterior, quién lo cambió y el motivo. No se edita a mano.</p>
    <p v-if="!rows.length" class="py-4 text-center text-sm text-stone-400">Todavía no ha cambiado de precio.</p>
    <div v-else class="-mx-2 overflow-x-auto">
      <table class="w-full min-w-[520px] text-left text-[13px]">
        <thead class="text-[11px] uppercase text-stone-400">
          <tr>
            <th class="px-2 py-1.5 font-medium">Fecha</th>
            <th class="px-2 py-1.5 font-medium">Precio anterior</th>
            <th class="px-2 py-1.5 font-medium">Precio nuevo</th>
            <th class="px-2 py-1.5 font-medium">Usuario</th>
            <th class="px-2 py-1.5 font-medium">Motivo</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          <tr v-for="(r, i) in rows" :key="`${r.recordedAt}-${i}`" data-testid="property-price-history-row">
            <td class="whitespace-nowrap px-2 py-2 text-stone-500">{{ formatDateTime(r.recordedAt) }}</td>
            <td class="whitespace-nowrap px-2 py-2 text-stone-500">{{ r.previousPrice != null ? formatCurrency(r.previousPrice) : '—' }}</td>
            <td class="whitespace-nowrap px-2 py-2 font-medium text-ink">
              {{ formatCurrency(r.price) }}
              <span v-if="r.previousPrice" class="ml-1 text-[11px]" :class="r.price < r.previousPrice ? 'text-emerald-600' : 'text-amber-600'">{{ variation(r) }}</span>
            </td>
            <td class="px-2 py-2 text-stone-600">{{ r.changedByName || '—' }}</td>
            <td class="px-2 py-2 text-stone-600" data-testid="property-price-history-reason">{{ r.reason || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { formatDateTime } from '~/composables/useClientConfig'

/**
 * PropertyPriceHistory de la ficha (más reciente primero): precio anterior,
 * precio nuevo, fecha, usuario y motivo (migración 0086). Lo sirve el mismo
 * GET que carga el editor (`priceHistory`), sin ruta propia. Las filas
 * anteriores a 0086 no tienen precio anterior ni usuario: se ven como «—».
 */
type Row = { price: number; previousPrice?: number | null; reason?: string | null; changedByName?: string | null; recordedAt: string }
defineProps<{ rows: Row[] }>()
const { format: formatCurrency } = useCurrency()

function variation(r: Row): string {
  if (!r.previousPrice) return ''
  const pct = ((r.price - r.previousPrice) / r.previousPrice) * 100
  return `${pct > 0 ? '+' : ''}${pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`
}
</script>

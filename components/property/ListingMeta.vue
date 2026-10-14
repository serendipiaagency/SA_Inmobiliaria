<template>
  <section v-if="rows.length" class="pcard !p-4 sm:!p-5" data-testid="ficha-listing-meta">
    <dl class="grid grid-cols-1 gap-y-2.5 text-[13px]">
      <div v-for="row in rows" :key="row.key" class="flex items-baseline justify-between gap-3" :data-meta="row.key">
        <dt class="shrink-0 text-stone-500">{{ row.label }}</dt>
        <dd class="min-w-0 text-right font-semibold text-ink [overflow-wrap:anywhere]">
          <time v-if="row.datetime" :datetime="row.datetime">{{ row.value }}</time>
          <template v-else>{{ row.value }}</template>
        </dd>
      </div>
    </dl>
  </section>
</template>

<script setup lang="ts">
import { listingMetaRows } from '~/utils/listingMeta'

/**
 * «Última actualización · Publicada el · Referencia del anuncio»: el bloque
 * compacto bajo «Atendido por» en la columna derecha de la ficha pública.
 * Qué filas salen y con qué texto lo decide utils/listingMeta.ts; sin
 * ninguna fila (una fila sin fechas y sin referencia), el bloque no existe.
 */
const props = defineProps<{
  project: Record<string, any>
  /** La misma «REF:» que las migas (referencia de agencia, código comercial o referencia propia); vacía, sin fila. */
  reference?: string | null
}>()

const { t, intlLocale } = useI18n()
const rows = computed(() => listingMetaRows(props.project, props.reference, intlLocale.value, t))
</script>

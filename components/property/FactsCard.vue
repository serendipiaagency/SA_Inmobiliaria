<template>
  <section v-if="rows.length" :id="anchor" class="pcard min-w-0" :data-testid="testid">
    <h2 class="pcard-title">{{ title }}</h2>
    <dl class="mt-3 grid gap-x-8" :class="columns === 2 ? 'sm:grid-cols-2' : ''">
      <div v-for="r in rows" :key="r.key" class="flex items-center gap-3 border-b border-[#f1eee8] py-2.5 last:border-0" :data-fact="r.key">
        <!-- SVG fijo de utils/featureIcons.ts, nunca datos -->
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f6f2ec] text-stone-500" aria-hidden="true" v-html="featureIconSvg(r.icon, 16)" />
        <dt class="min-w-0 flex-1 text-[13px] text-stone-500">{{ r.label }}</dt>
        <dd class="text-right text-[13.5px] font-semibold text-ink">{{ r.value }}</dd>
      </div>
    </dl>
  </section>
</template>

<script setup lang="ts">
import type { FactRow } from '~/utils/propertyFacts'
import { featureIconSvg } from '~/utils/featureIcons'

/**
 * Tarjeta de datos de la ficha (#110): «Estado del inmueble» (una columna) y
 * «El edificio» (dos). Las filas ya vienen filtradas (utils/propertyFacts.ts):
 * sin filas, la tarjeta no existe.
 */
withDefaults(defineProps<{ title: string; rows: FactRow[]; columns?: 1 | 2; anchor?: string; testid?: string }>(), { columns: 1, anchor: undefined, testid: undefined })
</script>

<template>
  <section v-if="plans.length" id="plano" class="pcard min-w-0" data-testid="property-floor-plans">
    <div class="flex items-center justify-between gap-3">
      <h2 class="pcard-title">{{ plans.length > 1 ? t('floorPlans.headingMany', 'Planos de la vivienda') : t('floorPlans.heading', 'Plano de la vivienda') }}</h2>
      <button type="button" class="pcard-icon-btn" :aria-label="t('floorPlans.expand', 'Ampliar el plano')" :title="t('floorPlans.expand', 'Ampliar el plano')" data-testid="floor-plan-expand" @click="open = true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
      </button>
    </div>

    <div v-if="plans.length > 1" class="mt-3 flex flex-wrap gap-1.5" role="tablist" :aria-label="t('floorPlans.choose', 'Elegir plano')">
      <button
        v-for="(p, i) in plans"
        :key="p.id"
        type="button"
        role="tab"
        class="fp-tab"
        :class="{ 'fp-tab-on': i === active }"
        :aria-selected="i === active"
        :data-testid="`floor-plan-tab-${i}`"
        @click="active = i"
      >
        {{ p.title }}
      </button>
    </div>

    <button type="button" class="fp-stage" :aria-label="t('floorPlans.openFull', 'Ver el plano a pantalla completa')" @click="open = true">
      <img :src="mediaUrl(plans[active].image)" :alt="plans[active].title" class="h-full w-full object-contain" loading="lazy" data-testid="floor-plan-image" >
    </button>
    <p v-if="plans[active].floorDetails || plans[active].sizes" class="mt-2 text-[12.5px] text-stone-500">{{ [plans[active].floorDetails, plans[active].sizes].filter(Boolean).join(' · ') }}</p>

    <ul v-if="chips.length" class="mt-3 flex flex-wrap gap-2" data-testid="floor-plan-facts">
      <li v-for="c in chips" :key="c.key" class="fp-chip">
        <!-- SVG fijo de este componente, nunca datos -->
        <span class="text-stone-400" aria-hidden="true" v-html="c.icon" />
        {{ c.label }}
      </li>
    </ul>

    <PropertyFloorPlanViewer v-if="open" :plans="plans" :start="active" @close="open = false" />
  </section>
</template>

<script setup lang="ts">
import type { PublicFloorPlan } from '~/utils/floorPlans'

/**
 * «Plano de la vivienda» (#110): los planos de la propiedad (paso «Planos» del
 * editor), grandes, sin recortar y sobre fondo neutro; con varios, una
 * pestaña por plano con su título. «Ampliar» abre el visor a pantalla
 * completa. Debajo, los datos de la vivienda que ayudan a leer el plano. Sin
 * planos públicos, la sección no existe.
 */
const props = defineProps<{
  plans: PublicFloorPlan[]
  facts?: { area?: number | null; bedrooms?: number | null; bathrooms?: number | null; hasTerrace?: boolean | number | null }
}>()
const { t } = useI18n()
const active = ref(0)
const open = ref(false)
watch(
  () => props.plans.length,
  (n) => {
    if (active.value >= n) active.value = 0
  },
)

const ICON = {
  area: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
  bed: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/></svg>',
  bath: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.7 3 4 3.7 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M2 12h20M7 19v2M17 19v2"/></svg>',
  terrace: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 8h14M7 8l-2 13M17 8l2 13M3 21h18"/></svg>',
}
const chips = computed(() => {
  const f = props.facts || {}
  const out: { key: string; label: string; icon: string }[] = []
  if (f.area) out.push({ key: 'area', label: `${Math.round(Number(f.area))} m²`, icon: ICON.area })
  if (f.bedrooms) out.push({ key: 'bedrooms', label: `${f.bedrooms} ${t('card.beds', 'hab.')}`, icon: ICON.bed })
  if (f.bathrooms) out.push({ key: 'bathrooms', label: `${f.bathrooms} ${Number(f.bathrooms) === 1 ? t('floorPlans.bath', 'baño') : t('card.baths', 'baños')}`, icon: ICON.bath })
  if (f.hasTerrace) out.push({ key: 'terrace', label: t('filters.feature.terrace', 'Terraza'), icon: ICON.terrace })
  return out
})
</script>

<style scoped>
.fp-stage {
  display: block;
  margin-top: 14px;
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 12px;
  background: #f6f4f0;
  padding: 12px;
  cursor: zoom-in;
}
.fp-tab {
  border: 1px solid #e7e3dc;
  border-radius: 9999px;
  padding: 5px 12px;
  font-size: 12.5px;
  color: #57534e;
  background: #fff;
}
.fp-tab-on {
  border-color: #1c1b19;
  background: #1c1b19;
  color: #fff;
}
.fp-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #ece8e1;
  border-radius: 9999px;
  padding: 5px 11px;
  font-size: 12.5px;
  color: #44403c;
}
</style>

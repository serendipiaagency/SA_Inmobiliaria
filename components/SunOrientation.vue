<template>
  <div class="grid gap-8 sm:grid-cols-[auto,1fr] sm:items-center">
    <div class="mx-auto sm:mx-0">
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r="70" fill="none" stroke="#e7e4de" stroke-width="1.5" />
        <circle cx="80" cy="80" r="46" fill="none" stroke="#e7e4de" stroke-width="1" stroke-dasharray="2 4" />
        <g v-for="d in dirs" :key="d.code" :transform="`rotate(${d.angle} 80 80)`">
          <line x1="80" y1="10" x2="80" y2="18" :stroke="d.code === orientation ? '#16150f' : '#d6d3cc'" :stroke-width="d.code === orientation ? 2.5 : 1.5" />
        </g>
        <text v-for="d in dirs" :key="'lbl-' + d.code" :x="labelPos(d.angle).x" :y="labelPos(d.angle).y" text-anchor="middle" dominant-baseline="middle" :class="d.code === orientation ? 'fill-ink font-bold' : 'fill-stone-400'" style="font-size: 11px">
          {{ d.code }}
        </text>
        <!-- Sun direction marker -->
        <line v-if="orientation" x1="80" y1="80" :x2="markerPos.x" :y2="markerPos.y" stroke="#d97706" stroke-width="1.5" stroke-dasharray="3 3" />
        <circle v-if="orientation" :cx="markerPos.x" :cy="markerPos.y" r="6" fill="#d97706" />
        <circle cx="80" cy="80" r="3" fill="#16150f" />
      </svg>
    </div>

    <div>
      <p v-if="orientation" class="text-lg font-semibold">{{ t('sunOrientation.orientationPrefix', 'Orientación') }} {{ orientationLabel(orientation, t).toLowerCase() }}</p>
      <p v-if="orientation" class="mt-1 text-[14px] leading-relaxed text-stone-600">{{ orientationNote(orientation, t) }}</p>
      <p v-else class="text-sm text-stone-500">{{ t('sunOrientation.notSpecified', 'Orientación no especificada para esta propiedad.') }}</p>

      <div class="mt-5 grid grid-cols-3 gap-3 text-center">
        <div class="rounded-xl border border-line p-3">
          <p class="font-serif text-xl">{{ formatHour(sun.sunriseHour) }}</p>
          <p class="mt-0.5 text-[10px] uppercase tracking-widest text-stone-400">{{ t('sunOrientation.sunriseToday', 'Amanecer hoy') }}</p>
        </div>
        <div class="rounded-xl border border-line p-3">
          <p class="font-serif text-xl">{{ formatHour(sun.sunsetHour) }}</p>
          <p class="mt-0.5 text-[10px] uppercase tracking-widest text-stone-400">{{ t('sunOrientation.sunsetToday', 'Atardecer hoy') }}</p>
        </div>
        <div class="rounded-xl border border-line p-3">
          <p class="font-serif text-xl">{{ sun.dayLengthHours.toFixed(1) }} h</p>
          <p class="mt-0.5 text-[10px] uppercase tracking-widest text-stone-400">{{ t('sunOrientation.daylightHours', 'Horas de luz') }}</p>
        </div>
      </div>
      <p class="mt-3 text-[11px] text-stone-400">{{ usedFallbackCoords ? t('sunOrientation.calculatedForDubai', 'Calculado para las coordenadas de Dubái y la fecha de hoy.') : t('sunOrientation.calculatedForProperty', 'Calculado para las coordenadas reales de la propiedad y la fecha de hoy.') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ orientation?: string | null; lat?: number | null; lng?: number | null }>()
const { t } = useI18n()

const DUBAI_LAT = 25.2048
const DUBAI_LNG = 55.2708
const usedFallbackCoords = computed(() => !props.lat || !props.lng)
const lat = computed(() => props.lat || DUBAI_LAT)
const lng = computed(() => props.lng || DUBAI_LNG)

const sun = computed(() => computeSunTimes(lat.value, lng.value, new Date()))

const dirs = [
  { code: 'N', angle: 0 },
  { code: 'NE', angle: 45 },
  { code: 'E', angle: 90 },
  { code: 'SE', angle: 135 },
  { code: 'S', angle: 180 },
  { code: 'SW', angle: 225 },
  { code: 'W', angle: 270 },
  { code: 'NW', angle: 315 },
]

function labelPos(angle: number) {
  const r = 58
  const rad = ((angle - 90) * Math.PI) / 180
  return { x: 80 + r * Math.cos(rad), y: 80 + r * Math.sin(rad) }
}

const orientation = computed(() => (props.orientation ? props.orientation.toUpperCase() : null))
const markerPos = computed(() => {
  if (!orientation.value) return { x: 80, y: 80 }
  const angle = orientationAngle(orientation.value)
  const r = 34
  const rad = ((angle - 90) * Math.PI) / 180
  return { x: 80 + r * Math.cos(rad), y: 80 + r * Math.sin(rad) }
})
</script>

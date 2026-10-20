<template>
  <div class="solar-card" data-testid="solar-exposure">
    <p v-if="exposure.demo" class="solar-demo" role="note" data-testid="solar-demo-note">Datos de demostración: no son la exposición solar de esta propiedad. Sólo se ven en el Constructor Web.</p>
    <p v-else-if="exposure.estimated" class="solar-demo" role="note" data-testid="solar-estimate-note">Estimación a partir de la orientación y la latitud (cielo despejado). No tiene en cuenta las sombras de edificios o del relieve cercanos.</p>
    <p v-else-if="isPvgis" class="solar-demo" role="note" data-testid="solar-pvgis-note">Calculado con datos reales de irradiación de PVGIS (Comisión Europea) para la orientación de la fachada. Tiene en cuenta el clima de la zona y el relieve, pero no las sombras de edificios cercanos.</p>

    <div class="solar-body">
      <div class="solar-gauge" role="img" :aria-label="`SunScore ${exposure.score} sobre 100`" data-testid="solar-score">
        <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
          <circle cx="60" cy="60" r="52" fill="none" stroke="#efe6cf" stroke-width="9" />
          <circle cx="60" cy="60" r="52" fill="none" stroke="#c6a667" stroke-width="9" stroke-linecap="round" :stroke-dasharray="`${arc} ${circumference}`" transform="rotate(-90 60 60)" />
        </svg>
        <span class="solar-score-num">{{ exposure.score }}</span>
        <span class="solar-score-cap">SunScore</span>
      </div>

      <div class="solar-text">
        <p class="solar-label" data-testid="solar-label">{{ band.label }}</p>
        <p class="solar-note">{{ band.text }}</p>
        <p v-if="explanation" class="solar-note" data-testid="solar-explanation">{{ explanation }}</p>
      </div>
    </div>

    <figure v-if="months" class="solar-chart" data-testid="solar-chart">
      <figcaption class="solar-cap">Horas de sol directo al día{{ exposure.estimated ? ' (estimadas)' : '' }}</figcaption>
      <div class="solar-bars">
        <div v-for="b in bars" :key="b.key" class="solar-bar">
          <span class="solar-bar-val">{{ b.text }} h</span>
          <span class="solar-bar-track" aria-hidden="true"><span class="solar-bar-fill" :style="{ height: `${b.pct}%` }" /></span>
          <span class="solar-bar-name">{{ b.name }}</span>
        </div>
      </div>
    </figure>

    <div class="solar-foot">
      <a v-if="exposure.viewerUrl && !exposure.demo" :href="exposure.viewerUrl" target="_blank" rel="noopener noreferrer" class="solar-link" data-testid="solar-viewer-link">Ver simulación solar 3D<span aria-hidden="true"> ↗</span></a>
      <span v-else-if="exposure.demo" class="solar-link solar-link-off" aria-disabled="true">Ver simulación solar 3D</span>
      <p class="solar-attr" data-testid="solar-attribution">{{ exposure.estimated ? 'Estimación de INMO según orientación y latitud' : `Proporcionado por ${exposure.provider}` }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { solarBand, solarExplanation, solarJuneDecember, type SolarExposure } from '~/utils/solarExposure'

/**
 * Tarjeta «Exposición solar» de la ficha: el SunScore (0–100) en un círculo
 * dorado, su valoración con palabras, una frase que sólo dice lo que dicen los
 * datos, el gráfico de junio y diciembre y el enlace al visor 3D del proveedor
 * (una pestaña nueva: nunca se incrusta). Pinta únicamente lo que valida
 * utils/solarExposure.ts; sin dato no se monta (lo decide la ficha).
 */
const props = defineProps<{ exposure: SolarExposure }>()

const circumference = 2 * Math.PI * 52
const arc = computed(() => (Math.max(0, Math.min(100, props.exposure.score)) / 100) * circumference)
const band = computed(() => solarBand(props.exposure.score))
const explanation = computed(() => solarExplanation(props.exposure))
const months = computed(() => solarJuneDecember(props.exposure))
const isPvgis = computed(() => !props.exposure.demo && !props.exposure.estimated && /PVGIS/i.test(props.exposure.provider))
const fmt = (n: number) => String(n).replace('.', ',')
const bars = computed(() => {
  const m = months.value
  if (!m) return []
  const top = Math.max(m.june, m.december, 1)
  return [
    { key: 'june', name: 'Junio', text: fmt(m.june), pct: Math.round((m.june / top) * 100) },
    { key: 'december', name: 'Diciembre', text: fmt(m.december), pct: Math.round((m.december / top) * 100) },
  ]
})
</script>

<style scoped>
.solar-card { display: grid; gap: 20px; }
.solar-demo { margin: 0; padding: 8px 12px; border-radius: 10px; background: #fbf5e4; color: #6b5218; font-size: 12px; }
.solar-body { display: flex; flex-wrap: wrap; align-items: center; gap: 24px; }
.solar-gauge { position: relative; width: 120px; height: 120px; flex: none; }
.solar-score-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding-bottom: 12px; font-size: 34px; font-weight: 700; color: #1c1917; }
.solar-score-cap { position: absolute; left: 0; right: 0; bottom: 30px; text-align: center; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: #78716c; }
.solar-text { min-width: 200px; flex: 1; }
.solar-label { margin: 0; font-size: 18px; font-weight: 700; color: #1c1917; }
.solar-note { margin: 6px 0 0; font-size: 14px; line-height: 1.5; color: #57534e; }
.solar-chart { margin: 0; }
.solar-cap { margin-bottom: 8px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #78716c; }
.solar-bars { display: flex; gap: 24px; align-items: flex-end; }
.solar-bar { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 84px; }
.solar-bar-track { display: flex; align-items: flex-end; width: 100%; height: 90px; border-radius: 8px; background: #f5f0e4; overflow: hidden; }
.solar-bar-fill { display: block; width: 100%; background: #c6a667; border-radius: 8px 8px 0 0; }
.solar-bar-val { font-size: 13px; font-weight: 600; color: #1c1917; }
.solar-bar-name { font-size: 12px; color: #78716c; }
.solar-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
.solar-link { font-size: 13px; font-weight: 600; color: #1c1917; text-decoration: underline; text-underline-offset: 3px; }
.solar-link:focus-visible { outline: 2px solid #1c1917; outline-offset: 3px; }
.solar-link-off { color: #a8a29e; text-decoration: none; cursor: not-allowed; }
.solar-attr { margin: 0; font-size: 11px; color: #78716c; }
</style>

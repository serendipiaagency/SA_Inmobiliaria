<template>
  <section
    class="ec"
    :class="[`ec-bg-${opts.background}`, `ec-r-${opts.radius}`, `ec-p-${opts.padding}`, { 'ec-border': opts.border, 'ec-narrow': opts.width === 'narrow' }]"
    :aria-labelledby="titleId"
    data-testid="energy-card"
  >
    <div class="ec-head">
      <h2 :id="titleId" class="ec-title" :class="`ec-title-${opts.titleSize}`">
        <!-- Desplegable: el título es el botón (patrón de acordeón: h2 > button, aria-expanded y aria-controls). -->
        <button v-if="opts.collapsible" type="button" class="ec-toggle" :aria-expanded="open" :aria-controls="bodyId" data-testid="energy-toggle" @click="open = !open">
          <span>{{ titleText }}</span>
          <svg class="ec-chevron" :class="{ 'ec-chevron-open': open }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <template v-else>{{ titleText }}</template>
      </h2>
      <!-- Plegado, las clases de la vivienda a la vista: el visitante ve lo esencial sin desplegar. -->
      <span v-if="opts.collapsible && !open && glance.length" class="ec-glance" data-testid="energy-glance">
        <span v-for="g in glance" :key="g.key" class="ec-glance-item">
          <span class="ec-glance-label">{{ g.label }}</span>
          <span class="ec-tag-letter" :style="{ background: ENERGY_COLORS[g.letter], color: ENERGY_TEXT[g.letter] }">{{ g.letter }}</span>
        </span>
      </span>
      <p v-if="certificateLine" class="ec-cert" :class="{ 'ec-cert-expired': certificate === 'expired' }" data-testid="energy-certificate">{{ certificateLine }}</p>
    </div>

    <div :id="bodyId" class="ec-collapse" :data-open="open ? 'true' : 'false'" data-testid="energy-body">
      <div class="ec-inner">
        <div class="ec-layout" :class="`ec-images-${opts.imagesPosition}`">
          <div class="ec-main">
            <!-- Tabla completa: las siete flechas de la etiqueta, con la clase de esta vivienda marcada en cada columna -->
            <table v-if="opts.showRating && opts.layout === 'full' && (data.rating || data.emissionsRating)" class="ec-table" data-testid="energy-table">
              <caption class="sr-only">{{ captionText }}</caption>
              <thead>
                <tr>
                  <th scope="col" class="ec-th ec-th-scale">{{ t('energy.rating', 'Clasificación') }}</th>
                  <th v-if="opts.showConsumption" scope="col" class="ec-th">
                    {{ t('energy.consumption', 'Consumo de energía') }}
                    <span class="ec-unit">{{ t('energy.consumptionUnit', 'kWh/m²·año') }}</span>
                  </th>
                  <th v-if="opts.showEmissions" scope="col" class="ec-th">
                    {{ t('energy.emissions', 'Emisiones') }}
                    <span class="ec-unit">{{ t('energy.emissionsUnit', 'kg CO₂/m²·año') }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in ENERGY_LETTERS" :key="l" :class="{ 'ec-row-on': l === data.rating || l === data.emissionsRating }" :data-letter="l" :data-active="l === data.rating || undefined">
                  <th scope="row" class="ec-scale">
                    <span class="ec-arrow" :style="{ width: `${energyBarWidth(l)}%`, background: ENERGY_COLORS[l], color: ENERGY_TEXT[l] }">{{ l }}</span>
                  </th>
                  <td v-if="opts.showConsumption" class="ec-cell">
                    <span v-if="l === data.rating" class="ec-tag" data-testid="energy-consumption">
                      <span class="ec-tag-letter" :style="{ background: ENERGY_COLORS[l], color: ENERGY_TEXT[l] }">{{ l }}</span>
                      <span v-if="data.consumption != null">{{ formatEnergyValue(data.consumption, intlLocale) }}</span>
                      <span v-else class="ec-nodata" data-testid="energy-no-value"><span class="ec-nodata-long">{{ t('energy.noValue', 'Valor no indicado') }}</span><span class="ec-nodata-short">{{ t('energy.noValueShort', 'Sin dato') }}</span></span>
                      <span class="sr-only">— {{ t('energy.thisHome', 'Esta vivienda') }}</span>
                    </span>
                  </td>
                  <td v-if="opts.showEmissions" class="ec-cell">
                    <span v-if="l === data.emissionsRating" class="ec-tag" data-testid="energy-emissions">
                      <span class="ec-tag-letter" :style="{ background: ENERGY_COLORS[l], color: ENERGY_TEXT[l] }">{{ l }}</span>
                      <span v-if="data.emissions != null">{{ formatEnergyValue(data.emissions, intlLocale) }}</span>
                      <span v-else class="ec-nodata" data-testid="energy-no-value"><span class="ec-nodata-long">{{ t('energy.noValue', 'Valor no indicado') }}</span><span class="ec-nodata-short">{{ t('energy.noValueShort', 'Sin dato') }}</span></span>
                      <span class="sr-only">— {{ t('energy.thisHome', 'Esta vivienda') }}</span>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- Resumen: la letra y las cifras reales (compacto, o lo que la tabla no puede situar en una fila) -->
            <dl v-if="summary.length" class="ec-summary" data-testid="energy-summary">
              <div v-for="s in summary" :key="s.key" class="ec-stat" :data-stat="s.key">
                <dt class="ec-stat-label">{{ s.label }}</dt>
                <dd class="ec-stat-value">
                  <span v-if="s.letter" class="ec-tag-letter" :style="{ background: ENERGY_COLORS[s.letter], color: ENERGY_TEXT[s.letter] }">{{ s.letter }}</span>
                  <span v-if="s.value">{{ s.value }}</span>
                </dd>
              </div>
            </dl>

            <p v-if="opts.note" class="ec-note">{{ opts.note }}</p>
          </div>

          <!-- Imágenes subidas al bloque: la etiqueta oficial, un gráfico, la foto del certificado… -->
          <div v-if="opts.images.length" class="ec-images" :data-count="opts.images.length" data-testid="energy-images">
            <figure v-for="(img, i) in opts.images" :key="`${img.src}-${i}`" class="ec-figure" data-testid="energy-image">
              <img :src="mediaUrl(img.src)" :alt="img.alt || img.caption || titleText" loading="lazy" decoding="async" class="ec-img" >
              <figcaption v-if="img.caption" class="ec-caption">{{ img.caption }}</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  ENERGY_COLORS,
  ENERGY_LETTERS,
  ENERGY_TEXT,
  certificateStatus,
  energyBarWidth,
  formatEnergyValue,
  type EnergyData,
  type EnergyDisplayOptions,
  type EnergyLetter,
} from '~/utils/energyCertificate'

/**
 * «Eficiencia energética» de la ficha (sección de la zona dinámica y bloque
 * de la biblioteca del Constructor): la etiqueta A–G con la clase real de la
 * vivienda en consumo y en emisiones, sus cifras y, si consta, la vigencia
 * del certificado. La clase se marca con color y con texto (letra y valor en
 * su fila, y «Esta vivienda» para lectores de pantalla). Nunca pone cifras en
 * las filas que no son las suyas. Quien lo usa decide si sale (sin datos, no).
 */
const props = defineProps<{ data: EnergyData; options: EnergyDisplayOptions }>()
const { t, intlLocale } = useI18n()
const uid = useId()
const titleId = `ec-${uid}`
const opts = computed(() => props.options)
const bodyId = `${titleId}-body`
const titleText = computed(() => opts.value.title || t('energy.title', 'Eficiencia energética'))

// Desplegable: llega abierto o cerrado según el Constructor; sin «desplegable», siempre abierto.
const open = ref(!opts.value.collapsible || opts.value.startOpen)
watch(
  () => [opts.value.collapsible, opts.value.startOpen],
  () => {
    open.value = !opts.value.collapsible || opts.value.startOpen
  },
)

/** Las clases de la vivienda, para verlas con el bloque plegado (sólo lo que el Constructor deja enseñar). */
const glance = computed(() => {
  const d = props.data
  const o = opts.value
  const out: { key: string; label: string; letter: EnergyLetter }[] = []
  if (!o.showRating) return out
  if (o.showConsumption && d.rating) out.push({ key: 'consumption', label: t('energy.consumptionShort', 'Consumo'), letter: d.rating })
  if (o.showEmissions && d.emissionsRating) out.push({ key: 'emissions', label: t('energy.emissionsShort', 'Emisiones'), letter: d.emissionsRating })
  return out
})

const certificate = computed(() => (opts.value.showCertificate ? certificateStatus(props.data.certificateExpiry) : null))
const certificateLine = computed(() => {
  const d = props.data.certificateExpiry
  if (!certificate.value || !d) return ''
  const date = new Date(`${d}T12:00:00`).toLocaleDateString(intlLocale.value, { day: 'numeric', month: 'long', year: 'numeric' })
  return certificate.value === 'valid' ? t('energy.validUntil', 'Certificado vigente hasta el {date}').replace('{date}', date) : t('energy.expired', 'Certificado caducado el {date}').replace('{date}', date)
})

const captionText = computed(() => {
  const parts: string[] = []
  if (props.data.rating) parts.push(`${t('energy.consumption', 'Consumo de energía')}: ${props.data.rating}`)
  if (props.data.emissionsRating) parts.push(`${t('energy.emissions', 'Emisiones')}: ${props.data.emissionsRating}`)
  return `${t('energy.title', 'Eficiencia energética')} — ${parts.join(', ')}`
})

/**
 * Las cifras sueltas: en compacto, todo; con la tabla, sólo lo que no tiene
 * fila donde ir (un valor sin su letra).
 */
const summary = computed(() => {
  const d = props.data
  const o = opts.value
  const table = o.showRating && o.layout === 'full' && !!(d.rating || d.emissionsRating)
  const out: { key: string; label: string; letter: EnergyLetter | null; value: string }[] = []
  const val = (n: number | null, unit: string) => (n == null ? '' : `${formatEnergyValue(n, intlLocale.value)} ${unit}`)
  // Con la letra pero sin la cifra: se dice, en vez de dejar la letra sola como si fuera todo el dato.
  const noValue = (letter: EnergyLetter | null) => (letter ? t('energy.noValue', 'Valor no indicado') : '')
  if (o.showConsumption && (d.consumption != null || (!table && o.showRating && d.rating)) && !(table && d.rating)) {
    out.push({ key: 'consumption', label: t('energy.consumption', 'Consumo de energía'), letter: o.showRating ? d.rating : null, value: val(d.consumption, t('energy.consumptionUnit', 'kWh/m²·año')) || noValue(o.showRating ? d.rating : null) })
  }
  if (o.showEmissions && (d.emissions != null || (!table && o.showRating && d.emissionsRating)) && !(table && d.emissionsRating)) {
    out.push({ key: 'emissions', label: t('energy.emissions', 'Emisiones'), letter: o.showRating ? d.emissionsRating : null, value: val(d.emissions, t('energy.emissionsUnit', 'kg CO₂/m²·año')) || noValue(o.showRating ? d.emissionsRating : null) })
  }
  // Sólo la clase, sin columnas de cifras visibles: que se lea igualmente.
  if (!table && !out.length && o.showRating && d.rating) out.push({ key: 'rating', label: t('energy.rating', 'Clasificación'), letter: d.rating, value: '' })
  return out.filter((s) => s.letter || s.value)
})
</script>

<style scoped>
.ec {
  color: #1c1b19;
}
.ec-narrow {
  max-width: 640px;
}
.ec-bg-white {
  background: #fff;
}
.ec-bg-paper {
  background: #faf8f4;
}
.ec-bg-tint {
  background: #f1f7f2;
}
.ec-border {
  border: 1px solid #ece8e1;
  box-shadow: 0 1px 2px rgba(28, 27, 25, 0.04);
}
.ec-r-none {
  border-radius: 0;
}
.ec-r-md {
  border-radius: 10px;
}
.ec-r-lg {
  border-radius: 16px;
}
.ec-p-sm {
  padding: 14px;
}
.ec-p-md {
  padding: 22px;
}
.ec-p-lg {
  padding: 30px;
}
.ec-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px 14px;
}
.ec-title {
  font-weight: 700;
  line-height: 1.2;
}
.ec-title-sm {
  font-size: 16px;
}
.ec-title-md {
  font-size: 19px;
}
.ec-title-lg {
  font-size: 23px;
}
.ec-toggle {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 2px 4px 2px 0;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ec-toggle:focus-visible {
  outline: 2px solid #1c1b19;
  outline-offset: 3px;
}
.ec-chevron {
  flex: none;
  color: #78716c;
  transition: transform 0.25s ease;
}
.ec-chevron-open {
  transform: rotate(180deg);
}
.ec-glance {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  margin-right: auto;
}
.ec-glance-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: #57534e;
}
/* Plegado sin saltos: la altura anima de 0fr a 1fr; cerrado, el contenido sale del árbol de accesibilidad. */
.ec-collapse {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.28s ease;
}
.ec-collapse[data-open='false'] {
  grid-template-rows: 0fr;
}
.ec-inner {
  min-height: 0;
  overflow: hidden;
  transition: visibility 0.28s;
}
.ec-collapse[data-open='false'] .ec-inner {
  visibility: hidden;
}
@media (prefers-reduced-motion: reduce) {
  .ec-collapse,
  .ec-inner,
  .ec-chevron {
    transition: none;
  }
}
@media print {
  .ec-collapse,
  .ec-collapse[data-open='false'] {
    grid-template-rows: 1fr;
  }
  .ec-collapse[data-open='false'] .ec-inner {
    visibility: visible;
  }
  .ec-chevron {
    display: none;
  }
}
.ec-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ec-main {
  min-width: 0;
}
.ec-images-above {
  flex-direction: column-reverse;
}
@media (min-width: 760px) {
  .ec-images-side {
    flex-direction: row;
    align-items: flex-start;
  }
  .ec-images-side .ec-main {
    flex: 1 1 0;
  }
  .ec-images-side .ec-images {
    flex: 0 0 38%;
    grid-template-columns: 1fr;
  }
}
.ec-images {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.ec-images-side .ec-images,
.ec-images-above .ec-images {
  margin-top: 0;
}
.ec-figure {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ec-img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 340px;
  object-fit: contain;
  border-radius: 10px;
  background: #faf8f4;
}
.ec-caption {
  font-size: 12px;
  line-height: 1.5;
  color: #57534e;
}
.ec-nodata {
  font-weight: 500;
  font-size: 11.5px;
  color: #d6d3d1;
}
.ec-nodata-short {
  display: none;
}
.ec-cert {
  font-size: 12.5px;
  color: #3f6b4f;
}
.ec-cert-expired {
  color: #a3462b;
}
.ec-table {
  margin-top: 16px;
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 4px;
  table-layout: fixed;
}
.ec-th {
  padding: 0 8px 6px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  color: #44403c;
  vertical-align: bottom;
}
.ec-th-scale {
  width: 52%;
  text-align: left;
  padding-left: 0;
}
.ec-unit {
  display: block;
  font-weight: 400;
  color: #78716c;
}
.ec-scale {
  padding: 0;
  font-weight: inherit;
  text-align: left;
}
.ec-arrow {
  position: relative;
  display: flex;
  height: 26px;
  align-items: center;
  padding-left: 10px;
  font-size: 13px;
  font-weight: 700;
  clip-path: polygon(0 0, calc(100% - 13px) 0, 100% 50%, calc(100% - 13px) 100%, 0 100%);
}
.ec-cell {
  padding: 0 4px;
  text-align: center;
}
.ec-row-on .ec-scale,
.ec-row-on .ec-cell {
  background: #f4f1eb;
}
.ec-row-on .ec-scale {
  border-radius: 6px 0 0 6px;
}
.ec-row-on .ec-cell:last-child {
  border-radius: 0 6px 6px 0;
}
.ec-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 6px;
  background: #1c1b19;
  padding: 3px 8px 3px 3px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
}
.ec-tag-letter {
  display: inline-flex;
  height: 20px;
  min-width: 20px;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  padding: 0 4px;
  font-size: 12px;
  font-weight: 800;
}
.ec-summary {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
}
.ec-stat {
  border-radius: 10px;
  background: #faf8f4;
  padding: 10px 12px;
}
.ec-stat-label {
  font-size: 11.5px;
  color: #78716c;
}
.ec-stat-value {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
}
.ec-note {
  margin-top: 12px;
  font-size: 12.5px;
  line-height: 1.6;
  color: #57534e;
}
@media (max-width: 480px) {
  .ec-th-scale {
    width: 44%;
  }
  .ec-th {
    font-size: 11px;
    padding: 0 4px 6px;
  }
  .ec-tag {
    font-size: 12px;
    padding-right: 6px;
  }
  /* En una celda estrecha, «Sin dato» en vez de «Valor no indicado» (que se cortaría). */
  .ec-nodata-long {
    display: none;
  }
  .ec-nodata-short {
    display: inline;
  }
}
</style>

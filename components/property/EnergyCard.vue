<template>
  <section
    class="ec"
    :class="[`ec-bg-${opts.background}`, `ec-r-${opts.radius}`, `ec-p-${opts.padding}`, { 'ec-border': opts.border, 'ec-narrow': opts.width === 'narrow' }]"
    :aria-labelledby="titleId"
    data-testid="energy-card"
  >
    <div class="ec-head">
      <h2 :id="titleId" class="ec-title" :class="`ec-title-${opts.titleSize}`">{{ opts.title || t('energy.title', 'Eficiencia energética') }}</h2>
      <p v-if="certificateLine" class="ec-cert" :class="{ 'ec-cert-expired': certificate === 'expired' }" data-testid="energy-certificate">{{ certificateLine }}</p>
    </div>

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
              <span class="sr-only">— {{ t('energy.thisHome', 'Esta vivienda') }}</span>
            </span>
          </td>
          <td v-if="opts.showEmissions" class="ec-cell">
            <span v-if="l === data.emissionsRating" class="ec-tag" data-testid="energy-emissions">
              <span class="ec-tag-letter" :style="{ background: ENERGY_COLORS[l], color: ENERGY_TEXT[l] }">{{ l }}</span>
              <span v-if="data.emissions != null">{{ formatEnergyValue(data.emissions, intlLocale) }}</span>
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
  if (o.showConsumption && (d.consumption != null || (!table && o.showRating && d.rating)) && !(table && d.rating)) {
    out.push({ key: 'consumption', label: t('energy.consumption', 'Consumo de energía'), letter: o.showRating ? d.rating : null, value: val(d.consumption, t('energy.consumptionUnit', 'kWh/m²·año')) })
  }
  if (o.showEmissions && (d.emissions != null || (!table && o.showRating && d.emissionsRating)) && !(table && d.emissionsRating)) {
    out.push({ key: 'emissions', label: t('energy.emissions', 'Emisiones'), letter: o.showRating ? d.emissionsRating : null, value: val(d.emissions, t('energy.emissionsUnit', 'kg CO₂/m²·año')) })
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
}
</style>

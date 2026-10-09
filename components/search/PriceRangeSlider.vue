<template>
  <div class="prs" data-testid="price-range">
    <div class="prs-head">
      <p class="prs-title">{{ title || t('hero.price', 'Precio') }}</p>
      <p class="prs-summary" data-testid="price-summary">{{ summary }}</p>
    </div>

    <div class="prs-fields">
      <label class="prs-field">
        <span class="prs-mini">{{ t('catalog.min', 'Mínimo') }}</span>
        <input
          v-model="minText"
          class="prs-input"
          type="text"
          inputmode="numeric"
          :placeholder="t('hero.noMin', 'Sin mínimo')"
          :aria-invalid="!!errorMsg"
          data-testid="price-min-input"
          @focus="focused = 'min'"
          @blur="commitText('min')"
          @keydown.enter.prevent="commitText('min')"
        >
      </label>
      <span class="prs-dash" aria-hidden="true">–</span>
      <label class="prs-field">
        <span class="prs-mini">{{ t('catalog.max', 'Máximo') }}</span>
        <input
          v-model="maxText"
          class="prs-input"
          type="text"
          inputmode="numeric"
          :placeholder="t('hero.noMax', 'Sin máximo')"
          :aria-invalid="!!errorMsg"
          data-testid="price-max-input"
          @focus="focused = 'max'"
          @blur="commitText('max')"
          @keydown.enter.prevent="commitText('max')"
        >
      </label>
    </div>
    <p v-if="errorMsg" class="prs-error" role="alert" data-testid="price-error">{{ errorMsg }}</p>

    <!-- Dos extremos independientes sobre la misma barra; la zona entre ambos, resaltada -->
    <div class="prs-slider">
      <div class="prs-track" />
      <div class="prs-fill" :style="{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }" />
      <input
        class="prs-range"
        type="range"
        min="0"
        :max="n * RES"
        step="1"
        :value="lo"
        :aria-label="t('price.minHandle', 'Precio mínimo')"
        :aria-valuetext="minValue == null ? t('hero.noMin', 'Sin mínimo') : format(minValue)"
        data-testid="price-min-handle"
        @input="onRange('lo', $event)"
        @change="commitRange"
      >
      <input
        class="prs-range"
        type="range"
        min="0"
        :max="n * RES"
        step="1"
        :value="hi"
        :aria-label="t('price.maxHandle', 'Precio máximo')"
        :aria-valuetext="maxValue == null ? t('hero.noMax', 'Sin máximo') : format(maxValue)"
        data-testid="price-max-handle"
        @input="onRange('hi', $event)"
        @change="commitRange"
      >
    </div>
    <div class="prs-scale" aria-hidden="true">
      <span>{{ t('hero.noMin', 'Sin mínimo') }}</span>
      <span>{{ format(steps[steps.length - 1]!) }}+</span>
    </div>
    <p class="prs-note">{{ operation === 'alquiler' ? t('price.monthlyRent', 'Renta mensual') : t('price.salePrice', 'Precio de venta') }}</p>
  </div>
</template>

<script setup lang="ts">
import { convertAmount } from '~/utils/currency'
import { priceSteps, type Operation } from '~/utils/searchState'

/**
 * Selector de rango de precio (Hero y panel de Propiedades): dos extremos
 * arrastrables sobre una escala propia de cada operación (importes de venta o
 * rentas mensuales, utils/searchState.ts) y dos campos editables, sincronizados
 * en los dos sentidos. Admite sólo mínimo, sólo máximo, los dos o ninguno.
 *
 * Moneda: la escala y lo que se emite están en la moneda BASE de la agencia
 * (la de la base de datos); lo que se ve y se escribe, en la moneda que el
 * visitante eligió, convertida con el sistema real (utils/currency.ts) — nunca
 * se cambia sólo el símbolo.
 *
 * Emite al soltar un extremo o al confirmar un campo (Enter o salir de él), no
 * en cada movimiento: la búsqueda no se lanza veinte veces por arrastrar.
 */
const props = withDefaults(defineProps<{ min: number | null; max: number | null; operation: Operation; title?: string }>(), { title: '' })
const emit = defineEmits<{ update: [[number | null, number | null]] }>()

const { t, intlLocale } = useI18n()
const { format, code, base } = useCurrency()

const RES = 100
const steps = computed(() => priceSteps(props.operation))
/** Posiciones 0..n: 0 = sin mínimo; n = sin máximo (más allá del último escalón). */
const n = computed(() => steps.value.length)

function valueToPos(v: number | null, isMax: boolean): number {
  const s = steps.value
  if (v == null) return isMax ? n.value * RES : 0
  if (v <= 0) return 0
  for (let i = 0; i < s.length - 1; i++) {
    if (v < s[i + 1]!) return Math.round((i + (v - s[i]!) / (s[i + 1]! - s[i]!)) * RES)
  }
  // Por encima del último escalón: justo antes de «sin máximo».
  return (n.value - 1) * RES + Math.min(RES - 1, Math.round(((v - s[s.length - 1]!) / s[s.length - 1]!) * RES))
}
function posToValue(pos: number, isMax: boolean): number | null {
  const s = steps.value
  if (isMax && pos >= n.value * RES) return null
  if (!isMax && pos <= 0) return null
  const i = Math.floor(pos / RES)
  const frac = pos / RES - i
  if (i >= s.length - 1) return Math.round(s[s.length - 1]! * (1 + frac))
  return Math.round(s[i]! + frac * (s[i + 1]! - s[i]!))
}

// Estado local mientras se arrastra o se escribe; se copia de las props cuando cambian fuera.
const minValue = ref<number | null>(props.min)
const maxValue = ref<number | null>(props.max)
const lo = ref(valueToPos(props.min, false))
const hi = ref(valueToPos(props.max, true))
watch(
  () => [props.min, props.max, props.operation] as const,
  () => {
    minValue.value = props.min
    maxValue.value = props.max
    lo.value = valueToPos(props.min, false)
    hi.value = valueToPos(props.max, true)
    syncTexts()
  },
)

function onRange(which: 'lo' | 'hi', e: Event) {
  const el = e.target as HTMLInputElement
  // Al arrastrar, se encaja en los escalones de la escala.
  let pos = Math.round(Number(el.value) / RES) * RES
  if (which === 'lo') {
    pos = Math.min(pos, hi.value - RES)
    lo.value = Math.max(0, pos)
    minValue.value = posToValue(lo.value, false)
  } else {
    pos = Math.max(pos, lo.value + RES)
    hi.value = Math.min(n.value * RES, pos)
    maxValue.value = posToValue(hi.value, true)
  }
  el.value = String(which === 'lo' ? lo.value : hi.value)
  errorMsg.value = ''
  syncTexts()
}
function commitRange() {
  emit('update', [minValue.value, maxValue.value])
}

// --- Campos de texto, en la moneda que se ve ---
const focused = ref<'min' | 'max' | null>(null)
const minText = ref('')
const maxText = ref('')
const errorMsg = ref('')
const toDisplay = (v: number) => Math.round(convertAmount(v, base.value, code.value))
const toBase = (v: number) => Math.round(convertAmount(v, code.value, base.value))
const plain = (v: number) => v.toLocaleString(intlLocale.value, { maximumFractionDigits: 0 })
function syncTexts() {
  minText.value = minValue.value == null ? '' : plain(toDisplay(minValue.value))
  maxText.value = maxValue.value == null ? '' : plain(toDisplay(maxValue.value))
}
syncTexts()
watch(code, syncTexts)

/** «150.000», «150 000 €», «150000» → 150000; vacío → null; otra cosa → NaN. */
function parseTyped(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  if (/^-/.test(s)) return -1
  const digits = s.replace(/[^\d]/g, '')
  return digits ? Number(digits) : Number.NaN
}
function commitText(which: 'min' | 'max') {
  focused.value = null
  const typed = parseTyped(which === 'min' ? minText.value : maxText.value)
  if (typed != null && Number.isNaN(typed)) {
    errorMsg.value = t('price.invalid', 'Escribe sólo cifras.')
    return
  }
  if (typed != null && typed < 0) {
    errorMsg.value = t('price.negative', 'El precio no puede ser negativo.')
    return
  }
  const value = typed == null || typed === 0 ? null : Math.min(toBase(typed), 1e10)
  const nextMin = which === 'min' ? value : minValue.value
  const nextMax = which === 'max' ? value : maxValue.value
  if (nextMin != null && nextMax != null && nextMin > nextMax) {
    errorMsg.value = t('price.minOverMax', 'El mínimo no puede ser mayor que el máximo.')
    return
  }
  errorMsg.value = ''
  minValue.value = nextMin
  maxValue.value = nextMax
  lo.value = valueToPos(nextMin, false)
  hi.value = valueToPos(nextMax, true)
  syncTexts()
  emit('update', [nextMin, nextMax])
}

const pct = (pos: number) => (pos / (n.value * RES)) * 100
const summary = computed(() => {
  const a = minValue.value
  const b = maxValue.value
  if (a != null && b != null) return `${format(a)} – ${format(b)}`
  if (a != null) return `${t('catalog.since', 'Desde')} ${format(a)}`
  if (b != null) return `${t('price.upTo', 'Hasta')} ${format(b)}`
  return t('hero.any', 'Cualquiera')
})
</script>

<style scoped>
.prs-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.prs-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #57534e;
}
.prs-summary {
  font-size: 13px;
  font-weight: 600;
  color: #1c1b19;
  text-align: right;
}
.prs-fields {
  margin-top: 10px;
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.prs-field {
  flex: 1;
  min-width: 0;
}
.prs-mini {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  color: #78716c;
}
.prs-input {
  width: 100%;
  min-height: 42px;
  border-radius: 10px;
  border: 1px solid #e7e2d9;
  background: #fff;
  padding: 8px 10px;
  font-size: 14px;
  color: #1c1b19;
}
.prs-input:focus {
  outline: none;
  border-color: #1c1b19;
}
.prs-input[aria-invalid='true'] {
  border-color: #dc2626;
}
.prs-dash {
  padding-bottom: 10px;
  color: #a8a29e;
}
.prs-error {
  margin-top: 6px;
  font-size: 12px;
  color: #b91c1c;
}
.prs-slider {
  position: relative;
  margin: 18px 4px 4px;
  height: 28px;
  touch-action: pan-y;
}
.prs-track,
.prs-fill {
  position: absolute;
  top: 50%;
  height: 4px;
  transform: translateY(-50%);
  border-radius: 999px;
}
.prs-track {
  left: 0;
  right: 0;
  background: #e7e2d9;
}
.prs-fill {
  background: #1c1b19;
}
.prs-range {
  position: absolute;
  inset: 0;
  width: 100%;
  margin: 0;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  pointer-events: none;
}
.prs-range:focus {
  outline: none;
}
.prs-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  pointer-events: auto;
  height: 26px;
  width: 26px;
  border-radius: 999px;
  border: 2px solid #1c1b19;
  background: #fff;
  box-shadow: 0 2px 6px rgba(28, 27, 25, 0.25);
  cursor: grab;
}
.prs-range::-moz-range-thumb {
  pointer-events: auto;
  height: 22px;
  width: 22px;
  border-radius: 999px;
  border: 2px solid #1c1b19;
  background: #fff;
  box-shadow: 0 2px 6px rgba(28, 27, 25, 0.25);
  cursor: grab;
}
.prs-range:focus-visible::-webkit-slider-thumb {
  outline: 2px solid #3f6fc2;
  outline-offset: 2px;
}
.prs-scale {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #a8a29e;
}
.prs-note {
  margin-top: 6px;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #a8a29e;
}
</style>

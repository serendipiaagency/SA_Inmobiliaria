<template>
  <section v-reveal class="border-y border-line bg-paper" data-testid="seller-valuation">
    <div class="mx-auto max-w-3xl px-6 py-16 lg:px-10">
      <div class="text-center">
        <SbText v-if="content.eyebrow" tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow" />
        <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-3 text-3xl md:text-4xl" :text="content.title || ''" />
        <SbText v-if="content.description" tag="p" field="description" label="Descripción" multiline class="mx-auto mt-4 max-w-xl text-[15px] text-stone-500" :text="content.description" />
      </div>

      <SbBox tag="div" field="form" kind="box" label="Formulario" class="card mt-8 p-6 text-left sm:p-8">
        <!-- Confirmación: lo único que se enseña tras enviar. Sin cifras: no hay motor de valoración. -->
        <div v-if="sent" class="py-6 text-center" role="status" data-testid="seller-valuation-done">
          <SbText tag="p" field="successMessage" kind="heading" label="Mensaje de confirmación" class="heading-serif text-2xl" :text="content.successMessage || 'Hemos recibido los datos de tu propiedad'" />
          <SbText tag="p" field="successDetail" label="Texto bajo la confirmación" multiline class="mx-auto mt-3 max-w-md text-[14px] text-stone-500" :text="content.successDetail || 'Un comercial revisará lo que nos has contado y te contactará para hablar de tu propiedad. No es una tasación ni un precio: eso lo hablamos contigo.'" />
        </div>

        <form v-else novalidate @submit.prevent="onSubmit">
          <!-- Progreso real: paso actual de los que se enseñan para este tipo de propiedad -->
          <div class="mb-6" data-testid="seller-progress">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-500" aria-live="polite">Paso {{ position + 1 }} de {{ steps.length }} · {{ stepLabel(current) }}</p>
            <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200" role="progressbar" :aria-valuemin="1" :aria-valuemax="steps.length" :aria-valuenow="position + 1" :aria-label="`Paso ${position + 1} de ${steps.length}`">
              <div class="seller-progress-bar h-full rounded-full bg-ink" :style="{ width: `${((position + 1) / steps.length) * 100}%` }" />
            </div>
            <ol class="mt-3 hidden flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-400 sm:flex">
              <li v-for="(s, i) in steps" :key="s" :class="i === position ? 'font-semibold text-ink' : i < position ? 'text-stone-600' : ''" :aria-current="i === position ? 'step' : undefined">{{ i + 1 }}. {{ stepLabel(s) }}</li>
            </ol>
          </div>

          <!-- Campo trampa: una persona no lo ve ni llega a él con el teclado -->
          <div class="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
            <input v-model="trap" type="text" name="website" tabindex="-1" autocomplete="off" >
          </div>

          <fieldset :key="current" class="min-w-0 border-0 p-0">
            <legend ref="legend" tabindex="-1" class="mb-4 text-lg font-semibold text-ink outline-none">{{ stepTitle(current) }}</legend>

            <!-- 1. Tipo: el catálogo real de Property Core -->
            <div v-if="current === 'type'" class="space-y-5">
              <div v-for="g in typeGroups" :key="g.key">
                <p class="label">{{ g.label }}</p>
                <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="g.label">
                  <button v-for="t in g.types" :key="t" type="button" role="radio" :aria-checked="propertyType === t" class="seller-chip" :class="propertyType === t ? 'seller-chip-on' : ''" :data-type="t" @click="pickType(t)">{{ typeLabel(t) }}</button>
                </div>
              </div>
              <div v-if="subtypes.length">
                <label class="label" for="seller-subtype">Subtipo</label>
                <select id="seller-subtype" v-model="subtype" class="input" data-testid="seller-subtype">
                  <option value="">Prefiero no indicarlo</option>
                  <option v-for="s in subtypes" :key="s.value" :value="s.value">{{ s.label }}</option>
                </select>
              </div>
            </div>

            <!-- 2. Ubicación: el autocompletado geográfico de la plataforma -->
            <div v-else-if="current === 'location'" class="space-y-4">
              <div>
                <p class="label" id="seller-location-label">¿Dónde está?</p>
                <LocationAutocomplete :model-value="location ? [location] : []" variant="panel" placeholder="Municipio, barrio o código postal" :show-counts="false" :keep-recent="false" @update:model-value="onLocation" />
              </div>
              <div>
                <label class="label" for="seller-address">Calle y número <span class="font-normal normal-case tracking-normal text-stone-400">(opcional)</span></label>
                <input id="seller-address" v-model="address" class="input" maxlength="200" autocomplete="street-address" >
                <p class="mt-1 text-[11px] text-stone-400">Sólo la ve la inmobiliaria; no se publica en ningún sitio.</p>
              </div>
            </div>

            <!-- 3-5. Preguntas dinámicas del tipo elegido -->
            <div v-else class="grid gap-4 sm:grid-cols-2">
              <div v-for="q in stepQuestions" :key="q.key" :class="q.kind === 'boolean' ? 'flex items-center' : ''">
                <template v-if="q.kind === 'boolean'">
                  <label class="flex cursor-pointer items-center gap-2 text-sm text-ink">
                    <input v-model="answers[q.key]" type="checkbox" class="h-4 w-4 accent-ink" :data-q="q.key" >
                    {{ qLabel(q) }}
                  </label>
                </template>
                <template v-else>
                  <label class="label" :for="`seller-q-${q.key}`">{{ qLabel(q) }}<span v-if="q.required"> *</span><span v-if="q.unit" class="font-normal normal-case tracking-normal text-stone-400"> ({{ q.unit }})</span></label>
                  <select v-if="q.kind === 'choice'" :id="`seller-q-${q.key}`" v-model="answers[q.key]" class="input" :data-q="q.key">
                    <option value="">Sin indicar</option>
                    <option v-for="o in q.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                  </select>
                  <input v-else :id="`seller-q-${q.key}`" v-model="answers[q.key]" class="input" type="number" inputmode="decimal" :min="q.min" :max="q.max" :step="q.kind === 'integer' ? 1 : 'any'" :required="q.required" :aria-invalid="fieldInvalid(q) ? 'true' : undefined" :data-q="q.key" >
                  <p v-if="q.help" class="mt-1 text-[11px] text-stone-400">{{ q.help }}</p>
                </template>
              </div>

              <template v-if="current === 'extra'">
                <div class="sm:col-span-2">
                  <label class="label" for="seller-comments">¿Algo más que quieras contarnos? <span class="font-normal normal-case tracking-normal text-stone-400">(opcional)</span></label>
                  <textarea id="seller-comments" v-model="comments" class="input" rows="3" maxlength="1500" data-testid="seller-comments" />
                </div>
                <div v-if="options.allowPhotos" class="sm:col-span-2" data-testid="seller-photos">
                  <label class="label" for="seller-photo-input">Fotos <span class="font-normal normal-case tracking-normal text-stone-400">(opcional, hasta {{ SELLER_MAX_PHOTOS }}; JPG, PNG o WebP de hasta 5 MB)</span></label>
                  <input id="seller-photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple class="input" :disabled="locked || photos.length >= SELLER_MAX_PHOTOS" @change="onPhotos" >
                  <ul v-if="photos.length" class="mt-2 space-y-1 text-[12px] text-stone-600">
                    <li v-for="(p, i) in photos" :key="p.key" class="flex items-center justify-between gap-2">
                      <span class="truncate">{{ p.name }}</span>
                      <button type="button" class="text-stone-400 underline hover:text-ink" :aria-label="`Quitar ${p.name}`" @click="photos.splice(i, 1)">Quitar</button>
                    </li>
                  </ul>
                  <p v-if="photoError" class="mt-1 text-[12px] text-red-600" role="alert">{{ photoError }}</p>
                </div>
              </template>
            </div>

            <!-- 6. Contacto y consentimiento -->
            <div v-if="current === 'contact'" class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="label" for="seller-name">Nombre *</label>
                <input id="seller-name" v-model="contact.name" class="input" autocomplete="name" required maxlength="200" :aria-invalid="touched && !contact.name.trim() ? 'true' : undefined" >
              </div>
              <div>
                <label class="label" for="seller-email">Email *</label>
                <input id="seller-email" v-model="contact.email" type="email" class="input" autocomplete="email" required maxlength="200" :aria-invalid="touched && !contact.email.trim() ? 'true' : undefined" >
              </div>
              <div class="sm:col-span-2">
                <label class="label" for="seller-phone">Teléfono <span class="font-normal normal-case tracking-normal text-stone-400">(opcional)</span></label>
                <input id="seller-phone" v-model="contact.phone" type="tel" class="input" autocomplete="tel" maxlength="50" >
              </div>
              <div class="sm:col-span-2">
                <label class="flex cursor-pointer items-start gap-2 text-[13px] text-stone-600">
                  <input v-model="privacy" type="checkbox" class="mt-0.5 h-4 w-4 accent-ink" data-testid="seller-privacy" >
                  <span>He leído y acepto la <NuxtLink to="/privacidad" target="_blank" class="underline">política de privacidad</NuxtLink> y que la inmobiliaria use estos datos para contactarme sobre mi propiedad. *</span>
                </label>
              </div>
            </div>
          </fieldset>

          <p v-if="error" class="mt-4 text-sm font-medium text-red-600" role="alert" data-testid="seller-error">{{ error }}</p>

          <div class="mt-6 flex items-center justify-between gap-3">
            <button v-if="position > 0" type="button" class="btn-quiet" data-testid="seller-back" @click="back">Volver</button>
            <span v-else />
            <button v-if="!isLast" type="button" class="btn-primary" data-testid="seller-next" @click="next">Continuar</button>
            <SbButton
              v-else
              type="submit"
              class="btn-primary"
              :class="mode === 'builder' && locked ? 'opacity-40' : ''"
              :disabled="mode === 'builder' ? undefined : sending || locked"
              :aria-disabled="locked ? 'true' : undefined"
              field="submitLabel"
              label="Botón de envío"
              :text="sending ? 'Enviando…' : content.submitLabel || 'Enviar mi propiedad'"
            />
          </div>

          <SbText v-if="content.privacyNote" tag="p" field="privacyNote" kind="caption" label="Aviso legal" multiline class="mt-4 text-center text-[11px] text-stone-400" :text="content.privacyNote" />
          <p v-if="locked" class="mt-4 rounded-lg bg-stone-100 px-3 py-2 text-center text-[11px] text-stone-500">
            Desactivado mientras editas: no envía nada. En Vista previa puedes recorrer los pasos (tampoco envía). En la web publicada, cada envío crea un lead real de captación en tu CRM.
          </p>
        </form>
      </SbBox>
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbBox from '../nodes/SbBox.vue'
import SbButton from '../nodes/SbButton.vue'
import LocationAutocomplete from '~/components/search/LocationAutocomplete.vue'
import { PROPERTY_TYPE_LABELS } from '~/utils/propertySheet'
import type { LocationSelection } from '~/utils/searchState'
import {
  SELLER_MAX_PHOTOS,
  SELLER_STEP_LABELS,
  normalizeSellerOptions,
  sellerQuestionsShown,
  sellerSubtypes,
  sellerTypeGroups,
  sellerVisibleSteps,
  validateSellerValuation,
  type SellerQuestion,
  type SellerStepKey,
} from '~/utils/sellerValuation'

/**
 * Formulario de valoración de «Vender propiedad» (bloque `seller-valuation`).
 *
 * Seis pasos con progreso real (tipo, ubicación, superficie y distribución,
 * características y estado, información adicional y contacto); un tipo sin
 * preguntas en un paso —un terreno no tiene «características»— no lo enseña
 * y el contador lo refleja. Los tipos y subtipos son los de Property Core
 * (utils/propertySheet.ts), la ubicación usa el autocompletado geográfico de
 * la plataforma y las preguntas de cada tipo son campos reales de su ficha
 * (utils/sellerValuation.ts). Se conserva lo respondido al ir y volver entre
 * pasos y se valida cada paso antes de pasar al siguiente.
 *
 * El envío crea un lead real de captación en `/api/public/contact` (form
 * `seller`); no crea ninguna propiedad ni enseña ninguna cifra: no hay motor
 * de valoración, así que la respuesta es una confirmación. En el lienzo y en
 * Vista previa se puede recorrer sin enviar (como el resto de formularios).
 */
const props = withDefaults(defineProps<{ content: Record<string, any>; mode?: 'production' | 'builder' | 'preview' }>(), { mode: 'production' })

const locked = computed(() => props.mode !== 'production')
const options = computed(() => normalizeSellerOptions(props.content))
const visitorLanguage = useVisitorLanguage()
const { choices } = useCookieConsent()

const propertyType = ref('')
const subtype = ref('')
const location = ref<LocationSelection | null>(null)
const address = ref('')
const answers = reactive<Record<string, any>>({})
const comments = ref('')
const contact = reactive({ name: '', email: '', phone: '' })
const privacy = ref(false)
const trap = ref('')
const photos = ref<{ key: string; name: string }[]>([])
const photoError = ref('')
const touched = ref(false)
const sending = ref(false)
const sent = ref(false)
const error = ref('')
const stepKey = ref<SellerStepKey>('type')
const legend = ref<HTMLElement | null>(null)
const submissionId = ref(`sv${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`)

const typeGroups = computed(() => sellerTypeGroups(options.value.hiddenTypes))
const subtypes = computed(() => sellerSubtypes(propertyType.value))
const steps = computed(() => sellerVisibleSteps(propertyType.value, options.value.hiddenQuestions))
const current = computed<SellerStepKey>(() => (steps.value.includes(stepKey.value) ? stepKey.value : steps.value[0]!))
const position = computed(() => steps.value.indexOf(current.value))
const isLast = computed(() => position.value === steps.value.length - 1)
const stepQuestions = computed<SellerQuestion[]>(() => (current.value === 'surface' || current.value === 'features' || current.value === 'extra' ? sellerQuestionsShown(propertyType.value, current.value, options.value.hiddenQuestions) : []))

const typeLabel = (t: string) => PROPERTY_TYPE_LABELS[t] || t
const stepLabel = (s: SellerStepKey) => SELLER_STEP_LABELS[s]
const STEP_TITLES: Record<SellerStepKey, string> = {
  type: '¿Qué tipo de propiedad quieres vender?',
  location: '¿Dónde está tu propiedad?',
  surface: 'Superficie y distribución',
  features: 'Características y estado',
  extra: 'Información adicional',
  contact: '¿Cómo te contactamos?',
}
const stepTitle = (s: SellerStepKey) => STEP_TITLES[s]
const qLabel = (q: SellerQuestion) => options.value.questionLabels[q.key] || q.label
const fieldInvalid = (q: SellerQuestion) => touched.value && !!q.required && (answers[q.key] === undefined || answers[q.key] === '')

function pickType(t: string) {
  if (propertyType.value === t) return
  propertyType.value = t
  subtype.value = ''
  // Cambiar de tipo cambia las preguntas: lo respondido que ya no aplica se quita.
  Object.keys(answers).forEach((k) => Reflect.deleteProperty(answers, k))
  error.value = ''
}
function onLocation(list: LocationSelection[]) {
  // Una sola ubicación: la última que se elige sustituye a la anterior.
  location.value = list.length ? list[list.length - 1]! : null
}

function payload() {
  return {
    propertyType: propertyType.value,
    subtype: subtype.value || null,
    location: location.value ? { id: location.value.id || '', kind: location.value.kind, label: location.value.context ? `${location.value.value}, ${location.value.context}` : location.value.value } : null,
    address: address.value,
    answers: { ...answers },
    photoKeys: photos.value.map((p) => p.key),
  }
}

/** Lo que falta en el paso actual (o '' si está completo). */
function stepProblem(): string {
  const s = current.value
  if (s === 'contact') {
    if (!contact.name.trim()) return 'Escribe tu nombre'
    if (!/^\S+@\S+\.\S+$/.test(contact.email.trim())) return 'Revisa tu email'
    if (!privacy.value) return 'Tienes que aceptar la política de privacidad'
    return ''
  }
  const r = validateSellerValuation(payload(), { hiddenQuestions: options.value.hiddenQuestions })
  if (s === 'type') return propertyType.value ? (r.errors.type ?? '') : 'Elige el tipo de propiedad'
  if (s === 'extra') return r.errors.extra ?? ''
  return (r.errors as Record<string, string | undefined>)[s] ?? ''
}

function track(name: string, detail: Record<string, unknown> = {}) {
  // Sólo con el consentimiento de analítica del visitante: sin él no se emite nada.
  if (import.meta.client && !locked.value && choices.value?.analytics) window.dispatchEvent(new CustomEvent('inmo:seller-valuation', { detail: { name, ...detail } }))
}

async function focusLegend() {
  await nextTick()
  legend.value?.focus({ preventScroll: false })
}
function goTo(key: SellerStepKey) {
  stepKey.value = key
  focusLegend()
}
function next() {
  error.value = ''
  touched.value = true
  // En el lienzo y en Vista previa se recorre sin responder: se parte de una vivienda para que los pasos enseñen sus preguntas.
  if (locked.value && !propertyType.value) propertyType.value = typeGroups.value[0]?.types[0] || 'Apartment'
  const problem = locked.value ? '' : stepProblem()
  if (problem) {
    error.value = problem
    return
  }
  touched.value = false
  const to = steps.value[position.value + 1]
  if (to) {
    track('step', { step: current.value })
    goTo(to)
  }
}
function back() {
  error.value = ''
  const to = steps.value[position.value - 1]
  if (to) goTo(to)
}

async function onPhotos(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  photoError.value = ''
  for (const f of files) {
    if (photos.value.length >= SELLER_MAX_PHOTOS) break
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
      photoError.value = `«${f.name}» no es una foto JPG, PNG o WebP`
      continue
    }
    if (f.size > 5 * 1024 * 1024) {
      photoError.value = `«${f.name}» pesa más de 5 MB`
      continue
    }
    try {
      const res = await $fetch<{ key: string }>('/api/public/contact', { method: 'POST', query: { channel: 'seller-photo', submissionId: submissionId.value }, body: f, headers: { 'content-type': f.type } })
      photos.value.push({ key: res.key, name: f.name })
    } catch (err: any) {
      photoError.value = err?.statusCode === 429 ? 'Demasiadas fotos seguidas. Inténtalo de nuevo en unos minutos.' : err?.data?.statusMessage || `No se pudo subir «${f.name}»`
    }
  }
}

async function onSubmit() {
  if (!isLast.value) return next()
  if (locked.value) return
  touched.value = true
  const problem = stepProblem()
  if (problem) {
    error.value = problem
    return
  }
  // Revalida todo el recorrido antes de enviar, por si se cambió de tipo al volver atrás.
  const all = validateSellerValuation(payload(), { hiddenQuestions: options.value.hiddenQuestions })
  if (!all.ok) {
    const bad = (['type', 'location', 'surface', 'features', 'extra'] as const).find((k) => all.errors[k])
    if (bad) {
      error.value = all.errors[bad]!
      if (steps.value.includes(bad)) goTo(bad)
      return
    }
  }
  sending.value = true
  error.value = ''
  try {
    await $fetch('/api/public/contact', {
      method: 'POST',
      body: {
        type: 'contact',
        form: 'seller',
        subject: props.content.subject || 'Vender propiedad',
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        website: trap.value,
        privacyAccepted: privacy.value,
        comments: comments.value,
        valuation: payload(),
        submissionId: submissionId.value,
        language: visitorLanguage(),
      },
    })
    sent.value = true
    track('submitted', { type: propertyType.value })
  } catch (e: any) {
    error.value = e?.statusCode === 429 ? 'Has enviado varios mensajes seguidos. Inténtalo de nuevo en unos minutos.' : e?.data?.statusMessage || e?.statusMessage || 'Algo salió mal. Por favor, inténtalo de nuevo.'
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.seller-chip {
  border: 1px solid var(--color-line, #e7e5e4);
  background: #fff;
  border-radius: 9999px;
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  color: #44403c;
  transition: border-color 0.15s, background-color 0.15s, color 0.15s;
}
.seller-chip:hover {
  border-color: #1c1917;
}
.seller-chip:focus-visible {
  outline: 2px solid #1c1917;
  outline-offset: 2px;
}
.seller-chip-on {
  background: #1c1917;
  border-color: #1c1917;
  color: #fff;
}
.seller-progress-bar {
  transition: width 0.25s ease;
}
@media (prefers-reduced-motion: reduce) {
  .seller-progress-bar {
    transition: none;
  }
}
</style>

<template>
  <div class="pc-card" data-testid="property-contact-card">
    <!-- Quién atiende: el comercial responsable de la propiedad o, sin él, la inmobiliaria -->
    <div class="pc-head">
      <img v-if="avatarSrc" :src="avatarSrc" :alt="displayName" class="pc-avatar" :class="{ 'pc-avatar-logo': !agent }" loading="lazy" >
      <span v-else class="pc-avatar pc-avatar-initials" aria-hidden="true">{{ initials }}</span>
      <div class="min-w-0">
        <p class="pc-eyebrow">{{ t('contactCard.attendedBy', 'Atendido por') }}</p>
        <p class="pc-name" data-testid="property-contact-name">{{ displayName }}</p>
        <p class="pc-sub">{{ subline }}</p>
      </div>
    </div>

    <div class="pc-sep" />

    <div v-if="sent" class="pc-success" role="status" data-testid="property-contact-success">
      <span class="pc-success-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
      </span>
      <p class="pc-title">{{ t('contactCard.sentTitle', 'Mensaje enviado') }}</p>
      <p class="pc-lead">{{ sentText }}</p>
      <button type="button" class="pc-again" @click="reset">{{ t('contactCard.sendAnother', 'Enviar otro mensaje') }}</button>
    </div>

    <template v-else>
      <p class="pc-title">{{ t('contactCard.title', 'Cuéntanos qué necesitas') }}</p>
      <p class="pc-lead">{{ t('contactCard.subtitle', 'Te ayudamos con los detalles de esta propiedad.') }}</p>

      <form class="pc-form" novalidate data-testid="property-contact-form" @submit.prevent="submit">
        <!-- Campo trampa: una persona no lo ve ni llega a él con el tabulador; un bot lo rellena -->
        <div class="pc-trap" aria-hidden="true">
          <label :for="ids.website">Web</label>
          <input :id="ids.website" v-model="form.website" type="text" name="website" tabindex="-1" autocomplete="off" >
        </div>

        <div class="pc-field">
          <label class="pc-label" :for="ids.name">{{ t('contactCard.name', 'Nombre') }} <span class="pc-req" aria-hidden="true">*</span></label>
          <input :id="ids.name" v-model="form.name" class="pc-input" type="text" name="name" autocomplete="name" maxlength="200" required :placeholder="t('contactCard.namePlaceholder', 'Tu nombre')" :aria-invalid="!!errors.name" :aria-describedby="errors.name ? `${ids.name}-e` : undefined" >
          <p v-if="errors.name" :id="`${ids.name}-e`" class="pc-error">{{ errors.name }}</p>
        </div>

        <div class="pc-field pc-row">
          <div>
            <label class="pc-label" :for="ids.email">{{ t('contactCard.email', 'Email') }} <span class="pc-req" aria-hidden="true">*</span></label>
            <input :id="ids.email" v-model="form.email" class="pc-input" type="email" name="email" autocomplete="email" maxlength="200" required :placeholder="t('contactCard.emailPlaceholder', 'tu@email.com')" :aria-invalid="!!errors.email" :aria-describedby="errors.email ? `${ids.email}-e` : undefined" >
            <p v-if="errors.email" :id="`${ids.email}-e`" class="pc-error">{{ errors.email }}</p>
          </div>
          <div>
            <label class="pc-label" :for="ids.phone">{{ t('contactCard.phone', 'Teléfono') }}</label>
            <input :id="ids.phone" v-model="form.phone" class="pc-input" type="tel" name="phone" autocomplete="tel" maxlength="25" :placeholder="t('contactCard.phonePlaceholder', 'Tu número de teléfono')" :aria-invalid="!!errors.phone" :aria-describedby="errors.phone ? `${ids.phone}-e` : undefined" >
            <p v-if="errors.phone" :id="`${ids.phone}-e`" class="pc-error">{{ errors.phone }}</p>
          </div>
        </div>

        <div class="pc-field">
          <label class="pc-label" :for="ids.message">{{ t('contactCard.message', 'Mensaje') }} <span class="pc-req" aria-hidden="true">*</span></label>
          <textarea :id="ids.message" v-model="form.message" class="pc-input pc-textarea" name="message" maxlength="5000" required :placeholder="t('contactCard.messagePlaceholder', 'Me gustaría recibir más información sobre esta propiedad...')" :aria-invalid="!!errors.message" :aria-describedby="errors.message ? `${ids.message}-e` : undefined" />
          <p v-if="errors.message" :id="`${ids.message}-e`" class="pc-error">{{ errors.message }}</p>
        </div>

        <div class="pc-consent">
          <input :id="ids.privacy" v-model="form.privacyAccepted" type="checkbox" class="pc-check" name="privacyAccepted" required :aria-invalid="!!errors.privacy" :aria-describedby="errors.privacy ? `${ids.privacy}-e` : undefined" data-testid="property-contact-privacy" >
          <label :for="ids.privacy">
            {{ t('contactCard.privacyPrefix', 'Acepto la') }}
            <NuxtLink to="/privacidad" target="_blank" class="pc-link">{{ t('contactCard.privacyLink', 'política de privacidad') }}</NuxtLink>
            <span class="pc-req" aria-hidden="true">*</span>
          </label>
        </div>
        <p v-if="errors.privacy" :id="`${ids.privacy}-e`" class="pc-error">{{ errors.privacy }}</p>

        <p v-if="previewBlocked" class="pc-preview" data-testid="property-contact-preview-note">
          {{ t('contactCard.previewNote', 'Vista previa: el formulario no envía nada aquí. En tu web publicada, cada mensaje crea un lead en tu CRM.') }}
        </p>

        <button type="submit" class="pc-cta" :disabled="sending || previewBlocked" :aria-busy="sending" data-testid="property-contact-submit">
          <template v-if="sending">
            <span class="pc-spinner" aria-hidden="true" />
            {{ t('contactCard.sending', 'Enviando…') }}
          </template>
          <template v-else>
            {{ t('contactCard.submit', 'Enviar mensaje') }}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.5 2.5 10.5 13.5" /><path d="M21.5 2.5 14.5 21.5l-4-8-8-4z" /></svg>
          </template>
        </button>
        <p v-if="submitError" class="pc-error pc-error-submit" role="alert" data-testid="property-contact-error">{{ submitError }}</p>

        <p class="pc-note">
          * {{ t('contactCard.requiredFields', 'Campos obligatorios') }}<template v-if="isDemo"> · {{ t('contactCard.demoForm', 'Formulario de demostración') }}</template>
        </p>
      </form>
    </template>

    <template v-if="whatsappHref || telHref">
      <div class="pc-or"><span>{{ t('contactCard.orDirect', 'O contacta directamente') }}</span></div>
      <div class="pc-direct" :class="{ 'pc-direct-single': !(whatsappHref && telHref) }">
        <a v-if="whatsappHref" :href="whatsappHref" target="_blank" rel="noopener" class="pc-btn pc-wa" data-testid="property-contact-whatsapp">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.87.52 3.63 1.4 5.13L2 22l5.13-1.35a9.9 9.9 0 0 0 4.9 1.28h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.04.8.81-2.97-.2-.31a8.2 8.2 0 0 1-1.26-4.43c0-4.53 3.69-8.22 8.2-8.22 4.53 0 8.21 3.69 8.21 8.22 0 4.53-3.68 8.24-8.22 8.24zm4.5-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06a6.7 6.7 0 0 1-1.98-1.22 7.5 7.5 0 0 1-1.37-1.71c-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.84-.2-.48-.41-.42-.56-.43h-.48a.92.92 0 0 0-.66.31 2.8 2.8 0 0 0-.87 2.07c0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.53.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28z" /></svg>
          WhatsApp
        </a>
        <a v-if="telHref" :href="telHref" class="pc-btn pc-call" data-testid="property-contact-call">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
          {{ t('contactCard.call', 'Llamar') }}
        </a>
      </div>
    </template>

    <div class="pc-sep pc-sep-actions" />
    <div class="pc-actions no-print">
      <button type="button" class="pc-action" data-testid="property-contact-pdf" @click="printSheet">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
        <span>PDF</span>
      </button>
      <button type="button" class="pc-action" data-testid="property-contact-share" @click="share">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>
        <span>{{ shared ? t('contactCard.copied', 'Copiado') : t('contactCard.share', 'Compartir') }}</span>
      </button>
      <button type="button" class="pc-action" :class="{ 'pc-action-on': fav }" :aria-pressed="fav" data-testid="property-contact-save" @click="toggleFav(project.id)">
        <svg width="15" height="15" viewBox="0 0 24 24" :fill="fav ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-4.5-9.3-9.2C1.2 8.7 2.7 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.3 0 4.8 3.2 3.3 6.3C19 16.5 12 21 12 21z" /></svg>
        <span>{{ fav ? t('contactCard.saved', 'Guardada') : t('contactCard.save', 'Guardar') }}</span>
      </button>
      <button type="button" class="pc-action" :class="{ 'pc-action-on': inCompare }" :aria-pressed="inCompare" data-testid="property-contact-compare" @click="compare">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18" /></svg>
        <span>{{ t('contactCard.compare', 'Comparar') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * «Atendido por» de la ficha pública: quién atiende la propiedad, el
 * formulario «Cuéntanos qué necesitas» y el contacto directo.
 *
 * - Quién: el comercial responsable de la propiedad (`agent`, de
 *   /api/public/properties/<slug>: sólo columnas públicas, activo y
 *   publicado en la web). Sin él, la inmobiliaria: su nombre, su logo y su
 *   teléfono legal. Nunca un nombre fijo.
 * - El formulario va a /api/public/contact con `form: 'property'`: el
 *   servidor resuelve la empresa por el dominio y la propiedad por su slug
 *   (nunca la empresa ni el comercial que mande el navegador), crea o
 *   reutiliza el Contact, crea el lead de esta propiedad, lo enruta y deja el
 *   hilo en Comunicaciones. Sin «Asunto»: la propiedad ya dice de qué va.
 * - `submissionId` evita que un doble clic cree dos leads; el campo trampa
 *   `website` frena a los bots sin CAPTCHA.
 * - Sin «responde en menos de 15 min»: no hay una métrica pública que lo
 *   respalde, así que se dice el puesto del comercial o un texto neutro.
 * - «Formulario de demostración» sólo en la cuenta demo. En la vista previa
 *   de una empresa real (alguien del equipo mirando su web) no se envía nada,
 *   para no llenarle el CRM de pruebas; en la demo sí, que es su flujo seguro.
 */
const props = defineProps<{
  project: { id: number; slug?: string | null; name: string; coverImage?: string | null; price?: number | null }
  agent?: { id: number; slug?: string | null; name: string; position?: string | null; image?: string | null; phone?: string | null; whatsapp?: string | null } | null
}>()

const { t } = useI18n()
const { tenant } = useTenant()
const visitorLanguage = useVisitorLanguage()
const { isFavorite, toggle: toggleFav, load: loadFav } = useFavorites()
const { has: hasCompare, toggle: toggleCompare, load: loadCompare } = useCompare()
onMounted(() => {
  loadFav()
  loadCompare()
})

const uid = useId()
const ids = { website: `${uid}-web`, name: `${uid}-name`, email: `${uid}-email`, phone: `${uid}-phone`, message: `${uid}-msg`, privacy: `${uid}-privacy` }

const agent = computed(() => props.agent || null)
const companyName = computed(() => tenant.value?.companyName || tenant.value?.name || '')
const displayName = computed(() => agent.value?.name || companyName.value || t('contactCard.ourTeam', 'Nuestro equipo'))
const avatarSrc = computed(() => {
  if (agent.value) return agent.value.image ? mediaUrl(agent.value.image) : ''
  return tenant.value?.logo ? mediaUrl(tenant.value.logo) : ''
})
const initials = computed(() =>
  displayName.value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join(''),
)
const subline = computed(() => (agent.value ? agent.value.position || t('contactCard.agentFallback', 'Comercial de esta propiedad') : t('contactCard.teamFallback', 'Te responde nuestro equipo')))
const isDemo = computed(() => !!tenant.value?.isDemo)
const previewBlocked = computed(() => !!tenant.value?.preview && !isDemo.value)

// --- Contacto directo: sólo con un número que lo parezca; si no, no hay botón ---
function digits(v: string | null | undefined): string {
  return String(v || '').replace(/[^0-9]/g, '')
}
function validPhone(v: string | null | undefined): boolean {
  const d = digits(v)
  return d.length >= 7 && d.length <= 15
}
/** wa.me necesita el número internacional: sin prefijo (+ o 00) no se puede adivinar el país. */
function international(v: string | null | undefined): string | null {
  const s = String(v || '').trim()
  if (!validPhone(s)) return null
  if (s.startsWith('+')) return digits(s)
  if (s.startsWith('00')) return digits(s).slice(2)
  return null
}
const whatsappHref = computed(() => {
  if (!agent.value) return null
  const n = international(agent.value.whatsapp) || international(agent.value.phone)
  if (!n) return null
  const first = agent.value.name.split(/\s+/)[0]
  const msg = `${t('decisionPanel.whatsapp.greeting', 'Hola')} ${first}, ${t('decisionPanel.whatsapp.interested', 'me interesa')} "${props.project.name}". ${t('decisionPanel.whatsapp.canWeTalk', '¿Podemos hablar?')}`
  return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`
})
const telHref = computed(() => {
  const n = agent.value ? [agent.value.phone, agent.value.whatsapp].find(validPhone) : tenant.value?.legalPhone
  if (!validPhone(n)) return null
  const s = String(n).trim()
  return `tel:${s.startsWith('+') ? '+' : ''}${digits(s)}`
})

// --- Acciones: las de siempre de la ficha (favoritos y comparador existentes) ---
const fav = computed(() => isFavorite(props.project.id))
const inCompare = computed(() => hasCompare(props.project.id))
function compare() {
  const p = props.project
  toggleCompare({ id: p.id, slug: p.slug, name: p.name, cover: p.coverImage, price: p.price })
}
const shared = ref(false)
async function share() {
  const url = location.href.split('#')[0]
  try {
    if (navigator.share) await navigator.share({ title: props.project.name, url })
    else {
      await navigator.clipboard.writeText(url)
      shared.value = true
      setTimeout(() => (shared.value = false), 1600)
    }
  } catch {
    // Compartir cancelado o portapapeles sin permiso: no es un error que enseñar.
  }
}
/** La ficha se imprime (o se guarda como PDF desde el diálogo) con su hoja de impresión. */
function printSheet() {
  window.print()
}

// --- Formulario ---
const PHONE_RE = /^[0-9+()\-\s]{6,25}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const form = reactive({ name: '', email: '', phone: '', message: '', privacyAccepted: false, website: '' })
const errors = reactive<{ name?: string; email?: string; phone?: string; message?: string; privacy?: string }>({})
const sending = ref(false)
const sent = ref(false)
const submitError = ref('')

function newSubmissionId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}
let submissionId = ''
onMounted(() => (submissionId = newSubmissionId()))

const sentText = computed(() =>
  agent.value
    ? `${agent.value.name.split(/\s+/)[0]} ${t('contactCard.sentAgent', 'te responderá lo antes posible.')}`
    : t('contactCard.sentTeam', 'Te responderemos lo antes posible.'),
)

function validate(): boolean {
  Object.assign(errors, { name: undefined, email: undefined, phone: undefined, message: undefined, privacy: undefined })
  if (!form.name.trim()) errors.name = t('contactCard.errName', 'Escribe tu nombre')
  if (!EMAIL_RE.test(form.email.trim())) errors.email = t('contactCard.errEmail', 'Escribe un email válido')
  if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) errors.phone = t('contactCard.errPhone', 'Revisa el teléfono')
  if (!form.message.trim()) errors.message = t('contactCard.errMessage', 'Cuéntanos qué necesitas')
  if (!form.privacyAccepted) errors.privacy = t('contactCard.errPrivacy', 'Tienes que aceptar la política de privacidad')
  return !Object.values(errors).some(Boolean)
}

async function submit() {
  if (sending.value || previewBlocked.value) return
  submitError.value = ''
  if (!validate()) return
  sending.value = true
  try {
    await $fetch('/api/public/contact', {
      method: 'POST',
      body: {
        type: 'contact',
        form: 'property',
        propertySlug: props.project.slug,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        message: form.message.trim(),
        privacyAccepted: true,
        submissionId: submissionId || newSubmissionId(),
        website: form.website,
        language: visitorLanguage(),
      },
    })
    sent.value = true
  } catch (e: any) {
    const status = e?.statusCode ?? e?.response?.status
    // El servidor contestó: lo que mandó no se guardó, así que el próximo intento es otro envío.
    // Sin respuesta (red caída) se reintenta con el mismo id, por si el primero sí llegó.
    if (status) submissionId = newSubmissionId()
    if (status === 429) submitError.value = t('contactCard.errRate', 'Has enviado varios mensajes seguidos. Prueba de nuevo en unos minutos.')
    else if (status === 422) submitError.value = e?.data?.statusMessage || e?.statusMessage || t('contactCard.errInvalid', 'Revisa los datos del formulario.')
    else if (status === 413) submitError.value = t('contactCard.errTooLong', 'El mensaje es demasiado largo.')
    else submitError.value = t('contactCard.errGeneric', 'No hemos podido enviar tu mensaje. Inténtalo de nuevo en unos minutos.')
  } finally {
    sending.value = false
  }
}

function reset() {
  form.name = ''
  form.email = ''
  form.phone = ''
  form.message = ''
  form.privacyAccepted = false
  submissionId = newSubmissionId()
  sent.value = false
}
</script>

<style scoped>
.pc-card {
  border: 1px solid #e6e3dd;
  border-radius: 16px;
  background: #fff;
  padding: 22px;
  color: #1c1b19;
}
.pc-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.pc-avatar {
  height: 46px;
  width: 46px;
  flex-shrink: 0;
  border-radius: 9999px;
  object-fit: cover;
}
.pc-avatar-logo {
  object-fit: contain;
  border: 1px solid #e7e4de;
  background: #fff;
  padding: 4px;
}
.pc-avatar-initials {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3ece6;
  color: #9b6a4c;
  font-size: 15px;
  font-weight: 700;
}
.pc-eyebrow {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #9b6a4c;
}
.pc-name {
  margin-top: 3px;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.2;
  color: #1c1b19;
}
.pc-sub {
  margin-top: 3px;
  font-size: 12px;
  color: #77736c;
}
.pc-sep {
  margin: 22px 0 20px;
  border-top: 1px solid #e7e4de;
}
.pc-sep-actions {
  margin: 16px 0 0;
}
.pc-title {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.25;
  color: #1c1b19;
}
.pc-lead {
  margin-top: 5px;
  font-size: 12px;
  color: #77736c;
}
.pc-form {
  margin-top: 20px;
}
.pc-field + .pc-field {
  margin-top: 16px;
}
.pc-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 359px) {
  .pc-row {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 16px;
  }
}
.pc-label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #4a4741;
}
.pc-req {
  color: #b0714f;
}
.pc-input {
  display: block;
  height: 34px;
  width: 100%;
  border: 1px solid #e3e0d9;
  border-radius: 8px;
  background: #fbfaf7;
  padding: 0 10px;
  font-size: 12px;
  color: #1c1b19;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.pc-input::placeholder {
  font-size: 11px;
  color: #9d9991;
}
.pc-input:focus {
  outline: none;
  border-color: #1c1b19;
  box-shadow: 0 0 0 3px rgba(28, 27, 25, 0.08);
}
.pc-input[aria-invalid='true'] {
  border-color: #c0573f;
}
.pc-textarea {
  height: 68px;
  min-height: 68px;
  padding: 8px 10px;
  line-height: 1.5;
  resize: vertical;
}
.pc-consent {
  margin-top: 14px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 11px;
  line-height: 1.45;
  color: #77736c;
}
.pc-check {
  margin-top: 1px;
  height: 14px;
  width: 14px;
  flex-shrink: 0;
  accent-color: #1c1b19;
}
.pc-link {
  color: #4a4741;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.pc-error {
  margin-top: 5px;
  font-size: 11px;
  color: #b4432c;
}
.pc-error-submit {
  text-align: center;
}
.pc-preview {
  margin-top: 12px;
  border-radius: 8px;
  background: #f6f3ee;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.45;
  color: #4a4741;
}
.pc-cta {
  margin-top: 16px;
  display: flex;
  height: 36px;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 8px;
  background: #1c1b19;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  transition: background-color 0.15s ease, opacity 0.15s ease;
}
.pc-cta:hover:not(:disabled) {
  background: #000;
}
.pc-cta:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.pc-cta:focus-visible,
.pc-btn:focus-visible,
.pc-action:focus-visible,
.pc-again:focus-visible {
  outline: 2px solid #1c1b19;
  outline-offset: 2px;
}
.pc-spinner {
  height: 13px;
  width: 13px;
  border-radius: 9999px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  animation: pc-spin 0.7s linear infinite;
}
@keyframes pc-spin {
  to {
    transform: rotate(360deg);
  }
}
.pc-note {
  margin-top: 12px;
  text-align: center;
  font-size: 10px;
  color: #8a857d;
}
.pc-or {
  margin-top: 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10.5px;
  color: #8a857d;
}
.pc-or::before,
.pc-or::after {
  content: '';
  flex: 1;
  border-top: 1px solid #e7e4de;
}
.pc-direct {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.pc-direct-single {
  grid-template-columns: minmax(0, 1fr);
}
.pc-btn {
  display: flex;
  height: 36px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.pc-wa {
  border: 1px solid #b9dfc3;
  background: #eaf6ec;
  color: #1f7a3a;
}
.pc-wa:hover {
  background: #dff1e3;
}
.pc-call {
  border: 1px solid #e3e0d9;
  background: #fff;
  color: #1c1b19;
}
.pc-call:hover {
  border-color: #1c1b19;
}
.pc-actions {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.pc-action {
  display: flex;
  min-height: 44px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
  color: #6f6b64;
  transition: color 0.15s ease;
}
.pc-action + .pc-action {
  border-left: 1px solid #e7e4de;
}
.pc-action:hover,
.pc-action-on {
  color: #1c1b19;
}
.pc-success {
  text-align: center;
  padding: 6px 0 4px;
}
.pc-success-icon {
  margin: 0 auto 12px;
  display: flex;
  height: 40px;
  width: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: #eaf6ec;
  color: #1f7a3a;
}
.pc-again {
  margin-top: 14px;
  font-size: 12px;
  font-weight: 600;
  color: #4a4741;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.pc-trap {
  position: absolute;
  left: -10000px;
  height: 1px;
  width: 1px;
  overflow: hidden;
}
</style>

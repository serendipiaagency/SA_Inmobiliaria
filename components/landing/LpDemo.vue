<template>
  <section id="demo" class="lp-section lp-demo" data-testid="landing-demo-section">
    <div class="lp-shell">
      <div class="lp-demo-head">
        <p class="lp-eyebrow">Demo</p>
        <h2 class="lp-h2">{{ LANDING_DEMO.title }}</h2>
        <p class="lp-lede">{{ LANDING_DEMO.subtitle }}</p>
        <a :href="LANDING_DEMO.primary.to" class="lp-btn lp-btn-primary lp-demo-cta" data-testid="landing-demo-cta">{{ LANDING_DEMO.primary.label }}<LpIcon name="arrow" class="lp-btn-icon" /></a>
      </div>
      <div class="lp-demo-stage">
        <div class="lp-demo-desktop">
          <LpShot shot-key="web-portada" address="tu-inmobiliaria.com" caption="La web pública de la inmobiliaria de demostración, creada con el Constructor Web." />
        </div>
        <div class="lp-demo-phone" aria-hidden="true">
          <div class="lp-phone">
            <img :src="LANDING_SHOTS.movil.src" :alt="LANDING_SHOTS.movil.alt" :width="LANDING_SHOTS.movil.width" :height="LANDING_SHOTS.movil.height" loading="lazy" decoding="async" @error="phoneMissing = true">
            <div v-if="phoneMissing" class="lp-phone-missing">Captura pendiente</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Solicitud de demo: una conversación real, no un acceso automático. -->
    <div id="solicitar-demo" class="lp-shell lp-request" data-testid="landing-request">
      <div class="lp-request-copy">
        <p class="lp-eyebrow">{{ LANDING_REQUEST.eyebrow }}</p>
        <h3 class="lp-request-title">{{ LANDING_REQUEST.title }}</h3>
        <p class="lp-request-lede">{{ LANDING_REQUEST.text }}</p>
        <ol class="lp-request-steps" data-testid="landing-request-steps">
          <li v-for="(step, i) in LANDING_REQUEST.steps" :key="step.title">
            <span class="lp-request-num" aria-hidden="true">0{{ i + 1 }}</span>
            <div><strong>{{ step.title }}</strong><p>{{ step.text }}</p></div>
          </li>
        </ol>
        <div class="lp-request-signature" data-testid="landing-request-signature">
          <span class="lp-request-avatar" aria-hidden="true">SA</span>
          <div>
            <strong>{{ LANDING_REQUEST.signature.name }}</strong>
            <a :href="`mailto:${LANDING_REQUEST.signature.email}`">{{ LANDING_REQUEST.signature.email }}</a>
          </div>
        </div>
      </div>

      <form v-if="state !== 'done'" class="lp-form" novalidate data-testid="landing-demo-form" @submit.prevent="submit">
        <div class="lp-form-head">
          <p class="lp-form-eyebrow">{{ LANDING_REQUEST.form.eyebrow }}</p>
          <span class="lp-form-badge" data-testid="landing-request-badge"><i aria-hidden="true" />{{ LANDING_REQUEST.form.badge }}</span>
        </div>
        <p class="lp-form-title">{{ LANDING_REQUEST.form.title }}</p>
        <p v-if="formError" class="lp-form-error" role="alert" data-testid="landing-demo-error">{{ formError }}</p>
        <div class="lp-form-grid">
          <div class="lp-field">
            <label for="lp-demo-name">Nombre y apellidos</label>
            <input id="lp-demo-name" v-model="form.name" type="text" maxlength="120" autocomplete="name" required :aria-invalid="errors.name ? 'true' : undefined" data-testid="landing-demo-name">
            <small v-if="errors.name">{{ errors.name }}</small>
          </div>
          <div class="lp-field">
            <label for="lp-demo-email">Email profesional</label>
            <input id="lp-demo-email" v-model="form.email" type="email" maxlength="200" autocomplete="email" inputmode="email" required :aria-invalid="errors.email ? 'true' : undefined" data-testid="landing-demo-email">
            <small v-if="errors.email">{{ errors.email }}</small>
          </div>
          <div class="lp-field">
            <label for="lp-demo-company">Inmobiliaria o empresa</label>
            <input id="lp-demo-company" v-model="form.company" type="text" maxlength="120" autocomplete="organization" required :aria-invalid="errors.company ? 'true' : undefined" data-testid="landing-demo-company">
            <small v-if="errors.company">{{ errors.company }}</small>
          </div>
          <div class="lp-field">
            <label for="lp-demo-phone">Teléfono <span>(opcional)</span></label>
            <input id="lp-demo-phone" v-model="form.phone" type="tel" maxlength="40" autocomplete="tel" inputmode="tel" :aria-invalid="errors.phone ? 'true' : undefined" data-testid="landing-demo-phone">
            <small v-if="errors.phone">{{ errors.phone }}</small>
          </div>
          <div class="lp-field">
            <label for="lp-demo-team">Tamaño del equipo</label>
            <select id="lp-demo-team" v-model="form.teamSize" data-testid="landing-demo-team">
              <option value="">Sin indicar</option>
              <option v-for="o in LANDING_DEMO_FORM.teamSizes" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
          <div class="lp-field">
            <label for="lp-demo-interest">Qué te interesa más</label>
            <select id="lp-demo-interest" v-model="form.interest" data-testid="landing-demo-interest">
              <option value="">Sin indicar</option>
              <option v-for="o in LANDING_DEMO_FORM.interests" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
          <div class="lp-field lp-field-full">
            <label for="lp-demo-message">Cuéntanos un poco más <span>(opcional)</span></label>
            <textarea id="lp-demo-message" v-model="form.message" rows="3" maxlength="2000" placeholder="Cómo trabajáis ahora, qué equipo tenéis y qué os gustaría cambiar…" data-testid="landing-demo-message" />
          </div>
        </div>
        <!-- Campo trampa: invisible para una persona; un bot lo rellena. -->
        <div class="lp-hp" aria-hidden="true">
          <label for="lp-demo-website">Web</label>
          <input id="lp-demo-website" v-model="form.website" type="text" tabindex="-1" autocomplete="off">
        </div>
        <label class="lp-consent" :class="{ 'is-invalid': errors.consent }">
          <input v-model="form.consent" type="checkbox" :aria-invalid="errors.consent ? 'true' : undefined" data-testid="landing-demo-consent">
          <span>Acepto que Serendipia Agency utilice mis datos para responder a esta solicitud de demo, según la <NuxtLink to="/privacidad">política de privacidad</NuxtLink>.</span>
        </label>
        <small v-if="errors.consent" class="lp-consent-error">{{ errors.consent }}</small>
        <button type="submit" class="lp-btn lp-btn-accent lp-form-submit" :disabled="state === 'sending'" :aria-busy="state === 'sending' ? 'true' : undefined" data-testid="landing-demo-submit" data-landing-event="demo_request_submit">
          {{ state === 'sending' ? 'Enviando…' : LANDING_REQUEST.form.submit }}<LpIcon name="arrow" class="lp-btn-icon" />
        </button>
        <p class="lp-form-foot" data-testid="landing-request-footnote">{{ LANDING_REQUEST.form.footnote }}</p>
      </form>

      <div v-else class="lp-form lp-form-done" role="status" aria-live="polite" data-testid="landing-demo-success">
        <span class="lp-done-icon"><LpIcon name="check" /></span>
        <h4>Solicitud recibida</h4>
        <p>Gracias, {{ doneName }}. Te escribiremos a <strong>{{ doneEmail }}</strong> para concretar la demostración.</p>
        <p v-if="doneEmailStatus === 'sent' || doneEmailStatus === 'queued'" class="lp-done-note" data-testid="landing-demo-email-status" :data-status="doneEmailStatus">Te hemos enviado un correo de confirmación.</p>
        <p v-else class="lp-done-note" data-testid="landing-demo-email-status" :data-status="doneEmailStatus">La solicitud está registrada; el correo de confirmación no se ha podido enviar ahora mismo, pero te responderemos igualmente.</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import LpShot from './LpShot.vue'
import { LANDING_DEMO, LANDING_DEMO_FORM, LANDING_REQUEST, LANDING_SHOTS } from '~/utils/landing'

/**
 * Demo: la web real de la inmobiliaria de demostración (escritorio y móvil)
 * y el formulario de solicitud. No hay acceso público a la cuenta demo: la
 * solicitud se guarda en la plataforma (platform_demo_requests), avisa a
 * quien la administra y confirma por correo a quien la pidió. Ningún dato
 * va al CRM de ninguna inmobiliaria.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?[0-9 ()./-]{6,40}$/

const form = reactive({ name: '', email: '', company: '', phone: '', teamSize: '', interest: '', message: '', consent: false, website: '' })
const errors = reactive<{ name?: string; email?: string; company?: string; phone?: string; consent?: string }>({})
const state = ref<'idle' | 'sending' | 'done'>('idle')
const formError = ref('')
const doneName = ref('')
const doneEmail = ref('')
const doneEmailStatus = ref<string>('none')
const phoneMissing = ref(false)
const visitorLanguage = useVisitorLanguage()
// Un envío = una clave: un doble clic o un reintento no crea dos solicitudes.
let submissionId = ''

function validate() {
  Object.assign(errors, { name: undefined, email: undefined, company: undefined, phone: undefined, consent: undefined })
  if (!form.name.trim()) errors.name = 'Escribe tu nombre.'
  if (!EMAIL_RE.test(form.email.trim())) errors.email = 'Escribe un correo válido.'
  if (!form.company.trim()) errors.company = 'Escribe el nombre de tu inmobiliaria.'
  if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) errors.phone = 'Revisa el teléfono.'
  if (!form.consent) errors.consent = 'Para responderte necesitamos tu permiso para usar estos datos.'
  return !Object.values(errors).some(Boolean)
}

async function submit() {
  if (state.value === 'sending') return
  formError.value = ''
  if (!validate()) {
    await nextTick()
    document.querySelector<HTMLElement>('[data-testid="landing-demo-form"] [aria-invalid="true"]')?.focus()
    return
  }
  if (!submissionId) submissionId = crypto.randomUUID()
  state.value = 'sending'
  try {
    const res = await $fetch<{ ok: true; email: string; name: string; confirmationEmail: string }>('/api/public/demo-request', {
      method: 'POST',
      body: {
        name: form.name.trim(),
        email: form.email.trim(),
        company: form.company.trim(),
        phone: form.phone.trim() || null,
        teamSize: form.teamSize || null,
        interest: form.interest || null,
        message: form.message.trim() || null,
        consent: form.consent,
        locale: visitorLanguage(),
        website: form.website,
        submissionId,
      },
    })
    doneName.value = res.name
    doneEmail.value = res.email
    doneEmailStatus.value = res.confirmationEmail
    state.value = 'done'
  } catch (e: any) {
    state.value = 'idle'
    const status = e?.statusCode || e?.response?.status
    if (status === 429) formError.value = 'Demasiadas solicitudes seguidas. Prueba de nuevo en unos minutos.'
    else if (status === 422) formError.value = e?.data?.statusMessage || e?.statusMessage || 'Revisa los datos del formulario.'
    else formError.value = 'No se pudo enviar la solicitud. Inténtalo de nuevo o escríbenos a info@serendipiaagency.com.'
  }
}
</script>

<style scoped>
.lp-demo {
  background: var(--lp-white);
}
.lp-demo-head {
  max-width: 720px;
}
.lp-demo-cta {
  margin-top: 28px;
}
.lp-demo-stage {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 32px;
  align-items: end;
  margin-top: 48px;
}
.lp-phone {
  position: relative;
  width: 220px;
  border-radius: 34px;
  padding: 10px;
  background: #121b16;
  box-shadow: var(--lp-shadow);
}
.lp-phone img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 26px;
  background: var(--lp-paper-2);
}
.lp-phone-missing {
  position: absolute;
  inset: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 26px;
  font-size: 12px;
  color: var(--lp-muted);
  background: repeating-linear-gradient(135deg, #f3efe7 0 12px, #efeadf 12px 24px);
}
/* Solicitud */
.lp-request {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 48px;
  margin-top: 80px;
  padding-top: 64px;
  border-top: 1px solid var(--lp-line);
  scroll-margin-top: 96px;
}
.lp-request-title {
  margin: 20px 0 0;
  font-size: clamp(30px, 3.6vw, 44px);
  line-height: 1.06;
  letter-spacing: -0.03em;
  max-width: 14ch;
}
.lp-request-lede {
  margin: 18px 0 0;
  font-size: 17px;
  line-height: 1.6;
  max-width: 44ch;
}
.lp-request-steps {
  display: grid;
  gap: 18px;
  margin: 34px 0 0;
  padding: 0;
  list-style: none;
}
.lp-request-steps li {
  display: grid;
  grid-template-columns: 2.6rem minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.lp-request-num {
  padding-top: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-weight: 700;
  color: var(--lp-muted);
}
.lp-request-steps strong {
  display: block;
  font-size: 16px;
  color: var(--lp-ink);
}
.lp-request-steps p {
  margin: 4px 0 0;
  font-size: 14.5px;
  line-height: 1.5;
  color: var(--lp-text);
}
.lp-request-signature {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 36px;
  padding-top: 24px;
  border-top: 1px solid var(--lp-line);
}
.lp-request-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: var(--lp-ink);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}
.lp-request-signature strong {
  display: block;
  font-size: 14px;
  color: var(--lp-ink);
}
.lp-request-signature a {
  font-size: 14px;
  font-weight: 600;
  color: var(--lp-accent);
}
.lp-form-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}
.lp-form-eyebrow {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lp-muted);
}
.lp-form-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--lp-sage);
  font-size: 12px;
  font-weight: 600;
  color: var(--lp-ink);
}
.lp-form-badge i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #2f7a4f;
}
.lp-form-title {
  margin: 16px 0 22px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--lp-line);
  font-size: clamp(22px, 2.4vw, 28px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--lp-ink);
}
.lp-form-foot {
  margin: 12px 0 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--lp-muted);
}
.lp-form {
  padding: 32px;
  border-radius: var(--lp-radius);
  background: var(--lp-paper);
  border: 1px solid var(--lp-line);
}
.lp-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.lp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lp-field-full {
  grid-column: 1 / -1;
}
.lp-field label {
  font-size: 13px;
  font-weight: 600;
  color: var(--lp-ink);
}
.lp-field label span {
  font-weight: 400;
  color: var(--lp-muted);
}
.lp-field input,
.lp-field select,
.lp-field textarea {
  width: 100%;
  min-height: 46px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--lp-line);
  background: var(--lp-white);
  font-size: 15px;
  color: var(--lp-ink);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.lp-field textarea {
  min-height: 90px;
  resize: vertical;
}
.lp-field input:focus,
.lp-field select:focus,
.lp-field textarea:focus {
  outline: none;
  border-color: var(--lp-ink);
  box-shadow: 0 0 0 3px rgba(23, 44, 34, 0.12);
}
.lp-field [aria-invalid='true'] {
  border-color: #b4412f;
}
.lp-field small,
.lp-consent-error {
  font-size: 12px;
  font-weight: 500;
  color: #b4412f;
}
.lp-hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
.lp-consent {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 18px;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
}
.lp-consent input {
  margin-top: 3px;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  accent-color: var(--lp-ink);
}
.lp-consent a {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.lp-form-error {
  margin: 0 0 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fdecea;
  border: 1px solid #f3c4bc;
  font-size: 14px;
  font-weight: 500;
  color: #8c2f1f;
}
.lp-form-submit {
  width: 100%;
  margin-top: 20px;
}
.lp-form-done {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
}
.lp-done-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  background: var(--lp-sage);
  color: var(--lp-ink);
}
.lp-done-icon svg {
  width: 24px;
  height: 24px;
}
.lp-form-done h4 {
  margin: 18px 0 0;
  font-size: 22px;
}
.lp-form-done p {
  margin: 10px 0 0;
  font-size: 15px;
  line-height: 1.55;
}
.lp-done-note {
  font-size: 13px !important;
  color: var(--lp-muted);
}
@media (max-width: 1023px) {
  .lp-request {
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
    margin-top: 56px;
    padding-top: 48px;
  }
}
@media (max-width: 767px) {
  .lp-demo-stage {
    grid-template-columns: minmax(0, 1fr);
    margin-top: 32px;
  }
  .lp-demo-phone {
    display: none;
  }
  .lp-form {
    padding: 20px;
  }
  .lp-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

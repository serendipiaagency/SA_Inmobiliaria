<template>
  <section id="contacto" class="lp-section lp-contact" data-testid="landing-demo-section">
    <div class="lp-shell lp-contact-inner" data-testid="landing-request">
      <div class="lp-contact-copy lp-reveal">
        <h2 class="lp-h2">Tu próxima etapa<br><span>empieza aquí.</span></h2>
        <p class="lp-lede">{{ LANDING_REQUEST.text }}</p>
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
            <a :href="`mailto:${LANDING_REQUEST.signature.email}`">{{ LANDING_REQUEST.signature.email }} <span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </div>

      <div id="solicitar-demo" class="lp-contact-card">
        <form v-if="state !== 'done'" class="lp-form" novalidate data-testid="landing-demo-form" @submit.prevent="submit">
          <div class="lp-form-head">
            <p class="lp-form-title">{{ LANDING_REQUEST.form.title }}</p>
            <span class="lp-form-badge" data-testid="landing-request-badge"><i aria-hidden="true" />{{ LANDING_REQUEST.form.badge }}</span>
          </div>
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
          <button type="submit" class="lp-btn lp-btn-blue lp-form-submit" :disabled="state === 'sending'" :aria-busy="state === 'sending' ? 'true' : undefined" data-testid="landing-demo-submit" data-landing-event="demo_request_submit">
            {{ state === 'sending' ? 'Enviando…' : LANDING_REQUEST.form.submit }} <span aria-hidden="true">↗</span>
          </button>
          <NuxtLink :to="LANDING_CTA.register.to" class="lp-contact-secondary" data-landing-event="cta_register_contact">O crea tu inmobiliaria →</NuxtLink>
          <p class="lp-form-foot" data-testid="landing-request-footnote">{{ LANDING_REQUEST.form.footnote }}</p>
        </form>

        <div v-else class="lp-form lp-form-done" role="status" aria-live="polite" data-testid="landing-demo-success">
          <span class="lp-done-icon"><LpIcon name="check" /></span>
          <h3>Solicitud recibida</h3>
          <p>Gracias, {{ doneName }}. Te escribiremos a <strong>{{ doneEmail }}</strong> para concretar la demostración.</p>
          <p v-if="doneEmailStatus === 'sent' || doneEmailStatus === 'queued'" class="lp-done-note" data-testid="landing-demo-email-status" :data-status="doneEmailStatus">Te hemos enviado un correo de confirmación.</p>
          <p v-else class="lp-done-note" data-testid="landing-demo-email-status" :data-status="doneEmailStatus">La solicitud está registrada; el correo de confirmación no se ha podido enviar ahora mismo, pero te responderemos igualmente.</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_CTA, LANDING_DEMO_FORM, LANDING_REQUEST } from '~/utils/landing'

/**
 * Cierre y solicitud de demo. No hay acceso público a la cuenta demo: la
 * solicitud se guarda en la plataforma (platform_demo_requests), avisa a quien
 * la administra y confirma por correo a quien la pidió. Ningún dato va al CRM
 * de ninguna inmobiliaria. El flujo real (endpoint, validación, deduplicación
 * y antispam) se conserva intacto.
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
.lp-contact {
  background: var(--lp-paper-2);
  border-top: 1px solid var(--lp-line);
}
.lp-contact-inner {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: clamp(32px, 5vw, 60px);
  align-items: start;
  padding: clamp(28px, 4vw, 56px);
  border-radius: 16px;
  background: radial-gradient(at 0 100%, #e2f0ff, transparent 70%), #f6f8fb;
  border: 1px solid #e4ecf6;
}
.lp-contact-copy .lp-lede {
  margin: 20px 0 0;
  max-width: 42ch;
  font-size: 15px;
}
.lp-request-steps {
  display: grid;
  gap: 16px;
  margin: 30px 0 0;
  padding: 0;
  list-style: none;
}
.lp-request-steps li {
  display: grid;
  grid-template-columns: 2.4rem 1fr;
  gap: 14px;
  align-items: start;
}
.lp-request-num {
  padding-top: 2px;
  font-size: 12px;
  font-weight: 700;
  color: var(--lp-blue);
}
.lp-request-steps strong {
  display: block;
  font-size: 15px;
  color: var(--lp-ink);
}
.lp-request-steps p {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--lp-text);
}
.lp-request-signature {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 34px;
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
  color: var(--lp-blue);
}
/* Tarjeta del formulario */
.lp-contact-card {
  padding: clamp(22px, 2.6vw, 34px);
  border: 1px solid #e0e6ef;
  border-radius: 12px;
  background: #fff;
  scroll-margin-top: 110px;
}
.lp-form-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}
.lp-form-title {
  margin: 0;
  font-size: clamp(20px, 2.2vw, 25px);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--lp-ink);
}
.lp-form-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--lp-sky);
  font-size: 12px;
  font-weight: 600;
  color: #0a5bc4;
}
.lp-form-badge i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--lp-blue);
}
.lp-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 22px;
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
  border-radius: 10px;
  border: 1px solid var(--lp-line);
  background: #fff;
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
  border-color: var(--lp-blue);
  box-shadow: 0 0 0 3px rgba(8, 124, 250, 0.16);
}
.lp-field [aria-invalid='true'] {
  border-color: #c23b26;
}
.lp-field small,
.lp-consent-error {
  font-size: 12px;
  font-weight: 500;
  color: #c23b26;
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
  color: var(--lp-text);
  cursor: pointer;
}
.lp-consent input {
  margin-top: 3px;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  accent-color: var(--lp-blue);
}
.lp-consent a {
  color: var(--lp-blue);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.lp-form-error {
  margin: 16px 0 0;
  padding: 12px 14px;
  border-radius: 10px;
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
.lp-contact-secondary {
  display: block;
  margin-top: 16px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--lp-ink);
}
.lp-contact-secondary:hover {
  color: var(--lp-blue);
}
.lp-form-foot {
  margin: 14px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--lp-muted);
}
.lp-form-done {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-height: 260px;
  justify-content: center;
}
.lp-done-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  background: var(--lp-sky);
  color: var(--lp-blue);
}
.lp-done-icon svg {
  width: 24px;
  height: 24px;
}
.lp-form-done h3 {
  margin: 18px 0 0;
  font-size: 22px;
}
.lp-form-done p {
  margin: 10px 0 0;
  font-size: 15px;
  line-height: 1.55;
  color: var(--lp-text);
}
.lp-done-note {
  font-size: 13px !important;
  color: var(--lp-muted) !important;
}
@media (max-width: 860px) {
  .lp-contact-inner {
    grid-template-columns: 1fr;
    gap: 28px;
  }
  .lp-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>

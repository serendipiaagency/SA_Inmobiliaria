<template>
  <form class="fn" novalidate data-testid="footer-newsletter" @submit.prevent="submit">
    <div class="fn-field" :class="{ 'fn-field-error': state === 'error' && errorField === 'email' }">
      <label :for="emailId" class="sr-only">{{ t('footer.newsletter.email', 'Tu correo electrónico') }}</label>
      <input
        :id="emailId"
        v-model="email"
        type="email"
        inputmode="email"
        autocomplete="email"
        maxlength="254"
        class="fn-input"
        :placeholder="t('footer.newsletter.email', 'Tu correo electrónico')"
        :aria-invalid="state === 'error' && errorField === 'email'"
        :aria-describedby="messageId"
        data-testid="footer-newsletter-email"
        :disabled="state === 'sending'"
      >
      <button type="submit" class="fn-btn" :aria-label="t('footer.newsletter.submit', 'Suscribirme')" :disabled="state === 'sending'" data-testid="footer-newsletter-submit">
        <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 3 10.5 13.5" />
          <path d="M21 3 14.5 21l-4-7.5L3 9.5z" />
        </svg>
      </button>
    </div>
    <!-- Campo trampa: invisible para una persona; un bot lo rellena. -->
    <input v-model="website" type="text" name="website" class="fn-hp" tabindex="-1" autocomplete="off" aria-hidden="true" >
    <label class="fn-consent">
      <input v-model="accepted" type="checkbox" class="fn-check" data-testid="footer-newsletter-consent" :aria-invalid="state === 'error' && errorField === 'consent'" >
      <span>
        {{ t('footer.newsletter.accept', 'Acepto la') }}
        <NuxtLink to="/privacidad" class="fn-privacy">{{ t('footer.newsletter.privacy', 'política de privacidad') }}</NuxtLink>
      </span>
    </label>
    <p :id="messageId" class="fn-msg" :class="state === 'error' ? 'fn-msg-error' : 'fn-msg-ok'" role="status" aria-live="polite" data-testid="footer-newsletter-message" :data-state="state">
      <template v-if="message">{{ message }}</template>
      <template v-if="state === 'done' && unsubscribeToken">
        {{ ' ' }}<NuxtLink :to="`/newsletter/baja?token=${unsubscribeToken}`" class="fn-undo" data-testid="footer-newsletter-undo">{{ t('footer.newsletter.undo', '¿No querías? Darse de baja') }}</NuxtLink>
      </template>
    </p>
  </form>
</template>

<script setup lang="ts">
/**
 * «Suscríbete» del pie: un email y la aceptación de la política de
 * privacidad, que se guardan como suscripción de ESTA inmobiliaria
 * (POST /api/public/newsletter, server/utils/newsletter.ts). No se envía
 * ningún email. A quien acaba de apuntarse se le da su enlace de baja (el
 * consentimiento se retira tan fácil como se da).
 *
 * En el lienzo del Constructor (`sandbox`) no guarda nada: lo dice.
 */
const props = withDefaults(defineProps<{ companyName?: string | null; sandbox?: boolean }>(), { companyName: null, sandbox: false })

const { t, locale } = useI18n()
const emailId = useId()
const messageId = useId()
const email = ref('')
const accepted = ref(false)
const website = ref('')
const state = ref<'idle' | 'sending' | 'done' | 'error'>('idle')
const errorField = ref<'email' | 'consent' | null>(null)
const message = ref('')
const unsubscribeToken = ref<string | null>(null)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fail(text: string, field: 'email' | 'consent' | null = null) {
  state.value = 'error'
  errorField.value = field
  message.value = text
}

async function submit() {
  if (state.value === 'sending') return
  unsubscribeToken.value = null
  const value = email.value.trim()
  if (!EMAIL_RE.test(value)) return fail(t('footer.newsletter.invalidEmail', 'Escribe un email válido.'), 'email')
  if (!accepted.value) return fail(t('footer.newsletter.needConsent', 'Para suscribirte, acepta la política de privacidad.'), 'consent')
  if (props.sandbox) {
    state.value = 'done'
    errorField.value = null
    message.value = t('footer.newsletter.sandbox', 'En el editor no se guarda ninguna suscripción.')
    return
  }
  state.value = 'sending'
  errorField.value = null
  message.value = ''
  try {
    const res = await $fetch<{ ok: true; unsubscribeToken: string | null }>('/api/public/newsletter', {
      method: 'POST',
      body: { email: value, privacyAccepted: true, locale: locale.value, website: website.value },
    })
    state.value = 'done'
    const name = props.companyName || ''
    message.value = name
      ? t('footer.newsletter.done', '¡Gracias! Te has suscrito a las novedades de {name}.').replace('{name}', name)
      : t('footer.newsletter.doneGeneric', '¡Gracias! Te has suscrito a nuestras novedades.')
    unsubscribeToken.value = res.unsubscribeToken
    email.value = ''
    accepted.value = false
  } catch (e: any) {
    const status = e?.statusCode || e?.response?.status
    if (status === 429) fail(t('footer.newsletter.tooMany', 'Demasiados intentos. Prueba de nuevo en unos minutos.'))
    else if (status === 422) fail(t('footer.newsletter.invalidEmail', 'Escribe un email válido.'), 'email')
    else fail(t('footer.newsletter.error', 'No se pudo completar la suscripción. Inténtalo de nuevo.'))
  }
}
</script>

<style scoped>
.fn-field {
  display: flex;
  align-items: stretch;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--sf-text) 22%, transparent);
  border-radius: 12px;
  background: #fff;
  transition: border-color 0.2s;
}
.fn-field:focus-within {
  border-color: var(--sf-accent);
}
.fn-field-error {
  border-color: #b4412f;
}
.fn-input {
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  padding: 0.8rem 0.95rem;
  font-size: 0.875rem;
  color: #1c1b17;
  outline: none;
}
.fn-input::placeholder {
  color: #9a948a;
}
.fn-btn {
  display: flex;
  width: 3rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  margin: 4px;
  border-radius: 9px;
  background: var(--sf-accent);
  color: #fff;
  transition: filter 0.2s, transform 0.15s;
}
.fn-btn:hover {
  filter: brightness(1.12);
}
.fn-btn:active {
  transform: scale(0.95);
}
.fn-btn:disabled {
  opacity: 0.6;
}
.fn-hp {
  position: absolute;
  left: -9999px;
  height: 1px;
  width: 1px;
  opacity: 0;
}
.fn-consent {
  margin-top: 0.75rem;
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  font-size: 0.8rem;
  line-height: 1.35;
  cursor: pointer;
}
.fn-check {
  margin-top: 0.1rem;
  height: 1rem;
  width: 1rem;
  flex-shrink: 0;
  accent-color: var(--sf-accent);
}
.fn-privacy,
.fn-undo {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.fn-msg {
  margin-top: 0.6rem;
  min-height: 1.1rem;
  font-size: 0.8rem;
}
.fn-msg-error {
  color: #b4412f;
}
.fn-msg-ok {
  color: var(--sf-text);
}
</style>

<template>
  <div class="min-h-screen bg-paper px-4 py-10 sm:py-16" data-testid="register-page" :data-ready="mounted ? 'true' : undefined">
    <div class="mx-auto w-full max-w-md">
      <NuxtLink to="/" class="inline-flex items-center gap-1 text-sm font-medium text-stone-500 transition hover:text-ink">← Volver a la web</NuxtLink>

      <!-- Registro completado -->
      <section v-if="done" class="card mt-6 p-7 sm:p-8" data-testid="register-success" aria-live="polite">
        <span class="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden="true">
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m5 13 4 4L19 7" /></svg>
        </span>
        <h1 ref="successHeading" tabindex="-1" class="mt-4 text-2xl font-bold text-ink outline-none">Tu empresa ya está registrada</h1>
        <p class="mt-2 text-sm text-stone-600">
          <strong>{{ done.companyName }}</strong> ya tiene su espacio en INMO. Entra con <strong>{{ done.email }}</strong> y la contraseña que acabas de elegir.
        </p>
        <p class="mt-4 rounded-xl border px-4 py-3 text-sm" :class="done.welcomeEmail === 'sent' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-line bg-white text-stone-600'" data-testid="register-email-status" :data-status="done.welcomeEmail">
          {{ emailMessage }}
        </p>
        <NuxtLink :to="`/admin/login?registered=1&email=${encodeURIComponent(done.email)}`" class="btn-primary mt-6 w-full" data-testid="register-go-login">Iniciar sesión</NuxtLink>
      </section>

      <template v-else>
        <div class="mt-6">
          <!-- La marca de la PLATAFORMA, no la de una inmobiliaria: <Logo> pinta la
               de la organización por defecto (M&M), y aquí se registra una empresa en INMO. -->
          <p class="text-2xl font-black tracking-tight text-ink" aria-label="INMO">INMO</p>
          <h1 class="mt-5 text-2xl font-bold text-ink sm:text-3xl">Registra tu empresa</h1>
          <p class="mt-1 text-sm text-stone-500">Crea el espacio de tu inmobiliaria en INMO. Serás su administrador.</p>
        </div>

        <form class="card mt-6 space-y-5 p-6 sm:p-8" novalidate data-testid="register-form" @submit.prevent="submit">
          <p v-if="formError" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert" data-testid="register-error">{{ formError }}</p>

          <div>
            <label for="reg-name" class="label">Empresa <span class="text-red-500">*</span></label>
            <input id="reg-name" v-model="form.name" type="text" class="input" maxlength="120" autocomplete="organization" required :aria-invalid="errors.name ? 'true' : undefined" aria-describedby="reg-name-err" data-testid="register-name">
            <p v-if="errors.name" id="reg-name-err" class="mt-1.5 text-xs font-medium text-red-600">{{ errors.name }}</p>
          </div>
          <div>
            <label for="reg-company" class="label">Nombre comercial <span class="font-normal normal-case tracking-normal text-stone-400">(si es distinto)</span></label>
            <input id="reg-company" v-model="form.companyName" type="text" class="input" maxlength="120" data-testid="register-company-name">
          </div>
          <div>
            <label for="reg-email" class="label">Correo electrónico <span class="text-red-500">*</span></label>
            <input id="reg-email" v-model="form.email" type="email" class="input" maxlength="200" autocomplete="email" required :aria-invalid="errors.email ? 'true' : undefined" aria-describedby="reg-email-err" data-testid="register-email">
            <p v-if="errors.email" id="reg-email-err" class="mt-1.5 text-xs font-medium text-red-600" data-testid="register-email-error">
              {{ errors.email }}
              <NuxtLink v-if="emailTaken" to="/admin/login" class="underline">Iniciar sesión</NuxtLink>
            </p>
          </div>
          <div>
            <label for="reg-password" class="label">Contraseña <span class="text-red-500">*</span></label>
            <div class="relative">
              <input id="reg-password" v-model="form.password" :type="showPassword ? 'text' : 'password'" class="input pr-24" autocomplete="new-password" required :minlength="MIN" :aria-invalid="errors.password ? 'true' : undefined" aria-describedby="reg-password-help" data-testid="register-password">
              <button type="button" class="absolute inset-y-0 right-0 px-4 text-xs font-semibold text-stone-500 hover:text-ink" :aria-pressed="showPassword" :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'" data-testid="register-toggle-password" @click="showPassword = !showPassword">
                {{ showPassword ? 'Ocultar' : 'Mostrar' }}
              </button>
            </div>
            <p id="reg-password-help" class="mt-1.5 text-xs" :class="errors.password ? 'font-medium text-red-600' : form.password.length >= MIN ? 'text-emerald-700' : 'text-stone-500'">
              {{ errors.password || `Mínimo ${MIN} caracteres.` }}
            </p>
          </div>
          <div>
            <label for="reg-password2" class="label">Confirmar contraseña <span class="text-red-500">*</span></label>
            <input id="reg-password2" v-model="form.passwordConfirm" :type="showPassword ? 'text' : 'password'" class="input" autocomplete="new-password" required :aria-invalid="errors.passwordConfirm ? 'true' : undefined" aria-describedby="reg-password2-err" data-testid="register-password-confirm">
            <p v-if="errors.passwordConfirm" id="reg-password2-err" class="mt-1.5 text-xs font-medium text-red-600">{{ errors.passwordConfirm }}</p>
          </div>

          <!-- Honeypot: invisible para personas; un bot que lo rellena no registra nada. -->
          <div class="hidden" aria-hidden="true">
            <label for="reg-website">Web</label>
            <input id="reg-website" v-model="form.website" type="text" tabindex="-1" autocomplete="off">
          </div>

          <label class="flex items-start gap-2.5 text-sm text-stone-600">
            <input v-model="form.acceptTerms" type="checkbox" class="mt-0.5 h-4 w-4 accent-ink" :aria-invalid="errors.acceptTerms ? 'true' : undefined" data-testid="register-accept">
            <span>
              Acepto los <NuxtLink to="/terminos" target="_blank" class="underline">términos</NuxtLink> y la <NuxtLink to="/privacidad" target="_blank" class="underline">política de privacidad</NuxtLink>.
            </span>
          </label>
          <p v-if="errors.acceptTerms" class="-mt-3 text-xs font-medium text-red-600">{{ errors.acceptTerms }}</p>

          <button type="submit" class="btn-primary w-full" :disabled="submitting" :aria-busy="submitting ? 'true' : undefined" data-testid="register-submit">
            {{ submitting ? 'Creando tu empresa…' : 'Crear cuenta de empresa' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-stone-500">
          ¿Ya tienes cuenta? <NuxtLink to="/admin/login" class="font-medium text-ink hover:underline">Inicia sesión</NuxtLink>
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Registro público de empresas (Landing → «Registro empresa»).
 *
 * POST /api/auth/login { action: 'register-company', … } — el mismo
 * provisioning que Sistemas > Empresas > + Nuevo
 * (server/utils/organizations/). El servidor decide el tenant, el rol
 * (Administrador de SU empresa, nunca super admin) y el estado de acceso;
 * este formulario no envía nada de eso. No inicia sesión: tras el alta se
 * entra por el login normal.
 */
definePageMeta({ layout: false })
useHead({ title: 'Registro de empresa — INMO', meta: [{ name: 'robots', content: 'noindex' }] })

const MIN = 8
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

const form = reactive({ name: '', companyName: '', email: '', password: '', passwordConfirm: '', acceptTerms: false, website: '' })
const errors = reactive<Record<string, string>>({})
const showPassword = ref(false)
const submitting = ref(false)
const formError = ref('')
const emailTaken = ref(false)
const successHeading = ref<HTMLElement | null>(null)
const done = ref<{ email: string; companyName: string; welcomeEmail: 'sent' | 'queued' | 'failed' | 'not_configured' | 'none' } | null>(null)

function validate(): boolean {
  for (const k of Object.keys(errors)) errors[k] = ''
  if (!form.name.trim()) errors.name = 'Introduce el nombre de tu empresa.'
  if (!EMAIL_RE.test(form.email.trim())) errors.email = 'Introduce un correo electrónico válido.'
  if (form.password.length < MIN) errors.password = `La contraseña debe tener al menos ${MIN} caracteres.`
  if (form.password !== form.passwordConfirm) errors.passwordConfirm = 'Las contraseñas no coinciden.'
  if (!form.acceptTerms) errors.acceptTerms = 'Debes aceptar los términos y la política de privacidad.'
  return !Object.values(errors).some(Boolean)
}

async function focusFirstError() {
  await nextTick()
  document.querySelector<HTMLElement>('[data-testid="register-form"] [aria-invalid="true"]')?.focus()
}

async function submit() {
  if (submitting.value) return // doble clic: una sola petición
  formError.value = ''
  emailTaken.value = false
  if (!validate()) return focusFirstError()
  submitting.value = true
  try {
    const res = await $fetch<{ ok: true; email: string; companyName: string; welcomeEmail: 'sent' | 'queued' | 'failed' | 'not_configured' | 'none' }>('/api/auth/login', {
      method: 'POST',
      body: {
        action: 'register-company',
        name: form.name.trim(),
        companyName: form.companyName.trim(),
        email: form.email.trim(),
        password: form.password,
        passwordConfirm: form.passwordConfirm,
        acceptTerms: form.acceptTerms,
        website: form.website,
      },
    })
    // La contraseña no se queda en memoria más de lo necesario.
    form.password = ''
    form.passwordConfirm = ''
    done.value = { email: res.email, companyName: res.companyName, welcomeEmail: res.welcomeEmail }
    await nextTick()
    successHeading.value?.focus()
  } catch (e: any) {
    const err = e?.data?.error
    if (err?.field) {
      errors[err.field] = err.message
      emailTaken.value = err.field === 'email' && (e?.statusCode ?? e?.status) === 409
      focusFirstError()
    } else if ((e?.statusCode ?? e?.status) === 429) {
      formError.value = 'Se han hecho demasiados registros desde esta conexión. Inténtalo de nuevo más tarde.'
    } else {
      formError.value = e?.data?.statusMessage || 'No se ha podido completar el registro. Inténtalo de nuevo.'
    }
  } finally {
    submitting.value = false
  }
}

const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

// Sólo se dice «te hemos enviado un email» si de verdad salió.
const emailMessage = computed(() => {
  switch (done.value?.welcomeEmail) {
    case 'sent':
      return `Te hemos enviado un email de bienvenida a ${done.value.email}.`
    case 'queued':
      return 'El email de bienvenida está en cola y te llegará en breve. No lo necesitas para entrar.'
    default:
      return 'No hemos podido enviarte el email de bienvenida, pero tu cuenta está lista y puedes entrar ya.'
  }
})
</script>

<template>
  <div class="max-w-3xl">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
      <p class="mt-1 text-sm text-stone-500">{{ user?.name }} · {{ user?.email }}</p>
    </div>

    <AdminPanel title="Verificación en dos pasos" sub="Un código de tu teléfono además de la contraseña, cada vez que entras">
      <div v-if="pending" class="skeleton h-16 rounded-xl" />

      <template v-else-if="status">
        <!-- Sin clave de cifrado en el Worker: se dice, no se finge -->
        <div v-if="!status.available" class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" data-testid="totp-unavailable">
          La verificación en dos pasos no está disponible en esta instalación: falta el secreto <code class="rounded bg-amber-100 px-1">TOTP_ENCRYPTION_KEY</code> en el Worker. Quien administre la plataforma puede verlo en Sistema → Estado del sistema.
        </div>

        <!-- Activo -->
        <div v-else-if="status.enabled" data-testid="totp-enabled">
          <div class="flex flex-wrap items-center gap-3">
            <span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">Activa</span>
            <p class="text-sm text-stone-600">Desde {{ dt.relative(status.enabledAt!) }}. Te quedan <strong>{{ status.recoveryCodesLeft }}</strong> códigos de recuperación.</p>
          </div>
          <p v-if="status.recoveryCodesLeft <= 2" class="mt-2 text-sm text-amber-700">Quedan pocos códigos de recuperación: genera unos nuevos antes de quedarte sin ninguno.</p>

          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <form class="rounded-xl border border-line p-4" @submit.prevent="regenerate">
              <p class="text-sm font-medium">Códigos de recuperación nuevos</p>
              <p class="mt-1 text-xs text-stone-500">Los anteriores dejarán de valer.</p>
              <input v-model="regenPassword" type="password" class="cfg-input mt-3" placeholder="Tu contraseña" autocomplete="current-password" required >
              <button type="submit" class="dash-btn-primary mt-3" :disabled="busy">Generar</button>
            </form>
            <form class="rounded-xl border border-line p-4" @submit.prevent="disable">
              <p class="text-sm font-medium">Desactivar</p>
              <p class="mt-1 text-xs text-stone-500">Hace falta la contraseña y un código válido.</p>
              <input v-model="disablePassword" type="password" class="cfg-input mt-3" placeholder="Tu contraseña" autocomplete="current-password" required >
              <input v-model="disableCode" class="cfg-input mt-2 font-mono" placeholder="Código de la app o de recuperación" required data-testid="totp-disable-code" >
              <button type="submit" class="mt-3 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50" :disabled="busy" data-testid="totp-disable">Desactivar</button>
            </form>
          </div>
        </div>

        <!-- Inactivo: alta en dos pasos -->
        <div v-else data-testid="totp-disabled">
          <div v-if="!setup" class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-stone-600">
              Con la verificación en dos pasos, una contraseña filtrada no basta para entrar: hace falta también el código que genera tu app de autenticación (Google Authenticator, Authy, 1Password, Bitwarden…).
            </p>
            <button type="button" class="dash-btn-primary" :disabled="busy" data-testid="totp-start" @click="start">Activar</button>
          </div>

          <div v-else class="grid gap-6 sm:grid-cols-[200px_1fr]">
            <div class="rounded-xl border border-line bg-white p-3" data-testid="totp-qr" v-html="setup.qrSvg" />
            <form class="space-y-3" @submit.prevent="confirm">
              <p class="text-sm text-stone-600">1. Escanea el código con tu app de autenticación, o introduce esta clave a mano:</p>
              <code class="block break-all rounded-lg bg-stone-100 px-3 py-2 font-mono text-xs" data-testid="totp-secret">{{ setup.secret }}</code>
              <p class="text-sm text-stone-600">2. Escribe el código de 6 dígitos que te muestra para confirmar:</p>
              <input v-model="confirmCode" class="cfg-input font-mono tracking-[0.2em]" inputmode="numeric" maxlength="6" placeholder="123456" required data-testid="totp-confirm-code" >
              <div class="flex items-center gap-3">
                <button type="submit" class="dash-btn-primary" :disabled="busy" data-testid="totp-confirm">Confirmar y activar</button>
                <button type="button" class="text-sm text-stone-500 hover:underline" @click="setup = null">Cancelar</button>
              </div>
            </form>
          </div>
        </div>

        <!-- Códigos de recuperación: la única vez que existen en claro -->
        <div v-if="recoveryCodes.length" class="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="totp-recovery-codes">
          <p class="text-sm font-semibold text-amber-900">Guarda estos códigos de recuperación ahora</p>
          <p class="mt-1 text-xs text-amber-800">Cada uno vale una sola vez y sirven para entrar si pierdes el teléfono. No se volverán a mostrar.</p>
          <ul class="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm text-amber-900 sm:grid-cols-3">
            <li v-for="c in recoveryCodes" :key="c">{{ c }}</li>
          </ul>
          <button type="button" class="mt-3 text-xs font-medium text-amber-900 underline" @click="copyCodes">Copiar</button>
        </div>

        <p v-if="error" class="mt-4 text-sm font-medium text-red-600" data-testid="totp-page-error">{{ error }}</p>
      </template>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
/**
 * Seguridad de la PROPIA cuenta. No tiene área de permisos a propósito: un
 * admin restringido a una sola área tiene que poder proteger su cuenta
 * igual. La API (/api/auth/totp/*) sólo opera sobre quien llama.
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Mi cuenta — M&M Real Estate' })

const { user } = useAuth()
const dt = useDash()
const toast = useToast()

interface TwoFactorStatus {
  available: boolean
  enabled: boolean
  enabledAt: string | null
  pending: boolean
  recoveryCodesLeft: number
}
const { data: status, pending, refresh } = await useFetch<TwoFactorStatus>('/api/auth/totp/status')

const busy = ref(false)
const error = ref('')
const setup = ref<{ secret: string; otpauthUrl: string; qrSvg: string } | null>(null)
const confirmCode = ref('')
const recoveryCodes = ref<string[]>([])
const regenPassword = ref('')
const disablePassword = ref('')
const disableCode = ref('')

function fail(e: any, fallback: string) {
  error.value = e?.data?.statusMessage || e?.statusMessage || fallback
}

async function start() {
  busy.value = true
  error.value = ''
  try {
    setup.value = await $fetch<{ secret: string; otpauthUrl: string; qrSvg: string }>('/api/auth/totp/setup', { method: 'POST' })
  } catch (e: any) {
    fail(e, 'No se pudo iniciar la activación')
  } finally {
    busy.value = false
  }
}

async function confirm() {
  busy.value = true
  error.value = ''
  try {
    const res = await $fetch<{ recoveryCodes: string[] }>('/api/auth/totp/enable', { method: 'POST', body: { code: confirmCode.value } })
    recoveryCodes.value = res.recoveryCodes
    setup.value = null
    confirmCode.value = ''
    await refresh()
    toast.success('Verificación en dos pasos activada')
  } catch (e: any) {
    fail(e, 'El código no es correcto')
  } finally {
    busy.value = false
  }
}

async function regenerate() {
  busy.value = true
  error.value = ''
  try {
    const res = await $fetch<{ recoveryCodes: string[] }>('/api/auth/totp/recovery-codes', { method: 'POST', body: { password: regenPassword.value } })
    recoveryCodes.value = res.recoveryCodes
    regenPassword.value = ''
    await refresh()
  } catch (e: any) {
    fail(e, 'No se pudieron generar los códigos')
  } finally {
    busy.value = false
  }
}

async function disable() {
  if (!confirm2()) return
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/totp/disable', { method: 'POST', body: { password: disablePassword.value, code: disableCode.value } })
    disablePassword.value = ''
    disableCode.value = ''
    recoveryCodes.value = []
    await refresh()
    toast.success('Verificación en dos pasos desactivada')
  } catch (e: any) {
    fail(e, 'No se pudo desactivar')
  } finally {
    busy.value = false
  }
}

function confirm2() {
  return window.confirm('Sin el segundo factor, la contraseña vuelve a ser lo único que protege esta cuenta. ¿Desactivar?')
}

async function copyCodes() {
  try {
    await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
    toast.success('Códigos copiados')
  } catch {
    toast.error('No se pudo copiar; apúntalos a mano')
  }
}
</script>

<style scoped>
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
.dash-btn-primary {
  @apply inline-flex items-center justify-center rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50;
}
</style>

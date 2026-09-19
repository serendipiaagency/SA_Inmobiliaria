<template>
  <form class="space-y-5" @submit.prevent="submit">
    <div>
      <p class="text-sm text-stone-600">
        {{ useRecovery ? 'Introduce uno de tus códigos de recuperación.' : 'Introduce el código de 6 dígitos de tu app de autenticación.' }}
      </p>
      <label class="label mt-4" for="totp-code">{{ useRecovery ? 'Código de recuperación' : 'Código' }}</label>
      <input
        id="totp-code"
        v-model="code"
        class="input font-mono tracking-[0.2em]"
        :inputmode="useRecovery ? 'text' : 'numeric'"
        :autocomplete="useRecovery ? 'off' : 'one-time-code'"
        :placeholder="useRecovery ? 'XXXXX-XXXXX' : '123456'"
        :maxlength="useRecovery ? 11 : 6"
        required
        autofocus
        data-testid="totp-code"
      >
    </div>
    <button type="submit" class="btn-primary w-full" :disabled="loading" data-testid="totp-submit">
      {{ loading ? 'Comprobando…' : 'Entrar' }}
    </button>
    <p v-if="error" class="text-center text-sm font-medium text-red-600" data-testid="totp-error">{{ error }}</p>
    <p class="text-center text-sm">
      <button type="button" class="text-stone-500 hover:underline" @click="toggleRecovery">
        {{ useRecovery ? 'Usar la app de autenticación' : '¿No tienes el teléfono? Usa un código de recuperación' }}
      </button>
    </p>
  </form>
</template>

<script setup lang="ts">
/**
 * Segundo paso del login cuando la cuenta tiene 2FA: el mismo formulario en
 * /login y en /admin/login. Recibe el desafío que devolvió la contraseña y
 * emite el usuario cuando el código entra; los motivos de fallo que da el
 * servidor (caducado, demasiados intentos) se traducen a algo que ayude a
 * saber si hay que volver a empezar por la contraseña.
 */
const props = defineProps<{ challenge: string }>()
const emit = defineEmits<{ success: [payload: { method: 'totp' | 'recovery'; recoveryCodesLeft?: number }]; restart: [] }>()

const { verifyTotp } = useAuth()
const code = ref('')
const useRecovery = ref(false)
const loading = ref(false)
const error = ref('')

function toggleRecovery() {
  useRecovery.value = !useRecovery.value
  code.value = ''
  error.value = ''
}

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const res = await verifyTotp(props.challenge, code.value)
    emit('success', { method: res.method, recoveryCodesLeft: res.recoveryCodesLeft })
  } catch (e: any) {
    const reason = e?.data?.data?.reason || e?.data?.statusMessage
    if (reason === 'expired' || reason === 'invalid_challenge') {
      error.value = 'El tiempo para introducir el código ha pasado. Vuelve a introducir tu contraseña.'
      emit('restart')
    } else if (reason === 'too_many_attempts') {
      error.value = 'Demasiados códigos incorrectos. Vuelve a introducir tu contraseña para empezar de nuevo.'
      emit('restart')
    } else if (e?.statusCode === 429 || e?.status === 429) {
      error.value = 'Demasiados intentos desde esta conexión. Espera unos minutos.'
    } else {
      error.value = useRecovery.value ? 'Ese código de recuperación no es válido o ya se ha usado.' : 'Código incorrecto. Comprueba la hora del teléfono y prueba con el siguiente.'
    }
  } finally {
    loading.value = false
  }
}
</script>

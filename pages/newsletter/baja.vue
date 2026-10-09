<template>
  <div class="mx-auto max-w-xl px-6 py-24 text-center lg:py-32" data-testid="newsletter-unsubscribe">
    <p class="eyebrow">{{ t('newsletter.unsubscribe.eyebrow', 'Newsletter') }}</p>
    <template v-if="state === 'done'">
      <h1 class="heading-serif mt-3 text-3xl md:text-4xl" data-testid="newsletter-unsubscribe-done">{{ t('newsletter.unsubscribe.doneTitle', 'Te has dado de baja') }}</h1>
      <p class="mt-4 text-stone-500">{{ t('newsletter.unsubscribe.doneText', 'Ya no recibirás nuestras novedades. Puedes volver a suscribirte cuando quieras desde el pie de la web.') }}</p>
      <NuxtLink to="/" class="btn-primary mt-8">{{ t('newsletter.unsubscribe.home', 'Volver a la web') }}</NuxtLink>
    </template>
    <template v-else-if="!token || state === 'invalid'">
      <h1 class="heading-serif mt-3 text-3xl md:text-4xl">{{ t('newsletter.unsubscribe.invalidTitle', 'Este enlace no es válido') }}</h1>
      <p class="mt-4 text-stone-500" data-testid="newsletter-unsubscribe-invalid">
        {{ t('newsletter.unsubscribe.invalidText', 'Puede que esté incompleto. Si quieres darte de baja, escríbenos y lo hacemos por ti.') }}
      </p>
      <NuxtLink to="/contacto" class="btn-primary mt-8">{{ t('nav.contact', 'Contacto') }}</NuxtLink>
    </template>
    <template v-else>
      <h1 class="heading-serif mt-3 text-3xl md:text-4xl">{{ t('newsletter.unsubscribe.title', 'Darse de baja de las novedades') }}</h1>
      <p class="mt-4 text-stone-500">
        {{ companyName ? t('newsletter.unsubscribe.text', 'Dejarás de recibir las novedades de {name}.').replace('{name}', companyName) : t('newsletter.unsubscribe.textGeneric', 'Dejarás de recibir nuestras novedades.') }}
      </p>
      <button type="button" class="btn-primary mt-8" :disabled="state === 'sending'" data-testid="newsletter-unsubscribe-confirm" @click="confirm">
        {{ state === 'sending' ? t('newsletter.unsubscribe.sending', 'Un momento…') : t('newsletter.unsubscribe.confirm', 'Confirmar la baja') }}
      </button>
      <p v-if="state === 'error'" class="mt-4 text-sm text-rose-700" role="alert">{{ t('newsletter.unsubscribe.error', 'No se pudo completar. Inténtalo de nuevo en unos minutos.') }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * /newsletter/baja?token=… — darse de baja del newsletter de la inmobiliaria
 * (server/utils/newsletter.ts). Hace falta pulsar «Confirmar la baja»: abrir
 * el enlace no basta, para que los antivirus del correo que «visitan» los
 * enlaces no den de baja a nadie sin querer.
 */
const { t } = useI18n()
const route = useRoute()
const { tenant, load } = useTenant()
await load()
const companyName = computed(() => tenant.value?.companyName || tenant.value?.name || '')
const token = computed(() => (typeof route.query.token === 'string' && /^[0-9a-f]{48}$/.test(route.query.token) ? route.query.token : ''))
const state = ref<'idle' | 'sending' | 'done' | 'invalid' | 'error'>('idle')

async function confirm() {
  state.value = 'sending'
  try {
    await $fetch('/api/public/newsletter', { method: 'POST', body: { action: 'unsubscribe', token: token.value } })
    state.value = 'done'
  } catch (e: any) {
    state.value = (e?.statusCode || e?.response?.status) === 404 ? 'invalid' : 'error'
  }
}

useHead({ title: t('newsletter.unsubscribe.title', 'Darse de baja de las novedades'), meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
</script>

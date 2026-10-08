<template>
  <SitePageLayout :page="sitePage" :home-data="sitePageData">
    <div class="mx-auto max-w-xl px-4 py-14">
      <h1 class="heading-serif text-4xl">{{ t('contact.title', 'Contáctanos') }}</h1>
      <p class="mt-2 text-stone-500">{{ t('contact.subtitle', 'Envíanos un mensaje y te responderemos en breve.') }}</p>

      <form class="card mt-10 space-y-5 p-8" @submit.prevent="submit">
        <div>
          <label class="label">{{ t('contact.form.nameLabel', 'Nombre *') }}</label>
          <input v-model="form.name" class="input" required >
        </div>
        <div>
          <label class="label">{{ t('contact.form.emailLabel', 'Email *') }}</label>
          <input v-model="form.email" type="email" class="input" required >
        </div>
        <div>
          <label class="label">{{ t('contact.form.phoneLabel', 'Teléfono') }}</label>
          <input v-model="form.phone" class="input" >
        </div>
        <div>
          <label class="label">{{ t('contact.form.subjectLabel', 'Asunto') }}</label>
          <input v-model="form.subject" class="input" >
        </div>
        <div>
          <label class="label">{{ t('contact.form.messageLabel', 'Mensaje *') }}</label>
          <textarea v-model="form.message" class="input" rows="5" required />
        </div>
        <button type="submit" class="btn-primary w-full" :disabled="sending">
          {{ sending ? t('contact.form.sending', 'Enviando…') : t('contact.form.submit', 'Enviar mensaje') }}
        </button>
        <p v-if="sent" class="text-center text-sm font-medium text-ink">{{ t('contact.form.success', 'Mensaje enviado — ¡gracias!') }}</p>
        <p v-if="error" class="text-center text-sm font-medium text-red-600">{{ error }}</p>
      </form>
    </div>
  </SitePageLayout>
</template>

<script setup lang="ts">
const { t } = useI18n()
// Cierre del núcleo (FASE 15): el lead llega con el idioma de quien escribe, para el enrutado por idioma.
const visitorLanguage = useVisitorLanguage()
// Con versión publicada en el Constructor Web (página «Contacto»), la página
// es la que la inmobiliaria ha montado allí; sin ella, la de siempre.
const { page: sitePage, homeData: sitePageData } = await useSitePage('contacto')
useHead(
  seoHead({
    title: sitePage.value?.seo?.title || 'Contact us — M&M Real Estate',
    description: sitePage.value?.seo?.description || 'Ponte en contacto con el equipo de M&M Real Estate para resolver tus dudas sobre cualquier propiedad.',
  }),
)
const form = reactive({ name: '', email: '', phone: '', subject: '', message: '' })
const sending = ref(false)
const sent = ref(false)
const error = ref('')

async function submit() {
  sending.value = true
  sent.value = false
  error.value = ''
  try {
    await $fetch('/api/public/contact', { method: 'POST', body: { ...form, type: 'contact', language: visitorLanguage() } })
    sent.value = true
    Object.assign(form, { name: '', email: '', phone: '', subject: '', message: '' })
  } catch (e: any) {
    error.value = e?.statusMessage || t('contact.form.error', 'Algo salió mal. Por favor, inténtalo de nuevo.')
  } finally {
    sending.value = false
  }
}
</script>

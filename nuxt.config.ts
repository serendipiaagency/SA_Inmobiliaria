export default defineNuxtConfig({
  compatibilityDate: '2026-06-01',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss', 'nitro-cloudflare-dev'],
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: false,
      nodeCompat: true,
    },
  },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'SA Inmobiliaria — Property Marketplace',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Real estate marketplace: browse off-plan projects, secondary sales, communities and developers.',
        },
      ],
    },
  },
})

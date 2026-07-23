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
    experimental: { tasks: true },
    // Matches the crons in wrangler.toml's [triggers] — hourly is enough
    // precision for auto-hiding an expired article; the Publication
    // Scheduler dispatcher needs per-minute granularity to hit staged-launch
    // offsets (e.g. "+2 min", "+5 min") on time.
    scheduledTasks: {
      '0 * * * *': ['cms:expire-articles'],
      '* * * * *': ['scheduler:dispatch'],
    },
  },
  css: [
    '~/assets/css/main.css',
    'leaflet/dist/leaflet.css',
    'leaflet.markercluster/dist/MarkerCluster.css',
    'leaflet.markercluster/dist/MarkerCluster.Default.css',
  ],
  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      title: 'M&M Real Estate — Property Marketplace',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Real estate marketplace: browse off-plan projects, secondary sales, communities and developers.',
        },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap',
        },
      ],
    },
  },
})

import { visualizer } from 'rollup-plugin-visualizer'

export default defineNuxtConfig({
  compatibilityDate: '2026-06-01',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss', 'nitro-cloudflare-dev', '@nuxt/eslint'],
  // Real bundle-size visibility (P2, docs/production-hardening-audit.md) —
  // opt-in via `npm run analyze` (ANALYZE=1) so a normal build/deploy never
  // pays for it. Hooked in via `vite:extendConfig` (rather than the static
  // `vite.plugins` key) since that's the reliable way to add a plugin to
  // Nuxt's client build specifically — Nitro's server bundle is a separate
  // Rollup pass outside Vite, and client size is what matters for page-load
  // performance, which is what this is auditing.
  hooks: {
    'vite:extendConfig'(viteConfig, { isClient }) {
      if (!process.env.ANALYZE || !isClient) return
      viteConfig.plugins?.push(visualizer({ filename: '.output/bundle-analysis.html', gzipSize: true, brotliSize: true, template: 'treemap' }))
    },
  },
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
    // offsets (e.g. "+2 min", "+5 min") on time. Appointment reminders piggyback
    // on that same per-minute tick — a ±30min window plus a sent-once guard
    // column means it never needs its own cron entry.
    scheduledTasks: {
      '0 * * * *': ['cms:expire-articles', 'system:cleanup-error-logs', 'marketing:saved-search-alerts', 'payments:reconcile-deposits', 'notifications:retry-email-queue', 'notifications:retry-webhook-queue'],
      '* * * * *': ['scheduler:dispatch', 'appointments:reminders'],
      '30 3 * * *': ['system:backup-d1'],
      // Runs after the D1 backup — purges media past its 30-day soft-delete
      // grace period and reconciles per-tenant storage usage.
      '0 5 * * *': ['system:media-lifecycle'],
      '0 4 * * 1': ['scheduler:recompute-ai-time'],
    },
  },
  // Leaflet's CSS is NOT here — see the import inside each
  // LocationPicker.client.vue/EmbedMiniMap.client.vue/MapExplorer.client.vue
  // for why (docs/production-hardening-audit.md).
  css: ['~/assets/css/main.css'],
  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      // Static build-time fallback only — every real page overrides this via
      // its own useHead() with the resolved tenant's name (useTenant()).
      title: 'Portal Inmobiliario',
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
          // Playfair Display dropped — headings now use bold Inter (see
          // tailwind.config.js `serif` token) instead of a serif face.
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
        },
      ],
    },
  },
})

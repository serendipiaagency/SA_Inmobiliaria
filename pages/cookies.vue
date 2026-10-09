<template>
  <div>
    <section class="border-b border-line bg-white">
      <div class="mx-auto max-w-screen-2xl px-6 py-20 text-center lg:px-10">
        <p class="eyebrow">Legal</p>
        <h1 class="heading-serif mx-auto mt-4 max-w-2xl text-5xl leading-tight">Política de cookies</h1>
        <p class="mt-4 text-sm text-stone-400">Última actualización: {{ lastUpdated }} · versión {{ version }}</p>
      </div>
    </section>

    <div class="mx-auto max-w-3xl space-y-10 px-6 py-20 text-[15px] leading-[1.9] text-stone-600 lg:px-0" data-testid="cookie-policy">
      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">1. Qué son y quién es el responsable</h2>
        <p>
          Las cookies y el almacenamiento del navegador son pequeños datos que una web guarda en tu dispositivo. Esta
          política explica cuáles usa la web de {{ companyName }}, para qué y cuánto duran. Responsable:
          {{ tenant?.legalCompanyName || companyName }}<template v-if="tenant?.taxId"> ({{ tenant.taxId }})</template><template v-if="tenant?.legalAddress">, {{ tenant.legalAddress }}</template><template v-if="tenant?.legalEmail">, {{ tenant.legalEmail }}</template>.
          Más sobre tus datos en la <NuxtLink to="/privacidad" class="underline hover:text-ink">política de privacidad</NuxtLink>.
        </p>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">2. Necesarias (siempre activas)</h2>
        <p>Hacen que la web funcione y recuerdan lo que tú eliges. No necesitan consentimiento y no sirven para seguirte.</p>
        <CookieTable :rows="necessary" />
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">3. Analíticas (con tu permiso)</h2>
        <p>
          Nos dicen qué inmuebles interesan y de dónde llegan las consultas. Si no las aceptas, la visita a una ficha se
          cuenta igualmente, pero sin cookie y sin identificar tu navegador.
        </p>
        <CookieTable :rows="analytics" />
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">4. Contenido de terceros (con tu permiso)</h2>
        <p>
          Vídeos y publicaciones de redes sociales incrustados en las fichas y en el blog. Hasta que lo aceptes, en su
          lugar verás un aviso con un enlace para verlos en el sitio del proveedor.
        </p>
        <CookieTable :rows="thirdParty" />
      </section>

      <section v-if="providers.metaPixel">
        <h2 class="heading-serif mb-3 text-2xl text-ink">5. Publicidad (con tu permiso)</h2>
        <p>Miden la eficacia de los anuncios de esta agencia y permiten mostrarte anuncios relacionados.</p>
        <CookieTable :rows="marketing" />
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">{{ providers.metaPixel ? 6 : 5 }}. Servicios que no guardan cookies</h2>
        <p>
          Para mostrar la web se cargan tipografías de Google Fonts, los mapas (OpenStreetMap, CARTO o Esri, según la
          capa) y algunas fotografías de Unsplash. Esos servicios reciben tu dirección IP al servirlas, como cualquier
          servidor web, pero no guardan cookies en tu dispositivo.
        </p>
      </section>

      <section>
        <h2 class="heading-serif mb-3 text-2xl text-ink">{{ providers.metaPixel ? 7 : 6 }}. Cómo cambiar o retirar tu consentimiento</h2>
        <p>
          Cuando quieras, desde «Configurar cookies» al pie de cada página o con este botón. Si retiras una categoría,
          borramos sus cookies de este sitio. También puedes borrarlas desde la configuración de tu navegador.
          Volveremos a preguntarte si cambian los servicios que usa esta web.
        </p>
        <button type="button" class="btn-secondary mt-5" data-testid="cookie-policy-configure" @click="openSettings">Configurar cookies</button>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { consentVersion, NO_COOKIE_PROVIDERS } from '~/utils/cookieConsent'

/**
 * Política de cookies de la web de cada agencia: con SUS datos legales y SUS
 * proveedores (Constructor Web → Cookies). Lo que se lista es lo que la web
 * usa de verdad — mismo inventario que las categorías del aviso
 * (utils/cookieConsent.ts) —, no una plantilla genérica.
 */
interface Row {
  name: string
  owner: string
  purpose: string
  duration: string
}

const CookieTable = defineComponent({
  props: { rows: { type: Array as PropType<Row[]>, required: true } },
  setup(props) {
    return () =>
      h('div', { class: 'mt-4 overflow-x-auto rounded-xl border border-line' }, [
        h('table', { class: 'w-full min-w-[560px] text-left text-[13px] leading-relaxed' }, [
          h('thead', { class: 'bg-stone-50 text-[11px] uppercase tracking-widest text-stone-500' }, [
            h('tr', ['Nombre', 'De quién', 'Para qué', 'Duración'].map((c) => h('th', { class: 'px-4 py-2.5 font-semibold' }, c))),
          ]),
          h(
            'tbody',
            props.rows.map((r) =>
              h('tr', { class: 'border-t border-line align-top' }, [
                h('td', { class: 'px-4 py-3 font-mono text-[12px] text-ink' }, r.name),
                h('td', { class: 'px-4 py-3' }, r.owner),
                h('td', { class: 'px-4 py-3' }, r.purpose),
                h('td', { class: 'px-4 py-3 whitespace-nowrap' }, r.duration),
              ]),
            ),
          ),
        ]),
      ])
  },
})

const { tenant, load: loadTenant } = useTenant()
await loadTenant()
const companyName = computed(() => tenant.value?.companyName || tenant.value?.name || '')
const providers = computed(() => tenant.value?.cookies ?? NO_COOKIE_PROVIDERS)
const version = computed(() => consentVersion(providers.value))
const { openSettings } = useCookieConsent()

const own = computed(() => `Esta web (${companyName.value})`)
const necessary = computed<Row[]>(() => [
  { name: 'locale, locale_chosen', owner: own.value, purpose: 'El idioma que eliges para ver la web.', duration: '1 año' },
  { name: 'display_currency', owner: own.value, purpose: 'La moneda en la que eliges ver los precios.', duration: '1 año' },
  { name: 'inmo_cookie_consent', owner: own.value, purpose: 'Tu elección en este aviso de cookies (almacenamiento del navegador).', duration: 'Hasta que la cambies' },
  { name: 'sa_favorites, sa_compare, sa_saved_searches', owner: own.value, purpose: 'Tus favoritos, el comparador y tus búsquedas guardadas, sólo en tu navegador.', duration: 'Hasta que los borres' },
  { name: 'inmo-webchat-v1', owner: own.value, purpose: 'La conversación del chat de la web, si lo usas.', duration: 'Hasta que la cierres' },
  { name: 'site_preview', owner: own.value, purpose: 'Sólo para el equipo de la agencia: ver la web en vista previa.', duration: 'Sesión' },
])
const analytics = computed<Row[]>(() => [
  { name: 'sa_visitor', owner: own.value, purpose: 'Identificador aleatorio para contar una sola vez tus visitas a cada inmueble y cuántas personas lo guardan en favoritos.', duration: '2 años' },
  { name: 'sa_ft', owner: own.value, purpose: 'De qué campaña o web llegaste, para atribuir tu consulta si nos escribes.', duration: '30 días' },
  ...(providers.value.ga4
    ? [{ name: '_ga, _ga_*', owner: 'Google Ireland Ltd. (Google Analytics 4)', purpose: 'Estadísticas de uso de la web: páginas vistas, origen de las visitas, dispositivo.', duration: '2 años' }]
    : []),
])
const thirdParty: Row[] = [
  { name: 'YouTube', owner: 'Google Ireland Ltd.', purpose: 'Reproductor de vídeo en su modo sin cookies (youtube-nocookie.com); al reproducir puede guardar datos en tu navegador.', duration: 'Según YouTube' },
  { name: 'Vimeo', owner: 'Vimeo.com, Inc.', purpose: 'Reproductor de vídeo con «no rastrear» activado.', duration: 'Según Vimeo' },
  { name: 'Instagram', owner: 'Meta Platforms Ireland Ltd.', purpose: 'Publicaciones de Instagram incrustadas.', duration: 'Según Instagram' },
  { name: 'TikTok', owner: 'TikTok Technology Ltd.', purpose: 'Vídeos de TikTok incrustados.', duration: 'Según TikTok' },
]
const marketing = computed<Row[]>(() => [{ name: '_fbp', owner: 'Meta Platforms Ireland Ltd. (píxel de Meta)', purpose: 'Medir las visitas que llegan desde anuncios de Facebook e Instagram y mostrar anuncios relacionados.', duration: '3 meses' }])

useHead({
  title: `Política de cookies — ${companyName.value}`,
  meta: [{ name: 'description', content: `Qué cookies usa la web de ${companyName.value}, para qué y cómo cambiar tu elección.` }],
})
const lastUpdated = '9 de octubre de 2026'
</script>

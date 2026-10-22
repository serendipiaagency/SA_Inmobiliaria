/**
 * Chrome del SaaS «Portal INMO» (Cola 28): fija el título de pestaña con la
 * marca de la PLATAFORMA y el favicon propio del SaaS, SIN tocar el de las
 * webs públicas de las agencias.
 *
 * El favicon global (`/favicon.svg`, en nuxt.config) lo comparten todas las
 * webs; para que SÓLO el SaaS lleve el suyo se inyecta aquí un `<link
 * rel="icon">` a `/portal-inmo.svg` con una clave de deduplicación: al
 * renderizarse después del de nuxt.config, es el que usa el navegador. Las
 * webs de agencia, que no llaman a esto, conservan `/favicon.svg`.
 *
 * `title` ya viene con la marca (p. ej. «Acceder — Portal INMO»): este
 * composable no la añade, para que cada superficie controle su propio título.
 */
export const PORTAL_INMO_BRAND = 'Portal INMO'
export const PORTAL_INMO_FAVICON = '/portal-inmo.svg'

export function usePortalInmoChrome(title: string) {
  useHead({
    title,
    link: [{ rel: 'icon', type: 'image/svg+xml', href: PORTAL_INMO_FAVICON, key: 'portal-inmo-favicon' }],
  })
}

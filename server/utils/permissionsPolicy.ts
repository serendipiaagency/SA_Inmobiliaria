/**
 * `Permissions-Policy` de cada documento (server/middleware/security-headers.ts).
 *
 * Micrófono y cámara, cerrados siempre. La geolocalización se abre SÓLO para
 * el propio origen (`self`) y SÓLO en la web pública: la usa «Mi ubicación»
 * de «Buscar cerca de aquí» en /mapa (FASE 2). Por qué es seguro:
 *  - el navegador sólo la da tras pulsar el botón y aceptar su aviso;
 *  - `self` deja fuera a todo iframe de terceros que la web incrusta
 *    (YouTube, Vimeo, Instagram, TikTok): ninguno puede pedirla;
 *  - la posición no sale del navegador sin redondear a ~110 m (3 decimales,
 *    la cuadrícula mínima de la ubicación aproximada) y sólo como centro de la
 *    búsqueda: no se guarda en ningún sitio que no sea la URL de esa búsqueda.
 * Se abre en toda la web pública y no sólo en /mapa porque a /mapa se llega
 * casi siempre navegando dentro de la propia web, y en esa navegación manda
 * la cabecera del primer documento cargado.
 *
 * El panel (/admin) y el widget incrustable (/embed, que vive dentro de webs
 * ajenas) la siguen teniendo cerrada: allí no hay nada que la use.
 */
export function permissionsPolicyFor(path: string): string {
  const publicSite = !path.startsWith('/admin') && !path.startsWith('/embed') && !path.startsWith('/api/')
  return `geolocation=${publicSite ? '(self)' : '()'}, microphone=(), camera=()`
}

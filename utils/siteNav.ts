/**
 * El menú principal de las webs de las inmobiliarias: una sola lista para la
 * cabecera de escritorio, el menú del móvil y el lienzo del Constructor Web
 * (que pinta la misma cabecera). Cambiar el menú es cambiar esta lista.
 *
 * Los textos son claves de i18n con su texto en español: «Comprar
 * Propiedad», «Vender Propiedad», «Mapa», «Sobre nosotros» y «Blog». Las
 * mayúsculas las pone el CSS de la cabecera.
 *
 * Los destinos son páginas que ya existen:
 *  - Comprar Propiedad: el catálogo, sólo lo que está en venta (`operacion`,
 *    server/api/public/properties.get.ts);
 *  - Vender Propiedad: la página para propietarios (`/vender`, editable en el
 *    Constructor, con un formulario que crea el lead de captación);
 *  - Mapa, Sobre nosotros y Blog: `/mapa`, `/nosotros` y `/blog`.
 *
 * Contacto no va aquí: es el botón con borde de la derecha de la cabecera.
 */

export interface PublicNavItem {
  key: string
  to: string
  i18nKey: string
  /** El texto en español (y el de reserva si falta la traducción). */
  label: string
}

export const PUBLIC_NAV: PublicNavItem[] = [
  { key: 'buy', to: '/propiedades?operacion=venta', i18nKey: 'nav.buy', label: 'Comprar Propiedad' },
  { key: 'sell', to: '/vender', i18nKey: 'nav.sell', label: 'Vender Propiedad' },
  { key: 'map', to: '/mapa', i18nKey: 'nav.map', label: 'Mapa' },
  { key: 'about', to: '/nosotros', i18nKey: 'nav.about', label: 'Sobre nosotros' },
  { key: 'blog', to: '/blog', i18nKey: 'nav.blog', label: 'Blog' },
]

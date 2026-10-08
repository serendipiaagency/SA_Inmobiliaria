/**
 * Iconos de los datos de una propiedad en la web pública: trazo de 24×24,
 * sin relleno, extremos redondeados — el mismo lenguaje que el resto de
 * iconos en línea del proyecto. Uno por concepto, que se reconozca sin
 * leer la etiqueta (cama → dormitorios, coche → garaje, olas → piscina…).
 *
 * Son marcado SVG fijo de este fichero, nunca datos de la propiedad: se
 * pintan con `v-html` sin riesgo.
 */

const PATHS: Record<string, string> = {
  propertyType: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  bedrooms: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  bathrooms: '<path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.7 3 4 3.7 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M10 5 8 7"/><path d="M2 12h20"/><path d="M7 19v2M17 19v2"/>',
  area: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 16 16 8"/><path d="M11 8h5v5"/><path d="M13 16H8v-5"/>',
  yearBuilt: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 9.5h18"/>',
  status: '<circle cx="8" cy="15" r="4"/><path d="M10.85 12.15 19 4"/><path d="m15.5 7.5 2.5 2.5"/><path d="m13 10 2 2"/>',
  condition: '<path d="M12 3l2.4 1.8 3-.2.8 2.9 2.4 1.8-1 2.8 1 2.8-2.4 1.8-.8 2.9-3-.2L12 21l-2.4-1.8-3 .2-.8-2.9-2.4-1.8 1-2.8-1-2.8 2.4-1.8.8-2.9 3 .2z"/><path d="m9 12 2 2 4-4"/>',
  street: '<path d="M12 21s-7-6.2-7-11.3a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.7" r="2.5"/>',
  floor: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  elevator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m9 9.5 3-3 3 3"/><path d="m9 14.5 3 3 3-3"/>',
  garage: '<path d="M5 17.5H4a1 1 0 0 1-1-1V12l2-5.2A2 2 0 0 1 6.9 5.5h10.2A2 2 0 0 1 19 6.8l2 5.2v4.5a1 1 0 0 1-1 1h-1"/><path d="M3 12h18"/><circle cx="7.5" cy="17.5" r="2"/><circle cx="16.5" cy="17.5" r="2"/><path d="M9.5 17.5h5"/>',
  terrace: '<path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z"/><path d="M12 12v8.5"/><path d="M8.5 21h7"/>',
  garden: '<path d="M12 21v-9"/><path d="M12 12c0-4 2.7-7 7-7 0 4.3-3 7-7 7z"/><path d="M12 14.5c0-3-2.2-5.5-6-5.5 0 3.3 2.5 5.5 6 5.5z"/>',
  pool: '<path d="M9 14V5.5a2 2 0 0 1 4 0"/><path d="M15 14V5.5a2 2 0 0 1 4 0"/><path d="M9 9h6M9 12h6"/><path d="M2 17.5c1.7 1.3 3.3 1.3 5 0s3.3-1.3 5 0 3.3 1.3 5 0 3.3-1.3 5 0"/><path d="M2 21c1.7 1.3 3.3 1.3 5 0s3.3-1.3 5 0 3.3 1.3 5 0 3.3-1.3 5 0"/>',
  storage: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/>',
  plot: '<path d="M5 21V7l2-3 2 3v14"/><path d="M15 21V7l2-3 2 3v14"/><path d="M3 11h18M3 17h18"/>',
  heating: '<path d="M12 21c-3.9 0-7-2.9-7-6.6 0-3.2 2.3-5.3 3.8-7.4.3 1.8 1.2 3 2.6 3.6.2-3.3 1.4-6 3.6-7.6.4 3.4 4 5.6 4 10.6 0 4.4-3.1 7.4-7 7.4z"/>',
  airConditioning: '<path d="M12 2v20"/><path d="M3.3 7l17.4 10"/><path d="M3.3 17 20.7 7"/><path d="m9.5 3.5 2.5 2 2.5-2"/><path d="m9.5 20.5 2.5-2 2.5 2"/>',
  energyRating: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.1-6 2.4-.5 4.9-2 5.9-3"/>',
  orientation: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  pets: '<circle cx="9" cy="5.5" r="1.8"/><circle cx="15" cy="5.5" r="1.8"/><circle cx="5" cy="10.5" r="1.8"/><circle cx="19" cy="10.5" r="1.8"/><path d="M12 12c-2.5 0-5 3-5 5.5 0 1.7 1.3 2.5 2.7 2.5.9 0 1.5-.5 2.3-.5s1.4.5 2.3.5c1.4 0 2.7-.8 2.7-2.5C17 15 14.5 12 12 12z"/>',
  accessible: '<circle cx="16" cy="4" r="1.2"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.4 3.5"/><path d="M4.2 14.5a5 5 0 0 0 6.9 6"/><path d="M13.8 17.5a5 5 0 0 0-6.9-6"/>',
}

export const FEATURE_ICON_KEYS = Object.keys(PATHS)

/** El SVG completo de un icono (o '' si el concepto no tiene icono). Decorativo: la etiqueta va al lado. */
export function featureIconSvg(key: string, size = 18): string {
  const inner = PATHS[key]
  if (!inner) return ''
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`
}

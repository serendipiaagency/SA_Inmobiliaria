/**
 * Iconos de la galería multimedia de la ficha (Cola 5): categorías
 * (fotos, vídeo, plano, 360°, tour…), estancias y controles del visor. Mismo
 * lenguaje que utils/featureIcons.ts: trazo 24×24, sin relleno, extremos
 * redondeados, grosor 1.7. Marcado fijo de este fichero, nunca datos de la
 * propiedad: se pinta con `v-html` sin riesgo. Decorativos: la etiqueta va
 * siempre al lado (o en `aria-label` del botón).
 */

const PATHS: Record<string, string> = {
  // Categorías
  photos: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.2"/><path d="M8 5l1-2h6l1 2"/>',
  images: '<rect x="3" y="7" width="14" height="12" rx="2"/><path d="M7 5h12a2 2 0 0 1 2 2v10"/><path d="m3 16 4-4 3 3 3-3 4 4"/><circle cx="8.5" cy="10.5" r="1.2"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m10 9 5 3-5 3z"/>',
  plan: '<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 11h8M11 3v8M11 11v4M14 21v-6h7"/>',
  pano360: '<ellipse cx="12" cy="12" rx="9" ry="4.5"/><path d="M12 3a9 9 0 0 1 0 18M12 3a9 9 0 0 0 0 18"/><path d="m16.5 15.5 2 1.2-2 1.2"/>',
  tour: '<path d="M4 20c2-6 6-6 8-11"/><circle cx="12" cy="6" r="2.5"/><path d="M12 9c3 3 5 4 8 4"/><path d="m18 11 2 2-2 2"/><path d="M4 20h4"/>',
  renders: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9"/>',
  drone: '<path d="M3 6h5M16 6h5M5.5 6v3M18.5 6v3"/><path d="M8 12h8l-1 5H9z"/><path d="M5.5 9h13"/>',
  night: '<path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z"/>',
  compare: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 3v18"/><path d="m8 9-2 3 2 3M16 9l2 3-2 3"/>',
  staging: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2z"/><path d="M18 2l.8 1.7 1.7.8-1.7.8L18 7l-.8-1.7-1.7-.8 1.7-.8z"/>',
  social: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/>',
  // Estancias
  living: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2z"/><path d="M5 18v2M19 18v2"/>',
  kitchen: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><circle cx="7.5" cy="6" r=".6"/><circle cx="11" cy="6" r=".6"/><rect x="7" y="12.5" width="10" height="5" rx="1"/>',
  dining: '<path d="M7 3v7a2 2 0 0 0 2 2v9M5 3v4M9 3v4"/><path d="M17 3c-2 0-3 2.5-3 5s1 4 3 4v9"/>',
  bedroom: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  bathroom: '<path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.7 3 4 3.7 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M10 5 8 7"/><path d="M2 12h20"/><path d="M7 19v2M17 19v2"/>',
  office: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20M12 16v4"/>',
  hall: '<rect x="6" y="3" width="12" height="18" rx="1.5"/><circle cx="14.5" cy="12" r=".9"/><path d="M6 21h12"/>',
  laundry: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4.5"/><path d="M4 8h16M8 5.5h.01M11 5.5h.01"/><path d="M8.5 13c1.5-1 2.5 1 3.5 0s2-1 3.5 0"/>',
  terrace: '<path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z"/><path d="M12 12v8.5"/><path d="M8.5 21h7"/>',
  balcony: '<path d="M3 11h18"/><path d="M5 11v9M9 11v9M15 11v9M19 11v9M3 20h18"/><path d="M12 11V4"/>',
  garden: '<path d="M12 21v-9"/><path d="M12 12c0-4 2.7-7 7-7 0 4.3-3 7-7 7z"/><path d="M12 14.5c0-3-2.2-5.5-6-5.5 0 3.3 2.5 5.5 6 5.5z"/>',
  pool: '<path d="M9 14V5.5a2 2 0 0 1 4 0"/><path d="M15 14V5.5a2 2 0 0 1 4 0"/><path d="M9 9h6M9 12h6"/><path d="M2 17.5c1.7 1.3 3.3 1.3 5 0s3.3-1.3 5 0 3.3 1.3 5 0 3.3-1.3 5 0"/><path d="M2 21c1.7 1.3 3.3 1.3 5 0s3.3-1.3 5 0 3.3 1.3 5 0 3.3-1.3 5 0"/>',
  exterior: '<circle cx="17" cy="7" r="2.5"/><path d="M17 2v1.2M17 10.8V12M22 7h-1.2M13.2 7H12"/><path d="M3 21V11l6-5 6 5v10"/><path d="M7 21v-5h4v5"/>',
  facade: '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6M9 10h6"/>',
  views: '<path d="m3 18 5-8 4 6 3-4 6 6z"/><circle cx="17" cy="7" r="2"/>',
  garage: '<path d="M5 17.5H4a1 1 0 0 1-1-1V12l2-5.2A2 2 0 0 1 6.9 5.5h10.2A2 2 0 0 1 19 6.8l2 5.2v4.5a1 1 0 0 1-1 1h-1"/><path d="M3 12h18"/><circle cx="7.5" cy="17.5" r="2"/><circle cx="16.5" cy="17.5" r="2"/><path d="M9.5 17.5h5"/>',
  storage: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/>',
  common: '<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0M13 20a4 4 0 0 1 8 0"/>',
  other: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
  // Controles del visor
  back: '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  prev: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
  play: '<circle cx="12" cy="12" r="9.5"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/>',
}

export const GALLERY_ICON_KEYS = Object.keys(PATHS)

/** El SVG completo de un icono de la galería; `solid` pinta con el grosor más marcado del estilo «sólido» del Constructor. */
export function galleryIconSvg(key: string, size = 18, style: 'outline' | 'solid' = 'outline'): string {
  const inner = PATHS[key]
  if (!inner) return ''
  const width = style === 'solid' ? 2.2 : 1.7
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`
}

// Central registry of export formats — mirrors the Publication Scheduler's
// CHANNELS registry pattern (server/utils/publication/channels.ts): one flat
// array is the single source of truth, looked up by key, instead of format
// definitions scattered across templates/UI/renderer. Sizes are honest about
// what's actually implemented: pdf/print formats render today (pdf-lib);
// social image formats are defined here (so templates/UI can reference them)
// but rendering PNG/JPG output for them is a documented pending capability
// (see server/utils/qr.ts / commit history — satori+resvg WASM is blocked
// under Cloudflare Workers' dynamic-codegen restriction) until a Workers-
// compatible raster pipeline is wired up.
export type FormatFamily = 'pdf' | 'social' | 'print'
export type FormatOrientation = 'portrait' | 'landscape' | 'square'

export interface FormatDef {
  key: string
  family: FormatFamily
  label: string
  widthPt: number
  heightPt: number
  orientation: FormatOrientation
  /** Whether server/utils/assetExport/render.ts can actually produce this today. */
  renderReady: boolean
}

const MM_TO_PT = 2.83465

function mm(w: number, h: number) {
  return { widthPt: Math.round(w * MM_TO_PT), heightPt: Math.round(h * MM_TO_PT) }
}
function px(w: number, h: number) {
  // Social formats are defined in pixels at 96dpi-equivalent; stored in the
  // same widthPt/heightPt fields so one renderer interface can consume any
  // format without a unit-conversion branch per family.
  return { widthPt: w, heightPt: h }
}

export const FORMATS: FormatDef[] = [
  { key: 'pdf_a4_portrait', family: 'pdf', label: 'PDF A4 vertical', ...mm(210, 297), orientation: 'portrait', renderReady: true },
  { key: 'pdf_a4_landscape', family: 'pdf', label: 'PDF A4 horizontal', ...mm(297, 210), orientation: 'landscape', renderReady: true },
  { key: 'pdf_a5_portrait', family: 'pdf', label: 'PDF A5 vertical', ...mm(148, 210), orientation: 'portrait', renderReady: true },
  { key: 'pdf_dossier', family: 'pdf', label: 'Dossier multipágina (A4 vertical)', ...mm(210, 297), orientation: 'portrait', renderReady: true },
  { key: 'print_a3_portrait', family: 'print', label: 'Cartel A3 vertical', ...mm(297, 420), orientation: 'portrait', renderReady: true },
  { key: 'social_feed_square', family: 'social', label: 'Feed cuadrado 1080×1080', ...px(1080, 1080), orientation: 'square', renderReady: false },
  { key: 'social_feed_portrait', family: 'social', label: 'Feed vertical 1080×1350', ...px(1080, 1350), orientation: 'portrait', renderReady: false },
  { key: 'social_story', family: 'social', label: 'Story 1080×1920', ...px(1080, 1920), orientation: 'portrait', renderReady: false },
]

export const FORMAT_BY_KEY: Record<string, FormatDef> = Object.fromEntries(FORMATS.map((f) => [f.key, f]))

export function isValidFormatKey(key: string): boolean {
  return key in FORMAT_BY_KEY
}

/**
 * Catálogo de campos vinculables (tokens) del editor visual de plantillas,
 * piezas y carteles — con NOMBRE LEGIBLE, grupo y tipo. Es la fuente única que
 * usan el editor de lienzo, la miniatura de diseño y (más adelante) la vista
 * previa, para NO mostrar al usuario referencias técnicas como `{{asset.title}}`
 * sino «Título».
 *
 * IMPORTANTE: el identificador técnico (`token`) NO cambia — es el que resuelve
 * el servidor en server/utils/assetExport/bindings.ts. Aquí sólo se le pone una
 * etiqueta visible. Por eso esta lista debe ser un subconjunto de los tokens
 * que el renderer sabe resolver: NO se inventan orígenes de datos. Si se añade
 * un token nuevo al binding del servidor y quiere ofrecerse en el editor, se
 * añade también aquí.
 */
export type TokenKind = 'text' | 'image' | 'qr'

export interface TokenDef {
  /** Identificador técnico, sin las llaves. Ej: 'asset.title'. */
  token: string
  /** Nombre visible para el usuario. Ej: 'Título'. */
  label: string
  kind: TokenKind
}

export interface TokenGroup {
  group: string
  items: TokenDef[]
}

/**
 * Agrupado por categorías como pide el propietario (Información de la propiedad
 * / Multimedia / Información de la inmobiliaria). Sólo tokens reales del
 * binding del servidor.
 */
export const TOKEN_GROUPS: TokenGroup[] = [
  {
    group: 'Información de la propiedad',
    items: [
      { token: 'asset.title', label: 'Título', kind: 'text' },
      { token: 'asset.description', label: 'Descripción', kind: 'text' },
      { token: 'asset.reference', label: 'Referencia', kind: 'text' },
      { token: 'asset.propertyType', label: 'Tipo de inmueble', kind: 'text' },
      { token: 'asset.price', label: 'Precio', kind: 'text' },
      { token: 'asset.pricePerSquareMeter', label: 'Precio por m²', kind: 'text' },
      { token: 'asset.location', label: 'Localización', kind: 'text' },
      { token: 'asset.city', label: 'Ciudad', kind: 'text' },
      { token: 'asset.builtArea', label: 'Superficie', kind: 'text' },
      { token: 'asset.bedrooms', label: 'Habitaciones', kind: 'text' },
      { token: 'asset.bathrooms', label: 'Baños', kind: 'text' },
      { token: 'asset.publicUrl', label: 'Enlace público', kind: 'text' },
    ],
  },
  {
    group: 'Multimedia',
    items: [
      { token: 'asset.mainImage', label: 'Fotografía principal', kind: 'image' },
      { token: 'asset.masterPlanImage', label: 'Plano', kind: 'image' },
      { token: 'asset.locationMapImage', label: 'Mapa de ubicación', kind: 'image' },
      { token: 'asset.qrCode', label: 'Código QR', kind: 'qr' },
    ],
  },
  {
    group: 'Información de la inmobiliaria',
    items: [
      { token: 'tenant.logo', label: 'Logotipo', kind: 'image' },
      { token: 'tenant.website', label: 'Web', kind: 'text' },
      { token: 'tenant.phone', label: 'Teléfono público', kind: 'text' },
      { token: 'tenant.whatsapp', label: 'WhatsApp', kind: 'text' },
      { token: 'tenant.email', label: 'Email público', kind: 'text' },
      { token: 'tenant.legalText', label: 'Texto legal', kind: 'text' },
    ],
  },
]

/** Todos los tokens en una lista plana. */
export const ALL_TOKENS: TokenDef[] = TOKEN_GROUPS.flatMap((g) => g.items)

const LABEL_BY_TOKEN: Record<string, string> = Object.fromEntries(ALL_TOKENS.map((t) => [t.token, t.label]))

/**
 * Nombre visible de un token (sin llaves) o de una vinculación `{{token}}`.
 * Si no es un token conocido, devuelve el texto tal cual (texto fijo).
 */
export function tokenLabel(raw: string | null | undefined): string {
  if (!raw) return ''
  const token = raw.replace(/^\{\{\s*|\s*\}\}$/g, '').trim()
  return LABEL_BY_TOKEN[token] || raw
}

/** ¿`raw` es una vinculación dinámica a un token (y no texto fijo)? */
export function isBindingToken(raw: string | null | undefined): boolean {
  if (!raw) return false
  const m = raw.match(/^\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}$/)
  return !!m && m[1] in LABEL_BY_TOKEN
}

/**
 * Grupos de tokens aptos para un tipo de elemento del lienzo:
 * - 'image' → sólo imágenes (incluye logotipo)
 * - 'qr'    → sólo el QR
 * - 'text'  → textos (propiedad + inmobiliaria), nunca imágenes/QR
 * Devuelve sólo grupos no vacíos, y opcionalmente filtra por texto de búsqueda.
 */
export function tokenGroupsForKind(elementType: TokenKind | string, query = ''): TokenGroup[] {
  const wanted: TokenKind = elementType === 'image' ? 'image' : elementType === 'qr' ? 'qr' : 'text'
  const q = query.trim().toLowerCase()
  return TOKEN_GROUPS.map((g) => ({
    group: g.group,
    items: g.items.filter((it) => it.kind === wanted && (!q || it.label.toLowerCase().includes(q) || it.token.toLowerCase().includes(q))),
  })).filter((g) => g.items.length > 0)
}

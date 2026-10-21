import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { isKnownFont } from '../../../utils/siteBuilder/fonts'

/**
 * Identidad de marca unificada de una agencia (Cola 22). El Brand Kit
 * (`brand_kits`) es la FUENTE ÚNICA de color y tipografía para la web, los
 * emails y los carteles. Este resolver la lee una vez y la normaliza:
 *  - Colores: sólo HEX válidos; el principal cae a `organizations.brand_color`
 *    si el Brand Kit aún no lo tiene (la migración 0103 ya hizo el backfill,
 *    esto es la red de seguridad para datos antiguos o agencias sin fila).
 *  - Tipografías: sólo familias del catálogo cerrado del Constructor
 *    (SITE_FONTS); cualquier valor libre antiguo se ignora (→ null) para no
 *    inyectar una fuente no servible. `null` = sin preferencia (el consumidor
 *    usa su valor por defecto).
 *
 * Puro respecto a Vue; recibe `db` para poder usarse en endpoints, en el
 * render de emails/carteles y en las pruebas.
 */
export interface BrandIdentity {
  colors: {
    primary: string | null
    secondary: string | null
    background: string | null
    text: string | null
    accents: string[]
  }
  fonts: {
    heading: string | null
    body: string | null
    alt: string | null
  }
}

const HEX = /^#[0-9a-fA-F]{3,8}$/
const cleanHex = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return HEX.test(s) ? s : null
}
const cleanFont = (v: unknown): string | null => (isKnownFont(v) ? v : null)

export async function resolveBrandIdentity(db: any, orgId: number): Promise<BrandIdentity> {
  const [kit] = await db.select().from(schema.brandKits).where(eq(schema.brandKits.organizationId, orgId)).limit(1)
  const [org] = await db.select({ brandColor: schema.organizations.brandColor }).from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1)

  let accents: string[] = []
  try {
    const parsed = JSON.parse(kit?.colorAccentsJson || '[]')
    if (Array.isArray(parsed)) accents = parsed.map(cleanHex).filter((c): c is string => !!c)
  } catch {
    accents = []
  }

  return {
    colors: {
      primary: cleanHex(kit?.colorPrimary) || cleanHex(org?.brandColor),
      secondary: cleanHex(kit?.colorSecondary),
      background: cleanHex(kit?.colorBackground),
      text: cleanHex(kit?.colorText),
      accents,
    },
    fonts: {
      heading: cleanFont(kit?.fontHeading),
      body: cleanFont(kit?.fontBody),
      alt: cleanFont(kit?.fontAlt),
    },
  }
}

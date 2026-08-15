import { and, eq, or } from 'drizzle-orm'
import { schema } from './db'

/**
 * Access rules for the R2 bucket, kept out of the route handler so they can be
 * tested directly against a real database (see
 * test/unit/multitenant.mediaAccess.test.ts).
 *
 * The bucket mixes two kinds of object:
 *
 *  - PUBLIC content — property/community/blog/agent imagery (`uploads/…`,
 *    `cms/<org>/…`), meant to be hotlinked from the public site.
 *  - PRIVATE tenant documents — visitor KYC scans, generated export PDFs,
 *    combined catalogs and signed contracts.
 *
 * Only the first group may be served unauthenticated.
 */
export const PRIVATE_MEDIA_PREFIXES = [
  'visitor-docs/',
  'asset-export-renders/',
  'asset-export-catalogs/',
  'contracts/',
] as const

export function isPrivateMediaKey(key: string): boolean {
  return PRIVATE_MEDIA_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/**
 * Does `key` belong to `orgId`?
 *
 * Answered by finding the row that references this exact key and comparing its
 * organization_id — deliberately NOT by parsing the org id out of the key.
 * Several private keys embed an org id (`contracts/<org>/…`), but the key is a
 * URL path segment the caller fully controls, so trusting it would just move
 * the vulnerability one layer down.
 */
export async function ownsMediaObject(db: any, orgId: number, key: string): Promise<boolean> {
  if (key.startsWith('visitor-docs/')) {
    const V = schema.visitorSubmissions
    const rows = await db
      .select({ id: V.id })
      .from(V)
      .where(
        and(
          eq(V.organizationId, orgId),
          or(
            eq(V.passportPdf, key),
            eq(V.emiratesIdPdf, key),
            eq(V.bankStatementPdf, key),
            eq(V.tradeLicensePdf, key),
            eq(V.vatRegistrationCertificatePdf, key),
            eq(V.etihadCreditBureauPdf, key),
          ),
        ),
      )
      .limit(1)
    return Boolean(rows[0])
  }

  if (key.startsWith('asset-export-renders/')) {
    const R = schema.assetExportRenders
    const rows = await db.select({ id: R.id }).from(R).where(and(eq(R.r2Key, key), eq(R.organizationId, orgId))).limit(1)
    return Boolean(rows[0])
  }

  if (key.startsWith('asset-export-catalogs/')) {
    const C = schema.assetExportCatalogs
    const catalog = await db.select({ id: C.id }).from(C).where(and(eq(C.r2Key, key), eq(C.organizationId, orgId))).limit(1)
    if (catalog[0]) return true
    // Per-asset fragments live under the same prefix; they belong to the catalog.
    const I = schema.assetExportCatalogItems
    const rows = await db
      .select({ id: I.id })
      .from(I)
      .innerJoin(C, eq(C.id, I.catalogId))
      .where(and(eq(I.r2Key, key), eq(C.organizationId, orgId)))
      .limit(1)
    return Boolean(rows[0])
  }

  if (key.startsWith('contracts/')) {
    const K = schema.contracts
    const rows = await db.select({ id: K.id }).from(K).where(and(eq(K.r2Key, key), eq(K.organizationId, orgId))).limit(1)
    return Boolean(rows[0])
  }

  return false
}

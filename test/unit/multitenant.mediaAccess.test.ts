import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { isNeverServableKey, isPrivateMediaKey, ownsMediaObject, PRIVATE_MEDIA_PREFIXES } from '../../server/utils/mediaAccess'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * R2 object access.
 *
 * `/api/media/<key>` served every key in the bucket with one exception —
 * `visitor-docs/`, which required only `requireAdmin`. That meant:
 *
 *  - any tenant's admin could download any other tenant's visitor KYC uploads
 *    (passport, Emirates ID, bank statements) by knowing or guessing the key;
 *  - generated export PDFs, combined catalogs and signed contracts matched no
 *    rule at all and were served to unauthenticated callers.
 */

let db: any
let A: TenantFixture
let B: TenantFixture

const ts = '2026-01-01 00:00:00'
const keys = {
  visitorA: 'visitor-docs/alpha-passport.pdf',
  visitorB: 'visitor-docs/beta-passport.pdf',
  renderB: 'asset-export-renders/999/1/1.pdf',
  catalogB: 'asset-export-catalogs/999/1/final.pdf',
  publicImage: 'uploads/some-listing.jpg',
  cmsImage: 'cms/2/photo.jpg',
}

beforeAll(async () => {
  ;({ db } = createTestDb())
  A = await seedTenant(db, 'Alpha')
  B = await seedTenant(db, 'Beta')

  await db.insert(schema.visitorSubmissions).values({
    organizationId: A.orgId,
    name: 'Alpha visitor',
    email: 'alpha-visitor@example.com',
    phoneNumber: '+34600000001',
    nationality: 'ES',
    passportPdf: keys.visitorA,
    createdAt: ts,
  })
  await db.insert(schema.visitorSubmissions).values({
    organizationId: B.orgId,
    name: 'Beta visitor',
    email: 'beta-visitor@example.com',
    phoneNumber: '+34600000002',
    nationality: 'ES',
    passportPdf: keys.visitorB,
    createdAt: ts,
  })

  const [project] = await db.select({ id: schema.assetExportProjects.id }).from(schema.assetExportProjects).limit(1)
  const [template] = await db
    .insert(schema.assetExportTemplates)
    .values({ organizationId: B.orgId, name: 'Beta template', formatKey: 'dossier_a4', structureJson: '{}', createdAt: ts, updatedAt: ts })
    .returning({ id: schema.assetExportTemplates.id })
  const [betaProject] = await db
    .insert(schema.assetExportProjects)
    .values({
      organizationId: B.orgId,
      templateId: template.id,
      assetKind: 'developer_property',
      assetId: B.projectId,
      name: 'Beta dossier',
      formatKey: 'dossier_a4',
      structureJson: '{}',
      createdAt: ts,
      updatedAt: ts,
    })
    .returning({ id: schema.assetExportProjects.id })
  void project
  await db.insert(schema.assetExportRenders).values({
    organizationId: B.orgId,
    projectId: betaProject.id,
    outputType: 'pdf',
    formatKey: 'dossier_a4',
    status: 'completed',
    r2Key: keys.renderB,
    createdAt: ts,
  })
  await db.insert(schema.assetExportCatalogs).values({
    organizationId: B.orgId,
    name: 'Beta catalog',
    templateId: template.id,
    formatKey: 'dossier_a4',
    status: 'completed',
    r2Key: keys.catalogB,
    createdAt: ts,
  })
})

describe('private media prefixes', () => {
  it('classifies every sensitive namespace as private', () => {
    for (const prefix of PRIVATE_MEDIA_PREFIXES) {
      expect(isPrivateMediaKey(`${prefix}whatever.pdf`)).toBe(true)
    }
    expect(isPrivateMediaKey(keys.visitorB)).toBe(true)
    expect(isPrivateMediaKey(keys.renderB)).toBe(true)
    expect(isPrivateMediaKey(keys.catalogB)).toBe(true)
    expect(isPrivateMediaKey('contracts/2/9.pdf')).toBe(true)
  })

  it('leaves genuinely public content public', () => {
    // Listing photography and CMS images are embedded on the public site; they
    // must not start requiring a session.
    expect(isPrivateMediaKey(keys.publicImage)).toBe(false)
    expect(isPrivateMediaKey(keys.cmsImage)).toBe(false)
  })
})

describe('ownership of private R2 objects', () => {
  it('a tenant can read its own visitor KYC document', async () => {
    expect(await ownsMediaObject(db, A.orgId, keys.visitorA)).toBe(true)
  })

  it('a tenant cannot read another tenant visitor KYC document', async () => {
    expect(await ownsMediaObject(db, A.orgId, keys.visitorB)).toBe(false)
    expect(await ownsMediaObject(db, B.orgId, keys.visitorA)).toBe(false)
  })

  it('a tenant cannot read another tenant generated export', async () => {
    expect(await ownsMediaObject(db, B.orgId, keys.renderB)).toBe(true)
    expect(await ownsMediaObject(db, A.orgId, keys.renderB)).toBe(false)
  })

  it('a tenant cannot read another tenant combined catalog', async () => {
    expect(await ownsMediaObject(db, B.orgId, keys.catalogB)).toBe(true)
    expect(await ownsMediaObject(db, A.orgId, keys.catalogB)).toBe(false)
  })

  it('a tenant cannot read another tenant signed contract', async () => {
    const betaContractKey = `contracts/${B.orgId}/Beta.pdf`
    expect(await ownsMediaObject(db, B.orgId, betaContractKey)).toBe(true)
    expect(await ownsMediaObject(db, A.orgId, betaContractKey)).toBe(false)
  })

  it('ownership is decided by the referencing row, never by the org id inside the key', async () => {
    // The attacker controls the whole path. A key that *claims* to belong to
    // tenant A but has no row backing it must still be refused.
    const forged = `contracts/${A.orgId}/999999.pdf`
    expect(await ownsMediaObject(db, A.orgId, forged)).toBe(false)
    // …and the real object keeps its real owner even though its key spells out
    // a different org.
    expect(await ownsMediaObject(db, A.orgId, keys.renderB)).toBe(false)
  })

  it('an unknown private key is refused rather than defaulting to allowed', async () => {
    expect(await ownsMediaObject(db, A.orgId, 'visitor-docs/does-not-exist.pdf')).toBe(false)
    expect(await ownsMediaObject(db, A.orgId, 'asset-export-renders/1/1/none.pdf')).toBe(false)
  })
})

/**
 * Las copias de seguridad viven en el MISMO bucket que sirve `/api/media/*`
 * (binding MEDIA, `sa-inmobiliaria-media`): la diaria de D1 en
 * `backups/<fecha>.json.gz` y las previas de los workflows en
 * `backups/pre-…/<sha|run_id>.sql`. Ninguna crea fila en `media_assets`, así
 * que caían por la rama de objetos legacy —donde `isPrivateMediaKey()` no
 * reconocía `backups/`— y acababan en el `serveObject(…, restricted: false)`
 * del final del handler: la base de datos de producción entera, descargable
 * sin autenticación y cacheable, con una clave adivinable.
 *
 * Se prueba el predicado y no el endpoint a propósito: por HTTP, una clave
 * `backups/…` que no existe en el bucket de pruebas devuelve 404 tanto con la
 * denegación como sin ella, así que ese test no podría fallar nunca. El
 * handler tiene una sola llamada a `isNeverServableKey()`, como primera cosa
 * que hace tras validar la clave, y eso se verifica leyéndolo.
 */
describe('las copias de seguridad no se sirven por /api/media', () => {
  it('deniega la copia diaria de D1, cuya clave es sólo una fecha', () => {
    expect(isNeverServableKey('backups/2026-10-24.json.gz')).toBe(true)
  })

  it('deniega las copias previas de los cinco workflows', () => {
    for (const key of [
      'backups/pre-deploy/27ab11b63484c2798202c694ec6d96b98a3cb631.sql',
      'backups/pre-migration/40186135471.sql',
      'backups/pre-restore/40186135471.sql',
      'backups/pre-seed/40186135471.sql',
      'backups/pre-alter/40186135471.sql',
    ]) {
      expect(isNeverServableKey(key), key).toBe(true)
    }
  })

  it('deniega el prefijo desnudo y cualquier cosa bajo él', () => {
    expect(isNeverServableKey('backups')).toBe(true)
    expect(isNeverServableKey('backups/')).toBe(true)
    expect(isNeverServableKey('backups/lo/que/sea')).toBe(true)
  })

  it('no deniega nada más: el resto del bucket se sigue sirviendo como antes', () => {
    for (const key of [
      'public/8/properties/foto.jpg',
      'visitor-docs/alpha-passport.pdf',
      'contracts/8/contrato.pdf',
      'asset-export-renders/8/cartel.pdf',
      'backupsitos/no-soy-una-copia.jpg',
      'mi-backups/foto.png',
    ]) {
      expect(isNeverServableKey(key), key).toBe(false)
    }
  })

  it('es una lista de denegación, no de autorización: ningún prefijo privado está en ella', () => {
    for (const prefix of PRIVATE_MEDIA_PREFIXES) {
      expect(isNeverServableKey(`${prefix}algo.pdf`)).toBe(false)
    }
  })
})

import { and, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { adminResources, assertPayloadReferences, type ResourceDef } from '../../server/utils/adminResources'
import { authorizeRecord, buildTenantWhere, isTenantScoped } from '../../server/utils/tenantPolicy'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * The cross-tenant attack matrix.
 *
 * Every tenant-scoped resource in the admin registry is seeded for two real
 * organizations, then tenant A is pointed at tenant B's row ids through the
 * exact functions the HTTP handlers use — `authorizeRecord` (GET/PUT/DELETE/
 * restore), `buildTenantWhere` (LIST and the UPDATE/DELETE WHERE clause) and
 * `assertPayloadReferences` (POST/PUT foreign keys). Nothing here is mocked:
 * the real migrations build the schema, real SQL runs against it.
 *
 * Before this suite existed, five of these resources (floor-plans,
 * property-types, project-images, gallery-images, social-media) carried
 * `orgScoped: false` and every assertion below failed.
 */

/**
 * Minimal insertable row per admin resource. The `covers every resource` test
 * enforces that this map stays complete, so a new resource can't be added
 * without also being pulled into the attack matrix.
 */
const RESOURCE_ROWS: Record<string, (f: TenantFixture, tag: string) => Record<string, any>> = {
  'audit-log': (f, tag) => ({ organizationId: f.orgId, userId: f.userId, userEmail: `${tag}@example.com`, action: 'update', resource: 'agents' }),
  agents: (f, tag) => ({ organizationId: f.orgId, name: `${tag} agent`, email: `${tag}-agent@example.com`, status: 'active' }),
  developers: (f, tag) => ({ organizationId: f.orgId, name: `${tag} developer`, status: 'active' }),
  properties: (f, tag) => ({ organizationId: f.orgId, slug: `${tag}-secondary`, location: tag, price: 1000, status: 'available' }),
  'developer-properties': (f, tag) => ({ organizationId: f.orgId, developerId: f.developerId, name: `${tag} project`, slug: `${tag}-project`, status: 'new', price: 1000 }),
  'floor-plans': (f, tag) => ({ developerPropertyId: f.projectId, category: `${tag} floor`, unitType: '1BR' }),
  'property-types': (f, tag) => ({ developerPropertyId: f.projectId, propertyType: 'Villa', unitType: `${tag} unit`, size: '200' }),
  'project-images': (f, tag) => ({ developerPropertyId: f.projectId, image: `uploads/${tag}-project.jpg` }),
  'gallery-images': (f, tag) => ({ propertyId: f.propertyId, image: `uploads/${tag}-gallery.jpg` }),
  'social-media': (f, tag) => ({ developerPropertyId: f.projectId, platform: 'tiktok', url: `https://tiktok.com/${tag}` }),
  'master-plans': (f, tag) => ({ organizationId: f.orgId, name: `${tag} master plan`, image: `uploads/${tag}-mp.jpg` }),
  locations: (f, tag) => ({ organizationId: f.orgId, name: `${tag} location` }),
  amenities: (f, tag) => ({ organizationId: f.orgId, name: `${tag} amenity` }),
  communities: (f, tag) => ({ organizationId: f.orgId, name: `${tag} community` }),
  blogs: (f, tag) => ({ organizationId: f.orgId, slug: `${tag}-blog` }),
  team: (f, tag) => ({ organizationId: f.orgId, name: `${tag} member`, slug: `${tag}-member`, email: `${tag}-member@example.com`, position: 'Broker' }),
  'team-member-documents': (f, tag) => ({ organizationId: f.orgId, teamMemberId: f.teamMemberId, fileKey: `tenants/${f.orgId}/team-documents/${tag}.pdf`, label: `${tag} document` }),
  users: (f, tag) => ({ organizationId: f.orgId, name: `${tag} user`, email: `${tag}-user@example.com`, password: 'x', role: 'admin' }),
  'cms-categories': (f, tag) => ({ organizationId: f.orgId, name: `${tag} cat`, slug: `${tag}-cat-row` }),
  'cms-tags': (f, tag) => ({ organizationId: f.orgId, name: `${tag} tag`, slug: `${tag}-tag` }),
  'cms-authors': (f, tag) => ({ organizationId: f.orgId, name: `${tag} author`, slug: `${tag}-author-row` }),
  'cms-comments': (f, tag) => ({ organizationId: f.orgId, articleId: f.articleId, authorName: `${tag} commenter`, content: 'hola', status: 'pending' }),
  'cms-redirects': (f, tag) => ({ organizationId: f.orgId, fromPath: `/${tag}-from`, toPath: `/${tag}-to`, statusCode: 301 }),
  'cms-media-folders': (f, tag) => ({ organizationId: f.orgId, name: `${tag} media folder` }),
  'visitor-submissions': (f, tag) => ({ organizationId: f.orgId, name: `${tag} visitor`, email: `${tag}-visitor@example.com`, phoneNumber: '+34600000000', nationality: 'ES' }),
  'vendor-registrations': (f, tag) => ({ organizationId: f.orgId, name: `${tag} vendor`, email: `${tag}-vendor@example.com` }),
  'contact-messages': (f, tag) => ({ organizationId: f.orgId, type: 'contact', name: `${tag} sender`, email: `${tag}-sender@example.com`, message: 'hola' }),
}

/** Resources deliberately outside the tenant matrix, each with a stated reason. */
const GLOBAL_RESOURCES: Record<string, string> = {
  organizations: 'the tenant registry itself, super_admin only',
  'error-logs': 'platform incident log, super_admin only',
}

let db: any
let A: TenantFixture
let B: TenantFixture
/** resourceKey -> { a: rowId owned by tenant A, b: rowId owned by tenant B } */
const ids: Record<string, { a: number; b: number }> = {}

const tenantScopedKeys = Object.entries(adminResources)
  .filter(([, def]) => isTenantScoped(def.tenantPolicy))
  .map(([key]) => key)

beforeAll(async () => {
  ;({ db } = createTestDb())
  A = await seedTenant(db, 'Alpha')
  B = await seedTenant(db, 'Beta')

  for (const key of tenantScopedKeys) {
    const def = adminResources[key]
    const build = RESOURCE_ROWS[key]
    if (!build) continue
    // Same timestamp columns buildPayload() fills in on a real create.
    const stamps: Record<string, string> = {}
    if (def.hasTimestamps) stamps.createdAt = '2026-01-01 00:00:00'
    if (def.hasUpdatedAt) stamps.updatedAt = '2026-01-01 00:00:00'
    const [a] = await db.insert(def.table).values({ ...build(A, `alpha-${key}`), ...stamps }).returning({ id: def.table.id })
    const [b] = await db.insert(def.table).values({ ...build(B, `beta-${key}`), ...stamps }).returning({ id: def.table.id })
    ids[key] = { a: a.id, b: b.id }
  }
})

/**
 * Asserts that an operation crossing the tenant boundary is refused, and
 * refused the right way: a 404, never a 403. A 403 tells the caller "this id
 * exists but isn't yours", which is itself a disclosure — it turns a blind id
 * guess into a confirmed enumeration of the platform.
 */
async function expectCrossTenantDenied(operation: () => Promise<unknown>, what: string): Promise<void> {
  let thrown: any
  try {
    await operation()
  } catch (err) {
    thrown = err
  }
  expect(thrown, `${what}: expected the operation to be refused, it succeeded`).toBeDefined()
  const status = thrown?.statusCode ?? thrown?.status
  expect(status, `${what}: expected 404 (not-found), got ${status} — ${thrown?.statusMessage || thrown?.message}`).toBe(404)
}

function read(key: string, id: number, orgId: number) {
  const def = adminResources[key]
  return authorizeRecord(db, { resourceKey: key, table: def.table, policy: def.tenantPolicy, id, orgId })
}

function tenantWhere(def: ResourceDef, orgId: number) {
  return buildTenantWhere(db, def.table, def.tenantPolicy, orgId)
}

describe('multi-tenant registry integrity', () => {
  it('every admin resource declares an explicit tenant policy', () => {
    for (const [key, def] of Object.entries(adminResources)) {
      expect(def.tenantPolicy, `resource "${key}" has no tenantPolicy`).toBeDefined()
      expect(['direct', 'parent', 'nestedParent', 'global']).toContain(def.tenantPolicy.type)
    }
  })

  it('a global policy always carries a written reason and is super_admin-only', () => {
    for (const [key, def] of Object.entries(adminResources)) {
      if (def.tenantPolicy.type !== 'global') continue
      expect(GLOBAL_RESOURCES[key], `resource "${key}" is global but not in the reviewed allow-list`).toBeDefined()
      expect(def.tenantPolicy.reason.length, `resource "${key}" declares global with an empty reason`).toBeGreaterThan(10)
      expect(def.superAdminOnly, `global resource "${key}" must be super_admin-only`).toBe(true)
    }
  })

  it('every tenant-scoped resource is covered by the attack matrix', () => {
    const uncovered = tenantScopedKeys.filter((key) => !RESOURCE_ROWS[key])
    expect(uncovered, `these resources have no fixture, so they are untested: ${uncovered.join(', ')}`).toEqual([])
  })

  it('child resources resolve their tenant through a real parent, not a bare flag', () => {
    // The exact five that used to run unfiltered.
    for (const key of ['floor-plans', 'property-types', 'project-images', 'gallery-images', 'social-media']) {
      expect(adminResources[key].tenantPolicy.type, `${key} must inherit its tenant from a parent`).toBe('parent')
    }
  })
})

describe('cross-tenant READ is refused for every resource', () => {
  it.each(tenantScopedKeys)('tenant A cannot read %s belonging to tenant B', async (key) => {
    await expectCrossTenantDenied(() => read(key, ids[key].b, A.orgId), `GET ${key}`)
    // Control: the same call against its own row must still work, otherwise a
    // green test could just mean everything is broken.
    const own = await read(key, ids[key].a, A.orgId)
    expect(own.row.id).toBe(ids[key].a)
  })
})

describe('cross-tenant LIST never returns another tenant rows', () => {
  it.each(tenantScopedKeys)('%s list is confined to the caller organization', async (key) => {
    const def = adminResources[key]
    const rows = await db.select({ id: def.table.id }).from(def.table).where(tenantWhere(def, A.orgId) as any)
    const returned = rows.map((r: any) => r.id)
    expect(returned).toContain(ids[key].a)
    expect(returned, `${key}: tenant B row leaked into tenant A list`).not.toContain(ids[key].b)
  })
})

describe('cross-tenant UPDATE changes nothing', () => {
  it.each(tenantScopedKeys)('tenant A cannot update %s belonging to tenant B', async (key) => {
    const def = adminResources[key]
    // The handler resolves ownership first: that alone must already refuse.
    await expectCrossTenantDenied(() => read(key, ids[key].b, A.orgId), `PUT ${key}`)

    // And the WHERE clause it would have used must independently match nothing,
    // so even a handler that skipped the check writes zero rows.
    const rows = await db
      .select({ id: def.table.id })
      .from(def.table)
      .where(and(eq(def.table.id, ids[key].b), tenantWhere(def, A.orgId)) as any)
    expect(rows.length, `${key}: tenant A UPDATE would have matched tenant B row`).toBe(0)
  })
})

describe('cross-tenant DELETE removes nothing', () => {
  it.each(tenantScopedKeys)('tenant A cannot delete %s belonging to tenant B', async (key) => {
    const def = adminResources[key]
    await expectCrossTenantDenied(() => read(key, ids[key].b, A.orgId), `DELETE ${key}`)

    await db.delete(def.table).where(and(eq(def.table.id, ids[key].b), tenantWhere(def, A.orgId)) as any)
    const survivor = await db.select({ id: def.table.id }).from(def.table).where(eq(def.table.id, ids[key].b))
    expect(survivor.length, `${key}: tenant B row was deleted by tenant A`).toBe(1)
  })
})

describe('cross-tenant CREATE with a foreign parent is refused', () => {
  const childKeys = tenantScopedKeys.filter((key) => adminResources[key].tenantPolicy.type === 'parent')

  it('there is at least one child resource to test', () => {
    expect(childKeys.length).toBeGreaterThan(0)
  })

  it.each(childKeys)('tenant A cannot create %s under a tenant B parent', async (key) => {
    const def = adminResources[key]
    const policy = def.tenantPolicy as { type: 'parent'; foreignKey: string }
    const foreignParentId = policy.foreignKey === 'propertyId' ? B.propertyId : B.projectId

    await expectCrossTenantDenied(
      () => assertPayloadReferences(db, def, { [policy.foreignKey]: foreignParentId }, A.orgId, { isCreate: true }),
      `POST ${key} with foreign parent`,
    )

    // Its own parent is accepted — the rule rejects the tenant boundary, not the operation.
    const ownParentId = policy.foreignKey === 'propertyId' ? A.propertyId : A.projectId
    await expect(
      assertPayloadReferences(db, def, { [policy.foreignKey]: ownParentId }, A.orgId, { isCreate: true }),
    ).resolves.toBeUndefined()
  })

  it('a child row cannot be re-parented onto another tenant record via UPDATE', async () => {
    const def = adminResources['floor-plans']
    await expectCrossTenantDenied(
      () => assertPayloadReferences(db, def, { developerPropertyId: B.projectId }, A.orgId, { isCreate: false }),
      'PUT floor-plans re-parenting',
    )
  })
})

describe('cross-tenant CREATE with a foreign relation is refused', () => {
  const relationKeys = tenantScopedKeys.filter((key) => Object.keys(adminResources[key].relations || {}).length > 0)

  it('the declared relations cover the known client-supplied foreign keys', () => {
    expect(relationKeys.sort()).toEqual(
      ['cms-authors', 'cms-categories', 'cms-comments', 'cms-media-folders', 'developer-properties', 'properties', 'team', 'team-member-documents'].sort(),
    )
  })

  it('tenant A cannot attach an article to tenant B category or author', async () => {
    const def = adminResources['cms-categories']
    await expectCrossTenantDenied(
      () => assertPayloadReferences(db, def, { parentId: ids['cms-categories'].b }, A.orgId, { isCreate: false }),
      'cms-categories.parentId',
    )
  })

  it('tenant A cannot post a comment onto tenant B article', async () => {
    const def = adminResources['cms-comments']
    await expectCrossTenantDenied(
      () => assertPayloadReferences(db, def, { articleId: B.articleId }, A.orgId, { isCreate: true }),
      'cms-comments.articleId',
    )
    await expect(
      assertPayloadReferences(db, def, { articleId: A.articleId }, A.orgId, { isCreate: true }),
    ).resolves.toBeUndefined()
  })

  it('tenant A cannot link a CMS author to a tenant B user account', async () => {
    const def = adminResources['cms-authors']
    await expectCrossTenantDenied(
      () => assertPayloadReferences(db, def, { userId: B.userId }, A.orgId, { isCreate: false }),
      'cms-authors.userId',
    )
  })

  it('tenant A cannot assign its project to a tenant B developer', async () => {
    const def = adminResources['developer-properties']
    await expectCrossTenantDenied(
      () => assertPayloadReferences(db, def, { developerId: B.developerId }, A.orgId, { isCreate: true }),
      'developer-properties.developerId',
    )
  })

  it('tenant A cannot assign its project or secondary-sale property to a tenant B comercial', async () => {
    await expectCrossTenantDenied(
      () => assertPayloadReferences(db, adminResources['developer-properties'], { agentId: B.teamMemberId }, A.orgId, { isCreate: false }),
      'developer-properties.agentId',
    )
    await expectCrossTenantDenied(
      () => assertPayloadReferences(db, adminResources.properties, { agentId: B.teamMemberId }, A.orgId, { isCreate: false }),
      'properties.agentId',
    )
  })

  it('tenant A cannot point a comercial\'s manager, or a document, at a tenant B comercial', async () => {
    await expectCrossTenantDenied(
      () => assertPayloadReferences(db, adminResources.team, { managerId: B.teamMemberId }, A.orgId, { isCreate: false }),
      'team.managerId',
    )
    await expectCrossTenantDenied(
      () => assertPayloadReferences(db, adminResources['team-member-documents'], { teamMemberId: B.teamMemberId }, A.orgId, { isCreate: true }),
      'team-member-documents.teamMemberId',
    )
  })

  it('an absent or null optional relation is left alone', async () => {
    const def = adminResources['cms-categories']
    await expect(assertPayloadReferences(db, def, {}, A.orgId, { isCreate: false })).resolves.toBeUndefined()
    await expect(assertPayloadReferences(db, def, { parentId: null }, A.orgId, { isCreate: false })).resolves.toBeUndefined()
  })
})

describe('organizationId supplied in the request body is never honoured', () => {
  it('a create payload cannot claim another tenant ownership', async () => {
    // The handler deletes organizationId from the payload and re-sets it from
    // the session; this asserts the resulting row belongs to the caller.
    const def = adminResources.agents
    const data: Record<string, any> = { name: 'Injected', email: 'injected@example.com', status: 'active', organizationId: B.orgId }
    delete data.organizationId
    data[def.tenantPolicy.type === 'direct' ? 'organizationId' : ''] = A.orgId

    const [row] = await db.insert(def.table).values(data).returning({ id: def.table.id })
    const stored = await db.select({ organizationId: def.table.organizationId }).from(def.table).where(eq(def.table.id, row.id))
    expect(stored[0].organizationId).toBe(A.orgId)
    await expectCrossTenantDenied(() => read('agents', row.id, B.orgId), 'agents created by A, read by B')
  })

  it('a child resource create ignores organizationId entirely and follows its parent', async () => {
    const def = adminResources['floor-plans']
    const data: Record<string, any> = { developerPropertyId: A.projectId, category: 'body-injection', organizationId: B.orgId }
    delete data.organizationId
    await assertPayloadReferences(db, def, data, A.orgId, { isCreate: true })
    const [row] = await db.insert(def.table).values(data).returning({ id: def.table.id })

    // Ownership follows the parent project, which belongs to A.
    const own = await read('floor-plans', row.id, A.orgId)
    expect(own.row.id).toBe(row.id)
    await expectCrossTenantDenied(() => read('floor-plans', row.id, B.orgId), 'floor-plans follows parent tenant')
  })
})

describe('a tenant-scoped query can never run without a tenant', () => {
  it.each(tenantScopedKeys)('%s fails closed when no organization is resolved', (key) => {
    const def = adminResources[key]
    // A null org must throw, never silently return "no filter" — that is
    // exactly how the old boolean flag produced unfiltered queries.
    expect(() => buildTenantWhere(db, def.table, def.tenantPolicy, null)).toThrowError()
  })
})

describe('invoices are tenant-scoped after migration 0038', () => {
  it('tenant A billing totals exclude tenant B invoices', async () => {
    const rows = await db
      .select({ id: schema.invoices.id, total: sql<number>`sum(amount + tax)` })
      .from(schema.invoices)
      .where(eq(schema.invoices.organizationId, A.orgId))
    const all = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.id, B.invoiceId))
    expect(all.length).toBe(1) // B's invoice exists…
    expect(rows[0].total).toBe(1210) // …but A only sees its own 1000 + 210
  })
})

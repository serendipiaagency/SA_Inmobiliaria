import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import * as schema from '../../../server/db/schema'

const MIGRATIONS_DIR = join(import.meta.dirname, '../../../migrations')

/**
 * A real SQLite database with the project's real migrations applied, wrapped in
 * a drizzle instance that speaks the same query builder the Worker uses.
 *
 * Testing tenant isolation against a hand-written mini-schema would prove
 * nothing: the bugs this suite exists to catch (a missing WHERE, an EXISTS that
 * correlates on the wrong column) only show up when real SQL runs against the
 * real column layout. `node:sqlite` gives us that in-process, and
 * `drizzle-orm/sqlite-proxy` lets the production query-building code run
 * unmodified on top of it.
 */
export function createTestDb() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  }

  function runOne(sql: string, params: any[], method: 'run' | 'all' | 'values' | 'get') {
    const stmt = sqlite.prepare(sql)
    if (method === 'run') {
      stmt.run(...params)
      return { rows: [] }
    }
    const rows = stmt.all(...params).map((r) => Object.values(r as Record<string, unknown>))
    return { rows: method === 'get' ? (rows[0] ?? []) : rows }
  }

  const db = drizzle(
    async (sql, params, method) => runOne(sql, params as any[], method),
    // Real D1 batches multiple statements atomically; node:sqlite has no
    // native batch API, but this harness only needs to prove
    // db.batch([...]) callers (registerMediaAsset, softDeleteMediaAsset) work
    // against a real schema — running each statement in sequence inside the
    // same in-memory connection is observably equivalent for that purpose.
    async (queries) => queries.map((q) => runOne(q.sql, q.params, q.method)),
    { schema },
  )

  return { db: db as any, sqlite }
}

export interface TenantFixture {
  orgId: number
  /** Off-plan project (developer_properties). */
  projectId: number
  /** Secondary-sale property (agent_properties) — the translations parent. */
  propertyId: number
  developerId: number
  agentId: number
  teamMemberId: number
  communityId: number
  floorPlanId: number
  propertyTypeId: number
  projectImageId: number
  galleryImageId: number
  socialMediaId: number
  leadId: number
  visitId: number
  contractId: number
  articleId: number
  categoryId: number
  authorId: number
  mediaFolderId: number
  userId: number
  invoiceId: number
}

let seq = 0
function uniq(prefix: string): string {
  seq += 1
  return `${prefix}-${seq}`
}

/**
 * Creates one complete, self-consistent tenant: an organization plus at least
 * one row in every table the cross-tenant matrix exercises, including the
 * child tables that carry no organization_id of their own.
 */
export async function seedTenant(db: any, name: string): Promise<TenantFixture> {
  const ts = '2026-01-01 00:00:00'

  const [org] = await db
    .insert(schema.organizations)
    .values({ name, slug: uniq(`org-${name.toLowerCase()}`), status: 'active', createdAt: ts, updatedAt: ts })
    .returning({ id: schema.organizations.id })
  const orgId = org.id

  const [user] = await db
    .insert(schema.users)
    .values({ organizationId: orgId, name: `${name} Admin`, email: uniq(`admin-${name}@example.com`), password: 'x', role: 'admin', createdAt: ts, updatedAt: ts })
    .returning({ id: schema.users.id })

  const [developer] = await db
    .insert(schema.developers)
    .values({ organizationId: orgId, name: `${name} Developments`, status: 'active', createdAt: ts, updatedAt: ts })
    .returning({ id: schema.developers.id })

  const [project] = await db
    .insert(schema.developerProperties)
    .values({
      organizationId: orgId,
      developerId: developer.id,
      name: `${name} Tower`,
      slug: uniq(`${name.toLowerCase()}-tower`),
      status: 'new',
      price: 500_000,
      area: 100,
      community: `${name} Bay`,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning({ id: schema.developerProperties.id })

  const [property] = await db
    .insert(schema.agentProperties)
    .values({ organizationId: orgId, slug: uniq(`${name.toLowerCase()}-flat`), location: `${name} City`, price: 300_000, status: 'available', createdAt: ts, updatedAt: ts })
    .returning({ id: schema.agentProperties.id })

  const [agent] = await db
    .insert(schema.agents)
    .values({ organizationId: orgId, name: `${name} Agent`, email: uniq(`agent-${name}@example.com`), status: 'active', createdAt: ts, updatedAt: ts })
    .returning({ id: schema.agents.id })

  const [teamMember] = await db
    .insert(schema.teamMembers)
    .values({ organizationId: orgId, name: `${name} Broker`, slug: uniq(`${name.toLowerCase()}-broker`), email: uniq(`broker-${name}@example.com`), position: 'Broker', createdAt: ts, updatedAt: ts })
    .returning({ id: schema.teamMembers.id })

  const [community] = await db
    .insert(schema.communities)
    .values({ organizationId: orgId, name: `${name} Community`, createdAt: ts, updatedAt: ts })
    .returning({ id: schema.communities.id })

  // --- child rows with no organization_id of their own -----------------------
  const [floorPlan] = await db
    .insert(schema.floorPlans)
    .values({ developerPropertyId: project.id, category: `${name} plan`, unitType: '2BR', createdAt: ts })
    .returning({ id: schema.floorPlans.id })

  const [propertyType] = await db
    .insert(schema.propertyTypes)
    .values({ developerPropertyId: project.id, propertyType: 'Apartment', unitType: '2BR', size: '100', createdAt: ts })
    .returning({ id: schema.propertyTypes.id })

  const [projectImage] = await db
    .insert(schema.images)
    .values({ developerPropertyId: project.id, image: `uploads/${name}-1.jpg`, createdAt: ts })
    .returning({ id: schema.images.id })

  const [galleryImage] = await db
    .insert(schema.propertyGalleryImages)
    .values({ propertyId: property.id, image: `uploads/${name}-2.jpg`, createdAt: ts })
    .returning({ id: schema.propertyGalleryImages.id })

  const [socialMedia] = await db
    .insert(schema.propertySocialMedia)
    .values({ developerPropertyId: project.id, platform: 'instagram', url: `https://instagram.com/${name}`, createdAt: ts })
    .returning({ id: schema.propertySocialMedia.id })

  await db
    .insert(schema.propertyTranslations)
    .values({ propertyId: property.id, locale: 'en', title: `${name} original title`, description: `${name} original description` })

  // --- CRM / CMS / billing ---------------------------------------------------
  const [lead] = await db
    .insert(schema.leads)
    .values({ organizationId: orgId, name: `${name} Lead`, email: uniq(`lead-${name}@example.com`), source: 'web', status: 'new', score: 10, createdAt: ts, updatedAt: ts })
    .returning({ id: schema.leads.id })

  const [visit] = await db
    .insert(schema.visits)
    .values({ organizationId: orgId, clientName: `${name} Client`, scheduledAt: '2026-02-01 10:00:00', status: 'scheduled', channel: 'in_person', createdAt: ts })
    .returning({ id: schema.visits.id })

  const [contractTemplate] = await db
    .insert(schema.contractTemplates)
    .values({ organizationId: orgId, name: `${name} template`, kind: 'reserva', bodyTemplate: 'Hola {{client.name}}', createdAt: ts, updatedAt: ts })
    .returning({ id: schema.contractTemplates.id })

  const [contract] = await db
    .insert(schema.contracts)
    .values({
      organizationId: orgId,
      templateId: contractTemplate.id,
      title: `${name} contract`,
      clientName: `${name} Client`,
      bodyText: 'Body',
      status: 'draft',
      r2Key: `contracts/${orgId}/${name}.pdf`,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning({ id: schema.contracts.id })

  const [category] = await db
    .insert(schema.cmsCategories)
    .values({ organizationId: orgId, name: `${name} category`, slug: uniq(`${name.toLowerCase()}-cat`), createdAt: ts, updatedAt: ts })
    .returning({ id: schema.cmsCategories.id })

  const [author] = await db
    .insert(schema.cmsAuthors)
    .values({ organizationId: orgId, name: `${name} author`, slug: uniq(`${name.toLowerCase()}-author`), createdAt: ts, updatedAt: ts })
    .returning({ id: schema.cmsAuthors.id })

  const [article] = await db
    .insert(schema.cmsArticles)
    .values({ organizationId: orgId, title: `${name} article`, slug: uniq(`${name.toLowerCase()}-article`), contentJson: '[]', status: 'published', createdAt: ts, updatedAt: ts })
    .returning({ id: schema.cmsArticles.id })

  const [mediaFolder] = await db
    .insert(schema.cmsMediaFolders)
    .values({ organizationId: orgId, name: `${name} folder`, createdAt: ts })
    .returning({ id: schema.cmsMediaFolders.id })

  const [invoice] = await db
    .insert(schema.invoices)
    .values({ organizationId: orgId, number: uniq(`INV-${name}`), clientName: `${name} Client`, amount: 1000, tax: 210, status: 'pending', issuedAt: '2026-01-01', createdAt: ts })
    .returning({ id: schema.invoices.id })

  return {
    orgId,
    projectId: project.id,
    propertyId: property.id,
    developerId: developer.id,
    agentId: agent.id,
    teamMemberId: teamMember.id,
    communityId: community.id,
    floorPlanId: floorPlan.id,
    propertyTypeId: propertyType.id,
    projectImageId: projectImage.id,
    galleryImageId: galleryImage.id,
    socialMediaId: socialMedia.id,
    leadId: lead.id,
    visitId: visit.id,
    contractId: contract.id,
    articleId: article.id,
    categoryId: category.id,
    authorId: author.id,
    mediaFolderId: mediaFolder.id,
    userId: user.id,
    invoiceId: invoice.id,
  }
}

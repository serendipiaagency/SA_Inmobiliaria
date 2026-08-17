import { and, eq, exists, sql, type SQL } from 'drizzle-orm'
import { createError } from 'h3'

/**
 * The single source of truth for multi-tenant isolation in the generic admin
 * CRUD.
 *
 * This replaces the old `orgScoped?: boolean` flag, whose `false` value was
 * dangerously ambiguous: it meant BOTH "this table is genuinely global" (e.g.
 * `organizations`) AND "this table has no organization_id column, it inherits
 * the tenant through its parent" (e.g. `floor_plans` → `developer_properties`).
 * Because the CRUD handlers only ever checked `orgScoped !== false`, the second
 * group silently ran with NO tenant filter at all — any admin could read,
 * modify and delete any other tenant's child rows by id.
 *
 * A policy is now mandatory and explicit per resource. `global` must state a
 * reason in code, so "no filter" can never be the result of an omission.
 */

/** The resource's own table carries the tenant column. */
export interface DirectTenantPolicy {
  type: 'direct'
  /** Drizzle property name of the tenant column. Defaults to `organizationId`. */
  organizationField?: string
}

/** The resource inherits its tenant from a parent row through a foreign key. */
export interface ParentTenantPolicy {
  type: 'parent'
  /** Drizzle property name of the FK column on THIS table. */
  foreignKey: string
  /** The parent drizzle table. Must itself carry the tenant column. */
  parentTable: any
  /** Drizzle property name of the tenant column on the parent. Defaults to `organizationId`. */
  parentOrganizationField?: string
  /** Used in error messages ("Project not found"). */
  parentLabel?: string
}

/**
 * The resource inherits its tenant two hops away (child → parent →
 * grandparent), where only the grandparent carries the tenant column. No
 * resource in `adminResources` needs this today — every child table is exactly
 * one hop from a tenant-carrying row — but the resolver supports it so a
 * future two-hop table can declare its real chain instead of being forced into
 * a `global` escape hatch.
 */
export interface NestedParentTenantPolicy {
  type: 'nestedParent'
  /** FK column on THIS table pointing at the parent's id. */
  foreignKey: string
  parentTable: any
  /** FK column on the PARENT table pointing at the grandparent's id. */
  parentForeignKey: string
  grandparentTable: any
  /** Tenant column on the grandparent. Defaults to `organizationId`. */
  grandparentOrganizationField?: string
  parentLabel?: string
}

/**
 * Genuinely platform-wide data, deliberately unfiltered. `reason` is required:
 * declaring a resource global is a security decision and has to be argued for
 * in code, not inferred from a missing flag.
 */
export interface GlobalTenantPolicy {
  type: 'global'
  reason: string
}

export type TenantPolicy =
  | DirectTenantPolicy
  | ParentTenantPolicy
  | NestedParentTenantPolicy
  | GlobalTenantPolicy

export function isTenantScoped(policy: TenantPolicy): boolean {
  return policy.type !== 'global'
}

function orgIdOrThrow(orgId: number | null): number {
  if (orgId == null) {
    // Reaching here means a tenant-scoped resource was handled without a
    // resolved organization. Failing closed is the only safe option: the
    // alternative is an unfiltered query across every tenant.
    throw createError({ statusCode: 403, statusMessage: 'No active organization for this request' })
  }
  return orgId
}

/**
 * Builds the WHERE fragment that confines a query to `orgId`, for any policy
 * type. Every read, update and delete in the generic CRUD goes through this —
 * there is no second code path that decides tenant visibility.
 *
 * Returns `undefined` only for `global` resources (nothing to filter by).
 */
export function buildTenantWhere(
  db: any,
  table: any,
  policy: TenantPolicy,
  orgId: number | null,
): SQL | undefined {
  switch (policy.type) {
    case 'direct': {
      const field = policy.organizationField ?? 'organizationId'
      const column = table[field]
      if (!column) throw new Error(`buildTenantWhere: table has no "${field}" column for a direct policy`)
      return eq(column, orgIdOrThrow(orgId))
    }

    case 'parent': {
      const id = orgIdOrThrow(orgId)
      const parent = policy.parentTable
      const parentOrgField = policy.parentOrganizationField ?? 'organizationId'
      const fk = table[policy.foreignKey]
      if (!fk) throw new Error(`buildTenantWhere: table has no "${policy.foreignKey}" column for a parent policy`)
      // Correlated EXISTS rather than a pre-resolved id list: it stays correct
      // for any row count and can't be defeated by a large tenant.
      return exists(
        db
          .select({ ok: sql`1` })
          .from(parent)
          .where(and(eq(parent.id, fk), eq(parent[parentOrgField], id))),
      )
    }

    case 'nestedParent': {
      const id = orgIdOrThrow(orgId)
      const parent = policy.parentTable
      const grandparent = policy.grandparentTable
      const grandparentOrgField = policy.grandparentOrganizationField ?? 'organizationId'
      const fk = table[policy.foreignKey]
      if (!fk) throw new Error(`buildTenantWhere: table has no "${policy.foreignKey}" column for a nestedParent policy`)
      return exists(
        db
          .select({ ok: sql`1` })
          .from(parent)
          .innerJoin(grandparent, eq(grandparent.id, parent[policy.parentForeignKey]))
          .where(and(eq(parent.id, fk), eq(grandparent[grandparentOrgField], id))),
      )
    }

    case 'global':
      return undefined
  }
}

/**
 * Confirms that `parentId` names a row this tenant actually owns, resolving
 * the same chain `buildTenantWhere` uses. Throws 404 (never 403) when it
 * doesn't: a 403 would confirm the id exists somewhere on the platform, which
 * is itself a cross-tenant disclosure.
 */
export async function assertOwnedReference(
  db: any,
  opts: { table: any; organizationField?: string; id: unknown; orgId: number | null; label: string },
): Promise<number> {
  const orgId = orgIdOrThrow(opts.orgId)
  const id = Number(opts.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 422, statusMessage: `${opts.label}: identificador inválido` })
  }
  const orgField = opts.organizationField ?? 'organizationId'
  const rows = await db
    .select({ id: opts.table.id })
    .from(opts.table)
    .where(and(eq(opts.table.id, id), eq(opts.table[orgField], orgId)))
    .limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: `${opts.label} no encontrado` })
  return id
}

/**
 * For `parent`/`nestedParent` resources: validates the FK carried in a
 * create/update payload before the row is written.
 *
 * Without this, tenant A could create a floor plan whose
 * `developerPropertyId` points at tenant B's project — the child would then
 * render inside B's public project page and be readable through B's own
 * endpoints, even though A "owns" nothing here.
 */
export async function assertPayloadParentOwnership(
  db: any,
  policy: TenantPolicy,
  data: Record<string, any>,
  orgId: number | null,
  opts: { isCreate: boolean },
): Promise<void> {
  if (policy.type === 'direct' || policy.type === 'global') return

  const fkValue = data[policy.foreignKey]
  if (fkValue === undefined || fkValue === null) {
    if (opts.isCreate) {
      throw createError({ statusCode: 422, statusMessage: `Missing required field: ${policy.foreignKey}` })
    }
    // An update that doesn't touch the FK keeps the parent it was already
    // authorized against — nothing new to check.
    return
  }

  if (policy.type === 'parent') {
    await assertOwnedReference(db, {
      table: policy.parentTable,
      organizationField: policy.parentOrganizationField,
      id: fkValue,
      orgId,
      label: policy.parentLabel || 'Registro padre',
    })
    return
  }

  // nestedParent: the FK points at the parent, but ownership lives on the grandparent.
  const orgIdResolved = orgIdOrThrow(orgId)
  const id = Number(fkValue)
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 422, statusMessage: `${policy.parentLabel || 'Registro padre'}: identificador inválido` })
  }
  const grandparentOrgField = policy.grandparentOrganizationField ?? 'organizationId'
  const rows = await db
    .select({ id: policy.parentTable.id })
    .from(policy.parentTable)
    .innerJoin(policy.grandparentTable, eq(policy.grandparentTable.id, policy.parentTable[policy.parentForeignKey]))
    .where(and(eq(policy.parentTable.id, id), eq(policy.grandparentTable[grandparentOrgField], orgIdResolved)))
    .limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: `${policy.parentLabel || 'Registro padre'} no encontrado` })
}

/**
 * Proof that a specific record was resolved under this tenant's policy.
 *
 * Operations that would otherwise act on a bare id (translation sync being
 * the notable one) take this instead of a number, so "I checked ownership"
 * becomes something the type system asks for rather than something a caller
 * has to remember.
 */
export interface AuthorizedRecord {
  readonly resourceKey: string
  readonly id: number
  readonly orgId: number | null
  readonly policy: TenantPolicy
  /** Brand — only `authorizeRecord()` can produce a value of this type. */
  readonly __tenantAuthorized: true
}

/**
 * Loads a record under its tenant policy and returns both the row and an
 * `AuthorizedRecord` capability for it. Throws 404 when the record doesn't
 * exist OR belongs to another tenant — deliberately indistinguishable.
 */
export async function authorizeRecord(
  db: any,
  opts: { resourceKey: string; table: any; policy: TenantPolicy; id: number; orgId: number | null },
): Promise<{ row: Record<string, any>; authorized: AuthorizedRecord }> {
  const tenantWhere = buildTenantWhere(db, opts.table, opts.policy, opts.orgId)
  const idCond = eq(opts.table.id, opts.id)
  const where = tenantWhere ? and(idCond, tenantWhere) : idCond

  const rows = await db.select().from(opts.table).where(where).limit(1)
  const row = rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  return {
    row,
    authorized: {
      resourceKey: opts.resourceKey,
      id: opts.id,
      orgId: opts.orgId,
      policy: opts.policy,
      __tenantAuthorized: true,
    },
  }
}

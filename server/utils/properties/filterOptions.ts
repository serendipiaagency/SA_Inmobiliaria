import { and, asc, eq, isNull } from 'drizzle-orm'
import { schema } from '../db'
import { CHANNELS } from '../publication/channels'
import { listOrgTags } from '../tags/service'
import { listDefinitions } from '../customFields/service'
import type { PropertyKind } from '../matching/service'

/**
 * Las opciones de los filtros del listado de propiedades (FASE 27, bloque
 * N7b) en una sola respuesta: oficinas, comerciales, etiquetas, campos
 * personalizados y portales. Va como `?view=filterOptions` del propio
 * listado (área Portal Web) en vez de pedir cada recurso por separado: así un
 * usuario con sólo Portal Web, que no lee Oficinas (CRM), también puede
 * filtrar por oficina. Todo acotado a la organización y sólo nombres: nada
 * que el listado no enseñe ya.
 */
export async function propertyFilterOptions(db: any, orgId: number, kind: PropertyKind) {
  const [offices, agents, tags, customFields] = await Promise.all([
    db
      .select({ id: schema.offices.id, name: schema.offices.name })
      .from(schema.offices)
      .where(and(eq(schema.offices.organizationId, orgId), isNull(schema.offices.deletedAt)))
      .orderBy(asc(schema.offices.name)),
    db
      .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
      .from(schema.teamMembers)
      .where(eq(schema.teamMembers.organizationId, orgId))
      .orderBy(asc(schema.teamMembers.name)),
    listOrgTags(db, orgId, [kind]),
    listDefinitions(db, orgId, 'property'),
  ])
  // La publicación multicanal sólo programa obra nueva: en 2ª mano no hay portal por el que filtrar.
  const portals = kind === 'developer' ? CHANNELS.filter((c) => c.type === 'portal' || c.type === 'marketplace' || c.type === 'own_web').map((c) => ({ key: c.key, label: c.label })) : []
  return { offices, agents, tags, customFields, portals }
}

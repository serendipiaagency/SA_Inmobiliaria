import { requireOrgScope } from '../../../utils/auth'

/**
 * Listado de clientes.
 *
 * Además de la fila, devuelve por cliente **actividad derivada de tablas
 * reales**: cuántas visitas y operaciones tiene y cuándo fue lo último. Se
 * calcula con dos consultas agregadas y se cruza en memoria, no con una
 * consulta por fila.
 *
 * El cruce es por **email (sin distinguir mayúsculas) o nombre exacto**,
 * porque no existe ninguna clave foránea a `clients`: visitas y operaciones
 * guardan el nombre del cliente, y a veces su email. Es el mismo criterio que
 * ya usan los endpoints de RGPD para localizar a una persona, y el mismo que
 * usa la ficha (`[resource]/[id]/related.get.ts`), que lo explica en detalle.
 *
 * `lifetime_value` y `deals_count` siguen devolviéndose porque la pantalla
 * anterior los mostraba, pero **nadie los mantiene**: sólo los escriben las
 * migraciones de siembra. Por eso los totales de cabecera ya no los suman —
 * ahora cuentan operaciones reales.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const q = getQuery(event)
  const type = String(q.type || '')
  const stage = String(q.stage || '')
  const agent = String(q.agent || '').trim()
  const search = String(q.search || '').trim()

  const where: string[] = ['organization_id = ?']
  const binds: any[] = [orgId]
  if (type && type !== 'all') { where.push('type = ?'); binds.push(type) }
  if (stage && stage !== 'all') { where.push('stage = ?'); binds.push(stage) }
  if (agent && agent !== 'all') { where.push('agent_name = ?'); binds.push(agent) }
  if (search) { where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR location LIKE ?)'); binds.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`) }
  const clause = `WHERE ${where.join(' AND ')}`

  const rows = (
    await raw
      .prepare(
        `SELECT id, name, email, phone, type, stage, lifetime_value AS lifetimeValue, deals_count AS dealsCount,
                agent_name AS agentName, location, created_at AS createdAt, updated_at AS updatedAt
         FROM clients ${clause} ORDER BY name COLLATE NOCASE LIMIT 200`,
      )
      .bind(...binds)
      .all<any>()
  ).results

  // Agregados por clave de cruce. Dos consultas para toda la página, no una
  // por cliente.
  const [visitAgg, dealAgg, agents] = await Promise.all([
    raw
      .prepare(
        `SELECT lower(coalesce(client_email,'')) AS email, client_name AS name,
                count(*) AS visits, max(scheduled_at) AS lastAt
         FROM visits WHERE organization_id = ?1 GROUP BY email, name`,
      )
      .bind(orgId)
      .all<any>(),
    raw
      .prepare(
        `SELECT client_name AS name, count(*) AS deals, coalesce(sum(deal_value),0) AS volume, max(closed_at) AS lastAt
         FROM deals WHERE organization_id = ?1 GROUP BY name`,
      )
      .bind(orgId)
      .all<any>(),
    raw
      .prepare("SELECT DISTINCT agent_name AS name FROM clients WHERE organization_id = ?1 AND agent_name IS NOT NULL AND agent_name <> '' ORDER BY name")
      .bind(orgId)
      .all<any>(),
  ])

  const visitsByEmail = new Map<string, any>()
  const visitsByName = new Map<string, any>()
  for (const v of visitAgg.results) {
    if (v.email) visitsByEmail.set(v.email, v)
    if (v.name) visitsByName.set(v.name, v)
  }
  const dealsByName = new Map<string, any>()
  for (const d of dealAgg.results) if (d.name) dealsByName.set(d.name, d)

  const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

  const enriched = rows.map((c) => {
    const email = c.email ? String(c.email).toLowerCase() : ''
    const v = (email && visitsByEmail.get(email)) || visitsByName.get(c.name) || null
    const d = dealsByName.get(c.name) || null
    return {
      ...c,
      visitsCount: v?.visits || 0,
      dealsClosed: d?.deals || 0,
      dealsVolume: d?.volume || 0,
      lastActivityAt: later(v?.lastAt || null, d?.lastAt || null),
    }
  })

  const totals = await raw
    .prepare(
      `SELECT count(*) AS total,
              sum(CASE WHEN stage='active' THEN 1 ELSE 0 END) AS active
       FROM clients WHERE organization_id = ?1`,
    )
    .bind(orgId)
    .first<any>()
  const dealTotals = await raw
    .prepare('SELECT count(*) AS deals, coalesce(sum(deal_value),0) AS volume FROM deals WHERE organization_id = ?1')
    .bind(orgId)
    .first<any>()

  return {
    rows: enriched,
    agents: agents.results.map((a: any) => a.name),
    stats: {
      total: totals?.total || 0,
      active: totals?.active || 0,
      // Operaciones y volumen reales de la tabla `deals`, no la columna
      // denormalizada que nadie actualiza.
      deals: dealTotals?.deals || 0,
      volume: dealTotals?.volume || 0,
    },
  }
})

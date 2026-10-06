# Dashboard comercial (FASE 33)

**CRM → Rendimiento** (`/admin/rendimiento`). Todos los números salen de
un único servicio de agregación, `server/utils/dashboard/commercial.ts`
(§104): nada se calcula en el navegador y no hay tabla de snapshots
(§102). Son unas pocas consultas agregadas acotadas por organización.

## Qué había antes

El dashboard de inicio (`pages/admin/index.vue` → `saas/overview.get.ts`)
lee `metrics_daily`, que sólo rellena la migración de demo `0009`. Ningún
código escribe ahí, así que sus cifras de leads, reservas e ingresos son
de demostración. Su embudo usa además el `leads.status` antiguo, no
`stage`. Ese dashboard no se ha tocado (sigue siendo el de inicio), pero el
comercial no depende de él para nada.

## Definiciones (cada tarjeta enseña la suya)

| KPI | Fuente | Definición |
| --- | --- | --- |
| Leads nuevos | `leads.created_at` | Creados dentro del periodo |
| Leads sin atender | `lead_sla_alerts` | Alertas SLA «sin atender» **abiertas ahora** (umbral de Enrutamiento y SLA). No es `status = new`. No depende del periodo |
| Primera respuesta | `leads.first_response_at − created_at` | Mediana y media en minutos de la cohorte del periodo que ya tiene respuesta humana real. Tiempo natural |
| Leads cualificados | `leads.qualified_at` | Primera entrada en «cualificado» dentro del periodo (evento, no estado actual) |
| Visitas próximas | `visits` | `property_viewing` programadas desde ahora |
| Visitas realizadas | `visits` | `property_viewing` completadas con fecha dentro del periodo |
| Ofertas | `offers.created_at` | Creadas en el periodo; una por oferta, nunca por revisión |
| Ofertas pendientes | `offers.status` | Enviadas o contraofertadas, ahora |
| Operaciones abiertas / cerradas | `deal_operations.opened_at` / `closed_at` | Dos cifras separadas, nunca una «operaciones» ambigua |
| Conversión | cohorte | Leads creados en el periodo con una operación cerrada ÷ leads creados en el periodo |
| Tareas vencidas | `tasks` | Abiertas con fecha límite pasada, ahora |

**Embudo (§90-92).** La cohorte son los leads creados en el periodo con el
filtro aplicado. Cada etapa cuenta cuántos de **esos** leads la
alcanzaron: respuesta humana real, cualificado, al menos una visita a
inmueble no cancelada, al menos una oferta y una operación no cancelada.
Nunca se dividen métricas de periodos distintos.

**Comparación (§80).** Sólo existe si se pide («Comparar con el periodo
anterior»): el periodo inmediatamente anterior de la misma duración, y se
enseñan ambas cifras.

## Segmentación (§93-100)

Los filtros se combinan y **todos** los KPIs, el embudo y la tabla usan el
mismo scope:

- **Comercial**: `leads.agent_id`. Las visitas, ofertas, operaciones y tareas se acotan por su propio comercial.
- **Oficina** (núcleo N8a): la **entidad** Oficina (`officeId`, CRM → Oficinas). Cuenta lo que tiene esa oficina asignada — `leads.office_id`, `visits.office_id`, `deal_operations.office_id` — y, si el registro no tiene oficina propia, la de su comercial (`team_members.office_id`). Las ofertas no tienen oficina propia: sólo la de su comercial. Las tareas sí desde la migración 0089 (cierre D3a): cuenta `tasks.office_id` y, si la tarea no tiene, la oficina de su responsable — la misma regla que el filtro de CRM → Tareas, al que enlaza el KPI («Tareas vencidas» → `/admin/tareas?bucket=overdue&officeId=…`). Antes era el texto `team_members.office_name`; el parámetro `office` (texto) se sigue aceptando para enlaces antiguos, pero el panel ya no lo ofrece. La tabla «Por comercial» enseña el nombre de la entidad (o el texto antiguo si la ficha aún no tiene oficina).
- **Origen**: `leads.source`.
- **Portal**: `leads.portal`. Los formularios de la web nunca lo rellenan, porque quien escribe en la web de la agencia no viene de un portal, y la plataforma no tiene integración directa con ningún portal (ver Marketplace). Desde el núcleo N8a lo rellena la captación real: `POST /api/v1/leads` con `source: 'portal'` y `portal` (obligatorio en ese caso; opcional `externalId`, que deduplica un reenvío del mismo lead), y el alta manual del lead (N3). El filtro sólo aparece cuando existen valores.
- **Campaña**: `leads.campaign` o `utm_campaign`.
- **Inmueble**: `leads.property_id`.

Visitas, ofertas y operaciones con filtros de captación (origen, portal,
campaña, inmueble) se cuentan a través de su lead.

Las opciones de cada filtro son sólo valores que existen en la agencia.

## Detalle (drill-down, §101)

«Leads nuevos», «Leads cualificados» y «Leads sin atender» abren
`/admin/leads` con el mismo scope en la URL: `createdFrom/To`,
`qualifiedFrom/To`, `agentId`, `officeScope` (la oficina con la misma regla que
el dashboard: la del lead o, sin ella, la de su comercial), `office` (texto,
enlaces antiguos), `portal`, `campaign`, `propertyId` y `unattended=1`. `leads.get.ts` los acepta y la página
enseña «Filtrado desde el dashboard · quitar». Las demás tarjetas llevan a
Visitas, Tareas, Compatibilidades u Operaciones.

## Permisos (§105-106)

- Exige lectura de **CRM** (además del área de la ruta).
- Sin importes: el dashboard cuenta, no suma dinero (§106).
- **Cada comercial ve sólo lo suyo** (núcleo N8a, `dashboardVisibilityFor()`
  en `server/utils/dashboard/commercial.ts`), con los permisos que ya existen
  (`server/utils/permissions.ts`) y el vínculo usuario ↔ comercial de la
  migración 0086 (`team_members.user_id`, campo «Usuario del panel» de la
  ficha del comercial):

  | Cuenta | Ve |
  | --- | --- |
  | `super_admin` | Toda la agencia activa |
  | Administrador sin restricciones (`users.permissions` NULL) | Toda la agencia (es el administrador de la agencia) |
  | Restringida con `system:write` | Toda la agencia: gestiona usuarios y permisos, así que restringirle la vista no protegería nada (podría quitarse la restricción) — es el «gerente» |
  | Restringida, sin `system:write`, vinculada a su ficha | **Sólo lo suyo**: el servidor fuerza `commercialId` = su ficha en KPIs, embudo, tabla y opciones de filtro (sus oficinas, sus campañas, sus inmuebles); lo que pida el navegador no lo cambia |
  | Restringida, sin `system:write`, sin ficha vinculada | Nada: 403 con el motivo (falla cerrada — sin vínculo no se sabe qué es «lo suyo») |

  La respuesta lleva `visibility` (`all` | `own`) y el panel lo dice con un
  aviso. **Alcance:** la regla se aplica al dashboard comercial. Los listados
  de Leads, Visitas y Ofertas siguen enseñando la agencia entera a cualquier
  lector del CRM (el detalle de una tarjeta abre Leads filtrado por su
  comercial, pero no le impide quitar el filtro): restringirlos es el
  siguiente paso, transversal, y no se ha hecho aquí.

## API (sin rutas nuevas)

- `GET /api/admin/saas/overview?view=commercial&from=AAAA-MM-DD&to=AAAA-MM-DD[&compare=1][&commercialId=&officeId=&office=&source=&portal=&campaign=&propertyId=]` — devuelve además `visibility`.
- `GET /api/admin/saas/overview?view=commercial-options`: opciones de los filtros (`offices` como `{ id, name }` de la entidad) y `visibility`.

## Pruebas

`test/unit/commercialDashboard.test.ts`:

- §137: un dataset de 1320 → 680 → 390 → 212 → 62 → 28 reproduce exactamente ese embudo.
- §138: oficina, comercial, origen, campaña y periodo combinados se aplican igual a todos los KPIs.
- Comparación, aislamiento entre agencias y validación del periodo.

`test/unit/nucleoN8a.test.ts` (núcleo N8a): la regla de visibilidad con cada
tipo de cuenta, el comercial forzado aunque se pida otro, las opciones
acotadas, y el filtro por la entidad Oficina (oficina propia del registro o
la de su comercial).

Hay además un e2e del recorrido en `tests/e2e/commercial-dashboard.spec.ts`.

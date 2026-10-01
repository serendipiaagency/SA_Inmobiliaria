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
- **Oficina**: `team_members.office_name` del comercial. No existe una entidad Office; es el dato real que hay.
- **Origen**: `leads.source`.
- **Portal**: `leads.portal`. Hoy ninguna entrada lo rellena, así que el filtro sólo aparece cuando existan valores.
- **Campaña**: `leads.campaign` o `utm_campaign`.
- **Inmueble**: `leads.property_id`.

Visitas, ofertas y operaciones con filtros de captación (origen, portal,
campaña, inmueble) se cuentan a través de su lead.

Las opciones de cada filtro son sólo valores que existen en la agencia.

## Detalle (drill-down, §101)

«Leads nuevos», «Leads cualificados» y «Leads sin atender» abren
`/admin/leads` con el mismo scope en la URL: `createdFrom/To`,
`qualifiedFrom/To`, `agentId`, `office`, `portal`, `campaign`,
`propertyId` y `unattended=1`. `leads.get.ts` los acepta y la página
enseña «Filtrado desde el dashboard · quitar». Las demás tarjetas llevan a
Visitas, Tareas, Compatibilidades u Operaciones.

## Permisos (§105-106)

- Exige lectura de **CRM** (además del área de la ruta).
- Sin importes: el dashboard cuenta, no suma dinero (§106).
- **Visibilidad por comercial: no existe en el RBAC actual.** Los usuarios
  tienen roles (`super_admin`, `admin`, `user`) y permisos por área, pero
  ningún vínculo con su ficha de comercial. Por eso cualquier lector del
  CRM ve las cifras de toda la agencia, igual que hoy ve todos los leads.
  Restringirlo a «sus métricas» exige primero ese vínculo y aplicarlo
  también a Leads, Visitas y Ofertas. Es una decisión transversal que no se
  ha improvisado aquí; mientras tanto, se filtra por comercial.

## API (sin rutas nuevas)

- `GET /api/admin/saas/overview?view=commercial&from=AAAA-MM-DD&to=AAAA-MM-DD[&compare=1][&commercialId=&office=&source=&portal=&campaign=&propertyId=]`
- `GET /api/admin/saas/overview?view=commercial-options`: opciones de los filtros.

## Pruebas

`test/unit/commercialDashboard.test.ts`:

- §137: un dataset de 1320 → 680 → 390 → 212 → 62 → 28 reproduce exactamente ese embudo.
- §138: oficina, comercial, origen, campaña y periodo combinados se aplican igual a todos los KPIs.
- Comparación, aislamiento entre agencias y validación del periodo.

Hay además un e2e del recorrido en `tests/e2e/commercial-dashboard.spec.ts`.

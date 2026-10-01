# Mapa del dominio (FASE 34 §141)

Una página por entidad del núcleo con lo mismo siempre: responsabilidad,
fuente de verdad, relaciones, permisos, límites de tenant e invariantes. El
detalle de cada una está en su documento propio, enlazado en cada sección.

Reglas comunes a todas:
- **Tenant.** Toda tabla de negocio lleva `organization_id`. Las rutas lo
  toman de `requireOrgScope()` y nunca del cliente. Las tablas hijas sin
  columna propia se aíslan por su padre (`tenantPolicy`). Un id de otra
  organización es siempre un 404, nunca un 403 que confirme que existe.
- **Permisos.** Por área (`utils/adminAreas.ts`), aplicados por la matriz
  `server/utils/adminRouteMatrix.ts` y por el handler
  (`docs/rbac-authorization-matrix.md`). No hay permisos por campo.
- **Escritura.** Las escrituras pasan por un servicio de dominio. La UI, la
  API pública y la Domain Tools API (INMO incluido) usan el mismo servicio
  (`docs/domain-tools.md`).

---

## Property — el inmueble

- **Responsabilidad.** Qué se vende o alquila: ubicación, superficies,
  distribución, características, precio, estado y publicación.
- **Fuente de verdad.** Dos catálogos: `developer_properties` (Propiedades
  web, obra nueva) y `agent_properties` (2ª mano). El catálogo forma parte de
  la identidad: `(propertyKind, propertyId)`. Lo que aplica a cada tipo lo
  decide el PropertySchemaRegistry.
- **Relaciones.** Rooms, media, planos, histórico de precio, matches, citas,
  tareas, ofertas, operaciones y conversaciones (por `propertyKind` +
  `propertyId`).
- **Permisos.** Área `web`.
- **Invariantes.**
  - Lo público sale sólo por `toPublicProperty()`, que quita las referencias
    internas y redacta la dirección según `locationPrivacy`.
  - Publicar exige los campos `requiredForPublish` del schema.
  - Cada cambio real de precio deja una fila de histórico.
  - Cerrar una operación marca `sold` una 2ª mano. A la obra nueva no se le
    inventa un estado de venta.
- **Docs.** `property-editor.md`, `property-schema-registry.md`,
  `property-search.md`.

## Contact — la persona

- **Responsabilidad.** Quién es alguien, una sola vez, con sus roles
  (comprador, vendedor…).
- **Fuente de verdad.** `contacts`, con email y teléfono normalizados.
  `clients` es legacy (`clientes.md`).
- **Relaciones.** Leads, necesidades, matches, citas (vía lead), tareas,
  ofertas y conversaciones.
- **Permisos.** Área `crm`.
- **Invariantes.**
  - La deduplicación sólo reutiliza una coincidencia **exacta** de una
    identidad normalizada.
  - Las coincidencias «posibles» se enseñan y nunca se fusionan solas.
  - El borrado es lógico (`deleted_at`).
- **Docs.** `matching-and-lead-pipeline.md`.

## Lead — la oportunidad comercial

- **Responsabilidad.** Una oportunidad de venta con una persona: fase,
  resultado, comercial, SLA, próxima acción y Lead Score.
- **Fuente de verdad.** `leads`, más `lead_stage_history` (inmutable),
  `lead_sla_alerts` y `lead_score_snapshots`.
- **Relaciones.** Contact (siempre resuelto), necesidades, citas, tareas,
  ofertas, operaciones y actividad.
- **Permisos.** Área `crm`.
- **Invariantes.**
  - Toda entrada pasa por `upsertLead()`, el punto único de entrada desde
    FASE 29.
  - Cada cambio de fase queda en el historial.
  - `first_response_at` sólo lo fija un cambio de fase hecho por una
    persona.
  - El score sólo lo calcula `recomputeLeadScore()`, con reglas
    deterministas y desglose; nunca a mano.
- **Docs.** `matching-and-lead-pipeline.md`, `lead-score.md`.

## BuyerRequirement — la necesidad

- **Responsabilidad.** Lo que una persona busca de verdad.
- **Fuente de verdad.** `buyer_requirements` + `buyer_requirement_criteria`
  (importancia por criterio).
- **Relaciones.** Contact, matches, ofertas y selecciones.
- **Permisos.** Área `crm`.
- **Invariantes.**
  - Una característica no mencionada no es un `false`.
  - El presupuesto «validado» lo marca una persona.
  - Una búsqueda exploratoria no crea una necesidad.
- **Docs.** `matching-and-lead-pipeline.md`.

## PropertyMatch — el estado comercial comprador ↔ inmueble

- **Responsabilidad.** En qué punto está un par necesidad ↔ inmueble.
- **Fuente de verdad.** `property_matches` (2ª mano) y
  `developer_property_matches` (web), únicos por (necesidad, inmueble).
- **Relaciones.** BuyerRequirement, Property y Contact.
- **Permisos.** Área `crm`.
- **Invariantes.**
  - El score lo recalcula siempre el motor en servidor, con su desglose.
  - A mano sólo se fija `new`, `selected` o `discarded`.
  - `sent`, `viewing` y `offered` los escriben los hechos reales: envío
    aceptado, visita con resultado y oferta creada. Sólo avanzan y nunca
    resucitan un descarte.
- **Docs.** `matching-and-lead-pipeline.md`.

## Appointment — el tiempo reservado

- **Responsabilidad.** Visitas, notaría, firma… cualquier cita, y su
  resultado.
- **Fuente de verdad.** `visits` (con `type`), más tours y paradas.
- **Relaciones.** Lead, Property, comercial, operación y tareas de
  seguimiento.
- **Permisos.** Área `crm`.
- **Invariantes.**
  - Sin solapes por comercial (índice único y comprobación de rango).
  - Mover o cancelar conserva la misma cita: cancelar nunca borra.
  - La hora es la local de la agencia tal como se ve en el calendario.
- **Docs.** `calendar.md`.

## Task — el trabajo pendiente

- **Responsabilidad.** Algo que alguien tiene que hacer y cuándo.
- **Fuente de verdad.** `tasks`.
- **Relaciones.** Lead, Contact, Property, cita, operación y responsable
  (`team_members`).
- **Permisos.** Área `crm`.
- **Invariantes.**
  - Todas sus referencias son de la misma organización (validado en
    `createTask()` desde FASE 31).
  - Crearla, completarla o cambiar su fecha recalcula la próxima acción del
    lead.
- **Docs.** `tasks.md`.

## Activity — lo que ya ocurrió

- **Responsabilidad.** El timeline de negocio.
- **Fuente de verdad.** `activities`, sólo INSERT.
- **Relaciones.** Cualquier entidad, por referencias.
- **Permisos.** Área `crm`, lectura.
- **Invariantes.**
  - Nunca se edita ni se borra.
  - No guarda el contenido de notas ni mensajes, sólo qué pasó.
  - No se inventa historia hacia atrás (sin backfill).
- **Docs.** `activity.md`.

## Offer — la propuesta económica

- **Responsabilidad.** Una oferta de compra y su negociación.
- **Fuente de verdad.** `offers` + revisiones inmutables.
- **Relaciones.** Property, comprador (Contact), lead, necesidad, match,
  comercial y operación.
- **Permisos.** Área `crm`.
- **Invariantes.**
  - Cada cambio de importe o condiciones es una revisión nueva.
  - Aceptar comprueba que se acepta la revisión vigente.
  - Nunca cambia el precio de la propiedad.
- **Docs.** `offers.md`.

## Deal — la operación

- **Responsabilidad.** De la oferta aceptada al cierre: etapas, documentos y
  firma.
- **Fuente de verdad.** `deal_operations` (+ historial de etapas). `deals`
  es legacy de comisiones e ingresos, enlazado al cerrar (`legacyDealId`).
- **Relaciones.** Oferta aceptada, Property, comprador, vendedores, citas
  (notaría y firma) y tareas.
- **Permisos.**
  - `deal_operations`: área `crm`.
  - `deals` legacy, ingresos y comisiones: área `finance`.
- **Invariantes.**
  - Sólo nace de una oferta aceptada.
  - Las etapas se registran en su historial.
  - Cerrar marca `sold` la 2ª mano.
  - Facturación es otro dominio.
- **Docs.** `deals.md`.

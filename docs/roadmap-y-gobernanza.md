# Roadmap y gobernanza de módulos (FASE 34)

Este documento fija **qué es núcleo, qué viene después y en qué orden**, sobre
el estado real del repositorio a 2026-10-01. No sustituye a los documentos
de dominio. Dice cómo decidir qué se construye a continuación sin romper lo
que ya funciona.

## Principio: CORE FIRST

```
DATA → DOMAIN SERVICES → WORKFLOWS → TOOLS → AUDITABILITY → AUTOMATION → ADVANCED AI
```

Un módulo de una capa no se construye mientras la capa de debajo tenga
defectos P0/P1. Ningún módulo avanzado puede escribir en el dominio salvo por
los servicios de dominio. En el caso de la IA, a través de la Domain Tools
API (`docs/domain-tools.md`): permisos, validación, idempotencia, traza y
confirmación.

## Core 8: el núcleo que tiene que funcionar como sistema

| Área | Fuente de verdad | Documento |
| --- | --- | --- |
| Property | `developer_properties` (web) y `agent_properties` (2ª mano) + PropertySchemaRegistry | `property-editor.md`, `property-schema-registry.md`, `property-search.md` |
| Contact | `contacts` | `matching-and-lead-pipeline.md` |
| Lead | `leads` (+ `lead_stage_history`, routing, SLA, Lead Score) | `matching-and-lead-pipeline.md`, `lead-score.md` |
| BuyerRequirement | `buyer_requirements` + `buyer_requirement_criteria` | `matching-and-lead-pipeline.md` |
| Matching | `matching/engine.ts` (puro) + `property_matches` / `developer_property_matches` | `matching-and-lead-pipeline.md` |
| Appointment | `visits` (todas las citas: visita, notaría, firma…), con su resultado | `calendar.md` |
| Task | `tasks` + próxima acción del lead | `tasks.md` |
| Activity | `activities` (inmutable) | `activity.md` |

Se validan juntos en tres E2E:
- `tests/e2e/principal-flow.spec.ts` (FASES 20-24);
- `tests/e2e/principal-flow-fase25-29.spec.ts` (§193);
- `tests/e2e/real-estate-os-final.spec.ts` (§158 de este bloque).

El último recorre de María-contacto a operación cerrada y pasa por la Domain
Tools API en cada paso que el encargo nombra como herramienta. Los tres se
repiten para **Propiedades (web)** y **Propiedades 2ª mano** (§124).

## Entidades que podrían estar duplicadas (§142)

| Par | Estado real | Decisión |
| --- | --- | --- |
| Client vs Contact | `clients` es legacy (ficha 360º de `/admin/clientes`, sin claves foráneas hacia ella). Contact es la persona del dominio desde FASE 10 | Contact es la fuente de verdad. `clients` no se borra ni se migra sin decisión del propietario (`clientes.md`) |
| Agent vs Commercial | El comercial es `team_members`. Existe además una tabla `agents` que ninguna página usa (`auditoria-pre-piloto.md`) | Comercial = `team_members`. Retirar `agents` es decisión del propietario |
| Visit vs Appointment | Una sola tabla, `visits`, con `type` (visita, notaría, firma…). No hay duplicado | — |
| Todo vs Task | Sólo `tasks` | — |
| TimelineEvent vs Activity | Sólo `activities` | — |
| Proposal vs Offer | Sólo `offers` (+ revisiones) | — |
| Transaction vs Deal | `deal_operations` es la operación (FASE 24). `deals` es legacy de comisiones, con un puente `legacyDealId` al cerrar | `deal_operations` manda. `deals` se conserva para ingresos y comisiones (`deals.md`) |
| Requirement vs BuyerRequirement | Sólo `buyer_requirements` | — |

## Módulos posteriores: estado real y regla para cada uno

Ninguno se desarrolla en paralelo mientras el núcleo tenga P0/P1 abiertos. Lo
que ya existe **no se borra**: se audita y se mantiene compatible, sin dejar
que condicione el diseño del núcleo.

| Módulo | Qué existe hoy | Preparado en el núcleo | Regla |
| --- | --- | --- | --- |
| Portales (Idealista, Fotocasa…) | Publicación multicanal con 18 canales, **todos** en el adaptador «no implementado» (`publication-channels.md`) | `requiredForPortal` por campo en el PropertySchemaRegistry. Estado de publicación por canal | Sin integración ficticia: un canal se implementa cuando hay documentación oficial y credenciales |
| MLS | Nada | `external_source` / `external_reference` en los dos catálogos (procedencia) | No se mezcla con Property Core. Entra por un adaptador que escribe por los servicios |
| Firma electrónica | Contratos con enlace simple | La operación (`deal_operations`) tiene etapa `signature` y cita de firma real | Sin proveedor falso |
| Facturación | Facturas y depósitos Stripe (`stripe-payments.md`) | Dominio separado de Deal. El único puente es `legacyDealId` de comisiones | No se mezcla con Deal |
| Escaparates / widgets / redes sociales | Widgets, formatos sociales y Constructor Web | Consumen DTOs públicos (`toPublicProperty`) | No leen filas internas |
| Property Intelligence | Tasador (AVM) básico | Search, Matching, Activity y Deals ya fiables | Nada de modelos avanzados sin histórico real suficiente |
| Marketplace / franquicias | Página de marketplace. Multi-organización real | Aislamiento por `organization_id` en todo | Producto por definir, sin código especulativo |
| IA avanzada | INMO (FASE 30) sobre la Domain Tools API. **Sin RAG**: no hay base documental indexada | Domain Tools con permisos, validación, idempotencia, traza y confirmación | Ningún agente autónomo modifica el dominio fuera de las Domain Tools. Un futuro RAG es otra herramienta de lectura con su propia procedencia, nunca el buscador de propiedades |
| Automatizaciones | Tabla `automations` legacy (nada la ejecuta) | Eventos de Activity, Domain Tools y servicios | Sprint 13: trazables, configurables, desactivables, con permisos y auditoría. Nunca «script de IA → UPDATE directo» |

## Sprints (roadmap arquitectónico)

Las FASES de los encargos y estos sprints no coinciden en número. Cuando un
sprint ya se implementó en una fase anterior, no se duplica: se audita, se
completa, se prueba y se cierra.

| Sprint | Contenido | Estado |
| --- | --- | --- |
| 0 | Auditoría y arquitectura del dominio | Cerrado (auditorías por bloque en cada PR) |
| 1 | Property Model completo | Cerrado (Property Core FASES 1-4, PropertySchemaRegistry) |
| 2 | UX de alta y edición de Properties | Cerrado (FASE 25: editor compartido, autoguardado, borrador/publicar) |
| 3 | Media, Documents y Owners | Parcial: media y documentos del comercial sí; **propietarios (owners) como entidad, no** |
| 4 | Contacts CRM 360 | Cerrado (FASE 10 + ficha 360º) |
| 5 | Buyer Requirements | Cerrado (FASE 10) |
| 6 | Leads, Pipeline y Deduplication | Cerrado (FASES 12-16, Lead Score FASE 32) |
| 7 | Calendar / Appointments / Visits | Cerrado (FASES 17-20) |
| 8 | Activity Timeline y Tasks | Cerrado (FASES 21-22) |
| 9 | Buyer ↔ Property Matching | Cerrado (FASE 11 + avance automático de PropertyMatch en FASE 34) |
| 10 | Offers y Deal inicial | Cerrado (FASES 23-24) |
| 11 | Commercial Dashboard | Cerrado (FASE 33). Pendiente: la visibilidad «sólo lo mío» necesita un vínculo usuario ↔ comercial que el RBAC no tiene |
| 12 | INMO Domain Tools | Cerrado (FASES 30-31) |
| 13 | Automations + INMO Intelligence | No empezado (ver la regla de automatizaciones) |
| 14 | Distribution / Portals / Advanced Modules | Bloqueado por credenciales y documentación de terceros |

### Gate entre sprints (§120)

No se avanza mientras haya un P0/P1 que invalide el núcleo anterior. En la
práctica, cada PR que llega a `main` pasa por:
- el gate completo de CLAUDE.md (typecheck, lint, unit, build, migraciones, e2e);
- el pipeline de producción (backup D1 → migraciones → deploy → smoke).

Un cambio de esquema va **antes** que el código que lo usa (migración sola,
desplegada; después el código). Es la lección del 2026-09-15.

### Criterio de cierre por sprint (§121)

Modelo y migraciones seguras, sin backfill inventado. Servicios de dominio,
API y DTOs. Aislamiento por organización y permisos. Validación en servidor
y en cliente. UI responsive con estados de carga, vacío y error. Pruebas
unitarias, de integración y E2E críticas. Documentación y observabilidad.
Lint, typecheck, build y validación de migraciones. Datos legacy
preservados y smoke en producción.

## Pendientes reales que este documento no esconde

- **Propietarios (owners)** como entidad estructurada: no existen.
- **Permisos por campo**: el RBAC es por área. No existe un «precio mínimo
  autorizado». Si se añade, debe ir con permiso propio y fuera de los DTOs
  públicos e internos actuales.
- **Zona horaria por agencia**: las citas guardan la hora local tal como se
  escribe en el calendario, sin zona.
- **RAG / base documental**: no existe.
- **Visibilidad por comercial**: no hay vínculo usuario ↔ comercial.

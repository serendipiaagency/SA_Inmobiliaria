# Lead Score explicable (FASE 32)

`leads.score` era un número mágico: `upsertLead()` le sumaba un «bump» fijo
(10 por defecto, 25 en una reserva, 30 en el formulario de visitante, 15 en
referidos) cada vez que la persona volvía a escribir, con tope en 100, sin
desglose ni historial. Desde la migración `0083` es una puntuación **por
reglas deterministas sobre señales reales**, con su «¿por qué?».

## Qué es y qué no es

- **Es** la prioridad comercial de un lead: 0-100, más alto = más cerca de comprar.
- **No es** el Match Score (compatibilidad necesidad ↔ inmueble, `matching/`).
- **No** cambia el enrutado: el routing sigue con sus reglas (§75).
- **No** sustituye al SLA: un lead con 10 puntos sigue teniendo plazo de respuesta (§76).

## Criterios (catálogo cerrado, `server/utils/leads/score.ts`)

| Criterio | Puntos por defecto | Fuente real |
| --- | --- | --- |
| `budget_validated` | +20 | BuyerRequirement activa con `budget_validated = 1` (validado por una persona) |
| `purchase_horizon` | +15 (90 días) | BuyerRequirement: `desired_date` dentro del plazo, o `urgency` high/urgent |
| `responded_recently` | +15 (24 h) | Mensaje de WhatsApp entrante, llamada entrante contestada (WhatsApp Calling con `answered_at`, o anotada a mano como contestada) o (FASE 29, email entrante) respuesta del cliente por email a un hilo web de ese lead o de su Contact (`comms_web_messages` `in` por `email`; un mensaje del chat web no cuenta) |
| `viewing_requested` | +20 | Una visita `property_viewing` del lead no cancelada |
| `financing_validated` | +10 | BuyerRequirement: `mortgage_status` en {aprobada, preaprobada, sin hipoteca} (configurable) |
| `opened_listings` | +4 (≥ 3) | Fichas enviadas con apertura confirmada, distintas: `property_share` de WhatsApp con lectura confirmada por el proveedor **o** (núcleo N8a) enlace personal abierto, enviado por email o por el chat web (`property_share_links.first_opened_at`) |
| `no_response` | −10 (14 días), **desactivada** | Días sin ninguna entrada real desde nuestro último saliente |

Con las reglas por defecto, un lead que cumple los seis positivos puntúa
**84**; sin la financiación, **74** (los casos §135/§136 del encargo, en
`test/unit/leadScore.test.ts`). El resultado se acota a 0-100.

### Lo que no se usa, a propósito

- `leads.updatedAt` ni ningún texto libre: «respondió» sale de mensajes y llamadas reales (§61).
- Reenviar el formulario web no es una señal (antes era el «bump»).
- **Visitas anónimas a fichas en la web**: la web sólo conoce una cookie anónima
  (`property_views.visitor_id`); enlazarla a un lead sería perfilar a una
  persona sin su consentimiento. Sólo cuentan las aperturas de una ficha que
  **se le envió** a esa persona (§64): la confirmación de lectura de WhatsApp,
  o la apertura de su enlace personal (abajo).

### Aperturas por email y por el chat web (núcleo N8a, FASE 32)

Antes «abrió fichas» sólo contaba WhatsApp, porque es el único canal con acuse
de lectura. Las selecciones de propiedades no tienen enlace público ni registro
de aperturas, y una ficha enviada por email no dejaba ningún rastro
verificable. Ahora, cuando desde Comunicaciones se comparte una ficha de obra
nueva por email o por el chat web con una persona conocida (el hilo tiene
Contact o Lead), el enlace es **personal**: `/propiedades/<slug>?f=<token>`,
con una fila en `property_share_links` (migración 0087; sólo se guarda el
SHA-256 del token).

Una apertura sólo cuenta si:

- llega con el token de ESE enlace, de ESA agencia (la del host) y de ESA
  propiedad — otro token, otra propiedad u otra agencia se ignoran;
- la registra el navegador al pintar la ficha (`POST
  /api/public/properties/:slug/view` con `{ f }`), no el GET del enlace: los
  escáneres de enlaces del correo que sólo descargan la URL no ejecutan esa
  llamada (uno que ejecute JavaScript sí podría contar; es el límite honesto
  de este método, sin acuse de lectura del proveedor).

La primera apertura deja `PROPERTY_SHARE_OPENED` en Activity (`metadata.via =
'link'`, con el canal) y recalcula el lead (o los leads del Contact). En el
desglose, el criterio dice cuántas de las fichas abiertas lo fueron por enlace
personal. Las fichas se cuentan **distintas** entre los dos caminos: la misma
propiedad leída por WhatsApp y abierta por el enlace cuenta una vez. 2ª mano no
tiene página pública, así que no tiene enlace personal.

## Reglas por agencia

`lead_score_rules` (una fila por criterio, sólo si la agencia lo cambia;
sin filas = reglas por defecto). Se configuran en **CRM → Enrutamiento y
SLA → Lead Score**: activar/desactivar, puntos (−100..100) y la ventana de
cada criterio. El servidor valida todo (`saveLeadScoreRules`): criterio
desconocido, puntos o ventanas fuera de rango → 422.

## Historial y reproducibilidad

- Proyección en el lead: `score`, `score_breakdown_json`, `score_computed_at`, `score_expires_at`.
- `lead_score_snapshots`: una fila **sólo cuando cambia** la puntuación o
  los criterios que la componen, con las **reglas efectivas usadas**
  (`rules_json`), la versión del motor y el motivo (`created`, `signal`,
  `rules`, `manual`, `expiry`). Mismo lead + mismas señales + mismas reglas
  + mismo instante = mismo resultado (`evaluateLeadScore` es pura).
- `score_computed_at` NULL = puntuación heredada del sistema anterior: se
  enseña como tal («*», «sin desglose») hasta recalcularla. **No se
  inventa historial** (§150): la migración no reescribe ninguna fila.

## Cuándo se recalcula (§70)

Sólo cuando cambia una señal relevante, nunca el tenant entero por
cualquier cambio:

- alta o reentrada de un lead (`upsertLead`);
- alta/edición de una BuyerRequirement o validación del presupuesto (todos los leads de ese Contact);
- cualquier cita creada, reprogramada o cancelada (vía `syncLeadNextAction`, por donde pasan todos los caminos);
- mensaje entrante, lectura confirmada de una ficha enviada, mensaje saliente, llamada entrante contestada;
- primera apertura de un enlace personal a una ficha (núcleo N8a);
- el cron horario `leads:sla-check`: sólo los leads con `score_expires_at` vencido (la primera señal temporal que caduca);
- a mano: «Recalcular» en el detalle, la acción en bloque «Recalcular puntuación», o «Recalcular todos los leads» tras cambiar las reglas (framework de acciones en bloque, hasta 2000 por job).

## API (sin rutas nuevas — margen de claves de ruta = 0)

| Qué | Dónde |
| --- | --- |
| Desglose + historial de un lead | `GET /api/admin/saas/leads?scoreFor=<id>` |
| Ordenar / filtrar | `GET /api/admin/saas/leads?sort=score&scoreMin=50` |
| Recalcular uno | `PATCH /api/admin/saas/leads/:id` `{ score: 'recalculate' }` |
| Reglas | `GET /api/admin/saas/leads-routing/sla-settings?scope=score`, `PUT …/sla-settings` `{ scoreRules: [...] }` |
| Recalcular en bloque | `POST /api/admin/lead-bulk-jobs` `{ action: 'recalculate_score', ids }` o `{ …, selectAllFiltered: true }` (todos) |

Todas pasan por `requireOrgScope()` y el área `crm` de la matriz de
permisos; el servicio acota cada lectura y escritura por organización.

## Piezas

| Pieza | Fichero |
| --- | --- |
| Motor, señales, reglas, historial | `server/utils/leads/score.ts` |
| Migración | `migrations/0083_lead_score.sql` |
| Ganchos | `server/utils/leads.ts`, `leads/nextAction.ts`, `buyerRequirements/service.ts`, `comms/inbox.ts`, `comms/calls.ts`, `comms/shareLinks.ts` (enlaces personales), `server/tasks/leads/sla-check.ts`, `bulkActions/leadActions.ts` |
| Interfaz | `components/admin/LeadScoreBadge.vue`, `pages/admin/leads/index.vue`, `pages/admin/enrutamiento.vue` |
| Pruebas | `test/unit/leadScore.test.ts`, `test/unit/nucleoN8a.test.ts` (aperturas por enlace personal) |

# Automatizaciones reales (bloque N8b, FASE 34)

`/admin/automatizaciones` era una demo: filas sembradas por
`0009_seed_saas.sql` con contadores inventados que nada ejecutaba. Ahora es un
motor real: «cuando pase X, si se cumple Y, haz Z», sobre hechos que ya
quedan registrados en el dominio y con acciones que son Domain Tools.

## Piezas

| Pieza | Dónde |
| --- | --- |
| Catálogo (disparadores, condiciones, acciones, variables) | `utils/automationCatalog.ts` |
| Alta, edición, activación y validación | `server/utils/automations/service.ts` |
| Motor | `server/utils/automations/engine.ts` |
| Cron (cada minuto) | `server/tasks/automations/run.ts` (`* * * * *` en `nuxt.config.ts`) |
| API | recurso genérico `automations` (`/api/admin/automations`, área CRM); `saas/automations` se mantiene por compatibilidad |
| Registro de ejecuciones | tabla `workflow_runs` (migración 0088) |

## Disparadores (sólo hechos reales)

| Disparador | Fuente |
| --- | --- |
| Lead creado | `activities` `LEAD_CREATED` |
| Lead sin atender (SLA) | `lead_sla_alerts` tipo `unattended` (el control de SLA es horario) |
| Lead cambia de etapa | `lead_stage_history` (también perdido y reactivado) |
| Visita realizada | `activities` `VIEWING_COMPLETED` |
| Oferta aceptada | `activities` `OFFER_ACCEPTED` |
| Operación cambia de etapa | `activities` `DEAL_STAGE_CHANGED` |
| Tarea vencida | `tasks` abiertas con `due_at` pasado, en hora local de la agencia, que vencen después de activar la regla |

Cada automatización guarda un **cursor** (`cursor_id`): sólo procesa eventos
posteriores a crearla o activarla. Lo que pasó mientras estaba apagada no se
recupera.

## Acciones

Crear tarea, asignar el lead, cambiar la etapa del lead, añadir una nota y
avisar al equipo (campana del panel). Cada una es una Domain Tool ejecutada
con `executeTool()`. **No hay envíos a clientes**: en el panel un envío
(WhatsApp, email) exige que una persona pulse «Confirmar»
(`requiresConfirmation`), y una automatización no puede confirmar por nadie.
El motor lo comprueba otra vez antes de ejecutar.

## Permisos y aislamiento

- Quien crea, edita o activa una regla tiene que poder ejecutar la acción él
  mismo (`assertCanRun`, 403 si no); pasa a ser su configurador.
- El motor ejecuta con la organización de la regla y el usuario configurador
  **tal como está en ese momento** (`loadConfigurer`): si ya no es
  administrador de esa agencia, la ejecución falla con `PERMISSION_DENIED`
  y queda en el registro. Nunca se amplían permisos.
- Todas las lecturas del motor van con `organization_id` de la regla.
- La ruta `saas/automations` pasa del área Finanzas a CRM en la matriz de
  rutas (`server/utils/adminRouteMatrix.ts`): sus disparadores y acciones son
  de CRM. El perfil «Facturación y operaciones» (lectura de CRM) sigue
  viéndolas, sin poder cambiarlas.

## Garantías

- Un evento dispara una regla **una sola vez**: índice único
  `workflow_runs (automation_id, event_key)` (reclamar y procesar).
- Freno contra bucles: como mucho 5 ejecuciones en 24 h de la misma regla
  sobre la misma ficha (`MAX_RUNS_PER_ENTITY_PER_DAY`).
- Topes por pasada: 25 eventos por regla y 100 ejecuciones por agencia.
- Desactivada = no se carga: no ejecuta nada. «Procesar ahora» sobre una
  desactivada responde 422.

## Filas de demostración heredadas

La migración 0088 añade `engine` con valor por defecto `legacy`, así que
todas las filas que ya existían quedan marcadas como heredadas **sin ningún
UPDATE**. El motor sólo lee `engine = 'v1'` (las que crea el panel), el panel
no deja activar ni editar una heredada, y borrarla es una acción del panel
(borrado lógico). La migración no borra nada.

## Pruebas

- `test/unit/automationsEngine.test.ts`: disparo, condiciones, acción,
  registro, una vez por evento, desactivada no ejecuta, permisos del
  configurador, aislamiento entre agencias y filas heredadas.
- `tests/e2e/nucleo-n8b.spec.ts`: «lead creado → crear tarea» contra la D1
  local, condición que no se cumple («No aplica»), sin repetir al procesar
  otra vez, desactivada (422) y otra agencia (404).

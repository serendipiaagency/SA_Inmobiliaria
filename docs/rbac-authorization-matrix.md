# Autorización del panel de administración (matriz de áreas)

Bloque 01 — *Permisos efectivos en todas las APIs*.

Este documento describe cómo se autoriza hoy una petición a `/api/admin/**`,
qué significa exactamente cada estado de `users.permissions`, cómo se migró el
comportamiento anterior sin romper cuentas existentes, y cómo revertir el
cambio si hiciera falta.

---

## 1. El defecto que corrige

Antes de este bloque:

- **147 de las 156 rutas administrativas** llamaban a `requireOrgScope(event)`
  sin indicar área ni acción. El parámetro existía (`requireOrgScope(event,
  area, action)`) pero solo lo usaban las nueve rutas del motor genérico de
  recursos. Todo lo demás — claves de API, contratos, exportación RGPD, CMS,
  planificador de publicación, exportación de materiales — quedaba accesible a
  cualquier admin de la organización, dijera lo que dijera el editor de
  permisos. El filtrado del menú lateral era lo único que lo tapaba, y el menú
  no interviene en una petición HTTP directa.

- **`parsePermissions()` fallaba en abierto.** `null`, `''`, `'[]'` y un JSON
  ilegible devolvían todos lo mismo: `null` = «sin restricción» = acceso
  total. Es decir, la forma natural de expresar «esta cuenta no puede nada»
  (una lista vacía) concedía todo, y un valor corrupto también.

Evidencia del estado previo (commit `e88edc6`):

```
$ grep -rn "requireOrgScope(event)"  server/ --include=*.ts | wc -l   # 147
$ grep -rn "requireOrgScope(event,"  server/ --include=*.ts | wc -l   #   9
```

---

## 2. Los tres estados de `users.permissions`

| Valor almacenado | Significado | Resultado |
| --- | --- | --- |
| `NULL` (o `''`) | Sin restricción configurada | Acceso total, como antes de que existiera el RBAC. Es el valor de **todas** las cuentas históricas. |
| `["crm:read","cms:write", …]` | Restringido a esas áreas | Solo esas áreas. `write` implica `read` en la misma área. |
| `[]` | Restringido a **ninguna** área | Deniega todo (salvo el armazón del panel: ver §4). |
| JSON ilegible / no-array | Configuración inválida | Deniega todo, y deja un aviso en el log con el id de usuario, la ruta y el request-id. Nunca el valor almacenado ni el email. |

`super_admin` ignora la columna por completo, igual que ignora el resto de
comprobaciones de rol.

**Escritura validada.** `POST`/`PUT` de `users` rechazan con `422` cualquier
valor de `permissions` que no sea `null`, `[]` o un array de cadenas
`"<área>:read|write"` con un área real. Así la única forma de que exista una
fila inválida es una escritura hecha fuera de la aplicación (un `UPDATE`
manual, una restauración) — justo el caso en que denegar es lo correcto.

---

## 3. Dónde se decide: la matriz

`server/utils/adminRouteMatrix.ts` es la lista explícita de reglas
`ruta+método → {área, acción}`. Se aplica en
`server/middleware/01.admin-rbac.ts`, **antes** del handler.

Puntos de diseño:

- **La acción sale del método**: `GET`/`HEAD` son lectura; `POST`, `PUT`,
  `PATCH`, `DELETE` son escritura. Las excepciones están escritas como reglas
  con acción fija y comentadas en el sitio (hoy solo
  `scheduler/notifications`, donde marcar como leída una notificación que ya
  puedes ver no es un cambio de datos de negocio).
- **El motor genérico no se duplica**: para `/api/admin/<recurso>/...` el área
  se lee del `area` que cada recurso ya declara en
  `server/utils/adminResources.ts`.
- **Denegación por defecto**: una ruta admin sin regla se deniega para una
  cuenta restringida. `test/unit/adminRouteMatrix.test.ts` recorre todos los
  ficheros de `server/api/admin/**` y falla si alguno no resuelve a una regla,
  así que esa denegación por defecto no debería llegar a ocurrir — es la red,
  no el plan.
- **No sustituye a los handlers**: cada endpoint conserva su propio
  `requireOrgScope(...)`. Las nueve rutas ya anotadas comprueban dos veces.
- **No toca el aislamiento por organización.** El área dice *qué* puedes
  tocar; `organizationId` dice *de quién*. Son independientes y se aplican los
  dos: un admin con `web:write` que pide el id de una propiedad de otra
  agencia sigue recibiendo `404`.

### Reparto por área

| Área (grupo del menú) | Rutas |
| --- | --- |
| `general` (General) | `stats`, `saas/overview`, `saas/analytics` |
| `crm` (CRM) | `saas/leads`, `saas/clients`, `saas/visits`, `saas/reservations`, `saas/appointments-analytics`, `saas/referrals`, `saas/referral-links` |
| `web` (Portal Web) | `geocode`, `site-pages/**`, `scheduler/**`, `asset-export/**`, y los recursos genéricos de catálogo (propiedades, comerciales, comunidades, planos…) |
| `finance` (Finanzas & Growth) | `saas/invoices`, `saas/deals`, `saas/deals-revenue`, `saas/contracts`, `saas/contract-templates`, `saas/deposits`, `saas/stripe-events`, `saas/valuations`, `saas/automations`, `saas/apikeys`, `ai/generate` |
| `cms` (Blog & CMS) | `cms/**` y los recursos genéricos `cms-*` |
| `content` (Contenido) | `saas/agents/**` (disponibilidad del Equipo), recursos `blogs`, `team`, `team-member-documents` |
| `inbox` (Bandeja) | recursos `visitor-submissions`, `vendor-registrations`, `contact-messages` |
| `system` (Sistema) | `saas/settings`, `saas/email-log`, `saas/webhooks/**`, `saas/gdpr/**`, recursos `users`, `organizations`, `audit-log`, `error-logs` |

### Rutas deliberadamente fuera de una única área

| Ruta | Tratamiento | Motivo |
| --- | --- | --- |
| `/api/admin/resources`, `/api/admin/active-org-info` | Cualquier admin | Son la estructura del panel (etiquetas de recursos, nombre y logo de la organización). Sin ellas, una cuenta restringida no puede ni dibujar la pantalla a la que sí tiene derecho. No devuelven datos de negocio. |
| `/api/admin/active-org` | Solo `super_admin` | Selector de organización; el handler ya lo exige. |
| `/api/admin/upload`, `/api/admin/upload/**` | Escritura en **alguna** área | Un mismo endpoint sirve al constructor de propiedades, al CMS, al constructor web, al exportador y a los formularios genéricos, y la petición no dice cuál. Exigir escritura en alguna área impide que una cuenta de solo lectura suba objetos al bucket, sin fingir una precisión que el endpoint no tiene. |
| `/api/media/**` | Fuera de la matriz | Es la frontera de servicio de R2, compartida por todas las áreas, y ya comprueba la propiedad de cada objeto por organización y registra los accesos confidenciales. Acotarla por área exigiría un área por objeto almacenado. |

---

## 4. Alineación de menú, páginas y botones

- `utils/adminNav.ts` contiene la navegación **y** el mapa página → área. Lo
  consumen `layouts/admin.vue` (oculta los grupos sin lectura) y
  `middleware/admin.ts` (redirige a una página permitida si se escribe la URL
  a mano). Antes la navegación vivía dentro del layout y no había forma de
  que el guard de ruta usara la misma tabla.
- `composables/useAdminPermissions.ts` expone `canRead` / `canWrite` con las
  mismas funciones del servidor.
- Las páginas genéricas de recurso ocultan «+ New» y «Delete», y muestran la
  ficha en modo lectura, cuando la cuenta solo tiene `read` en esa área.
- La campana de notificaciones del layout solo aparece con `web:read`, que es
  el área a la que pertenecen esas notificaciones.

Todo esto es *alineación*, no protección: lo que decide sigue siendo el
middleware del servidor.

### Límite conocido

El constructor de propiedades (`components/property-builder/**`) y el
constructor web conservan sus propios botones de guardado sin comprobación de
área en el cliente. Una cuenta de solo lectura que llegue a esas pantallas por
enlace directo verá los botones, y la API le responderá `403` al pulsarlos. Es
una asimetría de interfaz, no un agujero de autorización; queda anotada aquí
en lugar de arreglarse a medias dentro del alcance de este bloque.

---

## 5. Transición compatible (migración 0061)

El riesgo del cambio no es el código nuevo: es que una fila que **hoy**
funciona como «acceso total» por la vía del fail-open pase a denegar en el
mismo despliegue, dejando a alguien fuera de su propio panel.

`migrations/0061_normalize_user_permissions.sql` normaliza a `NULL`
exactamente esas filas — vacías, `'[]'` o JSON ilegible — *antes* de que el
código nuevo empiece a denegarlas. `NULL` sigue significando lo que ellas
significaban, así que **ninguna cuenta existente cambia de comportamiento al
desplegar**. A partir de ahí, un `[]` o un JSON roto solo puede haber llegado
después del cambio, y ahí sí es una decisión deliberada o un error real.

Es aditiva (no toca el esquema), no destructiva (no borra filas ni permisos
concedidos) e idempotente (una segunda ejecución no encuentra nada que
cambiar). Verificada en aislamiento y aplicada limpia sobre la D1 local.

**Orden de despliegue**: la migración debe aplicarse *antes o junto con* el
código. Si el código llegara primero, las filas aún sin normalizar quedarían
denegando hasta que la migración corra.

---

## 6. Reversión

Por orden de menor a mayor alcance:

1. **Devolver el acceso a una cuenta concreta**, sin tocar código: un
   `super_admin` abre Sistema → Usuarios → la ficha, y marca «Acceso
   completo». Equivale a `permissions = NULL`.
2. **Desactivar solo la comprobación central**, manteniendo el resto: borrar
   `server/middleware/01.admin-rbac.ts` y desplegar. Las nueve rutas del motor
   genérico siguen comprobando el área por su cuenta, y el fail-closed de
   `utils/permissions.ts` sigue vigente.
3. **Volver al comportamiento anterior por completo**: revertir el commit del
   bloque. `parsePermissions()` recupera el fail-open y las filas normalizadas
   por la migración 0061 vuelven a interpretarse igual que antes (eran
   `NULL`, que siempre significó «sin restricción»), así que **no hace falta
   ninguna migración inversa** y no hay pérdida de datos.

En los tres casos el aislamiento por organización queda intacto: no depende de
nada de este bloque.

---

## 7. Cobertura de pruebas

| Prueba | Qué demuestra |
| --- | --- |
| `test/unit/permissions.test.ts` | Los tres estados, que `super_admin` nunca se bloquea, que `[]` y el JSON ilegible deniegan, y que la validación de escritura rechaza lo que no se puede interpretar. |
| `test/unit/adminRouteMatrix.test.ts` | Que **todos** los ficheros de `server/api/admin/**` resuelven a una regla, que las áreas son reales, y las asignaciones concretas de las rutas sensibles. |
| `tests/e2e/admin-rbac.spec.ts` | Sobre HTTP real: un comercial no crea claves ni exporta datos; un editor edita contenidos y nada más; solo lectura no escribe ni sube ficheros; `[]` deniega; la API rechaza permisos inválidos; el área denegada gana antes que el ámbito de organización, y dentro del área concedida el ámbito sigue devolviendo `404` para ids de otra agencia; `GET`/`POST`/`PUT`/`PATCH`/`DELETE` cubiertos. |

La spec e2e inicia sesión **una sola vez** y reescribe la columna
`permissions` de su usuario de prueba entre fases, porque `/api/auth/login`
está limitado a 10 intentos por IP cada 10 minutos y toda la suite comparte
dirección. De paso deja demostrado que un cambio de permisos surte efecto en
la siguiente petición, sin esperar a que caduque la sesión.

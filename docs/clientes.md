# Clientes — la ficha 360º

Arquitectura del módulo de Clientes (`/admin/clientes`) y, sobre todo, **qué
relaciones existen de verdad** entre un cliente y el resto del sistema.

## De dónde se parte

Antes de esta entrega, Clientes era una tabla de sólo lectura:

- Un único endpoint, `GET /api/admin/saas/clients`. **Sin alta, edición ni
  borrado.**
- Ninguna entrada en `adminResources`, así que tampoco ámbito por inquilino
  del motor genérico, ni registro en auditoría.
- Ninguna ficha individual: el nombre del cliente no llevaba a ninguna parte.
- Las filas existentes las habían sembrado las migraciones `0009_seed_saas` y
  `0024_seed_demo_org`.

## El hallazgo que condiciona todo lo demás

**No existe ninguna clave foránea a `clients`.** Auditado tabla por tabla:

| Tabla | Cómo referencia al cliente |
|---|---|
| `leads` | `name`, `email` |
| `visits` | `client_name`, `client_email` |
| `deals` | `client_name` |
| `reservations` | `client_name` |
| `contracts` | `client_name`, `client_email` |
| `invoices` | `client_name` |

No hay `client_id` en ninguna. El código ya lo sabía en dos sitios: el
endpoint de rendimiento de un comercial excluye a los clientes *«porque
`clients` no tiene `agentId`, sólo un `agentName` denormalizado, y no se
emparejan por nombre de forma poco fiable»*, y los endpoints de RGPD
(`saas/gdpr/*`) localizan a una persona **por email** en todas esas tablas.

### La decisión

El histórico de un cliente se deriva **por email (sin distinguir mayúsculas) o
por nombre exacto**, el mismo criterio que ya usaba RGPD. No se inventa una
clave foránea ni se rellena una columna nueva: eso es una migración con
relleno sobre datos vivos, y es una decisión del propietario.

Lo que sí se hace es **decirlo en la interfaz**. La ficha explica por qué está
cruzando y sugiere rellenar el email cuando falta, porque el cruce por nombre
tiene un fallo real: dos clientes homónimos sin email comparten histórico.
Ocultarlo sería presentar una heurística como un dato.

## Qué se reutiliza

`clients` entra en `adminResources` (`area: 'crm'`,
`tenantPolicy: { type: 'direct' }`). De ahí salen, sin escribir un endpoint:

- `GET/POST /api/admin/clients`, `GET/PUT/DELETE /api/admin/clients/[id]`
- ámbito por organización en las cinco operaciones
- registro en `admin_audit_log` de cada alta, edición y borrado
- permisos: `crm:read` para leer, `crm:write` para escribir, resueltos por
  `resolveAdminRouteAccess` desde la propia declaración del recurso

Se añade **un solo** endpoint propio:
`GET /api/admin/[resource]/[id]/related`, restringido a `clients`, con el
mismo patrón que `performance.get.ts` (`getResource` + `requireOrgScope` +
`authorizeRecord`).

## Propiedades: el catálogo manda

La ficha **no guarda nada** de una propiedad. `related` recoge los
`property_id` que aparecen en visitas, operaciones, reservas y leads de esa
persona, y los resuelve en vivo contra `developer_properties` y
`agent_properties`.

`visits.property_id` apunta a `developer_properties` — es lo que escribe el
único que lo rellena, `public/agents/[slug]/book.post.ts`. Si un id no está
ahí, se busca en `agent_properties`; cada tarjeta sabe de qué catálogo salió
para enlazar a la ficha correcta.

Cada propiedad lleva **por qué** está relacionada (Visita, Operación, Reserva,
Interés). Son vínculos conceptualmente distintos y se muestran por separado,
no fundidos en una lista genérica.

## Qué NO tiene este modelo

La tabla `clients` tiene 14 columnas: `name`, `email`, `phone`, `type`,
`stage`, `lifetime_value`, `deals_count`, `agent_name`, `location`, `notes` y
las marcas de tiempo.

**No** tiene apellidos separados, fotografía, documento de identidad, fecha de
nacimiento, idioma, WhatsApp, dirección estructurada, oficina, origen ni
etiquetas. La ficha lo dice en pantalla en vez de enseñar campos vacíos que
aparenten existir. Añadirlos es una migración.

`agent_name` es **texto libre**, no una referencia a `team_members`. El editor
sugiere los nombres ya usados para que no se escriban de cuatro formas
distintas, pero no finge que sea una relación.

### `lifetime_value` y `deals_count`

Son columnas denormalizadas que **nadie mantiene**: sólo las escriben las
migraciones de siembra. Por eso:

- no son editables (no están en `fields`), para no invitar a rellenar a mano
  una cifra que la ficha presentaría como real;
- la ficha enseña en su lugar operaciones y volumen derivados de `deals`;
- los totales del listado también cuentan operaciones reales, no la suma de
  esa columna.

## Documentos

**No hay tabla de documentos de cliente.** Existe `team_member_documents`
para comerciales, pero nada equivalente aquí, así que no hay pestaña de
Documentos: crearla sería una migración más una ruta de subida privada, no una
pantalla.

## Borrado

Auditado antes de implementarlo: como no hay claves foráneas hacia `clients`,
borrar la fila **no arrastra nada por cascada**. Y eso es lo correcto — las
visitas, operaciones, contratos y facturas se quedan, porque son registros de
la agencia, no del cliente. Una operación cerrada no desaparece porque alguien
limpie su cartera, y **nunca** se borra una propiedad del catálogo por borrar a
quien la visitó.

La confirmación no es genérica: cuenta lo que hay relacionado y dice
explícitamente que se conserva. Ofrece además la alternativa que el propio
modelo ya tiene — marcar al cliente como `inactive` — para quien quiere
archivar en vez de borrar.

Para borrar los datos personales de alguien de **todas** las tablas está el
camino de RGPD (`saas/gdpr/delete`), que **anonimiza en vez de destruir**
histórico. No se duplica aquí.

## Alta y edición

Un solo `ClientBuilder.vue` con `mode: 'create' | 'edit'`, igual que
`PropertyBuilder` y `CommercialBuilder`. `mode` decide a qué endpoint se
escribe (POST a la colección o PUT a la fila) y poco más: los campos, la
validación y la disposición son idénticos, porque crear y editar un cliente
son la misma tarea con distinto punto de partida.

El listado y la ficha comparten las acciones a través de
`composables/useClientActions.ts`. Si cada pantalla escribiera la suya, la
confirmación de borrado —que es donde se explica qué se pierde y qué no—
acabaría diciendo cosas distintas según dónde se pulse.

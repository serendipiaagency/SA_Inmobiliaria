# Ficha ampliada de la propiedad, oficinas y equipos

Núcleo inmobiliario, bloque N1 (megaprompt FASES 0-7, ver
[`auditoria-nucleo-megaprompt.md`](./auditoria-nucleo-megaprompt.md)).
Migración `0086_nucleo_inmobiliario.sql`.

## Por qué dos tablas 1:1

D1 admite como máximo **100 columnas por tabla**. `developer_properties`
tenía 93 y `agent_properties` 78, así que los ~90 campos que pedía el encargo
no caben en la fila de la propiedad. Van en dos tablas compartidas por los dos
catálogos, una fila por propiedad, identificada por
`(property_kind, property_id)` con índice único:

| Tabla | Contenido |
|---|---|
| `property_details` | identificación ampliada (código comercial, subtipo, estado comercial, oficina, equipo), ubicación administrativa, superficies y distribución adicionales, edificio, vivienda, instalaciones, zonas comunes, exterior, tour virtual |
| `property_legal_economics` | precio mínimo autorizado y recomendado, alquiler (fianza, depósito, gastos incluidos), gastos (comunidad, IBI, basuras), comisiones, situación legal y certificado energético |

`property_kind` es `agent` (2ª mano, `agent_properties`) o `developer`
(obra nueva / web, `developer_properties`). Las dos tablas llevan
`organization_id` y toda lectura o escritura filtra por él.

Son **columnas tipadas**, no un JSON: se pueden filtrar, buscar y usar en el
matching y en INMO.

## Un catálogo de campos, no tres

`utils/propertySheet.ts` declara cada campo una sola vez (clave, etiqueta en
español, tipo, opciones con sus etiquetas, tabla donde se guarda, límites).
De ahí salen:

- la validación y el guardado (`server/utils/properties/extendedSheet.ts`);
- las secciones del editor (`composables/usePropertyBuilderConfig.ts`);
- la lista común de **tipos y subtipos** de los dos catálogos.

Los tipos se guardan con su clave de siempre (`Apartment`, `Villa`…) para no
romper lo ya publicado, y se enseñan en español (`Piso`, `Chalet`…). Tipos:
piso, casa, chalet, adosado, ático, dúplex, estudio, finca, terreno, local,
oficina, nave, garaje, edificio, promoción. Cada uno tiene sus subtipos
(`PROPERTY_SUBTYPES`).

## API

Sin rutas nuevas: el motor CRUD genérico (`server/api/admin/[resource]/`) ya
sirve `properties` y `developer-properties`.

- `GET /api/admin/<recurso>/:id` devuelve en `row` los campos de la fila
  **más** los de la ficha ampliada (planos, `null` si no se han rellenado).
- `POST` y `PUT` aceptan esos campos en el mismo cuerpo. Sólo se tocan los
  que llegan; un valor vacío (`''`/`null`) borra el dato.
- Validación por tipo: número (con mínimo y máximo), entero, sí/no, valor de
  catálogo, fecha `AAAA-MM-DD`, enlace `https://`, texto de hasta 4000
  caracteres. Cualquier fallo es un 422 que nombra el campo.
- Tipo ↔ subtipo: el subtipo tiene que ser de su tipo (422). Al cambiar el
  tipo, un subtipo que ya no corresponde se vacía solo. El tipo tiene que ser
  de la lista común, pero sólo se exige **al cambiarlo**: una ficha antigua
  con un tipo fuera de la lista se sigue guardando sin tocarlo.
- Oficina y equipo tienen que ser de la misma agencia (404, como cualquier
  referencia ajena).
- `createdBy` de la propiedad lo fija el servidor con el usuario de la sesión.
- Duplicar una obra nueva copia también su ficha ampliada (salvo el código
  comercial, igual que la referencia). Borrar definitivamente una propiedad
  borra su ficha ampliada.

## Histórico de precios

`price_history` y `agent_property_price_history` guardan ahora, además del
precio y la fecha, el **precio anterior**, **quién** lo cambió (`changed_by`,
`users.id`) y el **motivo**. El motivo lo escribe quien edita la ficha
(campo «Motivo del cambio de precio») o la acción masiva «Actualizar precio»,
que admite un precio fijo o un **porcentaje** sobre el precio de cada
propiedad (entre −90 % y +500 %). Las filas anteriores a 0086 no tienen esos
datos y se ven como «—».

## Oficinas y equipos

Dos recursos del motor genérico, en CRM:

- `offices` (CRM → Oficinas): nombre (único entre las vivas), código,
  contacto, dirección, zona horaria IANA (se comprueba), estado.
- `teams` (CRM → Equipos): nombre, oficina, responsable, descripción, estado.

Los dos tienen **papelera**: borrar marca `deleted_at`, el listado ofrece
«Papelera» para restaurar o borrar definitivamente.

`team_members` (Comerciales) gana `office_id`, `team_id` y `user_id` — este
último, único, vincula al comercial con su cuenta del panel. Ninguno sale en
la ficha pública del comercial (`server/utils/publicTeam.ts`). El texto
anterior `office_name` se conserva como «Oficina (texto anterior)».

El formulario y el listado genéricos (`pages/admin/[resource]/`) pintan los
campos-relación como desplegables por nombre (`FieldDef.relation`,
`composables/useRelationOptions.ts`) y los valores de un `select` por su
etiqueta (`FieldDef.optionLabels`).

## Privacidad

Lo legal, el precio mínimo autorizado, el recomendado, las comisiones, el
código comercial, la oficina y el equipo son internos (`internalRule` en el
PropertySchemaRegistry) y no forman parte de ninguna respuesta pública: la
web pública lee la fila de la propiedad, no la ficha ampliada. `createdBy` y
`deletedAt` de la propiedad están en la lista de columnas que
`toPublicProperty()` elimina siempre.

## Deriva conocida de producción

La tabla `leads` de producción tiene una columna `converted_contact_id` que
ninguna migración crea (resto del incidente de la 0069). La 0086 **no** la
vuelve a añadir; el código no la usa (el contacto convertido es
`leads.contact_id`). Staging la tiene por la primera versión de la 0086.

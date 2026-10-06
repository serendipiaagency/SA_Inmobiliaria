# Núcleo inmobiliario: auditoría de cumplimiento y cierre

**Fecha:** 2026-10-06. La primera auditoría es del 2026-10-02.

**Qué es:** el estado final, punto por punto, del megaprompt «Núcleo inmobiliario, CRM, leads, visitas e inteligencia aplicada» (FASES 0-34), contrastado con las marcas V/X del propietario y con el código real: esquema, API, permisos, interfaz y pruebas.

**Cómo se ha hecho:**
1. Auditoría inicial (2026-10-02), con cinco revisiones de solo lectura con evidencia `fichero:línea`.
2. Cierre en nueve bloques, N0-N8 (tabla «Seguimiento del cierre» al final).
3. Nueva auditoría punto por punto contra el código tras N8. Encontró lo que la primera no veía (o veía ya resuelto) y lo que había quedado a medias.
4. Dos tandas de cierre con todo lo que esa nueva auditoría dejó abierto.

**Leyenda:**
- **OK**: el dato existe en la base de datos, la API lo expone, se ve y se usa en el panel, y tiene pruebas.
- **OK (decisión)**: cumplido con una decisión de diseño documentada aquí y en el documento del área.
- **FUTURO**: el propio megaprompt lo deja para más adelante («integraciones futuras», «arquitectura para… futura», «módulos posteriores, no en paralelo»).
- **EXTERNO**: implementado, pero su puesta en marcha depende de un tercero (credenciales, contrato o configuración de la cuenta de Cloudflare) y no se simula.

## Restricción técnica que condiciona el diseño

D1 admite como máximo **100 columnas por tabla** (`developer_properties` tiene 93 y `agent_properties` 78) y **100 parámetros por consulta**.

- Los más de 60 campos de ficha que faltaban van en tablas 1:1 por propiedad, con columnas **tipadas** (no JSON) para filtrar, buscar, hacer matching y que los use la IA: `property_details` y `property_legal_economics`. Las comparten los dos catálogos mediante `(property_kind, property_id)`.
- Las listas que el usuario puede hacer crecer (favoritos, «Exportar seleccionados», lotes) van en un único parámetro JSON (`inJsonList`, ver [d1-limite-parametros.md](d1-limite-parametros.md)).

## Estado por fase

### FASE 0: dominio

- **OK:** las 12 entidades.
  - Property, en los dos catálogos.
  - Contact, Lead y Appointment (tabla `visits`).
  - PropertyMatch y Deal (`deal_operations`).
  - Activity y Task.
  - Note (`notes`, con panel en contacto, lead, propiedad, cita y operación).
  - Tag.
  - CustomFieldDefinition y CustomFieldValue.
- **OK:** Oficina y Equipo como entidades; vínculo usuario ↔ comercial (`team_members.user_id`).
- **OK, campos transversales:**
  - `id`, `organizationId`, `createdAt`, `updatedAt` y `status` en todas.
  - `officeId` en propiedades (ficha ampliada), contactos, leads, citas, operaciones y tareas (migración 0089). En la tarea, NULL es la oficina de su responsable.
  - `createdBy` lo fija el servidor en las seis entidades, y la ficha muestra «Creado por X el Y».
  - `assignedUserId` es el comercial de cada entidad (`team_members.id`).
- **OK, `deletedAt`:** papelera con restaurar en propiedades, contactos, tareas, operaciones y citas.
- **OK (decisión):** los leads no se borran, se marcan perdidos con su motivo (también «Duplicado»). Así su historia sigue contando en los informes de captación.

### FASE 1: identificación de la propiedad

- **OK:**
  - Referencias interna, externa y de agencia, y código comercial.
  - Operación, tipo y subtipo.
  - Comercial, oficina y equipo.
  - Fecha de captación, origen, mandato y exclusividad con inicio y vencimiento.
- **OK, fechas:** captación, inicio y vencimiento de la exclusiva se eligen con calendario y el servidor exige `AAAA-MM-DD` al cambiarlas. Las fechas antiguas en otro formato (`15/03/2025`) se siguen leyendo.
- **OK, exclusiva caducada:** el resumen de la ficha avisa de la exclusiva caducada o por caducar, y el listado la filtra.
- **OK (decisión), estado:**
  - El estado comercial común (disponible, reservada, vendida, alquilada, retirada, borrador) se filtra, se ve en la fila y se cambia desde la fila y en bloque.
  - Convive con el estado propio de cada catálogo, rotulado «Estado de la obra» (obra nueva) y «Disponibilidad» (2ª mano), con reglas de sincronía documentadas en `utils/propertyCommercialStatus.ts`.
  - El matching no ofrece lo vendido, alquilado, retirado ni en borrador.
- **OK, tipos:** los 15 en los dos catálogos, con rótulo en castellano en el panel y en la web pública. La web sólo ofrece los tipos que la agencia tiene publicados.

### FASE 2: ubicación

- **OK, campos:** país, comunidad/región, provincia, municipio y localidad (columnas distintas), distrito, barrio y urbanización (distintas), CP, tipo de vía, calle, número, portal, bloque, escalera, planta, puerta, latitud y longitud con mapa.
- **OK, privacidad:** dirección exacta, aproximada, ocultar número y radio de privacidad. Con «aproximada», el punto público se redondea a una cuadrícula del tamaño del radio (mínimo unos 110 m) en la ficha, los portales y la búsqueda por zona.
- **OK, búsqueda en el panel:** mapa, radio, zona visible (bounding box), coordenadas, barrio, municipio y CP, en los dos catálogos.
- **OK, búsqueda en la web pública:**
  - municipio y barrio, con sugerencias de las zonas de la agencia;
  - CP por prefijo;
  - zona visible del mapa;
  - «Buscar cerca de aquí» con radio de 1 a 50 km, desde el centro del mapa o la ubicación del visitante. La ubicación se pide sólo al pulsar «Mi ubicación», y `geolocation=(self)` se permite sólo en la web pública.
- **OK (decisión):** la web pública de la agencia es su catálogo de obra nueva. La 2ª mano se trabaja en el panel, en catálogos PDF y por la API (el megaprompt no pide una web pública de 2ª mano).

### FASE 3: superficies y distribución

- **OK:**
  - Superficies: construida, útil, parcela, terraza, jardín, balcones, almacén, oficina, comercial, total y computable. Oficina y comercial sólo aparecen en los esquemas de local y nave.
  - Distribución: dormitorios, habitaciones (total de estancias), baños, aseos, salones, cocinas, terrazas, balcones, trasteros, vestidores, despachos, plantas y plazas de garaje.
  - Estancias personalizadas.
- **OK:** «Dormitorios» y «Habitaciones (total de estancias)» ya no se confunden en el panel. La 2ª mano usa m².

### FASE 4: características

- **OK:** edificio, vivienda, las 10 instalaciones, las 9 zonas comunes y el exterior.
- **OK, piscina y jardín:** comunitario y privado distinguidos. «Piscina» y «jardín» a secas cuentan cualquiera de los tres en el listado, la web pública y el matching, y hay filtros propios de privada y comunitaria.

### FASE 5: económica

- **OK:**
  - Precio actual, anterior, mínimo autorizado y recomendado.
  - Precio por m², calculado y en el resumen de la ficha.
  - Alquiler: renta mensual (el precio con operación alquiler, rotulado «Renta mensual» y «/mes»), fianza, depósito, gastos incluidos, comunidad, IBI y tasa de basura.
  - Comisiones: tipo, importe, IVA, honorarios comprador y propietario.
  - Historial de precios con precio anterior, nuevo, fecha, usuario y motivo.
- **OK (decisión), comunidad:** se escribe en «Comunidad (mensual)». El campo anual heredado sólo aparece, explicado, en las fichas que ya lo tenían.
- **OK (decisión), moneda:**
  - Es la de la agencia (Sistema → Configuración) en el panel, los emails, los PDF, la IA y la web pública. En la web, el visitante puede convertirla.
  - Una agencia sin moneda elegida usa AED, la moneda por defecto de la plataforma. Elegirla no convierte importes guardados.

### FASE 6: legal y documental

- **OK:** los campos legales de la ficha ampliada.
- **OK:** gestor de documentos por propiedad en los dos catálogos, con permisos por documento: interno, propietario, comprador autorizado y público.
- **OK:** avisos de caducidad, y documentos de cada persona en su ficha y en «Mi cuenta». Detalle en [documentos-y-multimedia.md](documentos-y-multimedia.md).
- **FUTURO:** firma electrónica (FASE 34).

### FASE 7: multimedia

- **OK, tipos:** fotos, vídeos, tour virtual, planos, renders, PDF, drone y 360.
- **OK, por recurso:** orden, tipo, título, alt, pie, principal, publicable, privado e idioma.
- **OK, acciones:** seleccionar, eliminar (sin dejar ficheros huérfanos), ocultar, descargar, reordenar y portada.
- **OK:** visor 360 esférico con WebGL (arrastrar, rueda o pellizco, teclado). Sin WebGL, la foto se recorre en horizontal.
- **OK:** YouTube y Vimeo incrustados con su reproductor sin cookies. La CSP sólo admite esos dos.

### FASE 8: contactos y propietarios

- **OK:** Contact como entidad general.
- **OK:** los 9 roles, varios por persona.
- **OK:** PropertyContact (propietario, copropietario, apoderado, inquilino, contacto) con porcentaje. Ver [crm-contacto-360.md](crm-contacto-360.md).

### FASE 9: CRM 360

- **OK:** la cabecera completa, con «Creado por».
- **OK:** las 13 pestañas pedidas, más Comunicaciones y Ficha y duplicados.
- **OK:** edición con deduplicación, incluidos WhatsApp e id externo.

### FASE 10: perfil del comprador

- **OK:** la necesidad completa, con importancia imprescindible, preferible o indiferente en cada preferencia.
- **OK:** zonas estructuradas con sugerencias de las zonas reales de la agencia (distritos, localidades, CP y urbanizaciones de sus fichas vivas).

### FASE 11: matching

- **OK:**
  - En los dos sentidos, con puntuación explicable.
  - Las cuatro acciones desde la ficha de propiedad, Compatibilidades y el contacto.
  - Vista propia de una selección: reordenar, quitar, añadir y enviarla como conjunto, sin simular el envío.
- **OK:** no se ofrece lo vendido, alquilado, retirado ni en borrador.

### FASE 12: leads

- **OK:** todos los campos, la ficha y el alta manual.
- **OK, propiedad de interés:** con su catálogo (migración 0089), elegida con buscador, validada en la agencia y enlazada desde la ficha. Los leads antiguos sin catálogo conservan la resolución de antes.
- **OK:** contacto vinculable desde el formulario.

### FASE 13: pipeline

- **OK:** las 8 etapas, y «Perdido» con motivo (No responde, No interesado, Duplicado u otro).
- **OK, historial:** cada cambio guarda usuario, fecha, fase anterior, nueva y motivo, y el historial es visible.
- **OK, motivo:** se pide en todos los caminos (ficha, Kanban, Tabla y acción masiva) y el servidor lo exige desde el panel.

### FASE 14: deduplicación

- **OK, lead:** por email, teléfono, WhatsApp e id externo, con «Unificar» y «Crear igualmente».
- **OK, contacto:** las mismas cuatro comprobaciones al darlo de alta, con «Unificar», que completa el existente sin pisar nada. La fusión de duplicados reasigna todos los vínculos (#136).

### FASE 15: lead routing

- **OK:** las 10 reglas.
- **OK, idioma:** llega desde la captación (formularios, reserva, chat, referidos y API v1). WhatsApp no informa del idioma.
- **OK, propiedad y obra nueva:** usan el catálogo del lead.
- **OK:** historial de asignación visible.
- **OK:** editor de reglas con desplegables de oficinas, equipos e idiomas y un editor de horario.

### FASE 16: SLA

- **OK:** `leadCreatedAt`, `firstContactAt`, `firstHumanResponseAt`, `qualifiedAt` y `appointmentAt`, rellenados por los hechos reales.
- **OK:** las tres alertas. «Sin contacto X días» cuenta los contactos salientes.

### FASE 17: citas

- **OK:**
  - Todos los tipos y campos.
  - Edición, cancelación con motivo y confirmación interna.
  - Recordatorios y huecos libres con la zona horaria de la agenda.
- **OK, papelera:** eliminar una cita creada por error y restaurarla. No se puede eliminar lo que ya tiene historia (resultado, realizada, conocida por el cliente o con oferta); eso se cancela.

### FASE 18: visitas multi-inmueble

- **OK:**
  - Tours con hora y duración por parada, en los dos catálogos.
  - Reordenar y recalcular.
  - Añadir y quitar paradas de un tour ya creado.
- **FUTURO:** optimización automática de rutas. El megaprompt pide su arquitectura, que existe (`RouteOptimizer`).

### FASE 19: resultado de visita

- **OK:** todos los campos.
- **OK:** oferta real, descarte y segunda visita.

### FASE 20: calendario

- **OK:** las cuatro vistas, todos los filtros e iCal con la zona horaria correcta.
- **FUTURO:** Google y Outlook («integraciones futuras» en el megaprompt). La interfaz del proveedor está preparada y no se simula ninguna conexión.

### FASE 21: activity

- **OK:**
  - La cronología en contacto, lead, propiedad y operación.
  - Eventos nuevos: papelera de tareas, operaciones y citas; contactos unificados; respuesta por email.
- **OK (decisión):** «match encontrado» no se registra solo, porque las compatibilidades se calculan al vuelo.

### FASE 22: tareas

- **OK:** todos los campos y enlaces, y la próxima acción del lead.
- **OK:** oficina de la tarea, con filtro.
- **OK:** papelera con «Restaurar».

### FASE 23: ofertas

- **OK:** todos los campos, e historial sin sobrescribir con oferta, contraoferta, nueva oferta, aceptada y rechazada.

### FASE 24: operación

- **OK:** las 8 etapas, listado y Kanban, y vínculo con reservas, arras y contratos.
- **OK, papelera:** no se puede borrar una operación cerrada o con documentos vinculados.

### FASE 25: UX de la ficha de propiedad

- **OK, secciones:** Resumen, Ubicación, Características, Precio, Propietario, Media, Documentos, Portales y Actividad, más Notas.
- **OK, UX:** autoguardado, búsqueda de campos, secciones plegables, valores por defecto, campos condicionales, estado fijo y validación inmediata.
- **OK, edición inline:** precio, estado, estado comercial y comercial desde la fila del listado; fase y comercial en la Tabla de Leads.

### FASE 26: PropertySchemaRegistry

- **OK:** los 7 esquemas con `fields`, `requiredFields`, `sections`, `validation`, `publicFields` y `portalFields`.
- **FUTURO:** que `portalFields` llegue a un portal real (FASE 34).

### FASE 27: búsqueda

- **OK, filtros:** todos los pedidos.
  - La referencia busca la interna, la externa, la de agencia, el código comercial y, en 2ª mano, la calle.
  - Más características: cualquier casilla de la ficha ampliada.
  - Estado comercial y exclusiva caducada.
- **OK, funciones:** guardar filtro y vista, compartir vista, columnas configurables, exportar CSV sin tope y acciones masivas.
- **OK (decisión), portales:** en 2ª mano el filtro está desactivado y explicado, porque la publicación multicanal sólo programa obra nueva.

### FASE 28: acciones masivas

- **OK, propiedades:** las 8 acciones, incluidos «Cambiar estado comercial» y «Crear catálogo» en los dos catálogos.
- **OK, leads:** las 5 acciones; cambiar de etapa en bloque pide motivo.

### FASE 29: comunicaciones

- **OK:**
  - WhatsApp.
  - Formularios como conversación.
  - Chat en la web pública.
  - Cada conversación vinculada a contacto, lead y propiedad.
- **OK, email de entrada y salida:** la respuesta del cliente a un email enviado desde un hilo vuelve a ese hilo. Va por una dirección de respuesta firmada (HMAC) y Cloudflare Email Routing.
- **EXTERNO:**
  - Activar el email entrante (configuración de la cuenta de Cloudflare).
  - Validar las llamadas con un número real.

### FASE 30: INMO sobre datos estructurados

- **OK:** necesidad → búsqueda → matching → respuesta con propiedades reales.
- **OK:** búsqueda exploratoria sin guardarla.

### FASE 31: tools

- **OK:** las 14.

### FASE 32: lead score

- **OK:** las 6 reglas con su explicación.
- **OK:** «abrió tres fichas» cuenta WhatsApp, email y chat web.
- **OK:** «respondió hoy» cuenta también las respuestas por email.

### FASE 33: dashboard

- **OK:** los KPIs, la segmentación (agente, oficina, fuente, portal, propiedad y campaña), el embudo, y cada comercial ve lo suyo.
- **OK (decisión):** los listados operativos (Leads, Visitas, Ofertas) no se restringen por comercial. El megaprompt pide segmentar el dashboard, no restringir los listados, y restringirlos escondería los leads sin asignar a quien tiene que atenderlos.

### FASE 34: módulos posteriores

- **OK:** automatizaciones reales y un marketplace que refleja lo que existe. El email entrante ya figura como disponible.
- **FUTURO:** el resto de módulos, «no en paralelo» por el propio megaprompt.

### Arquitectura INMO INTELLIGENCE

- **OK:** Tools, Memoria, Brains, RAG con fuentes citadas y Workflows. Ver [inmo.md](inmo.md).

## Lo que no se cierra desde aquí, y por qué

| Punto | Estado | Motivo | Qué haría falta |
|---|---|---|---|
| Google Calendar y Outlook (FASE 20) | FUTURO | El megaprompt los marca como «integraciones futuras». Hoy hay suscripción iCal real y la interfaz del proveedor está preparada (`server/utils/appointments/calendarProvider.ts`). | Una app OAuth de Google y otra de Microsoft (ids y secretos) y la decisión de sincronizar en un sentido o en los dos. |
| Optimización automática de rutas (FASE 18) | FUTURO | El megaprompt pide la «arquitectura para optimización de ruta futura», que existe (`RouteOptimizer` en `utils/tourPlanning.ts`). Sin un proveedor de rutas no se inventan distancias. | Un proveedor de rutas con clave (p. ej. Google Routes o Mapbox). |
| Portales (Idealista, Fotocasa), MLS, firma electrónica, facturación, escaparates, redes sociales, Property Intelligence, franquicias e IA avanzada (FASE 34) | FUTURO | El megaprompt los declara «módulos posteriores (no en paralelo)». El marketplace los enseña como «Próximamente», sin botones. `portalFields` (FASE 26) ya define qué se entregaría. | El contrato o acceso de integrador de cada portal o proveedor. |
| Email entrante (FASE 29) | EXTERNO | Implementado: una respuesta del cliente vuelve a su hilo. Sólo se activa cuando la cuenta de Cloudflare enruta el dominio de entrada al Worker. | Configurar Email Routing y las variables (pasos en [communications.md](communications.md)). |
| Llamadas (FASE 29) | EXTERNO | Implementadas sobre WhatsApp Calling. No se han podido validar con una llamada real. | Un número de Meta con Calling activo. |

## Seguimiento del cierre

| Bloque | Estado | Dónde |
|---|---|---|
| N0 | Hecho: migración 0086 con todo el modelo nuevo, aplicada en producción. | #128, #129 |
| N1 | Hecho: oficinas y equipos, vínculo usuario ↔ comercial, ficha ampliada, tipos y subtipos, historial de precios completo y papelera de propiedades. | #130, [ficha-ampliada-propiedad.md](ficha-ampliada-propiedad.md) |
| N2 | Hecho: contactos CRM 360 (edición, roles, propietarios con %, cabecera y pestañas, notas, etiquetas). | [crm-contacto-360.md](crm-contacto-360.md) |
| N3 | Hecho: ficha y alta manual del lead, historial de fases con motivo, deduplicación completa, enrutado por oficina y horario, SLA. | [leads-ficha-y-enrutado.md](leads-ficha-y-enrutado.md) |
| N4 | Hecho: editor completo de necesidades, importancia por criterio, matching en la ficha de propiedad y sus acciones. | [necesidades-y-matching.md](necesidades-y-matching.md) |
| N5 | Hecho: citas con todos sus tipos y campos, tours por parada en los dos catálogos, resultado estructurado e iCal con zona horaria. | #134, [citas-y-visitas.md](citas-y-visitas.md) |
| N6 | Hecho: actividad en todas las fichas, tareas completas, ofertas con historial y operaciones con listado y Kanban. | #135 |
| Unificar contactos | Hecho: la fusión reasigna todos los vínculos del duplicado. | #136 |
| N7 | Hecho: documentos con permisos, multimedia completa, búsqueda por mapa, radio y zona, acciones masivas, campos personalizados. | #137 |
| N8 | Hecho: migraciones 0087 y 0088, y después formularios y chat web, dashboard por comercial, automatizaciones reales e INMO Intelligence. | #138, #139 |
| Límite de D1 | Hecho: las listas que crecen van en un solo parámetro. | #140, [d1-limite-parametros.md](d1-limite-parametros.md) |
| Migración 0089 | Hecho: catálogo de la propiedad del lead y oficina de la tarea, sola y antes del código. | #141 |
| Cierre | Todo lo que dejó abierto la nueva auditoría (ver cada fase): edición inline, papelera de tareas, operaciones y citas, paradas de tour, vista de selección, estado comercial, fechas, moneda, web pública (municipio, barrio, CP, radio, tipos), visor 360 y vídeos, notas y «Creado por» en todas las fichas, motivo en cada cambio de fase, «Unificar» al dar de alta, idioma y catálogo del lead, editor de reglas de enrutado, catálogo PDF de 2ª mano y email entrante. | El PR del cierre |

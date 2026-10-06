# Núcleo inmobiliario: auditoría de cumplimiento y plan de cierre

**Fecha:** 2026-10-02.

**Qué es:** revisión punto por punto del megaprompt «Núcleo inmobiliario, CRM, leads, visitas e inteligencia aplicada» (FASES 0-34). Se contrasta con las marcas V/X del propietario y con el código real: esquema, API, permisos, interfaz y pruebas.

**Cómo se ha hecho:** cinco auditorías de solo lectura, cada una con su evidencia (`fichero:línea`). Las notas de trabajo completas están fuera del repositorio. Este documento es el resumen que guía el cierre.

**Leyenda:**
- **OK**: el dato existe en la base de datos, la API lo expone y se ve y se usa en la interfaz.
- **PARCIAL**: falta alguna de esas capas.
- **FALTA**: no existe.

La marca del propietario refleja lo que se ve desde el panel. Por eso varios puntos marcados X sí existen en el backend: el fallo es que no se ven. Y algunos marcados V están incompletos.

## Restricción técnica que condiciona el diseño

D1 admite como máximo **100 columnas por tabla**. `developer_properties` ya tiene 93 y `agent_properties` 78.

Los más de 60 campos de ficha que faltan (identificación ampliada, ubicación, superficies, distribución, edificio, vivienda, instalaciones, zonas comunes, exterior, economía, comisiones y legal) van en tablas 1:1 por propiedad:
- `property_details`;
- `property_legal_economics`.

Ambas tienen columnas **tipadas**, no JSON, para que se puedan filtrar y buscar, y las pueda usar el matching y la IA. Las comparten los dos catálogos mediante `(property_kind, property_id)`.

## Estado por fase

### FASE 0: dominio

- **OK:** Property, Contact, Lead, Appointment (tabla `visits`), PropertyMatch, Deal (`deal_operations`), Activity y Task.
- **OK (bloque N7b):** CustomFieldDefinition y CustomFieldValue — definiciones por agencia en CRM → Campos personalizados (alta, edición, archivar, papelera, orden, sección, obligatorio, opciones, ayuda, público) y valores validados por tipo en las fichas de propiedad (los dos catálogos), contacto, lead, cita y operación; los públicos salen en la ficha pública de obra nueva; filtro en el listado de propiedades. Ver `docs/campos-personalizados-y-etiquetas.md`.
- **FALTA:**
  - Note como entidad (hoy solo hay columnas `notes`).
  - Entidades Oficina y Equipo (hoy son texto libre en `team_members`).
  - `officeId` en todas las entidades.
  - `createdBy` en propiedades, leads y citas.
  - `deletedAt` en propiedades, leads, citas, tareas y operaciones: **las propiedades se borran físicamente**.
  - Vínculo entre usuario y comercial (`users` ↔ `team_members`).
- **OK (bloque N7b):** Tag. Se ve en listados y fichas (propiedades, leads, contactos), se añade y se quita a mano, se filtra por él, y los contactos se pueden etiquetar.

### FASE 1: identificación de la propiedad

- **OK:** referencias interna, externa y de agencia; operación; tipo; agente; fecha de captación; origen; mandato; exclusividad e inicio.
- **FALTA:** código comercial, subtipo, oficina, equipo.
- **FALTA (tipos):** dúplex, finca y casa genérica.
- **PARCIAL:**
  - Estado: vocabularios distintos en cada catálogo y sin reservada, retirada ni alquilada.
  - Vencimiento de exclusividad: nada lo lee.
  - Terreno, local, oficina, nave, garaje y edificio solo existen en 2ª mano.
  - Etiquetas de tipo en inglés.
  - Fechas como texto.

### FASE 2: ubicación

- **OK:** país, localidad, distrito, urbanización, CP, calle, número, portal, bloque, planta, puerta y latitud/longitud (el propietario las marcó X, pero existen con mapa en el editor).
- **OK (privacidad):** exacta, aproximada y ocultar número.
- **FALTA:** comunidad/región, provincia, tipo de vía, escalera.
- **PARCIAL:** municipio (comparte columna con localidad) y barrio (comparte columna con urbanización).
- **PARCIAL:** radio de privacidad (se guarda pero no tiene efecto).
- **OK (búsqueda, bloque N7b):** por radio, por bounding box (zona visible del mapa) y por coordenadas, en el listado del panel de los dos catálogos con mapa (`docs/property-search.md`); barrio y municipio filtran en el panel y en la API pública.
- **PARCIAL (búsqueda):**
  - Mapa público: ya busca por la zona visible y llega a 300 resultados, pero sigue siendo sólo obra nueva (2ª mano no tiene web pública).
  - Municipio y barrio en la web pública: el API los acepta; el buscador público aún no los ofrece.

### FASE 3: superficies y distribución

- **OK:**
  - Superficies: construida, útil, parcela, terraza, jardín y balcones.
  - Distribución: baños, aseos, salones, cocinas, garaje y estancias personalizadas.
- **FALTA:** superficie de oficina, comercial, total y computable; número de plantas.
- **PARCIAL:**
  - Habitaciones y dormitorios son la misma columna.
  - Sin contador de terrazas, balcones, trasteros, vestidores ni despachos.
  - La superficie de 2ª mano está rotulada «sqft» en lugar de m².

### FASE 4: características

- **OK:** año de construcción, ascensor, accesibilidad, orientación, estado, amueblado, terraza, piscina y jardín.
- **FALTA:**
  - Edificio: año de reforma, plantas, vecinos, conserje, portero, fachada, estructura.
  - Vivienda: exterior/interior, tipo de cocina, armarios, suelos, carpintería, cristales, altura de techos.
  - Instalaciones: las 10.
  - Zonas comunes: gimnasio, pádel, tenis, zona infantil, coworking, salón social, seguridad.
  - Exterior: vistas, primera línea, porche, patio.
- **PARCIAL:**
  - Reformado.
  - Piscina y jardín: no distinguen comunitario de privado.
  - Balcón: solo como superficie.

### FASE 5: económica

- **OK:** precio, precio anterior, comunidad (anual) e historial de precios (precio y fecha).
- **FALTA:**
  - Precio mínimo autorizado y precio recomendado.
  - Alquiler: fianza, depósito, gastos incluidos, IBI y tasa de basura.
  - Comisiones: tipo, IVA, honorarios comprador y honorarios propietario.
  - Historial: precio anterior, usuario y motivo.
- **PARCIAL:**
  - Precio por m²: solo se calcula en la web.
  - Renta mensual: es el mismo campo precio.
  - Etiqueta «AED» fija.

### FASE 6: legal y documental

Estado tras el bloque N7a (2026-10-05). Detalle en [documentos-y-multimedia.md](documentos-y-multimedia.md).

- **OK:**
  - Gestor de documentos por propiedad en los dos catálogos (paso «Documentos»): subir PDF o imagen validados con las utilidades de siempre a R2 bajo la organización (`confidential`), listar, editar tipo, título, emisión, caducidad, notas y visibilidad, papelera, restaurar y borrar definitivamente.
  - Permisos por rol en la descarga (`/api/media`, decidida por el documento): interno (equipo con lectura de propiedades), propietario (propietarios y copropietarios de esa propiedad), comprador autorizado (contactos con acceso concedido, que se concede y revoca desde el panel) y público (sólo con la propiedad publicada y viva). Propietarios y compradores descargan desde «Mi cuenta». Ajeno = 404; nada en la papelera se sirve.
  - Avisos de documentos caducados y a punto de caducar (30 días) en el paso y en el resumen de la ficha.
  - Pestaña «Documentos» del contacto: lo que esa persona ve y por qué (antes listaba todos los de sus propiedades sin mirar la visibilidad).
- **Pendiente:** firma electrónica de documentos y versiones de un mismo documento (no se piden en N7a).

### FASE 7: multimedia

Estado tras el bloque N7a (2026-10-05). Detalle en [documentos-y-multimedia.md](documentos-y-multimedia.md).

- **OK:** fotos, planos, orden, portada, reordenar y eliminar.
  - Eliminar ya no deja huérfanos: el fichero se libera con el mecanismo de borrado de activos (`softDeleteMediaAsset` + purga del cron) cuando ninguna otra ficha de la agencia lo usa (copias duplicadas, portada, planos). También al sustituir una imagen y al borrar definitivamente la propiedad.
- **OK:** renders, PDF, 360, drone (varios) y vídeos (varios), en `property_media`, en los dos catálogos.
  - Por recurso: tipo, título, alt, pie, idioma, principal, publicable, privado y oculto (también en cada foto de galería).
  - Acciones: selección múltiple, ocultar/mostrar, privado, publicable, descargar y eliminar.
  - Lo publicable, no privado y no oculto es lo único que sale en la web, en las tarjetas, en la API v1, en el widget y en lo que se entrega a un portal; «privado» deja además de servir el fichero sin sesión.
  - Tour virtual: enlaces reales (`property_media` o el enlace de la ficha ampliada). El 360 público sólo aparece con un tour o una foto 360 reales: ya no simula el tour con la primera foto.
- **Pendiente:** visor 360 esférico (la foto 360 se recorre en horizontal) e incrustar YouTube/Vimeo en la web pública (la CSP no lo permite; se abren aparte).

### FASE 8: contactos y propietarios

- **OK:** Contact como entidad general.
- **FALTA:** los 9 roles por contacto (varios a la vez), PropertyContact (propietario, copropietario, apoderado, inquilino, contacto) y porcentaje de propiedad.

### FASE 9: CRM 360

La ficha es `contactos/[id]` y hoy tiene Necesidades, Leads y Comunicaciones. **No se puede editar un contacto: no hay endpoint.**

- **Cabecera FALTA:** país, origen, score, próxima acción.
- **Cabecera sin mostrar:** WhatsApp, idioma, agente, estado.
- **Pestañas FALTA:** Resumen, Propiedades, Visitas, Ofertas, Tareas, Documentos, Notas y Actividad.
  - Existen en la ficha antigua `clientes/[id]`, que trabaja sobre otra tabla.

### FASE 10: perfil del comprador

> Actualizado tras el bloque N4 (detalle en `docs/necesidades-y-matching.md`).

- **OK:** la entidad completa en base de datos y API.
- **OK (N4):** editor completo para crear y **editar** desde la pestaña «Necesidades» del contacto: operación, los 15 tipos del catálogo común, precio mín./máx., m² mín./máx., dormitorios y baños mínimos, zonas deseadas y excluidas estructuradas, radio (centro en mapa + km), estado, obra nueva / 2ª mano / reformado, terraza, garaje, ascensor, jardín, piscina (y accesible, mascotas, aire acondicionado), fecha deseada, hipoteca y financiación, presupuesto validado (con autor y fecha) y urgencia.
- **OK (N4):** importancia imprescindible / preferible / indiferente en **cada** preferencia (tipo, precio —sin «indiferente»—, superficie, dormitorios, baños, zona, estado, obra y cada característica). Siempre filtro duro, documentado en el editor y en la ayuda: operación, precio fuera del 10 %, zonas excluidas y el tipo mientras sea imprescindible (lo es por defecto).
- **OK (N4):** el motor evalúa el estado del inmueble (`conditionPref` frente a `condition`) y «reformado» desde la ficha ampliada, con su línea ✓/△/✕/? — sin dato, «no consta».
- **Pendiente fuera de N4:** las zonas son texto estructurado (distrito, localidad, CP, urbanización); no hay selector del catálogo de comunidades (`communityId`) ni de localizaciones.

### FASE 11: matching

> Actualizado tras el bloque N4.

- **OK:** en los dos sentidos, con puntuación explicable (✓/△/✕/?).
- **OK (N4):** «Compradores compatibles» en la ficha de propiedad de los dos catálogos (paso del editor).
- **OK (N4):** las cuatro acciones —enviar propiedad, crear selección, crear visita, descartar (con motivo, y recuperar)— desde la ficha de propiedad, Compatibilidades y la pestaña «Necesidades» del contacto (que además permite elegir varias para una selección). Enviar usa el Centro de Comunicaciones (nunca simulado; sin teléfono o sin WhatsApp conectado lo dice); selección y visita reutilizan el servicio de INMO y `createAdminAppointment`; todo validado por organización (404 lo ajeno).
- **Pendiente fuera de N4:** no hay vista propia de una selección (se listan en la ficha del contacto con sus propiedades, pero no se reordenan ni se envían como conjunto).

### FASE 12: leads

- **OK:** la tabla propia con casi todos los campos.
- **FALTA:** ficha de lead, alta manual, oficina y `convertedContactId` propio.
- **Sin interfaz:** teléfono, WhatsApp, sourceDetail, campaña, UTM, portal (nunca se rellena), landing, referrer, mensaje original, prioridad y firstResponseAt.

### FASE 13: pipeline de leads

- **OK:** las 8 etapas en Kanban y la tabla de historial.
- **FALTA:** historial visible; los cambios Perdido y Reactivar no quedan en el historial.
- **PARCIAL:**
  - La interfaz nunca envía el motivo.
  - No responde, No interesado y Duplicado son motivos escritos a mano en un `prompt`.

### FASE 14: deduplicación

- **OK:** por email y teléfono, crear igualmente, unificar.
- **PARCIAL:**
  - WhatsApp y external ID sin interfaz.
  - El lead solo se deduplica por email.

### FASE 15: lead routing

- **OK:** por propiedad, zona, tipo, obra nueva, equipo, round robin y carga.
- **FALTA:** por oficina y por horario.
- **PARCIAL:**
  - Por idioma: el idioma del lead nunca se rellena, así que la regla no se aplica nunca.
  - El historial de asignación no tiene interfaz.

### FASE 16: SLA

- **OK:** alertas de lead sin atender y de cualificado sin próxima acción.
- **FALTA:** `firstContactAt`.
- **PARCIAL:**
  - `firstHumanResponseAt`: solo lo fija un cambio de etapa.
  - `appointmentAt`: solo lo fija la reserva pública.
  - Alerta «sin contacto»: no tiene en cuenta los contactos salientes.
  - `qualifiedAt`: sin interfaz.

### FASE 17: citas

Estado tras el bloque N5 (2026-10-05). Detalle en [citas-y-visitas.md](citas-y-visitas.md).

- **OK:**
  - Entidad, estado, inicio, fin y resultado.
  - Tipos con etiqueta en castellano en `utils/appointmentCatalog.ts`: visita a inmueble, llamada, videollamada, reunión, tasación, captación, firma, notaría (la de la operación), open house y otro.
  - Campos contactId, officeId, timezone, meetingPoint, notes, internalNotes y cancellationReason. Se rellenan en el alta y en la edición.
  - Propiedad (de los dos catálogos), lead, contacto, agente y oficina editables en una cita existente. Validados en la agencia (404 si son ajenos); la propiedad nueva, también contra la papelera (422).
  - Inicio y fin libres, validados (de 5 min a 12 h). Solapes contra la agenda real, también a través de la medianoche.
  - Zona horaria IANA validada.
  - Motivo de cancelación obligatorio al cancelar desde el panel, desde las tools y desde el enlace del cliente.
  - Confirmación interna (agencia) además de la del cliente. Mover la cita invalida las dos.
  - Estado del recordatorio visible en la ficha. Lo escribe el envío de recordatorios.
  - Notas desde el panel.
- **PARCIAL:**
  - Los recordatorios y los huecos libres comparan la hora local con el reloj UTC. El aviso sale desplazado tantas horas como el desfase de la zona. Documentado como pendiente.

### FASE 18: visitas multi-inmueble

- **OK:**
  - Tour con paradas.
  - Hora y duración (o fin) propias de cada parada: el ejemplo 10:00 / 10:45 funciona.
  - Los dos catálogos: cada parada guarda `propertyKind`, se valida en su catálogo y contra la papelera, y se puede ofertar desde ella.
  - Lead, contacto y notas del tour con interfaz, al crear y al editar. Se propagan a las paradas.
  - Reordenar paradas y recalcular horas con un margen de desplazamiento: en el alta y en un tour ya creado, con comprobación de agenda, Activity y aviso al cliente.
- **FALTA:**
  - Optimización automática de la ruta. Sin proveedor de rutas no se inventan distancias. El punto de extensión está documentado (`RouteOptimizer` en `utils/tourPlanning.ts`).
  - Añadir o quitar paradas de un tour ya creado.

### FASE 19: resultado de visita

- **OK:**
  - Realizada y seguimiento.
  - Interés 1-5.
  - Qué le gustó y qué no, por separado (`outcomeLiked` y `outcomeDisliked`).
  - Percepción de precio.
  - Valoraciones 1-5 de ubicación, estado y distribución.
  - Segunda visita: la marca y, si se pide, la cita real ya agendada.
  - Descartar explícito: el PropertyMatch pasa a descartado.
  - Oferta real con el OfferService (importe, condiciones, financiación y vencimiento):
    - desde la Lista, desde los Tours y desde la ficha de la cita;
    - visible en las tres vistas, con enlace a la pestaña Ofertas del contacto;
    - si la cita no tenía comprador, se vincula su contacto.

### FASE 20: calendario

- **OK:**
  - Las cuatro vistas.
  - Filtros de agente, estado, propiedad, oficina (entidad `officeId`, la de la cita o la de su comercial), tipo (todos los tipos nuevos) y cliente (contacto de la cita o de su lead).
  - El iCal emite el instante real en UTC, convertido con la zona de la cita, su oficina o la agencia. Tiene test.
- **FALTA:** Google y Outlook. No hay integración y no se simula: el panel muestra «No conectado · próximamente». La interfaz del proveedor y las columnas de sincronización existen, pero nada las escribe. Hoy sólo hay suscripción iCal de solo lectura.

### FASE 21: activity

- **OK:** entidad y eventos.
- **OK (N6):** cronología reutilizable (`ActivityTimeline`) con todos los tipos de evento, quién lo hizo, enlace al origen, filtros por grupo y paginación, en las fichas de Contacto, Lead, Propiedad (los dos catálogos) y Operación (`?dealId=`: sus eventos, los de su oferta, sus tareas y sus citas).
- **OK (N6):** «cliente abrió ficha» = `PROPERTY_SHARE_OPENED`, con la única señal real que existe: la primera lectura confirmada por WhatsApp de una ficha enviada.
- **No se registra, a propósito:** «match encontrado» automático. Las compatibilidades se calculan al vuelo y sólo se persisten cuando alguien decide o envía; no hay un hecho real que fechar. Tampoco «abrió la ficha» desde la web pública (no asocia visitas a personas).
- **Sin cambios:** la ficha antigua de Cliente conserva su cronología mezclada con 6 tipos de `activities`.

### FASE 22: tareas

- **OK:** tipo, título, responsable, fecha, prioridad, enlaces a contacto, lead y deal, y próxima acción del lead.
- **OK (N6):** edición de todos los campos; «En curso» seleccionable (y filtro «Pendientes» = abiertas + en curso); propiedad, cita, contacto, lead y operación elegibles con buscador y validados en la organización (ajena = 404; propiedad nueva en la papelera = 422); borrar = papelera (`deletedAt`), fuera de listados, de la ficha de la operación y de la próxima acción; `TASK_CANCELLED`.
- **OK (N6):** el tipo de próxima acción (`nextActionType` + `nextActionAt`) se ve en el tablero y la tabla de Leads, en la ficha del lead y en la de la operación.
- **PARCIAL:** no hay «restaurar» una tarea borrada desde el panel.

### FASE 23: ofertas

- **OK:** base de datos y API completas, historial inmutable incluido.
- **OK (N6):** vendedor(es), financiación (catálogo) y vencimiento con interfaz; contraoferta y nueva oferta (`new_offer`, `countered` → `submitted`) con términos completos; historial visible (oferta, contraoferta, nueva oferta, aceptada, rechazada…) con quién y cuándo; página global CRM → Ofertas con filtros y panel de ofertas en la ficha de propiedad; referencias opcionales (lead, necesidad, match, comercial) validadas en la organización.

### FASE 24: operación

- **OK:** entidad, las 8 etapas, historial y ficha.
- **OK (N6):** listado y Kanban por las 8 etapas (mover con historial: quién y motivo); el menú «Operaciones» (CRM) lleva al pipeline nuevo y la pantalla antigua sigue en `/admin/operaciones` como «Cierres y comisiones» (Finanzas); oficina (entidad Oficinas) editable y filtrable.
- **OK (N6):** vínculo con reservas, arras y contratos (`deal_operation_id`) desde la ficha, validado en la organización (ajeno = 404, de otra operación = 409); arras y contratos sólo con permiso de Finanzas.
- **PARCIAL:** sin acción de borrar operaciones en el panel (la papelera `deletedAt` ya se respeta en listado y ficha).

### FASE 25: UX de la ficha de propiedad

Estado tras el bloque N7a (2026-10-05).

- **OK:** Ubicación, Características, Precio, Media, autoguardado (al editar), estado fijo en cabecera, búsqueda de campos y grupos plegables (N1), Propietarios (N2) y Actividad (N6).
- **OK (N7a):**
  - Resumen en la cabecera de la ficha: estado, precio, canales donde está publicada, propietarios, compradores compatibles, ofertas, documentos caducados o a punto de caducar, multimedia publicable y qué falta para publicar.
  - Secciones «Documentos» y «Portales» (la web propia y cada canal de la publicación multicanal con el estado de su último trabajo; sin inventar integraciones: ninguna es real hoy y se dice).
  - Defaults inteligentes al crear: operación, privacidad, país y localidad habituales de la agencia y el comercial vinculado a la cuenta (con su oficina y equipo).
  - Campos condicionales en los dos catálogos (el registro también filtra obra nueva).
  - Validación inmediata por campo (obligatorio, rangos, enteros, https, fechas).
- **PARCIAL:** edición inline fuera del editor (en listados).

### FASE 26: PropertySchemaRegistry

Estado tras el bloque N7a (2026-10-05).

- **OK:** los 7 esquemas, más las variantes de obra nueva para suelo, local/oficina, nave y garaje.
- **OK (N7a):** `publicFields` en la proyección pública (`toPublicProperty`, `toPublicSheet`) y `portalFields` en lo que se entrega a un portal (`buildPortalListing`, `PublishContext.listing`).
- **OK (N7a):** el editor de los dos catálogos usa el registro.
- **Pendiente:** ningún portal tiene adaptador real, así que `portalFields` todavía no llega a ningún proveedor.

### FASE 27: búsqueda

- **OK:** la mayoría de filtros; guardar, compartir, columnas, exportar y acciones masivas.
- **OK (bloque N7b):** subtipo, comercial, oficina, propietario, operación y características en los dos catálogos; etiquetas y campos personalizados.
- **PARCIAL:** portales — el filtro existe, pero la publicación multicanal sólo programa obra nueva, así que en 2ª mano no hay nada por lo que filtrar.

### FASE 28: acciones masivas

- **OK:** casi todas.
- **OK (verificado en N7b):** publicar y retirar en los dos catálogos; precio fijo o por porcentaje (bloque N1).
- **OK (bloque N7b):** leads con la Tabla paginada, exportación completa del filtro por lotes (sin tope) y «seleccionar todos los filtrados».
- **PARCIAL:** crear catálogo, sólo en obra nueva (Asset Export Studio sólo compone fichas de obra nueva).

### FASE 29: comunicaciones

> Actualizado tras el bloque N8a (2026-10-05). Detalle en [communications.md](communications.md), «Formularios y chat web».

- **OK:** WhatsApp, vínculo con lead y con propiedad.
- **OK (N8a):** formularios como conversación. Contacto, captación del Constructor Web, solicitud de visita, verificación de visitante y referidos crean un hilo «Formulario web» en la bandeja. Cada hilo guarda su Contact, su Lead y su Property; los envíos de la misma persona se juntan. Se responde sólo por un canal real: email transaccional, chat o abrir su hilo de WhatsApp. Sin canal, se dice.
- **OK (N8a):** widget de chat en la web pública, activable por agencia (Comunicaciones → Configuración). Cada conversación es un hilo «Chat web»: el comercial responde desde la bandeja y el visitante lo ve por sondeo.
  - Sesión con token opaco (sólo se guarda su hash) y sin cookies.
  - Aislado por agencia y por hilo.
  - Límite de tasa por IP y acción, campo trampa y tope de mensajes sin respuesta.
- **OK (N8a):** el Contact se guarda en el hilo de WhatsApp (`crm_contact_id`) al crearlo, al vincularlo y al abrirlo; la deducción queda como respaldo para las filas antiguas.
- **PARCIAL:**
  - Email: sólo salida. No hay proveedor de entrada, así que no hay bandeja de email entrante. No se simula: una respuesta del cliente llega al buzón de «Responder a» de la agencia, fuera de la plataforma.
  - Llamadas: sin validar con una llamada real (no hay número de Meta con Calling activo). No se puede validar desde aquí.

### FASE 30: INMO sobre datos estructurados

- **OK.**
- **OK (N8a):** matching de una búsqueda exploratoria sin guardarla. `find_matches` acepta `criteria` en memoria y los evalúa con el mismo prefiltro y el mismo motor que una necesidad guardada. No persiste nada; la salida dice `saved: false` y propone guardarla con `update_buyer_requirements`, que INMO ofrece sin hacerlo hasta que se le pida.

### FASE 31: tools

- **OK:** las 14.
- **Corregido (bloque N7b):** el filtro por comercial de `search_properties` ya busca también en obra nueva.

### FASE 32: lead score

- **OK.**
- **OK (N8a):** «abrió fichas» cuenta también las aperturas por email y por el chat web.
  - Una ficha de obra nueva enviada desde un hilo web a una persona conocida lleva un enlace personal (`property_share_links`).
  - Cuenta sólo si la página la abre en un navegador con el token de esa agencia y esa propiedad.
  - Se suma a las lecturas confirmadas de WhatsApp sin duplicar propiedades.
  - Las selecciones de propiedades no tienen página pública ni registro de aperturas, así que no cuentan.
- **Límite honesto:** sin acuse de lectura del proveedor, un escáner de enlaces que ejecute JavaScript podría contar como apertura.

### FASE 33: dashboard

- **OK:** KPIs, segmentos y embudo.
- **OK (N8a):** oficina como entidad (`officeId`): la del registro (lead, visita, operación) o, si no tiene, la de su comercial. El detalle en Leads usa la misma regla (`officeScope`).
- **OK (N8a):** portal rellenado en la captación real. `POST /api/v1/leads` con `source: 'portal'` + `portal` (+ `externalId` para deduplicar), y el alta manual. Los formularios de la web no lo rellenan, porque no vienen de un portal, y no hay integración directa con ningún portal.
- **OK (N8a):** cada comercial ve sólo lo suyo en el dashboard comercial:
  - Ven toda la agencia: `super_admin`, el administrador sin restricciones y la cuenta restringida con `system:write`.
  - Una cuenta restringida vinculada a su ficha (`team_members.user_id`) ve sólo lo suyo; el servidor fuerza su comercial.
  - Una cuenta restringida sin ficha recibe 403.
- **PARCIAL:** los listados de Leads, Visitas y Ofertas siguen sin esa restricción.

### FASE 34: módulos posteriores

- No se desarrollan en paralelo.
- **OK (N8b):** `/admin/automatizaciones` ya no es una demo: motor real con 7 disparadores de hechos registrados, condiciones, 5 acciones que son Domain Tools (sin envíos a clientes), registro de ejecuciones, una ejecución por evento, freno contra bucles y permisos de quien la configura. Las filas de demostración heredadas quedan marcadas `legacy` por el valor por defecto de la columna nueva y nunca se ejecutan. Ver `docs/automatizaciones.md`.
- **OK (N8a):** el marketplace refleja lo que existe hoy. Cada integración disponible enlaza a la pantalla donde se configura y dice su requisito: WhatsApp, chat y formularios web, email transaccional, Stripe, API v1, webhooks, iCal, widgets e INMO. Portales, MLS, firma electrónica, Google/Outlook, email entrante, redes sociales, conectores de marketing y optimización de rutas aparecen como «Próximamente», sin botones.

### Arquitectura INMO INTELLIGENCE

- **OK:** Tools.
- **OK (N8b):** Memoria — conversaciones persistentes por usuario y agencia, y hechos confirmados guardados como notas de la ficha, visibles y borrables.
- **OK (N8b):** Brains — cinco perfiles con sus instrucciones y herramientas; la agencia sólo puede recortarlas.
- **OK (N8b):** RAG — recuperación léxica con fuentes citadas (ayuda, base de conocimiento de la agencia, notas y fichas); sin fuente, lo dice. Sin vectores ni FTS5 (rompería el export de D1 del pipeline).
- **OK (N8b):** Workflows — tres secuencias guiadas paso a paso con confirmación, y automatizaciones reales sobre el mismo motor de herramientas.

## Plan de cierre

Va en el orden de sprints del megaprompt, con prioridad para las 8 áreas del núcleo. Cada bloque cumple el criterio de cierre: modelo, migración, API, aislamiento multi-tenant, permisos, validación, interfaz responsive, tests unitarios, de integración y E2E, documentación, build y typecheck en verde.

Las columnas nuevas se despliegan en dos pasos (lección del 2026-09-15):
1. Primero la migración **sola**.
2. Después el código que la usa.

| Bloque | Contenido |
|---|---|
| N0 | Migración 0086 aditiva con todo el modelo nuevo; este documento. |
| N1 | Oficinas y equipos, vínculo usuario ↔ comercial, `createdBy` y borrado lógico, ficha de propiedad ampliada (FASES 1-5) con las tablas de detalle, tipos y subtipos, historial de precios completo. |
| N2 | Contactos CRM 360: edición, roles, propietarios (PropertyContact), cabecera y todas las pestañas, notas y etiquetas. |
| N3 | Leads: ficha y alta manual, todos los campos, historial de etapas con motivo, estados alternativos, deduplicación completa, routing por oficina, idioma y horario, SLA completo. |
| N4 | Compradores y matching: editor completo de necesidades, importancia por criterio, estado en el motor, matching en la ficha de propiedad y acciones desde cualquier vista. |
| N5 | Citas: todos los tipos y campos, edición, tours con duración por parada en los dos catálogos, resultado estructurado, iCal, preparación para optimizar rutas. |
| N6 | Activity en todas las fichas, tareas editables, ofertas visibles con historial, operaciones con listado y Kanban, vínculo con reservas y contratos. |
| N7 | Documentos legales con permisos, media completo, búsqueda (mapa, radio, bbox y todos los filtros), acciones masivas completas, campos personalizados. |
| N8 | Comunicaciones (formularios, widget), dashboard por comercial, automatizaciones reales, capas de INMO Intelligence, correcciones de documentación. |

## Seguimiento del cierre

| Bloque | Estado | Dónde |
|---|---|---|
| N0 | Hecho. Migración 0086 aplicada en producción (con el arreglo de `leads.converted_contact_id`, que ya existía allí). | PR #128, #129 |
| N1 | Hecho: oficinas y equipos, vínculo usuario ↔ comercial, ficha ampliada (`property_details` / `property_legal_economics`), tipos y subtipos comunes, histórico de precios con precio anterior, usuario y motivo, y papelera de propiedades en los dos catálogos. | PR #130, `docs/ficha-ampliada-propiedad.md` |
| N2 | Hecho: edición del contacto con deduplicación, 9 roles por persona, propietarios con % (PropertyContact), cabecera completa, 15 pestañas, notas como entidad. | `docs/crm-contacto-360.md` |
| N3 | Hecho: ficha y alta manual del lead con todos los campos, deduplicación por email/teléfono/WhatsApp/id externo con unificar o crear igualmente, historial de fases con usuario, fecha, fase anterior, nueva y motivo (incluidos perdido y reactivado), enrutado por oficina, equipo y horario, idioma rellenado, `firstContactAt` y primera respuesta humana desde los contactos salientes reales, primera cita desde el panel. Además cierra tres referencias entre agencias que no se validaban (comparables de mercado, activo de un contrato, llamada anotada). | `docs/leads-ficha-y-enrutado.md` |
| N4-N8 | En curso, en este orden. | — |

Al terminar N8 se repite esta auditoría punto por punto contra el megaprompt, y lo que quede abierto se lista aquí con su motivo.

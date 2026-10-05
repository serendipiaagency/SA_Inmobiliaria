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
- **FALTA:**
  - Note como entidad (hoy solo hay columnas `notes`).
  - CustomFieldDefinition y CustomFieldValue.
  - Entidades Oficina y Equipo (hoy son texto libre en `team_members`).
  - `officeId` en todas las entidades.
  - `createdBy` en propiedades, leads y citas.
  - `deletedAt` en propiedades, leads, citas, tareas y operaciones: **las propiedades se borran físicamente**.
  - Vínculo entre usuario y comercial (`users` ↔ `team_members`).
- **PARCIAL:** Tag. Solo se escribe con la acción masiva: no se ve, no se filtra y los contactos no se pueden etiquetar.

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
- **FALTA (búsqueda):** por radio, por bounding box y por coordenadas.
- **PARCIAL (búsqueda):**
  - Mapa: solo en la web, solo obra nueva, máximo 48 resultados y sin buscar por la zona visible.
  - Barrio: sin filtro.
  - Municipio en la web pública.

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

- **FALTA:** todo salvo la letra energética. No hay gestor de documentos por propiedad ni permisos por rol (interno, propietario, comprador autorizado, público).

### FASE 7: multimedia

- **OK:** fotos, planos, orden, portada, reordenar y eliminar.
  - Fallo al eliminar: deja huérfanos el objeto en R2 y su registro.
- **FALTA:** renders, PDF y 360.
  - Por recurso: tipo, título, alt, pie, publicable, privado e idioma.
  - Acciones: selección múltiple, ocultar y descargar.
- **PARCIAL:**
  - Vídeo: uno solo.
  - Tour virtual: solo una marca. El 360 público simula el tour con la primera foto.
  - Drone: un hueco.

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
- **PARCIAL:**
  - Timeline solo en la ficha antigua de Cliente, filtrada a 6 tipos de evento.
  - Sin timeline de lead, propiedad ni operación.
- **FALTA:** eventos «match encontrado» automático y «cliente abrió ficha».

### FASE 22: tareas

- **OK:** tipo, título, responsable, fecha, prioridad, enlaces a contacto, lead y deal, y próxima acción del lead.
- **PARCIAL:**
  - Sin edición.
  - «En curso» no se puede seleccionar.
  - Propiedad y cita solo se rellenan automáticamente.
  - El tipo de próxima acción no aparece en el tablero.

### FASE 23: ofertas

- **OK:** base de datos y API completas, historial inmutable incluido.
- **PARCIAL:**
  - Vendedor, financiación y vencimiento sin interfaz.
  - La contraoferta solo lleva importe.
  - El historial no se ve.
  - No hay listado global ni vista por propiedad.

### FASE 24: operación

- **OK:** entidad, las 8 etapas, historial y ficha.
- **PARCIAL:**
  - Sin listado ni Kanban.
  - El menú «Operaciones» lleva a la pantalla antigua.
- **FALTA:** vínculo con reservas, arras y contratos.

### FASE 25: UX de la ficha de propiedad

- **OK:** Ubicación, Características, Precio, Media, autoguardado (al editar) y estado fijo en cabecera.
- **FALTA:** secciones Propietario, Documentos, Portales y Actividad; búsqueda de campos; secciones colapsables.
- **PARCIAL:** Resumen, defaults inteligentes, campos condicionales (solo 2ª mano), edición inline y validación inmediata por campo.

### FASE 26: PropertySchemaRegistry

- **OK:** los 7 esquemas.
- **PARCIAL:**
  - `publicFields` y `portalFields` no se usan.
  - La interfaz solo usa el registro en 2ª mano.

### FASE 27: búsqueda

- **OK:** la mayoría de filtros; guardar, compartir, columnas, exportar y acciones masivas.
- **FALTA:** subtipo, agente, oficina, propietario y portales.
- **PARCIAL:**
  - Operación: solo en 2ª mano.
  - Características: solo desde las tools.

### FASE 28: acciones masivas

- **OK:** casi todas.
- **PARCIAL:**
  - Publicar, retirar y catálogo: solo en obra nueva.
  - Precio: fija un valor, no aplica porcentaje.
  - Exportar leads: tope de 200 filas.

### FASE 29: comunicaciones

- **OK:** WhatsApp, vínculo con lead y con propiedad.
- **PARCIAL:**
  - Email: solo salida.
  - Llamadas: sin validar con una llamada real.
  - El contacto se deduce en vez de guardarse.
- **FALTA:** formularios como conversación y widget de chat.

### FASE 30: INMO sobre datos estructurados

- **OK.**
- **PARCIAL:** el matching de una búsqueda exploratoria solo funciona si se guarda una necesidad.

### FASE 31: tools

- **OK:** las 14.
- **Fallo:** el filtro por comercial excluye obra nueva.

### FASE 32: lead score

- **OK.**
- **PARCIAL:** «abrió fichas» solo cuenta WhatsApp.

### FASE 33: dashboard

- **OK:** KPIs, segmentos y embudo.
- **PARCIAL:**
  - Oficina: por texto.
  - Portal: nunca se rellena.
- **FALTA:** que cada comercial vea solo lo suyo.

### FASE 34: módulos posteriores

- No se desarrollan en paralelo.
- **Ficticio:** `/admin/automatizaciones`, con datos de demo que nada ejecuta.
- **Desactualizado:** el marketplace.

### Arquitectura INMO INTELLIGENCE

- **OK:** Tools.
- **PARCIAL:** Memoria (solo la conversación en curso).
- **FALTA:** Brains, RAG y Workflows.

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

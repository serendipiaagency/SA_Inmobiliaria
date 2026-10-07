/**
 * Content for the "Ayuda y Documentación" admin module (pages/admin/ayuda.vue).
 *
 * MAINTENANCE: every time a new admin page/feature is added, add (or update) an
 * entry here in the matching `group` — the same group labels used in the
 * `nav` array in layouts/admin.vue — and add its route to `layouts/admin.vue`'s
 * nav too. This file is the single source of truth for the in-app help guide;
 * a new feature with no entry here is effectively undocumented for the user.
 * See also the reminder in CLAUDE.md.
 */

export interface HelpSection {
  key: string
  group: string
  title: string
  route: string | null
  summary: string
  steps: string[]
}

export interface HelpFaq {
  id: string
  question: string
  answer: string
  tags: string[]
}

/** Ficha ampliada de la propiedad (migración 0086): igual en los dos catálogos, así que se documenta una vez. */
const PROPERTY_SHEET_HELP_STEPS: string[] = [
  'Encima de los pasos hay un buscador "Buscar un campo": escribe "IBI", "fianza", "catastral" o "calefacción" y pulsa el resultado — te lleva al paso correcto, despliega su grupo y resalta el campo. Cada grupo de campos con título se puede plegar y desplegar pulsando su título.',
  'El "Tipo de propiedad" es la misma lista en los dos catálogos: piso, casa, chalet, adosado, ático, dúplex, estudio, finca, terreno, local, oficina, nave, garaje, edificio y promoción. Al lado, "Subtipo" ofrece sólo los subtipos de ese tipo (ático dúplex, bajo con jardín, casa de pueblo, nave logística…); si cambias el tipo, un subtipo que ya no le corresponde se vacía solo. También en "Información básica": "Estado comercial" (disponible, reservada, vendida, alquilada, retirada, borrador) y "Código comercial", el código con el que anuncias el inmueble.',
  'En "Ubicación" están además comunidad/región, provincia, municipio, barrio, tipo de vía y escalera.',
  'En "Características" hay superficies adicionales (oficina, comercial, total y computable) y un grupo "Distribución" con el total de estancias y el número de terrazas, balcones, trasteros, vestidores, despachos y plantas.',
  'El paso "Edificio y vivienda" recoge año de reforma, plantas del edificio, nº de vecinos, conserje, portero, fachada y estructura; y de la vivienda, exterior/interior, tipo de cocina, suelos, carpintería, cristales, altura de techos, si está reformada y si tiene armarios empotrados.',
  'El paso "Instalaciones y exteriores" recoge calefacción, agua caliente, aire acondicionado, suelo radiante, chimenea, domótica, alarma, fibra, placas solares y aerotermia; las zonas comunes (piscina y jardín comunitarios, gimnasio, pádel, tenis, zona infantil, coworking, salón social, seguridad); y el exterior (vistas, primera línea, jardín y piscina privados, porche, patio, balcón).',
  'En "Precio": el precio por m² se calcula solo (precio ÷ superficie construida) y nunca se guarda; "Motivo del cambio de precio" es opcional y, si cambias el precio, queda en el histórico junto al precio anterior y a quién lo cambió. Con operación "Venta" aparecen el precio mínimo autorizado y el recomendado (internos); con "Alquiler", la fianza, el depósito o garantía adicional y si los gastos están incluidos. Siempre: comunidad mensual, IBI y tasa de basuras, y las comisiones (tipo, importe o %, IVA, honorarios de comprador y de propietario). Los importes no llevan moneda fija: se muestran con la moneda de tu agencia.',
  'El paso "Legal y certificados" recoge referencia catastral, situación registral, finca registral, registro de la propiedad, cargas, hipoteca, ocupación, licencias, cédula de habitabilidad, ITE/IEE y el certificado energético completo (nº de registro, caducidad, consumo, letra y valor de emisiones). Todo es interno salvo la parte energética.',
  'En "Comercial / Inversión" la propiedad se asigna, además de a un comercial, a una oficina y a un equipo (CRM → Oficinas y CRM → Equipos). En "Multimedia", "Enlace del tour virtual" guarda la URL de Matterport, Kuula u otro visor 360.',
  'El "Histórico de precios" muestra en cada fila la fecha, el precio anterior, el precio nuevo (con su variación en %), quién lo cambió y el motivo. "Actualizar precio" en bloque admite un precio fijo o un porcentaje sobre el precio de cada propiedad (p. ej. -5 o +3) y su propio motivo.',
  'Según el tipo de inmueble, el editor sólo enseña lo que aplica: un terreno no pide calefacción ni cocina, un garaje no pide distribución de vivienda. Salvo un subtipo que ya no corresponde, ningún dato se borra al cambiar de tipo: sólo deja de mostrarse.',
]

/**
 * Papelera de propiedades (deleted_at, migración 0086): igual en los dos
 * catálogos, así que se documenta una vez. Ver docs/ficha-ampliada-propiedad.md,
 * «Papelera», para la lista de qué consultas excluyen las borradas.
 */
const PROPERTY_TRASH_HELP_STEPS: string[] = [
  '"Eliminar" (en la tarjeta o en la fila de la lista) ya no borra la propiedad: la manda a la Papelera, desde donde se puede restaurar. Antes de hacerlo te pide confirmación ("¿Mover a la papelera?").',
  'Una propiedad en la Papelera desaparece del listado, de la web pública (su ficha responde "no encontrada"), del sitemap, del widget, de la API v1, de las búsquedas y selectores de inmueble, del matching, de las alertas de búsquedas guardadas, de los contadores y estadísticas, de INMO y de las acciones masivas ("Seleccionar todos los filtrados" no la incluye). Tampoco se publica en ningún canal: un trabajo de publicación pendiente queda bloqueado, aunque retirarla de un canal sí se permite.',
  'Lo que ya existía sobre ella se conserva tal cual: sus ofertas, operaciones, visitas, contratos, tareas y conversaciones siguen viéndola (borrar no reescribe la historia). Lo que no se puede es crear algo NUEVO sobre una propiedad de la Papelera — una oferta, una visita o un tour, una tarea, un envío por WhatsApp, una selección, una operación, un contrato, una exportación o una programación de publicación —: el panel lo rechaza con "La propiedad está en la papelera: restáurala antes de…".',
  'El botón "Papelera", arriba a la derecha del listado, enseña sólo las propiedades borradas (con la fecha en que se borraron). La búsqueda y los filtros funcionan igual dentro de la Papelera. "← Volver al listado" regresa a las propiedades vivas.',
  'En la Papelera cada propiedad tiene dos acciones: "Restaurar" la devuelve al listado exactamente como estaba (con su ficha, galería, planos e histórico de precios), y "Eliminar definitivamente" la borra para siempre junto con su ficha ampliada — esto último no se puede deshacer y pide confirmación.',
  'Pulsar una propiedad de la Papelera abre su ficha para revisarla: arriba aparece el aviso "Esta propiedad está en la papelera" con un botón "Restaurar". Puedes seguir editando la ficha mientras está en la Papelera (los cambios se guardan), pero editarla no la saca de ahí: sólo "Restaurar" lo hace. Mientras tanto no se ofrecen "Vista previa", "Compartir por WhatsApp" ni la exportación de piezas.',
  'Cada agencia sólo ve y restaura su propia Papelera: una propiedad borrada de otra inmobiliaria no aparece nunca, ni se puede restaurar ni eliminar desde otra cuenta.',
]

/** Ofertas, notas y actividad en la ficha de la propiedad (bloque N6, cierre D3a), igual en los dos catálogos. */
const PROPERTY_CRM_HELP_STEPS: string[] = [
  'Debajo del editor, una vez creada la propiedad, el panel «Ofertas» lista todas las ofertas sobre ella (comprador, importe actual, financiación, vencimiento y estado). «+ Nueva oferta» la crea ya con este inmueble: comprador, vendedor(es), comercial, importe, condiciones, financiación y fecha de vencimiento. Pulsa una oferta para negociarla y ver su historial completo. Si la propiedad está en la Papelera, sus ofertas se siguen viendo pero no se pueden crear nuevas.',
  'El panel «Notas» guarda notas internas del equipo sobre la propiedad (las llaves, una incidencia, lo que dijo el propietario…): escribe y pulsa «Añadir nota»; cada una lleva su autor y su fecha, y se puede fijar arriba, editar o eliminar. Nunca salen en la web ni se envían al cliente. También se pueden anotar en una propiedad de la Papelera.',
  'El panel «Actividad» es la cronología de la propiedad: ofertas, citas y visitas, tareas, fichas enviadas por WhatsApp (y si el cliente las abrió), llamadas, coincidencias… con quién lo hizo y cuándo. Los botones de arriba filtran por tipo y «Ver más antigua» carga lo anterior.',
]

/**
 * Documentos, multimedia, resumen y portales de la ficha (bloque N7a), igual
 * en los dos catálogos. Ver docs/documentos-y-multimedia.md.
 */
const PROPERTY_N7A_HELP_STEPS: string[] = [
  'Al abrir una propiedad ya creada, arriba del todo está el «Resumen de la ficha»: estado comercial (con el estado de la obra o la disponibilidad debajo, y si es exclusiva), precio (renta mensual en alquiler), en qué canales está publicada, propietarios, cuántos compradores encajan, ofertas abiertas, documentos (en rojo los caducados) y la multimedia que de verdad se publica. Si hay documentos caducados o que caducan en los próximos 30 días, o le falta algo para poder publicarse, lo avisa con una franja de color. «Actualizar» lo vuelve a calcular.',
  'Paso «Documentos»: pulsa «Subir un documento», elige el fichero (PDF o imagen escaneada, hasta 20 MB), el tipo (escritura, nota simple, IBI, certificado energético, planos, contrato, mandato, licencias, recibos, comunidad u otros), el título, quién puede verlo y, si los tiene, las fechas de emisión y caducidad y unas notas. Pulsa «Subir documento». El fichero se comprueba antes de guardarlo (un PDF que no abre o un fichero disfrazado se rechaza).',
  '«Quién puede verlo» decide quién lo descarga: «Interno» sólo tu equipo; «Propietario» además los propietarios y copropietarios de esta propiedad (paso «Propietarios»); «Comprador autorizado» además los contactos a los que les des acceso; «Público» además cualquiera desde la web, pero sólo mientras la propiedad esté publicada. Propietarios y compradores lo descargan desde «Mi cuenta», entrando con una cuenta de rol «usuario» con el mismo email que tienen en su contacto (Sistema → Usuarios).',
  'En cada documento: «Descargar», «Editar» (tipo, título, visibilidad, fechas y notas), «Accesos» (busca un contacto y pulsa «Dar acceso»; «Revocar» lo quita) y «A la papelera». La pestaña «Papelera» del paso permite «Restaurar» o «Eliminar definitivamente». Un documento en la papelera no lo puede descargar nadie; a los 30 días su fichero se borra para siempre.',
  'Paso «Galería y multimedia»: además de ordenar y elegir portada, cada foto tiene «Datos» (título, texto alternativo, pie, idioma, y las casillas publicable, privada y oculta). Marca varias fotos con su casilla (o «Seleccionar todo») para ocultarlas, mostrarlas, hacerlas privadas o publicables, descargarlas o eliminarlas de una vez. Las ocultas, privadas o no publicables se ven atenuadas y no salen ni en la web ni en los portales; una privada además deja de poder abrirse sin entrar en el panel.',
  'Debajo de las fotos, «Vídeos, tours, renders, PDF, drone y 360°»: elige el tipo, pega un enlace https:// (YouTube, Vimeo, Matterport, Kuula…) o sube el fichero, ponle título, texto alternativo e idioma y pulsa «Añadir». Puedes añadir todos los vídeos que quieras; «Principal de su tipo» marca el que va primero. Cada recurso tiene las mismas casillas publicable / privado / oculto y se edita, descarga o manda a la papelera igual que las fotos.',
  'En la web pública, la pestaña 360° sólo aparece si la propiedad tiene un tour virtual o una foto 360 de verdad; los vídeos de YouTube o Vimeo se abren en otra pestaña y los subidos se reproducen en la ficha; los renders tienen su pestaña y los PDF publicables y los documentos públicos salen en «Folletos y documentos».',
  'Eliminar una foto ya no deja su fichero ocupando espacio: si ninguna otra ficha de tu agencia lo usa (por ejemplo, una promoción duplicada o la portada), deja de contar en tu almacenamiento al momento y se borra del todo a los 30 días.',
  'Paso «Portales»: la web pública de tu agencia y cada canal de la publicación multicanal (Idealista, Fotocasa, redes, mensajería…) con su estado: publicada, programada, retirada, con error, bloqueada o sin programar, y si el canal tiene integración real. Hoy ningún portal la tiene, y el paso lo dice. Programar o retirar se hace en Portal Web → Publicación multicanal. A un portal sólo se le entregan los campos que el registro de esquemas permite y las fotos y recursos publicables.',
  'Al crear una propiedad, el editor ya trae rellenado lo habitual: operación «Venta», ubicación exacta, el país y la localidad más frecuentes de tu agencia y, si tu usuario está vinculado a un comercial, ese comercial con su oficina y equipo. Puedes cambiar cualquiera. Mientras escribes, cada campo avisa al momento si algo no vale (un número negativo, un enlace sin https://, una fecha imposible).',
  'El tipo de inmueble decide qué campos se ven en los dos catálogos: una promoción de obra nueva de garajes, locales, naves o suelo tampoco pide dormitorios, y para publicarla se exige lo de su tipo (por ejemplo, la parcela en un suelo).',
]

/** Búsqueda del bloque N7b (FASES 0, 2 y 27), igual en los dos catálogos. */
const PROPERTY_SEARCH_N7B_HELP_STEPS: string[] = [
  'En "Filtros" hay además: Subtipo, Comercial (o «Sin comercial»), Oficina, Propietario (escribe parte del nombre, email o teléfono de un propietario o copropietario), Barrio / urbanización, Municipio, Etiqueta, «Publicada en el portal» (sólo en Propiedades (web): la publicación multicanal sólo programa obra nueva) y Características (terraza, piscina —también privada o comunitaria—, garaje, ascensor, jardín, y por separado piscina privada, piscina comunitaria y jardín privado: debe tenerlas todas) y «Más características». Venta/alquiler está ya en los dos catálogos. Cada filtro aparece como chip, va a la URL, a «Exportar CSV», a las vistas guardadas y a «Seleccionar las N que cumplen el filtro».',
  '«Campo personalizado» (en Filtros) busca por los campos propios de tu agencia: elige el campo y el valor (en un número o una fecha, «desde» y/o «hasta») y pulsa «Añadir filtro». En un texto busca lo que contenga lo escrito.',
  'Búsqueda en el mapa: el botón «Mapa» enseña sobre el mapa todas las propiedades del filtro que tienen ubicación (hasta 1.000; si hay más, acerca el mapa o filtra). «Buscar en esta zona» filtra por lo que se ve en el mapa; «Buscar alrededor de un punto» + un radio en km: pulsa en el mapa y busca en ese radio, ordenando por cercanía («Más cerca primero») y enseñando la distancia en cada fila. «Quitar zona» lo deshace. También puedes escribir las coordenadas a mano en Filtros → «Cerca de unas coordenadas».',
  'Las propiedades sin ubicación guardada (o con 0,0) nunca salen en una búsqueda por zona o radio: sitúalas en el mapa del paso «Ubicación» de su ficha.',
  'Etiquetas: se ven en la lista y en las tarjetas. En la ficha de la propiedad (debajo del editor, una vez creada) escribe una etiqueta y pulsa «Añadir» — si ya existe en tu agencia se reutiliza —, o quítala con la ×. Son las mismas que pone la acción masiva «Añadir etiqueta».',
  'Campos personalizados: en la ficha, debajo del editor, el panel «Campos personalizados» enseña los campos que tu agencia haya creado para propiedades (CRM → Campos personalizados), por sección. Rellénalos y pulsa «Guardar campos»; los marcados «Público» salen en la ficha pública de Propiedades (web), en «Más información». Los demás nunca salen de la agencia.',
]

/**
 * Ficha y búsqueda de propiedades (cierre D1p), igual en los dos catálogos:
 * estado comercial común, fechas con selector, dormitorios, piscina y jardín,
 * renta mensual, comunidad, búsqueda por referencias, «Más características»,
 * exportación sin tope y autor de la ficha. Ver docs/ficha-ampliada-propiedad.md
 * y docs/property-search.md.
 */
const PROPERTY_D1P_HELP_STEPS: string[] = [
  'Tres datos distintos, cada uno con su nombre: el «Estado comercial» (disponible, reservada, vendida, alquilada, retirada o borrador) es el que gestiona la agencia y es igual en los dos catálogos; el «Estado de la obra» (obra nueva, en construcción, lista) es sólo la fase de construcción de Propiedades (web); y la «Disponibilidad» (disponible o vendida) es la de 2ª mano, la que mira el matching.',
  'En el listado, el desplegable «Todo estado comercial» (junto al de estado de la obra o disponibilidad) filtra por estado comercial, también «sin indicar». En la vista Lista, la columna «Estado comercial» enseña el chip y, con permiso de escritura, se cambia haciendo clic en él (como el precio). En bloque: marca las propiedades y elige «Cambiar estado comercial»; queda en la auditoría como el resto de acciones masivas.',
  'Al cambiar el estado comercial: «Reservada» pone la etiqueta «Reservada» de la web y cualquier otro estado la quita; en 2ª mano, «Vendida» y «Disponible» ponen igual la disponibilidad. Al revés, marcar una propiedad de 2ª mano como vendida (a mano, en bloque o al cerrar una operación) pasa a «Vendida» un estado comercial que ya estuviera indicado. Las fichas que no se tocan no cambian.',
  'La fecha de captación y el inicio y vencimiento de la exclusiva se eligen ahora en un calendario. Si una ficha antigua la tenía escrita a mano (por ejemplo «15/03/2025»), se sigue entendiendo —el editor dice cómo la lee— y se guarda en el formato nuevo en cuanto eliges la fecha. El vencimiento no puede ser anterior al inicio.',
  'En Filtros, «Vencimiento de la exclusiva» encuentra las exclusivas caducadas o que caducan en los próximos 30 días (las mismas que avisan en el resumen de la ficha). «Captada desde/hasta» compara fechas de verdad, también las escritas a mano en el formato antiguo.',
  '«Dormitorios» es el número de dormitorios (en el editor, el listado, el filtro «Dormitorios (mín.)» y las tarjetas); «Habitaciones (total de estancias)», en Distribución, es otro dato: todas las estancias habitables.',
  'En Filtros → Características, «Piscina» y «Jardín» encuentran también las que sólo tienen piscina o jardín privado o comunitario en la ficha; y hay filtros propios para «Piscina privada», «Piscina comunitaria» y «Jardín privado». Los compradores compatibles cuentan la piscina y el jardín igual. «Más características» deja filtrar por cualquier sí/no de la ficha ampliada (conserje, fibra, aerotermia, gimnasio, primera línea…), por bloques.',
  'Con operación «Alquiler», el precio es la renta de cada mes: el editor lo llama «Renta mensual» y el listado, las tarjetas y el resumen lo enseñan con «/mes»; el precio por m² pasa a ser renta por m² al mes (€/m²·mes).',
  'La comunidad se escribe en un solo sitio: Precio → «Comunidad (mensual)». El antiguo «Gastos de comunidad anuales» sólo aparece (en Comercial / Inversión) en las fichas que lo tenían relleno, para no perderlo; igual que la casilla antigua «Reservada», que ahora sigue al estado comercial.',
  'El buscador del listado encuentra la propiedad por su referencia interna, externa o de agencia, por su código comercial y por el número de referencia (Ref. #), además de por nombre, calle, urbanización o zona.',
  '«Exportar CSV (N)» descarga todas las propiedades del filtro, sin límite de filas, con el estado comercial de cada una.',
  'El resumen de la ficha dice quién la creó y cuándo («Creada por … el …»). Las fichas anteriores a que se guardara el autor lo indican.',
]

/** Edición inline del listado (cierre C1, FASE 25), igual en los dos catálogos. */
const PROPERTY_INLINE_EDIT_HELP_STEPS: string[] = [
  'Edición rápida desde el listado (vista Lista): haz clic en el precio, en el estado comercial, en el estado de la obra (o la disponibilidad) o en el comercial de una fila (sale un lápiz al pasar por encima) y cámbialo ahí mismo, sin abrir la ficha. En el precio escribe la cifra (vale «450000» o «450.000») y pulsa Enter o sal del campo para guardar; en estado y comercial, elige en el desplegable y se guarda al momento. Esc (o la ×) cancela y deja el valor como estaba.',
  'Se valida al escribir: un precio vacío, negativo o que no es un número se marca en rojo bajo el campo y no se envía. Si el servidor rechaza el cambio (un estado que no es de este catálogo, un comercial que no es de tu agencia, sin permiso…), el motivo se queda en rojo bajo el control hasta que lo corrijas o canceles.',
  'Es el mismo guardado que el editor: un cambio de precio deja su fila en el «Histórico de precios» de la ficha (con quién lo cambió; para anotar un motivo, cámbialo desde la ficha), y estado y comercial quedan en la auditoría como cualquier edición. La columna «Comercial» se puede ocultar o enseñar desde «Columnas». Sólo se ofrece si tu cuenta puede escribir en el Portal Web; si no, la fila sólo enseña los valores.',
]

/** Paso «Propietarios» del editor (PropertyContact), igual en los dos catálogos. */
const PROPERTY_OWNERS_HELP_STEPS: string[] = [
  'El paso «Propietarios» (aparece una vez creada la propiedad) lista quién es quién: propietario, copropietario, apoderado, inquilino o contacto. Busca a la persona entre tus contactos o créala ahí mismo; a propietarios y copropietarios se les puede dar su % de propiedad — la suma nunca puede pasar del 100 % (el editor avisa si no llega al 100 %). Marca uno como «Principal» si quieres destacarlo. «Quitar» lo desvincula sin borrar el contacto.',
]

/** Paso «Compradores compatibles» del editor de propiedad (núcleo N4), igual en los dos catálogos. */
const PROPERTY_BUYER_MATCHES_HELP_STEPS: string[] = [
  'El paso «Compradores compatibles» (el último del editor, aparece una vez creada la propiedad) enseña qué necesidades activas de tus contactos encajan con este inmueble, con su porcentaje y el desglose línea a línea (✓ cumple, △ casi, ✕ no cumple, ? no consta). Se calcula al abrir el paso con lo último guardado: si acabas de cambiar la ficha, pulsa «Recalcular». «Incluir descartados por un imprescindible» enseña también los que no pasan un imprescindible, con el porqué.',
  'En cada comprador tienes las acciones de siempre: «Seleccionar», «Enviar propiedad» (por WhatsApp desde Comunicaciones; sólo se pone «Enviado» si el envío sale de verdad, y si el contacto no tiene teléfono el botón queda desactivado y lo dice), «Crear selección» (nueva o añadiéndola a una que ya tenga esa persona), «Crear visita» (eliges comercial, fecha y canal; comprueba que el comercial no tenga otra cita a esa hora) y «Descartar» con motivo — «Recuperar» lo deshace.',
]

export function useHelpContent() {
  const sections: HelpSection[] = [
    // --- General ---------------------------------------------------------
    {
      key: 'dashboard',
      group: 'General',
      title: 'Dashboard',
      route: '/admin',
      summary: 'Resumen general del negocio: leads recientes, visitas próximas, propiedades destacadas y KPIs clave de un vistazo.',
      steps: [
        'Al entrar en el panel de administración, esta es la primera pantalla que ves.',
        'Los números y listados se calculan en tiempo real sobre tus propios datos — no son de ejemplo.',
        'Usa los accesos rápidos del dashboard para saltar directamente a Leads, Visitas o Propiedades.',
      ],
    },
    {
      key: 'analytics',
      group: 'General',
      title: 'Analytics',
      route: '/admin/analytics',
      summary: 'Estadísticas de tráfico y comportamiento de tu web pública (visitas a fichas, orígenes, propiedades más vistas).',
      steps: [
        'Consulta qué propiedades generan más interés antes de decidir dónde invertir en marketing.',
        'Filtra por rango de fechas para comparar periodos.',
      ],
    },
    // --- CRM ---------------------------------------------------------------
    {
      key: 'contactos',
      group: 'CRM',
      title: 'Contactos',
      route: '/admin/contactos',
      summary:
        'Las personas. Un contacto es la ficha de alguien —comprador, vendedor, inquilino— independiente de cuántas veces te haya escrito o de si ya es cliente.',
      steps: [
        'Al crear un contacto («Nuevo contacto»: nombre, tipo, email, teléfono, WhatsApp e id externo con su sistema), el sistema busca duplicados por email, teléfono, WhatsApp e id externo dentro de tu agencia y te avisa mientras rellenas el formulario. Nunca fusiona a dos personas por su cuenta: te enseña el candidato y tú decides.',
        'Ante un candidato tienes tres opciones: «Abrir» (ver el que ya existe), «Unificar» o «Crear igualmente». «Unificar» no crea otro contacto: completa el existente con los datos que acabas de escribir y que le faltan (por ejemplo su WhatsApp o su id de Idealista) y lo abre. Nunca cambia un dato que ya tenía —si escribiste otro email, se queda el suyo— ni le pone un teléfono o un id externo que ya sea de otra persona de tu agencia. Queda en su pestaña Actividad como «Completado con un alta nueva», con qué datos se añadieron y cuáles no se pisaron.',
        'Si de verdad son dos personas distintas que comparten un dato, usa "Crear igualmente": queda registrado que la decisión fue consciente. El id externo es la excepción: «12345» de Idealista sólo puede ser de una persona, así que si ya es de otra no se puede crear igualmente (unifica con ella). Un id externo siempre va con su sistema (Idealista, Fotocasa, CRM anterior…): el mismo número en dos sistemas son dos personas.',
        'Desde la ficha, la pestaña Necesidades guarda qué busca esa persona, y la pestaña Leads reúne todas las veces que ha contactado contigo.',
        'La pestaña "Comunicaciones" reúne lo que se ha hablado con esa persona por todos sus leads y clientes: conversaciones de WhatsApp, llamadas y los emails que la plataforma le ha enviado (confirmaciones de visita, avisos…). Los emails que se listan son los enviados; si el email entrante está activo, lo que la persona responde a un email enviado desde un hilo de Comunicaciones aparece en ese hilo (y el hilo, aquí). No hay un buzón de email general.',
        'La pestaña "Posibles duplicados" busca, dentro de tu agencia, otras fichas que coincidan en email, teléfono o WhatsApp con esta persona. Antes de fusionar te enseña los dos registros completos, en qué campos difieren (por ejemplo, dos emails distintos) y todo lo que pasaría al contacto que sobrevive: leads, necesidades, compatibilidades, propiedades en las que figura, roles, ofertas, operaciones, citas, tareas, notas, selecciones, accesos a documentos, etiquetas y campos personalizados.',
        'Al fusionar eliges, campo a campo, cuál de los dos valores se queda cuando hay conflicto; lo que no elijas se rellena con el dato del duplicado sólo si el superviviente lo tenía vacío. El duplicado nunca se borra: se archiva, todo lo que colgaba de él pasa a la ficha que queda activa y su historial de actividad se ve en ella.',
        'Si los dos figuran como comprador y vendedor en la misma oferta u operación, no se pueden fusionar: no son la misma persona. La comparación te lo indica y el botón "Confirmar fusión" queda desactivado.',
        'La cabecera de la ficha reúne lo esencial: teléfono, email, WhatsApp, idioma, país, comercial, oficina, origen, estado, score (el mejor de sus leads), último contacto, próxima acción y «Creado por X el Y» (quién lo dio de alta; si ese usuario ya no existe, «usuario eliminado»), con botones directos para llamar, escribir por WhatsApp o enviar un email. «Editar» abre todos esos datos, el id externo con su sistema y los roles; si el email, teléfono, WhatsApp o id externo nuevos ya son de otra persona de tu agencia te lo dice antes de guardar (puedes «Guardar igualmente» si de verdad son dos personas, salvo con el id externo). El id externo se ve en la pestaña «Ficha y duplicados».',
        'Roles: una persona puede ser a la vez comprador, vendedor, propietario, arrendador, inquilino, inversor, colaborador, proveedor u otro. Se marcan en «Editar» y el listado de Contactos se puede filtrar por rol. Al vincular a alguien como propietario de una propiedad, recibe el rol «Propietario» automáticamente.',
        'Pestañas: Resumen, Necesidades, Propiedades (en las que figura y con qué papel; «Vincular a una propiedad» lo añade), Leads, Visitas, Ofertas (como comprador o como vendedor), Comunicaciones (los tres canales juntos) y por separado Emails, WhatsApp y Llamadas, Tareas (con alta rápida), Documentos (lo que esta persona puede descargar y por qué: como propietaria, por acceso concedido o porque es público; los concedidos que con la visibilidad actual no dan acceso salen marcados), Notas, Actividad y «Ficha y duplicados».',
        'Notas: escribe notas internas sobre la persona; se pueden fijar arriba, editar y eliminar (van a la papelera). Nunca se envían al cliente.',
        'Actividad: la cronología completa de la persona — leads, necesidades, coincidencias, citas y visitas, tareas, ofertas (también contraofertas y nuevas ofertas), operaciones, fichas enviadas y abiertas, llamadas —, con quién lo hizo y un enlace a cada cosa. Los botones de arriba filtran por tipo; «Ver más antigua» carga lo anterior.',
        'Etiquetas: los contactos ya se pueden etiquetar. En la cabecera de la ficha, escribe una etiqueta en «+ Etiqueta» y pulsa «Añadir» (si ya existe en tu agencia, se reutiliza); la × la quita. Se ven en el listado de Contactos, que se puede filtrar por etiqueta con el desplegable «Todas las etiquetas».',
        'Campos personalizados: en la pestaña «Ficha y duplicados», el panel «Campos personalizados» enseña los campos que tu agencia haya creado para contactos (CRM → Campos personalizados). Rellénalos y pulsa «Guardar campos»; un campo obligatorio vacío no deja guardar y te dice cuál falta.',
        'Foto: en «Editar», «Añadir foto» sube un retrato de la persona (se guarda en la biblioteca de medios de tu agencia); se ve en la cabecera de la ficha y en el listado. Sin foto se muestran sus iniciales. «Quitar» la elimina de la ficha. Las oficinas también tienen foto (CRM → Oficinas).',
      ],
    },
    {
      key: 'necesidades',
      group: 'CRM',
      title: 'Necesidades del comprador',
      route: '/admin/contactos',
      summary:
        'Qué busca cada persona, en estructurado: operación, tipos, presupuesto, superficie, dormitorios y baños, zonas deseadas y excluidas, radio, estado, obra nueva / 2ª mano / reformado, características, fecha deseada, financiación y urgencia — con la importancia de cada preferencia.',
      steps: [
        'Entra en un contacto y abre la pestaña "Necesidades" → "Nueva necesidad". Para cambiar una que ya existe, pulsa "Editar" en su tarjeta: se abre el mismo editor con todo lo guardado.',
        'Una misma persona puede tener varias a la vez (vivienda habitual, inversión, local): crea una por cada búsqueda real, porque los criterios son distintos.',
        'Tipos de inmueble: la misma lista que en las propiedades (piso, casa, chalet, adosado, ático, dúplex, estudio, finca, terreno, local, oficina, nave, garaje, edificio, promoción). Sin marcar ninguno, cualquier tipo vale.',
        'Junto a cada preferencia hay un desplegable Imprescindible / Preferible / Indiferente: tipo, precio, superficie, dormitorios, baños, zona (deseadas y radio), estado, obra y cada característica (terraza, garaje, ascensor, piscina, jardín, accesible, admite mascotas, aire acondicionado). Un imprescindible incumplido descarta el inmueble; un preferible sólo baja el porcentaje; un indiferente no cuenta. En una característica, "Indiferente" es no declararla — que no pida garaje no significa que lo rechace —; si la marcas, elige "La quiere" o "La quiere sin".',
        'Hay cosas que filtran siempre, se elija lo que se elija (lo recuerda el desplegable "Qué filtra siempre" al final del editor): la operación (comprar no es alquilar), el precio cuando se pasa más de un 10 % del máximo, las zonas excluidas, y el tipo de inmueble mientras sea imprescindible (lo es por defecto). El precio sólo admite imprescindible o preferible: si no le importa, déjalo en blanco.',
        'Zonas: elige el tipo (distrito o barrio, localidad, código postal, urbanización u otra) y escribe una cada vez — se guardan una a una, nunca "Chamberí, Salamanca" en un texto. Las zonas excluidas descartan siempre. "Buscar en un radio" fija un centro (busca un lugar o haz clic en el mapa) y los km; zonas y radio se suman: basta con estar en una zona deseada o dentro del radio.',
        '"Estado" (en buen estado / para reformar / cualquiera) se compara con el estado físico de la ficha del inmueble; "Obra" (obra nueva / segunda mano / reformado), con el año de construcción y con "Reformado" y "Año de reforma" de la ficha ampliada. Si la ficha no tiene el dato, la línea sale como "no consta", nunca como cumplida.',
        'Deja en blanco lo que el cliente no haya concretado. Un precio máximo vacío significa "no lo ha dicho", nunca "cero". La fecha deseada es cuándo quiere comprar o entrar a vivir; en "Financiación" anota si necesita hipoteca, en qué punto está y notas (banco, importe preaprobado…).',
        '"Validar presupuesto" es una acción con autor y fecha: márcala sólo cuando lo hayas comprobado de verdad, no porque el cliente haya mencionado una cifra. La tarjeta enseña quién lo validó y cuándo.',
        '"Buscar propiedades" en la tarjeta lista los inmuebles compatibles de los dos catálogos con su desglose y las acciones de cada uno (seleccionar, enviar propiedad, crear selección, crear visita, descartar). Marca la casilla de varios y pulsa "Crear selección con N propiedades" para guardarlos juntos; las selecciones de la persona aparecen debajo de sus necesidades, en "Selecciones", y "Abrir" lleva a la vista de cada una (ver "Selecciones de propiedades").',
        'El estado de cada necesidad (activa, pausada, cubierta, archivada) se cambia desde el propio desplegable de la tarjeta, sin abrir un formulario aparte. Pausa una búsqueda cuando el cliente te dice "de momento lo dejamos", márcala cubierta cuando ya ha comprado o alquilado, y archívala si ya no aplica — una necesidad pausada o archivada sigue viendo sus compatibilidades, simplemente deja de aparecer como una búsqueda activa.',
      ],
    },
    {
      key: 'compatibilidades',
      group: 'CRM',
      title: 'Compatibilidades (matching)',
      route: '/admin/compatibilidades',
      summary:
        'Cruza necesidades con inmuebles en las dos direcciones y te dice, criterio a criterio, por qué encaja cada uno. El porcentaje nunca viene solo: siempre lleva su explicación.',
      steps: [
        'Desde una necesidad (ficha del contacto → Necesidades → "Buscar propiedades") ves los inmuebles compatibles — de los dos catálogos a la vez: Propiedades (web, obra nueva) y Propiedades 2ª mano. Cada resultado dice de cuál de los dos viene.',
        'Desde "Compatibilidades" eliges un inmueble (el desplegable agrupa "Propiedades (web)" y "Propiedades 2ª mano" por separado) y ves qué compradores registrados encajan con él. Es el mismo cálculo, al revés, y usa exactamente el mismo motor sea cual sea el catálogo.',
        'Cada línea del desglose dice qué se comparó: ✓ cumple, △ se queda cerca (78 m² frente a 80), ✕ no cumple, ? no hay dato para saberlo.',
        'Un criterio imprescindible incumplido descarta el inmueble y se marca como tal; uno preferible sólo baja el porcentaje.',
        'Si un imprescindible no se puede comprobar, el inmueble no se descarta: sale como "revisar", porque esconderlo por una ficha incompleta haría perder operaciones.',
        'Además del tipo, la zona, el precio, la superficie, los dormitorios y baños y las características, el desglose compara el estado del inmueble con lo que busca el comprador (en buen estado / para reformar) y si es obra nueva, segunda mano o reformado. Si la ficha no tiene el dato, la línea lo dice ("no consta") en vez de suponerlo.',
        'Las acciones son las mismas en Compatibilidades, en la ficha de la propiedad (paso "Compradores compatibles") y en la ficha del contacto (Necesidades → "Buscar propiedades"): "Seleccionar" / "Quitar selección", "Enviar propiedad", "Crear selección" (nueva o añadiendo a una que ya tenga esa persona), "Crear visita" (comercial, fecha y canal; se comprueba que no tenga otra cita a esa hora y queda en Visitas y en la ficha del contacto) y "Descartar" con motivo ("Recuperar" lo deshace). Crear una selección o una visita deja el match en "Seleccionado" si estaba sin decidir. Consultar compatibilidades no guarda nada.',
        'Con un match "Seleccionado" aparece "Crear oferta": pide el importe y da de alta una oferta real en borrador (CRM → ficha del cliente → pestaña "Ofertas"), ya ligada a esa necesidad y a ese match. No se envía sola — se revisa y se envía desde ahí.',
        '"Enviar propiedad" abre (o reutiliza) la conversación de WhatsApp del contacto en Comunicaciones y le manda el inmueble con foto y ficha — con enlace público si es de Propiedades (web), sólo con foto y texto si es de 2ª mano. El match sólo pasa a "Enviado" cuando el envío se ha confirmado de verdad, nunca sólo por pulsarlo. Si el contacto no tiene teléfono ni WhatsApp, el botón está desactivado y lo dice; si la agencia no tiene ningún número de WhatsApp conectado, la ventana lo explica y ofrece abrir WhatsApp con su número — y la propiedad no queda marcada como enviada.',
        'El estado del match avanza solo cuando las cosas pasan de verdad: "Enviado" cuando el WhatsApp sale, "Visita" cuando anotas el resultado de una visita a ese inmueble (si el cliente dice que no le interesa, queda descartado con ese motivo) y "Ofertado" cuando se crea una oferta. Nunca retrocede y nunca recupera un descarte: eso lo decides tú.',
        'En un inmueble sin características repasadas, lo que no está marcado cuenta como desconocido. Pulsa "He repasado las características" para que a partir de ahí un hueco signifique de verdad "no lo tiene".',
      ],
    },
    {
      key: 'selecciones',
      group: 'CRM',
      title: 'Selecciones de propiedades',
      route: '/admin/contactos',
      summary:
        'Las propiedades que has preparado para una persona, en el orden en que quieres enseñárselas — de los dos catálogos —, con su vista propia para ordenarlas, recortarlas, ampliarlas y enviárselas de una vez por WhatsApp.',
      steps: [
        'Una selección se crea con "Crear selección" desde una compatibilidad (o marcando varias en "Buscar propiedades") o la prepara INMO. Se ven en la ficha del contacto → pestaña "Necesidades" → bloque "Selecciones"; pulsa su título o "Abrir" para entrar en su vista.',
        'La vista enseña cada propiedad con su foto, su precio, su estado (disponible, vendida, obra nueva…), de qué catálogo es (web/obra nueva o 2ª mano), su zona, dormitorios y metros, y la nota que tenga para el cliente. El nombre lleva a la ficha de la propiedad. Si una está en la papelera o ya no existe, se marca así y no se envía.',
        'Las flechas ↑/↓ cambian el orden; se guarda al momento y es el orden en que se le enviará.',
        '"Quitar" la saca de la selección (la propiedad no se toca). Una selección necesita al menos una propiedad: para quitar la última, añade antes otra.',
        '"Añadir una propiedad" busca en los dos catálogos a la vez; puedes escribir una nota para el cliente. Va al final de la lista, como mucho 30 por selección; no se puede añadir una que esté en la papelera ni repetir una que ya está. Queda en la Actividad de la persona ("Ampliada") y, si la selección viene de una necesidad, la propiedad añadida pasa a "Seleccionada" en sus compatibilidades si no había decisión (como con "Crear selección").',
        '"Enviar selección por WhatsApp" abre (o reutiliza) la conversación con la persona en Comunicaciones y le manda cada propiedad, en el orden de la selección, exactamente igual que "Enviar propiedad": con foto y enlace público si es de obra nueva, con foto y texto si es de 2ª mano, y con su nota. Cada fila de la ventana dice si salió o por qué no; si una falla, el envío se para ahí. Las compatibilidades de su necesidad sólo pasan a "Enviado" cuando el envío se confirma.',
        'Si la persona no tiene teléfono ni WhatsApp en su ficha, o tu agencia no tiene ningún número de WhatsApp conectado, la ventana lo dice y no se envía nada (sin número conectado te ofrece abrir WhatsApp con su número para mandarla tú). Nunca se da por enviada una propiedad que el proveedor no aceptó.',
      ],
    },
    {
      key: 'oficinas',
      group: 'CRM',
      title: 'Oficinas',
      route: '/admin/offices',
      summary: 'Las oficinas de tu agencia como fichas propias (nombre, código, dirección, teléfono, email y zona horaria). Lo que filtra y reparte por oficina — comerciales, propiedades, leads y citas — apunta a estas fichas, no a un texto libre.',
      steps: [
        'Pulsa "+ Nuevo" para dar de alta una oficina. El nombre es obligatorio y no se puede repetir entre las oficinas activas de tu agencia; la zona horaria se escribe en formato internacional (Europe/Madrid, Atlantic/Canary) y se comprueba al guardar.',
        'Asigna cada comercial a su oficina desde su ficha (Comerciales → campo "Oficina") y cada propiedad desde el editor (paso "Comercial / Inversión" → "Oficina").',
        '"Eliminar" manda la oficina a la Papelera (botón "Papelera" del listado), desde donde puedes restaurarla o borrarla definitivamente. Lo que la referenciaba conserva su vínculo mientras tanto.',
        'El antiguo campo de texto "Oficina" de los comerciales se conserva como "Oficina (texto anterior)" para no perder lo que ya había escrito.',
      ],
    },
    {
      key: 'equipos',
      group: 'CRM',
      title: 'Equipos',
      route: '/admin/teams',
      summary: 'Equipos comerciales (p. ej. "Lujo", "Alquiler", "Captación"), opcionalmente dentro de una oficina y con un responsable.',
      steps: [
        'Crea el equipo con "+ Nuevo", elige su oficina (si la tiene) y su responsable entre tus comerciales.',
        'Cada comercial pertenece a un equipo desde su ficha (Comerciales → "Equipo"), y cada propiedad puede asignarse a un equipo en el editor (paso "Comercial / Inversión").',
        'En la ficha del comercial, "Usuario del panel" vincula a esa persona con su cuenta de acceso: es lo que permite saber qué leads, visitas y tareas son "suyos".',
        'Igual que las oficinas, eliminar un equipo lo manda a la Papelera, desde donde se puede restaurar.',
      ],
    },
    {
      key: 'rendimiento',
      group: 'CRM',
      title: 'Rendimiento comercial',
      route: '/admin/rendimiento',
      summary: 'Dashboard comercial con datos reales: leads nuevos y sin atender, primera respuesta, cualificados, visitas, ofertas, operaciones, conversión y el embudo de la cohorte, con filtros combinables.',
      steps: [
        'Elige el periodo arriba (hoy, 7 días, 30 días, mes o trimestre actual, o fechas a medida). Todas las fechas son UTC. "Comparar con el periodo anterior" añade, en las tarjetas que lo permiten, el valor del periodo inmediatamente anterior de la misma duración — nunca se enseña un "+12 %" sin decir contra qué.',
        'Cada tarjeta dice debajo exactamente qué cuenta y de dónde sale (por ejemplo, "Leads sin atender" son las alertas de SLA abiertas ahora mismo, no los leads en estado "nuevo"). Las de la primera fila — sin atender, visitas próximas, ofertas pendientes y tareas vencidas — son "ahora mismo" y no dependen del periodo.',
        'Haz clic en una tarjeta para abrir el detalle: "Leads nuevos", "Leads cualificados" y "Leads sin atender" abren CRM → Leads ya filtrado con el mismo periodo y filtros (un botón "Filtrado desde el dashboard · quitar" lo deshace); las demás llevan a Visitas, Tareas, Compatibilidades u Operaciones.',
        'Los filtros se combinan: comercial, oficina, origen, portal, campaña e inmueble. La oficina es la de CRM → Oficinas: cuenta lo que tiene esa oficina asignada (el lead, la visita o la operación) y, si un registro no tiene oficina propia, la de su comercial. Todas las tarjetas, el embudo y la tabla usan exactamente el mismo filtro. Sólo aparecen opciones que existen de verdad en tu agencia. «Portal» sólo aparece cuando hay leads que llegaron de un portal por la API (origen «Portal inmobiliario»): la plataforma no está conectada directamente a ningún portal.',
        'El embudo parte de los leads creados en el periodo y cuenta cuántos de ESOS leads llegaron a cada etapa (respuesta humana real, cualificado, visita no cancelada, oferta, operación). "Conversión" es la misma cohorte: los que ya tienen una operación cerrada entre los creados en el periodo.',
        'No se muestran importes: el dashboard cuenta, no suma dinero.',
        'Cada comercial ve sólo lo suyo: un usuario con permisos restringidos (Sistema → Usuarios) y vinculado a su ficha de comercial (campo «Usuario del panel» en la ficha del comercial) ve únicamente sus leads, visitas, ofertas, operaciones y tareas — lo dice un aviso azul arriba y el selector de comercial desaparece; aunque pida otro comercial, el servidor le enseña los suyos. Los administradores sin restricciones y quien tenga escritura en Sistema (gerencia) ven toda la agencia y pueden filtrar por cualquiera. Un usuario restringido que no está vinculado a ninguna ficha no ve el dashboard hasta que lo vincules.',
      ],
    },
    {
      key: 'inmo',
      group: 'CRM',
      title: 'INMO (asistente)',
      route: '/admin/inmo',
      summary: 'Asistente que responde con los datos reales de tu agencia: busca propiedades con criterios estructurados, encuentra contactos y leads, calcula compatibilidades con el motor de Matching y prepara visitas, tareas, envíos y ofertas — siempre con tu usuario y tus permisos.',
      steps: [
        'Escribe como hablarías con un compañero: "Busca pisos en Chamberí con terraza por menos de 650.000 €". INMO lo convierte en criterios (zona, terraza, precio máximo) y busca en tus dos catálogos con el mismo buscador que el panel. Lo que no dices no se filtra: si no mencionas el garaje, no descarta los que no lo tienen.',
        'Puedes afinar sobre la marcha ("solo con terraza", "y con 3 habitaciones"): INMO recuerda la búsqueda anterior y la amplía.',
        'Debajo de cada respuesta aparece de dónde sale (por ejemplo "Buscar propiedades · 4 resultados"). INMO no puede mencionar una propiedad, un precio o un porcentaje que no le haya devuelto el sistema; la compatibilidad entre una necesidad y una propiedad la calcula siempre el motor de Matching.',
        'Para actuar sobre una persona, INMO la busca primero. Si hay varias con el mismo nombre te pregunta cuál es: nunca elige por ti. Lo ya resuelto (contactos, leads, propiedades, citas) se queda en la columna "En contexto", con enlace a su ficha.',
        'Enviar una propiedad por WhatsApp, agendar, mover o cancelar una visita y crear una oferta NUNCA se hacen solas: INMO te enseña exactamente qué va a hacer y espera a que pulses "Confirmar". "Cancelar" no ejecuta nada. Un doble clic no duplica la acción.',
        'Buscar no guarda nada. Sólo se crea una necesidad de compra, un lead, una tarea o una selección de propiedades si se lo pides expresamente.',
        'Puedes pedir la compatibilidad de una búsqueda que no está guardada ("¿qué encaja con un piso de 3 dormitorios en Madrid por menos de 350.000 €?"): INMO la calcula con el mismo motor de Matching que una necesidad guardada (porcentaje y desglose ✓/△/✕) sin guardar nada, y después te ofrece guardarla como necesidad de una persona — sólo la guarda si se lo pides.',
        'INMO usa tus permisos: si tu usuario no puede ver o editar algo en el panel, INMO tampoco. Todas sus consultas quedan registradas (herramienta, resultado, entidad) en la traza de la Domain Tools API, sin guardar lo que escribiste.',
        'Memoria de conversaciones: a la izquierda tienes tus conversaciones con INMO, guardadas en tu usuario y tu agencia (nadie más las ve). Pulsa una para retomarla donde la dejaste; «Nueva conversación» empieza otra y la papelera la borra del todo (es tu historial, no un registro de la agencia).',
        'Hechos que INMO recuerda: si le dices «apúntate que Laura prefiere que la llamen por la tarde», te propone guardarlo y sólo lo guarda si pulsas «Confirmar». Queda como nota en la ficha de esa persona (o lead, propiedad, cita u operación), visible y borrable desde la ficha o desde INMO: conocimiento → Memoria. En conversaciones posteriores INMO lo consulta antes de actuar sobre ella. Nunca guarda contraseñas, claves ni datos de pago.',
        'Perfil («cerebro»): el selector de arriba elige con qué perfil trabaja INMO — General, Comercial y captación, Cualificación de compradores, Seguimiento de operaciones o Redacción de comunicaciones. Cada uno tiene sus instrucciones y sólo las herramientas de su tarea; aun así, cada herramienta sigue pasando por tus permisos.',
        'Conocimiento de la agencia con fuentes: pregunta por procedimientos o políticas («¿cómo tramitamos las arras?») y INMO busca en la ayuda del panel, en la base de conocimiento de tu agencia, en las notas y en las fichas. Cada dato lleva su referencia [F1], [F2]… y debajo ves de dónde sale, con enlace. Si no encuentra ninguna fuente, lo dice en vez de inventar.',
        'Workflows guiados: en el panel «Workflows» elige uno (por ejemplo «Lead nuevo → cualificar → compatibles → proponer visita»), escoge el lead o la operación y pulsa «Empezar». INMO prepara cada paso y tú decides: «Ejecutar paso» lo hace con tus permisos y «Saltar» lo omite. Puedes dejarlo a medias y seguir después desde la lista de ejecuciones.',
        'Necesita la clave del servicio de IA (AI_API_KEY) configurada; si falta, la página lo avisa.',
      ],
    },
    {
      key: 'inmo-ajustes',
      group: 'CRM',
      title: 'INMO: conocimiento, memoria y perfiles',
      route: '/admin/inmo-ajustes',
      summary: 'Lo que INMO sabe de tu agencia: la base de conocimiento que consulta y cita, los hechos que ha guardado con tu confirmación y los ajustes de cada perfil.',
      steps: [
        'Pestaña «Base de conocimiento»: escribe un título, el texto (un procedimiento, una política, un argumentario…) y, si quieres, etiquetas separadas por comas, y pulsa «Guardar». INMO lo consulta al responder y lo cita con su título. «Archivado» lo deja guardado pero INMO deja de consultarlo; la papelera lo borra.',
        '«Probar búsqueda»: escribe una pregunta y verás exactamente qué fuentes encontraría INMO (ayuda, documentos, notas y fichas), en qué orden y con qué fragmento. Si sale vacío, INMO responderá que no tiene fuente.',
        'Pestaña «Memoria»: los hechos que alguien de tu agencia confirmó desde INMO, con la ficha a la que pertenecen. Ábrela para verlo en contexto o bórralo si ya no es cierto.',
        'Pestaña «Perfiles»: activa o desactiva cada perfil de INMO, añade indicaciones propias de tu agencia (por ejemplo «tutea siempre al cliente») y desmarca herramientas que no quieras que use. Sólo se pueden quitar herramientas, nunca añadir: un perfil no puede hacer más de lo que su diseño permite, y cada herramienta sigue exigiendo los permisos de quien lo usa. El perfil General no se puede desactivar.',
        'Cambiar los perfiles afecta a toda la agencia, así que exige permiso de escritura en Sistema; la base de conocimiento y la memoria son del área CRM.',
      ],
    },
    {
      key: 'leads',
      group: 'CRM',
      title: 'Leads',
      route: '/admin/leads',
      summary: 'Pipeline Kanban de todos los contactos interesados: nuevo → contactado → cualificando → cualificado → visita → oferta → negociación → ganado, con "perdido" como columna aparte.',
      steps: [
        'Arrastra una tarjeta a otra columna para mover el lead de fase: te pide el motivo y, al confirmarlo, se guarda y queda registrado en su historial (quién lo movió, desde qué fase, hasta cuál y por qué). Si cancelas, la tarjeta vuelve a su sitio.',
        'El nombre del lead abre su ficha: todos los datos de captación (teléfono, email, WhatsApp, idioma, origen y su detalle, portal, id externo, campaña, UTM, página de entrada, referrer y el mensaje original tal cual llegó), la fase, el comercial, la oficina y el equipo, los tiempos (entrada, primer contacto, primera respuesta humana, cualificado, primera cita, conversión, último contacto y próxima acción) y las pestañas Historial de fases, Asignaciones, Notas, Tareas, Actividad, Visitas, Ofertas y Comunicaciones. Si el lead ya tiene identificada a la persona, «Ver contacto» lleva a su ficha de contacto.',
        'Cada movimiento pide su motivo, que queda en el «Historial de fases» con fecha, usuario, fase anterior y fase nueva: en la ficha, elige la nueva fase y pulsa «Cambiar fase…»; al arrastrar una tarjeta en el Pipeline; al cambiar la fase en la Tabla; al «Reactivar» un lead perdido, y en la acción masiva «Cambiar fase». Se abre una ventana con motivos rápidos según la fase (por ejemplo «Primera llamada hecha» al pasar a Contactado): pulsa uno o escribe el tuyo; sin motivo no deja confirmar, y si la cancelas no se mueve nada. Lo que cambia sola la plataforma (automatizaciones, INMO) deja su propio motivo.',
        'Arrastrar a "Perdido" (o «Marcar como perdido» en la ficha) abre una ventana para elegir el motivo — No responde, No interesado, Duplicado u otro — y añadir un comentario; el movimiento sólo se aplica al confirmarlo y queda en el historial. Por debajo, la fase en la que estaba se congela tal cual — si luego lo recuperas («Reactivar» o arrastrándolo fuera de "Perdido"), vuelve exactamente a esa fase, no a "Nuevo": no se pierde en qué punto del proceso se cayó la operación.',
        '«+ Nuevo lead» da de alta uno a mano (una llamada, alguien que entra en la oficina, un evento): nombre, al menos un email, teléfono o WhatsApp, origen y el resto de datos de captación. Antes de crear se comprueba si ya existe un lead por email, teléfono, WhatsApp o id externo: si lo hay, te enseña cuáles y eliges «Unificar con este» (completa ese lead con lo que le falte, sin crear otro) o «Crear igualmente». Si eliges comercial se le asigna directamente; si no, decide el enrutado.',
        '«Propiedad de interés»: escribe el nombre o la zona y elige en la lista, que busca a la vez en Propiedades (web / obra nueva) y en 2ª mano y dice de cuál es cada una. Se guarda con su catálogo, así que el enrutado y los informes saben exactamente qué inmueble es aunque los dos catálogos tengan una propiedad con el mismo número. Una propiedad en la papelera no se puede elegir. En la ficha, «Propiedad de interés» enlaza a la ficha de esa propiedad (y dice si es de obra nueva o de 2ª mano); en un lead antiguo, de antes de guardarse el catálogo, sale «Catálogo deducido».',
        '«Contacto»: opcional. Busca y elige una persona que ya esté en Contactos para vincular el lead a ella; si no eliges ninguna, se enlaza la que coincida por email, teléfono o WhatsApp, o se crea una nueva. En «Editar» puedes cambiarla (por ejemplo, si el lead se enlazó a otra persona). Un contacto archivado al unificar duplicados no se puede elegir.',
        '«Editar» en la ficha cambia los datos de captación (no el mensaje original, que nunca se reescribe), la propiedad de interés y el contacto. Si el email, teléfono o id externo nuevos ya son de otro lead de tu agencia, te avisa antes de guardar. Los leads no se borran: se marcan como perdidos con su motivo (No responde, No interesado, Duplicado u otro). Así se conserva quién lo trajo, por dónde llegó y en qué fase se cayó, y cuenta en los informes de captación; uno creado por error se marca como «Duplicado» o con un comentario. La cabecera de la ficha dice quién lo creó y cuándo.',
        'El primer contacto y la primera respuesta humana se rellenan solos con lo que de verdad pasa: un WhatsApp enviado desde Comunicaciones, una llamada contestada o anotada, o pasar el lead a «Contactado» o más allá. La primera cita, al crear una cita o un tour para el lead desde el panel o al reservarla el cliente.',
        'Cada tarjeta tiene un desplegable con el comercial asignado — cámbialo ahí mismo para reasignar el lead a otra persona, o a "Sin asignar", sin salir del listado. Queda registrado quién lo tenía, a quién pasó y cuándo en su historial de asignaciones.',
        'Edición en la vista Tabla: haz clic en la «Fase» o en el «Comercial» de una fila (sale un lápiz al pasar por encima), elige el valor nuevo en el desplegable y se guarda al momento (la fase, tras escribir o elegir su motivo); Esc (o la ×) cancela sin cambiar nada. La fase pasa por el mismo sitio que arrastrar en el Pipeline, así que queda en el «Historial de fases» con quién y cuándo, y el comercial por la misma reasignación, que queda en su historial de asignaciones. Elegir «Perdido» abre la ventana del motivo, igual que en el Pipeline (si la cancelas, no cambia nada); elegir una fase para un lead perdido lo reactiva y lo lleva a esa fase. Si el servidor rechaza el cambio, el motivo se queda en rojo bajo el desplegable. Sólo se ofrece si puedes escribir en CRM.',
        'Los leads se crean solos desde el formulario público, las reservas de visita, el chat de la web y el programa de referidos — no hace falta darlos de alta a mano salvo excepción. Llegan con el idioma de quien escribe (el que eligió en la web o, si no eligió, el de su navegador) y, si vienen de la ficha de una promoción, con esa propiedad de interés. Si el email o el teléfono coincide con un contacto que ya existe en tu agencia, el lead se enlaza automáticamente a esa ficha en vez de crear una persona duplicada. Si tienes reglas de enrutado configuradas (CRM → Enrutamiento y SLA), el comercial se asigna solo al crearse — salvo que ya llegue con uno explícito, como una reserva de cita con un comercial concreto.',
        '"Próxima acción" (debajo de la tarjeta y en la columna del mismo nombre de la vista Tabla) dice qué toca y cuándo — p. ej. «Tarea · Llamada · mañana» o «Cita · Visita a inmueble · en 3 d» — y sale en rojo si ya pasó. Es la tarea abierta o la cita futura más próxima de ese lead: nunca algo que se escriba a mano, se recalcula sola. En la ficha del lead aparece en «Tiempos (SLA)» con su tipo. El botón "+ Tarea" de cada tarjeta crea una tarea ligada a ese lead, visible también en CRM → Tareas.',
        'En la vista Tabla, marca la casilla de una o varias filas (o la de la cabecera, para marcarlas todas) para actuar sobre varios leads a la vez: cambiar el comercial, cambiar la fase, añadir una etiqueta, o crear una tarea idéntica para cada uno. Aparece un botón "Aplicar" que pide confirmación con el número exacto de leads afectados (en «Cambiar fase», la confirmación es la ventana del motivo, que queda en el historial de cada uno) y muestra el progreso mientras corre; si algo falla en una fila concreta (por ejemplo, una fase inválida), el resto de la selección sigue procesándose igual. "Exportar seleccionados" descarga un CSV sólo con esos leads.',
        'El número de cada lead es su Lead Score (0-100): una puntuación por reglas fijas de tu agencia sobre señales reales — presupuesto validado, compra prevista pronto, si ha respondido en las últimas horas, si tiene una visita pedida, si su financiación está validada y cuántas fichas enviadas ha abierto de verdad (lectura confirmada de WhatsApp, o su enlace personal abierto cuando se le envió por email o por el chat de la web). Haz clic en el número para ver "¿Por qué?": qué criterios suman, cuáles no y con qué dato, más su historial. Los filtros "Puntuación ≥" y "Mayor puntuación primero" ordenan y filtran por él.',
        'La vista Tabla va por páginas de 100, con «← Anterior» / «Siguiente →» y el total de leads del filtro debajo. El Pipeline enseña los 200 más recientes del filtro y avisa si hay más. «Exportar CSV (N)» descarga TODOS los leads del filtro actual, sin límite de filas, con una columna de etiquetas. Al marcar todas las filas de la página aparece «Seleccionar los N que cumplen el filtro» para aplicar una acción masiva (o exportar) a todos ellos, hasta 2.000 por acción.',
        'Etiquetas: se ven en las tarjetas del Pipeline y en la Tabla, y el desplegable «Todas las etiquetas» filtra por una. En la ficha del lead, bajo el nombre, «+ Etiqueta» añade una (nueva o existente) y la × la quita; son las mismas que pone la acción masiva «Añadir etiqueta».',
        'Campos personalizados: en la ficha del lead, pestaña «Datos», el panel «Campos personalizados» enseña los campos que tu agencia haya creado para leads (CRM → Campos personalizados). Rellénalos y pulsa «Guardar campos».',
        'Un número con asterisco (*) es una puntuación del sistema anterior, que sumaba puntos fijos cada vez que alguien volvía a escribir y no se puede explicar. Pulsa "Recalcular con las señales actuales" en su detalle, o selecciónalos en la vista Tabla y usa la acción "Recalcular puntuación". El Lead Score no es la compatibilidad con un inmueble (eso es Compatibilidades/Matching), no reparte leads y no sustituye al SLA.',
      ],
    },
    {
      key: 'enrutamiento',
      group: 'CRM',
      title: 'Enrutamiento y SLA',
      route: '/admin/enrutamiento',
      summary: 'A qué comercial va cada lead nuevo, y si se está atendiendo a tiempo: reglas de reparto automático y alertas cuando un lead lleva demasiado tiempo sin moverse.',
      steps: [
        'Las reglas de reparto se gestionan en "Gestionar reglas de enrutado" (enlace en la cabecera de esta página): cada regla tiene una prioridad (se evalúan de menor a mayor, gana la primera que encaje) y un ámbito — propiedad (el comercial responsable de la propiedad de interés del lead, en su catálogo: 2ª mano u obra nueva), zona, oficina, idioma, tipo de propiedad, obra nueva, equipo, o un reparto general/por departamento sin condición, típicamente la última como red de seguridad.',
        'Al crear o editar una regla, el valor a comparar cambia con el ámbito y se elige de una lista: «Oficina» → las oficinas de tu agencia («Cualquier oficina» aplica a todos los leads); «Equipo» → tus equipos (CRM → Equipos), y el reparto se hace entre sus comerciales; «Idioma» → la lista de idiomas; «Tipo de inmueble» → los tipos de la ficha; «Zona» → escribe el distrito o la localidad. «Comercial fijo» y «Repartir dentro de la oficina» también son desplegables.',
        '«Idioma» compara con el idioma del lead, que se rellena en el alta manual, en INMO y en la captación: los formularios de la web pública (contacto, captación, reserva de visita, verificación de visitante, referidos y chat) envían el idioma que la persona eligió en la web o, si no eligió ninguno, el de su navegador, y la API pública acepta «language». WhatsApp no informa del idioma, así que esos leads llegan sin él (puedes ponerlo en «Editar»).',
        'Una regla puede apuntar a un comercial concreto, o a un grupo repartido por Round Robin (por turnos, siempre el siguiente de la lista) o por Carga de trabajo (al que menos leads activos tiene ahora mismo). El grupo son los comerciales activos del departamento indicado, de la oficina de «Repartir dentro de la oficina» y/o del equipo de la regla.',
        '«Sólo en un horario» limita cuándo aplica una regla: marca los días (L a D), la franja «Desde»–«Hasta» y la zona horaria, o usa un atajo («Laborables 9:00-18:00», «Fines de semana», «Noches 22:00-06:00»); debajo se resume en palabras. Fuera de ese horario se prueba la siguiente regla — así puedes mandar lo que entra de noche o en fin de semana a un equipo de guardia. Admite franjas que cruzan la medianoche (22:00 a 06:00). Cada regla tiene una franja: para dos franjas distintas, crea dos reglas.',
        'El reparto ocurre solo, en cuanto se crea un lead nuevo sin comercial ya asignado (por ejemplo, uno que llega con una cita reservada con un comercial concreto no se reasigna). Si ninguna regla aplica, o el grupo de destino no tiene nadie disponible, el lead se queda sin asignar en vez de bloquear su creación — queda en la cola, recuperable a mano.',
        'Desde la ficha de un lead (CRM → Leads) puedes reasignarlo manualmente a otro comercial en cualquier momento; queda constancia de quién lo tenía, a quién pasó y por qué en su historial de asignaciones.',
        'En esta página fijas los tres umbrales de SLA de tu agencia (nunca una regla universal): minutos hasta que un lead nuevo se considera "sin atender", horas sin próxima acción prevista tras cualificarlo, y días sin contacto antes de darlo por inactivo. Se recalculan cada hora.',
        '"Alertas abiertas" lista los leads que están incumpliendo alguno de esos tres umbrales ahora mismo (el nombre abre la ficha del lead). Se resuelven solas en cuanto el lead deja de cumplir la condición (alguien le escribe o le llama, avanza de fase, hay una próxima acción), o puedes marcarlas resueltas a mano si ya la has revisado y no hace falta actuar. «Sin contacto» cuenta también los contactos que salen de la agencia, no sólo los que entran.',
        '"Lead Score" fija las reglas de puntuación de tu agencia: activa o desactiva cada criterio, cambia sus puntos y su ventana (días para "compra prevista", horas para "respondió", mínimo de fichas abiertas, estados de hipoteca que cuentan como financiación validada). Hay una penalización opcional, desactivada por defecto, para leads que no responden en N días. Cada criterio dice de dónde sale su dato — nunca se deduce de una conversación ni se inventan aperturas.',
        'Guardar las reglas no cambia ninguna puntuación por sí solo: pulsa "Recalcular todos los leads" para aplicarlas (se hace por partes, con progreso). A partir de ahí cada lead se recalcula solo cuando cambia una de sus señales, y las que caducan (como "respondió en las últimas 24 h") se revisan cada hora.',
      ],
    },
    {
      key: 'campos-personalizados',
      group: 'CRM',
      title: 'Campos personalizados',
      route: '/admin/campos-personalizados',
      summary:
        'Los datos propios de tu agencia que no vienen en las fichas («Cliente VIP», «Fecha de entrega de llaves», «Tipo de inversor»…), para propiedades (los dos catálogos), contactos, leads, citas y operaciones.',
      steps: [
        'Elige arriba a qué se aplica (Propiedades, Contactos, Leads, Citas u Operaciones) y pulsa «+ Nuevo campo». Escribe la etiqueta (lo que se lee en la ficha) y el tipo: texto corto, texto largo, número, sí/no, fecha, lista (una opción) o lista (varias opciones). En una lista, escribe una opción por línea.',
        '«Sección de la ficha» agrupa los campos bajo un título en la ficha (si no pones ninguna, salen bajo «Campos personalizados»); «Ayuda» es el texto que sale debajo del campo. Con ▲▼ cambias el orden en que salen.',
        '«Obligatorio»: la ficha no deja guardar sus campos personalizados mientras ése esté vacío. «Visible en la web pública» (sólo en Propiedades): el valor sale en la ficha pública de Propiedades (web), en «Más información»; los demás campos nunca salen de la agencia.',
        'La «Clave interna» se genera sola a partir de la etiqueta y no cambia nunca (los valores guardados dependen de ella); la etiqueta, la sección, la ayuda, las opciones y el orden sí se pueden editar. El tipo sólo se puede cambiar mientras ningún registro tenga valor en ese campo: si ya hay valores, archívalo y crea otro.',
        '«Archivar» oculta el campo de las fichas sin perder sus valores («Activar» lo devuelve). «Eliminar» lo manda a la Papelera (botón «Papelera»), desde donde se restaura o se elimina definitivamente — esto último borra también todos sus valores.',
        'Los valores se rellenan en cada ficha: debajo del editor de la propiedad, en la pestaña «Ficha y duplicados» del contacto, en la pestaña «Datos» del lead, en la ficha de la cita y en la de la operación. Cada valor se comprueba por su tipo al guardar (un número tiene que ser un número, una fecha una fecha real, una lista una de sus opciones).',
        'En el listado de propiedades, Filtros → «Campo personalizado» busca por ellos.',
      ],
    },
    {
      key: 'clientes',
      group: 'CRM',
      title: 'Clientes',
      route: '/admin/clientes',
      summary: 'Cartera de clientes con ficha individual: datos, propiedades relacionadas y todo su histórico en una sola pantalla.',
      steps: [
        'El listado busca por nombre, email, teléfono o ubicación a la vez, y filtra por tipo, estado y comercial responsable. Cada fila muestra el contacto, el estado, quién lo lleva y su actividad real (visitas, operaciones y cuándo fue lo último).',
        'Pulsa el nombre de un cliente — o "Ver perfil" en el menú "···" — para abrir su ficha completa. No es una ventana emergente: es una página propia, con su URL, que puedes compartir con tu equipo.',
        'La ficha se organiza en pestañas. "Resumen" es su tablero: visitas, operaciones cerradas, volumen, propiedades relacionadas y actividad reciente. "Información" reúne todos los datos guardados. "Propiedades" muestra las viviendas vinculadas. "Actividad" es la cronología completa.',
        'La pestaña "Actividad" combina visitas, operaciones, reservas, contratos, leads y auditoría con los hitos del lead asociado al cliente: asignación o reasignación de comercial, cualificación, necesidad de compra/alquiler dada de alta y decisión sobre un match (seleccionado o descartado, con el motivo si lo hay). Cada hito aparece una sola vez, en el momento en que ocurrió de verdad.',
        'La pestaña "Tareas" muestra el trabajo pendiente sobre esa persona — llamadas, seguimientos, lo que haga falta — y deja crear una nueva con "+ Nueva tarea". "Completar" la cierra; queda también en CRM → Tareas, la vista de todas las tareas de la agencia. Sólo existe si la ficha tiene un Contact moderno vinculado.',
        'La pestaña "Ofertas" muestra las propuestas económicas donde esta persona es compradora o vendedora, con el importe actual y su estado (Borrador, Enviada, Contraoferta, Aceptada, Rechazada, Retirada, Vencida). "+ Nueva oferta" busca el inmueble (de los dos catálogos) y la crea en borrador; desde ahí se Envía, se registra una Contraoferta con un importe nuevo, se Acepta o se Rechaza. Ningún importe anterior se pierde nunca — el histórico completo de la negociación queda guardado, no sólo el último número.',
        'Cuando una oferta llega a "Aceptada", aparece el botón "Crear operación" — nunca ocurre solo. Abre la ficha de la Operación (etapas desde "Oferta aceptada" hasta "Cerrada", pasando por reserva, arras, financiación, documentación, notaría y firma), con su propio timeline, tareas y citas, y abajo las comunicaciones con el comprador (WhatsApp, llamadas y emails enviados) — las de notaría/firma son citas reales, así que salen también en CRM → Visitas. La pestaña "Operaciones" de este cliente lista las suyas, como comprador o como vendedor. No confundir con "Operaciones" (Finanzas & Growth → Operaciones): esa es el registro plano de comisiones ya cerradas; ésta es el seguimiento de la operación mientras está en marcha. Al cerrarla aquí, se crea automáticamente su fila en "Operaciones" (con comisión en 0, a rellenar), así que también cuenta en Ingresos sin tener que darla de alta dos veces.',
        'Las propiedades relacionadas se leen del catálogo **en vivo**: si cambias el precio o la foto en Propiedades (web) o en Propiedades 2ª mano, la ficha del cliente lo refleja al instante, porque aquí no se guarda ninguna copia. Cada tarjeta indica por qué está relacionada (visita, operación, reserva o interés) y te lleva a la ficha original de la propiedad.',
        'El histórico de un cliente (sus visitas, operaciones, reservas y contratos) se cruza por su email, o por su nombre exacto si no tiene email. Rellenar el email hace ese cruce mucho más fiable: es lo que une a esa persona con todo lo demás.',
        '"Editar cliente" abre el mismo editor que usas para dar uno de alta, con validación y aviso de cambios sin guardar. "Nuevo cliente" está en el listado.',
        'Eliminar un cliente está en el menú "···", nunca como botón principal. Antes de confirmar te dice exactamente qué se conserva: sus visitas, operaciones, contratos y facturas NO se borran, porque son registros de la inmobiliaria, y tampoco se toca ninguna propiedad del catálogo. Si lo que quieres es archivar a alguien, cámbialo a "Inactivo" en vez de borrarlo.',
        'Para borrar los datos personales de una persona de todas las tablas (no sólo de su ficha) usa Sistema → RGPD, que los anonimiza sin destruir el histórico de operaciones.',
      ],
    },
    {
      key: 'comunicaciones',
      group: 'CRM',
      title: 'Comunicaciones',
      route: '/admin/comunicaciones',
      summary: 'Bandeja de la agencia dentro del panel: WhatsApp, los formularios de la web y el chat de la web en una sola lista (y, con el email entrante activo, las respuestas por email a sus hilos). Recibir y responder, compartir propiedades, vincular cada conversación a su contacto, lead y propiedad, anotar llamadas y programar seguimientos.',
      steps: [
        'Para WhatsApp hace falta un número conectado (Configuración → Comunicaciones, área Sistema): Meta WhatsApp Cloud API (la API oficial de Meta: mensajes, plantillas, medios y llamadas de voz donde Meta las permite) o Twilio (mensajes, medios y plantillas). Sin número, los botones "WhatsApp" de Clientes y Leads abren la app de WhatsApp con el enlace oficial wa.me; no se finge ninguna bandeja de WhatsApp — pero la bandeja sigue recibiendo los formularios y el chat de la web.',
        'Cada envío de un formulario de la web (contacto, formulario de captación del Constructor Web, solicitud de visita, verificación de visitante y referidos) aparece como hilo «Formulario web», con su lead, su contacto y la propiedad cuando la hay; los envíos de la misma persona se juntan en el mismo hilo. El filtro «Todos los canales» de la lista separa WhatsApp, Formulario web y Chat web.',
        'Un hilo web se responde por un canal real, que el redactor enseña arriba («Responder por»): «Chat web» si la persona escribió por el chat y su sesión sigue abierta, «Email» si dejó un email y el email de la plataforma está conectado, y «Continuar por WhatsApp» si dejó teléfono y la agencia tiene número (abre su hilo de WhatsApp real, donde aplica la regla de las 24 h). Si no hay ningún canal, lo dice y sólo deja una nota interna: nunca se finge un envío. Una respuesta por email lleva su estado real (en cola, enviado, entregado, rebotado).',
        'Email entrante: si la plataforma lo tiene activo (Configuración → Comunicaciones → «Email entrante» dice «Activo»), cuando el cliente contesta a un email que le enviaste desde un hilo, su respuesta aparece en ESE hilo como mensaje «Email» sin leer, sin la cita de tu mensaje, con el asunto y el remitente; el hilo se reabre si estaba cerrado, cuenta como último contacto del lead y como «respondió» en su Lead Score, y queda en su Actividad. Los adjuntos no se guardan: el mensaje dice cuáles traía (y si alguno es un ejecutable) para que se los pidas por otro canal. Las respuestas automáticas («fuera de la oficina») no entran. Si no está activo, el redactor te avisa de que la respuesta llegará al buzón «Responder a» de la agencia, no al hilo.',
        'El chat de la web se activa en Configuración → Comunicaciones («Activar el chat en la web pública»), con un saludo opcional: aparece un botón «Chatea con nosotros» en todas las páginas de la web de la agencia. El visitante deja su nombre (y, si quiere, email o teléfono: entonces se crea su lead) y escribe; la conversación llega aquí como «Chat web», respondes desde el redactor y el visitante ve la respuesta en la web en unos segundos. Las notas internas nunca le llegan. No usa cookies: la sesión es un código en su navegador que caduca a los 30 días sin escribir.',
        'Al compartir una propiedad de Propiedades (web) por email o por el chat con una persona conocida (con lead o contacto), el enlace es personal: cuando lo abre en su navegador queda en su Actividad («Abrió su enlace personal») y cuenta en su Lead Score como ficha abierta. Las propiedades de 2ª mano no tienen página pública, así que van sin enlace.',
        'La bandeja tiene tres columnas: la lista de conversaciones (abiertas, pendientes, cerradas; buscador por nombre, teléfono o texto; filtro por comercial), el hilo, y la ficha del contacto. El contador del menú son los mensajes sin leer; abrir un hilo los pone a cero (y, con Meta, marca "leído" en el WhatsApp del cliente).',
        'Además del comercial, la lista se filtra por «Sólo no leídas», por propiedad («Filtrar por propiedad» busca en Propiedades web y 2ª mano y deja las conversaciones donde esa propiedad es el contexto o donde se envió alguna vez; la × del distintivo quita el filtro) y, si la agencia tiene más de un número conectado, por número.',
        'Escribe en el hilo y pulsa Enter para enviar (Mayús+Enter salta de línea). El clip adjunta una imagen o un PDF; la casita busca en los dos catálogos a la vez (Propiedades web y 2ª mano, cada resultado con su distintivo) y comparte el inmueble elegido — con foto y enlace público si es de Propiedades (web), sólo con foto y ficha de texto si es de 2ª mano, que no tiene página pública; el lápiz cambia a "nota interna" (amarilla), que se guarda en el hilo y nunca se envía al contacto. Un envío de propiedad real queda también en la Actividad del cliente o lead vinculado.',
        'Regla de WhatsApp, no nuestra: sólo se puede escribir texto libre durante las 24 h siguientes al último mensaje del cliente. Pasado ese tiempo (o si el cliente nunca os escribió), el redactor lo dice y sólo permite enviar una plantilla aprobada — el icono de plantilla abre la lista, pide los valores ({{1}}, {{2}}…) y muestra la vista previa. Las plantillas se registran en Configuración → Comunicaciones (a mano, o "Sincronizar desde Meta").',
        'Los mensajes enviados llevan su estado real: ✓ aceptado por el proveedor, ✓✓ entregado, ✓✓ azul leído, ⚠ no entregado con el motivo que devolvió el proveedor. Nada se marca como enviado si el proveedor lo rechazó.',
        'Un mensaje ⚠ no entregado tiene «Reintentar»: se vuelve a enviar como un mensaje nuevo y el fallido se queda en el hilo tal cual, para que el historial no mienta. Si era una propiedad, se manda con su precio y su foto de ahora, no con los del primer intento. Las reglas de WhatsApp siguen aplicando: pasadas 24 h desde el último mensaje del cliente, un texto ya no se puede reintentar (sólo una plantilla).',
        'Un número que no está en ningún cliente ni lead aparece como "Contacto desconocido". Desde la ficha del contacto se vincula a uno existente (buscador) o se crea un lead nuevo con origen "whatsapp". En Ajustes puedes hacer que los desconocidos se conviertan en lead automáticamente. En los dos casos el lead entra igual que uno del formulario de la web: con su Contacto (si ese teléfono o email ya es de alguien, se enlaza a esa persona en vez de duplicarla), reparto automático según tus reglas, entrada en la Actividad y aviso al equipo. Al abrir una conversación desde la ficha de un cliente o de un lead no se crea ningún lead nuevo: esa ficha ya es la persona.',
        'La ficha del contacto también fija el estado de la conversación (abierta, pendiente, cerrada), el comercial asignado, la propiedad de contexto y el consentimiento: un mensaje del cliente lo pone en "acepta mensajes"; si escribe STOP o BAJA queda dado de baja y no se le envía nada (ni plantillas) hasta que vuelva a escribir o alguien lo cambie a mano.',
        '"Programar seguimiento" crea una cita real en la agenda del comercial (llamada, videollamada o visita), la misma que ves en CRM → Visitas, con la comprobación de huecos ocupados. Si el contacto está vinculado a un lead, la cita queda ligada a ese lead y pasa a ser su "próxima acción" en el tablero de Leads.',
        'Con la conversación vinculada a un lead o cliente, la ficha muestra un bloque «Contexto»: la próxima acción del lead (en rojo si ya venció), sus necesidades de compra/alquiler activas y sus próximas citas. No se copia nada a la conversación: se lee en vivo cada vez que abres el hilo.',
        'Llamadas: con un número de Meta con las llamadas activas, "Llamar por WhatsApp" llama desde el navegador (pide el micrófono); el contacto tiene que haber dado permiso antes ("Pedir permiso" en su ficha; Meta limita las peticiones a 1 al día y 2 por semana). La llamada sigue en un widget abajo a la derecha aunque cambies de página, se puede minimizar, y al colgar se anota el resultado. Las entrantes aparecen como aviso para contestar o rechazar. No se graba ni se transcribe nada: el audio va directo entre tu navegador y WhatsApp.',
        'Si el número no admite llamadas (Twilio, o Meta sin la función activa), "Llamar" marca con el teléfono y abre "Registrar llamada" para anotar dirección, resultado, duración y notas; también cuenta como actividad de la ficha.',
        'Cada hilo guarda el contacto de la persona en cuanto se conoce (al abrirlo o al vincularlo), con enlace a su ficha. Todo queda en la actividad 360º: la pestaña "Comunicaciones" de la ficha del Contacto lista sus conversaciones de WhatsApp, sus hilos de formularios y chat de la web, sus llamadas y los emails que la plataforma le ha enviado (los enviados; lo que responde a un email de un hilo web entra en ese hilo si el email entrante está activo, y no hay buzón de email general); la del cliente, conversaciones, llamadas y emails; y la cronología muestra "WhatsApp recibido/enviado", "Propiedad enviada" y "Llamada realizada/recibida" con enlace al hilo. Lo mismo aparece en la ficha del Contacto (por todos sus leads y clientes) y en la de cada operación (las del comprador); la ficha de una propiedad lista las conversaciones donde es el contexto o donde se envió. Igual que el resto de la Actividad, "Propiedad enviada" y "Llamada realizada" sólo se registran ante un envío o una llamada contestada de verdad — nunca por abrir el redactor o marcar un número sin que conteste nadie.',
        'Desde la ficha de una propiedad, "Compartir por WhatsApp" elige el cliente o lead y envía la ficha con foto — con enlace, si es de Propiedades (web) — o sólo con foto y texto, si es de 2ª mano; sin número conectado ofrece el enlace listo para pegar.',
      ],
    },
    {
      key: 'visitas',
      group: 'CRM',
      title: 'Visitas',
      route: '/admin/visitas',
      summary: 'La agenda de citas — visitas, llamadas, videollamadas, reuniones, tasaciones, captaciones, firmas, notarías y open house — en Lista, Calendario (Día/Semana/Mes/Agenda) y Tours, con el resultado estructurado de cada visita.',
      steps: [
        '"+ Nueva cita" (o un clic en un hueco vacío del Calendario) abre el formulario completo. Tipo, comercial, inicio y fin (los botones 30/45/60/90/120 min rellenan el fin; vacío = la franja del comercial), zona horaria, contacto o lead (con elegirlo basta: el nombre, el email y el teléfono salen de su ficha), oficina (vacía = la del comercial), inmueble de obra nueva o de 2ª mano, punto de encuentro, notas y notas internas (éstas sólo las ve el equipo: no salen en avisos ni en el calendario del comercial).',
        'Las visitas, llamadas y videollamadas necesitan un email o un teléfono para avisar al cliente; una reunión, una tasación, una captación, una firma o un open house pueden ir sin él. Una videollamada siempre es por vídeo y lleva su enlace de Jitsi Meet.',
        'Pulsa el nombre del cliente (o "Ver" en un tour, o una cita del Calendario) para abrir la ficha de la cita: todos sus datos, quién la creó y cuándo («Creado por…»; sin nombre si la reservó el propio cliente), la confirmación, el estado de los recordatorios, el motivo si está cancelada, el resultado de la visita y las ofertas. Desde ahí: Confirmar, Completada, No asistió, Cancelar, Anotar resultado, "Editar" y "Eliminar".',
        'Notas del equipo: la ficha de la cita tiene su panel «Notas del equipo» para dejar varias notas internas con autor y fecha (se pueden fijar, editar y eliminar). Son distintas del campo «Notas internas» de la cita y nunca se envían al cliente.',
        'Eliminar una cita creada por error ("Eliminar" en su fila de la Lista o en su ficha) la manda a la papelera tras confirmarlo: sale de la Lista, el Calendario, el iCal, los recordatorios, los huecos libres de la reserva, el dashboard y la próxima acción del lead, y su hueco queda libre para crear la buena a la misma hora. No avisa al cliente. No se puede eliminar (el aviso dice por qué) una parada de un tour (se quita desde el tour), una cita ya realizada o en la que el cliente no vino, una con el resultado anotado, una que el cliente ya conoce —la confirmó desde su enlace o le llegó un aviso por email o WhatsApp— ni una cuyo comprador tenga ofertas sobre ese inmueble: en esos casos, cancélala.',
        'Para recuperarla, pulsa «Papelera» al final de los filtros de la Lista: verás las citas eliminadas, quién las creó, el estado que tenían y cuándo se eliminaron. «Restaurar» la devuelve como estaba: una agendada vuelve a agendada (si su comercial ya tiene otra cita a esa hora, te lo dice y se queda en la papelera) y una cancelada sigue cancelada con su motivo. Eliminar y restaurar quedan en la Actividad de la cita, su contacto, su lead y su inmueble.',
        '"Editar" cambia cualquier campo de una cita ya creada: el inmueble (de cualquiera de los dos catálogos), el lead, el contacto, el comercial, la oficina, el inicio y el fin, la zona horaria, el tipo, las notas… Mover la hora o el comercial vuelve a comprobar que no tenga otra cita a esa hora y avisa al cliente; si el lead ya tiene a su persona identificada, el contacto tiene que ser esa persona.',
        'Cancelar pide siempre un motivo (hay atajos con los más habituales). La cita no se borra: queda "Cancelada" con su motivo, que se ve en la Lista y en la ficha, y se avisa al cliente. Si la cancela el propio cliente desde su enlace, el motivo lo dice.',
        'Confirmación: "Confirmada por el cliente" la da él desde su enlace de gestión; "Confirmar" en la ficha anota "Confirmada por la agencia" (lo confirmasteis por teléfono o WhatsApp). Reprogramar la cita devuelve las dos a "Sin confirmar", porque ya no es la cita que se confirmó, y reinicia los recordatorios (24 h y 1 h antes).',
        'La pestaña "Calendario" tiene cuatro vistas — Día, Semana, Mes y Agenda (pensada para el móvil) — y filtros por Comercial, Oficina, Tipo, Estado, Propiedad (busca a la vez en obra nueva y 2ª mano) y Cliente (el contacto de la cita o el de su lead). Arrastrar una cita a otro día u hora la reprograma de verdad; "-15 min"/"+15 min" en su ficha cambian la duración.',
        'Calendarios externos: Google Calendar y Outlook todavía no se pueden conectar (el Calendario lo indica como "No conectado · próximamente"). Lo que sí funciona es la suscripción iCal de cada comercial (Comerciales → su ficha → Horario → "Exportar calendario": copia la URL y añádela en Google Calendar u Outlook con "Añadir por URL"): sus citas aparecen en Google Calendar u Outlook con la hora correcta de su zona horaria (la de la cita, la de su oficina o la de la agencia).',
        'Cuando una visita está "Completada", "Anotar resultado" recoge cómo quedó (interesado, se lo piensa, no le convenció), el interés de 1 a 5, qué le gustó y qué no (por separado), la percepción del precio (barato, ajustado, caro), la ubicación, el estado y la distribución de 1 a 5, y si quiere segunda visita, si quiere ofertar o si descarta el inmueble. Es tu impresión de esa visita: no cambia la ficha del inmueble ni las Necesidades del cliente. Se puede corregir volviendo a abrirlo.',
        'Desde el mismo resultado: "Crear tarea de seguimiento" da de alta una tarea real; "Agendar ya la segunda visita" crea la cita con el mismo inmueble, cliente y comercial (comprobando su agenda); y "Crear oferta" crea una oferta real en borrador con importe, condiciones, financiación y vencimiento, que se ve en la Lista, en los Tours y en la ficha de la cita, y se envía desde la ficha del cliente → "Ofertas". Si la visita no tenía contacto, el formulario te pide elegir al comprador y queda vinculado. "Descarta este inmueble" deja ese inmueble como descartado en sus compatibilidades.',
        'La pestaña "Tours" agrupa varias visitas del mismo cliente en una salida. "+ Nuevo tour" pide el cliente (o su contacto o lead), las notas y una fila por parada: inmueble de obra nueva o de 2ª mano, comercial, hora y duración propia de cada parada (por ejemplo 10:00 durante 45 min y 10:45 durante 1 h). Las flechas ↑/↓ cambian el orden y "Recalcular horas" encadena la ruta: cada parada empieza al acabar la anterior más el desplazamiento que elijas. No se estiman trayectos: el desplazamiento lo decides tú.',
        '"Editar / reordenar" en un tour ya creado cambia el cliente, el lead, el contacto y las notas (se aplican a todas sus paradas) y el orden de la ruta, recalculando las horas si lo marcas. Cada parada movida se comprueba contra la agenda de su comercial y se avisa al cliente. Si el tour ya empezó (alguna parada completada), las horas se mueven parada a parada con "Editar".',
        '"+ Parada" en la cabecera de un tour ya creado añade otra visita a la ruta: elige el inmueble (obra nueva o 2ª mano, con el mismo buscador que al crear el tour), el comercial, la duración y cuándo — "Al final de la ruta" (empieza al acabar la última parada activa más el desplazamiento que elijas; la ventana te dice a qué hora quedará) o "A una hora concreta". La parada nueva es una cita real del mismo cliente, lead y contacto que el resto del tour; se comprueba que el inmueble sea de tu agencia y no esté en la papelera, que no pise otra parada del tour ni otra cita del comercial, queda en la Actividad y se avisa al cliente. Va al final de la ruta: si tiene que ir antes, usa "Editar / reordenar".',
        '"Quitar" en una parada agendada la saca de la ruta: pide un motivo y su cita queda "Cancelada" con ese motivo (no se borra: sigue en el tour, tachada, para que se vea qué pasó), se avisa al cliente y el resto de la ruta no se mueve. Una parada ya hecha no se quita, y la única parada activa de un tour tampoco — un tour no se queda vacío; si esa visita ya no se hace, ábrela con "Ver" y cancélala.',
        'La ficha de la cita tiene también el panel «Campos personalizados» con los campos que tu agencia haya creado para citas (CRM → Campos personalizados): rellénalos ahí y pulsa «Guardar campos».',
        'Cada cita avisa al cliente por email y, si tiene teléfono, por WhatsApp (confirmación, recordatorios 24 h y 1 h antes, cancelación y cambios); la ficha dice si los recordatorios están pendientes o enviados. El WhatsApp sale de verdad cuando la plataforma tiene conectado Twilio — Sistema → Estado del sistema lo dice; si no, el aviso queda registrado como "no conectado". El teléfono necesita prefijo internacional (+34…).',
      ],
    },
    {
      key: 'tareas',
      group: 'CRM',
      title: 'Tareas',
      route: '/admin/tareas',
      summary: 'Trabajo pendiente de toda la agencia: llamadas, WhatsApp, documentos, seguimientos… — distinto de las citas (tiempo reservado) y de la Actividad (lo que ya ocurrió).',
      steps: [
        'El primer filtro elige qué ver: Pendientes (abiertas y en curso, la vista por defecto), Abiertas, En curso, Vencidas, Vencen hoy, Completadas, Canceladas, Todas o Papelera; los demás filtran por comercial, oficina, tipo y prioridad. Organizan la vista, no la restringen: cualquiera con acceso a CRM ve las tareas de toda la agencia, igual que en Calendario.',
        'Oficina: cada tarea tiene una. Por defecto es «la de su responsable» (la opción vacía del formulario te dice cuál es, y si cambias de responsable la tarea le sigue); elige otra si la tarea es de otra oficina. Sólo se ofrecen las oficinas de tu agencia. El filtro «Todas las oficinas» y el KPI «Tareas vencidas» del dashboard comercial usan la misma regla: la oficina de la tarea o, si no tiene, la de su responsable. La columna Comercial enseña la oficina debajo («· de su responsable» si es la heredada), y cada tarea dice quién la creó y cuándo.',
        '"+ Nueva tarea" pide tipo, título, responsable, fecha y hora, prioridad, estado (Abierta o En curso), oficina y, si quieres, con qué está relacionada: un contacto, un lead, una propiedad, una cita y/o una operación. Cada uno se busca escribiendo; sólo aparecen los de tu agencia y nunca una propiedad de la Papelera.',
        '"Editar" abre la misma ventana con todos los campos — también puedes cambiar o quitar («Quitar») cualquiera de sus relaciones. El desplegable de la columna Estado cambia el estado al momento: Abierta, En curso, Completada o Cancelada; "Empezar" la pasa a En curso y "Completar" la cierra.',
        'La columna "Relacionada con" enseña los nombres reales (contacto, lead, inmueble, cita, operación) con un enlace a cada ficha. Una tarea vencida (pendiente y con la fecha ya pasada) se marca en rojo.',
        '"Borrar" pide confirmación y manda la tarea a la papelera: desaparece de todos los listados, de la ficha de su operación y de la próxima acción de su lead, pero lo que ya ocurrió (que se creó, que se completó) se conserva en la Actividad, y queda anotado «Tarea enviada a la papelera» con quién lo hizo.',
        'Para recuperarla, pulsa «Papelera» (arriba a la derecha, o elige «Papelera» en el primer filtro): verás las tareas borradas con la fecha en que se borraron, filtrables por comercial, tipo y prioridad. «Restaurar» la devuelve tal cual estaba —mismo estado, fecha, responsable y relaciones—, vuelve a contar para la próxima acción de su lead y queda «Tarea restaurada de la papelera» en la Actividad. «← Volver a las tareas» sale de la papelera.',
        'Completar o cancelar queda registrado en la Actividad del contacto, lead o propiedad relacionados. La "próxima acción" de un lead es siempre su tarea pendiente con fecha (o su cita futura) más próxima: se recalcula sola cada vez que creas, editas, completas, cancelas o borras una tarea, o mueves una cita.',
      ],
    },
    {
      key: 'ofertas',
      group: 'CRM',
      title: 'Ofertas',
      route: '/admin/ofertas',
      summary: 'Todas las ofertas de la agencia en un listado, con la negociación completa de cada una: oferta, contraoferta, nueva oferta, aceptada o rechazada — sin perder nunca un importe anterior.',
      steps: [
        'Filtra por estado (Abiertas reúne borrador, enviada y contraoferta), por catálogo (obra nueva o 2ª mano), por comercial, por inmueble, por comprador o por vendedor. Cada fila enseña el inmueble, comprador, vendedor(es), importe actual, financiación, vencimiento (en rojo si ya venció) y estado; si de la oferta ya nació una operación, un enlace lleva a ella.',
        '"+ Nueva oferta" pide inmueble, comprador, vendedor(es) —puedes añadir varios—, comercial, importe, condiciones, financiación (al contado, sujeta a hipoteca, hipoteca preaprobada o aprobada, u otra) y fecha de vencimiento. Se crea en borrador: pulsa la oferta y "Enviar oferta" cuando el comprador la confirme.',
        'Al pulsar una oferta se abre su detalle con las acciones que tocan según su estado. Enviada: "Contraoferta del vendedor", "El vendedor acepta" o "El vendedor rechaza". Con contraoferta: "Nueva oferta del comprador", otra contraoferta, aceptarla o rechazarla. Contraoferta y nueva oferta llevan los mismos términos que la oferta: importe, condiciones, financiación y vencimiento.',
        'El "Historial de la negociación" lista cada movimiento con sus términos completos, quién lo hizo y cuándo. Es inmutable: una contraoferta nunca sobrescribe la oferta anterior, se añade debajo.',
        'Si mientras miras una oferta otra persona registra un movimiento, "Aceptar" no acepta lo que ya no está vigente: avisa y recarga el detalle para que veas los términos actuales.',
        'Una oferta aceptada tiene el botón "Crear operación", que abre su seguimiento en CRM → Operaciones. Las ofertas también se ven y se crean desde la ficha de la propiedad (panel «Ofertas»), desde la ficha del cliente y desde Compatibilidades o el resultado de una visita.',
      ],
    },
    {
      key: 'deal-operations',
      group: 'CRM',
      title: 'Operaciones',
      route: '/admin/deal-operations',
      summary: 'El seguimiento de cada operación desde la oferta aceptada hasta la firma, en un Kanban por etapas: oferta aceptada, reserva, arras, financiación, documentación, notaría, firma y cerrada.',
      steps: [
        'Cada columna del Kanban es una etapa. Arrastra una tarjeta a otra columna (o usa su desplegable «Mover a…») para cambiar de etapa: queda en el historial de la operación con quién la movió y cuándo. Soltarla en «Cerrada» pide confirmación y cierra la operación de verdad.',
        'Los filtros muestran las operaciones activas (por defecto), cerradas, canceladas o todas, por oficina, por comercial y por catálogo. «Lista» enseña lo mismo en tabla.',
        'Una operación nace siempre de una oferta aceptada ("Crear operación" en el detalle de la oferta). En su ficha: la etapa (con un motivo opcional que queda en el historial), el historial de etapas, la oferta aceptada con toda su negociación, las partes, y la oficina y el comercial, que se pueden cambiar ahí mismo (sólo oficinas de tu agencia).',
        '«Reserva, arras y contratos» vincula a la operación lo que ya existe en Reservas, Depósitos y Contratos: elige uno del desplegable y pulsa "Vincular"; "Desvincular" lo suelta sin borrarlo. Sólo se ofrecen los de tu agencia que aún no pertenecen a otra operación. Arras y contratos son de Finanzas: sin permiso de Finanzas no se ven ni se vinculan.',
        'La ficha tiene también sus tareas (créalas con "+ Nueva tarea": la operación, el comprador y el inmueble vienen ya puestos), sus citas de notaría o firma (aparecen en el Calendario) y la «Actividad»: todo lo ocurrido en la operación, en su oferta, en sus tareas y en sus citas.',
        'En la columna derecha de la ficha, «Campos personalizados» recoge los campos que tu agencia haya creado para operaciones (CRM → Campos personalizados), con «Guardar campos».',
        'Bajo el número de la operación se ve quién la abrió y cuándo («Creado por…»; «usuario eliminado» si ese usuario ya no existe). El panel «Notas» guarda las notas internas del equipo sobre la operación (con autor y fecha; se pueden fijar, editar y eliminar), que nunca se envían al cliente.',
        'Cerrar crea solo su apunte en Finanzas → «Cierres y comisiones» (con la comisión a 0 para que pongas el % real) y, en 2ª mano en venta, marca el inmueble como vendido. Cancelar pide un motivo y no borra nada.',
        'Mandar a la papelera: «Mandar a la papelera» en la ficha, o «Papelera» en su fila de la vista «Lista». Pide confirmación; la operación sale del Kanban y de la lista y su ficha deja de abrirse, pero no se borra nada (historial, tareas, citas y actividad se conservan). No se puede con una operación cerrada (ya tiene su apunte en «Cierres y comisiones») ni con una que tenga reserva, arras o contrato vinculados: el aviso dice cuáles, desvincúlalos antes en «Reserva, arras y contratos».',
        'Para recuperarla, pulsa «Papelera» arriba a la derecha: lista las operaciones borradas (comprador, inmueble, etapa, estado, importe y fecha de borrado) con «Restaurar», que la devuelve tal cual estaba —misma etapa y estado—. Mientras está en la papelera, su oferta aceptada no admite «Crear operación» otra vez: el detalle de la oferta enseña «Operación #… en la papelera →», que lleva aquí.',
      ],
    },
    {
      key: 'citas-analytics',
      group: 'CRM',
      title: 'Analítica de citas',
      route: '/admin/citas-analytics',
      summary: 'No-shows, ocupación por comercial y conversión de cita a venta.',
      steps: ['Revisa la ocupación por comercial para detectar quién tiene hueco para más visitas.'],
    },
    {
      key: 'reservas',
      group: 'CRM',
      title: 'Reservas',
      route: '/admin/reservas',
      summary: 'Reservas de unidades sobre plano hechas por clientes desde la web pública.',
      steps: ['Una reserva se vincula a su operación desde la ficha de la operación (CRM → Operaciones → «Reserva, arras y contratos»). En esta lista aparece entonces «Operación #…» bajo la referencia, con el enlace.'],
    },
    {
      key: 'referidos',
      group: 'CRM',
      title: 'Referidos',
      route: '/admin/referidos',
      summary: 'Programa de recomendación: cada cliente o comercial recibe un enlace propio para recomendar la inmobiliaria.',
      steps: [
        'Pulsa "Nuevo enlace", indica quién recomienda y qué recompensa recibirá (efectivo, descuento o comisión).',
        'Copia el enlace generado (botón "Copiar") y compártelo con esa persona.',
        'Cuando alguien rellena el formulario del enlace, se crea automáticamente un lead real en el CRM con origen "referido".',
        'Marca el referido como "convertido" cuando cierre operación, y "recompensado" cuando le pagues/apliques la recompensa.',
      ],
    },
    // --- Portal Web ------------------------------------------------------------
    {
      key: 'developer-properties',
      group: 'Portal Web',
      title: 'Propiedades (web)',
      route: '/admin/developer-properties',
      summary: 'Catálogo principal de propiedades sobre plano/promociones que se muestran en la web pública.',
      steps: [
        'El listado busca por nombre, referencia (interna, externa o de agencia, el código comercial o el número de Ref. #), dirección, urbanización, ciudad, distrito o código postal a la vez — usa la "×" del buscador para limpiarlo. El botón "Filtros" abre un panel con precio, ubicación, tipo, venta/alquiler, dormitorios/baños, superficie, exclusividad, publicación y rango de fecha de captación/actualización, combinables entre sí; cada filtro activo aparece como una "chip" que puedes quitar individualmente, o usar "Limpiar filtros" para quitarlos todos.',
        'Toda búsqueda, filtro, orden y página quedan en la URL: recargar la página, volver atrás o compartir el enlace con otro comercial reproduce exactamente el mismo listado filtrado, no vuelve a la vista sin filtrar.',
        '"Vistas guardadas" guarda la combinación de filtros actual con un nombre, para no tener que rehacerla cada vez. "+ Guardar filtro actual" guarda sólo los filtros; "+ Guardar vista actual" guarda además qué columnas se ven en la vista de lista. Cada una puede quedar "Privada" (sólo tú la ves) o "Compartida" (toda tu organización la ve en su propio menú) — compartirla no cede su propiedad: sólo quien la creó puede editarla o borrarla, aunque cualquiera pueda aplicarla. Aplicar la de otra persona vuelve a pedir los datos con tus propios permisos, nunca enseña algo que tú no pudieras ver ya.',
        '"Columnas" (sólo en la vista de lista) deja apagar o encender Ubicación/Precio/Detalles/Estado/Comercial/Actualizado de la tabla — Propiedad y Acciones siempre se ven. Guardar una vista guarda también qué columnas tenías elegidas en ese momento.',
        '"Exportar CSV (N)" descarga todas las propiedades del filtro que tengas puesto en ese momento, sin límite de filas — las mismas columnas (más el estado comercial) y el mismo permiso que ya tiene el listado, nunca más datos de los que ya podrías ver paginando.',
        'En la vista de lista, la casilla de cada fila (y la de la cabecera, para toda la página) activa las acciones masivas: "Cambiar comercial", "Cambiar estado de la obra", "Cambiar estado comercial", "Añadir etiqueta", "Actualizar precio", "Publicar", "Retirar" y "Crear catálogo" sobre todas las seleccionadas a la vez. Si seleccionas todas las de la página y hay más resultados con el mismo filtro, aparece "Seleccionar las N que cumplen el filtro" para aplicarlo a todas ellas sin tener que ir página por página. Cambiar de filtro o de búsqueda vacía la selección — no arrastra una selección de un criterio distinto.',
        'Antes de aplicar, se pide confirmación indicando cuántas propiedades afecta — la acción no se puede deshacer. Mientras se aplica se ve el progreso (X/N); si alguna propiedad falla (por ejemplo, un estado que no existe en ese catálogo, o le faltan campos obligatorios para publicar) el resto se sigue aplicando igual, y al terminar se dice cuántas salieron bien y cuántas mal, nunca sólo "Error". Cada cambio de estado, precio o comercial, y cada publicación, usa exactamente la misma validación que hacerlo a mano uno por uno — "Publicar" exige los mismos campos obligatorios (nombre, operación, precio, ciudad, portada…) que el botón "Publicar" de una ficha individual, y rechaza las que no los tengan sin bloquear las demás de la selección. "Retirar" limpia la publicación sin borrar la ficha — nunca elimina una propiedad. "Actualizar precio" siempre añade una fila al histórico de precios de cada propiedad, igual que editar el precio a mano.',
        '"Actualizar precio" y publicar/retirar son idempotentes: aplicar "Publicar" sobre una que ya está publicada, o "Retirar" sobre una ya retirada, no da error ni repite nada — sólo confirma que ya está en ese estado.',
        '"Crear catálogo" pide elegir una plantilla y crea un catálogo PDF combinado en Asset Export Studio con las propiedades seleccionadas (hasta 30 a la vez, y sólo con selección manual/de página — no vale "todos los filtrados"); al terminar te lleva directamente a esa ficha del catálogo. Es el mismo Asset Export Studio de "Marketing → Exportar activos", no un mecanismo aparte. También existe en "Propiedades 2ª mano".',
        'En la web pública, los filtros ofrecen sólo los tipos que tienes publicados, con su nombre en el idioma del visitante (en castellano, los del catálogo: Piso, Chalet, Ático…); además de municipio y barrio, se puede filtrar por código postal, y en el mapa, «Buscar cerca de aquí» busca en un radio alrededor del centro del mapa o de la ubicación del visitante. Los precios salen en la moneda de tu agencia y el visitante puede verlos convertidos a otra.',
        'El botón "Exportar seleccionadas" descarga en CSV sólo las filas marcadas (o, si usaste "Seleccionar las N que cumplen el filtro", las que cumplen ese filtro) — es el mismo "Exportar CSV" de arriba, aplicado a tu selección en vez de a todo el listado.',
        'Al abrir una propiedad ya creada, el panel "Histórico de precios" (debajo del editor) lista cada cambio real de precio con su fecha, el más reciente primero — tanto los hechos a mano en la ficha como los de "Actualizar precio" en bloque. Es de sólo lectura: un intento de guardar que el servidor rechaza (por ejemplo, publicar sin los campos obligatorios) no deja ninguna fila.',
        'Ordena por más recientes/antiguas, precio (mayor o menor) o nombre (A-Z/Z-A). El botón de vista cambia entre cuadrícula (tarjetas con imagen, precio, ubicación y estado) y lista; la preferencia se recuerda en este navegador.',
        'Cada tarjeta tiene un menú "..." con Publicar/Despublicar, Duplicar (crea una copia editable con "(copia)" en el nombre) y Eliminar (la manda a la Papelera, ver más abajo), además de los enlaces Editar y Vista previa. Una propiedad de la Papelera no se puede duplicar: primero hay que restaurarla.',
        'Publicar comprueba que estén rellenos los campos que necesita una ficha pública (nombre, operación, precio, ciudad, coordenadas, portada…) — si falta alguno, "Publicar" se rechaza con un aviso de qué falta en vez de publicar una ficha incompleta. Guardar como borrador (sin publicar) no exige nada de esto: puedes guardar en cualquier momento aunque falten datos.',
        'Al crear o editar una propiedad se abre el Property Editor: un editor por pasos (Información básica, Ubicación, Precio, Características, Descripción, Multimedia, Galería, Planos, Tipos de unidad, Redes sociales, Comercial/Inversión) en vez de un formulario largo. La pantalla tiene tres columnas: a la izquierda el progreso y la lista de pasos, en el centro el paso que estás rellenando (con "PASO n DE N" sobre el título) y a la derecha una vista previa de la ficha. Dentro de un paso con muchos campos, estos se agrupan bajo subtítulos (p. ej. "Identificación"/"Clasificación", "Dimensiones"/"Equipamiento"), y los grupos de casillas —el equipamiento, por ejemplo— se pulsan como etiquetas en vez de marcarse una a una.',
        'Navega entre pasos pulsando en la columna de la izquierda o con "← Anterior"/"Siguiente →" al final de cada uno; en el último paso el botón pasa a ser "Finalizar ✓", que guarda. En pantallas pequeñas la columna de pasos se convierte en una tira horizontal encima del formulario y las columnas laterales desaparecen para dejarle todo el ancho a los campos.',
        'Cada paso de la columna muestra su estado real: un check verde cuando sus campos obligatorios/recomendados están completos, y un número en rojo cuando faltan campos obligatorios (te dice cuántos). El porcentaje y la barra de progreso se calculan igual, sobre campos reales — no sobre pasos simplemente visitados.',
        'La vista previa de la derecha enseña lo que hay escrito **en ese momento**: cambia el precio o la imagen de portada y se actualiza al instante. No es una consulta aparte ni una copia guardada; si aún no hay imagen, lo dice en vez de enseñar un hueco roto.',
        'La cabecera muestra el estado real de la propiedad. Al crear, pulsa "Crear propiedad" para guardar la primera vez — a partir de ahí, en modo edición, el editor guarda solo cada cambio (con un pequeño retraso tras dejar de escribir, igual que el Constructor Web); "Guardar cambios" sigue ahí para confirmar al momento en vez de esperar. Si el último guardado falla, el editor lo dice en vez de fingir que se guardó, y no pierde lo escrito.',
        'Los desplegables enseñan el texto en castellano ("Obra nueva", "En construcción", "Lista", "Venta", "Alquiler"…), no el valor interno que guarda la base de datos.',
        'Si tu cuenta solo tiene permiso de lectura sobre el Portal Web, la ficha se abre igual pero en modo consulta: un aviso lo indica, los campos aparecen deshabilitados y no hay botón de guardar. Puedes recorrer todos los pasos y leerlo todo.',
        'La sección "Ubicación" tiene los campos de dirección (país, ciudad, calle y número, urbanización, bloque, portal, piso, letra, código postal, distrito) junto a un mapa interactivo: pulsa "Buscar dirección en el mapa" para situar el marcador automáticamente a partir de esos campos, y luego arrástralo o haz clic para ajustar la posición exacta a mano — la posición del marcador es siempre la que se guarda, aunque la búsqueda automática no encuentre nada.',
        'El "Plan de pagos" (sección Precio) se edita como una lista visual de fases (concepto, porcentaje/importe, descripción) que puedes añadir, editar, arrastrar para reordenar o eliminar — ya no se edita como JSON.',
        'El vídeo (sección Multimedia) admite una URL externa (YouTube, Vimeo o enlace directo) o subir un archivo propio (mp4/webm, hasta 100 MB) con barra de progreso; solo una de las dos fuentes está activa a la vez — al guardar una sustituye a la otra.',
        'La "Galería" admite varias imágenes: arrastra una miniatura para reordenarla (el nuevo orden se guarda solo) y usa "Usar como portada" para marcar cuál se muestra como imagen principal. "Planos" y "Tipos de unidad" se gestionan como una cuadrícula de tarjetas visuales (miniatura de imagen cuando la hay, o un icono si todavía no tiene una) — pulsa "+ Añadir" o "Editar" sobre una tarjeta para abrir su formulario en una ventana emergente, con "Eliminar" también disponible dentro.',
        'Los campos de descripción larga (Descripción, Descripción del master plan, de los planos y del mapa de ubicación) tienen un editor de texto enriquecido: negrita, cursiva, listas y enlaces, con el resultado publicado tal cual en la ficha pública — no hace falta escribir HTML a mano.',
        '"Redes sociales" usa "+ Añadir red social": elige la plataforma (Instagram, Facebook, LinkedIn, TikTok, YouTube, X/Twitter, Pinterest, WhatsApp, Telegram…) y luego su URL; arrastra para reordenar o pulsa el icono de papelera para quitarla.',
        'La sección "Comercial/Inversión" incluye el selector "Comercial asignado" — busca en tu equipo de Comerciales y muestra su foto/iniciales, nombre y cargo; "Sin asignar" la deja sin comercial. Marca "Exclusiva" para que aparezca destacada en la web; "Reservada" se pone con el "Estado comercial" (Información básica) — la casilla antigua sólo aparece en las fichas que la tenían marcada. El tipo de mandato y las fechas de inicio/vencimiento de la exclusividad, si las hay, se guardan en los campos "Tipo de mandato" y "Exclusividad — inicio/vencimiento" de ese mismo grupo — son datos internos, nunca se publican.',
        'El "Estado de la obra" (obra nueva / en construcción / lista) se refleja en la ficha pública automáticamente. Es la fase de la construcción: si se puede vender o no lo dice el "Estado comercial".',
        '"Información básica" incluye un grupo "Identificación": la "Referencia interna" (formato W-XXXXXX) se genera sola si la dejas vacía, y también puedes anotar la referencia de agencia y, si la propiedad viene de un portal o sistema externo, su origen y referencia externa. El grupo "Captación" guarda cuándo y por qué vía llegó la propiedad (fecha y origen de captación) — información interna de gestión, nunca aparece en la ficha pública.',
        'En "Ubicación", el desplegable "Privacidad de la ubicación" controla qué ve el público: "Exacta" publica coordenadas y dirección tal cual; "Aproximada" redondea el mapa a la zona y oculta número/portal/bloque/planta/letra; "Ocultar número" muestra el mapa exacto pero sin esos datos de portal. El "Radio de privacidad" es solo una referencia visual del área aproximada y no se publica.',
        'En "Características", además de dormitorios y baños hay aseos, salones, cocinas y plazas de garaje (con el mismo control +/−), y un grupo "Superficies" con útil, parcela, terraza, jardín, balcón y trastero — todas opcionales, en m². El grupo "Estado" recoge el estado físico (a estrenar, excelente, buen estado, a renovar, a reformar) y si está amueblada. La casilla "Características repasadas" (al final de Equipamiento) marca que alguien ha revisado de verdad el equipamiento de la ficha — sin marcarla, un "No" en ascensor/piscina/etc. se interpreta como "todavía sin repasar", no como una respuesta negativa confirmada; esto lo usa el motor de compatibilidad de leads.',
        'El paso "Estancias personalizadas" (junto a Características) permite añadir dormitorios, despachos u otras estancias con su propio tipo, nombre, superficie, planta, orientación y notas — pulsa "+ Añadir estancia" y rellena sus campos; cada uno se guarda solo al salir del campo, sin esperar a "Guardar cambios". Arrastra una estancia para reordenarla, o pulsa "Eliminar" para quitarla (pide confirmación).',
        ...PROPERTY_SHEET_HELP_STEPS,
        ...PROPERTY_TRASH_HELP_STEPS,
        ...PROPERTY_OWNERS_HELP_STEPS,
        ...PROPERTY_BUYER_MATCHES_HELP_STEPS,
        ...PROPERTY_CRM_HELP_STEPS,
        ...PROPERTY_N7A_HELP_STEPS,
        ...PROPERTY_SEARCH_N7B_HELP_STEPS,
        ...PROPERTY_INLINE_EDIT_HELP_STEPS,
        ...PROPERTY_D1P_HELP_STEPS,
      ],
    },
    {
      key: 'site-builder',
      group: 'Portal Web',
      title: 'Constructor Web',
      route: '/admin/site-builder',
      summary: 'Editor visual de la página de inicio de tu web pública — pulsa cualquier texto, botón o imagen del lienzo y edítalo ahí mismo; añade, ordena y reordena secciones sin tocar código.',
      steps: [
        'El lienzo es la página real y se edita directamente: pasa el ratón por un título, un párrafo, un botón, una imagen o una tarjeta y verás su contorno; púlsalo y queda seleccionado, con una pequeña barra encima (qué es, "Editar" o "Cambiar imagen", y "↑ Sección" para subir a la sección entera). El panel de la derecha cambia según lo que hayas pulsado: "Propiedades del texto", "de la imagen", "del botón", "de la tarjeta" o "de la sección". No necesitas saber cómo está construida una sección para cambiar su título o su foto.',
        'Para cambiar un texto, haz doble clic sobre él (o pulsa Enter con el texto seleccionado) y escribe directamente en la página; Enter confirma, Escape lo deja como estaba. El campo del panel de la derecha se actualiza a la vez, y al revés: si escribes en el panel, el lienzo cambia al instante. Nada de esto necesita guardar ni recargar.',
        'En la pestaña "Diseño" de un elemento cambias su fuente (las de tu Brand Kit salen primero), tamaño, peso, cursiva, mayúsculas, interlineado, color (colores de marca primero, luego la paleta, luego uno personalizado), alineación, márgenes y —en botones y tarjetas— fondo, borde, radio y relleno. Cada cambio se ve en el lienzo en tiempo real. Un punto azul junto a un control indica que ese elemento tiene un valor propio; "Restablecer" lo devuelve al estilo global de la página.',
        'Con Tablet o Móvil elegidos arriba, cualquier ajuste de diseño se aplica sólo a ese tamaño (el panel lo avisa: "Editando la vista Móvil"); lo que no definas ahí se hereda de Escritorio. Así puedes tener un título a 64 px en escritorio y a 32 px en móvil sin duplicar nada.',
        'Para cambiar una imagen, púlsala y usa "Cambiar imagen" (o doble clic): subes una nueva o eliges de la Biblioteca de medios sin salir del lienzo. En las imágenes también ajustas encaje (rellenar/encajar), punto focal, radio y opacidad.',
        'Los botones se editan como cualquier texto (doble clic) y su destino en "Contenido" → "Enlace": página de tu web (con las rutas sugeridas), URL externa, ancla de otra sección, teléfono o email. Mientras editas, pulsar un botón o un enlace nunca navega: lo selecciona. Para probar los enlaces de verdad, usa "Vista previa".',
        'Los datos reales no se editan desde aquí: si pulsas el nombre, el precio o la foto de una propiedad en una tarjeta (o un comercial, una comunidad, un artículo), el panel dice "Contenido dinámico — procede de Propiedades (web)" y te lleva a su ficha para cambiar el dato. Lo que sí puedes cambiar es cómo se ve (fuente, color, tamaño…), y ese estilo se aplica a todas las tarjetas del bloque. Cambiar el nombre real en Propiedades (web) se refleja en la web manteniendo el estilo que configuraste.',
        'Pulsa en el hueco de una tarjeta (no sobre su texto) para seleccionar la tarjeta entera; pulsa en el fondo de una sección para seleccionar la sección; usa la miga de pan del panel ("Sección › Elemento") o "↑ Sección" para subir de nivel, y Escape para bajar la selección paso a paso (sale de la edición, luego del elemento, luego de la sección).',
        'La cabecera y el pie de página también se ven en el lienzo, pero son elementos globales de toda la web (no sólo de Inicio): al pulsarlos, el panel explica de dónde salen (logo y nombre en Sistema → Empresas; datos legales en Privacidad) en vez de dejarte crear una copia distinta sólo para la portada.',
        '"Estilos globales" (icono "Aa" de la barra superior) fija la tipografía de los títulos, la del texto y el radio de los botones de toda la página; cada elemento hereda de ahí salvo que le des un estilo propio. Se guarda y publica con la página.',
        'Atajos: Enter edita el texto seleccionado; Esc sube de nivel; Supr elimina la sección seleccionada (pide confirmación); Ctrl/Cmd+D la duplica; Ctrl/Cmd+Z y Ctrl/Cmd+Mayús+Z deshacen y rehacen cualquier cambio (texto, color, fuente, imagen, espaciado, estilos globales y estructura), agrupados por ráfaga de cambios y no por tecla.',
        'La lista "Estructura" (izquierda) muestra una tarjeta por sección con su número, nombre y un resumen real (p. ej. "4 propiedades · Fila") — así puedes distinguir de un vistazo varias secciones del mismo tipo. Debajo, "Páginas" lista las páginas reales de tu web; hoy solo "Inicio" es editable aquí.',
        'Para añadir una sección, pasa el ratón entre dos secciones (en la lista de Estructura o directamente sobre el lienzo) y pulsa "+ Añadir sección aquí" — se abre la biblioteca y la sección elegida se inserta exactamente en esa posición, se selecciona sola y su panel de opciones se abre listo para editar. El botón "+" de la cabecera de Estructura, o "+ Añadir sección" al final de la lista, añaden al final.',
        'La biblioteca de secciones tiene buscador, categorías, una miniatura real de cada sección (no solo un icono) y guarda tus favoritos y usados recientemente — pulsa el corazón para marcar una sección como favorita.',
        'Selecciona un bloque haciendo clic en él, en el lienzo o en la lista "Estructura" — el panel de la derecha ("Propiedades del bloque") muestra sus opciones propias en tres pestañas: "Contenido" (textos, imágenes, qué datos mostrar), "Diseño" (variantes visuales, columnas responsive) y "Avanzado" (ancla, fondo, espaciado, en qué dispositivos se muestra). Cambiar de bloque siempre vuelve a la pestaña "Contenido".',
        'Con un bloque seleccionado, el lienzo muestra una pequeña barra flotante sobre él (subir, bajar, añadir debajo, duplicar, ocultar, eliminar) para no tener que volver a la lista de Estructura para esas acciones.',
        'Mientras editas, el lienzo nunca ejecuta el comportamiento real de un bloque: un clic sobre una tarjeta de propiedad, un botón o un enlace lo selecciona (verás su contorno azul y, al pasar el ratón, su nombre) en vez de abrir esa propiedad o seguir ese enlace. Para probar los enlaces y botones tal y como funcionarán de verdad, usa el icono de "Vista previa" (el ojo) de la barra superior — mientras está activo el lienzo se comporta exactamente como el sitio publicado; vuelve a pulsarlo para seguir editando.',
        'El lienzo se ajusta solo al espacio disponible (evita el scroll horizontal) manteniendo el tamaño real del dispositivo elegido — usa los controles "− % +" para hacer zoom manual, o "Ajustar" para volver al ajuste automático. Contrae los paneles "Estructura" o "Propiedades del bloque" (flecha en su cabecera) si necesitas más espacio para el lienzo — el ajuste se recalcula solo y no pierdes ni la selección ni el scroll.',
        'La sección "Comerciales" de la biblioteca añade a la portada a tu propio equipo, en dos diseños: "Tarjetas" (retratos grandes con nombre y puesto, como en la página de Equipo) y "Compacto" (una fila de retratos redondos, útil como prueba de confianza junto a un formulario). Cada tarjeta enlaza a la ficha pública del comercial.',
        'Ese bloque solo muestra a quien tenga activado "Mostrar este comercial en la web" en su ficha (Comerciales → Perfil y presentación), y respeta el orden que fijes ahí. Puedes elegir "Todos" con un número máximo, o seleccionar comerciales concretos a mano; en los dos casos los datos se leen en vivo, así que cambiar una foto o un puesto se ve en la web sin volver a publicar. En "Diseño" decides si además de la foto y el nombre se ven el puesto, las especialidades y el teléfono/email.',
        'La sección "Captación" añade los dos bloques que convierten visitas en clientes. El "Formulario de captación" crea un lead real en CRM → Leads (origen "web"), guarda el mensaje en Bandeja → Mensajes y, si tienes destinatarios configurados, avisa por email; en su inspector eliges los textos, si pides teléfono y una "Referencia interna" que viaja con cada envío para saber de qué formulario vino cada lead.',
        'La "Reserva de visita" abre la misma agenda que la ficha pública del comercial: ofrece solo sus huecos libres, respeta sus días bloqueados y su tope diario, y la cita aparece en CRM → Visitas. Elige con qué comercial (o deja "el primero de la lista") y si la cita es presencial, videollamada o llamada. Si el comercial elegido deja de estar publicado, el bloque te avisa en el editor y la web sigue funcionando con el primero disponible.',
        'Esos dos bloques están desactivados mientras editas y también en Vista previa, a propósito: probar tu propia portada no debe llenarte el CRM de leads inventados ni la agenda de citas falsas. Funcionan en cuanto publicas.',
        'El fondo de la portada (sección Hero) se elige en su pestaña «Contenido» › «Multimedia» › «Fondo»: «Bucle de imágenes» va alternando las imágenes que subas, una cada 7 segundos, con un fundido y un zoom lento (con una sola imagen, el fondo queda fijo); «Imagen fija» deja una sola imagen quieta, la que elijas en «Imagen de fondo» o, si no eliges ninguna, la primera del bucle. Las imágenes del bucle no se borran al cambiar a «Imagen fija», así que puedes volver a él cuando quieras.',
        'Los bloques de Propiedades, Comunidades y Blog siempre muestran tus datos reales y actuales — en su pestaña "Contenido" puedes elegir un criterio automático (más recientes, destacadas, por comunidad o tipo…) o seleccionar propiedades/comunidades concretas a mano; en ambos casos se siguen leyendo en vivo, nunca se copian. Con "Tipo de propiedad" eliges entre todos los tipos del catálogo (Piso, Casa, Chalet, Ático, Local, Garaje…), con cuántas propiedades tienes de cada uno entre paréntesis; puedes elegir uno que aún no tenga ninguna y la sección se llenará sola cuando la añadas.',
        'El bloque "Mapa (teaser)" enseña un mapa real (no una ilustración) con las propiedades que elijas, con el mismo criterio automático o selección manual que Propiedades — las coordenadas siempre son las reales de cada propiedad, así que una propiedad sin ubicación guardada en su ficha nunca aparece ahí. Mientras editas, el mapa se ve pero no se puede arrastrar ni hacer zoom con la rueda (un clic sobre él selecciona el bloque, igual que el resto del lienzo); en Vista previa y en la web publicada funciona con normalidad.',
        'Si un bloque muestra una imagen, gestiónala desde su pestaña "Contenido": subir, sustituir, elegir desde la Biblioteca de medios o eliminar — sin salir del editor. Los cambios se ven al instante en el lienzo, sin necesidad de guardar primero.',
        'Cambia entre Escritorio/Tablet/Móvil arriba para comprobar cómo se ve en cada tamaño real.',
        'Los cambios se autoguardan como borrador (verás "Guardando…"/"Guardado" junto al título, arriba a la izquierda). El sitio público no cambia hasta que pulses "Publicar cambios" — mientras haya cambios sin publicar, el botón lo indica con un punto de aviso.',
        'Deshacer/Rehacer (las flechas junto al selector de zoom, o Ctrl/Cmd+Z y Ctrl/Cmd+Mayús+Z) solo cubren la sesión actual del editor.',
        'Cada vez que publicas se guarda una copia de la página. El icono del reloj ("Historial de versiones publicadas", en la barra superior) las lista de la más reciente a la más antigua, con la fecha, quién publicó, cuántas secciones tenía y cuál es la que está ahora mismo en la web. Pulsa "Restaurar" en cualquiera de ellas para recuperarla.',
        'Restaurar una versión NO la publica: la copia sobre tu borrador para que la revises primero, y la web pública sigue mostrando lo mismo que antes hasta que pulses "Publicar cambios". Ojo: al restaurar, el borrador actual se sustituye — si tenías cambios sin publicar los pierdes, aunque puedes recuperarlos con Deshacer (Ctrl/Cmd+Z) sin salir del editor.',
        'El icono "Abrir sitio publicado" de la barra superior lleva al dominio propio de tu organización. Si todavía no tienes uno, abre una vista previa de tu web en el dominio de la plataforma que sólo ve quien tiene sesión en tu empresa (con una franja arriba para salir); nadie más la ve ni la indexan los buscadores. Lo mismo hace "Vista previa del sitio" al pie del menú lateral.',
      ],
    },
    {
      key: 'properties',
      group: 'Portal Web',
      title: 'Propiedades 2ª mano',
      route: '/admin/properties',
      summary: 'Catálogo separado para propiedades de segunda mano/reventa (no promociones de obra nueva).',
      steps: [
        'El listado busca por referencia (interna, externa, de agencia o código comercial), calle, dirección, ciudad, distrito o código postal a la vez, con filtros de precio, venta/alquiler, tipo, ubicación, dormitorios/baños, superficie, exclusividad, publicación y rango de fecha de captación/actualización — igual que en "Propiedades (web)" (mismo filtro compartido, sólo cambia la tabla que consulta). Cada filtro activo aparece como una "chip" que puedes quitar, y el botón de vista alterna entre cuadrícula y lista (se recuerda en este navegador). Como en "Propiedades (web)", todo el filtro queda en la URL: se puede recargar, volver atrás o compartir el enlace sin perderlo.',
        '"Vistas guardadas", "Columnas" y "Exportar CSV" funcionan exactamente igual que en "Propiedades (web)" — mismo componente, filtros y vistas guardadas propios de este catálogo (una vista guardada aquí no aparece en Propiedades (web), ni al revés).',
        'Las acciones masivas (selección de fila en la vista de lista, "Cambiar comercial"/"Cambiar estado"/"Añadir etiqueta"/"Actualizar precio"/"Publicar"/"Retirar"/"Exportar seleccionadas") funcionan igual que en "Propiedades (web)" — aquí "Cambiar disponibilidad" ofrece "Disponible"/"Vendida" (en Propiedades (web) es "Cambiar estado de la obra"), y "Cambiar estado comercial" es igual en los dos. "Publicar" marca la propiedad como publicada (lo que filtra "Publicadas" en el listado y lo que usan la publicación multicanal y los portales) y exige los campos obligatorios para publicar de su tipo — ciudad, país, operación, precio y superficie en vivienda; "Retirar" lo deshace sin borrar nada. "Crear catálogo" sigue siendo sólo de obra nueva.',
        '"Crear catálogo" también funciona aquí: selecciona hasta 30 propiedades, elige una plantilla PDF y se genera un catálogo combinado (portada, índice y una sección por propiedad) con el mismo motor de Asset Export Studio. Cada sección lleva la foto principal, un título («Piso en Chamberí»), precio, m², dormitorios, baños, zona y la referencia (el número de ficha). Sólo sale lo publicable: la foto es la portada salvo que esté marcada en la galería como no publicable, privada u oculta (entonces, la primera foto publicable); la zona nunca lleva la dirección exacta, y con la ubicación aproximada u «ocultar número» tampoco la calle. Como la 2ª mano no tiene página pública, el catálogo no lleva QR ni enlace.',
        'El panel "Histórico de precios" de la ficha funciona igual que en Propiedades (web): cada cambio real de precio — editado a mano en la ficha o con "Actualizar precio" en bloque — queda con su fecha. (Antes sólo se registraban los cambios en bloque.)',
        'Usa exactamente el mismo Property Editor — el mismo componente, no una copia — por pasos que "Propiedades (web)": Información básica, Ubicación, Precio, Características, Descripción, Multimedia, Galería, Planos, Redes sociales y Comercial/Inversión. Crear y editar abren el mismo editor; las tres columnas (progreso, formulario, vista previa), el estado de cada paso, el porcentaje, el guardado automático al editar y el comportamiento en móvil son idénticos — son el mismo código. Lo único que cambia entre los dos catálogos son los pasos y los campos que cada uno declara.',
        'El desplegable "Tipo de propiedad" incluye, además de los residenciales (piso, chalet, adosado, ático, estudio), suelo/terreno, oficina, local comercial, nave industrial, garaje y edificio completo. Según el tipo elegido, la ficha muestra sólo los campos que tienen sentido para él — un terreno no pide habitaciones ni baños, un garaje no pide cocinas — sin ocultar nunca los campos de gestión (referencia, comercial asignado, estado…), que se ven siempre.',
        'Desde la actualización de paridad, este catálogo tiene los mismos campos opcionales que Propiedades (web): año de construcción y puntos clave (Información básica); precio anterior y plan de pagos opcional (Precio); orientación, calificación energética y equipamiento — ascensor, piscina, garaje, terraza, jardín, mascotas, accesible (Características); fotos adicionales — aérea, nocturna, antes/después, con staging IA (Multimedia); y exclusiva/tour virtual y rentabilidad estimada (Comercial/Inversión; la comunidad va en Precio → «Comunidad (mensual)»). Solo falta "Tipos de unidad": esa sección es una lista de tipologías de un desarrollo con varias unidades en construcción y no aplica a una vivienda de reventa individual.',
        'También tiene, exactamente igual que Propiedades (web): referencia interna (se genera sola, formato S-XXXXXX), referencia de agencia y origen/referencia externa, fecha y origen de captación (Información básica); privacidad de la ubicación — exacta, aproximada u ocultar número (Ubicación); aseos, salones, cocinas, plazas de garaje y superficies de útil/parcela/terraza/jardín/balcón/trastero, estado físico y amueblado, y la casilla "Características repasadas" para el equipamiento (Características); el paso "Estancias personalizadas" con dormitorios/despachos con su propia superficie y orientación; y tipo de mandato y fechas de exclusividad (Comercial/Inversión).',
        'La sección "Ubicación" incluye los mismos campos de dirección granular y el mapa interactivo (buscar dirección, arrastrar el marcador) que Propiedades (web). Si la propiedad ya tenía una dirección en el campo de texto libre anterior, se conserva como "Referencia de ubicación (heredado)" — no se pierde, y puedes rellenar los campos nuevos cuando quieras.',
        'La sección "Multimedia" admite vídeo por URL (YouTube, Vimeo o enlace directo) o subida de archivo (incluida la subida por partes para vídeos grandes), igual que Propiedades (web); "Galería" admite arrastrar para reordenar y "Usar como portada" para marcar la imagen principal.',
        '"Planos" funciona igual que en Propiedades (web): una cuadrícula de tarjetas visuales donde añades o editas cada plano (categoría, tipo de unidad, imagen…) en una ventana emergente — útil si la vivienda de reventa tiene un plano disponible, aunque no sea obligatorio.',
        '"Redes sociales" funciona igual que en Propiedades (web): "+ Añadir red social", elige la plataforma (Instagram, Facebook, LinkedIn, TikTok, YouTube, X/Twitter, Pinterest, WhatsApp, Telegram…), arrastra para reordenar o elimínala.',
        'La sección "Comercial / Inversión" tiene el mismo selector "Comercial asignado" (foto/iniciales, nombre, cargo) que Propiedades (web), más las marcas de exclusiva/tour virtual y la rentabilidad estimada.',
        'La descripción se edita en inglés y árabe desde la sección "Descripción" (son las traducciones que ve el público, no hay un texto en un idioma único) — es la única diferencia real de contenido frente a Propiedades (web). Cada idioma tiene el mismo editor de texto enriquecido (negrita, cursiva, listas, enlaces) que el resto de descripciones largas del constructor.',
        ...PROPERTY_SHEET_HELP_STEPS,
        ...PROPERTY_TRASH_HELP_STEPS,
        ...PROPERTY_OWNERS_HELP_STEPS,
        ...PROPERTY_BUYER_MATCHES_HELP_STEPS,
        ...PROPERTY_CRM_HELP_STEPS,
        ...PROPERTY_N7A_HELP_STEPS,
        ...PROPERTY_SEARCH_N7B_HELP_STEPS,
        ...PROPERTY_INLINE_EDIT_HELP_STEPS,
        ...PROPERTY_D1P_HELP_STEPS,
      ],
    },
    {
      key: 'agents',
      group: 'Portal Web',
      title: 'Comerciales',
      route: '/admin/comerciales',
      summary: 'Ficha profesional completa de cada comercial: datos laborales, especialización, propiedades asignadas, rendimiento y perfil público.',
      steps: [
        'El listado busca por nombre, puesto, email, teléfono, departamento u oficina; el botón "Filtros" añade zona, especialización, idioma y si tiene o no propiedades asignadas — cada filtro activo aparece como una chip que puedes quitar, o usa "Limpiar filtros" para quitarlos todos.',
        'Al abrir un comercial (o crear uno nuevo) se abre el Constructor de Comerciales: un stepper horizontal de 6 pasos — Datos personales, Información profesional, Contacto y redes, Perfil y presentación, Zonas y especialidades, Resumen — con el formulario a la izquierda y una vista previa de la ficha en tiempo real a la derecha. Crear y editar usan el mismo constructor.',
        'Cada paso del stepper indica su estado real: un check verde cuando tiene datos, un punto rojo (ámbar si es el paso activo) en "Datos personales" o "Contacto y redes" si falta un campo obligatorio (nombre, puesto o email). El paso "Resumen" avisa cuántos campos obligatorios faltan y permite saltar directamente a cada sección con "Editar".',
        'La vista previa de la derecha se actualiza al instante con cada cambio — foto, nombre, puesto, departamento, descripción, contacto y redes — sin necesidad de guardar antes. Antes de completar los datos muestra un aviso ("Completa los campos para ver la vista previa en tiempo real") en vez de datos de ejemplo.',
        'Las etiquetas/habilidades, zonas e idiomas se gestionan como chips ("+ Añadir…"), no como texto libre; las especialidades (obra nueva, lujo, alquiler…) se seleccionan tocando cada chip. Si el comercial ya tenía estos campos guardados como texto separado por comas (formato anterior), se muestran igualmente como chips al abrir la ficha — no hace falta volver a escribirlos.',
        'Debajo del constructor, "Propiedades asignadas", "Rendimiento" y "Documentos" quedan disponibles una vez guardada la ficha (no forman parte de los 6 pasos, ya que no son datos que se "completen" al crear un comercial):',
        '"Propiedades asignadas" muestra las propiedades ya asignadas a ese comercial y permite buscar y asignar otras nuevas (o desasignarlas); es la misma relación que usa el resto del catálogo, no una lista aparte.',
        '"Rendimiento" muestra leads, visitas, operaciones cerradas, volumen y comisión reales — calculados a partir de los leads/visitas/operaciones del CRM ya existentes, nunca cifras inventadas.',
        '"Documentos" admite adjuntar archivos internos (contratos, certificaciones…) — nunca se muestran en la ficha pública, solo son visibles desde el panel de administración.',
        'La visibilidad pública ("Mostrar este comercial en la web") y su orden se controlan en el paso "Perfil y presentación"; la ficha pública reutiliza la foto, el nombre, el puesto, la descripción y las redes de los pasos anteriores — no hay campos públicos duplicados.',
        'La agenda de disponibilidad para citas (horario semanal, duración y margen entre citas, tope diario, vacaciones y días bloqueados) se configura dentro de la propia ficha: en el paso "Información profesional", el enlace "Configurar horario →". Antes era un módulo aparte llamado "Equipo"; ahora es una pantalla más de este comercial, y desde ella se vuelve a su ficha. Los enlaces antiguos a /admin/agents y /admin/team siguen funcionando: llevan solos a la dirección nueva.',
        'Desde esa pantalla también sale la URL de calendario (.ics) para suscribirse a las citas de ese comercial desde Google Calendar u Outlook.',
      ],
    },
    {
      key: 'communities',
      group: 'Portal Web',
      title: 'Comunidades',
      route: '/admin/communities',
      summary: 'Zonas o urbanizaciones que agrupan propiedades y alimentan los filtros de búsqueda.',
      steps: [],
    },
    {
      key: 'scheduler',
      group: 'Portal Web',
      title: 'Publicación multicanal',
      route: '/admin/scheduler',
      summary: 'Programa la publicación automática de propiedades en portales externos (Idealista, Fotocasa) y redes sociales.',
      steps: [
        'Cada canal necesita sus propias credenciales configuradas — si no están conectadas, el sistema lo indica en vez de simular un envío.',
        'Revisa el histórico de publicaciones para ver qué se envió y si tuvo éxito.',
      ],
    },
    {
      key: 'brand-kit',
      group: 'Portal Web',
      title: 'Brand Kit',
      route: '/admin/asset-export/brand-kit',
      summary: 'Logo, colores y datos de contacto de tu marca, usados en todas las piezas generadas automáticamente (PDFs, catálogos, contratos).',
      steps: ['Configura esto primero — todo el resto del Asset Export Studio y los contratos lo usan como base visual.'],
    },
    {
      key: 'asset-export-templates',
      group: 'Portal Web',
      title: 'Plantillas de Export',
      route: '/admin/asset-export/templates',
      summary: 'Diseña plantillas visuales (ficha de propiedad, dossier, cartel) con un editor de arrastrar y soltar.',
      steps: ['El editor tiene deshacer/rehacer real (Ctrl/Cmd+Z) y funciona igual en plantillas que en piezas ya generadas.'],
    },
    {
      key: 'asset-export-projects',
      group: 'Portal Web',
      title: 'Piezas generadas',
      route: '/admin/asset-export/projects',
      summary: 'Piezas individuales (PDF, y PNG para redes cuando la plataforma tiene activado el renderizado de imágenes) ya generadas a partir de una plantilla y una propiedad concreta.',
      steps: [
        'El QR de cada pieza se valida automáticamente al generarla — si no seria legible, el sistema bloquea la descarga en vez de entregar un archivo roto.',
        'Los formatos de imagen para redes (feed cuadrado 1080×1080, feed vertical 1080×1350, story 1080×1920) se generan como PNG sólo si la plataforma tiene activado Browser Rendering; si no, al generar verás "necesita Browser Rendering" y Sistema → Estado del sistema lo indica en la fila "Imágenes para redes". Los PDF no dependen de eso. La exportación masiva y los catálogos combinados siguen siendo PDF: las imágenes se generan pieza a pieza.',
      ],
    },
    {
      key: 'asset-export-batches',
      group: 'Portal Web',
      title: 'Exportación masiva',
      route: '/admin/asset-export/batches',
      summary: 'Genera piezas para muchas propiedades a la vez y descárgalas todas juntas en un ZIP.',
      steps: [],
    },
    {
      key: 'asset-export-catalogs',
      group: 'Portal Web',
      title: 'Catálogos combinados',
      route: '/admin/asset-export/catalogs',
      summary: 'Un único PDF-catálogo con portada, índice y varias propiedades combinadas, de obra nueva o de 2ª mano.',
      steps: [
        '"Nuevo catálogo": elige "Propiedades de" Obra nueva o 2ª mano (un catálogo nunca mezcla los dos), la plantilla PDF, y busca y añade hasta 30 propiedades. También se crea desde los listados de propiedades con la acción masiva "Crear catálogo".',
        'En 2ª mano cada sección usa sólo datos y fotos publicables: título por tipo y zona, precio, m², dormitorios, baños, zona (nunca la dirección exacta) y la referencia (el número de ficha); sin QR, porque la 2ª mano no tiene página pública.',
        'Los precios salen en la moneda de tu agencia (Sistema → Configuración → Moneda).',
        'Si alguna sección falla, "Reintentar errores" la vuelve a generar sin rehacer las demás. La lista dice de qué catálogo es cada uno (Obra nueva / 2ª mano).',
      ],
    },
    // --- Finanzas & Growth -----------------------------------------------
    {
      key: 'facturacion',
      group: 'Finanzas & Growth',
      title: 'Facturación',
      route: '/admin/facturacion',
      summary: 'Tu plan de suscripción a la plataforma, uso y facturas.',
      steps: [],
    },
    {
      key: 'operaciones',
      group: 'Finanzas & Growth',
      title: 'Cierres y comisiones',
      route: '/admin/operaciones',
      summary: 'Registro de ventas y alquileres ya cerrados, con el cálculo de la comisión de cada comercial. (Antes se llamaba «Operaciones»; el seguimiento de una operación en marcha está en CRM → Operaciones.)',
      steps: [
        'Pulsa "Registrar operación", indica cliente, tipo (venta/alquiler), valor y porcentaje de comisión, para dar de alta un cierre que no pasó por el pipeline.',
        'La comisión se calcula sola; márcala como "pagada" cuando la liquides con el comercial.',
        'Estos datos alimentan directamente el panel de Ingresos.',
        'Cerrar una operación en CRM → Operaciones crea aquí su fila automáticamente, con la comisión en 0 — complétala tú con el % real. No hace falta registrarla dos veces.',
        'Los enlaces antiguos a esta pantalla (/admin/operaciones) siguen funcionando: sólo ha cambiado su nombre en el menú.',
      ],
    },
    {
      key: 'ingresos',
      group: 'Finanzas & Growth',
      title: 'Ingresos',
      route: '/admin/ingresos',
      summary: 'Dashboard de ingresos y comisiones, agregado por mes y por comercial a partir de las operaciones reales registradas.',
      steps: ['Si no ves datos aquí, es porque todavía no has registrado ninguna operación en "Operaciones".'],
    },
    {
      key: 'contratos',
      group: 'Finanzas & Growth',
      title: 'Contratos',
      route: '/admin/contratos',
      summary: 'Genera contratos (reserva, arras, alquiler, compraventa) a partir de plantillas y recoge la aceptación del cliente online.',
      steps: [
        'Primero crea una plantilla (botón "Plantillas") con el texto del contrato, usando tokens como {{client.name}} o {{amount}} que se rellenan solos.',
        'Crea un contrato eligiendo la plantilla, el cliente y las variables propias del caso (importe, fechas…).',
        'Pulsa "Enviar" para generar el enlace de aceptación y cópialo para el cliente.',
        'El cliente lee el contrato en su enlace propio y lo acepta con su nombre, un aviso legal y un clic — queda registrada su IP y la fecha/hora. Es una firma electrónica simple, no cualificada.',
        'Al aceptarse, se genera un PDF final con el sello de aceptación, descargable desde esta página o desde el portal del propio cliente.',
        'Un contrato se vincula a su operación desde la ficha de la operación (CRM → Operaciones → «Reserva, arras y contratos»). Aquí, debajo del título, aparece «Operación #…» con el enlace.',
      ],
    },
    {
      key: 'depositos',
      group: 'Finanzas & Growth',
      title: 'Depósitos',
      route: '/admin/depositos',
      summary: 'Cobro de fianzas o señales asociadas a un contrato, a través de Stripe Checkout, con confirmación automática por webhook.',
      steps: [
        'Elige el contrato y el importe, y pulsa "Solicitar pago" para generar un enlace de pago real de Stripe.',
        'Si el enlace no se genera y aparece "no conectado", significa que falta activar el secreto STRIPE_SECRET_KEY en el Worker — contacta con nosotros para configurarlo.',
        'El estado pasa a "Pagado" solo (automáticamente) en cuanto Stripe confirma el pago por webhook — nunca porque el cliente haya vuelto a la página de éxito, que no es una prueba de pago.',
        '"Comprobar estado" fuerza una consulta manual a Stripe, por si quieres verificar antes de que llegue el webhook o la reconciliación horaria.',
        'El historial de eventos de Stripe, debajo de la lista de depósitos, muestra cada notificación recibida y qué se hizo con ella — útil si un cliente dice haber pagado y no se refleja.',
        'Unas arras se vinculan a su operación desde la ficha de la operación (CRM → Operaciones → «Reserva, arras y contratos»); aquí aparece entonces «Operación #…» bajo el contrato.',
      ],
    },
    {
      key: 'tasador',
      group: 'Finanzas & Growth',
      title: 'Tasador (AVM)',
      route: '/admin/tasador',
      summary: 'Estimación automática de valor de una propiedad, calculada solo a partir de comparables reales de tu propio catálogo.',
      steps: [
        'Indica zona, tipo, superficie y habitaciones aproximadas.',
        'Si no hay suficientes propiedades comparables en tu catálogo, el sistema lo dice claramente en vez de inventar una cifra — sube más propiedades en esa zona para mejorar la estimación.',
      ],
    },
    {
      key: 'automatizaciones',
      group: 'CRM',
      title: 'Automatizaciones',
      route: '/admin/automatizaciones',
      summary: 'Reglas reales del tipo «cuando pase X, si se cumple Y, haz Z» sobre lo que ocurre en tu CRM: se ejecutan solas cada minuto y dejan registro de cada ejecución.',
      steps: [
        'Pulsa «+ Nueva automatización», ponle nombre y elige el disparador: Lead creado, Lead sin atender (SLA), Lead cambia de etapa, Visita realizada, Oferta aceptada, Operación cambia de etapa o Tarea vencida. Debajo de cada uno se explica de qué hecho real sale.',
        'Condiciones (opcionales, se tienen que cumplir todas): origen, etapa, prioridad, comercial o presupuesto del lead, etapa anterior o nueva en los cambios de etapa, o tipo y prioridad de la tarea vencida.',
        'Acción: Crear tarea (título, tipo, vencimiento en horas y responsable: el comercial del lead, una persona concreta o nadie), Asignar el lead a un comercial, Cambiar la etapa del lead, Añadir una nota o Avisar al equipo (aparece en la campana del panel). En títulos, notas y avisos puedes usar {{nombre}}, {{evento}}, {{etapa}} e {{id}}.',
        'No hay acciones que escriban a clientes (WhatsApp, email): en este panel un envío a un cliente lo confirma siempre una persona, y una automatización no puede confirmar por nadie.',
        'Sólo cuenta lo que pasa DESPUÉS de crearla o activarla: lo anterior no se recupera. Cada evento la dispara una sola vez, y hay un freno de seguridad de 5 ejecuciones al día sobre la misma ficha para que dos reglas no se disparen en bucle.',
        'Se ejecuta con tus permisos de ahora, los de quien la guardó o activó por última vez: si no podrías hacer la acción tú mismo, no te deja crearla, y si más adelante pierdes ese permiso, sus ejecuciones fallan y lo verás en el registro.',
        'En cada automatización: el interruptor la activa o desactiva (desactivada no ejecuta nada), «Procesar ahora» la ejecuta en el momento sin esperar al minuto siguiente, «Ver registro» enseña cada ejecución (cuándo, qué la disparó, si se hizo, no aplicaba o falló y por qué) y la papelera la borra.',
        'Las reglas de ejemplo que traía la cuenta («Bienvenida a nuevos leads»…) aparecen aparte como «demostración heredada»: nunca se ejecutaron y no se pueden activar. Bórralas y crea las tuyas.',
      ],
    },
    {
      key: 'ai',
      group: 'Finanzas & Growth',
      title: 'AI Studio',
      route: '/admin/ai',
      summary: 'Herramientas de generación de contenido asistidas por IA (descripciones, textos de marketing).',
      steps: [],
    },
    {
      key: 'widgets',
      group: 'Finanzas & Growth',
      title: 'Widgets',
      route: '/admin/widgets',
      summary: 'Fragmentos embebibles (buscador de propiedades, formulario de contacto) para insertar en otras webs.',
      steps: [],
    },
    {
      key: 'marketplace',
      group: 'Finanzas & Growth',
      title: 'Marketplace',
      route: '/admin/marketplace',
      summary: 'Catálogo honesto de integraciones: lo que la plataforma conecta hoy de verdad, con un enlace a la pantalla donde se configura cada cosa, y lo que todavía no existe.',
      steps: [
        'Las tarjetas «Disponible» (WhatsApp Business, chat y formularios de la web, email transaccional, email entrante de respuestas a los hilos, Stripe, API v1, webhooks, calendario iCal, widgets e INMO) existen de verdad: «Configurar» te lleva a su pantalla y la tarjeta dice qué requisito necesita (un número conectado, un secreto de la plataforma…).',
        'Las tarjetas «Próximamente» (portales inmobiliarios, MLS, firma electrónica, Google Calendar y Outlook, redes sociales, conectores de marketing y optimización de rutas) no tienen integración real todavía: no hay ningún botón que aparente conectarlas. Mientras tanto, los leads de un portal pueden entrar por la API v1 (origen «portal»).',
      ],
    },
    {
      key: 'api',
      group: 'Finanzas & Growth',
      title: 'API',
      route: '/admin/api',
      summary: 'Claves de API para integrar tu catálogo y tus leads con herramientas externas (API v1 pública).',
      steps: [
        'Genera una clave con permiso de lectura o escritura según lo que necesite la integración externa.',
        'Un lead enviado por la API (POST /api/v1/leads) entra igual que uno del formulario de la web: se enlaza a su Contacto (o se crea), se reparte con tus reglas de enrutado, queda en su Actividad y avisa al equipo. Si ese email ya tiene un lead en tu agencia, se actualiza ese lead en vez de crear otro, y la respuesta lo indica con "created": false.',
      ],
    },
    // --- Blog & CMS --------------------------------------------------------
    {
      key: 'cms-dashboard',
      group: 'Blog & CMS',
      title: 'Dashboard del blog',
      route: '/admin/cms',
      summary: 'Resumen de artículos publicados, borradores y comentarios pendientes.',
      steps: [],
    },
    {
      key: 'cms-articles',
      group: 'Blog & CMS',
      title: 'Artículos',
      route: '/admin/cms/articles',
      summary: 'Editor de artículos del blog: título, contenido, categoría, etiquetas, imagen destacada y SEO.',
      steps: [
        'Guarda como borrador mientras escribes; publica cuando esté listo.',
        'Los artículos pueden programarse con fecha de caducidad automática si lo necesitas.',
      ],
    },
    {
      key: 'cms-categories',
      group: 'Blog & CMS',
      title: 'Categorías',
      route: '/admin/cms-categories',
      summary: 'Organiza los artículos del blog en categorías.',
      steps: [],
    },
    {
      key: 'cms-tags',
      group: 'Blog & CMS',
      title: 'Etiquetas',
      route: '/admin/cms-tags',
      summary: 'Etiquetas libres para artículos, usadas en filtros y relacionados.',
      steps: [],
    },
    {
      key: 'cms-authors',
      group: 'Blog & CMS',
      title: 'Autores',
      route: '/admin/cms-authors',
      summary: 'Perfiles de autor que se muestran en cada artículo del blog.',
      steps: [],
    },
    {
      key: 'cms-media',
      group: 'Blog & CMS',
      title: 'Media Library',
      route: '/admin/cms/media',
      summary: 'Biblioteca central de imágenes subidas, reutilizable en artículos y propiedades.',
      steps: [],
    },
    {
      key: 'cms-comments',
      group: 'Blog & CMS',
      title: 'Comentarios',
      route: '/admin/cms-comments',
      summary: 'Modera los comentarios que dejan los lectores en los artículos del blog.',
      steps: [],
    },
    {
      key: 'cms-redirects',
      group: 'Blog & CMS',
      title: 'Redirecciones',
      route: '/admin/cms-redirects',
      summary: 'Redirecciones 301 manuales, útiles al cambiar la URL de un artículo ya indexado.',
      steps: [],
    },
    {
      key: 'cms-papelera',
      group: 'Blog & CMS',
      title: 'Papelera',
      route: '/admin/cms/papelera',
      summary: 'Artículos eliminados, recuperables durante un tiempo antes de borrarse definitivamente.',
      steps: [],
    },
    {
      key: 'cms-config',
      group: 'Blog & CMS',
      title: 'Config. Blog',
      route: '/admin/cms/configuracion',
      summary: 'Ajustes generales del blog (SEO por defecto, moderación de comentarios).',
      steps: [],
    },
    // --- Contenido -----------------------------------------------------------
    {
      key: 'blogs-legacy',
      group: 'Contenido',
      title: 'Blog (legacy)',
      route: '/admin/blogs',
      summary: 'Sistema de blog anterior, mantenido solo por compatibilidad con contenido antiguo.',
      steps: ['Para contenido nuevo usa siempre "Blog & CMS → Artículos", no esta sección.'],
    },
    // --- Bandeja -------------------------------------------------------------
    {
      key: 'visitor-submissions',
      group: 'Bandeja',
      title: 'Solicitudes',
      route: '/admin/visitor-submissions',
      summary: 'Formularios genéricos rellenados por visitantes de la web pública.',
      steps: [],
    },
    {
      key: 'vendor-registrations',
      group: 'Bandeja',
      title: 'Proveedores',
      route: '/admin/vendor-registrations',
      summary: 'Solicitudes de alta de proveedores/colaboradores externos.',
      steps: [],
    },
    {
      key: 'contact-messages',
      group: 'Bandeja',
      title: 'Mensajes',
      route: '/admin/contact-messages',
      summary: 'Mensajes enviados desde el formulario de contacto público de tu web.',
      steps: [],
    },
    // --- Sistema -------------------------------------------------------------
    {
      key: 'configuracion',
      group: 'Sistema',
      title: 'Configuración',
      route: '/admin/configuracion',
      summary: 'Ajustes generales de tu empresa: nombre, dominio, idiomas y preferencias de la plataforma.',
      steps: [
        '"Moneda" es la de todos los importes que guardas: precios de las propiedades, presupuestos de leads, precios de las necesidades, operaciones, reservas y facturas. El panel, los emails, los textos de IA, los contratos y los PDF de Asset Export la usan tal cual, sin convertir nada.',
        'En la web pública es la moneda base de tus precios: el visitante puede elegir otra en el selector de moneda y ve los precios convertidos con tasas orientativas (sólo cambia cómo se ven; los filtros y los datos siguen en tu moneda).',
        'Si nunca la eliges, la plataforma usa AED (el comportamiento de siempre). Si trabajas en euros, elige EUR. Cambiarla NO convierte los importes que ya tienes guardados: si los tenías en otra moneda, revísalos.',
        'Las ofertas y los depósitos de Stripe guardan su propia moneda: los nuevos toman la que elijas aquí (si nunca la elegiste, euros, como hasta ahora) y cada uno se enseña siempre con la suya.',
      ],
    },
    {
      key: 'users',
      group: 'Sistema',
      title: 'Usuarios',
      route: '/admin/users',
      summary: 'Cuentas de acceso al panel (rol admin) y cuentas de cliente (rol usuario) que pueden entrar a "Mi cuenta". Un super_admin puede además restringir a qué áreas del panel accede cada admin.',
      steps: [
        'Crea una cuenta con rol "usuario" y el mismo email que un cliente para que pueda ver sus propias visitas y contratos desde /mi-cuenta.',
        'Al editar una cuenta con rol "admin", un super_admin ve un bloque "Permisos": por defecto tiene acceso completo; elige "Restringir a áreas concretas" y marca "Ver"/"Editar" por cada sección (CRM, Portal Web, Finanzas & Growth, Blog & CMS, Contenido, Bandeja, Sistema, General) para limitar esa cuenta. Las secciones sin acceso concedido desaparecen del menú lateral de esa persona.',
        'Para no tener que saber qué casillas marcar, el desplegable "Plantilla" trae los perfiles habituales: **Comercial** (lleva el CRM, consulta el catálogo; no ve facturación, RGPD ni usuarios), **Marketing y web** (portal, constructor, publicación, blog; consulta el CRM), **Facturación y operaciones** (finanzas, contratos, depósitos, claves de API; consulta el CRM; no ve usuarios ni RGPD), **Administración y RGPD** (usuarios, webhooks, emails, privacidad, auditoría; consulta el resto) y **Sólo consulta**. Elegir una rellena las casillas y puedes ajustarlas después; el desplegable dice también a qué plantilla equivale lo que tiene la cuenta ahora, o "Personalizado" si no coincide con ninguna.',
        'Solo un super_admin puede ver o cambiar los permisos de otra cuenta — un admin normal no ve ese bloque aunque tenga acceso de escritura a Usuarios.',
        'Las restricciones se aplican en el servidor, no solo en el menú: una cuenta sin acceso a un área recibe un error de permisos aunque llame directamente a la API o escriba la dirección de la página a mano. Los botones de crear, editar y borrar también desaparecen en las áreas donde solo tiene "Ver".',
        'Si eliges "Restringir a áreas concretas" y no marcas ninguna casilla, esa cuenta se queda sin acceso a nada (solo verá la Ayuda). Para devolverle el acceso completo, vuelve a marcar "Acceso completo".',
        'Los cambios de permisos son inmediatos: la persona no necesita volver a iniciar sesión para que se le apliquen (ni para que se le retiren).',
      ],
    },
    {
      key: 'webhooks',
      group: 'Sistema',
      title: 'Webhooks',
      route: '/admin/webhooks',
      summary: 'Notifica a tus propios sistemas externos en tiempo real cuando ocurre algo (lead nuevo, operación cerrada, contrato aceptado…).',
      steps: [
        'Crea un endpoint indicando la URL de tu sistema y qué eventos quieres recibir.',
        'Guarda el secreto que se muestra al crearlo — solo se ve una vez, y sirve para verificar que la notificación viene realmente de esta plataforma (firma HMAC).',
        'Usa "Probar" para enviar un evento de prueba real y comprobar que tu sistema lo recibe.',
        'El histórico de entregas muestra cada intento real, incluidos los fallos, con el código de respuesta que devolvió tu servidor.',
        '"Rotar secreto" genera uno nuevo sin borrar el endpoint ni su historial: úsalo si el actual se ha filtrado o al cambiar de proveedor. El secreto nuevo se muestra una sola vez y las entregas siguientes ya van firmadas con él, así que actualízalo en el sistema receptor en ese mismo momento. Cada rotación queda en Sistema → Auditoría (quién y cuándo, nunca el valor).',
      ],
    },
    {
      key: 'emails',
      group: 'Sistema',
      title: 'Emails',
      route: '/admin/emails',
      summary: 'Desde qué dirección envía tu empresa sus emails a clientes y equipo (con la verificación de tu dominio), y el historial real de envíos vía Resend.',
      steps: [
        'Arriba ves con qué remitente salen HOY tus emails. Sin configurar nada ya salen con el nombre de tu empresa («Tu empresa <info@serendipiaagency.com>») y las respuestas te llegan al correo con el que te registraste; puedes cambiarlo en «Responder a».',
        'Opcional — para que también la dirección sea la tuya (p. ej. hola@tuinmobiliaria.es): escríbela en «Dirección del remitente» y pulsa «Guardar remitente». Tiene que ser de un dominio tuyo: Gmail, Outlook, Yahoo… no sirven como remitente (sí como «Responder a»).',
        'Al guardar aparecen 3 registros DNS. Añádelos tal cual en el panel donde gestionas el DNS de tu dominio (tu registrador, Cloudflare, tu hosting…). Pulsa un nombre o un valor para copiarlo. No tocan tu correo actual: van en subdominios propios.',
        'Después pulsa «Comprobar ahora». El DNS puede tardar desde minutos hasta 48 horas; mientras tanto tus emails siguen saliendo con tu nombre desde la dirección de la plataforma, no se pierde ninguno. Cuando el estado pasa a «Verificado», salen de tu dirección.',
        'Los emails propios de la plataforma salen siempre de Portal INMO <info@serendipiaagency.com>, con su plantilla corporativa, aunque tengas tu dominio verificado: altas de usuario, bienvenida, recuperación de contraseña, estado de tu empresa y avisos de tu web. Lo que tu empresa manda a SUS clientes (citas, contratos, cobros, alertas) sigue saliendo con tu nombre y tu marca.',
        '«Avisos internos para tu equipo» son las direcciones que reciben los avisos de nuevos leads, mensajes de contacto, conversaciones de WhatsApp, reclamaciones y contratos aceptados (una por línea, hasta 10). Llegan de Portal INMO, con un botón para abrirlos en la plataforma; si la dirección es de alguien con cuenta, el saludo lleva su nombre.',
        'Super admin: «Plantilla de los emails de Portal INMO» enseña cada email propio de la plataforma con datos de ejemplo, en escritorio y en móvil, en español o inglés. La vista previa no envía nada; «Enviarme una prueba» manda esa plantilla sólo a tu propio correo y queda en la auditoría.',
        'Un dominio sólo puede usarlo una empresa en INMO. Si al guardar te dice que ya lo usa otra, o que está dado de alta en la plataforma, contacta con soporte de INMO.',
        'Si arriba aparece un aviso rojo o ámbar, el canal de email tiene un problema: lo verás también en el Dashboard. En verde no hay aviso, la pantalla se queda como siempre.',
        '"El envío de emails no está conectado" significa que falta el secreto RESEND_API_KEY en el Worker — lo configura quien administra Cloudflare. Mientras tanto nada se pierde: los envíos se siguen registrando aquí y se reintentan solos cuando se conecte.',
        'El estado solo pasa a "Entregado" cuando Resend lo confirma — "Enviado" únicamente significa que Resend aceptó la petición, no que llegó a un buzón real.',
        '"Rebotado" y "Reclamación" también los confirma Resend por webhook, nunca se marcan por adelantado. No cuentan como avería del canal: el problema está en el buzón del destinatario, no en el envío.',
        'Un envío fallido se reintenta automáticamente (hasta 5 veces, con espera creciente) antes de marcarse "Fallido" de forma definitiva. Una fila que sigue "En cola" más de 12 h ya no está esperando su turno: está atascada, y el aviso de arriba la cuenta como tal.',
        'El destinatario, la plantilla y el tipo (transaccional o comercial) de cada fila corresponden exactamente a lo que se envió — nada se resume ni se inventa.',
      ],
    },
    {
      key: 'estado-sistema',
      group: 'Sistema',
      title: 'Estado del sistema',
      route: '/admin/estado',
      summary: 'Qué integraciones de la plataforma (email, cobros, IA, avisos, canales de publicación) están funcionando ahora mismo, cuáles están sin configurar y cuáles todavía no existen. Sólo la ve el super_admin.',
      steps: [
        '"Sin configurar" y "Sin implementar" no son lo mismo, y es la distinción más útil de esta pantalla: lo primero se arregla añadiendo un ajuste y la propia fila te dice cuál; lo segundo significa que no hay código detrás todavía, y configurar algo no lo cambiaría.',
        '"Con problemas" es lo único urgente: algo que debería funcionar y no está funcionando. Sale primero en el resumen de arriba.',
        'Cada fila dice qué deja de funcionar mientras tanto, en vez de limitarse a un semáforo. Por ejemplo, sin la confirmación de entrega de emails un envío se queda en "Enviado" para siempre, aunque haya llegado.',
        'La pantalla nunca muestra el valor de un secreto, sólo si está puesto o no — se puede enseñar o capturar sin filtrar nada.',
        '"Email entrante (respuestas a los hilos)" (grupo Comunicaciones) está en ok cuando el Worker tiene INBOUND_EMAIL_DOMAIN e INBOUND_EMAIL_SECRET; si falta alguno, la fila dice que las respuestas de los clientes llegan al «Responder a» de cada agencia y qué configurar en Cloudflare. Configuración → Comunicaciones comprueba además que el dominio sea válido y el secreto lo bastante largo.',
        '"Dominios personalizados" (grupo Infraestructura) dice si cada dominio de cliente sigue llegando a su agencia: la plataforma lo comprueba sola cada 10 minutos, sin credenciales, pidiendo la pantalla de login y preguntando a qué agencia resuelve el host. Si un dominio responde pero sirve otra agencia, o devuelve un 404, la fila pasa a "Con problemas" con el motivo exacto y sale un aviso (webhook de incidencias, buzón interno de la agencia y correo de los super_admin) — una vez al caer y otra al recuperarse, no cada 10 minutos.',
        'Abajo, "Build desplegado" dice qué código está sirviendo: el commit, la rama y quién lo publicó. Si pone "Se saltó el pipeline", ese despliegue no pasó por la copia de seguridad ni por las migraciones.',
      ],
    },
    {
      key: 'privacidad',
      group: 'Sistema',
      title: 'Privacidad (RGPD)',
      route: '/admin/privacidad',
      summary: 'Exporta o anonimiza los datos personales de un cliente concreto a petición suya (derecho de acceso/supresión RGPD).',
      steps: [
        'Busca por email y pulsa "Exportar datos" para descargar todo lo que tenemos de esa persona en un JSON.',
        '"Anonimizar / eliminar" sustituye sus datos personales por un marcador genérico en vez de borrar las filas — así no se rompen operaciones o contratos ya cerrados que dependan de ese registro.',
        'Toda solicitud queda registrada en el histórico de auditoría.',
      ],
    },
    {
      key: 'audit-log',
      group: 'Sistema',
      title: 'Auditoría',
      route: '/admin/audit-log',
      summary: 'Registro de qué usuario de tu equipo hizo qué acción y cuándo, dentro del panel.',
      steps: [
        'Cada fila dice quién, qué acción, sobre qué registro y cuándo. La columna "Detalle" es donde consta lo sensible: una contraseña cambiada (nunca la contraseña), un rol que sube, unos permisos que cambian, un dominio que se mueve, una clave de API creada o revocada, un secreto de webhook rotado, el segundo factor activado o desactivado, o un inicio de sesión con código de recuperación.',
        'Busca por email, recurso o detalle. Las acciones de la plataforma (Empresas, estado del sistema) las hace el super_admin y no salen aquí: esto es el registro de tu propia agencia.',
      ],
    },
    {
      key: 'cuenta',
      group: 'Sistema',
      title: 'Mi cuenta (verificación en dos pasos)',
      route: '/admin/cuenta',
      summary: 'Activa el segundo factor de tu propia cuenta: además de la contraseña, un código de 6 dígitos de tu app de autenticación cada vez que entras. Se abre desde el icono de escudo junto a tu nombre, abajo en el menú.',
      steps: [
        'Instala una app de autenticación en el teléfono si no tienes ya una (Google Authenticator, Authy, Microsoft Authenticator, 1Password, Bitwarden…). Cualquiera que genere códigos TOTP vale.',
        'Pulsa "Activar", escanea el código QR con la app (o teclea la clave que aparece debajo) y escribe el código de 6 dígitos que te muestra. Hasta que no confirmes con un código correcto, nada cambia: si cancelas, tu cuenta sigue como estaba.',
        'Al confirmar aparecen 10 códigos de recuperación. **Guárdalos ahora** (cópialos o apúntalos): cada uno vale una sola vez y son la forma de entrar si pierdes el teléfono. No se vuelven a mostrar; si los pierdes, genera unos nuevos con tu contraseña.',
        'A partir de ahí, al entrar se te pedirá el código después de la contraseña. Tienes 5 minutos y 5 intentos por cada login; si se agotan, vuelve a empezar por la contraseña. Un código sólo vale una vez, aunque siga siendo válido 30 segundos: espera al siguiente.',
        'Sin el teléfono a mano, elige "Usa un código de recuperación" en la pantalla de login. Cada uso descuenta uno y queda en Sistema → Auditoría; cuando te queden 2 o menos, la pantalla te avisa para que generes otros.',
        'Desactivar exige tu contraseña y un código válido: una sesión abierta en otro ordenador no basta para quitar la protección. Activar y desactivar constan en la auditoría.',
        'Si el panel dice que la verificación en dos pasos "no está disponible en esta instalación", falta el secreto TOTP_ENCRYPTION_KEY en el Worker (el secreto de tu app se guarda cifrado con él). Quien administre la plataforma lo ve en Sistema → Estado del sistema.',
      ],
    },
    {
      key: 'organizations',
      group: 'Sistema',
      title: 'Empresas',
      route: '/admin/organizations',
      summary: 'Solo super_admin. Todas las inmobiliarias (tenants) de la plataforma: alta guiada, ficha por secciones (identidad, configuración, email, datos legales, usuarios y estado) y origen del alta.',
      steps: [
        '"+ Nuevo" abre el alta guiada en 5 pasos: Empresa (nombre, nombre comercial, dominio y estado inicial), Identidad (logo y color de marca, con vista previa), Configuración (idioma de los emails y almacenamiento), Acceso (administrador inicial) y Revisión. Nada se guarda hasta pulsar "Crear empresa"; desde la revisión, "Editar" te lleva al paso de cada bloque.',
        'El dominio se comprueba mientras escribes: si ya es de otra empresa, no es válido o pertenece a la plataforma (*.workers.dev, localhost), no te deja continuar. Escríbelo sin "https://" ni rutas; con o sin "www." se trata como el mismo dominio. Puedes dejarlo vacío y asignarlo después — ver docs/multi-domain.md para los pasos en Cloudflare (Custom Domains).',
        'El logo se arrastra o se selecciona (PNG, JPG o WebP, máximo 2 MB) y se puede reemplazar o quitar antes de crear. Se sube al crear la empresa y queda a nombre de ESA empresa; si la subida fallara, la empresa se crea igual y el aviso te dice que lo subas desde la ficha.',
        'Administrador inicial: "Invitar ahora" crea su cuenta como Administrador de esa empresa (nunca super admin) y le envía desde Portal INMO <info@serendipiaagency.com> un enlace para definir su contraseña. Nadie elige la contraseña por él y nunca se envía una contraseña por email. El enlace caduca en 1 hora: después, "Reenviar invitación" en la ficha → Usuarios, o "¿Olvidaste tu contraseña?" en el login.',
        'Al terminar verás si la invitación salió de verdad ("enviada", "en cola" si el proveedor no respondió, o "no enviada" si el envío de emails no está configurado). Desde ahí: "Ver empresa", "Crear otra empresa" o volver al listado. Si sales a mitad del alta con datos escritos, el panel te pide confirmación.',
        'La ficha de una empresa se organiza en secciones: Resumen (usuarios, propiedades, equipo y leads reales), Identidad, Configuración, Email, Datos legales, Usuarios y Estado. "Guardar cambios" guarda sólo lo que has tocado.',
        'Email: el mismo panel que ve el administrador de la empresa en Sistema → Emails — su remitente, la verificación de su dominio (registros DNS y «Comprobar ahora») y sus avisos internos. Se guarda con su propio botón. Como super admin puedes asignar a una empresa un dominio que ya estaba dado de alta a mano en Resend. Los emails de cuenta (bienvenida, invitación, recuperar contraseña, cambios de estado) salen siempre de Portal INMO <info@serendipiaagency.com>, con la plantilla corporativa.',
        'Datos legales (razón social, CIF/NIF, dirección, email y teléfono) son el responsable del tratamiento de esa empresa y aparecen en sus páginas de Privacidad y Términos; mientras estén vacíos, muestran "Por confirmar".',
        'Estado: "Suspendida" bloquea el acceso de todo su equipo al momento, incluidas las sesiones abiertas, sin borrar datos ni cuentas; "Activa" lo devuelve tal cual. Ambos cambios piden confirmación, constan en la auditoría y avisan por email a los administradores de la empresa y al super admin.',
        'La columna "Origen" del listado dice cómo se dio de alta cada empresa: desde este panel o desde el registro web público (Landing → "Registro empresa"). Las del registro web entran con acceso inmediato y su administrador es quien se registró.',
        'Usuarios: la ficha lista las cuentas de la empresa. Para añadir o editar usuarios, "Gestionar usuarios" cambia la organización activa a esa empresa y abre Usuarios.',
        'Cuenta demo comercial: el recuadro de arriba del listado gestiona «Norte Astur Inmobiliaria», una inmobiliaria ficticia de Asturias con seis meses de actividad (propiedades con fotos, contactos, leads, visitas, ofertas, operaciones, facturas, web y blog) para enseñar la plataforma. Se genera por tramos con los mismos servicios que usa el panel (tarda unos minutos; avanza sola con el cron y más rápido con esta pantalla abierta) y su gerente entra con demo@portalinmo, con rol de administradora de esa empresa, nunca de super admin.',
        'La cuenta demo está marcada como demo: no envía emails, WhatsApp ni webhooks, no llama, no cobra y no publica en portales; lo que intentaría enviar queda registrado como «no enviado». En el navegador, los enlaces de llamar, WhatsApp y email de sus fichas no hacen nada. Su panel lo indica bajo el nombre de la empresa («Cuenta demo · sin envíos reales»).',
        '"Restablecer la demo…" borra todo lo de la empresa demo —también lo que se haya tocado en una presentación— y la vuelve a generar con la historia anclada a hoy, así nunca parece abandonada. Pide escribir su identificador para confirmar, queda en la auditoría y sólo afecta a esa empresa: el borrado comprueba antes que es la cuenta demo. Ver docs/demo.md.',
      ],
    },
  ]

  const faqs: HelpFaq[] = [
    {
      id: 'faq-email-entrante',
      question: 'Respondí a un cliente por email desde Comunicaciones, ¿dónde veo lo que me contesta?',
      answer:
        'Depende de si la plataforma tiene activo el email entrante: míralo en Configuración → Comunicaciones → «Email entrante». Si dice «Activo», su respuesta aparece en el mismo hilo como mensaje «Email» sin leer (sin la cita de tu mensaje; los adjuntos no se guardan, pero el mensaje dice cuáles traía). Si dice «No activo», la respuesta llega al buzón «Responder a» de tu agencia (Sistema → Emails), fuera de la plataforma; activarlo lo hace quien administra la plataforma en Cloudflare (Email Routing y dos ajustes del Worker), y la misma tarjeta enseña los pasos. Sólo vuelven al hilo las respuestas a emails enviados desde un hilo: un email nuevo que el cliente escriba aparte no entra.',
      tags: ['email', 'respuesta', 'email entrante', 'comunicaciones', 'responder a', 'bandeja'],
    },
    {
      id: 'faq-moneda',
      question: '¿En qué moneda salen los precios? Veo «AED» y trabajo en euros.',
      answer:
        'En la de tu agencia: Sistema → Configuración → Moneda. Si nunca la elegiste, la plataforma usa AED; elige EUR y todo el panel, los emails, los PDF y la web pública pasan a euros. Cambiarla no convierte los importes ya guardados (se guardan tal cual en tu moneda). En la web, el visitante puede ver los precios convertidos a otra moneda con el selector, pero los datos siguen en la tuya.',
      tags: ['moneda', 'euros', 'aed', 'divisa', 'precio', 'configuración'],
    },
    {
      id: 'faq-catalogo-segunda-mano',
      question: '¿Puedo hacer un catálogo PDF con propiedades de 2ª mano?',
      answer:
        'Sí. En Propiedades 2ª mano, selecciona hasta 30 propiedades en la vista de lista y elige la acción «Crear catálogo», o en Portal Web → Catálogos combinados elige «2ª mano». Sólo salen datos y fotos publicables, con la ubicación según la privacidad de cada ficha, y sin QR porque la 2ª mano no tiene página pública.',
      tags: ['catálogo', 'pdf', 'segunda mano', '2ª mano', 'asset export', 'acción masiva'],
    },
    {
      id: 'faq-web-cerca',
      question: '¿Pueden mis clientes buscar por código postal o cerca de un punto en la web?',
      answer:
        'Sí. En «Filtros» de la web hay un campo «Código postal» (busca por el principio: «280» encuentra todo 280xx). En el mapa, «Buscar cerca de aquí» busca en un radio (1 a 50 km) alrededor del centro del mapa, o de la ubicación del visitante si pulsa «Mi ubicación» y el navegador se lo permite. Las dos cosas cuentan en la insignia de filtros y se guardan con la búsqueda. El radio usa la ubicación que se publica: con ubicación aproximada, la redondeada.',
      tags: ['web', 'código postal', 'radio', 'mapa', 'cerca', 'búsqueda'],
    },
    {
      id: 'faq-campo-personalizado',
      question: '¿Cómo añado un dato que no existe en la ficha (por ejemplo, «Cliente VIP» o «Fecha de llaves»)?',
      answer:
        'Con un campo personalizado: CRM → Campos personalizados, elige a qué se aplica (propiedades, contactos, leads, citas u operaciones) y «+ Nuevo campo». A partir de ahí aparece en todas las fichas de ese tipo, en el panel «Campos personalizados». Si es de propiedades y marcas «Visible en la web pública», sale también en la ficha pública. El tipo de un campo no se puede cambiar una vez que alguna ficha tiene valor: archívalo y crea otro.',
      tags: ['campo personalizado', 'campos', 'ficha', 'dato', 'personalizar'],
    },
    {
      id: 'faq-etiquetas',
      question: '¿Dónde veo y quito las etiquetas que puse con una acción masiva?',
      answer:
        'En la ficha: bajo el nombre del lead o del contacto, y debajo del editor de la propiedad. La × quita una etiqueta y «+ Etiqueta» añade otra (nueva o existente). Los listados de propiedades, leads y contactos las enseñan en cada fila y se pueden filtrar por etiqueta. Los contactos también se pueden etiquetar.',
      tags: ['etiqueta', 'tag', 'filtrar', 'contacto', 'lead', 'propiedad'],
    },
    {
      id: 'faq-busqueda-mapa',
      question: '¿Cómo busco propiedades en una zona o cerca de una dirección?',
      answer:
        'En el listado de Propiedades (web) o 2ª mano pulsa «Mapa». Mueve el mapa a la zona y pulsa «Buscar en esta zona», o pon un radio en km, pulsa «Buscar alrededor de un punto» y haz clic en el mapa: el listado se filtra y se ordena por cercanía. Si tienes las coordenadas, escríbelas en Filtros → «Cerca de unas coordenadas». Sólo salen las propiedades con ubicación guardada en su ficha.',
      tags: ['mapa', 'zona', 'radio', 'coordenadas', 'búsqueda', 'cerca'],
    },
    {
      id: 'faq-mapa-fondo',
      question: '¿De dónde sale el fondo de los mapas? ¿Hay que configurar algo?',
      answer:
        'El fondo de los mapas (calles, nombres de lugares) es de OpenStreetMap: no necesita clave ni cuenta, y no hay nada que configurar. Abajo a la derecha de cada mapa aparece «© OpenStreetMap», que es obligatorio y no se puede quitar. El modo «Oscuro» es el mismo mapa en colores oscuros y «Satélite» usa fotos aéreas de Esri. Si alguna vez viste un mapa lleno de «API KEY REQUIRED», era el proveedor anterior (CARTO), que desde septiembre de 2026 exige una clave; ya no se usa.',
      tags: ['mapa', 'fondo', 'openstreetmap', 'carto', 'api key', 'teselas'],
    },
    {
      id: 'faq-exportar-leads',
      question: '¿Puedo exportar más de 200 leads?',
      answer:
        'Sí. «Exportar CSV (N)» en CRM → Leads descarga todos los leads del filtro que tengas puesto, sin límite de filas. La Tabla va por páginas; para una acción masiva sobre todos los del filtro, marca la casilla de la cabecera y pulsa «Seleccionar los N que cumplen el filtro» (hasta 2.000 por acción).',
      tags: ['leads', 'exportar', 'csv', 'límite', 'paginación'],
    },
    {
      id: 'faq-cancelar-cita-motivo',
      question: '¿Por qué me pide un motivo al cancelar una cita?',
      answer:
        'Porque una cita cancelada no se borra: queda en la agenda, en la ficha del cliente y en la actividad, y el motivo es lo que explica después qué pasó (el cliente ya compró otra vivienda, el inmueble dejó de estar disponible…). Se ve en la Lista y en la ficha de la cita. Si la cancela el propio cliente desde su enlace, el motivo lo indica.',
      tags: ['cita', 'visita', 'cancelar', 'motivo'],
    },
    {
      id: 'faq-cita-hora-calendario-externo',
      question: 'Las citas salen con otra hora en mi Google Calendar u Outlook, ¿por qué?',
      answer:
        'La suscripción iCal convierte cada cita con su zona horaria: la de la propia cita, si la tiene; si no, la de su oficina (CRM → Oficinas); si no, la de la agencia (Sistema → Configuración). Si una cita sale desplazada, revisa esa zona horaria: una oficina en Canarias debe tener "Atlantic/Canary" y una en la península "Europe/Madrid". La conexión directa con Google Calendar u Outlook (en los dos sentidos) todavía no existe.',
      tags: ['calendario', 'ical', 'google', 'outlook', 'zona horaria', 'hora'],
    },
    {
      id: 'faq-estado-comercial',
      question: '¿Qué diferencia hay entre «Estado comercial», «Estado de la obra» y «Disponibilidad»?',
      answer:
        'El «Estado comercial» (disponible, reservada, vendida, alquilada, retirada o borrador) es el que gestionas tú y es igual en Propiedades (web) y en 2ª mano: se filtra, se ve en la columna «Estado comercial» del listado, se cambia desde la fila o en bloque («Cambiar estado comercial»). El «Estado de la obra» es la fase de construcción de una promoción (obra nueva, en construcción, lista). La «Disponibilidad» es el disponible / vendida de 2ª mano que usa el matching. Al cambiar el estado comercial, «Reservada» pone la etiqueta de la web y, en 2ª mano, «Vendida» o «Disponible» ponen igual la disponibilidad.',
      tags: ['estado', 'estado comercial', 'reservada', 'vendida', 'alquilada', 'retirada', 'disponibilidad', 'obra'],
    },
    {
      id: 'faq-fecha-captacion-antigua',
      question: 'Mis fechas de captación o de exclusiva estaban escritas como «15/03/2025», ¿se han perdido?',
      answer:
        'No. Se conservan tal cual y se leen bien: el aviso de exclusiva caducada del resumen, el filtro «Vencimiento de la exclusiva» y el de «Captada desde/hasta» entienden también «15/03/2025», «15-3-2025» y similares. En el editor, el calendario enseña esa fecha y un aviso de cómo se lee; en cuanto la eliges de nuevo, se guarda como AAAA-MM-DD.',
      tags: ['fecha', 'captación', 'exclusiva', 'vencimiento', 'formato'],
    },
    {
      id: 'faq-papelera-propiedades',
      question: 'He eliminado una propiedad por error, ¿se puede recuperar?',
      answer:
        'Sí. En "Propiedades (web)" y "Propiedades 2ª mano", "Eliminar" manda la propiedad a la Papelera. Pulsa el botón "Papelera" del listado, busca la propiedad y pulsa "Restaurar": vuelve tal cual estaba, con su ficha, galería e histórico. Mientras está en la Papelera no se ve en la web, en las búsquedas ni en el matching, y no se le pueden crear ofertas, visitas ni envíos nuevos. Sólo "Eliminar definitivamente", desde la propia Papelera, la borra para siempre.',
      tags: ['propiedad', 'papelera', 'eliminar', 'restaurar', 'borrar', 'recuperar'],
    },
    {
      id: 'faq-editar-contacto',
      question: '¿Cómo cambio el teléfono, el idioma o la próxima acción de un contacto?',
      answer:
        'Abre el contacto (CRM → Contactos) y pulsa «Editar» en la cabecera. Ahí están todos los datos de la persona, sus roles y la próxima acción con su fecha. Si el teléfono o email nuevos ya pertenecen a otro contacto de tu agencia, se te avisa antes de guardar.',
      tags: ['contacto', 'editar', 'roles', 'próxima acción'],
    },
    {
      id: 'faq-ficha-ampliada',
      question: '¿Dónde están la calefacción, el IBI, la referencia catastral o el certificado energético de una propiedad?',
      answer:
        'En el editor de la propiedad. Usa el buscador "Buscar un campo" que hay encima de los pasos: escribe "IBI", "catastral" o "calefacción" y te lleva directamente al campo. Edificio y vivienda, Instalaciones y exteriores, y Legal y certificados son pasos propios; la fianza y el depósito sólo aparecen cuando la operación es "Alquiler". Lo legal, el precio mínimo autorizado y las comisiones son internos: nunca se publican.',
      tags: ['propiedad', 'ficha', 'legal', 'IBI', 'catastral', 'calefacción', 'alquiler'],
    },
    {
      id: 'faq-email-propio',
      question: '¿Cómo hago que los emails a mis clientes salgan desde mi propia dirección?',
      answer:
        'En Sistema → Emails escribe una dirección de tu dominio (por ejemplo hola@tuinmobiliaria.es) en «Dirección del remitente» y guarda. Te aparecerán 3 registros DNS: añádelos en el panel de tu dominio y pulsa «Comprobar ahora». En cuanto el dominio figure como «Verificado», tus emails a clientes y a tu equipo salen de tu dirección. Hasta entonces —y si no haces nada— salen con el nombre de tu empresa desde la dirección de INMO y las respuestas te llegan a ti, así que no se pierde nada. Las direcciones de Gmail, Outlook o similares no pueden ser remitente porque nadie puede verificar su dominio; sí puedes ponerlas en «Responder a».',
      tags: ['email', 'remitente', 'dominio', 'dns', 'verificar', 'responder a', 'correo propio'],
    },
    {
      id: 'faq-empresa-suspendida',
      question: 'Un cliente dice que no puede entrar y su contraseña es correcta: «el acceso de tu empresa está suspendido». ¿Qué pasa?',
      answer:
        'Su empresa está en estado "Suspendida" (Sistema → Empresas → ficha → Estado). Mientras lo esté, nadie de esa empresa puede entrar, aunque la contraseña sea correcta, y las sesiones abiertas dejan de valer; no se ha borrado nada. Para devolverle el acceso, cambia el estado a "Activa" y guarda: su equipo vuelve a entrar con sus credenciales de siempre y recibe un email avisándole.',
      tags: ['empresa', 'suspendida', 'acceso', 'login', 'no puedo entrar', 'estado'],
    },
    {
      id: 'faq-empresa-invitacion',
      question: 'Creé una empresa con administrador, pero no le ha llegado la invitación. ¿Qué hago?',
      answer:
        'Al crearla, la pantalla de éxito dice si la invitación salió, quedó en cola o no se pudo enviar. Abre la ficha de la empresa → Usuarios y pulsa "Reenviar invitación": se genera un enlace nuevo (el anterior caduca en 1 hora). Si dice que el envío de emails no está configurado, falta RESEND_API_KEY o el dominio serendipiaagency.com no está verificado en Resend — ver docs/empresas.md. El administrador también puede usar "¿Olvidaste tu contraseña?" en el login.',
      tags: ['empresa', 'invitación', 'email', 'administrador', 'no llega'],
    },
    {
      id: 'faq-lead-score',
      question: '¿Por qué un lead tiene esta puntuación? ¿Puedo cambiarla a mano?',
      answer:
        'Haz clic en el número del lead (CRM → Leads): verás cada criterio que suma o no, con el dato real que lo justifica, y su historial. La puntuación no se edita a mano — sale de reglas fijas sobre señales reales (presupuesto validado, fecha deseada, respuesta reciente, visita pedida, financiación, fichas abiertas). Si quieres que algo pese más o menos, cambia las reglas de tu agencia en CRM → Enrutamiento y SLA → Lead Score y pulsa "Recalcular todos los leads".',
      tags: ['lead score', 'puntuación', 'score', 'por qué', 'leads'],
    },
    {
      id: 'faq-inmo-datos',
      question: '¿De dónde saca INMO las propiedades y los datos? ¿Se puede inventar algo?',
      answer:
        'INMO no tiene acceso propio a la base de datos: llama a las mismas herramientas que usa el panel (buscador de propiedades, contactos, motor de Matching, citas, tareas…) con tu usuario y tus permisos, y sólo puede hablar de lo que esas herramientas le devuelven. Debajo de cada respuesta ves qué herramienta se usó y cuántos resultados dio. Las acciones que salen del panel (enviar por WhatsApp, agendar o cancelar visitas, ofertas) esperan siempre a que pulses "Confirmar".',
      tags: ['inmo', 'asistente', 'ia', 'inteligencia artificial', 'datos', 'confirmar'],
    },
    {
      id: 'faq-comms-window',
      question: 'En Comunicaciones no me deja escribir a un cliente: dice que sólo puedo enviar una plantilla, ¿por qué?',
      answer:
        'Es una regla de WhatsApp para todos los negocios, no de esta plataforma: sólo se puede escribir texto libre durante las 24 horas siguientes al último mensaje que ESE cliente os envió. Pasado ese tiempo (o si nunca os escribió), WhatsApp exige una plantilla aprobada por Meta. Registra tus plantillas en Configuración → Comunicaciones (a mano, o "Sincronizar desde Meta" si el número es de Meta) y envíalas desde el icono de plantilla del redactor; cuando el cliente responda, la ventana de 24 h vuelve a abrirse y podrás escribir con normalidad.',
      tags: ['comunicaciones', 'whatsapp', 'plantilla', 'ventana 24 horas', 'no me deja escribir'],
    },
    {
      id: 'faq-comms-connect',
      question: '¿Qué necesito para tener el WhatsApp de la agencia en el panel?',
      answer:
        'Un número de WhatsApp Business conectado por uno de los dos proveedores oficiales. Con Meta WhatsApp Cloud API: una cuenta de WhatsApp Business (WABA), el phone_number_id del número, un token de usuario del sistema y el App Secret de la app de Meta, y registrar en la app el webhook que muestra Configuración → Comunicaciones (campos "messages" y "calls"). Con Twilio: el Account SID, el Auth Token y un remitente de WhatsApp aprobado (o el sandbox para probar), con sus webhooks apuntando a las URL que muestra la misma pantalla. Además, quien administre la plataforma tiene que haber configurado la clave de cifrado COMMS_CREDENTIALS_ENCRYPTION_KEY en el Worker — Sistema → Estado del sistema lo indica. Las credenciales se guardan cifradas y no vuelven a mostrarse. Los pasos completos están en docs/communications.md.',
      tags: ['comunicaciones', 'whatsapp', 'conectar', 'meta', 'twilio', 'configuración'],
    },
    {
      id: 'faq-comms-web-reply',
      question: 'Me ha llegado un formulario o un chat de la web: ¿por qué no puedo responder por email (o por el chat)?',
      answer:
        'Un hilo web sólo se responde por un canal que exista de verdad para esa persona, y el redactor dice por qué falta cada uno: por email hace falta que dejara un email y que el email de la plataforma esté conectado (RESEND_API_KEY); por el chat, que escribiera por el chat y su sesión no haya caducado (30 días sin escribir); por WhatsApp, que dejara teléfono y la agencia tenga un número conectado. Si no hay ninguno, deja una nota interna y llámale si tienes su teléfono. Nunca se marca como enviado algo que no salió.',
      tags: ['comunicaciones', 'formulario', 'chat', 'email', 'responder', 'web'],
    },
    {
      id: 'faq-rendimiento-comercial',
      question: '¿Por qué un comercial sólo ve sus números en Rendimiento?',
      answer:
        'Porque cada comercial ve sólo lo suyo: si su usuario tiene permisos restringidos y está vinculado a su ficha de comercial («Usuario del panel» en la ficha), el dashboard le enseña únicamente sus leads, visitas, ofertas, operaciones y tareas. Los administradores sin restricciones y quien tiene escritura en Sistema ven toda la agencia. Si un usuario restringido no ve el dashboard, es que no está vinculado a ninguna ficha de comercial: vincúlalo desde la ficha del comercial.',
      tags: ['rendimiento', 'dashboard', 'comercial', 'permisos', 'oficina'],
    },
    {
      id: 'faq-comms-calls',
      question: '¿Puedo llamar por WhatsApp desde el panel?',
      answer:
        'Sólo con un número de Meta WhatsApp Cloud API que tenga las llamadas activadas (Configuración → Comunicaciones → "Activar" en la fila del número; Meta exige un límite de mensajería de al menos 2000 destinatarios al día) y sólo a contactos que hayan dado permiso ("Pedir permiso" en la ficha del contacto; el permiso temporal dura 7 días). Twilio no ofrece llamadas por WhatsApp para números españoles, y Meta no permite llamadas salientes a Estados Unidos, Canadá, Egipto, Vietnam ni Nigeria. Cuando no se puede llamar por WhatsApp, el botón "Llamar" marca con tu teléfono y te deja registrar la llamada con su resultado, que también cuenta en la ficha del cliente. Ninguna llamada se graba ni se transcribe.',
      tags: ['comunicaciones', 'whatsapp', 'llamadas', 'llamar', 'permiso'],
    },
    {
      id: 'faq-editor-propiedad-autoguardado',
      question: '¿El editor de propiedades guarda solo mientras escribo?',
      answer:
        'No. El editor de propiedades (tanto en "Propiedades (web)" como en "Propiedades 2ª mano") **no tiene autoguardado**: lo que escribes vive en el formulario hasta que pulsas "Guardar cambios" arriba a la derecha, "Crear propiedad" si es nueva, o "Finalizar ✓" en el último paso. Cambiar de paso NO guarda, pero tampoco pierde nada: los pasos mantienen lo escrito mientras no cierres la ficha. La cabecera te dice en todo momento si hay "Cambios sin guardar", y si intentas salir con algo pendiente el navegador te pide confirmación antes de descartarlo. Tres cosas sí se guardan por su cuenta, porque son listas propias y no campos de la ficha: el orden de la galería al arrastrar una imagen, y las tarjetas de "Planos", "Tipos de unidad" y "Redes sociales" al aceptar su ventana emergente.',
      tags: ['propiedades', 'editor', 'guardar', 'autoguardado', 'perder cambios'],
    },
    {
      id: 'faq-permisos-403',
      question: 'A un compañero le sale "No tienes permiso para acceder a esta sección", ¿qué hago?',
      answer:
        'Esa cuenta tiene permisos restringidos por área. Un super_admin puede revisarlos en Sistema → Usuarios, abriendo la ficha de esa persona: el bloque "Permisos" muestra si tiene "Acceso completo" o una lista de áreas con "Ver"/"Editar". Marca el área que necesita (por ejemplo "Finanzas & Growth" si tiene que emitir facturas) y guarda; el cambio se aplica en su siguiente acción, sin que tenga que volver a entrar. Ojo con dos casos que parecen lo mismo y no lo son: "Acceso completo" da permiso a todo, mientras que "Restringir a áreas concretas" sin ninguna casilla marcada deja la cuenta sin acceso a nada. Si el mensaje aparece al pulsar Guardar o Crear, lo que falta es "Editar" en esa área, no "Ver".',
      tags: ['permisos', 'usuarios', 'acceso', '403', 'seguridad', 'roles'],
    },
    {
      id: 'faq-unknown-domain-404',
      question: 'Mi web pública da 404 en un dominio nuevo, ¿por qué?',
      answer:
        'Un dominio solo sirve el catálogo de una inmobiliaria cuando está guardado en el campo "Dominio" de esa organización (solo lo puede editar super_admin, en Empresas) y ese mismo dominio ya está añadido como Custom Domain en Cloudflare y apuntando a este Worker. Si falta cualquiera de los dos pasos, la plataforma responde 404 en vez de mostrar el catálogo de otra inmobiliaria por error — es la protección que evita que un dominio mal configurado filtre datos de la organización equivocada. El panel de administración (/admin) sigue siendo accesible en cualquier dominio, precisamente para poder entrar y completar la configuración. Detalles en docs/multi-domain.md.',
      tags: ['dominio', 'multiagencia', 'seguridad', '404', 'dns'],
    },
    {
      id: 'faq-tenant-isolation',
      question: '¿Puede otra inmobiliaria de la plataforma ver mis datos?',
      answer:
        'No. Cada inmobiliaria es un inquilino aislado: todo lo que ves en el panel — catálogo, planos, galerías, leads, visitas, contratos, facturas, blog y documentos subidos — está filtrado por tu organización en el servidor, no en el navegador. Si alguien pidiera directamente el identificador de un registro de otra inmobiliaria, la plataforma responde "no encontrado", igual que si no existiera. Los documentos privados guardados en el almacenamiento (KYC de visitantes, PDF exportados, contratos firmados) exigen además comprobar que ese fichero es tuyo antes de servirlo.',
      tags: ['seguridad', 'privacidad', 'multitenant', 'organizacion'],
    },
    {
      id: 'faq-stats-scope',
      question: 'Los números del Dashboard y de Facturación son más bajos que antes, ¿se han perdido datos?',
      answer:
        'No se ha perdido nada. Esos contadores y los totales de Facturación mostraban por error datos de toda la plataforma en vez de solo los tuyos. Ahora reflejan únicamente tu organización, así que las cifras son más bajas pero por fin son las tuyas de verdad. Puedes comprobarlo: los listados de cada sección coinciden con el contador.',
      tags: ['dashboard', 'facturacion', 'analytics', 'seguridad'],
    },
    {
      id: 'faq-svg-blocked',
      question: 'Intento subir un logo en formato SVG y me da error, ¿por qué?',
      answer:
        'La subida de SVG está bloqueada temporalmente en toda la plataforma. Un SVG es XML con capacidad de incluir código (scripts, manejadores de eventos) y no existe todavía en la plataforma un sanitizador realmente fiable para neutralizarlo antes de guardarlo — permitirlo sin eso podría dejar pasar un archivo malicioso disfrazado de imagen. Usa PNG o WebP mientras tanto (ambos admiten fondo transparente, igual que un SVG); si necesitas convertir tu logo, cualquier editor de imágenes lo exporta a PNG en un paso.',
      tags: ['media', 'svg', 'logo', 'seguridad', 'subida'],
    },
    {
      id: 'faq-media-rejected',
      question: 'Mi imagen o PDF se rechaza al subirlo aunque el archivo parece normal, ¿qué está pasando?',
      answer:
        'La plataforma valida el contenido real del archivo, no solo su nombre o extensión: comprueba que los bytes correspondan de verdad al tipo declarado, que el archivo no esté truncado o corrupto, y en imágenes, que sus dimensiones reales no superen el máximo permitido (8000 px por lado). Un archivo renombrado (por ejemplo, un .html guardado como .pdf) o descargado a medias falla esta comprobación. Si tu archivo es legítimo y sigue fallando, vuelve a exportarlo desde el programa original y prueba de nuevo.',
      tags: ['media', 'subida', 'validacion', 'pdf', 'imagen'],
    },
    {
      id: 'faq-storage-quota',
      question: '¿Hay un límite de almacenamiento para los archivos que subo?',
      answer:
        'Sí, cada inmobiliaria tiene una cuota de almacenamiento (por defecto 5 GB) que cubre fotos, PDF de contratos, exportaciones del Asset Export Studio y documentos de visitantes. Si la superas, la subida se rechaza con un aviso indicando cuánto tienes usado — nunca se corta en silencio. Si necesitas más espacio, contacta con nosotros.',
      tags: ['media', 'cuota', 'almacenamiento', 'storage'],
    },
    {
      id: 'faq-property-video-source',
      question: 'Puse una URL de vídeo en una propiedad y ahora subí un archivo, pero la URL ya no aparece, ¿la perdí?',
      answer:
        'El campo «Vídeo» del paso «Multimedia» guarda una sola fuente (una URL externa de YouTube/Vimeo/enlace directo, o un archivo subido): al subir un archivo sustituye a la URL que hubiera antes (y viceversa). Si quieres varios vídeos, añádelos en «Galería y multimedia» → «Vídeos, tours, renders, PDF, drone y 360°»: ahí puedes tener todos los que necesites, con su título e idioma, y en la web salen todos.',
      tags: ['propiedades', 'video', 'multimedia', 'developer-properties'],
    },
    {
      id: 'faq-documento-quien-lo-ve',
      question: 'Subí la nota simple como «Propietario» pero el propietario dice que no la ve, ¿por qué?',
      answer:
        'Comprueba tres cosas: que esa persona figure como «Propietario» o «Copropietario» en el paso «Propietarios» de la propiedad (un inquilino o un apoderado no cuenta); que tenga una cuenta de rol «usuario» (Sistema → Usuarios) con exactamente el mismo email que su ficha de contacto, y que entre en «Mi cuenta» con ella; y que ni el documento ni la propiedad estén en la papelera. En la pestaña «Documentos» de su ficha de contacto ves qué documentos puede descargar y por qué.',
      tags: ['documentos', 'propiedades', 'permisos', 'mi cuenta'],
    },
    {
      id: 'faq-documento-acceso-sin-efecto',
      question: 'Di acceso a un comprador pero sigue sin poder descargar el documento',
      answer:
        'Un acceso concedido sólo cuenta si el documento es «Comprador autorizado» o «Público». Con «Interno» o «Propietario» el acceso se guarda pero no tiene efecto (el paso «Documentos» lo avisa en «Accesos»): cambia la visibilidad a «Comprador autorizado». El comprador lo descarga desde «Mi cuenta», con una cuenta cuyo email coincida con el de su contacto.',
      tags: ['documentos', 'compradores', 'permisos'],
    },
    {
      id: 'faq-documento-publico-no-sale',
      question: 'Marqué un documento como «Público» y no aparece en la web',
      answer:
        'Un documento público sólo se ofrece mientras la propiedad esté publicada (con fecha de publicación) y fuera de la papelera. Las propiedades de 2ª mano no tienen ficha en la web pública, así que sus documentos públicos sólo los ven sus propietarios y compradores autorizados.',
      tags: ['documentos', 'web', 'propiedades'],
    },
    {
      id: 'faq-foto-oculta-privada',
      question: '¿Qué diferencia hay entre una foto oculta, una privada y una no publicable?',
      answer:
        'Las tres dejan la foto fuera de la web pública y de lo que se envía a los portales. «Oculta» y «No publicable» sólo la apartan (la foto se sigue pudiendo abrir si alguien tiene el enlace); «Privada» además hace que el fichero sólo se pueda abrir entrando en el panel de tu agencia. Si la misma imagen es también la portada, sigue siendo pública mientras lo sea.',
      tags: ['multimedia', 'fotos', 'propiedades'],
    },
    {
      id: 'faq-360-no-aparece',
      question: 'Marqué «Tiene tour virtual» y en la web no sale la pestaña 360°',
      answer:
        'La pestaña 360° sólo aparece con un tour o una foto 360 reales: añade el enlace del tour (Matterport, Kuula…) o sube la foto 360 en «Galería y multimedia», o rellena «Enlace del tour virtual» en el paso «Multimedia». Antes la web simulaba el tour con la primera foto aunque no hubiera ninguno; ya no lo hace.',
      tags: ['multimedia', '360', 'tour virtual', 'web'],
    },
    {
      id: 'faq-property-location-privacy',
      question: 'Guardé la dirección exacta de una propiedad pero en la web pública no sale el número, ¿por qué?',
      answer:
        'Depende de "Privacidad de la ubicación" (sección Ubicación del editor). En "Exacta" se publica tal cual. En "Aproximada" el mapa público muestra una zona redondeada en vez del punto exacto, y el número/portal/bloque/planta/letra no se publican — solo el resto de la dirección (calle, urbanización, ciudad…). En "Ocultar número" el mapa sí es exacto, pero tampoco se publican esos mismos datos de portal. Es intencional, no un fallo: protege la dirección exacta de una propiedad que aún no quieres que cualquiera pueda encontrar puerta a puerta. Dentro del panel siempre ves la dirección completa, sea cual sea el modo — la redacción solo afecta a lo que sale en la ficha pública.',
      tags: ['propiedades', 'ubicacion', 'privacidad', 'mapa', 'direccion'],
    },
    {
      id: 'faq-contacto-vs-lead',
      question: '¿Qué diferencia hay entre un contacto, un lead y un cliente?',
      answer:
        'El contacto es la persona. El lead es una oportunidad concreta: la vez que esa persona preguntó por algo. El cliente es la relación comercial ya cerrada. María puede ser un contacto con tres leads (preguntó por tres pisos en meses distintos) y acabar siendo cliente: sigue siendo una sola persona.',
      tags: ['contactos', 'leads', 'clientes', 'crm'],
    },
    {
      id: 'faq-proxima-accion',
      question: '¿Puedo cambiar a mano la "próxima acción" de un lead?',
      answer:
        'No directamente — es un cálculo, no un campo editable. Es la tarea abierta o la cita futura más próxima de ese lead: para cambiarla, crea/completa/cancela una tarea (CRM → Tareas, o "+ Tarea" en su tarjeta) o mueve/cancela su cita en Calendario, y se recalcula sola. Se hizo así a propósito: si se pudiera escribir a mano, podría dejar de coincidir con lo que de verdad hay agendado.',
      tags: ['tareas', 'leads', 'crm', 'next action'],
    },
    {
      id: 'faq-tarea-borrada',
      question: 'He borrado una tarea por error, ¿se ha perdido?',
      answer:
        'No se borra de verdad: va a la papelera. Deja de verse en los listados, en la ficha de su operación y en la próxima acción de su lead, pero la fila se conserva y lo que ya ocurrió (que se creó, que se completó) sigue en la Actividad. Para recuperarla, en CRM → Tareas pulsa «Papelera», búscala y pulsa «Restaurar»: vuelve tal cual estaba (estado, fecha, responsable y relaciones) y vuelve a contar para la próxima acción de su lead. Tanto el borrado como la restauración quedan anotados en la Actividad con quién lo hizo.',
      tags: ['tareas', 'papelera', 'crm', 'restaurar', 'recuperar'],
    },
    {
      id: 'faq-operacion-papelera',
      question: '¿Por qué no puedo mandar una operación a la papelera?',
      answer:
        'Hay dos casos en los que no se puede, y el aviso dice cuál es. Una operación cerrada ya creó su apunte en Finanzas → «Cierres y comisiones» (y, en una venta de 2ª mano, marcó el inmueble como vendido): es historia de la agencia y esconderla dejaría una comisión sin la operación que la explica. Y una operación con reserva, arras o contrato vinculados: esos documentos siguen apuntando a ella, así que primero desvincúlalos en «Reserva, arras y contratos» de su ficha (las arras y los contratos sólo puede desvincularlos alguien con acceso a Finanzas). Una operación activa o cancelada sin documentos sí va a la papelera, y desde ahí se restaura tal cual (CRM → Operaciones → «Papelera» → «Restaurar»).',
      tags: ['operaciones', 'papelera', 'deal', 'restaurar', 'crm'],
    },
    {
      id: 'faq-cita-eliminar',
      question: 'He creado una cita por error, ¿cómo la quito? ¿Y por qué a veces no me deja eliminarla?',
      answer:
        '«Eliminar» (en su fila de Visitas → Lista o en su ficha) la manda a la papelera: desaparece de la agenda, del calendario, del iCal, de los recordatorios, del dashboard y de la próxima acción del lead, y su hueco queda libre para crear la cita buena a la misma hora. No se avisa al cliente, porque es para lo que nunca debió existir. Por eso no se puede eliminar —el aviso dice el motivo— cuando ya no es sólo un error interno: una parada de un tour (quítala desde la pestaña Tours), una cita ya realizada o en la que el cliente no se presentó, una con el resultado de la visita anotado, una que el cliente ya conoce (la confirmó desde su enlace o le llegó un aviso por email o WhatsApp) o una cuyo comprador ya tiene ofertas sobre ese inmueble. En esos casos, cancélala: queda con su motivo y se avisa al cliente. Si la eliminaste sin querer, Visitas → Lista → «Papelera» → «Restaurar» la devuelve como estaba.',
      tags: ['citas', 'visitas', 'papelera', 'eliminar', 'restaurar', 'crm'],
    },
    {
      id: 'faq-lead-borrar',
      question: '¿Cómo borro un lead que entró por error o duplicado?',
      answer:
        'Los leads no se borran: se marcan como perdidos con su motivo («Marcar como perdido» en la ficha, o arrastrándolo a la columna «Perdido»), por ejemplo «Duplicado», con un comentario si quieres. Así no se pierde por dónde llegó, quién lo trajo ni en qué fase estaba, y los informes de captación siguen cuadrando. Si en realidad es la misma persona que otro lead, al darlo de alta el panel ya te ofrece «Unificar con este». Un lead perdido se puede reactivar y vuelve a la fase exacta en la que estaba.',
      tags: ['leads', 'borrar', 'perdido', 'duplicado', 'crm'],
    },
    {
      id: 'faq-tarea-oficina',
      question: '¿De qué oficina es una tarea?',
      answer:
        'De la que elijas en su formulario; si lo dejas en «La de su responsable», de la oficina del comercial que la tiene asignada en cada momento (si cambias de responsable, la tarea le sigue). El filtro de oficina de CRM → Tareas y el KPI «Tareas vencidas» del dashboard comercial usan esa misma regla, así que siempre cuadran. Una tarea sin oficina propia y sin responsable no es de ninguna oficina.',
      tags: ['tareas', 'oficina', 'dashboard', 'crm'],
    },
    {
      id: 'faq-edicion-inline',
      question: '¿Cambiar el precio desde el listado deja histórico igual que desde la ficha?',
      answer:
        'Sí. La edición rápida de la fila (precio, estado y comercial en la vista Lista de Propiedades) guarda exactamente igual que el editor: un cambio real de precio añade una fila al «Histórico de precios» con quién lo cambió, y estado y comercial se validan y quedan en la auditoría. Volver a escribir el mismo precio no añade nada. Lo único que no se puede desde la fila es anotar el motivo del cambio de precio: para eso, cámbialo en la ficha (paso Precio, «Motivo del cambio de precio»).',
      tags: ['propiedad', 'precio', 'histórico', 'edición inline', 'listado'],
    },
    {
      id: 'faq-cliente-abrio-ficha',
      question: '¿Cómo sé si el cliente abrió la ficha que le envié?',
      answer:
        'Si se la enviaste por WhatsApp desde Comunicaciones y WhatsApp confirma la lectura, en la Actividad del contacto, del lead y de la propiedad aparece «El cliente abrió la ficha enviada». Es la única señal fiable que existe: las visitas a la web pública no se asocian a ninguna persona, así que no se registran. Por el mismo motivo no hay un evento «match encontrado»: las compatibilidades se calculan al momento y sólo queda constancia cuando alguien selecciona, descarta o envía una.',
      tags: ['actividad', 'whatsapp', 'crm', 'matching'],
    },
    {
      id: 'faq-oferta-historial',
      question: 'Al registrar una contraoferta, ¿se pierde el importe anterior?',
      answer:
        'No, nunca. Cada envío, contraoferta, nueva oferta o decisión queda como una fila propia en el historial de la oferta, con su importe, condiciones, financiación y vencimiento — no se sobrescribe nada. Lo que ves como "importe actual" es sólo la última; la negociación completa (quién ofreció qué y cuándo) está en el detalle de la oferta (CRM → Ofertas, o el panel «Ofertas» de la propiedad), en «Historial de la negociación».',
      tags: ['ofertas', 'negociación', 'crm'],
    },
    {
      id: 'faq-operacion-vs-operaciones-cerradas',
      question: '¿Por qué hay dos sitios que hablan de "operaciones"?',
      answer:
        'Son dos cosas distintas. CRM → Operaciones es el seguimiento de una operación mientras está en marcha: el Kanban por etapas desde la oferta aceptada hasta la firma, con su historial, tareas, citas, reserva, arras y contratos. Finanzas → «Cierres y comisiones» (la antigua pantalla «Operaciones», en la misma dirección de siempre) es el registro plano de ventas/alquileres ya cerrados, para calcular comisiones — y la fuente de Ingresos. Al cerrar una operación en CRM se crea sola su fila en «Cierres y comisiones» (con comisión en 0, a completar), así que no hay que registrarla dos veces.',
      tags: ['operaciones', 'deal', 'comisiones', 'crm'],
    },
    {
      id: 'faq-duplicados',
      question: 'Me avisa de un posible duplicado, ¿qué hago?',
      answer:
        'Si coincide el email o el teléfono, casi siempre es la misma persona: abre el contacto existente y añádele ahí la nueva necesidad o el nuevo lead. Si sólo coincide el nombre, el sistema lo marca como coincidencia débil — "García" y "García" suelen ser dos personas — y puedes crear el contacto igualmente. Nunca se fusiona nada automáticamente, porque unir a dos personas distintas por error no tiene arreglo fácil.',
      tags: ['contactos', 'duplicados', 'dedup'],
    },
    {
      id: 'faq-necesidad-vacia',
      question: 'En una necesidad, ¿qué pasa si dejo un campo en blanco?',
      answer:
        'Queda como "no especificado", que no es lo mismo que cero ni que un no. Si no pones precio máximo, no se entiende que el cliente no quiera pagar nada; si no marcas piscina, no se entiende que la rechace. Esa distinción es la que permite después cruzar necesidades con inmuebles sin descartar cosas por un dato que nadie llegó a preguntar.',
      tags: ['necesidades', 'buyer requirement'],
    },
    {
      id: 'faq-match-porcentaje',
      question: '¿De dónde sale el porcentaje de compatibilidad?',
      answer:
        'De una suma de pesos fija y pública, no de una IA. Cada criterio (precio, zona, dormitorios, superficie, características…) tiene un peso, y el porcentaje es lo obtenido sobre lo que se pudo comprobar. Por eso debajo del número siempre está el desglose línea a línea: si dos personas miran el mismo inmueble y la misma necesidad, ven exactamente el mismo resultado. Los imprescindibles no puntúan — o se cumplen, o descartan el inmueble.',
      tags: ['matching', 'compatibilidades', 'score'],
    },
    {
      id: 'faq-match-sin-dato',
      question: 'Pedí piscina como imprescindible y sale un piso del que no consta que la tenga. ¿Por qué?',
      answer:
        'Porque "no consta" no es "no la tiene". Si el inmueble se descartara por un dato que nadie ha rellenado, perderías operaciones por fichas incompletas. Sale marcado como "revisar" para que lo compruebes. En cuanto alguien pulsa "He repasado las características" en ese inmueble, lo que no esté marcado pasa a significar que de verdad no lo tiene, y entonces sí se descarta.',
      tags: ['matching', 'compatibilidades', 'datos'],
    },
    {
      id: 'faq-match-enviar',
      question: '¿Por qué no puedo marcar un match como "enviado"?',
      answer:
        'Porque marcarlo sin que exista un envío real convertiría el historial en algo que no se puede creer. "Enviado" lo pone el Centro de Comunicaciones cuando el WhatsApp sale de verdad (botón "Enviar propiedad"), "Visita" cuando anotas el resultado de una visita y "Ofertado" cuando se crea la oferta. A mano puedes seleccionar, descartar y recuperar, que son decisiones que sí tomas tú.',
      tags: ['matching', 'compatibilidades', 'estados'],
    },
    {
      id: 'faq-match-filtro-duro',
      question: 'Puse la zona como "preferible" y un piso en una zona excluida no aparece. ¿Por qué?',
      answer:
        'Porque una zona excluida es un veto: descarta el inmueble siempre, sea cual sea la importancia de la zona. Lo mismo pasa con la operación (comprar no es alquilar), con el precio cuando se pasa más de un 10 % del máximo y con el tipo de inmueble mientras sea imprescindible (lo es por defecto; bájalo a "preferible" si al cliente le valen otros tipos). Lo tienes resumido al final del editor de la necesidad, en "Qué filtra siempre".',
      tags: ['matching', 'necesidades', 'importancia'],
    },
    {
      id: 'faq-match-estado-no-consta',
      question: 'El comprador quiere un piso en buen estado y en el desglose sale "? Estado: no consta". ¿Qué hago?',
      answer:
        'Rellena el "Estado físico" del inmueble en su ficha (paso Características → Estado). El motor nunca supone que una vivienda está bien porque no diga lo contrario: hasta que el dato existe, la línea sale como "no consta" y, si el estado era imprescindible, el inmueble queda para "revisar" en vez de descartarse. Con "Reformado" pasa igual: se lee de "Reformado" y "Año de reforma" (paso Edificio y vivienda).',
      tags: ['matching', 'necesidades', 'estado'],
    },
    {
      id: 'faq-match-selecciones',
      question: '¿Dónde veo las selecciones que he creado para un cliente?',
      answer:
        'En su ficha: Contactos → la persona → pestaña "Necesidades", bloque "Selecciones", con las propiedades de cada una (enlazan a su ficha) y la necesidad de la que salieron. "Abrir" lleva a la vista de la selección, donde se reordena, se quitan o añaden propiedades y se envía entera por WhatsApp. Se crean con "Crear selección" desde cualquier compatibilidad (o marcando varias en "Buscar propiedades") y también las que prepara INMO.',
      tags: ['matching', 'selecciones', 'contactos'],
    },
    {
      id: 'faq-lead-source',
      question: '¿De dónde salen los leads que veo en el CRM?',
      answer:
        'Se crean automáticamente desde el formulario de contacto público, la reserva de una visita, el envío del programa de referidos, o la API pública (v1) si tienes una integración externa. También puedes crear uno manualmente desde Leads.',
      tags: ['leads', 'crm', 'referidos'],
    },
    {
      id: 'faq-lead-fase-vs-estado',
      question: 'En un lead, ¿qué diferencia hay entre su columna del Kanban y que esté "perdido"?',
      answer:
        'La columna es la fase: en qué punto del proceso está (nuevo, contactado, cualificando…, hasta ganado). "Perdido" es aparte, un resultado: se puede perder un lead desde cualquier fase, y al perderlo la tarjeta se va a la columna "Perdido" pero la fase en la que iba se queda guardada tal cual. Si luego lo recuperas, vuelve a esa fase — nunca se reinicia a "Nuevo".',
      tags: ['leads', 'pipeline', 'kanban', 'estados'],
    },
    {
      id: 'faq-lead-motivo-fase',
      question: '¿Por qué me pide un motivo cada vez que muevo un lead de fase?',
      answer:
        'Porque el historial de fases sólo sirve si explica por qué se movió: «Contactado» sin más no dice si hubo llamada o sólo un email. Al cambiar de fase (en la ficha, arrastrando en el Pipeline, en la Tabla o en bloque), al reactivar un lead perdido y al perderlo, se abre una ventana con motivos rápidos que puedes pulsar o cambiar; sin motivo no se guarda. Queda en la pestaña «Historial de fases» del lead con quién y cuándo.',
      tags: ['leads', 'pipeline', 'historial', 'motivo'],
    },
    {
      id: 'faq-lead-sin-asignar',
      question: 'Un lead nuevo se quedó sin comercial asignado, ¿por qué?',
      answer:
        'Porque ninguna regla de Enrutamiento aplicaba, o la que aplicaba apuntaba a un equipo (Departamento) sin nadie disponible en ese momento. Nunca se bloquea la creación del lead por eso: se queda en cola, sin dueño, y se reasigna a mano desde su ficha cuando quieras. Revisa CRM → Enrutamiento y SLA → "Gestionar reglas de enrutado" para añadir una regla de reparto general como red de seguridad.',
      tags: ['leads', 'enrutamiento', 'routing', 'asignacion'],
    },
    {
      id: 'faq-lead-idioma-enrutado',
      question: 'Tengo una regla por idioma y un lead en inglés no se le asignó, ¿por qué?',
      answer:
        'Mira el idioma en la ficha del lead (pestaña Datos). Los de la web llegan con el idioma que la persona eligió en la web o el de su navegador; los de la API, con el que mande la integración; los de WhatsApp, sin idioma (WhatsApp no lo informa). Si el lead no tiene idioma, la regla no puede aplicarse: ponlo en «Editar» y, si quieres, reasígnalo. Comprueba también la prioridad: una regla anterior que encaje (por ejemplo, la de su propiedad o un reparto general) gana antes.',
      tags: ['leads', 'enrutamiento', 'idioma'],
    },
    {
      id: 'faq-sla-alerta',
      question: 'Una alerta de SLA dice que un lead está "sin atender" pero ya le respondí, ¿por qué sigue abierta?',
      answer:
        'Las alertas se recalculan una vez por hora (el cron de SLA), así que puede tardar hasta esa siguiente pasada en resolverse sola. Si no puede esperar, márcala como resuelta a mano desde CRM → Enrutamiento y SLA.',
      tags: ['leads', 'sla', 'alertas'],
    },
    {
      id: 'faq-cita-tipo-vs-canal',
      question: 'En una visita, ¿qué diferencia hay entre "Tipo" y "Canal"?',
      answer:
        '"Tipo" es el PARA QUÉ: una visita a un inmueble o una llamada de seguimiento. "Canal" es el CÓMO: presencial, videollamada o teléfono. Son independientes — una visita a un inmueble puede hacerse por videollamada (un tour virtual) sin dejar de ser una visita.',
      tags: ['visitas', 'citas', 'tipo', 'canal'],
    },
    {
      id: 'faq-cita-confirmacion',
      question: 'Una cita "agendada" y una cita "confirmada" por el cliente, ¿son lo mismo?',
      answer:
        'No. "Agendada" es el estado interno: hay un hueco reservado en la agenda del comercial. "Confirmada" es que el propio cliente, desde su enlace de gestión, ha pulsado "Confirmar asistencia". Una cita puede estar agendada sin que el cliente la haya confirmado todavía — el ✓ verde junto al estado, en Visitas, es lo que distingue una de otra. Reprogramarla borra esa confirmación: ya no es la hora que el cliente había confirmado.',
      tags: ['visitas', 'citas', 'confirmacion'],
    },
    {
      id: 'faq-tour-paradas',
      question: 'Si cancelo una parada de un tour, ¿se cancela el tour entero?',
      answer:
        'No. Cada parada es una cita independiente — cancelarla, reprogramarla o marcarla como completada sólo afecta a esa parada; el resto del tour sigue igual. Un tour no tiene su propio estado: es simplemente la suma de sus paradas, así que no hay una acción "cancelar todo el tour". En Visitas → Tours, "Quitar" saca una parada de la ruta (su cita queda cancelada con el motivo); la última parada activa no se puede quitar, y si esa visita ya no se hace se cancela desde "Ver" → "Cancelar".',
      tags: ['visitas', 'tours', 'citas'],
    },
    {
      id: 'faq-tour-anadir-parada',
      question: 'El cliente quiere ver otro piso el mismo día del tour. ¿Tengo que crear un tour nuevo?',
      answer:
        'No: en Visitas → Tours pulsa "+ Parada" en ese tour. Elige el inmueble (obra nueva o 2ª mano), el comercial y la duración, y si va "Al final de la ruta" (al acabar la última parada activa más el desplazamiento) o a una hora concreta. Se comprueba la agenda del comercial, hereda el cliente, el lead y el contacto del tour, y se avisa al cliente.',
      tags: ['visitas', 'tours', 'paradas'],
    },
    {
      id: 'faq-seleccion-enviar',
      question: '¿Puedo enviarle a un cliente todas las propiedades de una selección de una vez?',
      answer:
        'Sí: abre la selección (ficha del contacto → Necesidades → Selecciones → "Abrir") y pulsa "Enviar selección por WhatsApp". Se le manda cada propiedad, en el orden de la selección, por la misma vía que "Enviar propiedad" — una ficha por mensaje, con foto y su nota. Si no tiene teléfono o tu agencia no tiene WhatsApp conectado, te lo dice y no se envía nada; si una falla (por ejemplo, porque la persona nunca os ha escrito y WhatsApp sólo admite plantillas), el envío se para ahí y la ventana dice cuáles salieron.',
      tags: ['selecciones', 'whatsapp', 'comunicaciones'],
    },
    {
      id: 'faq-resultado-visita',
      question: 'Anotar el resultado de una visita, ¿cambia algo en la ficha del inmueble o en las Necesidades del cliente?',
      answer:
        'No, nunca. El resultado es tu impresión de esa visita concreta — que a alguien no le convenciera la cocina no hace que el inmueble cambie de verdad, y que reaccionara de una forma en una visita no cambia lo que dice buscar en sus Necesidades. Por eso vive sólo en la propia visita, y se puede corregir cuando quieras sin que eso reescriba nada del catálogo ni del comprador.',
      tags: ['visitas', 'resultado', 'outcome'],
    },
    {
      id: 'faq-calendario-agenda-ajena',
      question: 'En el Calendario, ¿un comercial puede ver la agenda de otro?',
      answer:
        'Hoy sí, si tiene acceso de lectura al área CRM — igual que ya podía verlas en la pestaña Lista o en Tours. El panel todavía no tiene permisos por fila (solo por área), así que el filtro de Comercial es para organizar la vista, no una restricción de visibilidad.',
      tags: ['visitas', 'calendario', 'permisos', 'rbac'],
    },
    {
      id: 'faq-merge-contacto',
      question: 'Al fusionar dos contactos, ¿qué pasa con todo lo que tenían vinculado?',
      answer:
        'Pasa al contacto que sobrevive: leads, necesidades y compatibilidades, propiedades en las que figura como propietario o inquilino, roles, ofertas y operaciones, citas, tareas, notas, selecciones, accesos a documentos, etiquetas y campos personalizados. Si los dos eran propietarios de la misma propiedad queda una sola línea con el porcentaje de ambos sumado; si los dos tenían el mismo rol, etiqueta o acceso, queda uno. Un campo personalizado que ya tenía valor en el superviviente no se pisa. Su historial de actividad se ve en el contacto que queda, con una entrada "Contactos unificados". El duplicado no se borra, se archiva, y el registro de la fusión queda en el historial de acciones administrativas.',
      tags: ['contactos', 'duplicados', 'dedup', 'fusion'],
    },
    {
      id: 'faq-unificar-alta-contacto',
      question: 'Al crear un contacto me dice que ya existe. ¿Qué hace «Unificar»?',
      answer:
        'Completa el contacto que ya existe con lo que acabas de escribir y le falta —su WhatsApp, su teléfono, su id externo, su idioma…— y te lo abre, sin crear otro. Nunca cambia un dato que ya tenía (si escribiste otro email, se queda el suyo) ni le pone uno que ya sea de otra persona de tu agencia. En su pestaña Actividad queda qué se añadió. Si en realidad son dos personas distintas, usa «Crear igualmente»; si ya tienes dos fichas de la misma persona, únelas desde «Ficha y duplicados» → «Buscar duplicados».',
      tags: ['contactos', 'duplicados', 'unificar', 'alta'],
    },
    {
      id: 'faq-contract-signature',
      question: '¿La firma de los contratos es legalmente vinculante como una firma digital cualificada?',
      answer:
        'No. Es una firma electrónica simple: nombre escrito por el cliente + una casilla de aceptación + su IP y la fecha/hora quedan registradas. Es válida para acuerdos de bajo riesgo (reservas, arras) pero no es una firma cualificada eIDAS. Para contratos de alto riesgo, consulta con tu asesoría legal si necesitas un proveedor de firma cualificada.',
      tags: ['contratos', 'firma'],
    },
    {
      id: 'faq-stripe-not-connected',
      question: 'Al pedir un depósito me dice "no conectado", ¿qué significa?',
      answer:
        'Que el secreto de Stripe (STRIPE_SECRET_KEY) todavía no está configurado en tu Worker. La plataforma nunca simula un cobro que no ha ocurrido de verdad — te lo dice explícitamente en vez de fingir que el pago se ha iniciado. Contacta con nosotros para activarlo.',
      tags: ['depositos', 'pagos', 'stripe'],
    },
    {
      id: 'faq-email-sent-not-delivered',
      question: 'Un email dice "Enviado" en /admin/emails pero el destinatario dice que no le llegó, ¿qué pasa?',
      answer:
        '"Enviado" solo significa que Resend aceptó la petición — no que un buzón real la recibió. El estado pasa a "Entregado" (o "Rebotado"/"Reclamación") únicamente cuando Resend lo confirma de vuelta por webhook. Si un email lleva mucho tiempo en "Enviado" sin pasar a "Entregado", lo más probable es que el webhook de Resend no esté configurado en este Worker — contacta con nosotros para revisarlo (RESEND_WEBHOOK_SECRET). Mientras tanto, revisa también la carpeta de spam del destinatario: un email "Enviado" que nunca llega a la bandeja principal suele ser justamente lo que "Rebotado"/"Reclamación" existen para detectar, en cuanto el webhook esté activo.',
      tags: ['emails', 'resend', 'webhook', 'entregas'],
    },
    {
      id: 'faq-perdi-acceso-panel',
      question: 'He perdido el acceso al panel: dice "Credenciales inválidas" y estoy seguro de la contraseña.',
      answer:
        'Antes de nada, comprueba si el mensaje habla de "Demasiados intentos": el login bloquea 10 intentos por IP cada 10 minutos, y a partir de ahí **incluso la contraseña correcta falla**. Si es eso, no toques nada durante 10 minutos y entra una sola vez; el bloqueo se levanta solo. (Si la pantalla sigue diciendo "Credenciales inválidas" sin más en una instalación antigua, puede ser justo ese bloqueo disfrazado: se corrigió para que lo diga con claridad.) Si de verdad has perdido la contraseña, usa "¿Has olvidado tu contraseña?" para recibir el enlace de recuperación por email — para lo cual el envío de emails tiene que estar conectado, algo que puedes comprobar en Sistema → Estado del sistema. Y si el correo no está conectado y nadie puede entrar, quien administre la instalación puede recuperar el acceso con `npm run create-super-admin`, que reajusta la contraseña de una cuenta sin que esa contraseña pase por el repositorio ni por ningún registro.',
      tags: ['acceso', 'login', 'contraseña', 'bloqueo', 'super admin'],
    },
    {
      id: 'faq-email-channel-down',
      question: 'El Dashboard avisa de que "no están saliendo emails", ¿se ha perdido algo?',
      answer:
        'No. Cada intento de envío queda anotado en /admin/emails antes de salir, así que un fallo no borra nada: la fila se queda "En cola" y se reintenta sola hasta 5 veces con esperas crecientes. El aviso existe precisamente porque antes ese fallo solo se veía fila a fila y nadie lo miraba — las notificaciones se envían "por detrás" de un lead o un contrato, y si dejaban de salir la plataforma seguía funcionando como si nada. Entra en /admin/emails para ver el motivo exacto que devolvió Resend. Si dice que falta RESEND_API_KEY, no es un problema de tu agencia: el canal no está conectado en el Worker y lo tiene que configurar quien administra Cloudflare; en cuanto se conecte, los envíos en cola salen solos en el siguiente reintento.',
      tags: ['emails', 'resend', 'avisos', 'entregas', 'dashboard'],
    },
    {
      id: 'faq-stripe-webhook-not-updating',
      question: 'Un cliente dice que ya pagó pero el depósito sigue "En proceso", ¿qué hago?',
      answer:
        'Primero, pulsa "Comprobar estado" en esa fila — consulta directamente a Stripe y actualiza el depósito al momento si ya está pagado. Si sigue sin cambiar, revisa el historial de eventos de Stripe debajo de la lista: si no aparece ningún evento reciente, es que el webhook de Stripe (Dashboard → Developers → Webhooks) no está entregando a esta plataforma — contacta con nosotros para revisar la configuración (STRIPE_WEBHOOK_SECRET). Aun sin webhook, una tarea automática revisa cada hora los depósitos pendientes y los corrige, así que en el peor caso se resuelve solo dentro de esa hora.',
      tags: ['depositos', 'pagos', 'stripe', 'webhook'],
    },
    {
      id: 'faq-avm-no-data',
      question: 'El Tasador (AVM) me dice que no hay comparables suficientes, ¿por qué?',
      answer:
        'El tasador solo estima a partir de propiedades reales que ya tienes en tu propio catálogo, en la misma zona y tipo. Si tienes pocas propiedades en esa zona, no hay base suficiente y el sistema lo dice claramente en vez de inventar un precio.',
      tags: ['tasador', 'avm', 'valoracion'],
    },
    {
      id: 'faq-webhook-signature',
      question: '¿Cómo verifico que un webhook realmente viene de la plataforma?',
      answer:
        'Cada envío incluye una cabecera X-Webhook-Signature con una firma HMAC-SHA256 calculada con el secreto que se te mostró al crear el endpoint. Vuelve a calcular la firma en tu servidor con ese mismo secreto y compárala antes de confiar en el contenido.',
      tags: ['webhooks', 'seguridad'],
    },
    {
      id: 'faq-client-portal',
      question: '¿Cómo ve un cliente sus propias visitas, contratos y documentos?',
      answer:
        'Dale de alta una cuenta con rol "usuario" en Sistema → Usuarios, usando exactamente el mismo email con el que aparece en sus visitas/contratos y en su ficha de contacto. Al iniciar sesión en /login, se le redirige a "Mi cuenta", donde ve solo lo suyo: visitas, solicitudes, contratos y los documentos de propiedades que puede descargar (como propietario, por acceso concedido o porque son públicos).',
      tags: ['portal', 'clientes', 'usuarios'],
    },
    {
      id: 'faq-gdpr-delete',
      question: '¿Al "eliminar" datos RGPD se borran de verdad las filas?',
      answer:
        'No se borran, se anonimizan: el nombre, email, teléfono y notas se sustituyen por un marcador genérico. Así los contratos, operaciones o históricos que dependan de ese registro no se rompen, pero la persona deja de ser identificable.',
      tags: ['rgpd', 'privacidad'],
    },
    {
      id: 'faq-referral-reward',
      question: '¿Las recompensas del programa de referidos se pagan solas?',
      answer:
        'No, el pago o aplicación del descuento la gestionas tú fuera de la plataforma. El sistema solo lleva el seguimiento del estado (pendiente / convertido / recompensado) para que sepas a quién le debes qué.',
      tags: ['referidos'],
    },
    {
      id: 'faq-publicacion-canales',
      question: 'Publiqué una propiedad pero no aparece en Idealista/Fotocasa, ¿por qué?',
      answer:
        'Cada canal necesita sus propias credenciales conectadas. Revisa el histórico en Publicación multicanal: si el canal no está conectado, el sistema lo indica explícitamente en lugar de simular el envío.',
      tags: ['publicacion', 'canales', 'idealista', 'fotocasa'],
    },
    {
      id: 'faq-contact-support',
      question: 'Tengo un problema o una duda que no cubre esta guía, ¿qué hago?',
      answer: 'Escríbenos a hola@serendipiaagency.com contándonos qué intentabas hacer y, si puedes, una captura de pantalla. Te responderemos lo antes posible.',
      tags: ['soporte', 'contacto', 'ayuda'],
    },
    {
      id: 'faq-site-builder-publish',
      question: 'Edité la página de inicio en el Constructor Web pero la web pública no cambió, ¿por qué?',
      answer:
        'Los cambios en el Constructor Web se autoguardan como borrador, pero la web pública solo sirve la versión publicada. Pulsa "Publicar cambios" en la barra superior del editor para que se vean en el sitio real. Esto es intencional: puedes dejar cambios a medias sin miedo a que salgan en vivo por error.',
      tags: ['constructor web', 'site builder', 'portal web', 'publicar'],
    },
    {
      id: 'faq-site-builder-live-data',
      question: 'Cambié una propiedad y apareció sola en la landing sin tocar el Constructor Web, ¿es un error?',
      answer:
        'No, es el comportamiento esperado. Los bloques de Propiedades, Comunidades y Blog de la página de inicio no guardan una copia de esos datos — siempre muestran tus propiedades, comunidades y artículos reales y actuales. Solo necesitas volver a publicar en el Constructor Web si cambias textos, orden o ajustes de la propia página, nunca por cambios en el contenido en sí.',
      tags: ['constructor web', 'site builder', 'propiedades', 'sincronizacion'],
    },
    {
      id: 'faq-site-builder-dynamic-text',
      question: 'En el Constructor Web pulso el nombre de una propiedad y no me deja escribir, ¿por qué?',
      answer:
        'Porque ese nombre no es un texto de la página: es el dato real de la propiedad, y el bloque sólo lo muestra. Si lo convirtieras en texto fijo dejaría de actualizarse cuando cambies la propiedad. El panel te lo indica ("Contenido dinámico") y te lleva a la ficha en Propiedades (web) para cambiarlo. Lo que sí puedes cambiar desde el Constructor es cómo se ve — fuente, tamaño, color — y ese estilo se aplica a todas las tarjetas del bloque y se mantiene aunque cambies el nombre.',
      tags: ['constructor web', 'site builder', 'propiedades', 'dinámico', 'editar texto'],
    },
    {
      id: 'faq-site-builder-inline-edit',
      question: '¿Cómo cambio un título o una foto de la portada sin buscar el campo en el panel?',
      answer:
        'Púlsalo directamente en el lienzo del Constructor Web. Un clic selecciona el elemento y abre sus opciones a la derecha; doble clic sobre un texto te deja escribir ahí mismo (Enter confirma, Escape cancela); sobre una imagen, doble clic o "Cambiar imagen" abre la subida y la Biblioteca de medios. Los cambios se ven al instante y se autoguardan como borrador; la web pública cambia cuando pulses "Publicar cambios".',
      tags: ['constructor web', 'site builder', 'editar', 'título', 'imagen', 'doble clic'],
    },
    {
      id: 'faq-site-builder-restore',
      question: 'Publiqué la web y ha quedado mal, ¿puedo volver a como estaba antes?',
      answer:
        'Sí. En la barra superior del Constructor Web, el icono del reloj abre el "Historial de versiones publicadas": cada publicación anterior aparece con su fecha y quién la hizo. Pulsa "Restaurar" en la que quieras y volverá a tu borrador — ahí puedes revisarla y, cuando estés conforme, pulsar "Publicar cambios" para que sea la que vean tus visitantes. Hasta ese momento la web sigue mostrando lo que hay publicado ahora, así que restaurar nunca empeora la situación por sí solo.',
      tags: ['constructor web', 'site builder', 'historial', 'versiones', 'restaurar', 'publicar'],
    },
  ]

  const contact = {
    email: 'hola@serendipiaagency.com',
    note: 'Escríbenos si tienes dudas sobre cómo usar cualquier parte de la plataforma, o si encuentras algo que no funciona como esperabas.',
  }

  return { sections, faqs, contact }
}

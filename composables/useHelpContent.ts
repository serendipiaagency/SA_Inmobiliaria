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
      key: 'leads',
      group: 'CRM',
      title: 'Leads',
      route: '/admin/leads',
      summary: 'Pipeline Kanban de todos los contactos interesados: nuevo → contactado → cualificado → propuesta → ganado/perdido.',
      steps: [
        'Arrastra una tarjeta de columna para cambiar su estado (se guarda automáticamente).',
        'Haz clic en un lead para ver su origen (web, referido, llamada…), notas y datos de contacto.',
        'Los leads se crean solos desde el formulario público, las reservas de visita y el programa de referidos — no hace falta darlos de alta a mano salvo excepción.',
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
        'La ficha tiene cuatro pestañas. "Resumen" es su tablero: visitas, operaciones cerradas, volumen, propiedades relacionadas y actividad reciente. "Información" reúne todos los datos guardados. "Propiedades" muestra las viviendas vinculadas. "Actividad" es la cronología completa.',
        'Las propiedades relacionadas se leen del catálogo **en vivo**: si cambias el precio o la foto en Propiedades (web) o en Propiedades 2ª mano, la ficha del cliente lo refleja al instante, porque aquí no se guarda ninguna copia. Cada tarjeta indica por qué está relacionada (visita, operación, reserva o interés) y te lleva a la ficha original de la propiedad.',
        'El histórico de un cliente (sus visitas, operaciones, reservas y contratos) se cruza por su email, o por su nombre exacto si no tiene email. Rellenar el email hace ese cruce mucho más fiable: es lo que une a esa persona con todo lo demás.',
        '"Editar cliente" abre el mismo editor que usas para dar uno de alta, con validación y aviso de cambios sin guardar. "Nuevo cliente" está en el listado.',
        'Eliminar un cliente está en el menú "···", nunca como botón principal. Antes de confirmar te dice exactamente qué se conserva: sus visitas, operaciones, contratos y facturas NO se borran, porque son registros de la inmobiliaria, y tampoco se toca ninguna propiedad del catálogo. Si lo que quieres es archivar a alguien, cámbialo a "Inactivo" en vez de borrarlo.',
        'Para borrar los datos personales de una persona de todas las tablas (no sólo de su ficha) usa Sistema → RGPD, que los anonimiza sin destruir el histórico de operaciones.',
      ],
    },
    {
      key: 'visitas',
      group: 'CRM',
      title: 'Visitas',
      route: '/admin/visitas',
      summary: 'Agenda de citas con clientes: vista de calendario mensual, buffer entre citas y tope diario por comercial.',
      steps: [
        'Crea una visita manualmente o deja que se reserven solas desde la ficha pública del comercial.',
        'Cada visita genera un enlace de gestión propio para el cliente (cancelar/reprogramar sin necesidad de llamar).',
        'El feed iCal de cada comercial (botón "Suscribirse al calendario") permite verlas en Google Calendar u Outlook.',
        'Las videollamadas usan Jitsi Meet automáticamente si el canal de la cita es "vídeo" — no requiere configuración.',
        'Cada cita avisa al cliente por email y, si tiene teléfono, por WhatsApp (confirmación, recordatorios 24 h y 1 h antes, cancelación y cambios). El WhatsApp sale de verdad cuando la plataforma tiene conectado Twilio — Sistema → Estado del sistema lo dice; si no, el aviso queda registrado como "no conectado" y no se envía. El teléfono necesita prefijo internacional (+34…). Ojo a una regla de WhatsApp, no nuestra: fuera de las 24 h siguientes al último mensaje del cliente sólo se puede enviar con una plantilla aprobada, que quien administre la plataforma configura una vez (docs/whatsapp.md).',
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
      steps: [],
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
        'El listado busca por nombre, referencia (número), dirección, urbanización, ciudad, distrito o código postal a la vez — usa la "×" del buscador para limpiarlo. El botón "Filtros" abre un panel con precio, ubicación, tipo, dormitorios/baños y superficie, combinables entre sí; cada filtro activo aparece como una "chip" que puedes quitar individualmente, o usar "Limpiar filtros" para quitarlos todos.',
        'Ordena por más recientes/antiguas, precio (mayor o menor) o nombre (A-Z/Z-A). El botón de vista cambia entre cuadrícula (tarjetas con imagen, precio, ubicación y estado) y lista; la preferencia se recuerda en este navegador.',
        'Cada tarjeta tiene un menú "..." con Publicar/Despublicar, Duplicar (crea una copia editable con "(copia)" en el nombre) y Eliminar, además de los enlaces Editar y Vista previa.',
        'Al crear o editar una propiedad se abre el Property Editor: un editor por pasos (Información básica, Ubicación, Precio, Características, Descripción, Multimedia, Galería, Planos, Tipos de unidad, Redes sociales, Comercial/Inversión) en vez de un formulario largo. La pantalla tiene tres columnas: a la izquierda el progreso y la lista de pasos, en el centro el paso que estás rellenando (con "PASO n DE N" sobre el título) y a la derecha una vista previa de la ficha. Dentro de un paso con muchos campos, estos se agrupan bajo subtítulos (p. ej. "Identificación"/"Clasificación", "Dimensiones"/"Equipamiento"), y los grupos de casillas —el equipamiento, por ejemplo— se pulsan como etiquetas en vez de marcarse una a una.',
        'Navega entre pasos pulsando en la columna de la izquierda o con "← Anterior"/"Siguiente →" al final de cada uno; en el último paso el botón pasa a ser "Finalizar ✓", que guarda. En pantallas pequeñas la columna de pasos se convierte en una tira horizontal encima del formulario y las columnas laterales desaparecen para dejarle todo el ancho a los campos.',
        'Cada paso de la columna muestra su estado real: un check verde cuando sus campos obligatorios/recomendados están completos, y un número en rojo cuando faltan campos obligatorios (te dice cuántos). El porcentaje y la barra de progreso se calculan igual, sobre campos reales — no sobre pasos simplemente visitados.',
        'La vista previa de la derecha enseña lo que hay escrito **en ese momento**: cambia el precio o la imagen de portada y se actualiza al instante. No es una consulta aparte ni una copia guardada; si aún no hay imagen, lo dice en vez de enseñar un hueco roto.',
        'La cabecera muestra el estado real de la propiedad y si hay cambios sin guardar. **Este editor no guarda solo**: los cambios viven en el formulario hasta que pulsas "Guardar cambios" (o "Crear propiedad" la primera vez). Si intentas salir con algo sin guardar, te avisa antes de perderlo.',
        'Los desplegables enseñan el texto en castellano ("Obra nueva", "En construcción", "Lista", "Venta", "Alquiler"…), no el valor interno que guarda la base de datos.',
        'Si tu cuenta solo tiene permiso de lectura sobre el Portal Web, la ficha se abre igual pero en modo consulta: un aviso lo indica, los campos aparecen deshabilitados y no hay botón de guardar. Puedes recorrer todos los pasos y leerlo todo.',
        'La sección "Ubicación" tiene los campos de dirección (país, ciudad, calle y número, urbanización, bloque, portal, piso, letra, código postal, distrito) junto a un mapa interactivo: pulsa "Buscar dirección en el mapa" para situar el marcador automáticamente a partir de esos campos, y luego arrástralo o haz clic para ajustar la posición exacta a mano — la posición del marcador es siempre la que se guarda, aunque la búsqueda automática no encuentre nada.',
        'El "Plan de pagos" (sección Precio) se edita como una lista visual de fases (concepto, porcentaje/importe, descripción) que puedes añadir, editar, arrastrar para reordenar o eliminar — ya no se edita como JSON.',
        'El vídeo (sección Multimedia) admite una URL externa (YouTube, Vimeo o enlace directo) o subir un archivo propio (mp4/webm, hasta 100 MB) con barra de progreso; solo una de las dos fuentes está activa a la vez — al guardar una sustituye a la otra.',
        'La "Galería" admite varias imágenes: arrastra una miniatura para reordenarla (el nuevo orden se guarda solo) y usa "Usar como portada" para marcar cuál se muestra como imagen principal. "Planos" y "Tipos de unidad" se gestionan como una cuadrícula de tarjetas visuales (miniatura de imagen cuando la hay, o un icono si todavía no tiene una) — pulsa "+ Añadir" o "Editar" sobre una tarjeta para abrir su formulario en una ventana emergente, con "Eliminar" también disponible dentro.',
        'Los campos de descripción larga (Descripción, Descripción del master plan, de los planos y del mapa de ubicación) tienen un editor de texto enriquecido: negrita, cursiva, listas y enlaces, con el resultado publicado tal cual en la ficha pública — no hace falta escribir HTML a mano.',
        '"Redes sociales" usa "+ Añadir red social": elige la plataforma (Instagram, Facebook, LinkedIn, TikTok, YouTube, X/Twitter, Pinterest, WhatsApp, Telegram…) y luego su URL; arrastra para reordenar o pulsa el icono de papelera para quitarla.',
        'La sección "Comercial/Inversión" incluye el selector "Comercial asignado" — busca en tu equipo de Comerciales y muestra su foto/iniciales, nombre y cargo; "Sin asignar" la deja sin comercial. Marca "Exclusiva" o "Reservada" para que aparezca destacada o bloqueada en la web.',
        'El estado (nueva / en construcción / lista) se refleja en la ficha pública automáticamente.',
      ],
    },
    {
      key: 'site-builder',
      group: 'Portal Web',
      title: 'Constructor Web',
      route: '/admin/site-builder',
      summary: 'Editor visual de la página de inicio de tu web pública — arrastra, edita y reordena secciones sin tocar código.',
      steps: [
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
        'Los bloques de Propiedades, Comunidades y Blog siempre muestran tus datos reales y actuales — en su pestaña "Contenido" puedes elegir un criterio automático (más recientes, destacadas, por comunidad o tipo…) o seleccionar propiedades/comunidades concretas a mano; en ambos casos se siguen leyendo en vivo, nunca se copian.',
        'Si un bloque muestra una imagen, gestiónala desde su pestaña "Contenido": subir, sustituir, elegir desde la Biblioteca de medios o eliminar — sin salir del editor. Los cambios se ven al instante en el lienzo, sin necesidad de guardar primero.',
        'Cambia entre Escritorio/Tablet/Móvil arriba para comprobar cómo se ve en cada tamaño real.',
        'Los cambios se autoguardan como borrador (verás "Guardando…"/"Guardado" junto al título, arriba a la izquierda). El sitio público no cambia hasta que pulses "Publicar cambios" — mientras haya cambios sin publicar, el botón lo indica con un punto de aviso.',
        'Deshacer/Rehacer (las flechas junto al selector de zoom, o Ctrl/Cmd+Z y Ctrl/Cmd+Mayús+Z) solo cubren la sesión actual del editor.',
        'Cada vez que publicas se guarda una copia de la página. El icono del reloj ("Historial de versiones publicadas", en la barra superior) las lista de la más reciente a la más antigua, con la fecha, quién publicó, cuántas secciones tenía y cuál es la que está ahora mismo en la web. Pulsa "Restaurar" en cualquiera de ellas para recuperarla.',
        'Restaurar una versión NO la publica: la copia sobre tu borrador para que la revises primero, y la web pública sigue mostrando lo mismo que antes hasta que pulses "Publicar cambios". Ojo: al restaurar, el borrador actual se sustituye — si tenías cambios sin publicar los pierdes, aunque puedes recuperarlos con Deshacer (Ctrl/Cmd+Z) sin salir del editor.',
        'El icono "Abrir sitio publicado" de la barra superior lleva al dominio propio de tu organización — si todavía no tienes uno asignado en Empresas (Sistema → Empresas), el icono aparece deshabilitado hasta que lo configures.',
      ],
    },
    {
      key: 'properties',
      group: 'Portal Web',
      title: 'Propiedades 2ª mano',
      route: '/admin/properties',
      summary: 'Catálogo separado para propiedades de segunda mano/reventa (no promociones de obra nueva).',
      steps: [
        'El listado busca por referencia, dirección, ciudad, distrito o código postal a la vez, con filtros de precio, venta/alquiler, tipo, ubicación, dormitorios/baños y superficie — igual que en "Propiedades (web)". Cada filtro activo aparece como una "chip" que puedes quitar, y el botón de vista alterna entre cuadrícula y lista (se recuerda en este navegador).',
        'Usa exactamente el mismo Property Editor — el mismo componente, no una copia — por pasos que "Propiedades (web)": Información básica, Ubicación, Precio, Características, Descripción, Multimedia, Galería, Planos, Redes sociales y Comercial/Inversión. Crear y editar abren el mismo editor; las tres columnas (progreso, formulario, vista previa), el estado de cada paso, el porcentaje, el guardado manual con aviso al salir y el comportamiento en móvil son idénticos — son el mismo código. Lo único que cambia entre los dos catálogos son los pasos y los campos que cada uno declara.',
        'Desde la actualización de paridad, este catálogo tiene los mismos campos opcionales que Propiedades (web): año de construcción y puntos clave (Información básica); precio anterior y plan de pagos opcional (Precio); orientación, calificación energética y equipamiento — ascensor, piscina, garaje, terraza, jardín, mascotas, accesible (Características); fotos adicionales — aérea, nocturna, antes/después, con staging IA (Multimedia); y exclusiva/reservada/tour virtual, rentabilidad estimada y gastos de comunidad (Comercial/Inversión). Solo falta "Tipos de unidad": esa sección es una lista de tipologías de un desarrollo con varias unidades en construcción y no aplica a una vivienda de reventa individual.',
        'La sección "Ubicación" incluye los mismos campos de dirección granular y el mapa interactivo (buscar dirección, arrastrar el marcador) que Propiedades (web). Si la propiedad ya tenía una dirección en el campo de texto libre anterior, se conserva como "Referencia de ubicación (heredado)" — no se pierde, y puedes rellenar los campos nuevos cuando quieras.',
        'La sección "Multimedia" admite vídeo por URL (YouTube, Vimeo o enlace directo) o subida de archivo (incluida la subida por partes para vídeos grandes), igual que Propiedades (web); "Galería" admite arrastrar para reordenar y "Usar como portada" para marcar la imagen principal.',
        '"Planos" funciona igual que en Propiedades (web): una cuadrícula de tarjetas visuales donde añades o editas cada plano (categoría, tipo de unidad, imagen…) en una ventana emergente — útil si la vivienda de reventa tiene un plano disponible, aunque no sea obligatorio.',
        '"Redes sociales" funciona igual que en Propiedades (web): "+ Añadir red social", elige la plataforma (Instagram, Facebook, LinkedIn, TikTok, YouTube, X/Twitter, Pinterest, WhatsApp, Telegram…), arrastra para reordenar o elimínala.',
        'La sección "Comercial / Inversión" tiene el mismo selector "Comercial asignado" (foto/iniciales, nombre, cargo) que Propiedades (web), más las marcas de exclusiva/reservada/tour virtual y los datos de inversión (rentabilidad estimada, gastos de comunidad).',
        'La descripción se edita en inglés y árabe desde la sección "Descripción" (son las traducciones que ve el público, no hay un texto en un idioma único) — es la única diferencia real de contenido frente a Propiedades (web). Cada idioma tiene el mismo editor de texto enriquecido (negrita, cursiva, listas, enlaces) que el resto de descripciones largas del constructor.',
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
      summary: 'Piezas individuales (PDF) ya generadas a partir de una plantilla y una propiedad concreta.',
      steps: ['El QR de cada pieza se valida automáticamente al generarla — si no seria legible, el sistema bloquea la descarga en vez de entregar un archivo roto.'],
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
      summary: 'Un único PDF-catálogo con portada, índice y varias propiedades combinadas.',
      steps: [],
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
      title: 'Operaciones',
      route: '/admin/operaciones',
      summary: 'Registro de ventas y alquileres cerrados, con cálculo automático de comisión por comercial.',
      steps: [
        'Pulsa "Registrar operación", indica cliente, tipo (venta/alquiler), valor y porcentaje de comisión.',
        'La comisión se calcula sola; márcala como "pagada" cuando la liquides con el comercial.',
        'Estos datos alimentan directamente el panel de Ingresos.',
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
      group: 'Finanzas & Growth',
      title: 'Automatizaciones',
      route: '/admin/automatizaciones',
      summary: 'Reglas del tipo "cuando pase X, haz Y" (por ejemplo, asignar automáticamente un lead nuevo a un comercial).',
      steps: [],
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
      summary: 'Integraciones y extensiones disponibles para la plataforma.',
      steps: [],
    },
    {
      key: 'api',
      group: 'Finanzas & Growth',
      title: 'API',
      route: '/admin/api',
      summary: 'Claves de API para integrar tu catálogo y tus leads con herramientas externas (API v1 pública).',
      steps: ['Genera una clave con permiso de lectura o escritura según lo que necesite la integración externa.'],
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
      steps: [],
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
      summary: 'Historial real de los emails transaccionales que envía la plataforma (leads, citas, contratos, depósitos, contraseñas…) vía Resend.',
      steps: [
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
      summary: 'Solo super_admin. El registro de todas las inmobiliarias (tenants) de la plataforma: nombre, dominio propio, marca, email y estado.',
      steps: [
        'El campo "Dominio" es el que decide qué inmobiliaria se sirve en cada web pública — ver docs/multi-domain.md para los pasos completos en Cloudflare (Custom Domains) antes de guardarlo aquí.',
        'Guarda el dominio exactamente como lo usará el visitante (con o sin "www." da igual, se trata como el mismo dominio).',
        'No se puede usar un *.workers.dev ni "localhost" como dominio de una empresa — esos hosts ya están reservados para la organización por defecto.',
        'Sin un dominio propio asignado aquí, la organización solo es accesible por su propio admin — no aparece en ninguna web pública.',
        'Los campos "Email — …" configuran desde qué dirección envía esta organización sus emails y quién recibe las notificaciones internas (nuevo lead, mensaje de contacto…) — ver docs/resend-email.md para los pasos de verificación de dominio en Resend. "Dominio verificado" es de solo lectura: se recalcula solo, nunca se marca a mano.',
        'Los campos "Legal — …" (razón social, CIF/NIF, dirección, email y teléfono) son el responsable del tratamiento real de esta organización y aparecen en sus páginas públicas de Privacidad y Términos (/privacidad, /terminos) — mientras estén vacíos, esas páginas muestran "Por confirmar" en su lugar.',
      ],
    },
  ]

  const faqs: HelpFaq[] = [
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
        'Es el comportamiento esperado: una propiedad solo puede tener una fuente de vídeo activa a la vez (una URL externa de YouTube/Vimeo/enlace directo, o un archivo subido), para evitar que queden dos vídeos contradictorios guardados. Al subir un archivo, sustituye a la URL que hubiera antes (y viceversa). Si necesitas volver a la URL anterior, tendrás que volver a introducirla en la pestaña "URL externa".',
      tags: ['propiedades', 'video', 'multimedia', 'developer-properties'],
    },
    {
      id: 'faq-lead-source',
      question: '¿De dónde salen los leads que veo en el CRM?',
      answer:
        'Se crean automáticamente desde el formulario de contacto público, la reserva de una visita, el envío del programa de referidos, o la API pública (v1) si tienes una integración externa. También puedes crear uno manualmente desde Leads.',
      tags: ['leads', 'crm', 'referidos'],
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
      question: '¿Cómo ve un cliente sus propias visitas y contratos?',
      answer:
        'Dale de alta una cuenta con rol "usuario" en Sistema → Usuarios, usando exactamente el mismo email con el que aparece en sus visitas/contratos. Al iniciar sesión en /login, se le redirige a "Mi cuenta", donde ve solo lo suyo.',
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

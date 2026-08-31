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
      summary: 'Ficha de cada cliente ya convertido, con su histórico de interacción.',
      steps: ['Usa el buscador superior para localizar un cliente por nombre, email o teléfono.'],
    },
    {
      key: 'visitas',
      group: 'CRM',
      title: 'Visitas',
      route: '/admin/visitas',
      summary: 'Agenda de citas con clientes: vista de calendario mensual, buffer entre citas y tope diario por agente.',
      steps: [
        'Crea una visita manualmente o deja que se reserven solas desde la ficha pública del agente.',
        'Cada visita genera un enlace de gestión propio para el cliente (cancelar/reprogramar sin necesidad de llamar).',
        'El feed iCal de cada agente (botón "Suscribirse al calendario") permite verlas en Google Calendar u Outlook.',
        'Las videollamadas usan Jitsi Meet automáticamente si el canal de la cita es "vídeo" — no requiere configuración.',
      ],
    },
    {
      key: 'citas-analytics',
      group: 'CRM',
      title: 'Analítica de citas',
      route: '/admin/citas-analytics',
      summary: 'No-shows, ocupación por agente y conversión de cita a venta.',
      steps: ['Revisa la ocupación por agente para detectar quién tiene hueco para más visitas.'],
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
      summary: 'Programa de recomendación: cada cliente o agente recibe un enlace propio para recomendar la inmobiliaria.',
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
        'Al crear o editar una propiedad se abre el Property Builder: un editor por secciones numeradas (Información básica, Ubicación, Precio, Características, Descripción, Multimedia, Galería, Planos, Tipos de unidad, Redes sociales, Comercial/Inversión) en vez de un formulario largo — navega entre ellas por la barra lateral (o las pestañas, en pantallas pequeñas), o con "← Anterior"/"Siguiente →" al final de cada sección. Dentro de una sección con muchos campos (Información básica, Precio, Características, Multimedia), estos se agrupan bajo subtítulos (p. ej. "Identificación"/"Clasificación", "Dimensiones"/"Equipamiento") para que sea más fácil de escanear.',
        'Cada sección de la barra lateral muestra su estado real: un check verde cuando sus campos obligatorios/recomendados están completos, un punto rojo (ámbar si es la sección que estás editando) cuando falta un campo obligatorio. El porcentaje y la barra de progreso de la cabecera de cada sección se calculan igual, sobre campos reales — no sobre secciones simplemente visitadas.',
        'La cabecera muestra si hay cambios sin guardar y el estado real de la propiedad; guarda con el botón "Guardar" cuando quieras.',
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
        'Los bloques de Propiedades, Comunidades y Blog siempre muestran tus datos reales y actuales — en su pestaña "Contenido" puedes elegir un criterio automático (más recientes, destacadas, por comunidad o tipo…) o seleccionar propiedades/comunidades concretas a mano; en ambos casos se siguen leyendo en vivo, nunca se copian.',
        'Si un bloque muestra una imagen, gestiónala desde su pestaña "Contenido": subir, sustituir, elegir desde la Biblioteca de medios o eliminar — sin salir del editor. Los cambios se ven al instante en el lienzo, sin necesidad de guardar primero.',
        'Cambia entre Escritorio/Tablet/Móvil arriba para comprobar cómo se ve en cada tamaño real.',
        'Los cambios se autoguardan como borrador (verás "Guardando…"/"Guardado" junto al título, arriba a la izquierda). El sitio público no cambia hasta que pulses "Publicar cambios" — mientras haya cambios sin publicar, el botón lo indica con un punto de aviso.',
        'Deshacer/Rehacer (las flechas junto al selector de zoom, o Ctrl/Cmd+Z y Ctrl/Cmd+Mayús+Z) solo cubren la sesión actual del editor.',
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
        'Usa exactamente el mismo Property Builder — el mismo componente, no una copia — por secciones numeradas que "Propiedades (web)": Información básica, Ubicación, Precio, Características, Descripción, Multimedia, Galería, Planos, Redes sociales y Comercial/Inversión. Crear y editar abren el mismo constructor; el estado de cada sección (completa/pendiente), el porcentaje de progreso, el guardado y el responsive funcionan exactamente igual que en Propiedades (web) — son el mismo código.',
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
      route: '/admin/agents',
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
        'La agenda de disponibilidad para citas (horario semanal, vacaciones) sigue gestionándose desde "Equipo" (Contenido → Equipo) — el paso "Información profesional" enlaza directamente a "Configurar horario" en vez de duplicar ese calendario.',
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
      summary: 'Registro de ventas y alquileres cerrados, con cálculo automático de comisión por agente.',
      steps: [
        'Pulsa "Registrar operación", indica cliente, tipo (venta/alquiler), valor y porcentaje de comisión.',
        'La comisión se calcula sola; márcala como "pagada" cuando la liquides con el agente.',
        'Estos datos alimentan directamente el panel de Ingresos.',
      ],
    },
    {
      key: 'ingresos',
      group: 'Finanzas & Growth',
      title: 'Ingresos',
      route: '/admin/ingresos',
      summary: 'Dashboard de ingresos y comisiones, agregado por mes y por agente a partir de las operaciones reales registradas.',
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
      summary: 'Reglas del tipo "cuando pase X, haz Y" (por ejemplo, asignar automáticamente un lead nuevo a un agente).',
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
    {
      key: 'team',
      group: 'Contenido',
      title: 'Equipo',
      route: '/admin/team',
      summary: 'Página pública "Sobre nosotros" con las fichas del equipo.',
      steps: [],
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
      summary: 'Cuentas de acceso al panel (rol admin) y cuentas de cliente (rol usuario) que pueden entrar a "Mi cuenta".',
      steps: ['Crea una cuenta con rol "usuario" y el mismo email que un cliente para que pueda ver sus propias visitas y contratos desde /mi-cuenta.'],
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
      ],
    },
    {
      key: 'emails',
      group: 'Sistema',
      title: 'Emails',
      route: '/admin/emails',
      summary: 'Historial real de los emails transaccionales que envía la plataforma (leads, citas, contratos, depósitos, contraseñas…) vía Resend.',
      steps: [
        'El estado solo pasa a "Entregado" cuando Resend lo confirma — "Enviado" únicamente significa que Resend aceptó la petición, no que llegó a un buzón real.',
        '"Rebotado" y "Reclamación" también los confirma Resend por webhook, nunca se marcan por adelantado.',
        'Un envío fallido se reintenta automáticamente (hasta 5 veces, con espera creciente) antes de marcarse "Fallido" de forma definitiva.',
        'El destinatario, la plantilla y el tipo (transaccional o comercial) de cada fila corresponden exactamente a lo que se envió — nada se resume ni se inventa.',
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
      steps: [],
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
  ]

  const contact = {
    email: 'hola@serendipiaagency.com',
    note: 'Escríbenos si tienes dudas sobre cómo usar cualquier parte de la plataforma, o si encuentras algo que no funciona como esperabas.',
  }

  return { sections, faqs, contact }
}

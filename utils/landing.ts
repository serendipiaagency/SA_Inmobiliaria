/**
 * La landing comercial de INMO (pages/index.vue en el host principal): su
 * contenido en un solo sitio, para que las secciones (components/landing/*)
 * lo pinten y las pruebas lo vigilen. Todo lo que afirma sale de lo que la
 * plataforma hace de verdad hoy (docs/landing.md): nada de clientes, cifras,
 * premios ni capacidades inventadas; lo que no está terminado lleva su estado.
 *
 * Rediseño «Experiencia premium» (2026-10): composición, color (azul sobre
 * blanco), tipografía (Inter) y fotografía del sitio de referencia, sin
 * antetítulos, con el Constructor Web y el CRM como protagonistas, las
 * funcionalidades en desplegables y fotografía de propiedades de lujo y de
 * equipo. El flujo real (demo, registro y acceso) y los estados honestos se
 * conservan intactos.
 */

export interface LandingNavItem {
  label: string
  href: string
}

/** Enlaces del menú: a secciones de esta misma página. Sin «Precios»: no hay planes publicados. */
export const LANDING_NAV: LandingNavItem[] = [
  { label: 'Producto', href: '#producto' },
  { label: 'Constructor Web', href: '#constructor-web' },
  { label: 'CRM', href: '#crm' },
  { label: 'Funcionalidades', href: '#funcionalidades' },
  { label: 'Cómo funciona', href: '#como-funciona' },
]

/** Las acciones reales, con el mismo nombre en toda la página. */
export const LANDING_CTA = {
  register: { label: 'Crear mi inmobiliaria', to: '/registro-empresa' },
  demo: { label: 'Solicitar demo', to: '#solicitar-demo' },
  login: { label: 'Iniciar sesión', to: '/admin/login' },
} as const

/**
 * Fotografía de ambiente (propiedades de lujo y equipo). No representa
 * inmuebles del catálogo de INMO; sirve para dar protagonismo visual.
 * Archivos propios en /public/landing (la CSP sólo admite imágenes propias).
 */
export type LandingPhotoKey = 'villa' | 'interior' | 'vivienda' | 'equipo' | 'equipo-oficina'

export interface LandingPhoto {
  src: string
  alt: string
  width: number
  height: number
}

export const LANDING_PHOTOS: Record<LandingPhotoKey, LandingPhoto> = {
  villa: { src: '/landing/villa.webp', alt: 'Villa contemporánea de lujo con piscina al atardecer', width: 1600, height: 1068 },
  interior: { src: '/landing/interior.webp', alt: 'Salón luminoso con diseño interior elegante', width: 1400, height: 1050 },
  vivienda: { src: '/landing/vivienda.webp', alt: 'Vivienda de diseño con amplios espacios y mucha luz', width: 1400, height: 933 },
  equipo: { src: '/landing/equipo.webp', alt: 'Profesionales inmobiliarios revisando la ficha de una vivienda', width: 1400, height: 933 },
  'equipo-oficina': { src: '/landing/equipo-oficina.webp', alt: 'Profesionales estrechándose la mano en una reunión de trabajo', width: 1600, height: 1067 },
}

export const LANDING_HERO = {
  /** Tres líneas; la última, en acento. Sin antetítulo. */
  title: ['Tu inmobiliaria.', 'Todo conectado.', 'Otro nivel.'],
  subtitle: 'Una web que atrae y un CRM que conecta. Tus propiedades, tu equipo y cada oportunidad, en el mismo lugar.',
  note: 'Tu web. Tu marca. Tu espacio.',
  /** Acción principal: la demo real. Secundaria: el registro real. Más un ancla para explorar. */
  primary: { label: 'Solicitar demo', to: '#solicitar-demo' },
  secondary: { label: 'Crear mi inmobiliaria', to: '/registro-empresa' },
  explore: { label: 'Explora la plataforma', to: '#constructor-web' },
  /** Galería del hero: propiedades de lujo que se alternan con transición suave. */
  stack: [
    { photo: 'villa' as LandingPhotoKey, label: 'Espacios que inspiran.' },
    { photo: 'interior' as LandingPhotoKey, label: 'Detalles que marcan la diferencia.' },
    { photo: 'vivienda' as LandingPhotoKey, label: 'Propiedades con otra perspectiva.' },
  ],
  floatCard: { title: 'De una propiedad a una oportunidad.', text: 'Web y gestión, siempre conectadas.' },
} as const

export interface LandingStripLink {
  key: string
  label: string
  href: string
}

/** Cinta de módulos bajo el hero: una plataforma, cada enlace a su sección. */
export const LANDING_STRIP_INTRO = 'Una plataforma. Toda tu inmobiliaria.'
export const LANDING_MODULES: LandingStripLink[] = [
  { key: 'web', label: 'Web propia', href: '#constructor-web' },
  { key: 'crm', label: 'CRM inmobiliario', href: '#crm' },
  { key: 'properties', label: 'Propiedades', href: '#propiedades' },
  { key: 'journey', label: 'Visitas y operaciones', href: '#como-funciona' },
]

/** Introducción: menos herramientas, más inmobiliaria. */
export const LANDING_INTRO = {
  title: ['Menos herramientas.', 'Más inmobiliaria.'],
  text: 'La información fluye desde tu catálogo hasta tu web y tu equipo comercial. Sin volver a introducir los mismos datos en cada paso.',
  cta: { label: 'Todo lo que puedes hacer', to: '#funcionalidades' },
} as const

export const LANDING_BUILDER = {
  title: ['Una web a la altura', 'de tus propiedades.'],
  subtitle: 'Con el Constructor Web, tu identidad se convierte en una experiencia. Personaliza el diseño y conecta tu escaparate con tu catálogo.',
  stageTitle: 'Tu marca. Tu diseño. Tu web.',
  tabs: [
    { key: 'editor', label: 'Editor visual', shot: 'constructor' },
    { key: 'web', label: 'Web publicada', shot: 'web-portada' },
  ],
  /** Tres pasos numerados (el porqué, no promesas). */
  steps: [
    { title: 'Hazla tuya.', text: 'Textos, imágenes, colores y estilos. Tu identidad en cada detalle.' },
    { title: 'Actualiza una vez.', text: 'La información de tus propiedades alimenta tu web, sin duplicar el trabajo.' },
    { title: 'Cuida cada pantalla.', text: 'Una experiencia adaptada a escritorio, tablet y móvil.' },
  ],
  cta: { label: 'Descubre el Constructor Web', to: '#solicitar-demo' },
} as const

export const LANDING_CRM = {
  title: ['Cada contacto cuenta.', 'Que ninguno se pierda.'],
  subtitle: 'Tu CRM inmobiliario reúne consultas, contactos y próximos pasos. Cada comercial sabe dónde está cada oportunidad y cómo hacerla avanzar.',
  contextTitle: ['De la primera consulta', 'a la próxima visita.'],
  /** Microdemo de tres pasos reales; al elegir uno cambia el texto y el aviso. */
  steps: [
    { label: 'Recibe la consulta', desc: 'Cada formulario crea un lead real, con su contacto y su historial.', noticeTitle: 'Consulta recibida', noticeText: 'El inicio de una nueva oportunidad.' },
    { label: 'Asigna un comercial', desc: 'Lo asignas tú, o lo hace una regla de reparto por zona, idioma u horario.', noticeTitle: 'Comercial asignado', noticeText: 'Cada contacto, con su responsable.' },
    { label: 'Prepara la visita', desc: 'Programa la cita y conserva el resultado junto a la próxima acción.', noticeTitle: 'Próximo paso: visita', noticeText: 'La conversación sigue avanzando.' },
  ],
  footer: ['Contactos e historial', 'Responsables y equipo', 'Seguimiento comercial', 'Próxima acción'],
  cta: { label: 'Conoce el CRM inmobiliario', to: '#solicitar-demo' },
} as const

export const LANDING_PROPERTIES = {
  title: ['Grandes propiedades.', 'Una gestión impecable.'],
  subtitle: 'Obra nueva y segunda mano, en un mismo editor. Información, multimedia, documentación y estado comercial, siempre a mano.',
  /** Seis puntos reales de la gestión de propiedades. */
  benefits: [
    'Información centralizada',
    'Obra nueva y segunda mano',
    'Multimedia y documentación',
    'Publicación conectada con la web',
    'Filtros y búsqueda',
    'Estado comercial y disponibilidad',
  ],
  /** Galería de propiedades de lujo (fotografía de ambiente). */
  gallery: [
    { photo: 'villa' as LandingPhotoKey, caption: 'Un escaparate que despierta interés.' },
    { photo: 'interior' as LandingPhotoKey, caption: 'Cada detalle, bien presentado.' },
    { photo: 'vivienda' as LandingPhotoKey, caption: 'Toda la información, en su lugar.' },
  ],
  footnote: 'Fotografía de ambiente. Las imágenes no representan inmuebles del catálogo de INMO.',
} as const

export const LANDING_TEAM = {
  title: ['La tecnología conecta.', 'Tu equipo hace', 'que suceda.'],
  text: 'Más contexto en cada conversación. Más coordinación en cada visita. Un espacio compartido para acompañar a tus clientes de principio a fin.',
  photos: ['equipo' as LandingPhotoKey, 'equipo-oficina' as LandingPhotoKey],
  cta: { label: 'Pon a tu equipo en sintonía', to: '#crm' },
} as const

export type LandingFeatureState = 'available' | 'with-ai' | 'with-provider' | 'soon'

export interface LandingFeature {
  text: string
  state?: LandingFeatureState
}

export interface LandingFeatureGroup {
  key: string
  title: string
  intro: string
  icon: string
  items: LandingFeature[]
}

export const LANDING_FEATURE_STATE_LABEL: Record<LandingFeatureState, string> = {
  available: 'Disponible',
  'with-ai': 'Con IA activada',
  'with-provider': 'Con proveedor configurado',
  soon: 'Próximamente',
}

/**
 * Todo lo que incluye INMO hoy, módulo a módulo (ocho áreas, en desplegables).
 * Cada punto corresponde a una pantalla real del panel (utils/adminNav.ts) y a
 * su entrada en la ayuda in-app (composables/useHelpContent.ts); lo que depende
 * de un proveedor o de la IA lo dice, y lo que no está terminado lleva su estado.
 */
export const LANDING_FEATURES: LandingFeatureGroup[] = [
  {
    key: 'web', title: 'Web y marketing', icon: 'builder',
    intro: 'La web de tu inmobiliaria, hecha y publicada desde el panel, con todo lo que la alimenta.',
    items: [
      { text: 'Constructor Web visual: páginas, bloques, cabecera y pie, estilos globales y Brand Kit' },
      { text: 'Catálogo público con buscador, filtros, mapa y fichas con galería, planos, eficiencia energética y contacto' },
      { text: 'Dominio propio (lo activamos contigo) y vista previa antes de publicar' },
      { text: 'Blog y CMS: artículos por bloques, categorías, etiquetas, autores, comentarios y redirecciones' },
      { text: 'Suscriptores: formulario «Suscríbete» con consentimiento, bajas y exportación' },
      { text: 'Widgets embebibles (buscador y formulario) para otras webs' },
      { text: 'Piezas gráficas y catálogos: plantillas, exportación masiva y catálogos combinados' },
      { text: 'Publicación en portales y redes: el programador existe; la conexión con cada canal llegará canal a canal', state: 'soon' },
    ],
  },
  {
    key: 'properties', title: 'Propiedades', icon: 'properties',
    intro: 'Una ficha completa para obra nueva y segunda mano, conectada con la web y con el CRM.',
    items: [
      { text: 'Obra nueva y segunda mano con el mismo editor: datos, superficies, estancias, características por contexto' },
      { text: 'Multimedia y documentación por propiedad, historial de precios y estado comercial' },
      { text: 'Búsqueda avanzada con filtros guardados, vistas compartidas y acciones masivas' },
      { text: 'Campos personalizados y etiquetas propias de tu inmobiliaria' },
      { text: 'Comunidades y zonas, comerciales responsables y papelera con restauración' },
      { text: 'Exportación a CSV y API pública para integrar tu catálogo' },
    ],
  },
  {
    key: 'crm', title: 'CRM y clientes', icon: 'crm',
    intro: 'Cada consulta es un lead real, con su contacto, su historial y su siguiente paso.',
    items: [
      { text: 'Leads con pipeline por etapas, origen, idioma y prioridad' },
      { text: 'Contactos 360º: roles (comprador, vendedor, propietario), notas, etiquetas y actividad' },
      { text: 'Necesidades del comprador y compatibilidades con tu catálogo (matching)' },
      { text: 'Reparto automático por oficina, idioma u horario y tiempos de respuesta (SLA)' },
      { text: 'Puntuación explicable de cada lead, por reglas que tú defines' },
      { text: 'Fusión segura de contactos duplicados y programa de referidos' },
    ],
  },
  {
    key: 'agenda', title: 'Agenda y operaciones', icon: 'agenda',
    intro: 'Del primer contacto a la firma: visitas, tareas, ofertas y operaciones en un mismo hilo.',
    items: [
      { text: 'Visitas y citas con tipos, recordatorios, tours de varias viviendas y resultado de cada visita' },
      { text: 'Reservas de unidades sobre plano desde la web pública' },
      { text: 'Tareas y «siguiente acción» en cada lead, contacto, propiedad y operación' },
      { text: 'Ofertas y operaciones por etapas (lista y kanban), cierres y comisiones' },
      { text: 'Contratos a partir de plantillas con aceptación online del cliente' },
      { text: 'Cobro de señales y fianzas con Stripe Checkout', state: 'with-provider' },
    ],
  },
  {
    key: 'comms', title: 'Comunicaciones', icon: 'mail',
    intro: 'Lo que dice y recibe tu equipo, en una bandeja y con el remitente de tu empresa.',
    items: [
      { text: 'Bandeja unificada: formularios web, chat de la web, correo y llamadas, cada hilo con su lead' },
      { text: 'Emails transaccionales con la identidad y el dominio de tu empresa (verificación guiada)' },
      { text: 'WhatsApp y llamadas desde el panel', state: 'with-provider' },
      { text: 'Avisos internos al equipo y notificaciones a tus propios sistemas (webhooks)' },
    ],
  },
  {
    key: 'team', title: 'Equipo y control', icon: 'users',
    intro: 'De una persona a varias oficinas, con permisos claros y rastro de todo.',
    items: [
      { text: 'Comerciales, oficinas y equipos; comerciales visibles en la web' },
      { text: 'Usuarios con permisos por área y plantillas de permisos' },
      { text: 'Verificación en dos pasos y auditoría de cada acción' },
      { text: 'Dashboard por comercial, rendimiento comercial y analítica de citas' },
    ],
  },
  {
    key: 'intelligence', title: 'Inteligencia y automatización', icon: 'intelligence',
    intro: 'Herramientas que trabajan sobre tus datos reales; las que necesitan IA lo dicen.',
    items: [
      { text: 'Automatizaciones: reglas que crean tareas, avisan al equipo o mueven un lead' },
      { text: 'Analítica de la web y del embudo comercial' },
      { text: 'Tasador orientativo a partir de comparables de tu propio catálogo' },
      { text: 'Asistente INMO: pregunta por propiedades, clientes y citas y prepara tareas que tú confirmas', state: 'with-ai' },
      { text: 'AI Studio: descripciones y textos de marketing asistidos', state: 'with-ai' },
    ],
  },
  {
    key: 'data', title: 'Datos y seguridad', icon: 'lock',
    intro: 'Cada empresa en su espacio; tus datos son tuyos.',
    items: [
      { text: 'Aislamiento por empresa en todo el sistema y dominio propio por agencia' },
      { text: 'RGPD: exportación y borrado de los datos de una persona, consentimientos registrados' },
      { text: 'Copias de seguridad automáticas antes de cada despliegue' },
      { text: 'API v1 con claves propias y marketplace de integraciones honesto: lo que conecta hoy y lo que no' },
    ],
  },
]

export interface LandingStep {
  key: string
  title: string
  text: string
  shot: LandingShotKey
}

export const LANDING_STEPS: LandingStep[] = [
  { key: 'add', title: 'Añade una propiedad', text: 'Registra los datos, las imágenes y la documentación del inmueble.', shot: 'propiedad-panel' },
  { key: 'publish', title: 'Publícala en tu web', text: 'El catálogo alimenta la web pública de tu inmobiliaria.', shot: 'web-portada' },
  { key: 'inquiry', title: 'Recibe una consulta', text: 'El formulario crea un lead y abre la conversación.', shot: 'web-contacto' },
  { key: 'contact', title: 'Gestiona el contacto', text: 'La consulta llega al CRM; asigna un responsable y conserva el contexto.', shot: 'crm' },
  { key: 'visit', title: 'Organiza una visita', text: 'Coordina la cita con tu equipo y prepara el seguimiento.', shot: 'agenda' },
  { key: 'deal', title: 'Avanza con la operación', text: 'Continúa el proceso comercial y registra los próximos pasos.', shot: 'operaciones' },
]

/** Opciones del formulario «Solicitar demo»: las mismas en la landing y en el servidor (server/utils/demoRequests.ts). */
export const LANDING_DEMO_FORM = {
  teamSizes: [
    { value: 'solo', label: 'Trabajo solo/a' },
    { value: '2-5', label: '2 a 5 personas' },
    { value: '6-15', label: '6 a 15 personas' },
    { value: '16+', label: 'Más de 15 personas' },
  ],
  interests: [
    { value: 'web', label: 'Tener una web profesional' },
    { value: 'crm', label: 'Organizar contactos y consultas' },
    { value: 'properties', label: 'Gestionar y publicar propiedades' },
    { value: 'team', label: 'Coordinar al equipo y las visitas' },
    { value: 'all', label: 'Verlo todo' },
  ],
} as const

/** Cierre y solicitud de demo: lo que pasa después de escribir, sin promesas que no se cumplan. */
export const LANDING_REQUEST = {
  title: 'Tu próxima etapa empieza aquí.',
  text: 'Cuéntanos cómo trabaja tu inmobiliaria y te enseñamos INMO con un caso parecido al tuyo.',
  steps: [
    { title: 'Entendemos tu operación actual', text: 'Catálogo, leads, equipo, canales y objetivos.' },
    { title: 'Preparamos una demo con contexto', text: 'No enseñamos pantallas sueltas: enseñamos un flujo.' },
    { title: 'Definimos la ruta de implantación', text: 'Sin perder datos ni interrumpir el negocio.' },
  ],
  form: {
    badge: 'Respuesta por correo en días laborables',
    title: 'Hablemos de tu inmobiliaria.',
    submit: 'Solicitar mi demo',
    footnote: 'Sin compromiso. Una primera conversación con contexto.',
  },
  signature: { name: 'Serendipia Agency', email: 'info@serendipiaagency.com' },
} as const

export interface LandingFaq {
  q: string
  a: string
}

export const LANDING_FAQ: LandingFaq[] = [
  { q: '¿Qué es INMO?', a: 'Una plataforma para gestionar tu inmobiliaria desde un solo lugar: tu web, tus propiedades, tus contactos y clientes, la agenda de visitas, las ofertas y operaciones, y la comunicación con tu equipo. Cada inmobiliaria tiene su espacio, sus datos y su marca.' },
  { q: '¿Necesito conocimientos técnicos para crear mi web?', a: 'No. El Constructor Web es visual: pulsas un texto, una imagen o una sección y la cambias ahí mismo; eliges colores y tipografías, añades secciones de una biblioteca y publicas cuando estés conforme. Las propiedades se publican solas desde tu gestión.' },
  { q: '¿Puedo gestionar propiedades de obra nueva y segunda mano?', a: 'Sí, con el mismo editor para ambas: ficha completa, multimedia, documentación, historial de precios y estado comercial. Hoy la web pública enseña el catálogo de obra nueva; la ficha pública de segunda mano está en desarrollo.' },
  { q: '¿Puedo trabajar con varios comerciales?', a: 'Sí. Da de alta a tu equipo con permisos por área, organízalo en oficinas y equipos, asigna responsables a propiedades y leads, y reparte las consultas con reglas (por zona, idioma u horario) si quieres automatizarlo.' },
  { q: '¿Qué ocurre con las consultas recibidas desde mi web?', a: 'Cada formulario crea un lead real en tu CRM, abre un hilo en Comunicaciones y, si lo configuras, avisa por correo a tu equipo. Desde ahí lo asignas, agendas la visita y sigues cada paso con su historial.' },
  { q: '¿Puedo utilizar mi propio dominio?', a: 'Sí. Tu web puede servirse en tu dominio; la activación la hacemos contigo (no es autoservicio todavía) y, mientras tanto, la ves en vista previa.' },
  { q: '¿Puedo importar mis propiedades y contactos?', a: 'Todavía no hay un importador automático de archivos: hoy los datos se dan de alta desde el panel y se pueden exportar en CSV. Si tienes un catálogo grande, cuéntanoslo en la demo.' },
  { q: '¿Cuáles son los planes y precios?', a: 'Los planes y precios todavía no están publicados. Consúltanos las condiciones en una demo personalizada, sin compromiso. El soporte se ofrece desde la ayuda del panel y por correo.' },
  { q: '¿Existe una demostración?', a: 'Sí: pide una demo desde esta página y te la enseñamos con tu caso. No hay acceso público a la cuenta de demostración, para que nadie pueda tocar lo que no es suyo.' },
  { q: '¿Cómo funciona el registro de empresa?', a: 'Rellenas el nombre de tu empresa, tu correo y una contraseña, y aceptas las condiciones. La cuenta se crea al momento y activa; entras con tu correo en el acceso del panel y empiezas con un espacio vacío, listo para tus datos.' },
]

export const LANDING_FOOTER = {
  description: 'Tu web, tus propiedades y tus clientes. Una forma más conectada de trabajar.',
  columns: [
    { title: 'Producto', links: [{ label: 'Funcionalidades', href: '#funcionalidades' }, { label: 'Constructor Web', href: '#constructor-web' }, { label: 'CRM', href: '#crm' }, { label: 'Cómo funciona', href: '#como-funciona' }] },
    { title: 'Acceso', links: [{ label: 'Iniciar sesión', href: '/admin/login' }, { label: 'Crear mi inmobiliaria', href: '/registro-empresa' }, { label: 'Solicitar demo', href: '#solicitar-demo' }] },
    { title: 'Contacto', links: [{ label: 'info@serendipiaagency.com', href: 'mailto:info@serendipiaagency.com' }] },
    { title: 'Legal', links: [{ label: 'Privacidad', href: '/privacidad' }, { label: 'Términos', href: '/terminos' }, { label: 'Cookies', href: '/cookies' }] },
  ],
} as const

export type LandingShotKey = 'panel' | 'constructor' | 'web-portada' | 'crm' | 'propiedad-panel' | 'ficha-publica' | 'web-contacto' | 'agenda' | 'operaciones' | 'movil'

export interface LandingShot {
  src: string
  alt: string
  width: number
  height: number
}

/**
 * Capturas reales del producto, tomadas de la cuenta de demostración (datos
 * sintéticos) con scripts/capturas-landing.mjs y servidas desde /public (la
 * CSP sólo admite imágenes propias). Si falta alguna, la sección enseña su
 * marco vacío con el aviso, nunca una pantalla inventada.
 */
export const LANDING_SHOTS: Record<LandingShotKey, LandingShot> = {
  panel: { src: '/landing/panel.webp', alt: 'Panel de INMO: menú lateral, resumen del día, propiedades, clientes y actividad comercial de la cuenta de demostración', width: 1440, height: 900 },
  constructor: { src: '/landing/constructor.webp', alt: 'Constructor Web de INMO: panel de estructura a la izquierda, lienzo con la web en el centro e inspector a la derecha', width: 1440, height: 900 },
  'web-portada': { src: '/landing/web-portada.webp', alt: 'Portada de la web pública de una inmobiliaria creada con INMO, con su buscador', width: 1440, height: 900 },
  crm: { src: '/landing/crm.webp', alt: 'CRM de INMO: listado de leads con su etapa, responsable y siguiente paso', width: 1440, height: 900 },
  'propiedad-panel': { src: '/landing/propiedad-panel.webp', alt: 'Editor de una propiedad en INMO: datos, precio, multimedia, documentación y comercial responsable', width: 1440, height: 900 },
  'ficha-publica': { src: '/landing/ficha-publica.webp', alt: 'Ficha pública de una propiedad en la web de la inmobiliaria: galería, precio, características y contacto', width: 1440, height: 900 },
  'web-contacto': { src: '/landing/web-contacto.webp', alt: 'Formulario de contacto de la web pública que crea el lead en el CRM', width: 1440, height: 900 },
  agenda: { src: '/landing/agenda.webp', alt: 'Agenda de visitas y citas del equipo en INMO', width: 1440, height: 900 },
  operaciones: { src: '/landing/operaciones.webp', alt: 'Operaciones en INMO: ofertas y operaciones por etapa', width: 1440, height: 900 },
  movil: { src: '/landing/movil.webp', alt: 'La web pública de una inmobiliaria creada con INMO en un móvil', width: 390, height: 844 },
}

/** Palabras que la landing no puede decir (promesas que la plataforma no cumple hoy). Lo vigila test/unit/landing.test.ts. */
export const LANDING_FORBIDDEN_CLAIMS = ['Mapbox', 'Idealista', '6 canales', 'gratis para siempre', 'sin tarjeta', 'Serendipia Score', 'migramos tu catálogo', 'Editor · Agente']

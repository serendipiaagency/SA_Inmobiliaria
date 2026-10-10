/**
 * La landing comercial de INMO (pages/index.vue en el host principal): su
 * contenido en un solo sitio, para que las secciones (components/landing/*)
 * lo pinten y las pruebas lo vigilen. Todo lo que afirma sale de lo que la
 * plataforma hace de verdad hoy (docs/landing.md): nada de clientes, cifras,
 * premios ni capacidades inventadas; lo que no está terminado lleva su
 * estado.
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
  { label: 'Funcionalidades', href: '#inteligencia' },
  { label: 'Cómo funciona', href: '#como-funciona' },
]

/** Las dos acciones, con el mismo nombre en toda la página. */
export const LANDING_CTA = {
  register: { label: 'Crear mi inmobiliaria', to: '/registro-empresa' },
  demo: { label: 'Solicitar demo', to: '#solicitar-demo' },
  login: { label: 'Iniciar sesión', to: '/admin/login' },
} as const

export const LANDING_HERO = {
  eyebrow: 'La nueva forma de gestionar tu inmobiliaria',
  title: ['Tu inmobiliaria,', 'toda conectada.'],
  subtitle: 'Gestiona propiedades, clientes, visitas, operaciones y tu propia web desde una única plataforma.',
  secondary: { label: 'Ver demo', to: '#demo' },
  /** Tarjetas flotantes alrededor del panel: demostrativas, nunca actividad real. */
  floats: [
    { key: 'lead', eyebrow: 'Nueva consulta recibida', text: 'Desde el formulario de tu web' },
    { key: 'published', eyebrow: 'Propiedad publicada', text: 'Visible en tu web al instante' },
    { key: 'visit', eyebrow: 'Visita programada', text: 'En la agenda del comercial' },
    { key: 'assigned', eyebrow: 'Cliente asignado', text: 'Con su responsable y su siguiente paso' },
  ],
} as const

export interface LandingModule {
  key: string
  title: string
  text: string
  href: string
}

/** «Todo lo que necesitas…»: seis tarjetas, cada una hacia su sección. */
export const LANDING_MODULES: LandingModule[] = [
  { key: 'builder', title: 'Constructor Web', text: 'Crea y personaliza la web de tu inmobiliaria.', href: '#constructor-web' },
  { key: 'properties', title: 'Gestión de propiedades', text: 'Organiza y publica tus inmuebles desde un único panel.', href: '#propiedades' },
  { key: 'crm', title: 'CRM inmobiliario', text: 'Centraliza contactos, clientes y oportunidades.', href: '#crm' },
  { key: 'agenda', title: 'Agenda y visitas', text: 'Coordina citas y actividades comerciales.', href: '#como-funciona' },
  { key: 'deals', title: 'Operaciones', text: 'Gestiona el seguimiento de ofertas y operaciones.', href: '#como-funciona' },
  { key: 'intelligence', title: 'Inteligencia inmobiliaria', text: 'Aprovecha las herramientas inteligentes disponibles para trabajar con más información.', href: '#inteligencia' },
]

export const LANDING_BUILDER = {
  title: 'Tu web inmobiliaria. Diseñada por ti.',
  subtitle: 'Crea una web profesional, personaliza su diseño y mantén tus propiedades actualizadas desde INMO.',
  benefits: [
    { title: 'Diseño visual', text: 'Edita textos, imágenes, secciones y estilos.' },
    { title: 'Tu identidad', text: 'Adapta la web a los colores y personalidad de tu inmobiliaria.' },
    { title: 'Propiedades conectadas', text: 'La información publicada procede de la gestión de propiedades.' },
    { title: 'Adaptada a todos los dispositivos', text: 'Una experiencia cuidada en escritorio, tablet y móvil.' },
  ],
  tabs: [
    { key: 'editor', label: 'Editor', shot: 'constructor' },
    { key: 'web', label: 'Web publicada', shot: 'web-portada' },
  ],
  cta: { label: 'Descubre el Constructor Web', to: '#demo' },
} as const

export const LANDING_CRM = {
  title: 'Cada oportunidad, bajo control.',
  subtitle: 'Organiza tus contactos, recibe consultas, coordina a tu equipo y sigue cada oportunidad desde un único espacio.',
  benefits: [
    { title: 'Todos tus contactos conectados', text: 'Centraliza la información comercial.' },
    { title: 'Seguimiento de oportunidades', text: 'Consulta el estado de cada lead.' },
    { title: 'Equipo coordinado', text: 'Asigna responsables y organiza actividades.' },
    { title: 'Más continuidad comercial', text: 'Mantén un historial de interacciones y próximos pasos.' },
  ],
  /** La secuencia real: el formulario crea el lead; asignar, agendar y seguir lo hace el equipo (con reglas de reparto si las configura). */
  flow: ['Consulta recibida', 'Lead creado', 'Comercial asignado', 'Visita agendada', 'Seguimiento'],
} as const

export const LANDING_PROPERTIES = {
  title: 'Tus propiedades, organizadas y listas para publicar.',
  subtitle: 'Gestiona la información de cada inmueble y conecta su publicación con tu web inmobiliaria.',
  benefits: [
    'Información centralizada',
    'Obra nueva y segunda mano',
    'Multimedia y documentación',
    'Publicación conectada con la web',
    'Filtros y búsqueda',
    'Estado comercial y disponibilidad',
  ],
  tabs: [
    { key: 'panel', label: 'Panel de gestión', shot: 'propiedad-panel' },
    { key: 'public', label: 'Ficha pública', shot: 'ficha-publica' },
  ],
} as const

export type LandingFeatureStatus = 'available' | 'with-ai' | 'soon'

export interface LandingIntelligenceItem {
  key: string
  title: string
  text: string
  status: LandingFeatureStatus
}

/** Sólo lo que existe: estado verificado en docs/landing.md. */
export const LANDING_INTELLIGENCE: LandingIntelligenceItem[] = [
  { key: 'matching', title: 'Compatibilidades', text: 'Cruza lo que busca cada comprador con tus propiedades y te enseña las coincidencias.', status: 'available' },
  { key: 'score', title: 'Prioridad de cada lead', text: 'Una puntuación explicable, por reglas que tú defines, para atender antes a quien más lo necesita.', status: 'available' },
  { key: 'dashboard', title: 'Análisis comercial', text: 'Embudo, rendimiento por comercial y oficina, y métricas de tu actividad real.', status: 'available' },
  { key: 'assistant', title: 'Asistente INMO', text: 'Pregunta por tus propiedades, clientes y citas en lenguaje natural y deja que prepare tareas que tú confirmas.', status: 'with-ai' },
  { key: 'automations', title: 'Automatizaciones', text: 'Reglas que crean tareas, avisan al equipo o mueven un lead cuando pasa algo.', status: 'available' },
  { key: 'channels', title: 'Publicación en portales', text: 'La programación de publicaciones está lista; la conexión con los portales llegará canal a canal.', status: 'soon' },
]

export const LANDING_STATUS_LABEL: Record<LandingFeatureStatus, string> = {
  available: 'Disponible',
  'with-ai': 'Con IA activada',
  soon: 'Próximamente',
}

export interface LandingStep {
  key: string
  title: string
  text: string
  shot: LandingShotKey
}

export const LANDING_STEPS: LandingStep[] = [
  { key: 'add', title: 'Añade una propiedad', text: 'El equipo registra el inmueble.', shot: 'propiedad-panel' },
  { key: 'publish', title: 'Publícala en tu web', text: 'La información se utiliza para mostrar la propiedad en la web pública.', shot: 'ficha-publica' },
  { key: 'inquiry', title: 'Recibe una consulta', text: 'Un interesado envía un formulario.', shot: 'web-contacto' },
  { key: 'contact', title: 'Gestiona el contacto', text: 'La consulta llega al entorno comercial.', shot: 'crm' },
  { key: 'visit', title: 'Organiza una visita', text: 'El equipo programa y realiza el seguimiento.', shot: 'agenda' },
  { key: 'deal', title: 'Avanza con la operación', text: 'Se gestiona la oportunidad hasta su resolución.', shot: 'operaciones' },
]

export const LANDING_DEMO = {
  title: 'No te lo imagines. Descubre cómo funciona.',
  subtitle: 'Explora INMO y descubre cómo encaja en el día a día de tu inmobiliaria.',
  /** No hay acceso público a la cuenta demo: «Ver demostración» lleva a la solicitud. */
  primary: { label: 'Ver demostración', to: '#solicitar-demo' },
} as const

/** Opciones del formulario «Solicitar demo»: las mismas en la landing y en el servidor (server/api/public/demo-request.post.ts). */
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

export const LANDING_ACCESS = {
  title: 'Una plataforma preparada para crecer contigo.',
  items: [
    { title: 'Registro inmediato', text: 'Crea tu inmobiliaria en un minuto: tu cuenta nace activa, con tu espacio y tu usuario administrador.' },
    { title: 'Demostración guiada', text: 'Pide una demo y te la enseñamos con un caso parecido al tuyo. No hay acceso público a la cuenta de demostración.' },
    { title: 'De una persona a varias oficinas', text: 'Empieza solo o con tu equipo; añade comerciales, oficinas y equipos cuando los necesites.' },
    { title: 'Tu dominio', text: 'Tu web puede vivir en tu propio dominio; lo configuramos contigo al activarlo.' },
    { title: 'Soporte', text: 'Ayuda dentro del panel para cada módulo y atención por correo.' },
    { title: 'Condiciones', text: 'Los planes y precios aún no están publicados: consúltanos y te los contamos sin compromiso.' },
  ],
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
  { q: '¿Cómo funciona el registro de empresa?', a: 'Rellenas el nombre de tu empresa, tu correo y una contraseña, y aceptas las condiciones. La cuenta se crea al momento y activa; entras con tu correo en el acceso del panel y empiezas con un espacio vacío, listo para tus datos.' },
  { q: '¿Existe una demostración?', a: 'Sí: pide una demo desde esta página y te la enseñamos con tu caso. No hay acceso público a la cuenta de demostración, para que nadie pueda tocar lo que no es suyo.' },
  { q: '¿Qué soporte ofrece INMO?', a: 'Ayuda dentro del panel, módulo a módulo, y atención por correo electrónico. No hay chat ni sistema de tickets por ahora.' },
]

export const LANDING_FINAL = {
  title: 'Tu próxima etapa empieza aquí.',
  subtitle: 'Reúne la gestión de tu inmobiliaria en una plataforma pensada para trabajar de forma más conectada.',
} as const

export const LANDING_FOOTER = {
  description: 'INMO es la plataforma para gestionar tu inmobiliaria: web, propiedades, clientes, visitas y operaciones, conectados.',
  columns: [
    { title: 'Producto', links: [{ label: 'Funcionalidades', href: '#inteligencia' }, { label: 'Constructor Web', href: '#constructor-web' }, { label: 'CRM', href: '#crm' }, { label: 'Cómo funciona', href: '#como-funciona' }] },
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

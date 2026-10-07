/**
 * Web, contenido y marketing de la cuenta demo: portada del Constructor Web,
 * artículos del blog, documentos de INMO: Conocimiento, programa de
 * referidos, plantillas de export, piezas, catálogos y automatizaciones.
 *
 * Los textos son de una agencia ficticia y no dan datos de mercado concretos
 * (precios medios, estadísticas…) que pudieran tomarse por reales.
 */

export const HOME_SLIDES = ['asturias/gijon-02.jpg', 'asturias/llanes-01.jpg', 'asturias/oviedo-01.jpg']

export interface DemoArticle {
  key: string
  title: string
  excerpt: string
  cover: string
  category: 'guias' | 'zonas'
  focusKeyword: string
  days: number
  blocks: { type: 'paragraph' | 'heading'; text: string }[]
}

export const ARTICLES: DemoArticle[] = [
  {
    key: 'b01', title: 'Comprar casa en Asturias: cómo preparar la búsqueda paso a paso', cover: 'asturias/oviedo-03.jpg', category: 'guias', focusKeyword: 'comprar casa en Asturias', days: -150,
    excerpt: 'Presupuesto, financiación, zonas y visitas: lo que conviene tener claro antes de empezar a ver viviendas.',
    blocks: [
      { type: 'paragraph', text: 'Comprar una vivienda es una de las decisiones más importantes que tomamos, y en Asturias la variedad es enorme: del piso en el centro de Oviedo a la casa con finca en el oriente. Ordenar la búsqueda desde el principio ahorra tiempo y disgustos.' },
      { type: 'heading', text: 'Primero, el presupuesto real' },
      { type: 'paragraph', text: 'Además del precio, cuenta los impuestos de la compraventa, la notaría, el registro y, si hay hipoteca, la tasación. Pide a tu banco una preaprobación: te dirá cuánto puedes financiar y te dará fuerza para negociar.' },
      { type: 'heading', text: 'Zona antes que vivienda' },
      { type: 'paragraph', text: 'Piensa en tu día a día: trabajo, colegios, transporte y servicios. Visitar el barrio a distintas horas dice más que cualquier anuncio.' },
      { type: 'heading', text: 'Visitas con método' },
      { type: 'paragraph', text: 'Lleva una lista de lo imprescindible y de lo deseable, y apunta tus impresiones al salir de cada visita. Nosotros te las resumimos después de cada recorrido para que compares con calma.' },
    ],
  },
  {
    key: 'b02', title: 'Obra nueva: qué revisar antes de reservar tu vivienda', cover: 'asturias/gijon-02.jpg', category: 'guias', focusKeyword: 'obra nueva Asturias', days: -110,
    excerpt: 'Memoria de calidades, avales de las cantidades entregadas y plazos de entrega: las claves de una compra sobre plano.',
    blocks: [
      { type: 'paragraph', text: 'Comprar sobre plano permite elegir planta, orientación y acabados, pero exige revisar bien la documentación de la promoción.' },
      { type: 'heading', text: 'La memoria de calidades' },
      { type: 'paragraph', text: 'Es el documento que describe materiales e instalaciones: carpinterías, aislamiento, calefacción, suelos. Compárala entre promociones y pregunta por lo que no esté claro.' },
      { type: 'heading', text: 'Las cantidades a cuenta, garantizadas' },
      { type: 'paragraph', text: 'Las cantidades que entregas antes de la escritura deben estar garantizadas mediante aval o seguro. Pide siempre el documento que lo acredita.' },
      { type: 'heading', text: 'Plazos y licencia de primera ocupación' },
      { type: 'paragraph', text: 'Confirma la fecha prevista de entrega y qué ocurre si se retrasa. La escritura se firma cuando la vivienda tiene su licencia de primera ocupación.' },
    ],
  },
  {
    key: 'b03', title: 'Vivir en el oriente de Asturias: costa, montaña y calidad de vida', cover: 'asturias/llanes-01.jpg', category: 'zonas', focusKeyword: 'vivir en el oriente de Asturias', days: -70,
    excerpt: 'Llanes, Ribadesella y Cangas de Onís: tres maneras de vivir entre el Cantábrico y los Picos de Europa.',
    blocks: [
      { type: 'paragraph', text: 'El oriente asturiano reúne playas, pueblos marineros y la cercanía de los Picos de Europa. Cada vez más familias y compradores de fuera eligen la zona como primera o segunda residencia.' },
      { type: 'heading', text: 'Llanes y su costa' },
      { type: 'paragraph', text: 'Un concejo con decenas de playas y una senda costera para recorrer a pie. Las viviendas cercanas al mar y las casas de piedra rehabilitadas son las más buscadas.' },
      { type: 'heading', text: 'Ribadesella' },
      { type: 'paragraph', text: 'Villa marinera con la playa de Santa Marina y la ría del Sella. Muy bien comunicada y con vida todo el año.' },
      { type: 'heading', text: 'Cangas de Onís' },
      { type: 'paragraph', text: 'La puerta de los Picos de Europa, con servicios completos y un entorno de montaña privilegiado.' },
    ],
  },
  {
    key: 'b04', title: 'Casas de piedra rehabilitadas: lo que conviene saber antes de comprar', cover: 'asturias/rural-03.jpg', category: 'guias', focusKeyword: 'casa de piedra rehabilitada', days: -28,
    excerpt: 'Estructura, cubierta, humedades y licencias: una lista de comprobación para comprar con tranquilidad en el medio rural.',
    blocks: [
      { type: 'paragraph', text: 'Una casa de piedra bien rehabilitada combina el encanto de la arquitectura tradicional con el confort actual. Antes de decidir, conviene revisar algunos puntos.' },
      { type: 'heading', text: 'Cubierta y estructura' },
      { type: 'paragraph', text: 'Pregunta cuándo se rehízo la cubierta y con qué materiales. Una inspección técnica previa es una inversión pequeña frente al coste de una reparación.' },
      { type: 'heading', text: 'Humedades y aislamiento' },
      { type: 'paragraph', text: 'Los muros gruesos regulan bien la temperatura, pero necesitan ventilación y un buen tratamiento contra la humedad.' },
      { type: 'heading', text: 'Suelo y licencias' },
      { type: 'paragraph', text: 'En suelo rural, comprueba que la vivienda y sus anexos (hórreo, cuadra, porche) están legalizados y qué usos permite el planeamiento.' },
    ],
  },
]

export const KNOWLEDGE_DOCS = [
  {
    key: 'kd01', title: 'Proceso comercial de Norte Astur', tags: 'proceso, ventas',
    body: '1. Todo lead se atiende antes de 30 minutos en horario de oficina.\n2. En la primera llamada se recogen zona, presupuesto, plazo y financiación, y se crea la necesidad del comprador.\n3. Se envían como máximo tres propiedades compatibles y se proponen visitas agrupadas en un tour cuando hay varias.\n4. Tras cada visita se registra el resultado (interés, precio, puntos fuertes y débiles).\n5. Las ofertas se presentan siempre por escrito a la propiedad y se registran en la ficha.',
  },
  {
    key: 'kd02', title: 'Zonas de trabajo y oficinas', tags: 'zonas, oficinas',
    body: 'Oviedo Centro: Oviedo, Lugones, Pola de Siero y la zona sur (Montecerrao, La Florida).\nGijón: Gijón, Avilés, Candás y Luanco.\nOriente: Llanes, Ribadesella, Cangas de Onís y Villaviciosa.\nLos clientes que escriben en inglés los atiende la oficina de Oriente; en alemán, Paula; en francés, Álvaro.',
  },
  {
    key: 'kd03', title: 'Protocolo de captación', tags: 'captación, propietarios',
    body: 'Visita de valoración con informe de comparables, propuesta de precio y de comisión, reportaje fotográfico y plano, nota simple y certificado energético antes de publicar. Exclusiva por defecto de seis meses.',
  },
  {
    key: 'kd04', title: 'Preguntas frecuentes de compradores', tags: 'faq, compradores',
    body: '¿Cobráis al comprador? No: los honorarios los paga la propiedad salvo que se pacte otra cosa.\n¿Ayudáis con la hipoteca? Sí, os ponemos en contacto con entidades colaboradoras sin compromiso.\n¿Puedo reservar sin haber vendido mi casa? Sí, con una condición suspensiva pactada en la reserva.',
  },
  {
    key: 'kd05', title: 'Guía interna de alquileres', tags: 'alquiler, gestión',
    body: 'Requisitos del inquilino: nóminas o justificante de ingresos, contrato de trabajo y, si procede, aval. Fianza legal de una mensualidad y garantía adicional de hasta dos. La gestión mensual incluye cobro de rentas, incidencias y renovaciones.',
  },
]

export const REFERRAL_LINKS = [
  { key: 'rl01', referrerType: 'client' as const, referrerName: 'Óscar Rubiera Solís', contact: 'c08', rewardType: 'cash' as const, rewardAmount: 300, days: -60 },
  { key: 'rl02', referrerType: 'client' as const, referrerName: 'Sarah Collins', contact: 'c09', rewardType: 'discount' as const, rewardAmount: 500, days: -115 },
  { key: 'rl03', referrerType: 'client' as const, referrerName: 'Pilar Arias Cortina', contact: 'c39', rewardType: 'cash' as const, rewardAmount: 250, days: -125 },
  { key: 'rl04', referrerType: 'agent' as const, referrerName: 'Gestoría Llano y Asociados (colaborador ficticio)', rewardType: 'commission' as const, rewardAmount: 10, days: -140 },
]

export const REFERRALS = [
  { key: 'rf01', link: 'rl01', lead: 'L20', status: 'pending' as const, days: -40 },
  { key: 'rf02', link: 'rl02', lead: 'L49', status: 'pending' as const, days: -20 },
  { key: 'rf03', link: 'rl03', lead: 'L07', status: 'rewarded' as const, days: -110, convertedDays: -62, rewardedDays: -55 },
  { key: 'rf04', link: 'rl04', lead: 'L12', status: 'expired' as const, days: -88 },
  { key: 'rf05', link: 'rl04', refereeName: 'Mónica Roces Valle', status: 'pending' as const, days: -8 },
  { key: 'rf06', link: 'rl02', refereeName: 'James Whitfield', status: 'pending' as const, days: -3 },
]

/** Copias propias de plantillas del sistema (PDF), con nombre de la agencia. */
export const EXPORT_TEMPLATES = [
  { key: 'et01', name: 'Ficha comercial Norte Astur', description: 'Ficha de una página para enviar tras la primera llamada.', status: 'published' as const },
  { key: 'et02', name: 'Dossier de propiedad', description: 'Dossier completo para propietarios y compradores cualificados.', status: 'published' as const },
  { key: 'et03', name: 'Selección para cliente', description: 'Selección de varias propiedades con la marca de la agencia.', status: 'draft' as const },
]

/** Piezas generadas (proyectos de export) sobre obra nueva. */
export const EXPORT_PROJECTS = [
  { key: 'ep01', template: 'et01', property: 'p01', days: -80 },
  { key: 'ep02', template: 'et01', property: 'p04', days: -60 },
  { key: 'ep03', template: 'et02', property: 'p10', days: -45 },
  { key: 'ep04', template: 'et02', property: 'p02', days: -30 },
  { key: 'ep05', template: 'et01', property: 'p06', days: -12 },
]

export const CATALOGS = [
  { key: 'cat01', name: 'Selección viviendas familiares — Oviedo', kind: 'developer' as const, properties: ['p01', 'p02', 'p03'], template: 'et02', days: -25 },
  { key: 'cat02', name: 'Propiedades con terraza — Gijón y costa central', kind: 'agent' as const, properties: ['p16', 'p17', 'p13'], template: 'et02', days: -14 },
  { key: 'cat03', name: 'Selección Costa Oriental', kind: 'developer' as const, properties: ['p06', 'p07', 'p10'], template: 'et02', days: -6 },
]

/** Automatizaciones seguras: sólo acciones internas (tareas, notas, avisos en la campana). */
export const AUTOMATIONS = [
  { key: 'au01', name: 'Nuevo lead → tarea de primer contacto', trigger: 'lead.created', action: 'create_task', config: { title: 'Primer contacto con el lead', type: 'call', dueInHours: 1, assignee: 'lead_commercial' } },
  { key: 'au02', name: 'Visita realizada → seguimiento en 48 h', trigger: 'visit.completed', action: 'create_task', config: { title: 'Seguimiento tras la visita', type: 'follow_up', dueInHours: 48, assignee: 'lead_commercial' } },
  { key: 'au03', name: 'Oferta aceptada → aviso al equipo', trigger: 'offer.accepted', action: 'notify_team', config: { message: 'Oferta aceptada: preparar la reserva y la documentación.' } },
  { key: 'au04', name: 'Lead sin atender → aviso al equipo', trigger: 'lead.unattended', action: 'notify_team', config: { message: 'Hay un lead sin atender fuera de plazo: revisa Enrutamiento y SLA.' } },
]

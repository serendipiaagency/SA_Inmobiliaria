/**
 * Zonas de la cuenta demo Norte Astur (docs/zonas.md): la región, los seis
 * municipios con guía completa, el resto de municipios del directorio (sin
 * guía: enlazan al catálogo) y los barrios de Gijón y Oviedo con contenido
 * propio (zonasBarrios.ts).
 *
 * Reglas del contenido: enfoque residencial (quien va a vivir ahí), no
 * turístico; nada de precios medios, rentabilidades, demografía ni tiempos de
 * trayecto; nada de «lugar ideal», «ubicación privilegiada» ni «entorno
 * inmejorable». Las coordenadas son el centro aproximado del municipio o
 * barrio, para centrar el mapa, no una delimitación.
 */
export interface DemoZone {
  key: string
  slug: string
  name: string
  kind: 'region' | 'municipality' | 'locality' | 'neighborhood'
  /** Clave de la zona superior (otra entrada de esta lista). */
  parent?: string
  area?: 'ciudades' | 'oriente' | 'centro' | 'occidente'
  status: 'draft' | 'published'
  subtitle?: string
  intro?: string
  sections?: Array<{ title: string; text: string }>
  faq?: Array<{ q: string; a: string }>
  /** Ruta dentro de public/demo-assets/norte-astur/ (CC0/PDM, ver CREDITOS.md). */
  image?: string
  lat: number
  lng: number
  zoom?: number
  matchMunicipality?: string
  matchNeighborhood?: string
  homePriority?: number
  sortOrder: number
  seoTitle?: string
  seoDescription?: string
}

export const ZONES_REVIEWED_AT = '2026-10-10'

export const ZONAS: DemoZone[] = [
  {
    key: 'asturias', slug: 'asturias', name: 'Asturias', kind: 'region', status: 'published', lat: 43.36, lng: -5.85, zoom: 8, sortOrder: 0,
    image: 'asturias/costa-01.jpg',
    subtitle: 'Ciudades, villas marineras y valles donde trabajamos',
    seoTitle: 'Dónde vivir en Asturias: descubre sus ciudades, pueblos y mejores zonas',
    seoDescription: 'Las zonas de Asturias donde Norte Astur trabaja: Gijón, Oviedo, Avilés, el oriente y el occidente. Guías por municipio y barrio con las viviendas disponibles en cada una.',
    intro: 'Asturias se vive de forma muy distinta según la zona: la vida urbana de Gijón, Oviedo y Avilés, con sus barrios y servicios a mano; las villas del oriente, entre la costa y los Picos de Europa; los concejos del centro, bien comunicados con las ciudades; y el occidente, más tranquilo y marinero. En esta sección reunimos lo que conviene saber de cada una antes de buscar casa: cómo es el día a día, qué tipo de vivienda hay y qué tenemos publicado ahora mismo.',
  },

  // ---------------------------------------------------------------- Ciudades
  {
    key: 'gijon', slug: 'gijon', name: 'Gijón', kind: 'municipality', parent: 'asturias', area: 'ciudades', status: 'published', lat: 43.5322, lng: -5.6611, zoom: 12, sortOrder: 10, homePriority: 6,
    image: 'asturias/gijon-02.jpg', matchMunicipality: 'Gijón',
    subtitle: 'La ciudad grande de la costa: playa, barrios con vida propia y mucho piso para elegir',
    seoTitle: 'Vivir en Gijón: guía de barrios y viviendas',
    seoDescription: 'Cómo es vivir en Gijón: Centro, Cimavilla, Somió, Viesques, La Arena, El Llano y Montevil, servicios, transporte, playa y las viviendas que tenemos publicadas.',
    intro: 'Gijón es la ciudad más grande de Asturias y la que más tipos de vida ofrece. Se puede vivir en un piso de los años setenta a dos calles de la playa de San Lorenzo, en un bloque reciente con garaje y zonas comunes en el sur de la ciudad o en una casa con jardín en Somió, y en todos los casos se sigue estando en Gijón: una ciudad llana, que se recorre en bicicleta, con el paseo del Muro como columna vertebral y el puerto deportivo y Cimavilla en el centro de todo.\n\nQuien busca casa aquí suele decidir primero entre dos ideas: el Gijón compacto del Centro, La Arena y El Llano, donde todo se hace a pie, y el Gijón de las zonas más nuevas y abiertas, como Viesques, El Bibio o Montevil, con viviendas más recientes, más garaje y más verde. Entre medias hay barrios con carácter propio, y precios y tipologías muy distintos a pocas calles de distancia.\n\nEn Norte Astur trabajamos sobre todo en el Centro, La Arena, Viesques y Somió, y conocemos bien la obra nueva que va apareciendo en el sur. En esta guía contamos cómo es cada zona y qué conviene mirar antes de visitar.',
    sections: [
      { title: 'Estilo de vida', text: 'Gijón es una ciudad de calle y de mar. La vida gira en torno al paseo del Muro, la playa de San Lorenzo, las sidrerías del Centro y Cimavilla y una agenda cultural constante en la Laboral, el Botánico y el Jardín Botánico Atlántico. Es una ciudad que se usa todo el año, también en invierno, con un ritmo más relajado que el de otras capitales de su tamaño.' },
      { title: 'Entorno y espacios verdes', text: 'Además de la playa y el Muro, la ciudad cuenta con el parque de Isabel la Católica, el cerro de Santa Catalina sobre Cimavilla, el parque del Rinconín hacia Somió y la senda litoral que sigue la costa hacia el este. Hacia el interior, el paseo fluvial del Piles y los parques de los barrios nuevos dan espacio para correr, pasear o salir con niños sin coger el coche.' },
      { title: 'Servicios y comercio', text: 'El comercio tradicional se concentra en el Centro y en La Arena, con calles comerciales peatonales y mercado; en el sur y en el este hay grandes superficies y centros comerciales con aparcamiento. Hospitales, colegios públicos y concertados, polideportivos municipales y bibliotecas están repartidos por los barrios, de modo que rara vez hace falta cruzar la ciudad para lo cotidiano.' },
      { title: 'Transporte y movilidad', text: 'Gijón se mueve en autobús urbano (una red densa que cubre todos los barrios), en bicicleta por un carril que recorre el Muro y buena parte de la ciudad, y a pie, porque casi todo está llano. Las estaciones de tren y autobús comunican con Oviedo, Avilés y el resto de la región; por carretera, la autopista «Y» conecta las tres ciudades.' },
      { title: 'Educación', text: 'Hay colegios públicos y concertados en todos los barrios, institutos, escuelas infantiles municipales y el campus universitario de Viesques, con escuelas de ingeniería, informática y deporte. La proximidad al campus marca el carácter de Viesques y parte de El Bibio, con mucha demanda de alquiler y pisos recientes.' },
      { title: 'Tipos de vivienda', text: 'En el Centro, La Arena y El Llano predominan los pisos en edificios de los años sesenta a ochenta, muchos sin garaje y algunos ya reformados; en Viesques, El Bibio, Montevil y Nuevo Roces, bloques de obra nueva o de los últimos veinte años, con garaje, trastero y a veces piscina; en Somió y Cabueñes, casas y chalés con parcela. Cimavilla mezcla casas de pescadores rehabilitadas y edificios pequeños sin ascensor.' },
    ],
    faq: [
      { q: '¿Qué zona de Gijón conviene para vivir con niños?', a: 'Depende de la prioridad. Viesques, El Bibio y Montevil tienen viviendas recientes, garaje y parques, y el campus y varios colegios cerca. El Centro y La Arena permiten hacerlo todo a pie, con la playa como patio, a cambio de edificios más antiguos y aparcamiento difícil. Somió ofrece casa con jardín, pero obliga a usar el coche a diario.' },
      { q: '¿Es fácil aparcar en Gijón?', a: 'No en el Centro, La Arena y Cimavilla, donde la mayoría de los edificios no tienen garaje y la zona azul cubre casi todas las calles. En los barrios nuevos del sur y del este la mayoría de las viviendas se venden con plaza de garaje. Si no vas a tener garaje, pregunta por la zona de estacionamiento regulado de la calle antes de decidir.' },
      { q: '¿Cómo es el clima para vivir todo el año?', a: 'Gijón tiene clima atlántico: inviernos suaves, veranos sin calor extremo y lluvia repartida a lo largo del año. La orientación de la vivienda importa más que en el sur de España: un piso orientado al sur, con buen aislamiento y ventanas recientes, se nota en la factura de calefacción y en el confort.' },
      { q: '¿Hay obra nueva en Gijón?', a: 'Sí, sobre todo en el sur y el este de la ciudad (Nuevo Roces, Viesques, El Bibio, Montevil) y en promociones puntuales en barrios consolidados. En el catálogo verás las que tenemos publicadas en cada momento, con su estado de obra y su fecha de entrega prevista.' },
    ],
  },
  {
    key: 'oviedo', slug: 'oviedo', name: 'Oviedo', kind: 'municipality', parent: 'asturias', area: 'ciudades', status: 'published', lat: 43.3619, lng: -5.8494, zoom: 12, sortOrder: 20, homePriority: 5,
    image: 'asturias/oviedo-01.jpg', matchMunicipality: 'Oviedo',
    subtitle: 'La capital: ciudad administrativa y universitaria, ordenada, con barrios nuevos alrededor de un centro histórico',
    seoTitle: 'Vivir en Oviedo: guía de barrios y viviendas',
    seoDescription: 'Cómo es vivir en Oviedo: el Centro, Montecerrao, La Florida, Ciudad Naranco, Buenavista, La Corredoria y San Lázaro, servicios, transporte y las viviendas publicadas.',
    intro: 'Oviedo es la capital de Asturias y, para muchas familias, la ciudad práctica: administración, hospital de referencia, universidad y una trama urbana compacta en la que el casco antiguo, las calles comerciales y los barrios residenciales están a distancias cortas. Es una ciudad cuidada, de calles peatonales y zonas verdes, que ha crecido en las últimas décadas hacia el sur y el oeste con barrios enteros de vivienda nueva.\n\nLa elección habitual está entre el Centro y su primera corona, con edificios de principios y mediados del siglo XX y mucha vida comercial, y los barrios de los años noventa y dos mil, como Montecerrao, La Florida o La Corredoria, con viviendas más amplias, garaje y zonas comunes. Ciudad Naranco, al norte, y Buenavista, al oeste, son barrios consolidados con buena relación entre precio y superficie.\n\nEn Norte Astur conocemos especialmente bien Montecerrao, el Centro y La Florida. Esta guía resume cómo se vive en cada zona y qué pedir antes de visitar.',
    sections: [
      { title: 'Estilo de vida', text: 'Oviedo es una ciudad de paseo y de rutina ordenada: el Campo de San Francisco en el centro, la calle Uría y el casco antiguo con la catedral, las sidrerías de Gascona y una programación cultural estable en el teatro Campoamor y el Auditorio. Es tranquila sin ser pequeña, y se nota en los horarios y en la limpieza de sus calles.' },
      { title: 'Entorno y espacios verdes', text: 'El Campo de San Francisco es el parque de referencia, con el parque de Invierno y la senda verde hacia Las Caldas como alternativa para correr o ir en bicicleta. El monte Naranco, con sus iglesias prerrománicas, está a un paso del barrio del mismo nombre y es el mirador de la ciudad. Los barrios nuevos incorporan parques y bulevares anchos.' },
      { title: 'Servicios y comercio', text: 'El comercio de proximidad se concentra en el Centro, en Uría, Fruela y el casco antiguo, y en el mercado del Fontán; los barrios tienen sus propias calles comerciales y supermercados. El Hospital Universitario Central de Asturias, centros de salud, juzgados y oficinas de la administración regional están en la propia ciudad.' },
      { title: 'Transporte y movilidad', text: 'La ciudad se recorre a pie y en autobús urbano; la estación de tren y la de autobuses conectan con Gijón, Avilés y las cuencas con frecuencias altas, y la autopista «Y» pone las otras dos ciudades a corta distancia en coche. Las cuestas del centro, pequeñas pero constantes, hacen que la bicicleta sea menos habitual que en Gijón.' },
      { title: 'Educación', text: 'Oviedo concentra buena parte de la universidad (los campus del centro, El Cristo y Llamaquique) y una amplia oferta de colegios públicos, concertados y privados, institutos y escuelas infantiles. Los barrios de los años noventa y dos mil se diseñaron con colegios y escuelas infantiles dentro del propio barrio.' },
      { title: 'Tipos de vivienda', text: 'En el Centro, edificios de principios y mediados del siglo XX, algunos con pisos muy amplios y techos altos, y bloques de los sesenta y setenta en la primera corona. Montecerrao, La Florida, La Corredoria y las zonas nuevas del sur ofrecen bloques de obra reciente con garaje, trastero y a menudo zonas comunes. Ciudad Naranco y Buenavista combinan bloques de los setenta y ochenta con promociones posteriores.' },
    ],
    faq: [
      { q: '¿Qué barrio de Oviedo es mejor para una familia?', a: 'Montecerrao, La Florida y La Corredoria son los que más familias eligen por la vivienda reciente, el garaje, los parques y los colegios dentro del barrio. El Centro gusta a quien quiere hacerlo todo a pie, con pisos más antiguos pero amplios. Ciudad Naranco y Buenavista equilibran precio y superficie.' },
      { q: '¿Se necesita coche para vivir en Oviedo?', a: 'En el Centro y los barrios cercanos no es imprescindible: el autobús urbano llega a todas partes y las distancias son cortas. En Montecerrao, La Florida o La Corredoria la mayoría de las viviendas tienen garaje y muchas familias usan el coche para el trabajo fuera de la ciudad, aunque el autobús también los cubre.' },
      { q: '¿Cómo es el clima en Oviedo?', a: 'Atlántico, con lluvia repartida durante el año, inviernos frescos y veranos moderados. Oviedo está en el interior y es algo más fría que Gijón en invierno. Orientación, aislamiento y calefacción pesan en la elección de la vivienda.' },
      { q: '¿Hay obra nueva en Oviedo?', a: 'Sí, sobre todo en La Florida, Montecerrao y las zonas de crecimiento del sur y el oeste, además de promociones puntuales en barrios consolidados. En el catálogo verás las que tenemos publicadas con su estado de obra y entrega prevista.' },
    ],
  },
  {
    key: 'aviles', slug: 'aviles', name: 'Avilés', kind: 'municipality', parent: 'asturias', area: 'ciudades', status: 'published', lat: 43.556, lng: -5.9248, zoom: 13, sortOrder: 30, homePriority: 4,
    image: 'asturias/aviles-01.jpg', matchMunicipality: 'Avilés',
    subtitle: 'La tercera ciudad: casco histórico con soportales, ría y barrios a escala humana',
    seoTitle: 'Vivir en Avilés: guía de barrios y viviendas',
    seoDescription: 'Cómo es vivir en Avilés: el casco histórico, La Magdalena, Versalles y la ría, servicios, transporte y las viviendas que tenemos publicadas.',
    intro: 'Avilés es la ciudad pequeña de las tres grandes de Asturias, y eso es parte de su atractivo para vivir: un casco histórico con calles porticadas, plazas y palacios, todo a distancia de paseo, con la ría y el Centro Niemeyer enfrente y las playas de Salinas y San Juan a pocos minutos. Es una ciudad con pasado industrial que ha reordenado su centro y sus riberas en las últimas décadas.\n\nLos barrios que más se buscan para vivir son el propio casco histórico y su entorno, La Magdalena y Versalles, con edificios de distintas épocas y buena oferta de servicios, además de las zonas residenciales que crecen hacia el oeste y el sur. Comparada con Gijón y Oviedo, Avilés suele ofrecer más superficie por el mismo presupuesto y una vida más tranquila.\n\nEn Norte Astur trabajamos en el centro y en La Magdalena, y conocemos las promociones nuevas que van surgiendo en la ciudad.',
    sections: [
      { title: 'Estilo de vida', text: 'Vida de ciudad pequeña con agenda cultural grande: el Centro Niemeyer, el teatro Palacio Valdés y las fiestas del Bollo y de San Agustín marcan el calendario, y el casco histórico concentra terrazas, sidrerías y comercio bajo los soportales. Todo cabe en un paseo.' },
      { title: 'Entorno y espacios verdes', text: 'El parque de Ferrera, en pleno centro, es el pulmón de la ciudad; la ría se ha convertido en paseo, y las playas de Salinas y San Juan de Nieva (en Castrillón y Gozón, a pocos minutos) son la salida natural del fin de semana. Hacia el interior, las sendas de la ría y el entorno rural del concejo.' },
      { title: 'Servicios y comercio', text: 'Comercio tradicional en el casco histórico y en las calles de La Magdalena y Versalles, mercado y supermercados en todos los barrios, hospital comarcal, centros de salud, polideportivos y bibliotecas municipales. Los polígonos y centros comerciales del entorno quedan a corta distancia en coche.' },
      { title: 'Transporte y movilidad', text: 'La ciudad se recorre a pie; el autobús urbano conecta los barrios y la estación de tren y la de autobuses comunican con Gijón y Oviedo con frecuencia alta. La autopista «Y» y la autovía del Cantábrico ponen el aeropuerto de Asturias, en Santiago del Monte, a corta distancia.' },
      { title: 'Educación', text: 'Colegios públicos y concertados en todos los barrios, varios institutos, escuelas infantiles municipales, conservatorio y escuela de arte. La universidad está en Gijón y Oviedo, a distancia de tren o autobús.' },
      { title: 'Tipos de vivienda', text: 'En el casco histórico, edificios rehabilitados y casas de piedra en calles porticadas, con pisos de distribución singular; en La Magdalena y Versalles, bloques de los años sesenta a ochenta, muchos ya reformados, y promociones más recientes con garaje; hacia el oeste y el sur, obra nueva y adosados. La relación entre superficie y precio suele ser mejor que en Gijón y Oviedo.' },
    ],
    faq: [
      { q: '¿Qué zona de Avilés conviene para vivir?', a: 'El casco histórico y su entorno, para quien quiere hacerlo todo a pie y valora los edificios con carácter; La Magdalena y Versalles, por la combinación de servicios, comercio y edificios ya reformados; las zonas nuevas del oeste y el sur, para quien prioriza garaje y vivienda reciente.' },
      { q: '¿Avilés sigue siendo una ciudad industrial?', a: 'La industria sigue presente en la ría y en el entorno, y da empleo a muchas familias, pero el centro y las riberas se han transformado en espacio de paseo, cultura y comercio. Al elegir vivienda conviene visitar la zona a distintas horas y preguntar por la orientación respecto a las instalaciones industriales.' },
      { q: '¿Cómo está comunicada Avilés con Gijón y Oviedo?', a: 'Por tren y autobús con frecuencias altas y por la autopista «Y». Muchas personas viven en Avilés y trabajan en las otras dos ciudades. El aeropuerto de Asturias queda a corta distancia por la autovía.' },
      { q: '¿Hay obra nueva en Avilés?', a: 'Hay promociones en las zonas de crecimiento del oeste y el sur y rehabilitaciones en el casco histórico. En el catálogo verás las que tenemos publicadas en cada momento.' },
    ],
  },

  // ----------------------------------------------------------------- Oriente
  {
    key: 'llanes', slug: 'llanes', name: 'Llanes', kind: 'municipality', parent: 'asturias', area: 'oriente', status: 'published', lat: 43.42, lng: -4.755, zoom: 11, sortOrder: 40, homePriority: 3,
    image: 'asturias/llanes-01.jpg', matchMunicipality: 'Llanes',
    subtitle: 'Villa marinera y concejo de playas y aldeas entre el mar y la sierra del Cuera',
    seoTitle: 'Vivir en Llanes: la villa, Celorio, Poo, Barro y Posada',
    seoDescription: 'Cómo es vivir en Llanes y su concejo: la villa, Celorio, Poo, Barro y Posada, servicios, playas, transporte y las viviendas publicadas.',
    intro: 'Llanes es el concejo más buscado del oriente de Asturias para vivir cerca del mar. La villa conserva su casco histórico, el puerto y el paseo de San Pedro sobre los acantilados, y a su alrededor se reparten decenas de pueblos y aldeas (Celorio, Poo, Barro, Posada, Andrín, Pendueles…) con playas pequeñas, prados y la sierra del Cuera al fondo. Es un lugar al que muchas familias llegan por la segunda residencia y en el que después deciden quedarse.\n\nLa decisión principal es entre la villa, con todos los servicios a pie y vida durante todo el año, y los pueblos, más tranquilos y con casas con terreno, pero dependientes del coche. En verano el concejo se llena; en invierno recupera su ritmo, y conviene conocer los dos antes de comprar.\n\nNorte Astur trabaja en la villa y en las localidades de la costa occidental del concejo, sobre todo Celorio y Poo, donde tenemos promociones y casas publicadas.',
    sections: [
      { title: 'Estilo de vida', text: 'Vida de villa marinera: el puerto, las sidrerías del casco histórico, el mercado semanal y el paseo de San Pedro como rutina. El calendario lo marcan las fiestas de cada pueblo y la temporada de verano, cuando la villa multiplica su actividad. El resto del año es un lugar tranquilo, con una comunidad estable de vecinos de toda la vida y recién llegados.' },
      { title: 'Entorno y espacios naturales', text: 'Más de treinta playas y calas (Toró, El Sablón, Barro, Poo, Celorio, Torimbia…), los bufones de Pría y Arenillas, la senda costera que recorre el concejo y la sierra del Cuera para caminar. Los Picos de Europa quedan a una distancia que permite ir y volver en el día.' },
      { title: 'Servicios y comercio', text: 'La villa concentra el comercio, los supermercados, el centro de salud, las farmacias, el polideportivo y las oficinas de la administración; en los pueblos hay tiendas y bares, pero lo cotidiano se resuelve en Llanes o en Posada. El hospital de referencia del oriente está en Arriondas.' },
      { title: 'Transporte y movilidad', text: 'La autovía del Cantábrico atraviesa el concejo y conecta con Gijón y Oviedo hacia el oeste y con Cantabria hacia el este. Hay estación de tren de vía estrecha en la villa y apeaderos en varias localidades, y líneas de autobús. Para vivir en los pueblos, el coche es necesario.' },
      { title: 'Educación', text: 'Colegios públicos en la villa y en Posada, instituto en Llanes y escuelas infantiles. Para estudios universitarios, Gijón y Oviedo quedan a distancia de autovía.' },
      { title: 'Tipos de vivienda', text: 'En la villa, pisos en edificios de los años sesenta a dos mil y casas rehabilitadas en el casco histórico; en Celorio, Poo, Barro y Posada, promociones recientes de apartamentos y casas adosadas junto a las playas, y casas tradicionales con terreno en las aldeas del interior. Las viviendas de segunda residencia suelen salir al mercado al final del verano.' },
    ],
    faq: [
      { q: '¿Se puede vivir en Llanes todo el año?', a: 'Sí. La villa mantiene servicios, comercio, colegios y centro de salud durante todo el año, y una comunidad estable. Los pueblos pequeños tienen menos servicios en invierno, por lo que conviene visitarlos fuera de temporada antes de decidir.' },
      { q: '¿Qué diferencia hay entre vivir en la villa y en los pueblos?', a: 'La villa permite hacerlo todo a pie y tiene vida social durante el año; los pueblos ofrecen tranquilidad, casas con terreno y playas a un paso, pero dependen del coche para casi todo. Celorio, Poo y Posada están en un punto intermedio por su cercanía a la villa.' },
      { q: '¿Cómo es el invierno en Llanes?', a: 'Lluvioso y ventoso, con temporales de mar que forman parte del paisaje. Una vivienda bien orientada y con buen aislamiento y carpinterías cambia mucho la experiencia. Las viviendas de temporada pensadas sólo para el verano no siempre están preparadas.' },
      { q: '¿Hay obra nueva en Llanes?', a: 'Sí, en la villa y sobre todo en las localidades de la costa (Celorio, Poo, Barro, Posada). En el catálogo verás las promociones que tenemos publicadas con su estado y entrega prevista.' },
    ],
  },
  {
    key: 'ribadesella', slug: 'ribadesella', name: 'Ribadesella', kind: 'municipality', parent: 'asturias', area: 'oriente', status: 'published', lat: 43.462, lng: -5.059, zoom: 13, sortOrder: 50, homePriority: 2,
    image: 'asturias/ribadesella-01.jpg', matchMunicipality: 'Ribadesella',
    subtitle: 'Villa en la desembocadura del Sella: puerto, playa de Santa Marina y vida tranquila todo el año',
    seoTitle: 'Vivir en Ribadesella: guía de la villa y su concejo',
    seoDescription: 'Cómo es vivir en Ribadesella: el casco antiguo, el puerto, la playa de Santa Marina y el concejo, servicios, transporte y las viviendas publicadas.',
    intro: 'Ribadesella es una villa pequeña y muy reconocible: el río Sella la parte en dos, con el casco antiguo y el puerto en una orilla y la playa de Santa Marina, con sus villas de principios del siglo XX, en la otra. Tiene la escala justa para hacerlo todo a pie y una vida que no se apaga en invierno, aunque el verano, con el Descenso del Sella, la transforme durante unas semanas.\n\nQuien busca vivienda aquí suele elegir entre el casco antiguo y el entorno del puerto, con edificios tradicionales y pisos reformados, o la zona de Santa Marina y el Arenal, con viviendas más recientes y la playa a la puerta. En el concejo hay además aldeas y casas con terreno a poca distancia de la villa.\n\nNorte Astur trabaja en la villa y en Santa Marina, y conocemos bien tanto los edificios antiguos del puerto como las promociones recientes.',
    sections: [
      { title: 'Estilo de vida', text: 'Vida de villa marinera y fluvial: paseo por el puerto y el malecón, el mercado, las sidrerías y la playa como rutina diaria. El Descenso Internacional del Sella, a principios de agosto, llena la villa; el resto del año es un lugar tranquilo con una comunidad estable.' },
      { title: 'Entorno y espacios naturales', text: 'La playa de Santa Marina y su paseo, el mirador y la ermita de la Guía sobre el puerto, la cueva de Tito Bustillo (patrimonio mundial), la ría del Sella para remar y las sendas costeras hacia Vega y la Cuevona de Ardines. Los Picos de Europa quedan a distancia de una excursión de día.' },
      { title: 'Servicios y comercio', text: 'Comercio de proximidad en el casco antiguo y en el Arenal, supermercados, centro de salud, farmacias, polideportivo y oficinas municipales en la propia villa. El hospital comarcal está en Arriondas, a pocos kilómetros.' },
      { title: 'Transporte y movilidad', text: 'La autovía del Cantábrico pasa junto a la villa y conecta con Gijón y Oviedo; hay estación de tren de vía estrecha y autobuses interurbanos. Dentro de la villa todo se hace a pie; para el concejo, el coche.' },
      { title: 'Educación', text: 'Colegio público e instituto en la villa, además de escuela infantil. Para la universidad, Gijón y Oviedo por autovía.' },
      { title: 'Tipos de vivienda', text: 'En el casco antiguo y el puerto, edificios tradicionales de dos a cuatro plantas con pisos reformados o por reformar; en Santa Marina, villas de principios del siglo XX, pisos en edificios de los años setenta y promociones recientes de apartamentos; en el concejo, casas de aldea con terreno.' },
    ],
    faq: [
      { q: '¿Ribadesella es un lugar para vivir todo el año o sólo de veraneo?', a: 'Las dos cosas conviven. La villa tiene servicios, colegio, instituto y comercio durante todo el año y una comunidad estable; parte de las viviendas de Santa Marina son de temporada, y en invierno la zona queda más tranquila que el casco antiguo.' },
      { q: '¿Qué diferencia hay entre el casco antiguo y Santa Marina?', a: 'El casco antiguo y el puerto concentran el comercio, los bares y la vida de la villa, con edificios tradicionales; Santa Marina es más residencial, con la playa delante, villas históricas y promociones más recientes, y menos actividad fuera del verano.' },
      { q: '¿Cómo es el acceso a Gijón y Oviedo?', a: 'Por la autovía del Cantábrico, con conexión directa, y en tren de vía estrecha o autobús. Hay quien vive en Ribadesella y trabaja en Gijón, aunque el trayecto diario requiere organización.' },
      { q: '¿Hay obra nueva en Ribadesella?', a: 'Hay promociones recientes de apartamentos en Santa Marina y el entorno de la villa. En el catálogo verás las que tenemos publicadas en cada momento.' },
    ],
  },
  {
    key: 'villaviciosa', slug: 'villaviciosa', name: 'Villaviciosa', kind: 'municipality', parent: 'asturias', area: 'oriente', status: 'published', lat: 43.481, lng: -5.435, zoom: 12, sortOrder: 60, homePriority: 1,
    image: 'asturias/villaviciosa-01.jpg', matchMunicipality: 'Villaviciosa',
    subtitle: 'La ría, las pomaradas y la sidra: una villa tranquila a media hora de Gijón y Oviedo',
    seoTitle: 'Vivir en Villaviciosa: la villa, Amandi, Tazones y la ría',
    seoDescription: 'Cómo es vivir en Villaviciosa: la villa, Amandi, Tazones, Rodiles y la ría, servicios, transporte y las viviendas que tenemos publicadas.',
    intro: 'Villaviciosa es un concejo grande y variado, entre la ría y las pomaradas, con una villa de calles tranquilas y casas de indianos, pueblos marineros como Tazones, la playa de Rodiles y aldeas repartidas por un paisaje de prados y manzanos. Es la capital de la sidra, y eso se nota en el calendario, en el paisaje y en la vida social.\n\nMuchas de las familias que llegan buscan una casa con terreno a distancia razonable de Gijón y Oviedo, y las encuentran en Amandi, Selorio o las aldeas del entorno de la villa; otras prefieren un piso en la propia villa, con servicios a pie. La ría, reserva natural, marca el límite y el carácter de la zona.\n\nNorte Astur trabaja en la villa y en Amandi, donde tenemos publicadas viviendas y promociones de casas.',
    sections: [
      { title: 'Estilo de vida', text: 'Vida de villa tranquila con calendario propio: el Festival de la Manzana, las espichas en los llagares, el mercado y las fiestas de cada parroquia. Tazones y Rodiles son la salida de fin de semana; Gijón y Oviedo quedan cerca para todo lo demás.' },
      { title: 'Entorno y espacios naturales', text: 'La ría de Villaviciosa, reserva natural parcial, con sus marismas y sendas; la playa de Rodiles con su pinar; Tazones y los acantilados hacia Lastres; y, tierra adentro, las pomaradas y los caminos entre aldeas con iglesias románicas como la de San Juan de Amandi.' },
      { title: 'Servicios y comercio', text: 'La villa concentra el comercio de proximidad, supermercados, centro de salud, farmacias, polideportivo y oficinas municipales; en Amandi y las parroquias hay tiendas y bares, pero lo cotidiano se resuelve en la villa. Hospital de referencia en Gijón.' },
      { title: 'Transporte y movilidad', text: 'La autovía del Cantábrico conecta la villa con Gijón y Oviedo con un trayecto corto en coche, y hay autobuses interurbanos. Para vivir en las parroquias y aldeas, el coche es imprescindible. No hay tren.' },
      { title: 'Educación', text: 'Colegios públicos en la villa y en varias parroquias, instituto en Villaviciosa y escuela infantil. Para la universidad, Gijón y Oviedo por autovía.' },
      { title: 'Tipos de vivienda', text: 'En la villa, pisos en edificios de los años setenta a dos mil y casas de indianos rehabilitadas; en Amandi, Selorio y el entorno, casas tradicionales con terreno, promociones recientes de casas y chalés y alguna casería para rehabilitar; en Tazones y Rodiles, viviendas pequeñas con mucha demanda de temporada.' },
    ],
    faq: [
      { q: '¿Es Villaviciosa una buena opción para vivir y trabajar en Gijón u Oviedo?', a: 'Muchas familias lo hacen: la autovía pone las dos ciudades a un trayecto corto en coche. A cambio hay que contar con el coche para casi todo y con una oferta de servicios más reducida que en la ciudad, aunque suficiente para el día a día.' },
      { q: '¿Qué tipo de casa se encuentra en Amandi?', a: 'Casas tradicionales con terreno, caserías para rehabilitar y promociones recientes de casas adosadas o pareadas con jardín, en un entorno de prados y pomaradas a pocos minutos de la villa. Es la zona en la que más trabajamos dentro del concejo.' },
      { q: '¿Cómo es vivir junto a la ría?', a: 'La ría es una reserva natural: aporta paisaje, sendas y tranquilidad, y también limita lo que se puede construir en su entorno. Conviene preguntar por las afecciones urbanísticas y por la orientación y la humedad de la vivienda.' },
      { q: '¿Hay obra nueva en Villaviciosa?', a: 'Hay promociones de casas en Amandi y el entorno de la villa y rehabilitaciones en el casco. En el catálogo verás las que tenemos publicadas en cada momento.' },
    ],
  },

  // ----------------------------------------- Directorio: sin guía (al catálogo)
  { key: 'colunga', slug: 'colunga', name: 'Colunga', kind: 'municipality', parent: 'asturias', area: 'oriente', status: 'published', lat: 43.486, lng: -5.27, zoom: 12, sortOrder: 70, matchMunicipality: 'Colunga', subtitle: 'Lastres, la playa de La Griega y el Museo del Jurásico, entre Villaviciosa y Ribadesella' },
  { key: 'cangas-de-onis', slug: 'cangas-de-onis', name: 'Cangas de Onís', kind: 'municipality', parent: 'asturias', area: 'oriente', status: 'published', lat: 43.351, lng: -5.13, zoom: 12, sortOrder: 80, matchMunicipality: 'Cangas de Onís', image: 'asturias/cangas-de-onis-01.jpg', subtitle: 'La puerta de los Picos de Europa y Covadonga, con el puente romano sobre el Sella' },
  { key: 'parres', slug: 'parres', name: 'Parres (Arriondas)', kind: 'municipality', parent: 'asturias', area: 'oriente', status: 'published', lat: 43.389, lng: -5.186, zoom: 12, sortOrder: 90, matchMunicipality: 'Parres', subtitle: 'Arriondas, capital del concejo de Parres: el Sella, el hospital comarcal del oriente y la autovía' },
  { key: 'siero', slug: 'siero', name: 'Siero', kind: 'municipality', parent: 'asturias', area: 'centro', status: 'published', lat: 43.388, lng: -5.664, zoom: 12, sortOrder: 100, matchMunicipality: 'Siero', image: 'asturias/pola-de-siero-01.jpg', subtitle: 'Pola de Siero y Lugones: el concejo entre Oviedo y Gijón, con polígonos, comercio y vivienda nueva' },
  { key: 'llanera', slug: 'llanera', name: 'Llanera', kind: 'municipality', parent: 'asturias', area: 'centro', status: 'published', lat: 43.442, lng: -5.83, zoom: 12, sortOrder: 110, matchMunicipality: 'Llanera', subtitle: 'Posada y Lugo de Llanera: al norte de Oviedo, junto al polígono de Silvota y la autovía' },
  { key: 'norena', slug: 'norena', name: 'Noreña', kind: 'municipality', parent: 'asturias', area: 'centro', status: 'published', lat: 43.393, lng: -5.703, zoom: 13, sortOrder: 120, matchMunicipality: 'Noreña', subtitle: 'El concejo más pequeño de Asturias, villa chacinera a un paso de Oviedo y Pola de Siero' },
  { key: 'mieres', slug: 'mieres', name: 'Mieres', kind: 'municipality', parent: 'asturias', area: 'centro', status: 'published', lat: 43.246, lng: -5.776, zoom: 12, sortOrder: 130, matchMunicipality: 'Mieres', subtitle: 'El valle del Caudal: ciudad minera reconvertida, campus universitario y precios contenidos' },
  { key: 'langreo', slug: 'langreo', name: 'Langreo', kind: 'municipality', parent: 'asturias', area: 'centro', status: 'published', lat: 43.303, lng: -5.69, zoom: 12, sortOrder: 140, matchMunicipality: 'Langreo', subtitle: 'Sama y La Felguera en el valle del Nalón: patrimonio industrial y vivienda a buen precio' },
  { key: 'castrillon', slug: 'castrillon', name: 'Castrillón', kind: 'municipality', parent: 'asturias', area: 'centro', status: 'published', lat: 43.557, lng: -5.978, zoom: 12, sortOrder: 150, matchMunicipality: 'Castrillón', subtitle: 'Piedras Blancas y la playa de Salinas, el concejo residencial junto a Avilés' },
  { key: 'cudillero', slug: 'cudillero', name: 'Cudillero', kind: 'municipality', parent: 'asturias', area: 'occidente', status: 'published', lat: 43.562, lng: -6.146, zoom: 12, sortOrder: 160, matchMunicipality: 'Cudillero', subtitle: 'El pueblo-anfiteatro sobre el puerto y las playas del Aguilar y el Silencio' },
  { key: 'valdes', slug: 'valdes', name: 'Valdés (Luarca)', kind: 'municipality', parent: 'asturias', area: 'occidente', status: 'published', lat: 43.543, lng: -6.536, zoom: 12, sortOrder: 170, matchMunicipality: 'Valdés', subtitle: 'Luarca, la villa blanca, capital del concejo de Valdés: puerto, playas y aldeas' },
  { key: 'navia', slug: 'navia', name: 'Navia', kind: 'municipality', parent: 'asturias', area: 'occidente', status: 'published', lat: 43.539, lng: -6.722, zoom: 12, sortOrder: 180, matchMunicipality: 'Navia', subtitle: 'La ría de Navia, la playa y una villa con industria y servicios en el occidente' },
  { key: 'tapia-de-casariego', slug: 'tapia-de-casariego', name: 'Tapia de Casariego', kind: 'municipality', parent: 'asturias', area: 'occidente', status: 'published', lat: 43.57, lng: -6.944, zoom: 12, sortOrder: 190, matchMunicipality: 'Tapia de Casariego', subtitle: 'Villa marinera con puerto, faro y playas de surf en el extremo occidental de la costa' },
  { key: 'castropol', slug: 'castropol', name: 'Castropol', kind: 'municipality', parent: 'asturias', area: 'occidente', status: 'published', lat: 43.525, lng: -7.033, zoom: 12, sortOrder: 200, matchMunicipality: 'Castropol', subtitle: 'Sobre la ría del Eo, frente a Galicia: casas blasonadas, Figueras y el puente de los Santos' },
  { key: 'vegadeo', slug: 'vegadeo', name: 'Vegadeo', kind: 'municipality', parent: 'asturias', area: 'occidente', status: 'published', lat: 43.476, lng: -7.049, zoom: 12, sortOrder: 210, matchMunicipality: 'Vegadeo', subtitle: 'Villa comercial del valle del Eo, en el límite con Galicia' },
]

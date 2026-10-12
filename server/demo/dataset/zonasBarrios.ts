import type { DemoZone } from './zonas'

/**
 * Barrios de Gijón y Oviedo de la cuenta demo (nivel 2 de las zonas): cada
 * uno con contenido propio y diferenciado (intro, «Cómo es vivir aquí» y
 * preguntas), sin precios, estadísticas ni tiempos de trayecto inventados.
 * Las coordenadas son el centro aproximado del barrio, para el mapa.
 */
export const ZONAS_BARRIOS: DemoZone[] = [
  // ------------------------------------------------------------------ Gijón
  {
    key: 'gijon-centro', slug: 'centro', name: 'Centro', kind: 'neighborhood', parent: 'gijon', status: 'published', lat: 43.536, lng: -5.662, zoom: 15, sortOrder: 10, matchNeighborhood: 'Centro', image: 'asturias/gijon-01.jpg',
    subtitle: 'Entre el Muro, el puerto deportivo y las calles comerciales: todo a pie',
    intro: 'El Centro de Gijón es el barrio en el que la ciudad se concentra: las calles comerciales de Corrida y Los Moros, la plaza del Carmen, el puerto deportivo y, a dos pasos, el Muro de San Lorenzo. Vivir aquí es tener el comercio, la playa, las sidrerías y las estaciones a distancia de paseo, en edificios de distintas épocas con mucha variedad de pisos.\n\nEs la zona que eligen quienes no quieren depender del coche y valoran la vida urbana, y también quien busca un piso para alquilar con demanda constante. A cambio, los edificios son en su mayoría anteriores a los años ochenta, el aparcamiento es difícil y el ruido de la calle forma parte del barrio, sobre todo en las zonas de ocio.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Calles comerciales peatonales o de tráfico limitado, plazas con terrazas y el paseo marítimo como prolongación del salón de casa. Mezcla de edificios de principios del siglo XX, bloques de los sesenta y setenta y rehabilitaciones recientes.' },
      { title: 'Vivienda', text: 'Pisos de dos a cuatro dormitorios en edificios con y sin ascensor; áticos y pisos exteriores con vistas al mar muy buscados; pocos garajes, por lo que la plaza suele comprarse aparte. Las reformas integrales son habituales y conviene revisar instalaciones y comunidad.' },
      { title: 'Servicios', text: 'Comercio de todo tipo, mercado, supermercados, centros de salud, colegios e institutos cercanos y las estaciones de tren y autobús. El Ayuntamiento, los juzgados y la mayoría de las oficinas están en el barrio o en Cimavilla.' },
      { title: 'Movilidad', text: 'Casi todo se hace andando; el autobús urbano y el carril bici cruzan el barrio, y la bicicleta es la forma más rápida de moverse. Zona azul en casi todas las calles.' },
    ],
    faq: [
      { q: '¿Es ruidoso vivir en el Centro de Gijón?', a: 'Depende mucho de la calle y de la planta. Las calles de ocio nocturno y las comerciales son animadas hasta tarde; las calles interiores y los pisos altos son más tranquilos. Visitar la vivienda un viernes por la noche es la mejor forma de saberlo.' },
      { q: '¿Qué conviene revisar en un piso antiguo del Centro?', a: 'La instalación eléctrica, las tuberías, las ventanas y el estado del edificio (fachada, cubierta, ascensor, ITE), además de las actas de la comunidad. Muchos pisos ya están reformados; en los que no, el presupuesto de reforma debe entrar en la decisión.' },
      { q: '¿Se puede aparcar?', a: 'Difícilmente en la calle. Si la vivienda no tiene garaje, lo habitual es alquilar o comprar una plaza en un parking cercano o prescindir del coche, que en el Centro es perfectamente posible.' },
    ],
  },
  {
    key: 'gijon-cimavilla', slug: 'cimavilla', name: 'Cimavilla', kind: 'neighborhood', parent: 'gijon', status: 'published', lat: 43.546, lng: -5.664, zoom: 16, sortOrder: 20, matchNeighborhood: 'Cimavilla', image: 'asturias/gijon-03.jpg',
    subtitle: 'El barrio de pescadores sobre el cerro de Santa Catalina: casas bajas, plazas y mar por los dos lados',
    intro: 'Cimavilla, o Cimadevilla, es el barrio antiguo de Gijón: una península entre el puerto deportivo y la playa, con calles estrechas, casas de pescadores de colores, plazas con sidrerías y el cerro de Santa Catalina como parque en lo alto. Es el barrio con más carácter de la ciudad y uno de los más pequeños.\n\nSe vive en casas rehabilitadas y en edificios de pocas plantas, casi siempre sin ascensor ni garaje; a cambio, mar por los dos lados, vida de barrio y el centro a un paso. Es una zona para quien valora la historia y el ambiente por encima de la comodidad de un edificio moderno, y conviene conocer bien el estado del edificio antes de comprar.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Calles empedradas, casas de dos y tres alturas, plazas como la del Marqués y la de Arturo Arias, el Elogio del Horizonte en lo alto del cerro y el puerto deportivo abajo. Mucha vida en las sidrerías y terrazas, sobre todo con buen tiempo.' },
      { title: 'Vivienda', text: 'Casas de pescadores rehabilitadas, pisos en edificios de pocas plantas sin ascensor, algún edificio nuevo en el borde del barrio. Superficies pequeñas o medianas, distribución singular y, a menudo, obras pendientes en las comunidades.' },
      { title: 'Servicios', text: 'Comercio pequeño, sidrerías y restaurantes; para supermercados, colegios y centros de salud se baja al Centro, a pocos minutos a pie. El Ayuntamiento y la plaza Mayor están en el propio borde del barrio.' },
      { title: 'Movilidad', text: 'A pie, y poco más: el tráfico está restringido en buena parte del barrio y no hay garajes. Los aparcamientos del puerto y del Centro son la alternativa.' },
    ],
    faq: [
      { q: '¿Qué hay que revisar en una casa de Cimavilla?', a: 'Estructura y humedades en edificios antiguos, cubierta, instalaciones y la situación legal de las reformas; en comunidades pequeñas, el estado de las cuentas y las obras pendientes. Un informe técnico antes de la oferta es muy recomendable.' },
      { q: '¿Es un barrio tranquilo para vivir?', a: 'Durante el día sí; por las tardes y noches de buen tiempo, las plazas con sidrerías se llenan. Las calles interiores y la zona del cerro son más tranquilas que las plazas.' },
      { q: '¿Se puede vivir sin coche?', a: 'Es lo habitual: el Centro, las estaciones y la playa están a pocos minutos a pie, y no hay garajes en el barrio.' },
    ],
  },
  {
    key: 'gijon-somio', slug: 'somio', name: 'Somió', kind: 'neighborhood', parent: 'gijon', status: 'published', lat: 43.533, lng: -5.625, zoom: 14, sortOrder: 30, matchNeighborhood: 'Somió',
    subtitle: 'La ciudad jardín de Gijón: chalés con parcela y calles arboladas junto al Rinconín',
    intro: 'Somió es la zona de casas con jardín de Gijón: una parroquia residencial al este de la ciudad, entre la senda del Rinconín y Cabueñes, con chalés de distintas épocas, fincas grandes y calles tranquilas arboladas. Es donde buscan quienes quieren casa con terreno sin salir del municipio.\n\nLa vida aquí es distinta a la del resto de la ciudad: menos comercio a pie, más coche y más espacio. Los colegios privados y concertados de la zona, el campus de Viesques y el acceso rápido al Centro por la avenida y la senda litoral explican su demanda, sobre todo entre familias.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Calles sin apenas comercio, parcelas con setos y muros, casas de principios del siglo XX junto a chalés de los años setenta, ochenta y promociones recientes de adosados. El Rinconín y la senda costera son el paseo diario.' },
      { title: 'Vivienda', text: 'Chalés independientes con parcela, pareados y adosados, alguna villa histórica y pequeños bloques en los bordes. Las parcelas y las calidades varían mucho; conviene revisar el estado de la casa, los cerramientos y la urbanización de la calle.' },
      { title: 'Servicios', text: 'Varios colegios privados y concertados, centro de salud, polideportivo y supermercados en los ejes principales; el comercio de proximidad es escaso y se compensa con el Centro y los centros comerciales del este.' },
      { title: 'Movilidad', text: 'Coche para casi todo, con garaje en la mayoría de las casas. Autobús urbano por las avenidas y carril bici hacia el Centro por la costa.' },
    ],
    faq: [
      { q: '¿Qué tipo de casa se encuentra en Somió?', a: 'Desde villas antiguas con parcela grande hasta adosados recientes con jardín pequeño, pasando por chalés de los años setenta y ochenta, muchos por actualizar. La oferta es variada en tamaño y en estado.' },
      { q: '¿Es una zona para familias?', a: 'Sí, por la vivienda con jardín, la tranquilidad y la cercanía de varios colegios, aunque obliga a usar el coche a diario para el comercio y las actividades.' },
      { q: '¿Qué conviene revisar en una casa con parcela?', a: 'Cubierta, humedades, instalaciones, calefacción, cerramientos y el estado de la parcela; también la licencia de las ampliaciones y la situación en Catastro.' },
    ],
  },
  {
    key: 'gijon-viesques', slug: 'viesques', name: 'Viesques', kind: 'neighborhood', parent: 'gijon', status: 'published', lat: 43.523, lng: -5.64, zoom: 15, sortOrder: 40, matchNeighborhood: 'Viesques',
    subtitle: 'Barrio del campus: bloques recientes con garaje, parques y mucha vida universitaria',
    intro: 'Viesques es el barrio que creció alrededor del campus universitario en el sureste de Gijón: bloques de obra nueva y de los últimos veinte años, calles anchas, parques y una población mezclada de familias y estudiantes. Es una de las zonas con más vivienda reciente de la ciudad.\n\nQuien compra aquí busca garaje, ascensor, zonas comunes y un barrio ordenado, aceptando que el Centro y la playa quedan a un trayecto en autobús o bicicleta. La demanda de alquiler, por el campus, es constante.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Urbanismo de los años noventa y dos mil: bloques de cuatro a ocho plantas, bulevares, parques y el campus como vecino. Comercio en los bajos y centros comerciales cerca.' },
      { title: 'Vivienda', text: 'Pisos de dos a cuatro dormitorios en edificios con ascensor, garaje y trastero, a menudo con zonas comunes y piscina; obra nueva en las promociones más recientes. Pocas viviendas antiguas.' },
      { title: 'Servicios', text: 'Campus universitario, colegios e institutos, polideportivo, centro de salud, supermercados y comercio de proximidad. El hospital de Cabueñes está cerca.' },
      { title: 'Movilidad', text: 'Autobús urbano frecuente hacia el Centro, carril bici y acceso rápido a la autopista. La mayoría de las viviendas tienen garaje.' },
    ],
    faq: [
      { q: '¿Viesques es un barrio de estudiantes?', a: 'El campus marca el ambiente y la demanda de alquiler, pero el barrio es sobre todo residencial, con muchas familias en los bloques recientes.' },
      { q: '¿Hay obra nueva en Viesques?', a: 'Es una de las zonas con más promociones recientes de Gijón. En el catálogo verás las que tenemos publicadas.' },
      { q: '¿Se puede vivir sin coche?', a: 'Sí, con el autobús urbano y la bicicleta, aunque la mayoría de los vecinos tienen garaje y usan el coche para salir de la ciudad.' },
    ],
  },
  {
    key: 'gijon-la-arena', slug: 'la-arena', name: 'La Arena', kind: 'neighborhood', parent: 'gijon', status: 'published', lat: 43.539, lng: -5.656, zoom: 15, sortOrder: 50, matchNeighborhood: 'La Arena',
    subtitle: 'El barrio de la playa: bloques de los sesenta y setenta a un paso del Muro y del comercio',
    intro: 'La Arena es el barrio que se extiende detrás de la playa de San Lorenzo, entre el Centro y el Piles: calles comerciales, bloques de los años sesenta y setenta y el Muro como fachada. Es una zona muy demandada por quien quiere la playa a diario sin renunciar al comercio y los servicios de barrio.\n\nLos pisos son en su mayoría de esa época, algunos reformados, con ascensor y sin garaje; los exteriores con vistas al mar son los más buscados. La vida de barrio es intensa todo el año.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Trama regular de calles comerciales, plazas pequeñas, el paseo marítimo y el parque de Isabel la Católica en el extremo este. Edificios de ocho a doce plantas de los sesenta y setenta con bajos comerciales.' },
      { title: 'Vivienda', text: 'Pisos de dos a cuatro dormitorios con ascensor, muchos exteriores y luminosos; garaje escaso, reformas frecuentes. Conviene revisar instalaciones, carpinterías y las obras de la comunidad (fachadas e ITE).' },
      { title: 'Servicios', text: 'Comercio de proximidad, mercado, supermercados, colegios, centro de salud y polideportivo. El estadio de El Molinón y el parque quedan en el borde del barrio.' },
      { title: 'Movilidad', text: 'A pie al Centro y a la playa; autobús urbano y carril bici por el Muro. Zona azul en la mayoría de las calles.' },
    ],
    faq: [
      { q: '¿Cómo son los pisos de La Arena?', a: 'Bloques de los sesenta y setenta con ascensor, pisos amplios y exteriores, a menudo reformados. Garaje escaso: la plaza suele comprarse o alquilarse aparte.' },
      { q: '¿Es un barrio para vivir todo el año?', a: 'Sí, es uno de los barrios con más vida de la ciudad en invierno y en verano, con comercio y servicios completos.' },
      { q: '¿Qué conviene revisar?', a: 'Las obras de la comunidad (fachada, ITE, ascensor), las instalaciones del piso y la orientación, que marca la diferencia en un edificio de esa época.' },
    ],
  },
  {
    key: 'gijon-el-llano', slug: 'el-llano', name: 'El Llano', kind: 'neighborhood', parent: 'gijon', status: 'published', lat: 43.528, lng: -5.665, zoom: 15, sortOrder: 60, matchNeighborhood: 'El Llano',
    subtitle: 'El barrio más poblado: vida de barrio, comercio de siempre y pisos de los sesenta y setenta',
    intro: 'El Llano es el gran barrio del sur del Centro de Gijón: calles densas, comercio tradicional, mercado y una vida de barrio reconocible, con bloques de los años sesenta y setenta y algunas promociones posteriores en sus bordes. Es una zona práctica, bien comunicada y con precios más contenidos que la primera línea.\n\nQuien compra aquí busca un piso para vivir o para alquilar con todos los servicios a pie y buena conexión con el resto de la ciudad. Muchas viviendas están reformadas; en las que no, el estado del edificio y de la comunidad es lo primero que hay que mirar.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Calles rectas y densas, plazas de barrio, comercio en todos los bajos y una población mezclada de vecinos de siempre y recién llegados. Bloques de seis a diez plantas con ascensor.' },
      { title: 'Vivienda', text: 'Pisos de dos y tres dormitorios de los sesenta y setenta, muchos reformados, y promociones de los años noventa y dos mil en los bordes. Garaje escaso en el interior del barrio.' },
      { title: 'Servicios', text: 'Mercado, comercio tradicional, supermercados, colegios públicos y concertados, institutos, centro de salud y polideportivo. El Centro y la estación quedan a corta distancia a pie.' },
      { title: 'Movilidad', text: 'Autobús urbano por las avenidas, carril bici y acceso rápido a la autopista. Aparcamiento regulado en buena parte de las calles.' },
    ],
    faq: [
      { q: '¿Cómo son los precios en El Llano?', a: 'En el catálogo verás lo que tenemos publicado; en general, el barrio ofrece viviendas de segunda mano a precios más contenidos que el Centro y La Arena, con superficies similares.' },
      { q: '¿Qué conviene revisar en un piso de El Llano?', a: 'Instalaciones, carpinterías, ascensor y las cuentas y obras de la comunidad; en edificios de los sesenta y setenta la ITE y el estado de la fachada marcan la diferencia.' },
      { q: '¿Es un barrio bien comunicado?', a: 'Sí: a pie al Centro y la estación, autobús urbano por varias avenidas y salida rápida a la autopista.' },
    ],
  },
  {
    key: 'gijon-el-bibio', slug: 'el-bibio', name: 'El Bibio', kind: 'neighborhood', parent: 'gijon', status: 'published', lat: 43.534, lng: -5.645, zoom: 15, sortOrder: 70, matchNeighborhood: 'El Bibio',
    subtitle: 'Entre el parque de Isabel la Católica y Viesques: bloques recientes y calles tranquilas',
    intro: 'El Bibio es un barrio residencial del este de Gijón, entre el parque de Isabel la Católica, la plaza de toros y Viesques, con bloques de los años ochenta, noventa y dos mil, calles tranquilas y buenos parques. Es una zona intermedia: cerca de la playa y del Centro, pero con vivienda más reciente y garaje.\n\nSe elige por la tranquilidad, los colegios y la proximidad al campus y al parque, y por una oferta de pisos amplios con ascensor y garaje que no abunda en la primera línea.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Calles arboladas, bloques de cuatro a ocho plantas con zonas ajardinadas, el parque de Isabel la Católica como vecino y la playa a un paseo. Comercio en los ejes principales.' },
      { title: 'Vivienda', text: 'Pisos de tres y cuatro dormitorios de los ochenta y noventa, con ascensor y garaje, y promociones más recientes; algunos chalés en los bordes.' },
      { title: 'Servicios', text: 'Colegios, polideportivo, centro de salud, supermercados y el parque; el campus de Viesques y el hospital de Cabueñes quedan cerca.' },
      { title: 'Movilidad', text: 'Autobús urbano, carril bici por el Muro y el parque, y garaje en la mayoría de las viviendas.' },
    ],
    faq: [
      { q: '¿Qué diferencia hay entre El Bibio y Viesques?', a: 'El Bibio es algo anterior, más cerca de la playa y del parque, con bloques de los ochenta y noventa; Viesques es más reciente y gira alrededor del campus.' },
      { q: '¿Es una zona tranquila?', a: 'Sí, salvo los días de eventos en la plaza de toros y en el estadio, cercanos.' },
      { q: '¿Hay garaje en las viviendas?', a: 'En la mayoría de los edificios de los ochenta en adelante, sí.' },
    ],
  },
  {
    key: 'gijon-montevil', slug: 'montevil', name: 'Montevil', kind: 'neighborhood', parent: 'gijon', status: 'published', lat: 43.518, lng: -5.67, zoom: 15, sortOrder: 80, matchNeighborhood: 'Montevil',
    subtitle: 'El sur de la ciudad: obra nueva, bulevares y parques para familias que buscan espacio',
    intro: 'Montevil es uno de los barrios nuevos del sur de Gijón, construido en los años dos mil junto a Nuevo Roces: bulevares anchos, bloques con zonas comunes, parques y colegios dentro del barrio. Es la zona que eligen muchas familias que priorizan una vivienda reciente, garaje y espacio al aire libre.\n\nEl Centro y la playa quedan a un trayecto en autobús o en coche; a cambio, el barrio tiene sus propios servicios y una tranquilidad difícil de encontrar en la ciudad consolidada.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Urbanismo reciente: manzanas con patios interiores, bloques de cinco a ocho plantas, carriles bici, parques y un centro comercial cercano. Vecindario joven, con muchas familias.' },
      { title: 'Vivienda', text: 'Pisos de obra reciente de dos a cuatro dormitorios, con ascensor, garaje, trastero y zonas comunes; promociones de obra nueva en los bordes del barrio.' },
      { title: 'Servicios', text: 'Colegios e instituto, escuela infantil, centro de salud, polideportivo, supermercados y centro comercial a corta distancia.' },
      { title: 'Movilidad', text: 'Autobús urbano hacia el Centro, acceso directo a la autopista y garaje en todas las viviendas; la bicicleta llega al Centro por el carril bici.' },
    ],
    faq: [
      { q: '¿Montevil está lejos del Centro?', a: 'Está en el sur de la ciudad; el Centro queda a un trayecto en autobús, coche o bicicleta. Muchos vecinos resuelven el día a día en el propio barrio.' },
      { q: '¿Qué tipo de vivienda hay?', a: 'Pisos recientes con garaje, trastero y zonas comunes, y obra nueva en las promociones en curso. Pocas viviendas antiguas.' },
      { q: '¿Es un barrio para familias?', a: 'Sí: colegios, parques, calles tranquilas y vivienda amplia son sus argumentos principales.' },
    ],
  },

  // ----------------------------------------------------------------- Oviedo
  {
    key: 'oviedo-centro', slug: 'centro', name: 'Centro', kind: 'neighborhood', parent: 'oviedo', status: 'published', lat: 43.362, lng: -5.845, zoom: 15, sortOrder: 10, matchNeighborhood: 'Centro', image: 'asturias/oviedo-03.jpg',
    subtitle: 'El casco antiguo, Uría y el Campo de San Francisco: la ciudad a pie',
    intro: 'El Centro de Oviedo reúne el casco antiguo, con la catedral y el Fontán, las calles comerciales de Uría y Fruela y el Campo de San Francisco, el parque de la ciudad. Es la zona para quien quiere vivir en una ciudad limpia y ordenada sin usar el coche, con el comercio, la cultura y las estaciones a pocos minutos.\n\nLos edificios son de principios y mediados del siglo XX, con pisos amplios, techos altos y portales cuidados, y bloques de los sesenta y setenta en la primera corona. El garaje escasea y el aparcamiento es regulado; a cambio, todo está a mano.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Calles peatonales, plazas del casco antiguo, el eje comercial de Uría y el Campo de San Francisco como centro de la vida diaria. Teatro Campoamor, mercado del Fontán y sidrerías de Gascona a un paso.' },
      { title: 'Vivienda', text: 'Pisos amplios en edificios de principios del siglo XX, muchos rehabilitados, y bloques de los sesenta y setenta en los bordes. Garaje escaso; comunidades con historia y, a veces, obras pendientes.' },
      { title: 'Servicios', text: 'Comercio de todo tipo, mercado, supermercados, colegios, centros de salud, administración regional, juzgados y las estaciones de tren y autobús.' },
      { title: 'Movilidad', text: 'A pie y en autobús urbano; aparcamiento regulado en toda la zona y parkings públicos. Las cuestas del casco antiguo son suaves pero constantes.' },
    ],
    faq: [
      { q: '¿Qué conviene revisar en un piso antiguo del Centro de Oviedo?', a: 'La estructura y las instalaciones del edificio, el ascensor, la ITE y las cuentas de la comunidad; en el piso, instalaciones, carpinterías y aislamiento, que en edificios antiguos marca el gasto de calefacción.' },
      { q: '¿Es una zona tranquila?', a: 'Las calles interiores y el entorno del Campo de San Francisco lo son; las calles de ocio y las comerciales tienen más actividad. Visitar a distintas horas ayuda a decidir.' },
      { q: '¿Hay garaje en los edificios del Centro?', a: 'Poco. Lo habitual es comprar o alquilar una plaza en un parking cercano o prescindir del coche.' },
    ],
  },
  {
    key: 'oviedo-montecerrao', slug: 'montecerrao', name: 'Montecerrao', kind: 'neighborhood', parent: 'oviedo', status: 'published', lat: 43.352, lng: -5.856, zoom: 15, sortOrder: 20, matchNeighborhood: 'Montecerrao',
    subtitle: 'El sur residencial: bloques de los noventa y dos mil con garaje, zonas comunes y parques',
    intro: 'Montecerrao es el barrio residencial del sur de Oviedo, construido sobre todo entre los años noventa y dos mil: urbanizaciones con zonas comunes, bloques con garaje y trastero, bulevares y parques, y una población mayoritariamente familiar. Es una de las zonas que más se piden a Norte Astur en la capital.\n\nSe elige por la vivienda reciente y amplia, la tranquilidad y los servicios del propio barrio, con el Centro a un trayecto en autobús o en coche. La obra nueva sigue apareciendo en sus bordes.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Urbanizaciones cerradas y bloques abiertos de cinco a ocho plantas, calles anchas, parques y comercio en los ejes principales. Ambiente familiar y tranquilo.' },
      { title: 'Vivienda', text: 'Pisos de dos a cuatro dormitorios de los noventa y dos mil con ascensor, garaje, trastero y a menudo piscina; promociones de obra nueva recientes.' },
      { title: 'Servicios', text: 'Colegios y escuelas infantiles, centro de salud, polideportivo, supermercados y comercio de proximidad; el hospital y el Centro a corta distancia.' },
      { title: 'Movilidad', text: 'Autobús urbano hacia el Centro, salida directa a la autopista y garaje en todas las viviendas.' },
    ],
    faq: [
      { q: '¿Qué tipo de vivienda hay en Montecerrao?', a: 'Sobre todo pisos de los noventa y dos mil en urbanizaciones con zonas comunes, y obra nueva en las promociones recientes. Pocas viviendas antiguas.' },
      { q: '¿Cómo es la cuota de comunidad?', a: 'Depende de los servicios de la urbanización (piscina, jardines, conserjería). Pregunta por la cuota y las derramas antes de ofrecer.' },
      { q: '¿Está bien comunicado con el Centro?', a: 'Sí, en autobús urbano y en coche; a pie es un paseo largo.' },
    ],
  },
  {
    key: 'oviedo-la-florida', slug: 'la-florida', name: 'La Florida', kind: 'neighborhood', parent: 'oviedo', status: 'published', lat: 43.366, lng: -5.872, zoom: 15, sortOrder: 30, matchNeighborhood: 'La Florida',
    subtitle: 'El oeste nuevo de la ciudad: barrio planificado con vivienda reciente y mucho verde',
    intro: 'La Florida es uno de los barrios más nuevos de Oviedo, en el oeste de la ciudad: un desarrollo de los años dos mil con bulevares, parques, carriles bici y bloques de vivienda reciente, pensado desde el principio para familias. Es la alternativa a Montecerrao para quien busca obra nueva o casi nueva.\n\nEl barrio tiene colegio, escuela infantil, comercio y supermercados propios, y el Centro queda a un trayecto en autobús o coche. Las promociones de obra nueva siguen completándolo.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Manzanas ordenadas, bulevares anchos, parques y zonas deportivas; bloques de cinco a ocho plantas con patios y zonas comunes. Población joven y familiar.' },
      { title: 'Vivienda', text: 'Pisos de obra reciente de dos a cuatro dormitorios con ascensor, garaje, trastero y zonas comunes; obra nueva en curso en varias manzanas.' },
      { title: 'Servicios', text: 'Colegio, escuela infantil, centro de salud, supermercados, comercio de proximidad y zonas deportivas en el propio barrio.' },
      { title: 'Movilidad', text: 'Autobús urbano, carril bici hacia el Centro y salida rápida a la autopista; garaje en todas las viviendas.' },
    ],
    faq: [
      { q: '¿Hay obra nueva en La Florida?', a: 'Sí, es una de las zonas con más promociones en marcha de Oviedo. En el catálogo verás las publicadas con su estado y entrega.' },
      { q: '¿Está lejos del Centro?', a: 'Está en el oeste de la ciudad; en autobús o coche el trayecto es corto, y a pie es un paseo largo.' },
      { q: '¿Es una zona consolidada?', a: 'Los servicios básicos ya están en el barrio; el comercio y las dotaciones siguen creciendo con las nuevas manzanas.' },
    ],
  },
  {
    key: 'oviedo-ciudad-naranco', slug: 'ciudad-naranco', name: 'Ciudad Naranco', kind: 'neighborhood', parent: 'oviedo', status: 'published', lat: 43.376, lng: -5.86, zoom: 15, sortOrder: 40, matchNeighborhood: 'Ciudad Naranco',
    subtitle: 'A los pies del monte Naranco: barrio consolidado con buena relación entre superficie y precio',
    intro: 'Ciudad Naranco es el barrio del norte de Oviedo que sube hacia el monte Naranco: bloques de los años setenta y ochenta con algunas promociones posteriores, calles en cuesta, comercio de barrio y el monte como parque. Es una zona consolidada, con vecindario estable y buena relación entre superficie y precio.\n\nSe elige por los pisos amplios, la cercanía del Centro y la salida directa al monte para pasear o correr. Conviene valorar la orientación y las cuestas al elegir vivienda.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Calles en pendiente, bloques de seis a diez plantas de los setenta y ochenta, comercio en los bajos y el monte Naranco, con sus iglesias prerrománicas y miradores, como vecino.' },
      { title: 'Vivienda', text: 'Pisos de tres y cuatro dormitorios amplios, muchos reformados, con ascensor y a veces garaje; promociones más recientes en los bordes.' },
      { title: 'Servicios', text: 'Colegios, institutos, centro de salud, polideportivo, supermercados y comercio de proximidad; el Centro a un paseo cuesta abajo.' },
      { title: 'Movilidad', text: 'Autobús urbano frecuente, acceso a la autopista y aparcamiento algo más fácil que en el Centro.' },
    ],
    faq: [
      { q: '¿Cómo son los pisos de Ciudad Naranco?', a: 'Amplios, en bloques de los setenta y ochenta, muchos reformados; conviene revisar instalaciones, ascensor y la comunidad.' },
      { q: '¿Las cuestas son un problema?', a: 'Para algunas personas sí; el autobús urbano resuelve la subida y el Centro queda cuesta abajo. Visita la calle concreta antes de decidir.' },
      { q: '¿Es un barrio bien comunicado?', a: 'Sí, con el Centro a pie y en autobús y salida directa a la autopista.' },
    ],
  },
  {
    key: 'oviedo-buenavista', slug: 'buenavista', name: 'Buenavista', kind: 'neighborhood', parent: 'oviedo', status: 'published', lat: 43.364, lng: -5.865, zoom: 15, sortOrder: 50, matchNeighborhood: 'Buenavista',
    subtitle: 'El oeste consolidado: calles anchas, bloques de varias épocas y el Palacio de Congresos',
    intro: 'Buenavista es el barrio del oeste de Oviedo que creció a mediados del siglo XX alrededor del antiguo hospital y el estadio, y que hoy tiene el Palacio de Exposiciones y Congresos como referencia: calles anchas, bloques de los sesenta a los ochenta junto a promociones recientes, comercio y servicios completos.\n\nEs una zona práctica, a medio camino entre el Centro y La Florida, con vivienda de distintas épocas y precios, y por tanto con opciones para presupuestos muy distintos.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Avenidas anchas, bloques de ocho a doce plantas de los sesenta a los ochenta, zonas nuevas junto al Palacio de Congresos y comercio en los bajos. Ambiente de barrio consolidado.' },
      { title: 'Vivienda', text: 'Pisos de tres dormitorios en bloques de los sesenta a los ochenta, muchos reformados, y viviendas recientes con garaje en las promociones nuevas.' },
      { title: 'Servicios', text: 'Colegios, institutos, centro de salud, polideportivo, supermercados, comercio y el Palacio de Congresos con su galería comercial.' },
      { title: 'Movilidad', text: 'Autobús urbano, acceso a la autopista y el Centro a un paseo; aparcamiento regulado en parte de las calles.' },
    ],
    faq: [
      { q: '¿Qué diferencia hay entre Buenavista y La Florida?', a: 'Buenavista es un barrio consolidado con edificios de varias épocas y servicios maduros; La Florida es nuevo, con vivienda reciente y dotaciones aún en crecimiento.' },
      { q: '¿Qué conviene revisar en un piso de los sesenta de Buenavista?', a: 'Instalaciones, carpinterías, ascensor y las obras de la comunidad (fachada, ITE), además de la orientación.' },
      { q: '¿Es una zona bien comunicada?', a: 'Sí, con el Centro a pie o en autobús y salida directa a la autopista.' },
    ],
  },
  {
    key: 'oviedo-la-corredoria', slug: 'la-corredoria', name: 'La Corredoria', kind: 'neighborhood', parent: 'oviedo', status: 'published', lat: 43.385, lng: -5.83, zoom: 15, sortOrder: 60, matchNeighborhood: 'La Corredoria',
    subtitle: 'El barrio que más creció en los dos mil: vivienda reciente, estación y servicios propios',
    intro: 'La Corredoria, al noreste de Oviedo, es el barrio que más ha crecido en las últimas décadas: manzanas de vivienda de los años dos mil con garaje y zonas comunes, estación de tren propia, colegios, polideportivo y comercio. Funciona casi como una ciudad dentro de la ciudad, con población joven y familiar.\n\nSe elige por la vivienda reciente a precios más contenidos que en el sur y por la estación, que conecta con el Centro y con Gijón. El coche sigue siendo habitual para muchos desplazamientos.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Manzanas de bloques de seis a ocho plantas con patios y zonas comunes, bulevares, parques y comercio en los bajos. Barrio joven y con mucha actividad.' },
      { title: 'Vivienda', text: 'Pisos de dos a cuatro dormitorios de los dos mil con ascensor, garaje y trastero; promociones recientes en los bordes.' },
      { title: 'Servicios', text: 'Colegios e instituto, escuelas infantiles, centro de salud, polideportivo, supermercados y comercio; estación de tren en el propio barrio.' },
      { title: 'Movilidad', text: 'Tren y autobús urbano hacia el Centro, acceso a la autopista y garaje en casi todas las viviendas.' },
    ],
    faq: [
      { q: '¿Está lejos del Centro?', a: 'Está en el noreste de la ciudad; el tren y el autobús lo acercan, y en coche el trayecto es corto.' },
      { q: '¿Qué tipo de vivienda hay?', a: 'Sobre todo pisos de los dos mil con garaje y zonas comunes, y obra nueva en las promociones en curso.' },
      { q: '¿Es un barrio para familias?', a: 'Sí: colegios, parques y vivienda amplia a precios más contenidos que en otras zonas nuevas.' },
    ],
  },
  {
    key: 'oviedo-san-lazaro', slug: 'san-lazaro', name: 'San Lázaro', kind: 'neighborhood', parent: 'oviedo', status: 'published', lat: 43.362, lng: -5.83, zoom: 15, sortOrder: 70, matchNeighborhood: 'San Lázaro',
    subtitle: 'El este cercano al Centro: barrio de bloques consolidados y calles comerciales',
    intro: 'San Lázaro es un barrio del este de Oviedo, cercano al Centro y a las estaciones, con bloques de los años sesenta y setenta, comercio de barrio y una población estable. Es una zona práctica para quien quiere vivir cerca del Centro con precios más contenidos.\n\nLos pisos son en su mayoría de esa época, algunos reformados; conviene revisar el estado de los edificios y de las comunidades, como en el resto de barrios consolidados de la ciudad.',
    sections: [
      { title: 'Cómo es el barrio', text: 'Calles comerciales, bloques de seis a diez plantas, plazas de barrio y buena conexión con el Centro. Ambiente de barrio tradicional.' },
      { title: 'Vivienda', text: 'Pisos de dos y tres dormitorios de los sesenta y setenta, con ascensor en la mayoría de los edificios y garaje escaso; promociones más recientes en los bordes.' },
      { title: 'Servicios', text: 'Colegios, centro de salud, supermercados y comercio de proximidad; las estaciones y el Centro a corta distancia.' },
      { title: 'Movilidad', text: 'A pie al Centro y a las estaciones, autobús urbano y acceso a la autopista.' },
    ],
    faq: [
      { q: '¿Qué conviene revisar en San Lázaro?', a: 'El estado del edificio (fachada, cubierta, ascensor, ITE), las instalaciones del piso y las cuentas de la comunidad.' },
      { q: '¿Es un barrio bien comunicado?', a: 'Sí, por su cercanía al Centro y a las estaciones de tren y autobús.' },
      { q: '¿Hay obra nueva?', a: 'Poca; es un barrio consolidado con alguna promoción puntual en sus bordes.' },
    ],
  },
]

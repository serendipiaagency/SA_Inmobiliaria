import { IMAGES } from './images'
import { cta, faq, h2, h3, img, info, keypoints, p, table, tip, warn, type GuiaArticle } from './types'

/**
 * Artículo 5 · Obra nueva o segunda mano: tabla comparativa y módulo de
 * prioridades (bloque comparator). Normativa citada: Ley 38/1999 de Ordenación
 * de la Edificación (garantías de 1, 3 y 10 años; aval de las cantidades
 * anticipadas, disposición adicional primera), Ley 5/2019 (hipoteca).
 */
export const obraNuevaVsSegundaMano: GuiaArticle = {
  key: 'g05',
  slug: 'obra-nueva-vs-segunda-mano',
  title: 'Obra nueva o segunda mano: qué conviene en cada caso',
  subtitle: 'Precio, impuestos, plazos, garantías, eficiencia, ubicación y margen de negociación, comparados sin preferencias. Y un módulo para ordenar tus prioridades y ver hacia dónde te inclinan.',
  seoTitle: 'Obra nueva o segunda mano: comparativa completa para decidir',
  seoDescription: 'Obra nueva y segunda mano comparadas: precio, impuestos (IVA y AJD frente a ITP), plazos, garantías, eficiencia, ubicación y negociación. Con módulo de prioridades.',
  focusKeyword: 'obra nueva o segunda mano',
  category: 'guias',
  reviewedAt: '2026-10-10',
  cover: IMAGES['g05-cover'],
  related: ['gastos-impuestos-comprar-vivienda', 'que-revisar-antes-comprar-casa', 'como-saber-vivienda-bien-precio'],
  blocks: [
    p('No hay una respuesta buena para todos. La obra nueva ofrece una vivienda a estrenar, eficiente y con garantías legales, a cambio de esperar, pagar impuestos más altos y, casi siempre, vivir más lejos del centro. La segunda mano ofrece ubicación, disponibilidad inmediata y margen de negociación, a cambio de asumir el estado del edificio y de la vivienda. Lo que sigue es una comparación punto por punto, con los datos que se pueden comprobar, y un módulo para que ordenes tus prioridades.'),
    keypoints([
      'En impuestos, la obra nueva paga IVA (10 %) más AJD (0,5–1,5 % según la comunidad); la segunda mano paga ITP (del 4 % al 10 % o más). La diferencia suele favorecer a la segunda mano, pero depende de la comunidad.',
      'La obra nueva tiene garantías legales de 1, 3 y 10 años (Ley de Ordenación de la Edificación) y las cantidades que anticipas deben estar avaladas o aseguradas.',
      'La segunda mano se entrega en semanas; la obra nueva sobre plano, en uno o dos años, con el riesgo de retrasos.',
      'Reformar una vivienda de segunda mano puede acercarla al confort de una nueva, pero el coste y las molestias deben entrar en la comparación desde el principio.',
      'La ubicación es el factor que menos se puede cambiar después. Pesa más que casi todo lo demás en la reventa.',
    ]),
    { type: 'comparator', title: 'Obra nueva frente a segunda mano, punto por punto', labelA: 'Obra nueva', labelB: 'Segunda mano', rows: [
      { label: 'Impuestos', a: 'IVA 10 % (IGIC 7 % en Canarias) + AJD autonómico (0,5–1,5 %)', b: 'ITP autonómico (4–13 % según comunidad y precio)' },
      { label: 'Precio por m²', a: 'Más alto en la misma zona; sin margen de negociación en promociones que se venden bien', b: 'Más bajo; negociable, sobre todo si necesita reforma' },
      { label: 'Plazo de entrega', a: 'Sobre plano: 12–30 meses; posibles retrasos', b: 'Semanas desde las arras hasta la firma' },
      { label: 'Pagos', a: 'Reserva + entregas a cuenta durante la obra (avaladas) + resto en la escritura', b: 'Arras (≈10 %) + resto en la escritura' },
      { label: 'Garantías', a: '1 año acabados, 3 años habitabilidad, 10 años estructura (LOE)', b: 'Vicios ocultos: 6 meses desde la entrega (Código Civil); lo demás, lo que se vea en la visita' },
      { label: 'Eficiencia energética', a: 'Letra A o B por normativa actual; consumo bajo', b: 'Habitualmente D a G salvo reforma; el certificado lo dice' },
      { label: 'Ubicación', a: 'Normalmente en ensanches, periferia o solares singulares', b: 'Donde ya está la ciudad: centro, barrios consolidados, servicios hechos' },
      { label: 'Estado y reformas', a: 'A estrenar; posibilidad de elegir acabados', b: 'Lo que hay; la reforma permite adaptarla, con coste y tiempo' },
      { label: 'Comunidad', a: 'Nueva, sin historial ni fondo de reserva; cuotas por definir', b: 'Historial conocido: actas, derramas, morosidad, fondo de reserva' },
      { label: 'Hipoteca', a: 'Se firma a la entrega; las condiciones pueden cambiar hasta entonces', b: 'Se firma en semanas con las condiciones actuales' },
      { label: 'Superficies y distribución', a: 'Más compactas; distribución optimizada; terrazas y zonas comunes', b: 'Más metros por el mismo precio en edificios antiguos; distribuciones a veces anticuadas' },
      { label: 'Riesgo', a: 'Retrasos, cambios en el proyecto, promotor que no termina (el aval protege el dinero, no el tiempo)', b: 'Lo que no se vio en la visita: instalaciones, humedades, derramas' },
    ], quizTitle: 'Tus prioridades', questions: [
      { q: '¿Cuándo necesitas entrar a vivir?', options: [{ label: 'En menos de seis meses', favors: 'b' }, { label: 'Puedo esperar uno o dos años', favors: 'a' }, { label: 'Me da igual', favors: 'none' }] },
      { q: '¿Dónde quieres vivir?', options: [{ label: 'En el centro o en un barrio consolidado', favors: 'b' }, { label: 'En una zona nueva con servicios por llegar no me importa', favors: 'a' }, { label: 'Depende de la vivienda', favors: 'none' }] },
      { q: '¿Qué prefieres respecto a las obras?', options: [{ label: 'No quiero hacer ninguna', favors: 'a' }, { label: 'No me importa reformar para adaptarla', favors: 'b' }, { label: 'Algo pequeño sí; una integral no', favors: 'none' }] },
      { q: '¿Cuánto pesa el gasto energético en tu decisión?', options: [{ label: 'Mucho: quiero facturas bajas desde el primer día', favors: 'a' }, { label: 'Poco: lo asumo o lo mejoro con el tiempo', favors: 'b' }, { label: 'Lo valoro, pero no decide', favors: 'none' }] },
      { q: '¿Cómo te llevas con el riesgo?', options: [{ label: 'Prefiero ver lo que compro, aunque tenga años', favors: 'b' }, { label: 'Acepto esperar y confiar en el proyecto a cambio de estrenar', favors: 'a' }, { label: 'Ni idea', favors: 'none' }] },
      { q: '¿Qué margen de negociación esperas?', options: [{ label: 'Quiero poder negociar el precio', favors: 'b' }, { label: 'Prefiero un precio cerrado sin regateos', favors: 'a' }, { label: 'Indiferente', favors: 'none' }] },
      { q: '¿Cuántos metros necesitas?', options: [{ label: 'Los máximos por mi presupuesto', favors: 'b' }, { label: 'Me basta con una distribución eficiente', favors: 'a' }, { label: 'No lo tengo claro', favors: 'none' }] },
    ] },

    h2('El dinero: precio, impuestos y pagos'),
    p('A igualdad de zona y metros, la obra nueva se vende más cara. Es lógico: no hay que reformar, cumple la normativa actual y el promotor fija el precio sin la urgencia de un particular. A ese precio hay que sumarle el IVA del 10 % (que ya va incluido en la cifra anunciada) y el AJD, que fija cada comunidad entre el 0,5 % y el 1,5 %. En la segunda mano, el impuesto es el ITP, también autonómico, del 4 % en el País Vasco al 10 % o más en las escalas de Cataluña, Baleares o Asturias para precios altos. Los tipos actualizados y una calculadora están en la [guía de gastos e impuestos](/blog/gastos-impuestos-comprar-vivienda).'),
    table([
      ['Vivienda de 250.000 € en Asturias', 'Obra nueva', 'Segunda mano'],
      ['Impuesto indirecto', 'IVA 10 %: 22.727 € (incluido en los 250.000 €)', '—'],
      ['Impuesto sobre la escritura', 'AJD 1,2 %: 3.000 €', 'ITP 8 %: 20.000 €'],
      ['Notaría, registro, gestoría (estimación)', '≈ 1.800 €', '≈ 1.700 €'],
      ['Total a sumar al precio anunciado', '≈ 4.800 €', '≈ 21.700 €'],
      ['Impuesto total soportado', '≈ 25.700 €', '≈ 20.000 €'],
    ]),
    p('La tabla enseña una trampa frecuente: como el IVA ya va en el precio anunciado, la obra nueva parece tener menos «gastos» que la segunda mano. Pero el impuesto total soportado es mayor. Lo correcto es comparar el coste final de las dos viviendas, no lo que hay que sumar al anuncio. Y en comunidades con ITP alto y AJD bajo, como Madrid (6 % y 0,75 %), la diferencia se estrecha mucho.'),
    h3('Cómo se paga una obra nueva'),
    p('En una promoción sobre plano se firma primero un documento de reserva (unos miles de euros), después un contrato privado de compraventa con una entrega inicial (habitualmente el 10 % del precio) y, durante la obra, pagos periódicos a cuenta que suman otro 10–20 %. El resto se paga en la escritura, cuando la vivienda ya existe, normalmente con la hipoteca. La Ley de Ordenación de la Edificación obliga al promotor a garantizar esas cantidades anticipadas con un aval bancario o un seguro de caución y a ingresarlas en una cuenta especial: pide el documento del aval con cada pago. Si el promotor no termina o no entrega en plazo, puedes recuperar lo pagado con intereses, aunque no el tiempo perdido.'),
    warn('Entre la firma del contrato privado y la escritura pueden pasar dos años. En ese tiempo pueden cambiar los tipos de interés, tu situación laboral o los criterios del banco. La hipoteca no se firma hasta la entrega, así que la preaprobación de hoy no garantiza las condiciones de entonces. Mantén un margen de seguridad en la cuota que puedes asumir.'),
    img(IMAGES['g05-construction'], { wide: true }),

    h2('El tiempo: entrega, obras y disponibilidad'),
    p('La segunda mano se compra en semanas: oferta, arras y escritura en dos o tres meses si hay hipoteca. La obra nueva sobre plano se entrega en uno o dos años, y los retrasos de varios meses no son raros: licencias, suministros, climatología, subcontratas. El contrato debe fijar una fecha de entrega y una penalización por retraso, y conviene leer con atención las causas que el promotor considera justificadas. Si tienes que dejar un alquiler o vender tu vivienda actual, el calendario manda.'),
    p('Hay una tercera vía: la obra nueva terminada o a punto de terminar, que algunas promotoras venden con las últimas unidades, y la vivienda «a estrenar» de pocos años que un particular revende. Esta última tributa por ITP, no por IVA, y se entrega en semanas. Puede ser el mejor de los dos mundos si el precio acompaña.'),

    h2('Las garantías: lo que cubre cada una'),
    p('La Ley 38/1999 de Ordenación de la Edificación establece tres plazos de garantía para la obra nueva desde la recepción del edificio: un año para los defectos de acabado (pintura, carpintería, alicatados), tres años para los que afectan a la habitabilidad (humedades, aislamiento, instalaciones) y diez años para los daños estructurales, cubiertos además por un seguro decenal obligatorio. El promotor responde durante esos plazos, y la comunidad de propietarios suele ser quien gestiona las reclamaciones de elementos comunes.'),
    p('En la segunda mano no hay nada parecido. El vendedor responde de los vicios ocultos (defectos graves que no se veían y que hacen la vivienda impropia para su uso o reducen mucho su valor) durante seis meses desde la entrega, según el Código Civil, y probarlos exige un informe técnico y, con frecuencia, un juicio. En la práctica, la garantía de la segunda mano es la revisión que hagas antes de comprar: los [quince aspectos a revisar](/blog/que-revisar-antes-comprar-casa) sustituyen a la póliza.'),
    info('En obra nueva, haz un repaso minucioso el día de la entrega (acabados, puertas, grifos, enchufes, persianas) y entrégalo por escrito al promotor. El primer año es el plazo para lo pequeño, y lo que no se reclame se queda.'),

    h2('La vivienda: eficiencia, metros y distribución'),
    p('Una vivienda nueva cumple el Código Técnico de la Edificación vigente: aislamiento, ventanas, ventilación mecánica, agua caliente eficiente, a menudo aerotermia o apoyo solar. El resultado es una letra A o B en el certificado energético y facturas de calefacción mucho menores que en un edificio de los setenta, además de un confort distinto en invierno. Una vivienda de segunda mano puede acercarse con una reforma de ventanas, aislamiento y climatización, pero cuesta dinero, lleva tiempo y, en bloques antiguos, la envolvente del edificio no depende de ti.'),
    p('A cambio, la segunda mano suele dar más metros por el mismo dinero y estancias más grandes, porque los edificios antiguos se construyeron con otros criterios. Las promociones actuales optimizan superficies: dormitorios justos, salones integrados con la cocina, terrazas que compensan. Decide qué valoras más: una cocina de catorce metros con despensa o una terraza y una piscina comunitaria.'),
    img(IMAGES['g05-interior']),

    h2('El lugar: lo que no se puede reformar'),
    p('La ubicación es el único factor que no cambia con dinero. La obra nueva aparece donde hay suelo: ensanches, periferias, antiguas zonas industriales. Los servicios llegan, pero a su ritmo: colegios, comercio, transporte y vida de barrio tardan años en consolidarse. La segunda mano está donde la ciudad ya existe. En la reventa, la ubicación pesa más que casi todo lo demás, por lo que una vivienda nueva en una zona que no se consolida puede valer menos de lo esperado, y una antigua bien situada aguanta mejor los ciclos.'),
    p('Esto no es un argumento contra la obra nueva: hay ensanches que en diez años se han convertido en los barrios más demandados de su ciudad. Es un argumento para visitar la zona a distintas horas, consultar el planeamiento municipal y preguntar qué está previsto construir alrededor. Lo explicamos en el punto 15 de [qué revisar antes de comprar](/blog/que-revisar-antes-comprar-casa).'),

    img(IMAGES['g05-oldbuilding'], { wide: true }),
    h2('La comunidad y el edificio'),
    p('Comprar en un edificio de segunda mano es entrar en una comunidad con historia: actas, cuentas, fondo de reserva, derramas aprobadas y pendientes, vecinos conocidos. Toda esa información está disponible antes de comprar y es una ventaja, porque permite saber en qué te metes. En obra nueva no hay historial: la comunidad se constituye con los primeros vecinos, las cuotas se estiman y las zonas comunes (piscina, garaje, ascensores, jardines) cuestan dinero cada mes. Pregunta al promotor por la cuota prevista y compárala con lo que pagarías en un edificio sin servicios.'),
    tip('Si la promoción tiene piscina, pistas o conserjería, calcula la cuota a diez años. Son servicios que se disfrutan, pero que no se pueden dar de baja individualmente y que encarecen la reventa para quien no los valora.'),

    h2('Cómo decidir'),
    p('El módulo del principio ordena tus prioridades, pero la decisión final suele resolverse con tres preguntas. ¿Cuánto tiempo tienes? Si necesitas entrar a vivir pronto, la segunda mano o la obra nueva terminada. ¿Dónde quieres vivir? Si la respuesta es un barrio concreto y consolidado, casi seguro segunda mano. ¿Quieres hacer obras? Si la respuesta es un no rotundo, la obra nueva o una segunda mano reformada recientemente, que se paga más cara pero evita el proceso.'),
    p('Después, haz los números completos de las dos opciones que mejor encajen: precio final con impuestos, reforma estimada si la hay, cuota de comunidad y coste energético a cinco años. Es frecuente que la comparación honesta acerque mucho dos viviendas que parecían muy distintas en el anuncio. Y, en ambos casos, aplica el [método para saber si el precio es razonable](/blog/como-saber-vivienda-bien-precio).'),

    h2('Conclusión'),
    p('Obra nueva y segunda mano no compiten en lo mismo. La primera vende tranquilidad, eficiencia y garantías, y cobra por ello en precio, impuestos y espera. La segunda vende ubicación, metros y margen de negociación, y traslada al comprador la responsabilidad de revisar. Ninguna es mejor en abstracto. La buena es la que encaja con tu calendario, tu barrio y tu tolerancia a las obras, comprada a un precio que hayas podido comprobar.'),
    faq([
      { q: '¿Es más barato comprar obra nueva o segunda mano?', a: 'A igualdad de zona y superficie, la segunda mano suele tener un precio de compra más bajo y paga menos impuesto total (ITP frente a IVA más AJD) en la mayoría de comunidades. Pero una segunda mano que necesite reforma puede acabar costando lo mismo o más, y la obra nueva ahorra en energía y mantenimiento durante años. Compara el coste total a cinco o diez años, no solo el precio de compra.' },
      { q: '¿Qué pasa con mi dinero si el promotor no termina la obra?', a: 'Las cantidades que anticipas deben estar garantizadas por un aval bancario o un seguro de caución, según la disposición adicional primera de la Ley de Ordenación de la Edificación. Si la obra no empieza o no se entrega en el plazo pactado, puedes resolver el contrato y recuperar lo pagado con intereses legales. Pide el documento del aval en cada pago y no entregues dinero fuera de la cuenta especial del promotor.' },
      { q: '¿Una vivienda a estrenar que revende un particular paga IVA?', a: 'No. El IVA se aplica solo a la primera entrega, la que hace el promotor. Si un particular revende una vivienda nueva que compró y no ha habitado, o un banco vende una que se adjudicó, se trata de una segunda transmisión y tributa por ITP. La excepción es la vivienda que el promotor alquiló durante menos de dos años antes de venderla, que sigue siendo primera entrega.' },
      { q: '¿Puedo negociar el precio de una obra nueva?', a: 'Es más difícil que en segunda mano, porque el promotor tiene una lista de precios y no suele tener prisa. Hay más margen en las últimas unidades de una promoción, en las viviendas con peor orientación o planta, y en forma de mejoras (acabados, plaza de garaje, trastero) en lugar de rebaja directa. Pregunta siempre.' },
      { q: '¿Cuánto cuesta reformar una vivienda de segunda mano?', a: 'Depende de la superficie, del estado y de si se tocan instalaciones y distribución. Una actualización (pintura, suelos, baño) y una reforma integral (instalaciones nuevas, cocina, baños, ventanas, distribución) están en órdenes de magnitud distintos. Pide un presupuesto detallado a un profesional antes de hacer la oferta, y súmalo al precio para comparar con la obra nueva.' },
    ]),
    cta('¿Prefieres estrenar o ya tienes un barrio en mente?', 'Explora las promociones de obra nueva y las viviendas de segunda mano disponibles, y compara con números reales.', 'Ver propiedades de obra nueva', '/propiedades?estado=obra_nueva'),
    { type: 'properties', mode: 'new', limit: 3 },
  ],
}

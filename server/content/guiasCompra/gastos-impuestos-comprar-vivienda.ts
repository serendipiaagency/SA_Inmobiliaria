import { IMAGES } from './images'
import { cta, faq, h2, h3, img, info, keypoints, p, table, tip, warn, type GuiaArticle } from './types'

/**
 * Artículo 2 · Gastos e impuestos al comprar una vivienda.
 * Los tipos por comunidad autónoma viven en utils/compraGastos.ts (con fuente,
 * fecha de revisión y marca «pendiente» donde no se pudo contrastar); la
 * calculadora del artículo (bloque cost_calculator) los lee de ahí.
 */
export const gastosImpuestosComprarVivienda: GuiaArticle = {
  key: 'g02',
  slug: 'gastos-impuestos-comprar-vivienda',
  title: 'Gastos e impuestos al comprar una vivienda: cuánto hay que sumar al precio',
  subtitle: 'ITP o IVA, AJD, notaría, registro, gestoría y tasación, explicados uno a uno y con una calculadora por comunidad autónoma y tipo de vivienda.',
  seoTitle: 'Gastos e impuestos al comprar una vivienda (calculadora 2026)',
  seoDescription: 'Qué impuestos y gastos se pagan al comprar una vivienda, quién paga cada uno y cuánto suman según la comunidad. Calculadora para segunda mano y obra nueva.',
  focusKeyword: 'gastos de comprar una vivienda',
  category: 'guias',
  reviewedAt: '2026-10-10',
  cover: IMAGES['g02-cover'],
  related: ['guia-comprar-vivienda', 'obra-nueva-vs-segunda-mano', 'como-saber-vivienda-bien-precio'],
  blocks: [
    p('El precio que aparece en el anuncio no es lo que vas a pagar. Entre impuestos, notaría, registro y gestiones, una vivienda de segunda mano cuesta entre un 10 % y un 12 % más según la comunidad autónoma, y la obra nueva se mueve en cifras parecidas. Esta guía explica cada partida, quién la paga y cómo se calcula, y termina con una calculadora que hace las cuentas con los tipos de cada comunidad.'),
    keypoints([
      'En segunda mano, el impuesto principal es el ITP, que fija cada comunidad autónoma: va del 4 % del País Vasco al 10–13 % de las escalas más altas.',
      'En obra nueva se paga el IVA (10 % en la península y Baleares; IGIC en Canarias) más el AJD, también autonómico.',
      'La base del ITP es la mayor de dos cantidades: el precio pagado o el valor de referencia de Catastro. Compruébalo antes de firmar.',
      'Notaría y registro tienen aranceles regulados; en una vivienda media suman entre 1.000 y 1.900 €. La gestoría es libre y opcional.',
      'Si hay hipoteca, el banco paga su notaría, registro, gestoría y AJD desde la Ley 5/2019; el comprador paga la tasación.',
    ]),
    { type: 'cost_calculator', title: 'Calculadora de gastos de compra', defaultPrice: 200000, defaultRegion: 'AST' },
    info('La calculadora aplica el tipo general de cada comunidad. Casi todas tienen tipos reducidos para menores de 35 años, familias numerosas, personas con discapacidad, vivienda protegida o municipios rurales, y algunos reducen mucho la factura. Si cumples alguno de esos requisitos, consulta la agencia tributaria de tu comunidad antes de dar la cifra por buena.'),

    h2('Los dos escenarios: segunda mano y obra nueva'),
    p('Todo depende de una pregunta: ¿quién vende? Si el vendedor es un particular (o una empresa que no promovió la vivienda), la operación está sujeta al Impuesto de Transmisiones Patrimoniales Onerosas, el ITP. Si vende el promotor y es la primera entrega de la vivienda, la compra lleva IVA y, además, el Impuesto de Actos Jurídicos Documentados por la escritura. No se pagan los dos a la vez: una compraventa es con ITP o con IVA.'),
    p('Hay un caso intermedio frecuente: una vivienda nueva que el promotor no vendió y alquiló durante al menos dos años, o que fue adjudicada al banco y este la revende. En esos casos la segunda entrega tributa por ITP, no por IVA, aunque la vivienda esté a estrenar. Pregúntalo antes de hacer números, porque la diferencia puede ser de varios puntos.'),
    img(IMAGES['g02-desk'], { wide: true }),

    h2('El ITP: el impuesto de la vivienda de segunda mano'),
    p('El ITP es un impuesto estatal cuya recaudación y cuyos tipos corresponden a las comunidades autónomas. Por eso una misma vivienda de 200.000 € paga 12.000 € de impuesto en Madrid (6 %) y 16.000 € en Asturias o Galicia (8 %). Algunas comunidades aplican una escala por tramos: la parte del precio que supera cierto umbral tributa a un tipo más alto, como ocurre en Asturias, Aragón, Baleares, Cataluña o Extremadura.'),
    h3('La base imponible: precio o valor de referencia'),
    p('Desde el 1 de enero de 2022, por la Ley 11/2021, la base del ITP ya no es el precio escriturado sin más, sino la mayor de dos cantidades: el precio pagado o el valor de referencia que publica la Dirección General del Catastro para cada inmueble. Ese valor se consulta gratis en la Sede Electrónica del Catastro con la referencia catastral y se actualiza cada año. Si compras por debajo del valor de referencia, pagarás el impuesto sobre el valor de referencia, y recurrirlo exige una tasación pericial contradictoria. Conviene saberlo antes de negociar: un precio muy bajo no siempre reduce el impuesto.'),
    h3('Plazo y modelo'),
    p('El impuesto lo autoliquida el comprador, en la mayoría de comunidades mediante el modelo 600, con un plazo que suele ser de 30 días hábiles desde la firma de la escritura. Hoy casi todas las agencias tributarias autonómicas lo admiten en línea. Si hay hipoteca, la gestoría del banco suele presentarlo junto con la inscripción registral; si compras al contado, es cosa tuya o de la gestoría que contrates.'),
    table([
      ['Comunidad autónoma', 'ITP general (vivienda usada)', 'AJD general (obra nueva)', 'Dato contrastado'],
      ['Andalucía', '7 %', '1,2 %', 'Sí'],
      ['Aragón', '8 % hasta 400.000 €; hasta 10 % desde 750.000 €', '1,5 %', 'Tramos intermedios pendientes'],
      ['Asturias', '8 % hasta 300.000 €; 9 % hasta 500.000 €; 10 % el resto', '1,2 %', 'Escala pendiente; AJD sí'],
      ['Illes Balears', '8 % hasta 400.000 €, subiendo hasta el 13 %', '1,5 %', 'Tramos altos pendientes'],
      ['Canarias', '6,5 %', '1 % (IGIC 7 % en lugar de IVA)', 'Sí'],
      ['Cantabria', '9 % (7 % en los primeros 200.000 € de vivienda habitual)', '1 %', 'Sí'],
      ['Castilla-La Mancha', '9 %', '1,5 %', 'ITP sí; AJD pendiente'],
      ['Castilla y León', '8 %; 10 % por encima de 250.000 €', '1,5 %', 'Tramo del 10 % pendiente'],
      ['Cataluña', '10 % hasta 600.000 €, subiendo hasta el 13 %', '1,5 %', 'Tramos altos pendientes'],
      ['Comunitat Valenciana', '9 %', '1,4 %', 'ITP sí; AJD pendiente'],
      ['Extremadura', '8 % hasta 360.000 €; 10 %; 11 %', '1,5 %', 'Pendiente'],
      ['Galicia', '8 %', '1,5 %', 'Sí'],
      ['Comunidad de Madrid', '6 %', '0,75 % (0,4–0,5 % por debajo de 180.000 €)', 'Sí'],
      ['Región de Murcia', '7,75 %', '1,5 %', 'Sí'],
      ['Navarra', '5 % hasta 180.304 €; 6 %', '0,5 %', 'Pendiente'],
      ['País Vasco', '4 % (2,5 % vivienda habitual con requisitos)', '0,5 %', 'Sí'],
      ['La Rioja', '7 %', '1 %', 'ITP sí; AJD pendiente'],
    ]),
    p('La columna «Dato contrastado» indica si el tipo se ha comprobado en la web oficial de la agencia tributaria de esa comunidad en la fecha de revisión de esta guía. Lo marcado como pendiente procede de fuentes secundarias y debe confirmarse antes de tomar una decisión con él. La calculadora señala esos casos.'),

    h2('IVA y AJD: los impuestos de la obra nueva'),
    p('Cuando compras al promotor, el precio lleva IVA al tipo reducido del 10 % (el 4 % si es una vivienda de protección oficial de régimen especial o promoción pública). En Canarias no hay IVA sino IGIC, con un tipo general del 7 % y tipos reducidos para vivienda habitual. El IVA se paga al promotor en cada entrega a cuenta y en la escritura: no hay que liquidarlo aparte.'),
    p('Lo que sí se liquida aparte es el AJD, el impuesto que grava la escritura pública de una compraventa sujeta a IVA. Lo fija cada comunidad autónoma, entre el 0,5 % y el 1,5 % del precio, y se presenta con el mismo modelo y plazo que el ITP. En una vivienda de 250.000 € en Asturias son 3.000 €; en Madrid, 1.875 €.'),
    warn('Las plazas de garaje tienen su propio régimen: hasta dos plazas compradas junto con la vivienda tributan al 10 % de IVA; una tercera, o una plaza suelta, al 21 %. Y en segunda mano, algunas comunidades aplican a los garajes un tipo de ITP distinto al de la vivienda.'),

    h2('Notaría, registro y gestoría'),
    p('Los honorarios de notarios y registradores están fijados por el Estado en dos aranceles de 1989 que siguen vigentes, actualizados en algunos tramos. Dependen del valor de la operación y son iguales en toda España. Para la escritura de compraventa de una vivienda media, la notaría suele costar entre 600 y 1.200 € (más las copias) y la inscripción en el Registro de la Propiedad entre 400 y 700 €. La calculadora usa una estimación dentro de esas horquillas y lo indica.'),
    p('La gestoría no es obligatoria. Se encarga de liquidar el impuesto, llevar la escritura al Registro y recogerla inscrita, y cobra honorarios libres, normalmente entre 250 y 450 €. Si hay hipoteca, el banco impone su gestoría para asegurarse de que la hipoteca se inscribe, pero la paga él en lo que toca al préstamo. En la parte de la compraventa, puedes hacer los trámites tú mismo si compras al contado.'),
    img(IMAGES['g02-signing']),

    h2('Si hay hipoteca: lo que paga el banco y lo que pagas tú'),
    p('La Ley 5/2019, de contratos de crédito inmobiliario, zanjó una discusión de años sobre quién paga los gastos de constituir la hipoteca. Desde su entrada en vigor, en junio de 2019, el banco paga la notaría de la escritura del préstamo, su inscripción en el Registro, la gestoría y el AJD de la hipoteca. El comprador paga la tasación, que suele costar entre 300 y 500 €, y las copias de la escritura que pida.'),
    table([
      ['Gasto de la hipoteca', 'Lo paga'],
      ['Tasación', 'Comprador (300–500 €, validez de seis meses)'],
      ['Notaría de la escritura de préstamo', 'Banco'],
      ['Registro de la hipoteca', 'Banco'],
      ['Gestoría del préstamo', 'Banco'],
      ['AJD del préstamo hipotecario', 'Banco'],
      ['Comisión de apertura', 'Comprador, si el banco la cobra (cada vez menos frecuente)'],
      ['Copias de la escritura solicitadas por el cliente', 'Comprador'],
    ]),
    tip('Muchos bancos bonifican el tipo de interés a cambio de contratar seguros, planes de pensiones o tarjetas. Esos productos cuestan dinero cada año y, en ocasiones, más de lo que ahorra la bonificación. Pide el coste anual de cada uno y súmalo a la cuota antes de comparar ofertas.'),

    h2('Lo que paga el vendedor (y lo que a veces intenta trasladarte)'),
    p('Dos tributos corresponden por ley al vendedor. La plusvalía municipal (Impuesto sobre el Incremento del Valor de los Terrenos de Naturaleza Urbana) grava el aumento de valor del suelo desde que lo compró, y la paga quien vende; si el contrato se la traslada al comprador, ese pacto es válido entre las partes pero no frente al ayuntamiento. Y la ganancia patrimonial, si la hay, tributa en el IRPF del vendedor.'),
    p('El IBI del año de la compra lo paga, frente al ayuntamiento, quien era titular el 1 de enero: el vendedor. Pero el Tribunal Supremo admite que se reparta entre las partes en proporción al tiempo que cada una ha tenido la vivienda, salvo que el contrato diga lo contrario, y es lo que se hace casi siempre. Lo mismo con la cuota de comunidad del mes de la firma. Son cantidades pequeñas, pero conviene dejarlas por escrito en las arras para no discutirlas en la notaría.'),
    p('Los honorarios de la agencia inmobiliaria los paga quien la contrató. En la mayoría de las compraventas en España es el vendedor, que firma con la agencia una nota de encargo y paga su comisión a la firma. Si una agencia pide honorarios al comprador, debe haberlo acordado con él por escrito y de antemano.'),

    h2('Los gastos que no están en ninguna lista'),
    p('Hay una tercera capa de gastos que no son impuestos ni aranceles, pero que salen del mismo bolsillo en los mismos meses. El seguro de hogar, que el banco exige si hay hipoteca (al menos de daños, y puedes contratarlo donde quieras). La mudanza. El cambio de titularidad de los suministros, que es gratuito, frente al alta nueva, que no lo es. Las reformas imprescindibles: pintura, electrodomésticos, a veces una instalación eléctrica antigua. Y, si vendes para comprar, los meses en que puedes estar pagando dos viviendas o un alquiler puente.'),
    p('Un presupuesto honesto reserva entre un 1 % y un 3 % adicional para esta capa, más lo que estimes de reforma. En [Qué revisar antes de comprar una casa](/blog/que-revisar-antes-comprar-casa) encontrarás los puntos que más sorpresas dan después de la firma.'),
    img(IMAGES['g02-savings'], { wide: true }),

    h2('Tres ejemplos con números'),
    p('Los ejemplos siguientes usan los tipos generales de la tabla y las estimaciones de notaría, registro y gestoría de la calculadora. Son orientativos: tu caso puede tener tipos reducidos, una tasación más cara o una gestoría más barata.'),
    table([
      ['', 'Piso de 180.000 € en Asturias (segunda mano, con hipoteca)', 'Piso de 250.000 € en Madrid (segunda mano, con hipoteca)', 'Obra nueva de 300.000 € en Asturias (con hipoteca)'],
      ['Impuesto principal', 'ITP 8 %: 14.400 €', 'ITP 6 %: 15.000 €', 'IVA 10 %: 30.000 € (incluido en el precio)'],
      ['AJD', '—', '—', '1,2 %: 3.600 €'],
      ['Notaría (estimación)', '≈ 800 €', '≈ 900 €', '≈ 950 €'],
      ['Registro (estimación)', '≈ 450 €', '≈ 500 €', '≈ 550 €'],
      ['Gestoría', '≈ 350 €', '≈ 350 €', '≈ 350 €'],
      ['Tasación', '≈ 350 €', '≈ 350 €', '≈ 350 €'],
      ['Total aparte del precio', '≈ 16.350 € (9,1 %)', '≈ 17.100 € (6,8 %)', '≈ 5.800 € + IVA incluido en el precio'],
    ]),
    p('Fíjate en la última columna. En obra nueva, el IVA ya forma parte del precio que ves anunciado, por lo que el «extra» que hay que sumar parece pequeño. Pero si comparas con una vivienda usada del mismo precio final, la nueva ha pagado 30.000 € de impuesto frente a 24.000 € de ITP al 8 %. Es una de las diferencias que analizamos en [Obra nueva o segunda mano](/blog/obra-nueva-vs-segunda-mano).'),

    h2('Cómo reducir la factura sin inventar nada'),
    p('No hay trucos, pero sí decisiones que cambian la cifra. Comprueba si tienes derecho a un tipo reducido de ITP: edad, familia numerosa, discapacidad, vivienda protegida o municipio pequeño son los supuestos más comunes, y en algunas comunidades la rebaja supera la mitad del impuesto. Pide la tasación a una sociedad homologada por el Banco de España que acepte tu banco, en lugar de dejar que la encargue él: puede salir más barata y es igualmente válida. Compara al menos dos ofertas de hipoteca con sus productos vinculados. Y si compras al contado, valora hacer tú mismo la liquidación del impuesto y la presentación en el Registro.'),
    warn('Pagar una parte del precio «en B» para reducir el impuesto es un delito fiscal, perjudica al comprador (que tributará por la ganancia ficticia cuando venda) y, además, ya no funciona: el ITP se calcula sobre el valor de referencia de Catastro si es mayor que el precio declarado.'),

    h2('Conclusión'),
    p('La regla práctica sigue siendo válida: calcula entre un 10 % y un 12 % sobre el precio en segunda mano y revisa después dónde cae tu comunidad, porque la diferencia entre el 4 % y el 10 % de ITP son miles de euros. Comprueba el valor de referencia de Catastro antes de hacer la oferta. Recuerda que, con hipoteca, los gastos del préstamo son del banco y la tasación es tuya. Y reserva una partida para lo que no sale en ninguna tabla. Con eso, el presupuesto que lleves a la [búsqueda de vivienda](/blog/guia-comprar-vivienda) será un presupuesto de verdad.'),
    faq([
      { q: '¿Cuánto hay que sumar al precio de una vivienda de segunda mano?', a: 'Entre un 10 % y un 12 % en la mayoría de comunidades autónomas, repartido entre el ITP (del 4 % al 10 % o más según la comunidad y el precio), la notaría y el registro (entre 1.000 y 1.900 € en una vivienda media), la gestoría si la contratas y la tasación si hay hipoteca. En Madrid o el País Vasco la cifra baja al 7–8 %; en Cataluña o la Comunitat Valenciana puede superar el 12 %.' },
      { q: '¿Quién paga los gastos de la hipoteca?', a: 'Desde la Ley 5/2019, el banco paga la notaría de la escritura del préstamo, su inscripción en el Registro, la gestoría y el impuesto de Actos Jurídicos Documentados de la hipoteca. El comprador paga la tasación y las copias que solicite. La comisión de apertura, si existe, también la paga el comprador.' },
      { q: '¿Qué es el valor de referencia de Catastro y por qué importa?', a: 'Es un valor que la Dirección General del Catastro asigna cada año a cada inmueble a partir de los precios de compraventas reales de la zona. Desde 2022 es la base mínima del ITP y del Impuesto de Sucesiones y Donaciones: si compras por menos, pagarás el impuesto sobre el valor de referencia. Se consulta gratis en la Sede Electrónica del Catastro con la referencia catastral.' },
      { q: '¿Se paga ITP e IVA a la vez?', a: 'No. Una compraventa está sujeta a uno o a otro. Si vende un particular, o se trata de una segunda entrega de la vivienda, se paga ITP. Si vende el promotor y es la primera entrega, se paga IVA más AJD. Las entregas a cuenta de una obra nueva llevan IVA desde el primer pago.' },
      { q: '¿Puedo pagar el ITP a plazos?', a: 'Las agencias tributarias autonómicas permiten solicitar aplazamiento o fraccionamiento con los requisitos generales de la Ley General Tributaria, normalmente con garantía por encima de cierto importe y con intereses de demora. Es poco habitual en una compraventa, porque el banco y la gestoría esperan el justificante del pago para inscribir la hipoteca.' },
      { q: '¿Qué pasa si no liquido el impuesto en plazo?', a: 'Si lo presentas tú antes de que te requieran, se aplica un recargo por declaración extemporánea que crece con el retraso (del 1 % más un 1 % por mes completo hasta los doce meses, y del 15 % más intereses de demora a partir de ahí). Si te requiere la administración, hay sanción. Y mientras tanto, la escritura no se inscribe en el Registro.' },
    ]),
    cta('¿Buscas vivienda y quieres números reales?', 'Explora las viviendas disponibles y, si quieres, un asesor te prepara un presupuesto completo con los impuestos de tu comunidad.', 'Consultar con un asesor', '/contacto'),
    { type: 'properties', mode: 'featured', limit: 3 },
  ],
}

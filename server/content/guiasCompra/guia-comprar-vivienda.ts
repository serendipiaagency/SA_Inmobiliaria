import { IMAGES } from './images'
import { cta, faq, h2, h3, img, info, keypoints, p, table, tip, warn, type GuiaArticle } from './types'

/**
 * Artículo 1 · Guía paso a paso para comprar una vivienda.
 * Marco legal citado: Código Civil (art. 1454, arras), Ley 5/2019 de crédito
 * inmobiliario (reparto de gastos de la hipoteca, FEIN, plazo de 10 días),
 * Ley 49/1960 de Propiedad Horizontal (art. 9.1.e, deudas con la comunidad),
 * Ley 11/2021 (valor de referencia de Catastro como base del ITP).
 */
export const guiaComprarVivienda: GuiaArticle = {
  key: 'g01',
  slug: 'guia-comprar-vivienda',
  title: 'Guía paso a paso para comprar una vivienda en España',
  subtitle: 'Del presupuesto a la entrega de llaves: qué pasa en cada fase, qué documentos pedir, qué se firma y en qué orden, sin sorpresas por el camino.',
  seoTitle: 'Cómo comprar una vivienda paso a paso: guía completa 2026',
  seoDescription: 'Las fases de la compra de una vivienda en orden: presupuesto, búsqueda, visitas, arras, hipoteca, notaría, impuestos y llaves. Con línea temporal y checklist.',
  focusKeyword: 'comprar una vivienda paso a paso',
  category: 'guias',
  reviewedAt: '2026-10-10',
  cover: IMAGES['g01-cover'],
  related: ['gastos-impuestos-comprar-vivienda', 'que-revisar-antes-comprar-casa', 'preguntas-antes-comprar-vivienda'],
  blocks: [
    p('Comprar una vivienda son, en realidad, ocho o nueve decisiones encadenadas. Cada una tiene su documento, su plazo y su momento para echarse atrás sin perder dinero. Esta guía las recorre en el orden en que ocurren de verdad, con lo que conviene pedir y firmar en cada fase. Si ya tienes una vivienda en mente, puedes saltar directamente al paso en el que estés desde el índice.'),
    keypoints([
      'El presupuesto real es el precio más los gastos de compra, que en una vivienda de segunda mano suelen rondar entre el 10 % y el 12 % del precio según la comunidad autónoma.',
      'La reserva y las arras son contratos distintos: la primera retira la vivienda del mercado unos días; las arras penitenciales (art. 1454 del Código Civil) fijan qué se pierde si alguien se arrepiente.',
      'Desde la Ley 5/2019, el banco paga la notaría, el registro, la gestoría y el impuesto de la hipoteca; quien compra paga la tasación.',
      'Entre recibir la oferta del banco (la FEIN) y firmar la hipoteca deben pasar al menos diez días naturales.',
      'El impuesto de la compra (ITP o IVA + AJD) se liquida después de la escritura; en la mayoría de comunidades el plazo es de 30 días hábiles.',
    ]),
    { type: 'timeline', title: 'Las fases de una compra, en orden', steps: [
      { title: 'Presupuesto y preaprobación', when: 'Semanas 1–2', text: 'Calcula cuánto puedes pagar sumando precio y gastos, y pide a uno o dos bancos un estudio previo de financiación.', docs: ['Últimas nóminas o declaración de IRPF', 'Vida laboral', 'Extractos bancarios', 'Deudas vivas (préstamos, tarjetas)'] },
      { title: 'Búsqueda y visitas', when: 'Semanas 2–10', text: 'Define zona, tipo de vivienda y mínimos imprescindibles. Visita con una lista de comprobación y vuelve a ver la vivienda a otra hora del día.', docs: ['Nota simple del Registro', 'Certificado de eficiencia energética', 'Últimos recibos de IBI y comunidad'] },
      { title: 'Oferta y reserva', when: 'Días', text: 'Negocia por escrito y, si hay acuerdo, firma un documento de reserva con una señal pequeña y un plazo para formalizar las arras.', docs: ['Documento de reserva con precio, plazo y condiciones'] },
      { title: 'Contrato de arras', when: 'Semanas 10–12', text: 'Fija precio, plazo para escriturar, qué pasa si alguien se echa atrás y qué se incluye en la venta. Lo habitual es entregar en torno al 10 % del precio.', docs: ['Contrato de arras firmado por todos los propietarios', 'Justificante de la transferencia'] },
      { title: 'Hipoteca: tasación y FEIN', when: 'Semanas 10–16', text: 'El banco encarga la tasación, estudia la operación y te entrega la FEIN con las condiciones definitivas. Diez días naturales de reflexión como mínimo.', docs: ['Tasación', 'FEIN y FiAE', 'Acta notarial previa'] },
      { title: 'Firma en notaría', when: 'Semanas 16–20', text: 'Se firman la escritura de compraventa y, si la hay, la de préstamo hipotecario. Pagas el precio, recibes las llaves y la vivienda es tuya.', docs: ['DNI de todas las partes', 'Medios de pago (cheques bancarios o transferencia)', 'Certificado de la comunidad', 'Último recibo de IBI'] },
      { title: 'Impuestos y registro', when: 'Hasta 30 días hábiles después', text: 'Liquidas el ITP (segunda mano) o el AJD (obra nueva), inscribes la escritura en el Registro de la Propiedad y cambias la titularidad de los suministros.', docs: ['Modelo 600 (o equivalente autonómico)', 'Escritura inscrita', 'Contratos de luz, agua y gas'] },
    ] },

    h2('1. El presupuesto: cuánto puedes pagar de verdad'),
    p('El primer error de muchos compradores es buscar viviendas por el precio que podrían pagar de hipoteca, sin contar los gastos de la compra ni el dinero que hay que aportar de entrada. El presupuesto real sale de tres cifras: los ahorros disponibles, el préstamo que un banco te concedería y los gastos de la operación.'),
    p('Lo habitual es que los bancos financien como máximo el 80 % del menor de dos valores: el precio o la tasación. El 20 % restante y los gastos salen de tus ahorros. En segunda mano, esos gastos rondan el 10–12 % del precio según la comunidad; los desglosamos en [Gastos e impuestos al comprar una vivienda](/blog/gastos-impuestos-comprar-vivienda).'),
    table([
      ['Concepto', 'Vivienda de 200.000 € (segunda mano, orientativo)'],
      ['Entrada que no financia el banco (20 %)', '40.000 €'],
      ['Impuestos y gastos de compra (10–12 %)', '20.000–24.000 €'],
      ['Tasación', '300–500 €'],
      ['Ahorro necesario aproximado', '60.000–65.000 €'],
    ]),
    p('La otra cara del presupuesto es la cuota. Un criterio prudente, y el que aplican la mayoría de los bancos, es que la cuota de la hipoteca más el resto de deudas no supere el 30–35 % de los ingresos netos mensuales del hogar. Haz la cuenta con un tipo de interés algo superior al actual: una hipoteca dura décadas y las condiciones cambian.'),
    tip('Pide una preaprobación o estudio previo a uno o dos bancos antes de visitar viviendas. No te compromete a nada y te dice con qué cifra máxima puedes negociar. Cuando aparezca la vivienda adecuada, podrás reservarla sin dudar.'),

    h2('2. La búsqueda: definir antes de mirar'),
    p('Buscar sin criterios claros consume semanas y acaba por agotar. Antes de abrir el primer portal, escribe tres listas: lo imprescindible (sin lo que no compras), lo deseable (lo que inclina la balanza) y lo que no quieres bajo ningún concepto. Zona, superficie mínima, número de dormitorios, planta, ascensor, garaje y orientación suelen estar en la primera.'),
    p('Después, elige cómo vas a buscar. Las alertas de los portales funcionan bien si los filtros son precisos. Una agencia de la zona aporta algo distinto: conoce los edificios, sabe qué comunidades tienen derramas pendientes y, a menudo, enseña viviendas antes de publicarlas. En [nuestro catálogo](/propiedades?operacion=venta) puedes guardar búsquedas y recibir aviso cuando entre algo que encaje.'),
    img(IMAGES['g01-search'], { wide: true }),
    h3('Qué pedir antes de la visita'),
    p('Tres documentos permiten descartar viviendas sin moverse de casa: la nota simple del Registro de la Propiedad (titular, metros, cargas y limitaciones; se pide en línea por pocos euros), el certificado de eficiencia energética (obligatorio para anunciar la venta) y los últimos recibos de IBI y comunidad, que son dos gastos fijos de cada año.'),

    h2('3. Las visitas: mirar con método'),
    p('Una visita media dura veinte minutos, y en ese tiempo se decide una compra de cientos de miles de euros. Conviene ir con lista. Humedades en techos y esquinas, estado de ventanas y persianas, presión del agua, antigüedad de la caldera y del cuadro eléctrico, ruido de la calle y de los vecinos, luz natural a esa hora, estado del portal, la escalera y la fachada. Hemos reunido los quince puntos que más problemas dan en [Qué revisar antes de comprar una casa](/blog/que-revisar-antes-comprar-casa), con una lista interactiva por estancias.'),
    p('Si la vivienda te interesa, vuelve a otra hora y otro día de la semana: la luz de mediodía y la calle de un martes engañan. Habla con el portero o con un vecino; en cinco minutos sabrás si la comunidad funciona y si hay obras previstas.'),
    warn('Desconfía de la prisa. «Hay otra persona interesada» es la frase más repetida en una visita. Si es verdad, mejor perder la vivienda que comprarla sin haberla revisado; si no lo es, dice mucho de cómo va a ser la negociación.'),

    h2('4. La oferta y la negociación'),
    p('En España se negocia, pero con medida. Una oferta muy por debajo del precio cierra puertas; una justificada las abre. Argumenta con hechos: el tiempo que lleva publicada la vivienda, las reformas que necesita, lo que piden viviendas comparables en el mismo edificio o calle, el valor de referencia de Catastro. En [Cómo saber si una vivienda está bien de precio](/blog/como-saber-vivienda-bien-precio) explicamos qué factores pesan de verdad.'),
    p('Haz la oferta por escrito, aunque sea un correo electrónico, y ponle fecha de caducidad. Indica el precio, si la compra depende de obtener financiación, qué mobiliario o electrodomésticos se incluyen y el plazo que propones para firmar las arras y la escritura. Lo que no esté escrito, no existe.'),
    h3('La reserva o señal'),
    p('Cuando hay acuerdo verbal, muchas agencias piden una reserva: una cantidad pequeña, habitualmente entre 1.000 y 3.000 €, a cambio de retirar la vivienda del mercado durante unos días mientras se prepara el contrato de arras. Léela con cuidado. Debe decir qué pasa con ese dinero si finalmente no se firman las arras, y lo razonable es que se devuelva si el motivo es que la documentación revela un problema (una carga, una afección urbanística, una deuda con la comunidad).'),

    h2('5. El contrato de arras'),
    p('El contrato de arras es el compromiso de verdad. Es un contrato privado entre comprador y vendedor en el que se fijan el precio, el plazo máximo para firmar la escritura, la cantidad que se entrega a cuenta y, sobre todo, qué ocurre si alguna de las partes no cumple. Aunque se le llame «señal», no es la reserva anterior: aquí se compromete el grueso de la operación.'),
    p('El Código Civil, en su artículo 1454, regula las llamadas arras penitenciales: si el comprador se arrepiente, pierde lo entregado; si es el vendedor quien desiste, debe devolver el doble. Es la modalidad más habitual porque deja claro el coste de echarse atrás para cada parte. Existen otras dos: las confirmatorias, que son simplemente un pago a cuenta y permiten exigir el cumplimiento del contrato, y las penales, que funcionan como indemnización pactada. Si el contrato no dice expresamente que las arras son penitenciales y que se acogen al artículo 1454, los tribunales suelen interpretarlas como confirmatorias.'),
    img(IMAGES['g01-contract']),
    h3('Qué debe incluir'),
    table([
      ['Cláusula', 'Por qué importa'],
      ['Identificación completa de la vivienda', 'Dirección, referencia catastral y datos registrales: finca, tomo, libro, folio.'],
      ['Precio total y cantidad entregada', 'Lo habitual es en torno al 10 %, pero no es una obligación legal. Indica cómo y cuándo se paga el resto.'],
      ['Plazo para escriturar', 'Realista con la hipoteca: dos o tres meses es lo habitual. Prevé una prórroga si el retraso no es culpa de nadie.'],
      ['Naturaleza de las arras', 'Penitenciales, con referencia expresa al artículo 1454 del Código Civil.'],
      ['Condición de financiación', 'Si el banco deniega la hipoteca, recuperas las arras. Sin esta cláusula, perderías el dinero aunque la culpa no sea tuya.'],
      ['Estado de cargas', 'La vivienda se entrega libre de cargas, arrendatarios y ocupantes, y al corriente de pagos con la comunidad.'],
      ['Reparto de gastos', 'Quién paga qué en la escritura (lo normal es «según ley») y cómo se prorratean IBI y comunidad del año.'],
      ['Qué se incluye', 'Mobiliario, electrodomésticos, trastero, plaza de garaje: todo lo que no se escriba puede desaparecer antes de la entrega.'],
    ]),
    warn('Comprueba que firman todos los propietarios que figuran en la nota simple. Si la vivienda es de un matrimonio, de varios herederos o de una sociedad, hacen falta todas las firmas o un poder notarial. Unas arras firmadas por quien no puede vender no sirven de nada.'),

    h2('6. La hipoteca: de la tasación a la FEIN'),
    p('Con las arras firmadas, el banco pone en marcha la operación. Encarga una tasación oficial, que paga el comprador (entre 300 y 500 € en una vivienda media) y que tiene una validez de seis meses. Sobre ese valor y sobre tu capacidad de pago, el departamento de riesgos aprueba o no la hipoteca y fija sus condiciones definitivas.'),
    p('La Ley 5/2019, reguladora de los contratos de crédito inmobiliario, cambió el reparto de gastos. Desde entonces, el banco paga la notaría de la escritura del préstamo, su inscripción en el Registro, la gestoría y el Impuesto de Actos Jurídicos Documentados del préstamo. El comprador paga la tasación y las copias de la escritura que solicite. Esa misma ley obliga al banco a entregar dos documentos: la FEIN (Ficha Europea de Información Normalizada), que es la oferta vinculante con todas las condiciones, y la FiAE (Ficha de Advertencias Estandarizadas), que resume las cláusulas sensibles, como los índices de referencia, la posibilidad de vencimiento anticipado o los gastos.'),
    p('Entre la entrega de esa documentación y la firma deben pasar, como mínimo, diez días naturales. En ese plazo acudirás al notario, sin coste, a una comparecencia previa en la que te explicará el contrato y comprobará con un pequeño test que entiendes lo que vas a firmar.'),
    info('Compara al menos dos FEIN. La TAE recoge el tipo de interés y las comisiones, pero no los productos vinculados (seguros, tarjetas, nóminas) que algunos bancos exigen a cambio de una bonificación en el tipo. Suma lo que cuestan cada año antes de decidir.'),

    h2('7. La firma en notaría'),
    p('El día de la firma se concentran dos actos. Primero, la escritura de compraventa: el notario lee los datos de la vivienda, comprueba la identidad de las partes, verifica en el Registro que no ha entrado ninguna carga nueva y da fe de que el vendedor recibe el precio. Después, si hay hipoteca, la escritura del préstamo. El banco suele entregar el importe mediante un cheque bancario a nombre del vendedor o por transferencia en el mismo acto.'),
    p('El vendedor debe aportar ese día el certificado de la comunidad de propietarios acreditando que está al corriente de pagos (lo exige el artículo 9.1.e de la Ley de Propiedad Horizontal, y el comprador puede exonerarlo, aunque no es recomendable), el último recibo del IBI y el certificado de eficiencia energética. Si la vivienda es de obra nueva, además, la licencia de primera ocupación, el libro del edificio y el seguro decenal.'),
    img(IMAGES['g01-keys'], { wide: true }),

    h2('8. Impuestos y Registro: lo que queda después de las llaves'),
    p('La compra no termina en la notaría. En la mayoría de comunidades autónomas hay 30 días hábiles para liquidar el impuesto. En vivienda de segunda mano es el Impuesto de Transmisiones Patrimoniales (ITP), con un tipo que fija cada comunidad y una base imponible que, desde 2022, es la mayor de dos cantidades: el precio pagado o el valor de referencia de Catastro. En obra nueva se paga el IVA en el propio precio (el 10 % en la península y Baleares; en Canarias se aplica el IGIC) y, además, el AJD sobre la escritura. Los tipos de cada comunidad, con su fuente, están en la [calculadora de gastos](/blog/gastos-impuestos-comprar-vivienda).'),
    p('Con el impuesto pagado, la escritura se inscribe en el Registro de la Propiedad. No es obligatorio, pero sin inscripción no estás protegido frente a terceros y ningún banco inscribirá su hipoteca sobre una finca que no consta a tu nombre; con hipoteca, la gestoría del banco lo hace todo. Quedan los trámites pequeños: cambio de titularidad de los suministros (no des de baja los contratos: el alta nueva es más cara), aviso al administrador de la comunidad, empadronamiento y, si hay hipoteca, el seguro de daños, que puedes contratar con cualquier aseguradora.'),

    h2('Errores que se repiten'),
    p('Comprar sin preaprobación. Firmar arras sin cláusula de financiación. Fiarse de las medidas del anuncio en vez de las del Catastro. No pedir el certificado de la comunidad y heredar una derrama. Visitar una sola vez. Y dejar las preguntas incómodas para después: en [Las preguntas que debes hacer antes de comprar](/blog/preguntas-antes-comprar-vivienda) están ordenadas por categorías.'),
    { type: 'checklist', title: 'Tu lista de la compra', intro: 'Marca cada punto a medida que avances. La lista se guarda en este navegador y puedes imprimirla o descargarla.', storageKey: 'g01-compra', printable: true, downloadable: true, groups: [
      { title: 'Antes de buscar', items: [
        { text: 'Calculada la cifra máxima con gastos (precio + 10–12 %)', hint: 'Usa la calculadora de la guía de gastos.' },
        { text: 'Preaprobación o estudio previo de al menos un banco' },
        { text: 'Lista de imprescindibles, deseables y descartes' },
      ] },
      { title: 'En cada vivienda que interese', items: [
        { text: 'Nota simple reciente del Registro de la Propiedad' },
        { text: 'Certificado de eficiencia energética' },
        { text: 'Últimos recibos de IBI y comunidad; actas de las dos últimas juntas' },
        { text: 'Segunda visita a otra hora, con lista de revisión' },
      ] },
      { title: 'Oferta y arras', items: [
        { text: 'Oferta por escrito con fecha de caducidad y condiciones' },
        { text: 'Reserva con devolución clara si la documentación revela problemas' },
        { text: 'Arras penitenciales (art. 1454 CC), con cláusula de financiación y plazo realista' },
        { text: 'Firman todos los propietarios de la nota simple' },
      ] },
      { title: 'Hipoteca', items: [
        { text: 'Tasación encargada; validez de seis meses' },
        { text: 'FEIN y FiAE recibidas; comparadas al menos dos ofertas' },
        { text: 'Acta notarial previa realizada (mínimo diez días antes de la firma)' },
      ] },
      { title: 'Firma y después', items: [
        { text: 'Certificado de la comunidad, último IBI y certificado energético aportados por el vendedor' },
        { text: 'Medios de pago preparados (cheques bancarios o transferencia)' },
        { text: 'Impuesto liquidado en plazo (30 días hábiles en la mayoría de comunidades)' },
        { text: 'Escritura inscrita en el Registro' },
        { text: 'Suministros, comunidad y empadronamiento actualizados' },
      ] },
    ] },

    h2('Conclusión'),
    p('Una compra bien hecha no es la que va más rápido, sino la que no deja cabos sueltos. Cada fase tiene un documento que la cierra: la preaprobación, la nota simple, la oferta escrita, las arras, la FEIN, la escritura y la liquidación del impuesto. Si llegas a la notaría con todos ellos revisados, la firma es un trámite. Y si en algún punto algo no encaja, el momento de parar es antes de las arras, no después.'),
    faq([
      { q: '¿Cuánto tiempo se tarda en comprar una vivienda?', a: 'Desde la oferta aceptada hasta la firma, entre dos y tres meses es lo habitual cuando hay hipoteca, porque la tasación, el estudio de riesgos y el plazo legal de diez días de la FEIN marcan el ritmo. Al contado puede hacerse en tres o cuatro semanas. La búsqueda previa es lo que más varía: de unas semanas a más de un año.' },
      { q: '¿Qué pasa si el banco me deniega la hipoteca después de firmar las arras?', a: 'Depende de lo que diga el contrato. Si incluye una condición de financiación, recuperas las arras. Si no la incluye y las arras son penitenciales, el vendedor puede quedarse con el dinero entregado. Por eso la cláusula de financiación es la más importante del contrato para el comprador.' },
      { q: '¿Quién elige la notaría?', a: 'Quien paga la mayor parte de los honorarios, que en la compraventa es el comprador. Los aranceles están regulados y son iguales en toda España, así que la diferencia entre notarías es la disponibilidad y la atención, no el precio.' },
      { q: '¿Qué documentos debe entregarme el vendedor el día de la firma?', a: 'El certificado de la comunidad de propietarios de estar al corriente de pagos, el último recibo del IBI, el certificado de eficiencia energética y las llaves. En obra nueva, además, la licencia de primera ocupación, el libro del edificio, las garantías y el seguro decenal. En algunas comunidades autónomas se exige también la cédula de habitabilidad.' },
    ]),
    cta('¿Ya sabes lo que buscas?', 'Explora las viviendas disponibles y guarda tu búsqueda para que te avisemos cuando entre algo que encaje.', 'Explorar viviendas disponibles', '/propiedades?operacion=venta'),
    { type: 'properties', mode: 'latest', limit: 3 },
  ],
}

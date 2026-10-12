import { IMAGES } from './images'
import { cta, faq, h2, h3, img, info, keypoints, p, table, tip, warn, type GuiaArticle } from './types'

/**
 * Artículo 4 · Cómo saber si una vivienda está bien de precio.
 * Los ejemplos numéricos y el gráfico de factores (bloque factors_chart) son
 * ILUSTRATIVOS: enseñan cómo razonar sobre un precio, no describen el
 * mercado. El propio bloque lo indica; el texto lo repite.
 */
export const comoSaberViviendaBienPrecio: GuiaArticle = {
  key: 'g04',
  slug: 'como-saber-vivienda-bien-precio',
  title: 'Cómo saber si una vivienda está bien de precio',
  subtitle: 'Un método en cinco pasos para valorar una vivienda con criterio: comparables de verdad, los factores que suben o bajan el precio, los datos públicos que puedes consultar y cómo convertir todo eso en una oferta.',
  seoTitle: 'Cómo saber si una vivienda está bien de precio: método en 5 pasos',
  seoDescription: 'Cómo valorar una vivienda antes de comprar: comparables, factores que ajustan el precio, datos públicos (Catastro, tasación) y cómo hacer una oferta razonada.',
  focusKeyword: 'cómo saber si una vivienda está bien de precio',
  category: 'guias',
  reviewedAt: '2026-10-10',
  cover: IMAGES['g04-cover'],
  related: ['gastos-impuestos-comprar-vivienda', 'que-revisar-antes-comprar-casa', 'guia-comprar-vivienda'],
  blocks: [
    p('«¿Es caro?» es la pregunta que más se hace y peor se responde. El precio de un anuncio es una propuesta del vendedor, no un dato. Para saber si una vivienda está bien de precio hay que compararla con las que de verdad se le parecen, ajustar por lo que la hace mejor o peor y contrastar con lo que dicen las fuentes públicas. Este artículo propone un método en cinco pasos que puedes aplicar en una tarde y que convierte una intuición en una oferta razonada.'),
    keypoints([
      'El precio por metro cuadrado solo sirve si comparas superficies del mismo tipo (útil con útil, construida con construida) y viviendas realmente parecidas.',
      'Compara con precios de cierre, no de anuncio: lo publicado incluye el margen de negociación y lo que lleva meses sin venderse.',
      'Planta, ascensor, exterior o interior, orientación, estado y antigüedad del edificio son los factores que más mueven el precio dentro de una misma calle.',
      'El valor de referencia de Catastro y el precio de tasación son dos cifras públicas o accesibles que acotan el precio razonable.',
      'Una oferta razonada, con comparables e informe técnico, se negocia mejor que una rebaja a secas.',
    ]),

    h2('Paso 1. Decide qué estás comparando'),
    p('El error más habitual es comparar el precio por metro cuadrado de dos viviendas que no miden lo mismo de la misma manera. Un anuncio puede dar la superficie construida con elementos comunes (la mayor de todas), la construida sin comunes o la útil (la que se pisa), y entre la primera y la última hay fácilmente un 15–20 % de diferencia. Antes de dividir nada, consulta la superficie en la Sede Electrónica del Catastro con la referencia catastral y usa esa misma fuente para todas las viviendas que compares.'),
    p('Después, define qué es «parecido». Dentro de una misma ciudad el precio cambia por barrio, por calle y hasta por acera. Un comparable razonable está en el mismo barrio o en uno equivalente, tiene una superficie similar (±20 %), el mismo tipo de edificio (bloque de los setenta, finca regia, promoción reciente) y un estado comparable. Cuatro o cinco comparables buenos valen más que veinte malos.'),
    img(IMAGES['g04-street'], { wide: true }),

    h2('Paso 2. Busca precios de cierre, no de escaparate'),
    p('Lo que ves en los portales son precios de oferta. Incluyen el margen que el vendedor espera negociar y están sesgados por las viviendas que no se venden: las que llevan meses publicadas son, por definición, las que estaban caras. Para acercarte al precio al que de verdad se cierra, tienes varias vías. Pregunta a agencias de la zona por operaciones recientes similares: es su trabajo saberlo y suelen compartirlo con un comprador serio. Consulta las estadísticas de precios medios del Instituto Nacional de Estadística y del Ministerio de Vivienda, que se basan en escrituras y tasaciones reales, para conocer la tendencia general. Y observa cuánto tiempo lleva publicada cada vivienda que te interesa y si ha bajado de precio: los portales lo indican.'),
    info('Una regla útil: si una vivienda lleva más de tres meses publicada en un mercado activo, su precio de partida era alto. Si ha bajado dos veces, el vendedor tiene prisa. Ninguna de las dos cosas dice nada de la vivienda, pero sí del margen de negociación.'),

    h2('Paso 3. Ajusta por lo que la hace mejor o peor'),
    p('Dos viviendas de la misma calle y los mismos metros pueden valer cantidades muy distintas, y tiene sentido. Lo que hay que hacer es nombrar las diferencias y ponerles una magnitud aproximada, siempre partiendo de los comparables que has encontrado. El gráfico siguiente muestra cómo se razona: a partir de un precio de referencia, cada factor suma o resta un porcentaje. Las cifras son ilustrativas, pensadas para enseñar el método; en tu zona el peso real de cada factor puede ser mayor o menor, y lo sabrás mirando los comparables.'),
    { type: 'factors_chart', title: 'Cómo ajustan el precio los factores de una vivienda (ejemplo ilustrativo)', text: 'Partimos de un precio de referencia de 200.000 € para una vivienda tipo del barrio. Cada factor lo mueve hacia arriba o hacia abajo. Los porcentajes son un ejemplo para explicar el método, no datos de mercado.', base: 200000, factors: [
      { label: 'Planta alta con ascensor', pct: 6, why: 'Más luz, menos ruido y mejor reventa que las plantas bajas.' },
      { label: 'Exterior y orientación sur', pct: 5, why: 'Sol la mayor parte del día; menos gasto en calefacción.' },
      { label: 'Reformado hace menos de 10 años', pct: 8, why: 'Instalaciones, ventanas y baños que no habrá que tocar.' },
      { label: 'Edificio anterior a 1970 sin ITE', pct: -5, why: 'Obras comunitarias probables; derramas.' },
      { label: 'Sin ascensor (3.ª planta)', pct: -10, why: 'Reduce el número de compradores posibles.' },
      { label: 'Interior a patio', pct: -8, why: 'Menos luz natural y ventilación.' },
      { label: 'Garaje incluido', pct: 7, why: 'Evita comprar una plaza aparte en una zona con escasez.' },
    ] },
    h3('Los factores que más pesan'),
    table([
      ['Factor', 'Qué mirar', 'Efecto habitual'],
      ['Planta y ascensor', 'Bajo, entresuelo, planta alta; con o sin ascensor', 'Un bajo o una planta alta sin ascensor se venden con descuento; una planta alta con ascensor, con prima.'],
      ['Exterior o interior', 'Ventanas a calle, a patio de manzana o a patio de luces', 'El exterior se paga; el interior a patio de luces es lo que más baja.'],
      ['Orientación', 'Sur y suroeste frente a norte', 'En el norte de España, la orientación sur es un argumento de venta real.'],
      ['Estado', 'Para entrar a vivir, para actualizar o para reformar', 'Una reforma integral se descuenta del precio, y algo más por las molestias.'],
      ['Edificio', 'Año, fachada, cubierta, ITE, ascensor, portal', 'Obras pendientes = derramas = descuento.'],
      ['Anejos', 'Garaje, trastero, terraza, jardín', 'Suman, pero menos de lo que costarían por separado.'],
      ['Eficiencia energética', 'Letra del certificado y facturas reales', 'Cada vez pesa más: una F o G anticipa obras de ventanas y aislamiento.'],
      ['Comunidad', 'Cuota mensual, servicios, morosidad', 'Una cuota alta sin servicios resta; una comunidad sana suma.'],
    ]),
    p('La [lista de los quince aspectos a revisar](/blog/que-revisar-antes-comprar-casa) te ayudará a detectar estos factores en la visita. Lo que encuentres ahí (una caldera que hay que cambiar, un cuadro eléctrico antiguo, una derrama votada) no es solo un problema: es un argumento con un coste concreto que puedes llevar a la negociación.'),

    h2('Paso 4. Contrasta con las cifras públicas'),
    h3('El valor de referencia de Catastro'),
    p('Desde 2022, la Dirección General del Catastro publica cada año un valor de referencia para cada inmueble, calculado a partir de los precios de compraventas reales comunicados por los notarios en la zona. Es la base mínima del Impuesto de Transmisiones Patrimoniales, así que conviene conocerlo por razones fiscales (lo explicamos en la [guía de gastos e impuestos](/blog/gastos-impuestos-comprar-vivienda)). Pero también es una pista de valoración: no tiene en cuenta el estado concreto de la vivienda ni su planta, por lo que un precio muy por encima del valor de referencia debería estar justificado por algo que se ve, y un precio muy por debajo merece una pregunta.'),
    h3('La tasación'),
    p('Si vas a pedir hipoteca, el banco encargará una tasación a una sociedad homologada por el Banco de España. El tasador visita la vivienda, mide, comprueba el Registro y el Catastro y aplica el método de comparación con testigos de la zona. Es la valoración más rigurosa a la que vas a tener acceso, y la pagas tú, así que pide el informe completo y léelo: incluye los comparables usados y las advertencias (superficie no coincidente, obras sin legalizar, cargas). Puedes encargar la tasación antes de firmar las arras, con un tasador que acepte tu banco, y usarla para decidir cuánto ofrecer.'),
    img(IMAGES['g04-plan']),
    h3('Otras fuentes'),
    p('El Instituto Nacional de Estadística publica el Índice de Precios de Vivienda, basado en escrituras, y el Ministerio de Vivienda el valor tasado medio por provincia y municipio grande. El Colegio de Registradores publica estadísticas de compraventas e importes medios de hipotecas. Ninguna de estas fuentes te dirá cuánto vale un piso concreto, pero sí si los precios de tu zona suben, bajan o se han estancado, y a qué ritmo. Desconfía de cualquier «precio medio del barrio» que no diga de dónde sale.'),
    img(IMAGES['g04-balcony']),

    h2('Paso 5. Convierte el análisis en una oferta'),
    p('Llegados aquí tienes un rango, no un número: el precio que marcan los comparables ajustados, acotado por el valor de referencia y, si la tienes, la tasación. La oferta debe estar dentro de ese rango y venir acompañada de los motivos. «Ofrezco 185.000 € porque los tres pisos similares vendidos en la calle en el último año se cerraron entre 180.000 y 190.000 €, el cuadro eléctrico hay que renovarlo y la comunidad tiene aprobada la obra de la fachada» se negocia; «ofrezco 185.000 € a ver qué pasa» no.'),
    p('Pon la oferta por escrito y con fecha de caducidad, indica si depende de la financiación y qué se incluye. Si el vendedor rechaza y contraoferta, pregunta qué justifica la diferencia: a veces hay información que no tenías (una reforma reciente de la cubierta, por ejemplo) y a veces solo hay expectativa. En la [guía paso a paso](/blog/guia-comprar-vivienda) explicamos cómo encaja la oferta con la reserva y las arras.'),
    tip('Decide antes de negociar cuál es tu precio máximo y escríbelo. En una negociación se pierde la perspectiva con facilidad, y la diferencia entre lo que pensabas pagar y lo que acabas firmando suele ser exactamente la que fijaste de más por no haberlo escrito.'),

    h2('Dos ejemplos para ver el método'),
    p('Los dos casos siguientes son inventados y sirven para ilustrar el razonamiento, no para describir ningún mercado concreto.'),
    table([
      ['', 'Caso A: piso en bloque de 1975', 'Caso B: piso en edificio de 2008'],
      ['Precio pedido', '165.000 €', '240.000 €'],
      ['Superficie (Catastro, construida)', '82 m²', '95 m²'],
      ['Comparables cerrados (ajustados)', '150.000–160.000 €', '235.000–250.000 €'],
      ['Factores a favor', 'Exterior, orientación sur, garaje', 'Ascensor, para entrar a vivir, trastero'],
      ['Factores en contra', 'Sin ascensor (3.ª), cuadro eléctrico antiguo, fachada pendiente de ITE', 'Interior a patio de manzana, cuota de comunidad alta'],
      ['Valor de referencia de Catastro', '142.000 €', '228.000 €'],
      ['Conclusión', 'Precio alto: oferta razonada en torno a 150.000 € con informe técnico y actas de la comunidad', 'Precio en rango: margen de negociación pequeño; comprobar cuota y gastos reales antes de ofrecer'],
    ]),
    p('Fíjate en que en el caso A el argumento no es «está caro», sino tres hechos con coste: la falta de ascensor, la instalación eléctrica y la obra de fachada. Y en el caso B, la conclusión es que el precio es razonable, lo cual también es un resultado útil: evita perder la vivienda por regatear un 10 % que no estaba justificado.'),
    warn('Ningún método sustituye a ver la vivienda, el edificio y el barrio. Los números acotan la decisión; no la toman por ti. Y si una vivienda está claramente por debajo de todo lo comparable, averigua por qué antes de celebrarlo.'),

    h2('Conclusión'),
    p('Saber si una vivienda está bien de precio no exige ser experto, sino comparar bien: superficies de la misma fuente, viviendas realmente parecidas, precios de cierre y no de escaparate, y un ajuste razonado por los factores que se ven en la visita. El valor de referencia y la tasación ponen el marco; los comparables, el detalle; el informe técnico, los argumentos. Con eso, la oferta deja de ser una apuesta y pasa a ser una propuesta que un vendedor serio puede aceptar.'),
    faq([
      { q: '¿Cuánto se puede negociar el precio de una vivienda?', a: 'No hay un porcentaje fijo. Depende de cuánto tiempo lleve publicada, de la prisa del vendedor, de si el precio de partida era realista y de los argumentos que lleves. En mercados activos, las rebajas suelen ser pequeñas; en viviendas con meses de anuncio o con obras pendientes, mayores. Lo que se negocia bien es lo que se justifica con comparables y con el coste de lo que hay que arreglar.' },
      { q: '¿Sirve el precio por metro cuadrado para comparar?', a: 'Sirve si comparas superficies de la misma fuente y del mismo tipo (útil con útil o construida con construida) y viviendas realmente parecidas en ubicación, edificio y estado. Usado sin esas precauciones, induce a error: un ático reformado y un bajo interior del mismo edificio no deberían tener el mismo precio por metro.' },
      { q: '¿Qué diferencia hay entre el valor de referencia de Catastro y el valor catastral?', a: 'El valor catastral es un valor administrativo, normalmente muy inferior al de mercado, que se usa para el IBI. El valor de referencia, que existe desde 2022, se calcula a partir de compraventas reales y busca aproximarse al valor de mercado; es la base mínima del ITP y del Impuesto de Sucesiones y Donaciones. Los dos se consultan en la Sede Electrónica del Catastro.' },
      { q: '¿Puedo pedir una tasación antes de hacer la oferta?', a: 'Sí. Cualquier particular puede encargar una tasación a una sociedad homologada por el Banco de España. Si después pides hipoteca, el banco debe aceptarla siempre que la tasadora esté homologada y la tasación no haya caducado (seis meses), aunque puede revisarla. Es un gasto que puede ahorrarte mucho más en la negociación.' },
      { q: '¿Qué hago si el vendedor no baja el precio?', a: 'Si tu oferta está dentro del rango de los comparables y el vendedor no se mueve, tienes dos opciones honestas: pagar la diferencia porque la vivienda lo vale para ti, o dejarla ir. Lo que no conviene es superar el máximo que fijaste por no perder la operación. Siempre aparece otra vivienda; recuperar un sobreprecio cuesta años.' },
    ]),
    cta('¿Buscas una vivienda y quieres una segunda opinión sobre el precio?', 'Nuestros asesores conocen los cierres reales de cada zona y te ayudan a preparar una oferta razonada.', 'Explorar viviendas disponibles', '/propiedades?operacion=venta'),
    { type: 'properties', mode: 'latest', limit: 3 },
  ],
}

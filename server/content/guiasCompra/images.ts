import type { GuiaImage } from './types'

/**
 * Imágenes de las guías de compra (public/demo-assets/norte-astur/blog/*.webp).
 * Todas CC0 y acreditadas en public/demo-assets/norte-astur/CREDITOS.md; son
 * fotografías genéricas con licencia, NO viviendas reales de Norte Astur.
 * Las portadas son 16:9 (1600×900); las del cuerpo, 1600 px de ancho.
 *
 * Fuentes: la portada de la primera guía viene de Wikimedia Commons (foto CC0
 * de la era Unsplash); el resto, del directorio WordPress Photos (CC0). Cada
 * fichero lleva su autor y su página de origen en CREDITOS.md.
 */
export const IMAGES: Record<string, GuiaImage> = {
  'g01-cover': { file: 'g01-cover.webp', alt: "Dos hileras de casas en una calle residencial", credit: "David Cohen dcp · CC0 (Unsplash / Wikimedia Commons)", width: 1600, height: 900 },
  'g01-search': { file: 'g01-search.webp', alt: "Portátil abierto sobre una mesa redonda: la búsqueda de vivienda empieza en casa", credit: "Dan Tabifranca · CC0 (WordPress Photos)", width: 1600, height: 900 },
  'g01-contract': { file: 'g01-contract.webp', alt: "Una mano escribe con bolígrafo sobre una agenda junto a una ventana", credit: "soycelycruz · CC0 (WordPress Photos)", width: 1600, height: 1067 },
  'g01-keys': { file: 'g01-keys.webp', alt: "Puerta de entrada de madera de una vivienda con aldaba de bronce", credit: "bug273 · CC0 (WordPress Photos)", width: 1600, height: 1064 },
  'g02-cover': { file: 'g02-cover.webp', alt: "Billetes de euro doblados sobre una mesa de madera", credit: "Roy Tanck · CC0 (WordPress Photos)", width: 1600, height: 900 },
  'g02-desk': { file: 'g02-desk.webp', alt: "Bloc de notas y bolígrafo sobre el teclado de un portátil", credit: "Rashed Hossain · CC0 (WordPress Photos)", width: 1600, height: 1200 },
  'g02-signing': { file: 'g02-signing.webp', alt: "Bolígrafo sobre un cuaderno escrito a mano", credit: "David Chandra Purnama · CC0 (WordPress Photos)", width: 1600, height: 901 },
  'g02-savings': { file: 'g02-savings.webp', alt: "Moneda de veinte céntimos de euro en primer plano", credit: "Rámon van Raaij · CC0 (WordPress Photos)", width: 1600, height: 1067 },
  'g03-cover': { file: 'g03-cover.webp', alt: "Comedor luminoso con grandes ventanales, cortinas blancas y plantas", credit: "Da Chakrapan · CC0 (WordPress Photos)", width: 1600, height: 900 },
  'g03-window': { file: 'g03-window.webp', alt: "Ventana rústica con contraventanas de madera abierta a un paisaje de olivos", credit: "María Cortés · CC0 (WordPress Photos)", width: 1600, height: 1200 },
  'g03-kitchen': { file: 'g03-kitchen.webp', alt: "Cafetera italiana sobre el fogón de gas de una cocina con azulejos blancos", credit: "Nilo Velez · CC0 (WordPress Photos)", width: 1600, height: 1067 },
  'g03-facade': { file: 'g03-facade.webp', alt: "Fachada de un bloque de viviendas con balcones idénticos bajo un cielo azul", credit: "Michael Burridge · CC0 (WordPress Photos)", width: 1600, height: 1200 },
  'g04-cover': { file: 'g04-cover.webp', alt: "Fachada azul claro de un edificio clásico con balcones de forja", credit: "Eduardo Salinas · CC0 (WordPress Photos)", width: 1600, height: 900 },
  'g04-street': { file: 'g04-street.webp', alt: "Calle empedrada entre edificios de viviendas en un centro histórico", credit: "Nilo Velez · CC0 (WordPress Photos)", width: 1600, height: 1063 },
  'g04-balcony': { file: 'g04-balcony.webp', alt: "Balcones de madera de una casa antigua llenos de macetas con flores", credit: "Javier Salinas · CC0 (WordPress Photos)", width: 1600, height: 1067 },
  'g04-plan': { file: 'g04-plan.webp', alt: "Cuaderno de piel y bolígrafo junto a un portátil, para preparar los comparables", credit: "Sharankrishna VP · CC0 (WordPress Photos)", width: 1600, height: 1067 },
  'g05-cover': { file: 'g05-cover.webp', alt: "Grúas amarillas sobre un edificio en construcción bajo un cielo azul", credit: "Limpinho · CC0 (WordPress Photos)", width: 1600, height: 900 },
  'g05-construction': { file: 'g05-construction.webp', alt: "Edificios de viviendas de obra nueva en construcción, con una grúa", credit: "Cristina Ecija · CC0 (WordPress Photos)", width: 1600, height: 900 },
  'g05-interior': { file: 'g05-interior.webp', alt: "Salón moderno con sofá curvo beige, mesa verde y puf", credit: "mujuonly · CC0 (WordPress Photos)", width: 1600, height: 1200 },
  'g05-oldbuilding': { file: 'g05-oldbuilding.webp', alt: "Fachada curva de un edificio antiguo de arquitectura clásica con columnas", credit: "chris_c · CC0 (WordPress Photos)", width: 1600, height: 1067 },
  'g06-cover': { file: 'g06-cover.webp', alt: "Dos personas de espaldas conversan mirando los edificios de la otra orilla", credit: "Nilo Velez · CC0 (WordPress Photos)", width: 1600, height: 900 },
  'g06-meeting': { file: 'g06-meeting.webp', alt: "Mesa de madera con cuatro sillas en una cafetería", credit: "Paal Joachim Romdahl · CC0 (WordPress Photos)", width: 1600, height: 1200 },
  'g06-documents': { file: 'g06-documents.webp', alt: "Una persona toma notas con bolígrafo sobre sus documentos durante una reunión", credit: "Nilo Velez · CC0 (WordPress Photos)", width: 1600, height: 1067 },
  'g06-entrance': { file: 'g06-entrance.webp', alt: "Entrada de un edificio antiguo con portón de arco y fachada cubierta de hiedra", credit: "Alvaro Gómez · CC0 (WordPress Photos)", width: 1600, height: 900 },
}

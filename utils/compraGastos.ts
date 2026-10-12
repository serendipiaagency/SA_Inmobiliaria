/**
 * Parámetros fiscales de la compraventa de vivienda en España, para la
 * calculadora de gastos del blog (bloque `cost_calculator`,
 * components/cms/CostCalculator.vue) y su prueba unitaria.
 *
 * Reglas de esta tabla:
 *  - Cada comunidad lleva el tipo GENERAL (o la escala general) de ITP para
 *    vivienda usada y el tipo general de AJD que paga quien compra obra
 *    nueva (además del IVA / IGIC). Los tipos reducidos (jóvenes, familias
 *    numerosas, discapacidad, VPO, zonas rurales…) existen en casi todas las
 *    comunidades y NO se aplican aquí: la calculadora lo avisa.
 *  - `verified` dice si el dato se contrastó con una fuente oficial
 *    (agencia tributaria autonómica, boletín o portal del gobierno) en la
 *    fecha de `REVIEWED_AT`. Lo que no se pudo contrastar queda como
 *    `pending` y la calculadora lo enseña como «pendiente de revisión
 *    editorial»: nunca se presenta como confirmado lo que no lo está.
 *  - Nada de aquí es asesoramiento fiscal: es una estimación orientativa.
 */

export const REVIEWED_AT = '2026-10-10'

export interface ItpBracket {
  /** Límite superior del tramo (€); `null` = sin límite. */
  upTo: number | null
  /** Tipo del tramo, en % */
  rate: number
}

export interface RegionTax {
  code: string
  name: string
  /** Escala de ITP (vivienda usada): un solo tramo = tipo único. Progresiva por tramos cuando hay varios. */
  itp: ItpBracket[]
  /** AJD, tipo general en % (obra nueva: se paga sobre el precio al escriturar la compraventa sujeta a IVA). */
  ajd: number
  /** Impuesto indirecto de la obra nueva: IVA 10 % en la península y Baleares; IGIC 7 % general en Canarias. */
  newBuildTax: { name: 'IVA' | 'IGIC'; rate: number }
  verified: 'official' | 'pending'
  /** Fuente oficial consultada (o lo que falta por confirmar). */
  source: string
  /** Matices que conviene leer antes de fiarse del número. */
  notes?: string
}

const IVA = { name: 'IVA', rate: 10 } as const
const IGIC = { name: 'IGIC', rate: 7 } as const

export const REGIONS: RegionTax[] = [
  { code: 'AND', name: 'Andalucía', itp: [{ upTo: null, rate: 7 }], ajd: 1.2, newBuildTax: IVA, verified: 'official', source: 'Junta de Andalucía, ITPAJD: tipos generales 7 % (TPO) y 1,2 % (AJD) desde la Ley 5/2021.' },
  { code: 'ARA', name: 'Aragón', itp: [{ upTo: 400000, rate: 8 }, { upTo: 450000, rate: 8.5 }, { upTo: 500000, rate: 9 }, { upTo: 750000, rate: 9.5 }, { upTo: null, rate: 10 }], ajd: 1.5, newBuildTax: IVA, verified: 'pending', source: 'Administración Tributaria de Aragón: 8 % hasta 400.000 € y hasta 10 % desde 750.000 € (DL 1/2005, art. 121-1); AJD 1,5 %. Los tramos intermedios están pendientes de confirmar.', notes: 'Escala progresiva por tramos.' },
  { code: 'AST', name: 'Asturias', itp: [{ upTo: 300000, rate: 8 }, { upTo: 500000, rate: 9 }, { upTo: null, rate: 10 }], ajd: 1.2, newBuildTax: IVA, verified: 'pending', source: 'Servicios Tributarios del Principado de Asturias: AJD general 1,2 % confirmado; la escala de TPO (8/9/10 %) está pendiente de confirmar en la guía del impuesto.', notes: 'Tipos reducidos del 3 % (vivienda protegida) y 4–6 % para jóvenes, familias numerosas y zonas rurales.' },
  { code: 'BAL', name: 'Illes Balears', itp: [{ upTo: 400000, rate: 8 }, { upTo: 600000, rate: 9 }, { upTo: 1000000, rate: 10 }, { upTo: 2000000, rate: 12 }, { upTo: null, rate: 13 }], ajd: 1.5, newBuildTax: IVA, verified: 'pending', source: 'ATIB: tramos de 8, 9 y 10 % hasta 1.000.000 € y AJD 1,5 % confirmados; los tramos superiores (12 y 13 %) están pendientes de confirmar.', notes: 'Vivienda habitual: 2 % sobre los primeros 270.151,20 € con requisitos (desde 2024); bonificaciones nuevas en 2026.' },
  { code: 'CAN', name: 'Canarias', itp: [{ upTo: null, rate: 6.5 }], ajd: 1, newBuildTax: IGIC, verified: 'official', source: 'Agencia Tributaria Canaria: TPO 6,5 % general; AJD 1 % en documentos de operaciones sujetas a IGIC; IGIC general 7 % (tipos reducidos del 5 % y 3 % para vivienda habitual hasta 150.000 €).' },
  { code: 'CNT', name: 'Cantabria', itp: [{ upTo: null, rate: 9 }], ajd: 1, newBuildTax: IVA, verified: 'official', source: 'Gobierno de Cantabria: tipo general 9 % (7 % en los primeros 200.000 € de vivienda habitual) y AJD 1 % desde 2024.', notes: 'El presupuesto de 2026 proponía ampliar el 7 % hasta 300.000 €: comprobar si está en vigor.' },
  { code: 'CLM', name: 'Castilla-La Mancha', itp: [{ upTo: null, rate: 9 }], ajd: 1.5, newBuildTax: IVA, verified: 'pending', source: 'Portal Tributario de Castilla-La Mancha: TPO 9 % general confirmado (Ley 8/2013, art. 19); el AJD general del 1,5 % está pendiente de confirmar.', notes: 'Desde el 31/03/2026, tipos reducidos para primera vivienda (6 %; 3 % menores de 36 años).' },
  { code: 'CYL', name: 'Castilla y León', itp: [{ upTo: 250000, rate: 8 }, { upTo: null, rate: 10 }], ajd: 1.5, newBuildTax: IVA, verified: 'pending', source: 'Tributos de la Junta de Castilla y León: TPO 8 % general y AJD 1,5 % confirmados; el tramo del 10 % por encima de 250.000 € está pendiente de confirmar.', notes: 'Tipos reducidos del 4 % y 0,01 % en determinados supuestos (Ley 4/2024).' },
  { code: 'CAT', name: 'Cataluña', itp: [{ upTo: 600000, rate: 10 }, { upTo: 900000, rate: 11 }, { upTo: 1500000, rate: 12 }, { upTo: null, rate: 13 }], ajd: 1.5, newBuildTax: IVA, verified: 'pending', source: 'Agència Tributària de Catalunya: 10 % hasta 600.000 € y AJD 1,5 % confirmados; los tramos superiores (11, 12 y 13 % desde el 27/06/2025) están pendientes de confirmar.', notes: 'Grandes tenedores: 20 %. Reducidos: 7 % VPO; 5 % familias numerosas, monoparentales, jóvenes, discapacidad; 4 %/3 % en municipios rurales.' },
  { code: 'EXT', name: 'Extremadura', itp: [{ upTo: 360000, rate: 8 }, { upTo: 600000, rate: 10 }, { upTo: null, rate: 11 }], ajd: 1.5, newBuildTax: IVA, verified: 'pending', source: 'Portal Tributario de Extremadura (DL 1/2018): escala y AJD pendientes de confirmar; una ficha del portal cita un AJD del 2 % para determinado concepto.', notes: 'Comprobar antes de usar: las fuentes consultadas no coinciden.' },
  { code: 'GAL', name: 'Galicia', itp: [{ upTo: null, rate: 8 }], ajd: 1.5, newBuildTax: IVA, verified: 'official', source: 'ATRIGA: TPO 8 % general desde el 01/01/2024 (clave TU1) y AJD 1,5 % general (1 % primera vivienda habitual).' },
  { code: 'RIO', name: 'La Rioja', itp: [{ upTo: null, rate: 7 }], ajd: 1, newBuildTax: IVA, verified: 'pending', source: 'Gobierno de La Rioja: TPO 7 % general confirmado; el AJD general está pendiente de confirmar (las fuentes consultadas citan 1 %, 1,5 % y 0,3 % según el supuesto).' },
  { code: 'MAD', name: 'Comunidad de Madrid', itp: [{ upTo: null, rate: 6 }], ajd: 0.75, newBuildTax: IVA, verified: 'official', source: 'Comunidad de Madrid: TPO 6 % general; AJD en transmisiones de vivienda a personas físicas: 0,4 % hasta 120.000 €, 0,5 % hasta 180.000 € y 0,75 % por encima.', notes: 'La calculadora aplica el 0,75 % (tramo más alto); por debajo de 180.000 € el AJD real es menor.' },
  { code: 'MUR', name: 'Región de Murcia', itp: [{ upTo: null, rate: 7.75 }], ajd: 1.5, newBuildTax: IVA, verified: 'official', source: 'ATRM: TPO 7,75 % desde el 25/07/2025 (antes 8 %) y AJD 1,5 % en compraventas sujetas a IVA (Ley 3/2025).' },
  { code: 'NAV', name: 'Navarra', itp: [{ upTo: 180304, rate: 5 }, { upTo: null, rate: 6 }], ajd: 0.5, newBuildTax: IVA, verified: 'pending', source: 'Hacienda Foral de Navarra (guía 2022): viviendas al 5 % hasta 180.304 € de base y 6 % general; AJD 0,5 %. Pendiente de confirmar tras las medidas tributarias de 2026.' },
  { code: 'PVA', name: 'País Vasco', itp: [{ upTo: null, rate: 4 }], ajd: 0.5, newBuildTax: IVA, verified: 'official', source: 'Haciendas forales de Bizkaia, Gipuzkoa y Álava: viviendas 4 % (2,5 % vivienda habitual de menos de 120 m² o familia numerosa); AJD 0,5 %.', notes: 'Locales, garajes sueltos y suelo: 7 %.' },
  { code: 'VAL', name: 'Comunitat Valenciana', itp: [{ upTo: null, rate: 9 }], ajd: 1.4, newBuildTax: IVA, verified: 'pending', source: 'ATV: TPO general 9 % (TU1) confirmado; el AJD general del 1,4 % (rebajado desde el 1,5 %) y un posible 11 % por encima de 1.000.000 € están pendientes de confirmar.', notes: 'Reducidos: 6 % primera vivienda de menores de 35 años y VPO; 3 % en determinados supuestos desde 2025.' },
  { code: 'CEU', name: 'Ceuta y Melilla', itp: [{ upTo: null, rate: 6 }], ajd: 0.5, newBuildTax: { name: 'IVA', rate: 10 }, verified: 'pending', source: 'Tipo estatal supletorio del 6 % (Ley del ITPAJD) y AJD 0,5 %; en Ceuta y Melilla la obra nueva tributa por IPSI, no por IVA: pendiente de revisión editorial.', notes: 'La calculadora no modela el IPSI.' },
]

export type RegionCode = (typeof REGIONS)[number]['code']

export function regionByCode(code: string): RegionTax | undefined {
  return REGIONS.find((r) => r.code === code)
}

/** ITP por tramos: cada tramo tributa a su tipo (escala progresiva). */
export function itpFor(price: number, brackets: ItpBracket[]): number {
  let total = 0
  let from = 0
  for (const b of brackets) {
    const top = b.upTo ?? Infinity
    if (price <= from) break
    const portion = Math.min(price, top) - from
    total += (portion * b.rate) / 100
    from = top
  }
  return round2(total)
}

/** El tipo efectivo que resulta de la escala, en %. */
export function itpEffectiveRate(price: number, brackets: ItpBracket[]): number {
  if (price <= 0) return brackets[0]?.rate ?? 0
  return round2((itpFor(price, brackets) / price) * 100)
}

export interface CostInput {
  price: number
  region: string
  kind: 'new' | 'used'
  /** Con hipoteca: tasación y gestoría del préstamo a cargo del comprador. */
  mortgage: boolean
  /** Importe del préstamo, para orientar (no cambia el cálculo salvo la tasación, que es fija). */
  loanAmount?: number
}

export interface CostLine {
  key: string
  label: string
  amount: number
  /** Cómo se ha calculado: lo que el lector debe poder comprobar. */
  how: string
  estimate?: boolean
}

export interface CostResult {
  lines: CostLine[]
  taxes: number
  fees: number
  total: number
  /** Gastos + impuestos sobre el precio, en % */
  pctOfPrice: number
  region: RegionTax
}

/**
 * Honorarios de notaría y registro: arancel estatal por tramos (RD 1426/1989
 * y RD 1427/1989), que en la práctica se mueve en estas horquillas para una
 * vivienda. Se usa una estimación proporcional acotada, y la calculadora lo
 * marca como estimación. La gestoría es libre: se toma una cifra habitual.
 */
export const FEES = {
  notaryMin: 600,
  notaryMax: 1200,
  registryMin: 400,
  registryMax: 700,
  agency: 350,
  appraisal: 350,
  mortgageAgency: 300,
} as const

function notary(price: number): number {
  // De 600 € (≈100.000 €) a 1.200 € (≈600.000 €): crece despacio con el precio.
  const v = 600 + Math.max(0, price - 100000) * 0.0012
  return round2(Math.min(FEES.notaryMax, Math.max(FEES.notaryMin, v)))
}
function registry(price: number): number {
  const v = 400 + Math.max(0, price - 100000) * 0.0006
  return round2(Math.min(FEES.registryMax, Math.max(FEES.registryMin, v)))
}

export function computePurchaseCosts(input: CostInput): CostResult | null {
  const region = regionByCode(input.region)
  const price = Number(input.price)
  if (!region || !Number.isFinite(price) || price <= 0) return null
  const lines: CostLine[] = []
  if (input.kind === 'new') {
    const tax = round2((price * region.newBuildTax.rate) / 100)
    lines.push({ key: 'iva', label: `${region.newBuildTax.name} (${fmtPct(region.newBuildTax.rate)})`, amount: tax, how: `${fmtPct(region.newBuildTax.rate)} del precio: ${fmtEur(price)} × ${region.newBuildTax.rate} %` })
    const ajd = round2((price * region.ajd) / 100)
    lines.push({ key: 'ajd', label: `AJD (${fmtPct(region.ajd)})`, amount: ajd, how: `Actos Jurídicos Documentados sobre la escritura de compraventa: ${fmtEur(price)} × ${region.ajd} %` })
  } else {
    const itp = itpFor(price, region.itp)
    const eff = itpEffectiveRate(price, region.itp)
    lines.push({ key: 'itp', label: `ITP (${region.itp.length > 1 ? `escala, ${fmtPct(eff)} efectivo` : fmtPct(region.itp[0].rate)})`, amount: itp, how: region.itp.length > 1 ? `Escala por tramos: ${region.itp.map((b, i) => `${b.rate} % ${b.upTo ? `hasta ${fmtEur(b.upTo)}` : 'en adelante'}${i < region.itp.length - 1 ? ' · ' : ''}`).join('')}` : `${fmtEur(price)} × ${region.itp[0].rate} %` })
  }
  lines.push({ key: 'notary', label: 'Notaría', amount: notary(price), how: 'Arancel notarial por tramos del precio (estimación)', estimate: true })
  lines.push({ key: 'registry', label: 'Registro de la Propiedad', amount: registry(price), how: 'Arancel registral por tramos del precio (estimación)', estimate: true })
  lines.push({ key: 'agency', label: 'Gestoría', amount: FEES.agency, how: 'Tramitación de impuestos e inscripción (precio libre; cifra habitual)', estimate: true })
  if (input.mortgage) {
    lines.push({ key: 'appraisal', label: 'Tasación', amount: FEES.appraisal, how: 'La paga quien pide la hipoteca (cifra habitual)', estimate: true })
    lines.push({ key: 'mortgageAgency', label: 'Gestoría de la hipoteca', amount: FEES.mortgageAgency, how: 'Desde 2019 los gastos de notaría, registro, gestoría y AJD del préstamo los paga el banco; la tasación y, a veces, una gestoría propia, el comprador', estimate: true })
  }
  const taxes = round2(lines.filter((l) => ['iva', 'ajd', 'itp'].includes(l.key)).reduce((s, l) => s + l.amount, 0))
  const fees = round2(lines.filter((l) => !['iva', 'ajd', 'itp'].includes(l.key)).reduce((s, l) => s + l.amount, 0))
  const total = round2(taxes + fees)
  return { lines, taxes, fees, total, pctOfPrice: round2((total / price) * 100), region }
}

export function fmtEur(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
export function fmtPct(n: number): string {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n)} %`
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

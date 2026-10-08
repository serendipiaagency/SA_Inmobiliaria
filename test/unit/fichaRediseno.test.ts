import { describe, expect, it } from 'vitest'
import { mergePage, neighborsInContext, nextPage, parseCatalogContext, previousPage, type CatalogContext } from '../../utils/catalogContext'
import { priceTrend, sparklinePath } from '../../utils/priceTrend'
import { derivedPros, fichaHighlights, splitHighlights } from '../../utils/fichaHighlights'

/**
 * Rediseño de la ficha pública (#111): «‹ Anterior / Siguiente ›» dentro de la
 * búsqueda del catálogo, la evolución del precio sólo con cambios reales y los
 * puntos destacados de la descripción sin frases de relleno.
 */

const t = (_k: string, fallback: string) => fallback
const item = (n: number) => ({ slug: `p-${n}`, name: `Propiedad ${n}` })
const page = (n: number, per = 3) => Array.from({ length: per }, (_, k) => item((n - 1) * per + k + 1))
function ctx(over: Partial<CatalogContext> = {}): CatalogContext {
  return { href: '/propiedades?municipality=Oviedo&page=2', query: { municipality: 'Oviedo' }, perPage: 3, total: 8, start: 3, items: page(2), ...over }
}

describe('contexto del catálogo para Anterior / Siguiente', () => {
  it('lee sólo lo que tiene la forma esperada', () => {
    expect(parseCatalogContext(null)).toBeNull()
    expect(parseCatalogContext('no es json')).toBeNull()
    expect(parseCatalogContext(JSON.stringify({ href: 'https://otra.web/x', items: [item(1)] })), 'sólo rutas propias').toBeNull()
    expect(parseCatalogContext(JSON.stringify({ href: '/propiedades', items: [] })), 'sin resultados no hay contexto').toBeNull()
    const parsed = parseCatalogContext(JSON.stringify({ ...ctx(), query: { municipality: 'Oviedo', page: '2', perPage: '3', bad: 4 }, items: [item(4), { slug: '' }, 'x', item(5)] }))
    expect(parsed?.items).toEqual([item(4), item(5)])
    expect(parsed?.query, 'sin página ni valores raros').toEqual({ municipality: 'Oviedo' })
  })

  it('las vecinas dentro de lo guardado, y nada si la propiedad no está', () => {
    expect(neighborsInContext(ctx(), 'p-5')).toEqual({ index: 1, prev: item(4), next: item(6) })
    expect(neighborsInContext(ctx(), 'p-4')?.prev).toBeNull()
    expect(neighborsInContext(ctx(), 'otra')).toBeNull()
    expect(neighborsInContext(null, 'p-4')).toBeNull()
  })

  it('en el borde, la página de al lado con los mismos filtros', () => {
    expect(previousPage(ctx())).toBe(1)
    expect(nextPage(ctx())).toBe(3)
    expect(previousPage(ctx({ start: 0, items: page(1) }))).toBeNull()
    expect(nextPage(ctx({ start: 6, items: [item(7), item(8)] })), 'la última página').toBeNull()
  })

  it('une la página pedida delante o detrás, sin repetir', () => {
    const before = mergePage(ctx(), 1, page(1))
    expect(before.start).toBe(0)
    expect(before.items.map((x) => x.slug)).toEqual(['p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6'])
    expect(neighborsInContext(before, 'p-4')?.prev).toEqual(item(3))
    const after = mergePage(before, 3, [item(7), item(8), item(6)])
    expect(after.items.map((x) => x.slug)).toEqual(['p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6', 'p-7', 'p-8'])
    expect(nextPage(after)).toBeNull()
  })
})

describe('evolución del precio', () => {
  it('sin cambios registrados no hay tendencia', () => {
    expect(priceTrend([], 200000)).toBeNull()
    expect(priceTrend(null, 200000)).toBeNull()
    expect(priceTrend([{ price: 200000, recordedAt: '2025-04-01 10:00:00' }], 200000), 'un precio que no ha cambiado').toBeNull()
  })

  it('del primer precio conocido al actual, con la fecha del primer cambio', () => {
    const trend = priceTrend(
      [
        { price: 190000, previousPrice: 193000, recordedAt: '2025-04-10 09:00:00' },
        { price: 185000, previousPrice: 190000, recordedAt: '2025-09-01 09:00:00' },
      ],
      185000,
    )
    expect(trend).toEqual({ pct: -4, since: '2025-04-10 09:00:00', points: [193000, 190000, 185000] })
  })

  it('una subida lleva signo positivo y el precio actual cierra la serie', () => {
    const trend = priceTrend([{ price: 210000, previousPrice: 200000, recordedAt: '2025-01-01' }], 220000)
    expect(trend?.pct).toBe(10)
    expect(trend?.points).toEqual([200000, 210000, 220000])
  })

  it('la mini gráfica es una polilínea dentro de su caja', () => {
    const d = sparklinePath([3, 2, 1], 46, 26, 3)
    expect(d.startsWith('M3.0 3.0')).toBe(true)
    expect(d.endsWith('L43.0 23.0')).toBe(true)
    expect(sparklinePath([1], 46, 26)).toBe('')
  })
})

describe('puntos destacados de la descripción', () => {
  it('los «Puntos clave» de la agencia, uno por línea o separados', () => {
    expect(splitHighlights('Vivienda luminosa\n- Zona tranquila\n\n• Buena distribución')).toEqual(['Vivienda luminosa', 'Zona tranquila', 'Buena distribución'])
    expect(splitHighlights('vistas al mar, reformado en 2024, vistas al mar')).toEqual(['Vistas al mar', 'Reformado en 2024'])
    expect(splitHighlights('')).toEqual([])
  })

  it('sin puntos clave, sólo lo que dicen los datos; sin datos, nada', () => {
    expect(fichaHighlights({ keyHighlights: 'Cerca de servicios' }, t)).toEqual({ source: 'editorial', items: ['Cerca de servicios'] })
    const fromData = fichaHighlights({ orientation: 'SE', hasPool: 1, status: 'ready' }, t)
    expect(fromData.source).toBe('data')
    expect(fromData.items).toEqual(['Muy luminoso — orientación sur', 'Listo para entrar a vivir', 'Piscina en la comunidad'])
    expect(fichaHighlights({}, t)).toEqual({ source: null, items: [] })
    expect(derivedPros({}, t), 'nunca «Ubicación privilegiada» de relleno').toEqual([])
  })
})

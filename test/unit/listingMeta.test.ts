import { describe, expect, it } from 'vitest'
import { formatListingDate, listingMetaRows, parseRowDate, relativeDate } from '../../utils/listingMeta'

/**
 * Cola 6 de la ficha pública: el bloque «Última actualización · Publicada el
 * · Referencia del anuncio» (utils/listingMeta.ts). Fechas relativas si son
 * recientes, enteras si no; sin dato, sin fila; sin filas, sin bloque.
 */

const t = (key: string, fallback: string) => fallback
const NOW = new Date('2026-10-14T10:30:00Z')

describe('parseRowDate', () => {
  it('lee las fechas como las guarda D1 (AAAA-MM-DD HH:MM:SS, UTC), en ISO y sólo con el día', () => {
    expect(parseRowDate('2026-10-14 09:30:00')?.toISOString()).toBe('2026-10-14T09:30:00.000Z')
    expect(parseRowDate('2026-10-14T09:30:00')?.toISOString()).toBe('2026-10-14T09:30:00.000Z')
    expect(parseRowDate('2026-10-14T09:30:00Z')?.toISOString()).toBe('2026-10-14T09:30:00.000Z')
    expect(parseRowDate('2026-10-14T11:30:00+02:00')?.toISOString()).toBe('2026-10-14T09:30:00.000Z')
    expect(parseRowDate('2026-10-14')?.toISOString()).toBe('2026-10-14T00:00:00.000Z')
    expect(parseRowDate('14/10/2026')?.toISOString()).toBe('2026-10-14T00:00:00.000Z')
    expect(parseRowDate(new Date('2026-10-14T09:30:00Z'))?.toISOString()).toBe('2026-10-14T09:30:00.000Z')
  })

  it('devuelve null con lo que no es una fecha', () => {
    expect(parseRowDate(null)).toBeNull()
    expect(parseRowDate(undefined)).toBeNull()
    expect(parseRowDate('')).toBeNull()
    expect(parseRowDate('   ')).toBeNull()
    expect(parseRowDate('no es una fecha')).toBeNull()
    expect(parseRowDate('2026-02-30')).toBeNull()
    expect(parseRowDate(new Date('x'))).toBeNull()
    expect(parseRowDate({})).toBeNull()
  })
})

describe('formatListingDate', () => {
  it('la fecha entera, día mes año, en el idioma de la web y en UTC', () => {
    const d = new Date('2026-10-14T23:30:00Z')
    expect(formatListingDate(d, 'es-ES')).toBe('14 de octubre de 2026')
    expect(formatListingDate(d, 'en-GB')).toBe('14 October 2026')
    expect(formatListingDate(d, 'de-DE')).toBe('14. Oktober 2026')
    expect(formatListingDate(d, 'fr-FR')).toBe('14 octobre 2026')
  })
})

describe('relativeDate', () => {
  it('«Hoy», «Ayer» y «Hace n días» si es de esta semana; si no, la fecha entera', () => {
    expect(relativeDate(new Date('2026-10-14T00:10:00Z'), NOW, 'es-ES', t)).toBe('Hoy')
    expect(relativeDate(new Date('2026-10-13T23:50:00Z'), NOW, 'es-ES', t)).toBe('Ayer')
    expect(relativeDate(new Date('2026-10-12T10:30:00Z'), NOW, 'es-ES', t)).toBe('Hace 2 días')
    expect(relativeDate(new Date('2026-10-08T10:30:00Z'), NOW, 'es-ES', t)).toBe('Hace 6 días')
    expect(relativeDate(new Date('2026-10-07T10:30:00Z'), NOW, 'es-ES', t)).toBe('7 de octubre de 2026')
    expect(relativeDate(new Date('2025-01-02T10:30:00Z'), NOW, 'es-ES', t)).toBe('2 de enero de 2025')
  })

  it('una fecha futura (reloj desajustado) sale entera, nunca «Hace -1 días»', () => {
    expect(relativeDate(new Date('2026-10-16T10:30:00Z'), NOW, 'es-ES', t)).toBe('16 de octubre de 2026')
  })

  it('usa las traducciones de la web', () => {
    const en = (key: string, fallback: string) => ({ 'ficha.meta.today': 'Today', 'ficha.meta.yesterday': 'Yesterday', 'ficha.meta.daysAgo': '{n} days ago' })[key] ?? fallback
    expect(relativeDate(new Date('2026-10-14T00:10:00Z'), NOW, 'en-GB', en)).toBe('Today')
    expect(relativeDate(new Date('2026-10-13T10:30:00Z'), NOW, 'en-GB', en)).toBe('Yesterday')
    expect(relativeDate(new Date('2026-10-11T10:30:00Z'), NOW, 'en-GB', en)).toBe('3 days ago')
  })
})

describe('listingMetaRows', () => {
  it('las tres filas, con etiqueta, valor y datetime en las fechas', () => {
    const rows = listingMetaRows({ updatedAt: '2026-10-14 09:00:00', publishedAt: '2026-09-01 12:00:00', createdAt: '2026-08-01 08:00:00' }, 'AG-77', 'es-ES', t, NOW)
    expect(rows).toEqual([
      { key: 'updated', label: 'Última actualización', value: 'Hoy', datetime: '2026-10-14T09:00:00.000Z' },
      { key: 'published', label: 'Publicada el', value: '1 de septiembre de 2026', datetime: '2026-09-01T12:00:00.000Z' },
      { key: 'reference', label: 'Referencia del anuncio', value: 'AG-77' },
    ])
  })

  it('la actualización es relativa (ayer, hace n días) o entera según lo reciente que sea', () => {
    expect(listingMetaRows({ updatedAt: '2026-10-13 09:00:00' }, '', 'es-ES', t, NOW)[0].value).toBe('Ayer')
    expect(listingMetaRows({ updatedAt: '2026-10-10 09:00:00' }, '', 'es-ES', t, NOW)[0].value).toBe('Hace 4 días')
    expect(listingMetaRows({ updatedAt: '2026-09-10 09:00:00' }, '', 'es-ES', t, NOW)[0].value).toBe('10 de septiembre de 2026')
  })

  it('sin fecha de publicación, la de alta; sin ninguna, no hay fila', () => {
    const rows = listingMetaRows({ updatedAt: '2026-10-14 09:00:00', publishedAt: null, createdAt: '2026-08-01 08:00:00' }, null, 'es-ES', t, NOW)
    expect(rows.map((r) => r.key)).toEqual(['updated', 'published'])
    expect(rows[1].value).toBe('1 de agosto de 2026')
    // Una cadena vacía (el valor por defecto de la columna) tampoco es una fecha.
    expect(listingMetaRows({ updatedAt: '2026-10-14 09:00:00', publishedAt: '', createdAt: '' }, null, 'es-ES', t, NOW).map((r) => r.key)).toEqual(['updated'])
  })

  it('sin datos → sin filas; referencia vacía → sin fila de referencia', () => {
    expect(listingMetaRows({}, '', 'es-ES', t, NOW)).toEqual([])
    expect(listingMetaRows(null, null, 'es-ES', t, NOW)).toEqual([])
    expect(listingMetaRows({ updatedAt: '', createdAt: '' }, '   ', 'es-ES', t, NOW)).toEqual([])
    expect(listingMetaRows({ updatedAt: '2026-10-14 09:00:00' }, '   ', 'es-ES', t, NOW).map((r) => r.key)).toEqual(['updated'])
    expect(listingMetaRows({}, 'CC-9', 'es-ES', t, NOW)).toEqual([{ key: 'reference', label: 'Referencia del anuncio', value: 'CC-9' }])
  })
})

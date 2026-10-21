/**
 * Bloques corporativos de la portada (docs/home-corporativa.md): las cifras
 * que puede enseñar «Conoce nuestra inmobiliaria» y los textos por defecto.
 *
 * Las cifras «en vivo» son recuentos reales de la cuenta (server/utils/
 * publicCompany.ts); las «propias» (custom1…custom4) las escribe la agencia
 * en el inspector cuando tiene un dato verificado que la plataforma no puede
 * contar (años de experiencia, operaciones cerradas…). Una cifra en vivo a 0
 * no se pinta: no hay nada que presumir.
 */
export const LIVE_STAT_KEYS = ['team', 'offices', 'properties', 'zones', 'languages'] as const
export type LiveStatKey = (typeof LIVE_STAT_KEYS)[number]
export const CUSTOM_STAT_KEYS = ['custom1', 'custom2', 'custom3', 'custom4'] as const
export type CustomStatKey = (typeof CUSTOM_STAT_KEYS)[number]
export type StatKey = LiveStatKey | CustomStatKey

export const LIVE_STAT_LABELS: Record<LiveStatKey, { one: string; many: string; inspector: string }> = {
  team: { one: 'asesor inmobiliario', many: 'asesores inmobiliarios', inspector: 'Comerciales publicados en la web' },
  offices: { one: 'oficina', many: 'oficinas', inspector: 'Oficinas publicadas en la web' },
  properties: { one: 'vivienda publicada', many: 'viviendas publicadas', inspector: 'Viviendas en el catálogo público' },
  zones: { one: 'guía de zona', many: 'guías de zona', inspector: 'Guías de zona publicadas' },
  languages: { one: 'idioma de atención', many: 'idiomas de atención', inspector: 'Idiomas del equipo publicado' },
}

export const MAX_STATS = 4

export function isLiveStatKey(key: unknown): key is LiveStatKey {
  return typeof key === 'string' && (LIVE_STAT_KEYS as readonly string[]).includes(key)
}
export function isCustomStatKey(key: unknown): key is CustomStatKey {
  return typeof key === 'string' && (CUSTOM_STAT_KEYS as readonly string[]).includes(key)
}

export interface ResolvedStat {
  key: StatKey
  value: string
  label: string
  /** Cifra en vivo (recuento real) o propia (escrita por la agencia). */
  live: boolean
}

/**
 * Las cifras que el bloque pinta, en el orden elegido: las en vivo con su
 * recuento (y la etiqueta por defecto o la escrita en `labelTeam`…), las
 * propias con su valor y etiqueta; se omite lo que no tiene valor.
 */
export function resolveStats(content: Record<string, any>, stats: Partial<Record<LiveStatKey, number>> | null | undefined): ResolvedStat[] {
  const keys: unknown[] = Array.isArray(content.stats) ? content.stats : ['team', 'offices', 'properties']
  const out: ResolvedStat[] = []
  for (const key of keys) {
    if (out.length >= MAX_STATS) break
    if (isLiveStatKey(key)) {
      const n = Number(stats?.[key] ?? 0)
      if (!Number.isFinite(n) || n <= 0) continue
      const override = typeof content[`label${key.charAt(0).toUpperCase()}${key.slice(1)}`] === 'string' ? String(content[`label${key.charAt(0).toUpperCase()}${key.slice(1)}`]).trim() : ''
      out.push({ key, value: String(n), label: override || (n === 1 ? LIVE_STAT_LABELS[key].one : LIVE_STAT_LABELS[key].many), live: true })
    } else if (isCustomStatKey(key)) {
      const idx = key.slice(-1)
      const value = String(content[`customValue${idx}`] || '').trim()
      const label = String(content[`customLabel${idx}`] || '').trim()
      if (!value || !label) continue
      out.push({ key, value, label, live: false })
    }
  }
  return out
}

/** Los argumentos de «Nuestra experiencia, tu tranquilidad» que tienen título. */
export function resolveTrustPoints(content: Record<string, any>): Array<{ index: number; title: string; text: string }> {
  const count = Math.min(4, Math.max(3, Number(content.count) || 4))
  const out: Array<{ index: number; title: string; text: string }> = []
  for (let i = 1; i <= count; i++) {
    const title = String(content[`point${i}Title`] || '').trim()
    if (!title) continue
    out.push({ index: i, title, text: String(content[`point${i}Text`] || '').trim() })
  }
  return out
}

/**
 * Los servicios de la sección «Servicios» (Cola 25) que tienen título: hasta
 * seis, cada uno con su icono (una clave de utils/featureIcons.ts), su título
 * y su explicación. Un servicio sin título no se pinta —así la agencia
 * enseña sólo los que ofrece, no una rejilla con huecos vacíos.
 */
export function resolveServices(content: Record<string, any>): Array<{ index: number; icon: string; title: string; text: string }> {
  const out: Array<{ index: number; icon: string; title: string; text: string }> = []
  for (let i = 1; i <= 6; i++) {
    const title = String(content[`service${i}Title`] || '').trim()
    if (!title) continue
    out.push({ index: i, icon: String(content[`service${i}Icon`] || '').trim(), title, text: String(content[`service${i}Text`] || '').trim() })
  }
  return out
}

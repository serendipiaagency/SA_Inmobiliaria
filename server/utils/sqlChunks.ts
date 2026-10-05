/**
 * D1 admite como máximo 100 parámetros por consulta: un `IN (…)` con una
 * página entera de ids (el listado genérico pagina hasta 100) más la
 * organización ya lo supera y la consulta falla. Los `IN` construidos a
 * partir de una lista de tamaño variable se parten en trozos de este tamaño,
 * que deja margen para el resto de condiciones de la misma consulta.
 */
export const D1_IN_CHUNK = 80

export function chunkList<T>(list: readonly T[], size = D1_IN_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Ejecuta `run` por trozos de la lista y junta los resultados, en orden. Sin elementos, ni siquiera consulta. */
export async function selectInChunks<T, R>(list: readonly T[], run: (part: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = []
  for (const part of chunkList(list)) out.push(...(await run(part)))
  return out
}

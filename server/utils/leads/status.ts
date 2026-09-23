/**
 * Cuándo un lead deja de estar vivo.
 *
 * Vive en su propio módulo —sin base de datos ni H3— por dos motivos. Uno
 * práctico: el SLA es puro y se prueba sin base de datos, así que no puede
 * importar `pipeline.ts`. Y uno de fondo: es la definición que comparten la
 * carga de trabajo del reparto (FASE 15) y el SLA (FASE 16). Si un sitio
 * contase como vivo lo que el otro cuenta como cerrado, el panel mostraría dos
 * cargas distintas para el mismo comercial y ninguna de las dos sería falsa.
 *
 * En este modelo el cierre vive en `leads.status` — no hay una columna
 * `outcome` aparte, que habría permitido un lead "ganado" y "vivo" a la vez.
 */
export const CLOSED_STATUSES = ['won', 'lost'] as const
export type ClosedStatus = (typeof CLOSED_STATUSES)[number]

export function isClosedStatus(status: string | null | undefined): boolean {
  return CLOSED_STATUSES.includes(String(status || '') as ClosedStatus)
}

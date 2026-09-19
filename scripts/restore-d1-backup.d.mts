/**
 * Tipos de scripts/restore-d1-backup.mjs para quien lo importa desde
 * TypeScript (test/unit/backup.restore.test.ts). El script es JavaScript a
 * propósito —se ejecuta con `node` directamente, sin compilar, igual que el
 * resto de scripts/— y esto es el contrato de su parte pura.
 */
export const DB_NAME: string
export const BUCKET_NAME: string
export const EPHEMERAL_TABLES: string[]

export interface Snapshot {
  takenAt?: string
  tables: Record<string, Record<string, unknown>[]>
}

export interface RestorePlan {
  statements: string[]
  /** Filas esperadas por tabla tras restaurar — lo que el script verifica contra la base. */
  expected: Record<string, number>
  /** Tablas presentes en la instantánea que se han omitido por efímeras. */
  skipped: string[]
}

export function isSafeIdentifier(name: string): boolean
export function sqlLiteral(value: unknown): string
export function buildRestoreStatements(snapshot: unknown, options?: { tables?: string[] | null; includeEphemeral?: boolean }): RestorePlan
export function dropOrder(references: Record<string, string[]>): string[]
export function countInsertsPerTable(sqlText: string): Record<string, number>
export function isSqliteInternalTable(name: string): boolean
export function splitSqlStatements(sqlText: string): string[]
export function reorderExportForImport(sqlText: string): string[]
export function readSnapshot(path: string): Snapshot

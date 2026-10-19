import { eq, sql } from 'drizzle-orm'
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as schema from '../../db/schema'

/**
 * Antes de borrar a un usuario del todo: lo que firmó —artículos, trabajos de
 * publicación, exportaciones…— conserva su fila y pierde sólo la autoría
 * (`created_by`, `user_id`… pasan a NULL). Sin esto, una clave foránea de
 * cualquier tabla que el usuario hubiera tocado impedía eliminarlo, y su
 * correo seguía ocupado para siempre («esta cuenta ya está registrada»).
 *
 * Sale del propio esquema, así que una tabla nueva con una FK a `users` entra
 * sola. Las columnas `NOT NULL` no se tocan: si alguna sigue apuntando al
 * usuario, el borrado falla con su 409 de siempre y la fila no se pierde.
 * Las FK con `ON DELETE CASCADE` (sesiones, 2FA…) las resuelve la base de datos.
 */
export function usersReferenceColumns(): { table: SQLiteTable; column: string; tableName: string }[] {
  const out: { table: SQLiteTable; column: string; tableName: string }[] = []
  for (const v of Object.values(schema) as unknown[]) {
    if (!(v instanceof SQLiteTable)) continue
    const cfg = getTableConfig(v)
    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference()
      if (getTableConfig(ref.foreignTable).name !== 'users') continue
      if (fk.onDelete === 'cascade') continue
      for (const col of ref.columns) if (!col.notNull) out.push({ table: v, column: col.name, tableName: cfg.name })
    }
  }
  return out
}

export async function releaseUserReferences(db: any, userId: number): Promise<number> {
  const cols = usersReferenceColumns()
  for (const c of cols) await db.run(sql`UPDATE ${sql.identifier(c.tableName)} SET ${sql.identifier(c.column)} = NULL WHERE ${sql.identifier(c.column)} = ${userId}`)
  return cols.length
}

/** Para las pruebas: la fila del usuario y el recuento de lo que aún apunta a él. */
export async function userStillExists(db: any, userId: number): Promise<boolean> {
  const rows = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  return rows.length > 0
}

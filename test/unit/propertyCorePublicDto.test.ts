import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Auditoría de la migración 0068: todo endpoint público que devuelve una fila
 * (o una lista de filas) de `developer_properties`/`agent_properties` tiene
 * que pasarla por `toPublicProperty`/`toPublicProperties`
 * (server/utils/propertyPrivacy.ts) antes de devolverla — si no, la
 * referencia interna, el mandato o una ubicación marcada como no-exacta se
 * filtran tal cual.
 *
 * Esto es lo que hizo real el bug que arregló esta misma fase:
 * similar.get.ts y communities/[id].get.ts hacían `db.select()` completo
 * sobre developer_properties y devolvían la fila sin pasar por la
 * redacción, aunque home/properties/[slug] ya la aplicaban. Sin esta prueba
 * un endpoint nuevo (o uno de estos, tocado por otro cambio) puede volver a
 * hacerlo sin que nada lo note.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const FILES_MUST_USE_REDACTION = [
  'server/api/public/home.get.ts',
  'server/api/public/properties.get.ts',
  // La ficha (/api/public/properties/<slug>) y la propiedad de ejemplo del
  // Constructor cargan lo mismo con server/utils/properties/publicDetail.ts.
  'server/utils/properties/publicDetail.ts',
  'server/api/public/properties/[slug]/similar.get.ts',
  'server/api/public/communities/[id].get.ts',
]

describe('los endpoints públicos que devuelven properties usan propertyPrivacy', () => {
  it.each(FILES_MUST_USE_REDACTION)('%s importa y usa toPublicProperty(ies)', (file) => {
    const source = readFileSync(join(ROOT, file), 'utf8')
    expect(source, `${file} no importa server/utils/propertyPrivacy`).toMatch(/from ['"].*propertyPrivacy['"]/)
    expect(source, `${file} no llama a toPublicProperty ni a toPublicProperties`).toMatch(/toPublicPropert(y|ies)\(/)
  })
})

describe('la ficha pública y la propiedad de ejemplo del Constructor pasan por la misma carga redactada', () => {
  it.each(['server/api/public/properties/[slug].get.ts', 'server/api/admin/site-pages/ficha-sample.get.ts'])('%s devuelve loadPublicPropertyDetail', (file) => {
    const source = readFileSync(join(ROOT, file), 'utf8')
    expect(source).toMatch(/from ['"].*properties\/publicDetail['"]/)
    expect(source).toMatch(/loadPublicPropertyDetail\(db, project\)/)
    // Nada de la fila sin redactar fuera de esa carga.
    expect(source).not.toMatch(/return \{[^}]*project[,:]/)
  })
})

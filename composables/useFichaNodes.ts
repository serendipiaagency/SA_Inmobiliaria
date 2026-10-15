import { nodeId } from '~/utils/siteBuilder/nodes'
import { fichaNode, fichaText } from '~/utils/siteBuilder/fichaNodes'
import { SITE_BLOCK_KEY, SITE_EDITOR_KEY } from '~/composables/useSiteEditor'

/**
 * Los nodos de la ficha editable (utils/siteBuilder/fichaNodes.ts). La ficha
 * es la zona dinámica de «Ficha de propiedad»: un solo bloque del Constructor
 * (SITE_BLOCK_KEY) cuyos elementos son nodos. `attrs('b.price')` devuelve los
 * atributos que hay que poner en el elemento real —igual que `useSbNode` en
 * los demás bloques—, con el tipo, la etiqueta y el origen sacados del
 * registro, así que la plantilla de la ficha sólo dice QUÉ nodo es.
 *
 * - Producción: sólo `data-sb-node` y `data-sb-kind`, el gancho de la hoja de
 *   estilos generada (utils/siteBuilder/nodes.ts). Fuera de un bloque del
 *   Constructor (la ficha sin página publicada) no añade nada.
 * - Lienzo: además lo que el marco del bloque lee al hacer clic y la marca de
 *   seleccionado.
 *
 * `text(content, field)` es el texto de un nodo de texto fijo: el reescrito en
 * la plantilla o, sin él, el de partida.
 */
export function useFichaNodes() {
  const editor = inject(SITE_EDITOR_KEY, null)
  const block = inject(SITE_BLOCK_KEY, null)

  function attrs(field: string): Record<string, string> {
    const def = fichaNode(field)
    if (!def || !block) return {}
    const a: Record<string, string> = { 'data-sb-node': nodeId(block.id, field), 'data-sb-kind': def.kind }
    if (!editor || editor.mode.value !== 'builder') return a
    a['data-sb-label'] = def.label
    if (def.dynamic) a['data-sb-dynamic'] = def.dynamic
    if (def.sourceHref) a['data-sb-source'] = def.sourceHref
    if (editor.selectedBlockId.value === block.id && editor.selectedNodeField.value === field) a['data-sb-selected'] = '1'
    return a
  }

  return { attrs, text: fichaText, editor, block }
}

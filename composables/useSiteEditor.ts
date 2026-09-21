import type { InjectionKey, MaybeRefOrGetter, Ref } from 'vue'
import { NODE_KINDS, nodeId, type NodeKind } from '~/utils/siteBuilder/nodes'

/**
 * Contexto de edición del Constructor Web — lo que hace que un nodo sepa si
 * está en el lienzo, si está seleccionado y si se está editando su texto.
 *
 * `SiteBlockRenderer` lo provee (SITE_EDITOR_KEY) una vez por página y
 * `SiteBlockFrame` provee, por bloque, el id del bloque (SITE_BLOCK_KEY).
 * Un componente de nodo (components/site-builder/nodes/*) llama a
 * `useSbNode()` y obtiene los atributos que tiene que poner en su elemento
 * real —el `<h2>`, el `<a>`, el `<img>` de siempre—, sin envolverlo en nada:
 *
 * - En producción, sólo `data-sb-node` y `data-sb-kind`: el gancho de la hoja
 *   de estilos generada (utils/siteBuilder/nodes.ts). Sin contexto de bloque
 *   (el mismo componente usado fuera del Constructor, p. ej. ProjectCard en
 *   /propiedades) no añade nada en absoluto.
 * - En el lienzo, además, lo que el marco del bloque lee del DOM al hacer
 *   clic para describir el nodo al shell (tipo, etiqueta, si es dinámico…),
 *   y las marcas de seleccionado/editando que el CSS del lienzo pinta.
 *
 * La selección la decide el shell (fuera del iframe) y llega por postMessage;
 * el estado de edición inline es local al lienzo, porque el cursor no puede
 * esperar a un viaje de ida y vuelta.
 */

export type EditorMode = 'production' | 'builder' | 'preview'

export interface SiteNodeRef {
  blockId: string
  field: string
  kind: NodeKind
  label: string
  /** Descripción de la fuente cuando el contenido es dinámico ("Propiedades → Nombre"); null si es estático. */
  dynamic: string | null
  /** Ruta del panel donde se administra el dato dinámico. */
  sourceHref: string | null
  /** Clave de `content` que guarda el destino del enlace (botones y enlaces). */
  linkField: string | null
  /** Clave de `content` que guarda el texto alternativo (imágenes). */
  altField: string | null
  /** Texto de varias líneas: Enter inserta salto de línea; Ctrl/Cmd+Enter confirma. */
  multiline: boolean
}

export interface SiteEditorContext {
  mode: Ref<EditorMode>
  selectedBlockId: Ref<string | null>
  selectedNodeField: Ref<string | null>
  editingNodeField: Ref<string | null>
  select: (blockId: string, node: SiteNodeRef | null) => void
  startEdit: (node: SiteNodeRef) => void
  stopEdit: () => void
  updateText: (node: SiteNodeRef, text: string) => void
  nodeAction: (node: SiteNodeRef, action: string) => void
}

export interface SiteBlockContext {
  id: string
  type: string
}

export const SITE_EDITOR_KEY: InjectionKey<SiteEditorContext> = Symbol('site-editor')
export const SITE_BLOCK_KEY: InjectionKey<SiteBlockContext> = Symbol('site-block')

export function useSiteEditor(): SiteEditorContext | null {
  return inject(SITE_EDITOR_KEY, null)
}

export interface UseSbNodeOptions {
  field: string
  kind: NodeKind
  label?: string
  dynamic?: string | null
  sourceHref?: string | null
  linkField?: string | null
  altField?: string | null
  multiline?: boolean
}

/** Lee del DOM lo que `useSbNode` escribió — el camino inverso, usado por SiteBlockFrame al hacer clic. */
export function nodeRefFromElement(el: Element): SiteNodeRef | null {
  const id = el.getAttribute('data-sb-node')
  const kind = el.getAttribute('data-sb-kind') as NodeKind | null
  if (!id || !kind || !(kind in NODE_KINDS)) return null
  const sep = id.indexOf(':')
  if (sep <= 0) return null
  return {
    blockId: id.slice(0, sep),
    field: id.slice(sep + 1),
    kind,
    label: el.getAttribute('data-sb-label') || NODE_KINDS[kind].label,
    dynamic: el.getAttribute('data-sb-dynamic'),
    sourceHref: el.getAttribute('data-sb-source'),
    linkField: el.getAttribute('data-sb-link-field'),
    altField: el.getAttribute('data-sb-alt-field'),
    multiline: el.getAttribute('data-sb-multiline') === '1',
  }
}

export function useSbNode(options: MaybeRefOrGetter<UseSbNodeOptions>) {
  const editor = inject(SITE_EDITOR_KEY, null)
  const block = inject(SITE_BLOCK_KEY, null)
  const opts = computed(() => toValue(options))

  const id = computed(() => (block ? nodeId(block.id, opts.value.field) : null))
  const isBuilder = computed(() => !!editor && !!block && editor.mode.value === 'builder')
  const isSelected = computed(
    () => isBuilder.value && editor!.selectedBlockId.value === block!.id && editor!.selectedNodeField.value === opts.value.field,
  )
  const isEditing = computed(() => isSelected.value && editor!.editingNodeField.value === opts.value.field)

  const nodeRef = computed<SiteNodeRef | null>(() => {
    if (!block) return null
    const o = opts.value
    return {
      blockId: block.id,
      field: o.field,
      kind: o.kind,
      label: o.label || NODE_KINDS[o.kind].label,
      dynamic: o.dynamic ?? null,
      sourceHref: o.sourceHref ?? null,
      linkField: o.linkField ?? null,
      altField: o.altField ?? null,
      multiline: !!o.multiline,
    }
  })

  const attrs = computed<Record<string, string>>(() => {
    if (!id.value) return {}
    const o = opts.value
    const a: Record<string, string> = { 'data-sb-node': id.value, 'data-sb-kind': o.kind }
    if (!isBuilder.value) return a
    const ref = nodeRef.value!
    a['data-sb-label'] = ref.label
    if (ref.dynamic) a['data-sb-dynamic'] = ref.dynamic
    if (ref.sourceHref) a['data-sb-source'] = ref.sourceHref
    if (ref.linkField) a['data-sb-link-field'] = ref.linkField
    if (ref.altField) a['data-sb-alt-field'] = ref.altField
    if (ref.multiline) a['data-sb-multiline'] = '1'
    if (isSelected.value) a['data-sb-selected'] = '1'
    if (isEditing.value) a['data-sb-editing'] = '1'
    return a
  })

  return { editor, block, id, isBuilder, isSelected, isEditing, nodeRef, attrs }
}

/**
 * Edición inline de un texto: `contenteditable` en modo sólo-texto sobre el
 * propio elemento, sin HTML (lo que se pega entra como texto plano, lo que
 * se escribe sale con `innerText`). Cada pulsación actualiza el modelo del
 * shell; Escape devuelve el texto original; Enter (o Ctrl/Cmd+Enter en
 * textos de varias líneas) confirma; perder el foco confirma.
 *
 * Mientras se edita, el componente no vuelve a pintar el texto que le llega
 * por props (sería el eco de lo que acaba de escribir y movería el cursor).
 */
export function useInlineText(
  el: Ref<HTMLElement | null>,
  text: Ref<string>,
  node: { editor: SiteEditorContext | null; nodeRef: Ref<SiteNodeRef | null>; isEditing: Ref<boolean> },
) {
  const shown = ref(text.value)
  let original = ''

  watch(text, (t) => {
    if (!node.isEditing.value) shown.value = t
  })

  watch(node.isEditing, async (on) => {
    if (on) {
      original = text.value
      await nextTick()
      const target = el.value
      if (!target) return
      target.focus({ preventScroll: true })
      placeCaretAtEnd(target)
    } else {
      shown.value = text.value
      if (el.value && el.value.textContent !== text.value) el.value.textContent = text.value
    }
  })

  function readText(): string {
    return (el.value?.innerText ?? '').replace(/\u00a0/g, ' ')
  }
  function onInput() {
    if (!node.isEditing.value || !node.editor || !node.nodeRef.value) return
    node.editor.updateText(node.nodeRef.value, readText())
  }
  function onKeydown(e: KeyboardEvent) {
    if (!node.isEditing.value || !node.editor || !node.nodeRef.value) return
    // Los atajos del lienzo (Supr, Ctrl+D…) no deben actuar mientras se escribe.
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      if (el.value) el.value.textContent = original
      node.editor.updateText(node.nodeRef.value, original)
      node.editor.stopEdit()
      return
    }
    const confirm = e.key === 'Enter' && (!node.nodeRef.value.multiline || e.ctrlKey || e.metaKey)
    if (confirm) {
      e.preventDefault()
      node.editor.stopEdit()
      el.value?.blur()
    }
  }
  function onBlur() {
    if (node.isEditing.value) node.editor?.stopEdit()
  }
  function onPaste(e: ClipboardEvent) {
    if (!node.isEditing.value) return
    e.preventDefault()
    const raw = e.clipboardData?.getData('text/plain') || ''
    const plain = node.nodeRef.value?.multiline ? raw : raw.replace(/\s*\n+\s*/g, ' ')
    document.execCommand('insertText', false, plain)
  }

  return { shown, onInput, onKeydown, onBlur, onPaste }
}

function placeCaretAtEnd(target: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(target)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

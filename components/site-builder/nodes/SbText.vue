<template>
  <component
    :is="tag"
    ref="el"
    v-bind="attrs"
    :contenteditable="isEditing ? 'plaintext-only' : undefined"
    :spellcheck="isEditing ? 'true' : undefined"
    @input="onInput"
    @keydown="onKeydown"
    @blur="onBlur"
    @paste="onPaste"
  >{{ shown }}</component>
</template>

<script setup lang="ts">
import type { NodeKind } from '~/utils/siteBuilder/nodes'
import { useInlineText, useSbNode } from '~/composables/useSiteEditor'

/**
 * Un texto editable del Constructor Web: el mismo `<h2>`/`<p>`/`<span>` de
 * siempre (mismo `tag`, mismas clases — pásalas como en cualquier elemento),
 * que en el lienzo se puede seleccionar y, si es estático, editar con doble
 * clic. En producción sólo lleva el atributo que engancha sus estilos.
 *
 * `text` es lo que se pinta; `field` es la clave de `content` donde vive si
 * es estático. Un texto dinámico (el nombre de una propiedad) pasa
 * `dynamic="Propiedades → Nombre"` y no tiene `field` editable: se puede
 * cambiar su presentación, nunca el dato.
 */
const props = withDefaults(
  defineProps<{
    tag?: string
    field: string
    text: string
    kind?: NodeKind
    label?: string
    dynamic?: string | null
    sourceHref?: string | null
    multiline?: boolean
  }>(),
  { tag: 'p', kind: 'text', label: undefined, dynamic: null, sourceHref: null, multiline: false },
)

const el = ref<HTMLElement | null>(null)
const node = useSbNode(() => ({
  field: props.field,
  kind: props.kind,
  label: props.label,
  dynamic: props.dynamic,
  sourceHref: props.sourceHref,
  multiline: props.multiline,
}))
const { attrs, isEditing, editor, nodeRef } = node
const { shown, onInput, onKeydown, onBlur, onPaste } = useInlineText(el, toRef(props, 'text'), { editor, nodeRef, isEditing })
</script>

<template>
  <NuxtLink v-bind="attrs" :to="to">
    <span
      ref="el"
      :contenteditable="isEditing ? 'plaintext-only' : undefined"
      :spellcheck="isEditing ? 'true' : undefined"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
      @paste="onPaste"
    >{{ shown }}</span>
    <slot />
  </NuxtLink>
</template>

<script setup lang="ts">
import type { NodeKind } from '~/utils/siteBuilder/nodes'
import { useInlineText, useSbNode } from '~/composables/useSiteEditor'

/**
 * Un enlace o botón de bloque: un `<NuxtLink>` normal (las clases se le
 * pasan como siempre) cuyo texto se edita inline y cuyo destino se cambia en
 * el inspector (`linkField` dice en qué clave de `content` está). El icono
 * que algunos botones llevan después del texto va en el slot y se conserva.
 *
 * En el lienzo el clic nunca navega: lo intercepta el marco del bloque.
 */
const props = withDefaults(
  defineProps<{
    to: string | Record<string, any>
    field: string
    text: string
    linkField?: string | null
    kind?: NodeKind
    label?: string
    dynamic?: string | null
    sourceHref?: string | null
  }>(),
  { linkField: null, kind: 'button', label: undefined, dynamic: null, sourceHref: null },
)

const el = ref<HTMLElement | null>(null)
const node = useSbNode(() => ({
  field: props.field,
  kind: props.kind,
  label: props.label,
  dynamic: props.dynamic,
  sourceHref: props.sourceHref,
  linkField: props.linkField,
}))
const { attrs, isEditing, editor, nodeRef } = node
const { shown, onInput, onKeydown, onBlur, onPaste } = useInlineText(el, toRef(props, 'text'), { editor, nodeRef, isEditing })
</script>

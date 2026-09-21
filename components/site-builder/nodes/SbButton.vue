<template>
  <button v-bind="attrs">
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
  </button>
</template>

<script setup lang="ts">
import { useInlineText, useSbNode } from '~/composables/useSiteEditor'

/**
 * Un `<button>` real de bloque (enviar formulario, reservar visita) con el
 * texto editable inline. Igual que SbLink, pero sobre un botón: `type`,
 * `disabled`, `aria-disabled`, clases y `@click` le llegan como a cualquier
 * botón. Ojo: en el lienzo el bloque no debe ponerle `disabled` (un botón
 * deshabilitado no recibe clics y no se podría seleccionar); la protección
 * ahí es la intercepción del clic más el `if (locked) return` del handler.
 */
const props = withDefaults(
  defineProps<{
    field: string
    text: string
    label?: string
    dynamic?: string | null
  }>(),
  { label: 'Botón', dynamic: null },
)

const el = ref<HTMLElement | null>(null)
const node = useSbNode(() => ({ field: props.field, kind: 'button', label: props.label, dynamic: props.dynamic }))
const { attrs, isEditing, editor, nodeRef } = node
const { shown, onInput, onKeydown, onBlur, onPaste } = useInlineText(el, toRef(props, 'text'), { editor, nodeRef, isEditing })
</script>

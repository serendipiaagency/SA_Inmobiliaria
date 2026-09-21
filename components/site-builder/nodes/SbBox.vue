<template>
  <component :is="tag" v-bind="{ ...attrs, ...tagProps }">
    <slot />
  </component>
</template>

<script setup lang="ts">
import type { NodeKind } from '~/utils/siteBuilder/nodes'
import { useSbNode } from '~/composables/useSiteEditor'

/**
 * Un contenedor seleccionable — una tarjeta, una caja. Envuelve exactamente
 * el elemento que ya existía (`tag` puede ser 'div', 'article' o un
 * componente como NuxtLink, con sus props en `tagProps`) y añade sólo el
 * gancho de selección/estilo. Un clic sobre su espacio vacío lo selecciona;
 * un clic sobre un nodo interior selecciona ese nodo (el más interno gana).
 */
const props = withDefaults(
  defineProps<{
    tag?: string | object
    tagProps?: Record<string, any>
    field: string
    kind?: NodeKind
    label?: string
    dynamic?: string | null
    sourceHref?: string | null
  }>(),
  { tag: 'div', tagProps: () => ({}), kind: 'card', label: undefined, dynamic: null, sourceHref: null },
)

const { attrs } = useSbNode(() => ({
  field: props.field,
  kind: props.kind,
  label: props.label,
  dynamic: props.dynamic,
  sourceHref: props.sourceHref,
}))
</script>

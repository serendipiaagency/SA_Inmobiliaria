<template>
  <img v-bind="attrs" :src="src" :alt="alt" >
</template>

<script setup lang="ts">
import { useSbNode } from '~/composables/useSiteEditor'

/**
 * Una imagen de bloque: el `<img>` de siempre (clases, `loading`, etc. se
 * pasan tal cual), seleccionable en el lienzo. Si es estática, `field` es
 * la clave de `content` con su referencia y el inspector (o el doble clic)
 * ofrece "Cambiar imagen"; si es dinámica (la foto de una propiedad) sólo se
 * puede ajustar su presentación.
 */
const props = withDefaults(
  defineProps<{
    src: string
    alt?: string
    field: string
    label?: string
    dynamic?: string | null
    sourceHref?: string | null
    altField?: string | null
  }>(),
  { alt: '', label: 'Imagen', dynamic: null, sourceHref: null, altField: null },
)

const { attrs } = useSbNode(() => ({
  field: props.field,
  kind: 'image',
  label: props.label,
  dynamic: props.dynamic,
  sourceHref: props.sourceHref,
  altField: props.altField,
}))
</script>

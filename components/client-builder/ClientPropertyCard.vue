<template>
  <NuxtLink :to="`/admin/${property.resource}/${property.id}`" class="group card overflow-hidden transition hover:border-ink">
    <div class="aspect-[16/10] overflow-hidden bg-stone-100">
      <img :src="mediaUrl(property.image)" :alt="property.name" class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" >
    </div>
    <div class="p-4">
      <div class="flex flex-wrap items-center gap-1">
        <span
          v-for="r in property.relations"
          :key="r"
          class="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500 ring-1 ring-line"
        >
          {{ r }}
        </span>
      </div>
      <p class="mt-2 truncate font-medium text-ink group-hover:underline">{{ property.name }}</p>
      <p class="truncate text-[12px] text-stone-500">{{ location }}</p>
      <div class="mt-2 flex items-center justify-between gap-2">
        <span class="text-[13px] font-semibold text-stone-700">{{ price }}</span>
        <span class="text-[11px] text-stone-400">Ref. #{{ property.id }}</span>
      </div>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
/**
 * Tarjeta de una propiedad relacionada con un cliente.
 *
 * **No guarda nada**: recibe la fila resuelta en vivo del catálogo y enlaza a
 * la ficha original — a Propiedades (web) o a Propiedades 2ª mano según de
 * dónde salga, que es lo que dice `resource`. Si el precio o la foto cambian
 * en el catálogo, cambian aquí, porque aquí no hay copia.
 *
 * `relations` explica **por qué** está relacionada (visita, operación,
 * reserva, interés). Son vínculos distintos y se muestran como tales.
 */
const props = defineProps<{ property: Record<string, any> }>()

const { format } = useCurrency()
const price = computed(() => (typeof props.property.price === 'number' ? format(props.property.price) : 'Sin precio'))
const location = computed(
  () => [props.property.community, props.property.city].filter(Boolean).join(' · ') || props.property.location || '—',
)
</script>

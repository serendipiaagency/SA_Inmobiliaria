<template>
  <NuxtLink v-if="zone" :to="zone.hasGuide ? zone.path : zone.catalogUrl" class="zone-link group" data-testid="ficha-zone-link">
    <span class="zone-link-media" aria-hidden="true">
      <img v-if="zone.image" :src="mediaUrl(zone.image)" :alt="''" width="160" height="107" loading="lazy" class="h-full w-full object-cover transition duration-500 group-hover:scale-105" >
    </span>
    <span class="min-w-0">
      <span class="block text-[11px] font-semibold uppercase tracking-widest2 text-stone-400">{{ t('zones.link.eyebrow', 'Guía de la zona') }}</span>
      <span class="mt-1 block font-serif text-lg font-medium leading-snug text-ink group-hover:underline group-hover:underline-offset-4">{{ t('zones.link.title', 'Descubre cómo es vivir en') }} {{ zone.name }}<template v-if="zone.parentName">, {{ zone.parentName }}</template></span>
    </span>
  </NuxtLink>
</template>

<script setup lang="ts">
/**
 * «Descubre cómo es vivir en Somió, Gijón»: en la ficha pública, el enlace a
 * la guía de zona que corresponde a la ubicación de la propiedad (su barrio
 * si tiene guía; si no, su municipio). Se pide en el cliente para no retrasar
 * la ficha; sin guía publicada no se pinta nada.
 */
const props = defineProps<{ municipality?: string | null; neighborhood?: string | null }>()
const { t } = useI18n()
const { data } = useFetch<{ zone: any }>('/api/public/zones/for-property', {
  query: { municipality: props.municipality || '', neighborhood: props.neighborhood || '' },
  lazy: true,
  server: false,
  immediate: Boolean(props.municipality || props.neighborhood),
  default: () => ({ zone: null }),
})
const zone = computed(() => data.value?.zone || null)
</script>

<style scoped>
.zone-link {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: 1rem;
  border: 1px solid #ece8e1;
  border-radius: 1rem;
  background: #fff;
}
.zone-link-media {
  display: block;
  width: 5rem;
  aspect-ratio: 3 / 2;
  flex: none;
  overflow: hidden;
  border-radius: 0.75rem;
  background: #ece8e0;
}
</style>

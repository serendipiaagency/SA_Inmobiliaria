<template>
  <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-16 lg:px-10">
    <div class="flex items-end justify-between">
      <div>
        <p class="eyebrow">{{ content.eyebrow }}</p>
        <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ content.title }}</h2>
      </div>
      <NuxtLink v-if="content.cta && content.ctaTo" :to="content.ctaTo" class="btn-quiet hidden shrink-0 md:inline-flex">{{ content.cta }}</NuxtLink>
    </div>

    <!-- layout: cards — misma tarjeta que /equipo, para que la portada y la
         página del equipo no parezcan dos sitios distintos -->
    <div v-if="layout === 'cards'" class="mt-8 grid gap-x-6 gap-y-12" :class="gridClasses">
      <NuxtLink v-for="m in items" :key="m.id" :to="`/equipo/${m.slug}`" class="group block">
        <div class="aspect-[3/4] overflow-hidden rounded-2xl bg-stone-100">
          <img :src="mediaUrl(m.image)" :alt="m.name" class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" >
        </div>
        <h3 class="mt-4 font-serif text-xl font-medium group-hover:underline group-hover:underline-offset-4">{{ m.name }}</h3>
        <p v-if="cardFields.position" class="eyebrow mt-1.5">{{ m.position }}</p>
        <p v-if="cardFields.specialties && specialtiesOf(m)" class="mt-1.5 text-[13px] text-stone-500">{{ specialtiesOf(m) }}</p>
        <div v-if="cardFields.contact" class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-stone-450">
          <span v-if="m.phone">{{ m.phone }}</span>
          <span v-if="m.email" class="truncate">{{ m.email }}</span>
        </div>
      </NuxtLink>
    </div>

    <!-- layout: compact — fila horizontal de retratos redondos, para cuando
         el equipo es una prueba de confianza y no la sección protagonista -->
    <div v-else class="mt-8 grid gap-x-6 gap-y-8" :class="gridClasses">
      <NuxtLink v-for="m in items" :key="m.id" :to="`/equipo/${m.slug}`" class="group flex items-center gap-4">
        <img :src="mediaUrl(m.image)" :alt="m.name" class="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-line transition group-hover:ring-ink" loading="lazy" >
        <div class="min-w-0">
          <h3 class="truncate font-serif text-lg font-medium group-hover:underline group-hover:underline-offset-4">{{ m.name }}</h3>
          <p v-if="cardFields.position" class="truncate text-[12px] font-semibold uppercase tracking-widest2 text-stone-450">{{ m.position }}</p>
          <p v-if="cardFields.specialties && specialtiesOf(m)" class="truncate text-[12px] text-stone-500">{{ specialtiesOf(m) }}</p>
          <p v-if="cardFields.contact && m.phone" class="truncate text-[12px] text-stone-450">{{ m.phone }}</p>
        </div>
      </NuxtLink>
    </div>

    <p v-if="!items.length" class="mt-8 text-sm text-stone-400">
      Todavía no hay comerciales publicados. Marca «Mostrar este comercial en la web» en su ficha para que aparezcan aquí.
    </p>
  </section>
</template>

<script setup lang="ts">
/**
 * Comerciales destacados.
 *
 * Igual que PropertiesBlock y CommunitiesBlock, **no guarda copias**: el
 * bloque sólo almacena criterio (fuente, número, qué campos enseñar) y
 * recibe `team` en vivo desde /api/public/home. Cambiar la foto, el puesto o
 * el teléfono de un comercial se ve en la web sin volver a publicar la
 * página.
 *
 * La lista que llega ya viene filtrada por `showOnWeb` y ordenada por
 * `sortOrder` desde el servidor, con la proyección de columnas públicas
 * (server/utils/publicTeam.ts). Aquí no se decide quién es visible.
 */
const props = defineProps<{ content: Record<string, any>; team: any[] }>()

const layout = computed(() => (props.content.layout === 'compact' ? 'compact' : 'cards'))

const items = computed(() => {
  const all = props.team || []
  const limit = Number(props.content.limit) || 4
  if (props.content.source === 'manual') {
    const ids: number[] = Array.isArray(props.content.manualIds) ? props.content.manualIds : []
    const byId = new Map(all.map((m) => [m.id, m]))
    // Se resuelven en el orden elegido en el inspector, no en el del catálogo.
    return ids.map((id) => byId.get(id)).filter(Boolean).slice(0, limit)
  }
  return all.slice(0, limit)
})

const cardFields = computed(() => ({
  position: props.content.cardFields?.position !== false,
  specialties: props.content.cardFields?.specialties === true,
  contact: props.content.cardFields?.contact === true,
}))

/**
 * `specialties` convive en dos formatos: el actual es un array JSON, y las
 * fichas anteriores al Constructor de Comerciales lo guardaron como texto
 * separado por comas. La ficha del comercial ya acepta los dos; este bloque
 * hace lo mismo en vez de enseñar `["Lujo","Obra nueva"]` en crudo.
 */
function specialtiesOf(member: any): string {
  const raw = member?.specialties
  if (!raw) return ''
  let list: string[] = []
  try {
    const parsed = JSON.parse(raw)
    list = Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    list = String(raw).split(',')
  }
  return list.map((s) => s.trim()).filter(Boolean).slice(0, 3).join(' · ')
}

// Mismo planteamiento que PropertiesBlock: Tailwind no ejecuta JS, así que
// cada combinación de columnas tiene que aparecer literalmente en el fichero.
const MOBILE_COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2' }
const TABLET_COLS: Record<number, string> = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }
const DESKTOP_COLS: Record<number, string> = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }
const defaultCols = computed(() => (layout.value === 'compact' ? { mobile: 1, tablet: 2, desktop: 3 } : { mobile: 1, tablet: 2, desktop: 4 }))
const gridClasses = computed(() => [
  MOBILE_COLS[Number(props.content.columnsMobile) || defaultCols.value.mobile] || MOBILE_COLS[defaultCols.value.mobile],
  TABLET_COLS[Number(props.content.columnsTablet) || defaultCols.value.tablet] || TABLET_COLS[defaultCols.value.tablet],
  DESKTOP_COLS[Number(props.content.columnsDesktop) || defaultCols.value.desktop] || DESKTOP_COLS[defaultCols.value.desktop],
])
</script>

<template>
  <section v-reveal class="mx-auto max-w-screen-2xl px-6 lg:px-10" :class="layout === 'editorial' ? 'py-20 lg:py-28' : 'py-16'">
    <!-- layout: editorial — «Conoce a nuestro equipo»: columna de texto con
         botón a la izquierda y retratos verticales con nombre, puesto, una
         línea de presentación y «Ver perfil», cada uno hacia su ficha. -->
    <div v-if="layout === 'editorial'" class="grid gap-12 lg:grid-cols-12 lg:gap-10" data-testid="team-editorial">
      <div class="lg:col-span-4 lg:pr-6">
        <SbText v-if="content.eyebrow" tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow" />
        <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-4 text-4xl leading-[1.08] md:text-5xl" :text="content.title || ''" />
        <SbText v-if="content.text" tag="p" field="text" label="Descripción" multiline class="mt-6 max-w-md text-[15px] leading-relaxed text-stone-500" :text="content.text" />
        <SbLink v-if="content.cta && content.ctaTo" field="cta" link-field="ctaTo" label="Botón" :to="content.ctaTo" class="btn-quiet mt-8 inline-flex" :text="content.cta" />
      </div>
      <div class="grid gap-x-6 gap-y-10 lg:col-span-8" :class="gridClasses">
        <SbBox
          v-for="m in items"
          :key="m.id"
          :tag="NuxtLink"
          :tag-props="{ to: `/equipo/${m.slug}` }"
          field="card"
          label="Tarjeta de comercial"
          :dynamic="dynamicLabel('team', 'Ficha')"
          :source-href="SOURCES.team.href"
          class="group block"
          :data-testid="`team-member-${m.slug}`"
        >
          <div class="aspect-[4/5] w-full overflow-hidden rounded-2xl bg-stone-100" data-testid="team-editorial-photo">
            <SbImage field="card.image" label="Foto del comercial" :dynamic="dynamicLabel('team', 'Foto')" :source-href="SOURCES.team.href" :src="mediaUrl(m.image)" :alt="m.name" class="h-full w-full object-cover object-[50%_20%] transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
          </div>
          <SbText tag="h3" field="card.name" kind="heading" label="Nombre" :dynamic="dynamicLabel('team', 'Nombre')" :source-href="SOURCES.team.href" class="mt-4 font-serif text-xl font-medium" :text="m.name" />
          <SbText v-if="cardFields.position && m.position" tag="p" field="card.position" kind="caption" label="Puesto" :dynamic="dynamicLabel('team', 'Puesto')" :source-href="SOURCES.team.href" class="mt-1 text-[11px] font-semibold uppercase tracking-widest2 text-stone-450" :text="m.position" />
          <SbText v-if="cardFields.description && m.description" tag="p" field="card.description" kind="caption" label="Presentación" :dynamic="dynamicLabel('team', 'Presentación')" :source-href="SOURCES.team.href" class="mt-2 line-clamp-3 text-[13px] leading-relaxed text-stone-500" :text="m.description" />
          <SbText v-if="cardFields.specialties && specialtiesOf(m)" tag="p" field="card.specialties" kind="caption" label="Especialidades" :dynamic="dynamicLabel('team', 'Especialidades')" :source-href="SOURCES.team.href" class="mt-1.5 text-[13px] text-stone-500" :text="specialtiesOf(m)" />
          <SbText v-if="cardFields.contact && contactOf(m)" tag="p" field="card.contact" kind="caption" label="Contacto" :dynamic="dynamicLabel('team', 'Teléfono y email')" :source-href="SOURCES.team.href" class="mt-2 text-[12px] text-stone-450" :text="contactOf(m)" />
          <span class="link-underline mt-3 inline-block text-[12px] font-semibold text-ink">{{ content.profileLabel || t('team.block.profile', 'Ver perfil') }} →</span>
        </SbBox>
        <!-- Miembros extra añadidos a mano (datos propios, no de Comerciales) -->
        <div v-for="(e, i) in extraMembers" :key="`extra-${i}`" data-testid="team-extra-member">
          <div class="aspect-[4/5] w-full overflow-hidden rounded-2xl bg-stone-100">
            <img v-if="e.image" :src="mediaUrl(e.image)" :alt="e.name || ''" class="h-full w-full object-cover object-[50%_20%]" loading="lazy" >
          </div>
          <p class="mt-4 font-serif text-xl font-medium">{{ e.name }}</p>
          <p v-if="e.position" class="mt-1 text-[11px] font-semibold uppercase tracking-widest2 text-stone-450">{{ e.position }}</p>
          <p v-if="e.description" class="mt-2 line-clamp-3 text-[13px] leading-relaxed text-stone-500">{{ e.description }}</p>
        </div>
      </div>
      <p v-if="!hasAnyMember" class="text-sm text-stone-400 lg:col-span-8">
        Todavía no hay comerciales publicados. Marca «Mostrar este comercial en la web» en su ficha para que aparezcan aquí.
      </p>
    </div>

    <div v-if="layout !== 'editorial'" class="flex items-end justify-between">
      <div>
        <SbText tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow || ''" />
        <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-3 text-3xl md:text-4xl" :text="content.title || ''" />
      </div>
      <SbLink v-if="content.cta && content.ctaTo" field="cta" link-field="ctaTo" label="Botón" :to="content.ctaTo" class="btn-quiet hidden shrink-0 md:inline-flex" :text="content.cta" />
    </div>

    <!-- layout: cards — tarjeta de equipo compacta: foto CUADRADA y más
         pequeña que la columna (≈ 3/4 de su ancho, con tope), recortada sin
         deformar y encuadrada arriba para no cortar caras; debajo, nombre,
         puesto y lo que se active. Antes, un retrato 3:4 a todo el ancho que
         convertía la sección en una galería de fotos. -->
    <div v-if="layout === 'cards'" class="mt-8 grid gap-x-6 gap-y-10" :class="gridClasses" data-testid="team-cards">
      <SbBox
        v-for="m in items"
        :key="m.id"
        :tag="NuxtLink"
        :tag-props="{ to: `/equipo/${m.slug}` }"
        field="card"
        label="Tarjeta de comercial"
        :dynamic="dynamicLabel('team', 'Ficha')"
        :source-href="SOURCES.team.href"
        class="group block"
      >
        <div class="aspect-square w-3/4 max-w-[16rem] overflow-hidden rounded-2xl bg-stone-100" data-testid="team-card-photo">
          <SbImage field="card.image" label="Foto del comercial" :dynamic="dynamicLabel('team', 'Foto')" :source-href="SOURCES.team.href" :src="mediaUrl(m.image)" :alt="m.name" class="h-full w-full object-cover object-[50%_20%] transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
        </div>
        <SbText tag="h3" field="card.name" kind="heading" label="Nombre" :dynamic="dynamicLabel('team', 'Nombre')" :source-href="SOURCES.team.href" class="mt-4 font-serif text-xl font-medium group-hover:underline group-hover:underline-offset-4" :text="m.name" />
        <SbText v-if="cardFields.position" tag="p" field="card.position" kind="eyebrow" label="Puesto" :dynamic="dynamicLabel('team', 'Puesto')" :source-href="SOURCES.team.href" class="eyebrow mt-1.5" :text="m.position || ''" />
        <SbText v-if="cardFields.specialties && specialtiesOf(m)" tag="p" field="card.specialties" kind="caption" label="Especialidades" :dynamic="dynamicLabel('team', 'Especialidades')" :source-href="SOURCES.team.href" class="mt-1.5 text-[13px] text-stone-500" :text="specialtiesOf(m)" />
        <SbText v-if="cardFields.contact && contactOf(m)" tag="p" field="card.contact" kind="caption" label="Contacto" :dynamic="dynamicLabel('team', 'Teléfono y email')" :source-href="SOURCES.team.href" class="mt-2 text-[12px] text-stone-450" :text="contactOf(m)" />
      </SbBox>
      <!-- Miembros extra añadidos a mano -->
      <div v-for="(e, i) in extraMembers" :key="`extra-${i}`" data-testid="team-extra-member">
        <div class="aspect-square w-3/4 max-w-[16rem] overflow-hidden rounded-2xl bg-stone-100">
          <img v-if="e.image" :src="mediaUrl(e.image)" :alt="e.name || ''" class="h-full w-full object-cover object-[50%_20%]" loading="lazy" >
        </div>
        <p class="mt-4 font-serif text-xl font-medium">{{ e.name }}</p>
        <p v-if="e.position" class="eyebrow mt-1.5">{{ e.position }}</p>
      </div>
    </div>

    <!-- layout: compact — fila horizontal de retratos redondos, para cuando
         el equipo es una prueba de confianza y no la sección protagonista -->
    <div v-else-if="layout === 'compact'" class="mt-8 grid gap-x-6 gap-y-8" :class="gridClasses">
      <SbBox
        v-for="m in items"
        :key="m.id"
        :tag="NuxtLink"
        :tag-props="{ to: `/equipo/${m.slug}` }"
        field="card"
        label="Tarjeta de comercial"
        :dynamic="dynamicLabel('team', 'Ficha')"
        :source-href="SOURCES.team.href"
        class="group flex items-center gap-4"
      >
        <SbImage field="card.image" label="Foto del comercial" :dynamic="dynamicLabel('team', 'Foto')" :source-href="SOURCES.team.href" :src="mediaUrl(m.image)" :alt="m.name" class="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-line transition group-hover:ring-ink" loading="lazy" />
        <div class="min-w-0">
          <SbText tag="h3" field="card.name" kind="heading" label="Nombre" :dynamic="dynamicLabel('team', 'Nombre')" :source-href="SOURCES.team.href" class="truncate font-serif text-lg font-medium group-hover:underline group-hover:underline-offset-4" :text="m.name" />
          <SbText v-if="cardFields.position" tag="p" field="card.position" kind="caption" label="Puesto" :dynamic="dynamicLabel('team', 'Puesto')" :source-href="SOURCES.team.href" class="truncate text-[12px] font-semibold uppercase tracking-widest2 text-stone-450" :text="m.position || ''" />
          <SbText v-if="cardFields.specialties && specialtiesOf(m)" tag="p" field="card.specialties" kind="caption" label="Especialidades" :dynamic="dynamicLabel('team', 'Especialidades')" :source-href="SOURCES.team.href" class="truncate text-[12px] text-stone-500" :text="specialtiesOf(m)" />
          <SbText v-if="cardFields.contact && m.phone" tag="p" field="card.contact" kind="caption" label="Contacto" :dynamic="dynamicLabel('team', 'Teléfono')" :source-href="SOURCES.team.href" class="truncate text-[12px] text-stone-450" :text="m.phone" />
        </div>
      </SbBox>
      <!-- Miembros extra añadidos a mano -->
      <div v-for="(e, i) in extraMembers" :key="`extra-${i}`" class="flex items-center gap-4" data-testid="team-extra-member">
        <img v-if="e.image" :src="mediaUrl(e.image)" :alt="e.name || ''" class="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-line" loading="lazy" >
        <div class="min-w-0">
          <p class="truncate font-serif text-lg font-medium">{{ e.name }}</p>
          <p v-if="e.position" class="truncate text-[12px] font-semibold uppercase tracking-widest2 text-stone-450">{{ e.position }}</p>
        </div>
      </div>
    </div>

    <p v-if="layout !== 'editorial' && !hasAnyMember" class="mt-8 text-sm text-stone-400">
      Todavía no hay comerciales publicados. Marca «Mostrar este comercial en la web» en su ficha para que aparezcan aquí.
    </p>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbLink from '../nodes/SbLink.vue'
import SbImage from '../nodes/SbImage.vue'
import SbBox from '../nodes/SbBox.vue'
import { SOURCES, dynamicLabel } from '~/utils/siteBuilder/sources'

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
const NuxtLink = resolveComponent('NuxtLink')
const props = defineProps<{ content: Record<string, any>; team: any[] }>()
const { t } = useI18n()

// Tres diseños: «cards» (de partida), «compact» y «editorial» (docs/home-corporativa.md).
const layout = computed(() => (props.content.layout === 'compact' ? 'compact' : props.content.layout === 'editorial' ? 'editorial' : 'cards'))

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

// «Mixto» (Cola 32): además de los comerciales en vivo, miembros extra añadidos
// a mano en el inspector (nombre/puesto/foto/presentación propios). No son
// datos de Property Core —son texto escrito en el bloque— así que se pintan con
// elementos planos (no nodos dinámicos) y se muestran después de los en vivo.
const extraMembers = computed<any[]>(() => (Array.isArray(props.content.members) ? props.content.members : []).filter((m: any) => m && (m.name || m.image)))
const hasAnyMember = computed(() => items.value.length > 0 || extraMembers.value.length > 0)

const cardFields = computed(() => ({
  position: props.content.cardFields?.position !== false,
  specialties: props.content.cardFields?.specialties === true,
  contact: props.content.cardFields?.contact === true,
  // La presentación sólo tiene sitio en el diseño editorial, donde sale salvo que se apague.
  description: layout.value === 'editorial' && props.content.cardFields?.description !== false,
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

function contactOf(member: any): string {
  return [member?.phone, member?.email].filter(Boolean).join(' · ')
}

// Mismo planteamiento que PropertiesBlock: Tailwind no ejecuta JS, así que
// cada combinación de columnas tiene que aparecer literalmente en el fichero.
const MOBILE_COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2' }
const TABLET_COLS: Record<number, string> = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }
const DESKTOP_COLS: Record<number, string> = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }
const defaultCols = computed(() => (layout.value === 'compact' ? { mobile: 1, tablet: 2, desktop: 3 } : layout.value === 'editorial' ? { mobile: 2, tablet: 2, desktop: 4 } : { mobile: 1, tablet: 2, desktop: 4 }))
const gridClasses = computed(() => [
  MOBILE_COLS[Number(props.content.columnsMobile) || defaultCols.value.mobile] || MOBILE_COLS[defaultCols.value.mobile],
  TABLET_COLS[Number(props.content.columnsTablet) || defaultCols.value.tablet] || TABLET_COLS[defaultCols.value.tablet],
  DESKTOP_COLS[Number(props.content.columnsDesktop) || defaultCols.value.desktop] || DESKTOP_COLS[defaultCols.value.desktop],
])
</script>

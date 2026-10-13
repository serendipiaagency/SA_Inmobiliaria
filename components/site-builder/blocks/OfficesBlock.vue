<template>
  <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-20 lg:px-10 lg:py-28" data-testid="offices">
    <div class="grid gap-12 lg:grid-cols-12 lg:gap-10">
      <div class="lg:col-span-4 lg:pr-6">
        <SbText v-if="content.eyebrow" tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow" />
        <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-4 text-4xl leading-[1.08] md:text-5xl" :text="content.title || ''" />
        <SbText v-if="content.text" tag="p" field="text" label="Descripción" multiline class="mt-6 max-w-md text-[15px] leading-relaxed text-stone-500" :text="content.text" />
        <SbLink v-if="content.cta && content.ctaTo" field="cta" link-field="ctaTo" label="Botón" :to="content.ctaTo" class="btn-primary mt-8 inline-flex" :text="content.cta" />
      </div>

      <!-- Una oficina (o diseño editorial): foto, ficha y mapa en una composición única. -->
      <div v-if="layout === 'editorial' && featured" class="grid gap-6 lg:col-span-8 lg:grid-cols-3" data-testid="offices-editorial">
        <div class="aspect-[4/3] overflow-hidden rounded-2xl bg-stone-100 lg:aspect-auto lg:min-h-[320px]">
          <SbImage field="card.photo" label="Foto de la oficina" :dynamic="dynamicLabel('office', 'Foto')" :source-href="SOURCES.office.href" :src="mediaUrl(featured.photo)" :alt="featured.name" class="h-full w-full object-cover" loading="lazy" />
        </div>
        <SbBox field="card" label="Ficha de la oficina" :dynamic="dynamicLabel('office', 'Ficha')" :source-href="SOURCES.office.href" class="flex flex-col rounded-2xl border border-line bg-white p-6" :data-testid="`office-card-${featured.id}`">
          <div class="flex flex-wrap items-center gap-2">
            <SbText tag="h3" field="card.name" kind="heading" label="Nombre" :dynamic="dynamicLabel('office', 'Nombre')" :source-href="SOURCES.office.href" class="font-serif text-xl font-medium" :text="officeTitle(featured)" />
            <span v-if="featured.isMain" class="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest2 text-accent-700" data-testid="office-main-badge">{{ t('offices.block.main', 'Oficina principal') }}</span>
          </div>
          <SbText v-if="cardFields.description && featured.description" tag="p" field="card.description" kind="caption" label="Presentación" :dynamic="dynamicLabel('office', 'Presentación')" :source-href="SOURCES.office.href" class="mt-3 text-[14px] leading-relaxed text-stone-500" :text="featured.description" />
          <dl class="mt-4 space-y-2.5 text-[14px] text-stone-600">
            <div v-if="addressOf(featured)" class="flex gap-3"><dt class="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-widest2 text-stone-400">{{ t('offices.block.address', 'Dirección') }}</dt><dd class="whitespace-pre-line">{{ addressOf(featured) }}</dd></div>
            <div v-if="cardFields.phone && featured.phone" class="flex gap-3"><dt class="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-widest2 text-stone-400">{{ t('offices.block.phone', 'Teléfono') }}</dt><dd><a :href="telHref(featured.phone) || undefined" class="hover:underline">{{ featured.phone }}</a></dd></div>
            <div v-if="cardFields.email && featured.email" class="flex gap-3"><dt class="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-widest2 text-stone-400">{{ t('offices.block.email', 'Email') }}</dt><dd><a :href="`mailto:${featured.email}`" class="break-all hover:underline">{{ featured.email }}</a></dd></div>
            <div v-if="cardFields.hours && featured.openingHours" class="flex gap-3"><dt class="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-widest2 text-stone-400">{{ t('offices.block.hours', 'Horario') }}</dt><dd class="whitespace-pre-line">{{ featured.openingHours }}</dd></div>
          </dl>
          <a v-if="cardFields.directions && featured.mapsUrl" :href="featured.mapsUrl" target="_blank" rel="noopener" class="btn-quiet mt-auto self-start pt-5" data-testid="office-directions">{{ t('offices.block.directions', 'Cómo llegar') }} →</a>
        </SbBox>
        <div v-if="cardFields.map && hasCoords(featured)" class="min-h-[280px] overflow-hidden rounded-2xl bg-stone-100" data-testid="office-map">
          <ClientOnly>
            <OfficesMap :offices="[featured]" :mode="mode" />
          </ClientOnly>
        </div>
        <ul v-if="others.length" class="lg:col-span-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="offices-others">
          <li v-for="o in others" :key="o.id" class="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-[14px]">
            <span class="min-w-0 truncate"><span class="font-medium text-ink">{{ officeTitle(o) }}</span><span v-if="o.city && !officeTitle(o).includes(o.city)" class="text-stone-450"> · {{ o.city }}</span></span>
            <a v-if="o.phone" :href="telHref(o.phone) || undefined" class="shrink-0 text-stone-500 hover:underline">{{ o.phone }}</a>
          </li>
        </ul>
      </div>

      <!-- Varias oficinas: cuadrícula adaptable, una tarjeta por oficina. -->
      <div v-else-if="items.length" class="grid gap-6 sm:grid-cols-2 lg:col-span-8" :class="items.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'" data-testid="offices-grid">
        <SbBox v-for="o in items" :key="o.id" field="card" label="Tarjeta de oficina" :dynamic="dynamicLabel('office', 'Ficha')" :source-href="SOURCES.office.href" class="flex flex-col" :data-testid="`office-card-${o.id}`">
          <div class="aspect-[4/3] overflow-hidden rounded-2xl bg-stone-100">
            <SbImage field="card.photo" label="Foto de la oficina" :dynamic="dynamicLabel('office', 'Foto')" :source-href="SOURCES.office.href" :src="mediaUrl(o.photo)" :alt="o.name" class="h-full w-full object-cover transition duration-500 hover:scale-[1.03]" loading="lazy" />
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-2">
            <SbText tag="h3" field="card.name" kind="heading" label="Nombre" :dynamic="dynamicLabel('office', 'Nombre')" :source-href="SOURCES.office.href" class="font-serif text-xl font-medium" :text="officeTitle(o)" />
            <span v-if="o.isMain" class="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest2 text-accent-700" data-testid="office-main-badge">{{ t('offices.block.main', 'Oficina principal') }}</span>
          </div>
          <SbText v-if="cardFields.description && o.description" tag="p" field="card.description" kind="caption" label="Presentación" :dynamic="dynamicLabel('office', 'Presentación')" :source-href="SOURCES.office.href" class="mt-2 text-[14px] leading-relaxed text-stone-500" :text="o.description" />
          <p v-if="addressOf(o)" class="mt-3 whitespace-pre-line text-[14px] text-stone-600">{{ addressOf(o) }}</p>
          <p v-if="cardFields.hours && o.openingHours" class="mt-2 text-[13px] text-stone-500"><span class="text-[11px] font-semibold uppercase tracking-widest2 text-stone-400">{{ t('offices.block.hours', 'Horario') }}</span><br>{{ o.openingHours }}</p>
          <p v-if="(cardFields.phone && o.phone) || (cardFields.email && o.email)" class="mt-2 text-[13px] text-stone-500">
            <a v-if="cardFields.phone && o.phone" :href="telHref(o.phone) || undefined" class="hover:underline">{{ o.phone }}</a>
            <template v-if="cardFields.phone && o.phone && cardFields.email && o.email"> · </template>
            <a v-if="cardFields.email && o.email" :href="`mailto:${o.email}`" class="break-all hover:underline">{{ o.email }}</a>
          </p>
          <a v-if="cardFields.directions && o.mapsUrl" :href="o.mapsUrl" target="_blank" rel="noopener" class="link-underline mt-4 self-start text-[13px] font-semibold" data-testid="office-directions">{{ t('offices.block.directions', 'Cómo llegar') }} →</a>
        </SbBox>
      </div>

      <p v-else class="text-sm text-stone-400 lg:col-span-8">{{ t('offices.block.empty', 'Todavía no hay oficinas publicadas. Añádelas en CRM → Oficinas y marca «Mostrar en la web».') }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbLink from '../nodes/SbLink.vue'
import SbImage from '../nodes/SbImage.vue'
import SbBox from '../nodes/SbBox.vue'
import { SOURCES, dynamicLabel } from '~/utils/siteBuilder/sources'
import { telHref } from '~/utils/siteFooter'

/**
 * «Nuestras oficinas» (docs/home-corporativa.md). Como el bloque de
 * comerciales, no guarda copias: el bloque guarda criterio (todas o una
 * selección, cuántas, qué campos) y recibe en vivo las oficinas publicadas
 * (proyección pública, server/utils/publicOffices.ts). Con una sola oficina
 * —o si se elige el diseño editorial— foto, ficha y mapa en una composición;
 * con varias, una cuadrícula adaptable. Lo que una oficina no tiene (horario,
 * coordenadas, foto) sencillamente no se pinta.
 */
const props = withDefaults(defineProps<{ content: Record<string, any>; offices: any[]; mode?: 'production' | 'builder' | 'preview' }>(), { mode: 'production' })
const { t } = useI18n()

const items = computed(() => {
  const all = props.offices || []
  const limit = Math.min(12, Math.max(1, Number(props.content.limit) || 6))
  if (props.content.source === 'manual') {
    const ids: number[] = Array.isArray(props.content.manualIds) ? props.content.manualIds : []
    const byId = new Map(all.map((o) => [o.id, o]))
    return ids.map((id) => byId.get(id)).filter(Boolean).slice(0, limit)
  }
  return all.slice(0, limit)
})

const layout = computed<'editorial' | 'grid'>(() => {
  const chosen = props.content.layout
  if (chosen === 'editorial' || chosen === 'grid') return chosen
  return items.value.length <= 1 ? 'editorial' : 'grid'
})
/** En el diseño editorial: la principal, y si no la primera. */
const featured = computed(() => items.value.find((o) => Number(o.isMain) === 1) || items.value[0] || null)
const others = computed(() => (featured.value ? items.value.filter((o) => o.id !== featured.value.id) : []))

const cardFields = computed(() => ({
  description: props.content.cardFields?.description !== false,
  hours: props.content.cardFields?.hours !== false,
  phone: props.content.cardFields?.phone !== false,
  email: props.content.cardFields?.email === true,
  map: props.content.cardFields?.map !== false,
  directions: props.content.cardFields?.directions !== false,
}))

const officeTitle = (o: any) => String(o?.name || '')
const hasCoords = (o: any) => typeof o?.lat === 'number' && typeof o?.lng === 'number' && Number.isFinite(o.lat) && Number.isFinite(o.lng)
function addressOf(o: any): string {
  const line1 = String(o?.address || '').trim()
  const line2 = [o?.postalCode, o?.city].filter(Boolean).join(' ')
  const line3 = o?.province && o.province !== o.city ? String(o.province) : ''
  return [line1, [line2, line3].filter(Boolean).join(', ')].filter(Boolean).join('\n')
}
</script>

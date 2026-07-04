<template>
  <div>
    <!-- 1 · Hero -->
    <HeroSearch />

    <!-- 2 · Mapa interactivo (teaser) -->
    <section v-reveal class="border-y border-line bg-white">
      <div class="mx-auto grid max-w-screen-2xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center lg:px-10">
        <div>
          <p class="eyebrow">{{ t('home.map.eyebrow') }}</p>
          <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ t('home.map.title') }}</h2>
          <p class="mt-4 max-w-md text-[15px] leading-relaxed text-stone-500">
            {{ t('home.map.text') }}
          </p>
          <NuxtLink to="/properties" class="btn-primary mt-8">{{ t('home.map.cta') }}</NuxtLink>
        </div>
        <NuxtLink to="/properties" class="group relative block h-72 overflow-hidden rounded-2xl border border-line md:h-96">
          <div class="absolute inset-0 bg-gradient-to-br from-stone-200 to-stone-300" />
          <div class="absolute inset-0" style="background-image:radial-gradient(circle,rgba(0,0,0,0.06) 1px,transparent 1px);background-size:28px 28px" />
          <span
            v-for="(pin, i) in pins"
            :key="i"
            class="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center transition-transform duration-300 group-hover:-translate-y-[110%]"
            :style="{ left: pin.x + '%', top: pin.y + '%' }"
          >
            <span class="whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-ink shadow">{{ pin.label }}</span>
            <span class="mt-1 h-3 w-3 rounded-full bg-ink ring-4 ring-white" />
          </span>
        </NuxtLink>
      </div>
    </section>

    <!-- 3 · Destacados -->
    <SectionRow :eyebrow="t('home.featured.eyebrow')" :title="t('home.featured.title')" :items="destacados" to="/properties" :cta="t('home.featured.cta')" />

    <!-- 4 · Últimas incorporaciones -->
    <div class="border-t border-line">
      <SectionRow :eyebrow="t('home.latest.eyebrow')" :title="t('home.latest.title')" :items="latest" to="/properties?sort=newest" />
    </div>

    <!-- 5 · Propiedades Premium -->
    <section v-reveal class="bg-ink py-16 text-white">
      <div class="mx-auto max-w-screen-2xl px-6 lg:px-10">
        <div class="mb-8 flex items-end justify-between">
          <div>
            <p class="eyebrow !text-white/50">{{ t('home.premium.eyebrow') }}</p>
            <h2 class="mt-3 font-serif text-3xl font-medium md:text-4xl">{{ t('home.premium.title') }}</h2>
          </div>
          <NuxtLink to="/properties?sort=price_desc" class="hidden shrink-0 border border-white/40 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest2 transition hover:bg-white hover:text-ink md:inline-flex">{{ t('home.premium.cta') }}</NuxtLink>
        </div>
        <div class="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink v-for="p in premium" :key="p.id" :to="`/property-details/${p.slug || p.id}`" class="group block">
            <div class="aspect-[4/3] overflow-hidden rounded-2xl bg-black/30">
              <img :src="mediaUrl(p.coverImage)" :alt="p.name" class="h-full w-full object-cover opacity-90 transition duration-700 group-hover:scale-105 group-hover:opacity-100" loading="lazy" />
            </div>
            <p class="mt-4 text-lg font-semibold">{{ formatPrice(p.price) }}</p>
            <h3 class="font-serif text-xl font-medium">{{ p.name }}</h3>
            <p class="text-[13px] text-white/60">{{ p.community }}</p>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- 6 · Barrios destacados -->
    <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-16 lg:px-10">
      <p class="eyebrow">{{ t('home.neighborhoods.eyebrow') }}</p>
      <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ t('home.neighborhoods.title') }}</h2>
      <div class="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink v-for="c in (data?.communities || []).slice(0, 6)" :key="c.id" :to="`/community/${c.id}`" class="group relative block aspect-[3/2] overflow-hidden rounded-2xl bg-stone-100">
          <img :src="mediaUrl(c.image)" :alt="c.name" class="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" />
          <div class="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-black/10 to-transparent p-6">
            <div>
              <h3 class="font-serif text-2xl font-medium text-white">{{ c.name }}</h3>
              <p v-if="c.location" class="mt-1 text-[11px] font-semibold uppercase tracking-widest2 text-white/70">{{ c.location }}</p>
            </div>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- 7 · Comunidades Autónomas -->
    <section v-reveal class="border-y border-line bg-white py-16">
      <div class="mx-auto max-w-screen-2xl px-6 lg:px-10">
        <p class="eyebrow">{{ t('home.regions.eyebrow') }}</p>
        <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ t('home.regions.title') }}</h2>
        <div class="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <NuxtLink v-for="r in regions" :key="r" :to="{ path: '/properties', query: { q: r } }" class="flex items-center justify-between rounded-xl border border-line px-5 py-4 text-sm transition hover:border-ink hover:bg-paper">
            <span class="font-medium">{{ r }}</span>
            <span class="text-stone-400 transition group-hover:text-ink">→</span>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- 8 · Calculadora Hipoteca -->
    <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-16 lg:px-10">
      <p class="eyebrow">{{ t('home.mortgage.eyebrow') }}</p>
      <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ t('home.mortgage.title') }}</h2>
      <p class="mt-4 max-w-md text-[15px] text-stone-500">{{ t('home.mortgage.text') }}</p>
      <div class="mt-8"><MortgageCalculator :price="medianPrice" :rental-yield="6.5" /></div>
    </section>

    <!-- 9 · IA recomienda -->
    <section v-reveal class="border-t border-line bg-paper py-16">
      <div class="mx-auto max-w-screen-2xl px-6 lg:px-10">
        <div class="flex items-center gap-2">
          <span class="rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest2 text-white">{{ t('badge.ai') }}</span>
          <p class="eyebrow !text-stone-450">{{ t('home.ai.eyebrow') }}</p>
        </div>
        <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ t('home.ai.title') }}</h2>
        <div class="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          <ProjectCard v-for="p in recommended" :key="p.id" :project="p" />
        </div>
      </div>
    </section>

    <!-- 10 · Blog -->
    <section v-if="data?.blogs?.length" v-reveal class="mx-auto max-w-screen-2xl px-6 py-16 lg:px-10">
      <div class="mb-8 flex items-end justify-between">
        <div><p class="eyebrow">{{ t('home.blog.eyebrow') }}</p><h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ t('home.blog.title') }}</h2></div>
        <NuxtLink to="/blog" class="btn-quiet hidden md:inline-flex">{{ t('home.blog.cta') }}</NuxtLink>
      </div>
      <div class="grid gap-x-6 gap-y-10 md:grid-cols-3">
        <NuxtLink v-for="b in data.blogs" :key="b.id" :to="`/blog/${b.slug}`" class="group block">
          <div class="aspect-[3/2] overflow-hidden rounded-2xl bg-stone-100"><img :src="mediaUrl(b.image)" :alt="b.title" class="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" /></div>
          <p class="eyebrow mt-5">{{ b.targetAudience }}</p>
          <h3 class="mt-2 font-serif text-xl font-medium leading-snug group-hover:underline group-hover:underline-offset-4">{{ b.title || b.slug }}</h3>
        </NuxtLink>
      </div>
    </section>

    <!-- 11 · Testimonios -->
    <section v-reveal class="border-t border-line bg-white py-16">
      <div class="mx-auto max-w-screen-2xl px-6 lg:px-10">
        <p class="eyebrow">{{ t('home.testimonials.eyebrow') }}</p>
        <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ t('home.testimonials.title') }}</h2>
        <div class="mt-8 grid gap-6 md:grid-cols-3">
          <figure v-for="t in testimonials" :key="t.name" class="rounded-2xl border border-line p-8">
            <div class="mb-4 text-amber-500">★★★★★</div>
            <blockquote class="font-serif text-lg leading-relaxed text-ink">“{{ t.quote }}”</blockquote>
            <figcaption class="mt-5 text-sm"><span class="font-semibold">{{ t.name }}</span><span class="text-stone-400"> · {{ t.role }}</span></figcaption>
          </figure>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
const { format: formatPrice } = useCurrency()
const { data } = await useFetch('/api/public/home')

const projects = computed<any[]>(() => data.value?.projects || [])
const destacados = computed(() => {
  const ex = projects.value.filter((p) => p.isExclusive)
  return (ex.length ? ex : projects.value).slice(0, 4)
})
const latest = computed(() => [...projects.value].slice(0, 4))
const premium = computed(() => [...projects.value].sort((a, b) => (b.price || 0) - (a.price || 0)).slice(0, 3))
const recommended = computed(() =>
  [...projects.value].sort((a, b) => (b.rentalYield || 0) - (a.rentalYield || 0)).slice(0, 4),
)
const medianPrice = computed(() => {
  const ps = projects.value.map((p) => p.price || 0).filter(Boolean).sort((a, b) => a - b)
  return ps.length ? ps[Math.floor(ps.length / 2)] : 1200000
})

const pins = [
  { label: 'Marina', x: 28, y: 42 },
  { label: 'Downtown', x: 58, y: 30 },
  { label: 'Palm', x: 44, y: 66 },
  { label: 'Creek', x: 72, y: 58 },
]
const regions = ['Madrid', 'Cataluña', 'Andalucía', 'C. Valenciana', 'País Vasco', 'Baleares', 'Canarias', 'Galicia']
const testimonials = [
  { quote: 'Encontramos nuestra casa en una semana. El proceso fue impecable y muy transparente.', name: 'Laura M.', role: 'Compradora' },
  { quote: 'La calculadora de hipoteca y los datos de rentabilidad me ayudaron a decidir con confianza.', name: 'Javier R.', role: 'Inversor' },
  { quote: 'Atención de primer nivel y una selección de propiedades espectacular.', name: 'Sofía D.', role: 'Compradora' },
]

useHead({ title: 'SA Inmobiliaria — Propiedades excepcionales' })
</script>

<template>
  <div v-if="data" class="bg-paper">
    <!-- Photo mosaic (Compass-style) -->
    <section class="mx-auto max-w-screen-2xl px-6 pt-6 lg:px-10">
      <div class="grid gap-2 lg:grid-cols-5" :class="photos.length > 1 ? '' : 'lg:grid-cols-1'">
        <button
          class="relative col-span-3 block aspect-[4/3] w-full overflow-hidden bg-stone-100 lg:aspect-auto lg:h-[560px]"
          @click="openLightbox(0)"
        >
          <img :src="photos[0]" :alt="data.project.name" class="h-full w-full object-cover" />
        </button>
        <div v-if="photos.length > 1" class="col-span-2 hidden grid-cols-2 grid-rows-2 gap-2 lg:grid">
          <button
            v-for="(p, i) in photos.slice(1, 5)"
            :key="i"
            class="relative block h-[276px] overflow-hidden bg-stone-100"
            @click="openLightbox(i + 1)"
          >
            <img :src="p" :alt="`${data.project.name} photo ${i + 2}`" class="h-full w-full object-cover" loading="lazy" />
            <span
              v-if="i === 3 && photos.length > 5"
              class="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold uppercase tracking-widest2 text-white"
            >
              View all {{ photos.length }} photos
            </span>
          </button>
        </div>
      </div>
    </section>

    <!-- Lightbox -->
    <div
      v-if="lightbox !== null"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-6"
      @click.self="lightbox = null"
    >
      <button class="absolute right-6 top-6 text-3xl leading-none text-white/70 hover:text-white" @click="lightbox = null">
        ×
      </button>
      <button class="absolute left-4 p-4 text-4xl text-white/60 hover:text-white" @click.stop="step(-1)">‹</button>
      <img :src="photos[lightbox]" class="max-h-[85vh] max-w-[85vw] object-contain" />
      <button class="absolute right-4 p-4 text-4xl text-white/60 hover:text-white" @click.stop="step(1)">›</button>
      <p class="absolute bottom-6 text-xs uppercase tracking-widest2 text-white/60">
        {{ lightbox + 1 }} / {{ photos.length }}
      </p>
    </div>

    <!-- Body -->
    <div class="mx-auto max-w-screen-2xl px-6 py-12 lg:px-10">
      <div class="grid gap-14 lg:grid-cols-3">
        <!-- Main column -->
        <div class="space-y-14 lg:col-span-2">
          <!-- Title block -->
          <header>
            <div class="flex flex-wrap items-center gap-3">
              <span class="border border-line bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest2 text-stone-600">
                {{ statusLabel }}
              </span>
              <span v-if="data.project.handoverDate" class="text-[11px] font-medium uppercase tracking-widest text-stone-450">
                Handover {{ data.project.handoverDate }}
              </span>
            </div>
            <h1 class="heading-serif mt-5 text-4xl leading-tight md:text-5xl">{{ data.project.name }}</h1>
            <p class="mt-3 text-[15px] text-stone-500">
              <span v-if="data.project.community">{{ data.project.community }}</span>
              <span v-if="data.project.community && data.developer" class="mx-2 text-stone-300">|</span>
              <span v-if="data.developer">Developed by {{ data.developer.name }}</span>
            </p>
            <div class="hairline mt-8 flex flex-wrap gap-x-12 gap-y-4 pt-8">
              <div v-for="stat in stats" :key="stat.label">
                <p class="text-xl font-semibold tracking-tight">{{ stat.value }}</p>
                <p class="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-stone-450">{{ stat.label }}</p>
              </div>
            </div>
          </header>

          <!-- About -->
          <section v-if="data.project.description">
            <p class="eyebrow">About</p>
            <h2 class="heading-serif mt-3 text-3xl">About this project</h2>
            <p class="mt-6 max-w-3xl whitespace-pre-line text-[15px] leading-[1.9] text-stone-600">{{ data.project.description }}</p>
          </section>

          <!-- Highlights -->
          <section v-if="highlights.length">
            <p class="eyebrow">Highlights</p>
            <h2 class="heading-serif mt-3 text-3xl">Key highlights</h2>
            <ul class="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2">
              <li v-for="(h, i) in highlights" :key="i" class="flex items-start gap-3 text-[15px] leading-relaxed text-stone-600">
                <span class="mt-2.5 h-px w-5 shrink-0 bg-ink" />
                {{ h }}
              </li>
            </ul>
          </section>

          <!-- Units -->
          <section v-if="data.unitTypes.length">
            <p class="eyebrow">Residences</p>
            <h2 class="heading-serif mt-3 text-3xl">Available residences</h2>
            <div class="mt-6 border border-line bg-white">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="border-b border-line text-[11px] uppercase tracking-widest text-stone-450">
                    <th class="px-6 py-4 font-semibold">Type</th>
                    <th class="px-6 py-4 font-semibold">Unit</th>
                    <th class="px-6 py-4 font-semibold">Size</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="u in data.unitTypes" :key="u.id" class="border-b border-line/60 last:border-0">
                    <td class="px-6 py-4 font-medium">{{ u.propertyType }}</td>
                    <td class="px-6 py-4 text-stone-600">{{ u.unitType }}</td>
                    <td class="px-6 py-4 text-stone-600">{{ u.size }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Amenities -->
          <section v-if="data.amenities.length">
            <p class="eyebrow">Amenities</p>
            <h2 class="heading-serif mt-3 text-3xl">Building amenities</h2>
            <ul class="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <li v-for="a in data.amenities" :key="a.id" class="flex items-center gap-3 text-[15px] text-stone-600">
                <span class="h-1 w-1 shrink-0 rounded-full bg-ink" />
                {{ a.name }}
              </li>
            </ul>
          </section>

          <!-- Floor plans -->
          <section v-if="data.floorPlans.length">
            <p class="eyebrow">Layouts</p>
            <h2 class="heading-serif mt-3 text-3xl">Floor plans</h2>
            <p v-if="data.project.floorPlanDescription" class="mt-4 max-w-3xl text-[15px] leading-relaxed text-stone-600">
              {{ data.project.floorPlanDescription }}
            </p>
            <div class="mt-6 grid gap-6 md:grid-cols-2">
              <div v-for="fp in data.floorPlans" :key="fp.id" class="border border-line bg-white">
                <div v-if="fp.image" class="aspect-[3/2] overflow-hidden bg-stone-100">
                  <img :src="mediaUrl(fp.image)" class="h-full w-full object-cover" loading="lazy" />
                </div>
                <div class="px-6 py-5">
                  <p class="font-serif text-lg font-medium">{{ fp.category || fp.type }}</p>
                  <p class="mt-1 text-[13px] text-stone-500">
                    {{ [fp.unitType, fp.floorDetails, fp.sizes].filter(Boolean).join(' · ') }}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <!-- Master plan -->
          <section v-if="data.project.masterPlanImage">
            <p class="eyebrow">Master plan</p>
            <h2 class="heading-serif mt-3 text-3xl">The master plan</h2>
            <p v-if="data.project.masterPlanDescription" class="mt-4 max-w-3xl text-[15px] leading-relaxed text-stone-600">
              {{ data.project.masterPlanDescription }}
            </p>
            <img :src="mediaUrl(data.project.masterPlanImage)" class="mt-6 w-full border border-line" loading="lazy" />
          </section>

          <!-- Location -->
          <section v-if="data.project.locationMap || data.locations.length">
            <p class="eyebrow">Location</p>
            <h2 class="heading-serif mt-3 text-3xl">Where you'll be</h2>
            <p v-if="data.project.locationMapDescription" class="mt-4 max-w-3xl text-[15px] leading-relaxed text-stone-600">
              {{ data.project.locationMapDescription }}
            </p>
            <img
              v-if="data.project.locationMap"
              :src="mediaUrl(data.project.locationMap)"
              class="mt-6 w-full border border-line"
              loading="lazy"
            />
            <ul v-if="data.locations.length" class="mt-6 divide-y divide-line border border-line bg-white">
              <li v-for="l in data.locations" :key="l.id" class="flex items-center justify-between px-6 py-4 text-[15px]">
                <span class="text-stone-700">{{ l.name }}</span>
                <span v-if="l.distance !== null" class="text-[13px] font-medium text-stone-450">{{ l.distance }} min</span>
              </li>
            </ul>
          </section>
        </div>

        <!-- Sticky sidebar -->
        <aside>
          <div class="lg:sticky lg:top-28 space-y-6">
            <div class="border border-line bg-white p-8">
              <p class="eyebrow">Starting from</p>
              <p class="heading-serif mt-2 text-4xl">{{ formatPrice(data.project.price) }}</p>

              <div v-if="paymentRows.length" class="hairline mt-7 pt-6">
                <p class="eyebrow mb-4">Payment plan</p>
                <ul class="space-y-3">
                  <li v-for="(row, i) in paymentRows" :key="i" class="flex items-center justify-between text-sm">
                    <span class="text-stone-500">{{ row.label }}</span>
                    <span class="font-semibold">{{ row.value }}</span>
                  </li>
                </ul>
              </div>

              <div class="mt-8 space-y-3">
                <NuxtLink to="/contact-us" class="btn-primary w-full">Request information</NuxtLink>
                <NuxtLink to="/visitor" class="btn-secondary w-full">Schedule a visit</NuxtLink>
              </div>
              <p class="mt-5 text-center text-xs leading-relaxed text-stone-400">
                No commitment — our advisors reply within one business day.
              </p>
            </div>

            <div v-if="data.developer" class="border border-line bg-white p-8">
              <p class="eyebrow mb-4">Developed by</p>
              <div class="flex items-center gap-4">
                <div class="flex h-14 w-14 shrink-0 items-center justify-center border border-line bg-paper">
                  <img
                    v-if="data.developer.logo"
                    :src="mediaUrl(data.developer.logo)"
                    class="max-h-10 max-w-10 object-contain"
                  />
                  <span v-else class="font-serif text-xl">{{ data.developer.name.charAt(0) }}</span>
                </div>
                <div>
                  <p class="font-serif text-lg font-medium leading-tight">{{ data.developer.name }}</p>
                  <NuxtLink
                    :to="{ path: '/properties', query: { developerId: data.developer.id } }"
                    class="text-[11px] font-semibold uppercase tracking-widest text-stone-450 hover:text-ink"
                  >
                    View all projects
                  </NuxtLink>
                </div>
              </div>
              <p v-if="data.developer.description" class="mt-4 text-[13px] leading-relaxed text-stone-500">
                {{ data.developer.description }}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { data } = await useFetch(`/api/public/properties/${route.params.slug}`)
if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: 'Project not found', fatal: true })
}
useHead({ title: `${data.value.project.name} — SA Inmobiliaria` })

const photos = computed<string[]>(() => {
  const list = [data.value?.project.coverImage, ...(data.value?.gallery.map((g: any) => g.image) || [])]
  return list.filter(Boolean).map((k: string) => mediaUrl(k))
})

const lightbox = ref<number | null>(null)
function openLightbox(i: number) {
  lightbox.value = i
}
function step(delta: number) {
  if (lightbox.value === null) return
  const n = photos.value.length
  lightbox.value = (lightbox.value + delta + n) % n
}

const statusLabel = computed(() => {
  const s = data.value?.project.status || 'new'
  if (s === 'new') return 'New Launch'
  if (s === 'ready') return 'Ready to move in'
  return s.replace(/_/g, ' ')
})

const stats = computed(() => {
  const out: { label: string; value: string }[] = []
  const p = data.value?.project
  if (!p) return out
  if (data.value?.unitTypes.length) out.push({ label: 'Residence types', value: String(data.value.unitTypes.length) })
  if (p.handoverDate) out.push({ label: 'Handover', value: p.handoverDate })
  if (p.downPercentage) out.push({ label: 'Down payment', value: `${p.downPercentage}%` })
  if (data.value?.amenities.length) out.push({ label: 'Amenities', value: String(data.value.amenities.length) })
  return out
})

const highlights = computed<string[]>(() =>
  (data.value?.project.keyHighlights || '')
    .split('\n')
    .map((l: string) => l.replace(/^[-•\s]+/, '').trim())
    .filter(Boolean),
)

const paymentRows = computed<{ label: string; value: string }[]>(() => {
  try {
    const parsed = JSON.parse(data.value?.project.paymentPlan || '[]')
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map((s: any, i: number) => ({
        label: s.label || s.name || `Step ${i + 1}`,
        value: s.value || s.percentage || '',
      }))
    }
  } catch {
    /* fall through */
  }
  const p = data.value?.project
  const rows = []
  if (p?.downPercentage) rows.push({ label: 'Down payment', value: `${p.downPercentage}%` })
  if (p?.constructionPercentage) rows.push({ label: 'During construction', value: `${p.constructionPercentage}%` })
  if (p?.handoverPercentage) rows.push({ label: 'On handover', value: `${p.handoverPercentage}%` })
  return rows
})
</script>

<template>
  <div v-if="data">
    <!-- Cover -->
    <section class="relative h-72 bg-slate-800 md:h-96">
      <img
        :src="mediaUrl(data.project.coverImage)"
        :alt="data.project.name"
        class="h-full w-full object-cover opacity-80"
      />
      <div class="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 to-transparent">
        <div class="mx-auto w-full max-w-7xl px-4 pb-8 text-white">
          <p class="text-sm uppercase tracking-wide text-emerald-300">
            {{ (data.project.status || 'new').replace(/_/g, ' ') }}
          </p>
          <h1 class="text-3xl font-bold md:text-4xl">{{ data.project.name }}</h1>
          <p v-if="data.developer" class="mt-1 text-slate-200">by {{ data.developer.name }}</p>
          <p class="mt-2 text-xl font-semibold text-emerald-300">{{ formatPrice(data.project.price) }}</p>
        </div>
      </div>
    </section>

    <div class="mx-auto grid max-w-7xl gap-10 px-4 py-12 lg:grid-cols-3">
      <div class="space-y-10 lg:col-span-2">
        <section v-if="data.project.description">
          <h2 class="mb-3 text-2xl font-bold">About the project</h2>
          <p class="whitespace-pre-line leading-relaxed text-slate-700">{{ data.project.description }}</p>
        </section>

        <section v-if="data.project.keyHighlights">
          <h2 class="mb-3 text-2xl font-bold">Key highlights</h2>
          <p class="whitespace-pre-line leading-relaxed text-slate-700">{{ data.project.keyHighlights }}</p>
        </section>

        <section v-if="data.gallery.length">
          <h2 class="mb-3 text-2xl font-bold">Gallery</h2>
          <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
            <img
              v-for="img in data.gallery"
              :key="img.id"
              :src="mediaUrl(img.image)"
              class="h-40 w-full rounded-lg object-cover"
              loading="lazy"
            />
          </div>
        </section>

        <section v-if="data.unitTypes.length">
          <h2 class="mb-3 text-2xl font-bold">Available units</h2>
          <div class="card overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th class="px-4 py-3">Property type</th>
                  <th class="px-4 py-3">Unit type</th>
                  <th class="px-4 py-3">Size</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in data.unitTypes" :key="u.id" class="border-t border-slate-100">
                  <td class="px-4 py-3">{{ u.propertyType }}</td>
                  <td class="px-4 py-3">{{ u.unitType }}</td>
                  <td class="px-4 py-3">{{ u.size }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-if="data.floorPlans.length">
          <h2 class="mb-3 text-2xl font-bold">Floor plans</h2>
          <p v-if="data.project.floorPlanDescription" class="mb-4 text-slate-600">
            {{ data.project.floorPlanDescription }}
          </p>
          <div class="grid gap-4 md:grid-cols-2">
            <div v-for="fp in data.floorPlans" :key="fp.id" class="card p-4">
              <img v-if="fp.image" :src="mediaUrl(fp.image)" class="mb-3 h-44 w-full rounded object-cover" loading="lazy" />
              <p class="font-semibold">{{ fp.category || fp.type }}</p>
              <p class="text-sm text-slate-500">{{ fp.unitType }} · {{ fp.floorDetails }}</p>
              <p class="text-sm text-slate-500">{{ fp.sizes }}</p>
            </div>
          </div>
        </section>

        <section v-if="data.project.masterPlanImage">
          <h2 class="mb-3 text-2xl font-bold">Master plan</h2>
          <p v-if="data.project.masterPlanDescription" class="mb-4 text-slate-600">
            {{ data.project.masterPlanDescription }}
          </p>
          <img :src="mediaUrl(data.project.masterPlanImage)" class="w-full rounded-xl" loading="lazy" />
        </section>

        <section v-if="data.project.locationMap">
          <h2 class="mb-3 text-2xl font-bold">Location</h2>
          <p v-if="data.project.locationMapDescription" class="mb-4 text-slate-600">
            {{ data.project.locationMapDescription }}
          </p>
          <img :src="mediaUrl(data.project.locationMap)" class="w-full rounded-xl" loading="lazy" />
        </section>
      </div>

      <aside class="space-y-6">
        <div v-if="paymentPlan.length || data.project.handoverDate" class="card p-5">
          <h3 class="mb-3 text-lg font-bold">Payment plan</h3>
          <ul class="space-y-2 text-sm text-slate-700">
            <li v-if="data.project.downPercentage" class="flex justify-between">
              <span>Down payment</span><strong>{{ data.project.downPercentage }}%</strong>
            </li>
            <li v-if="data.project.constructionPercentage" class="flex justify-between">
              <span>During construction</span><strong>{{ data.project.constructionPercentage }}%</strong>
            </li>
            <li v-if="data.project.handoverPercentage" class="flex justify-between">
              <span>On handover</span><strong>{{ data.project.handoverPercentage }}%</strong>
            </li>
            <li v-if="data.project.handoverDate" class="flex justify-between border-t border-slate-100 pt-2">
              <span>Handover</span><strong>{{ data.project.handoverDate }}</strong>
            </li>
            <li v-for="(step, i) in paymentPlan" :key="i" class="flex justify-between">
              <span>{{ step.label || step.name || `Step ${i + 1}` }}</span>
              <strong>{{ step.value || step.percentage }}</strong>
            </li>
          </ul>
        </div>

        <div v-if="data.amenities.length" class="card p-5">
          <h3 class="mb-3 text-lg font-bold">Amenities</h3>
          <ul class="grid grid-cols-2 gap-2 text-sm text-slate-700">
            <li v-for="a in data.amenities" :key="a.id" class="flex items-center gap-2">
              <img v-if="a.logo" :src="mediaUrl(a.logo)" class="h-5 w-5 object-contain" />
              <span>{{ a.name }}</span>
            </li>
          </ul>
        </div>

        <div v-if="data.locations.length" class="card p-5">
          <h3 class="mb-3 text-lg font-bold">Nearby</h3>
          <ul class="space-y-2 text-sm text-slate-700">
            <li v-for="l in data.locations" :key="l.id" class="flex justify-between">
              <span>{{ l.name }}</span>
              <span v-if="l.distance !== null" class="text-slate-500">{{ l.distance }} min</span>
            </li>
          </ul>
        </div>

        <NuxtLink to="/contact-us" class="btn-primary w-full">Request details</NuxtLink>
      </aside>
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

const paymentPlan = computed<any[]>(() => {
  try {
    const parsed = JSON.parse(data.value?.project.paymentPlan || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
})
</script>

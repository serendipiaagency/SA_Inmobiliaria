<template>
  <div class="max-w-3xl">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Tasador automático</h1>
      <p class="mt-1 text-sm text-stone-500">Estimación de valor basada en comparables reales de tu propio catálogo — nunca una caja negra: siempre puedes ver qué propiedades se usaron para el cálculo.</p>
    </div>

    <AdminPanel title="Datos del inmueble a tasar" class="mb-6">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Zona / comunidad</span>
          <input v-model="form.community" class="cfg-input" placeholder="Ej. Marina District" >
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Tipo de propiedad</span>
          <select v-model="form.propertyType" class="cfg-input">
            <option value="">Cualquier tipo</option>
            <option value="Apartment">Apartment</option>
            <option value="Villa">Villa</option>
            <option value="Townhouse">Townhouse</option>
            <option value="Penthouse">Penthouse</option>
            <option value="Studio">Studio</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Superficie (m²)</span>
          <input v-model.number="form.area" type="number" min="1" class="cfg-input" >
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Habitaciones (opcional)</span>
          <input v-model.number="form.bedrooms" type="number" min="0" class="cfg-input" >
        </label>
      </div>
      <div class="mt-4 flex items-center gap-3">
        <button type="button" class="dash-btn-primary" :disabled="loading" @click="estimate">{{ loading ? 'Calculando…' : 'Estimar valor' }}</button>
        <span v-if="error" class="text-sm font-medium text-red-600">{{ error }}</span>
      </div>
    </AdminPanel>

    <AdminPanel v-if="result" title="Resultado">
      <div v-if="!result.comparables.length" class="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        No hay comparables suficientes en tu catálogo para esta combinación de zona/tipo/superficie. No se ha inventado una cifra — añade más propiedades a tu catálogo o amplía los criterios de búsqueda.
      </div>
      <template v-else>
        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <p class="text-xs uppercase tracking-wide text-stone-400">Mínimo</p>
            <p class="mt-1 text-lg font-semibold">{{ dt.money(result.estimatedLow) }}</p>
          </div>
          <div class="rounded-lg bg-stone-50 py-2">
            <p class="text-xs uppercase tracking-wide text-stone-400">Estimación</p>
            <p class="mt-1 text-xl font-bold">{{ dt.money(result.estimatedAvg) }}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-stone-400">Máximo</p>
            <p class="mt-1 text-lg font-semibold">{{ dt.money(result.estimatedHigh) }}</p>
          </div>
        </div>
        <p class="mt-3 text-center text-xs text-stone-500">{{ dt.money(result.pricePerSqmAvg) }}/m² de media sobre {{ result.comparables.length }} comparables reales</p>

        <div class="mt-5 border-t border-line pt-4">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Comparables usados</p>
          <ul class="divide-y divide-line text-sm">
            <li v-for="c in result.comparables" :key="c.id" class="flex items-center justify-between py-2">
              <span>{{ c.name }} — {{ c.area }} m²</span>
              <span class="tabular-nums text-stone-600">{{ dt.money(c.price) }} ({{ dt.money(c.pricePerSqm) }}/m²)</span>
            </li>
          </ul>
        </div>
      </template>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Tasador automático — M&M Real Estate' })
const dt = useDash()

const form = reactive({ community: '', propertyType: '', area: 100, bedrooms: null as number | null })
const loading = ref(false)
const error = ref('')
const result = ref<any>(null)

async function estimate() {
  error.value = ''
  loading.value = true
  try {
    result.value = await $fetch('/api/admin/saas/valuations', { method: 'POST', body: form })
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Error al calcular la estimación'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50;
}
</style>
